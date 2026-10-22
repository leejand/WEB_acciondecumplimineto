// Pruebas unitarias de src/db.js (nombres, contraseñas, esquema y administrador inicial).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, TMP } from '../helpers.mjs';

const dir = path.join(TMP, `db-${process.pid}-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
process.env.DB_PATH = path.join(dir, 'app.db');
process.env.ADMIN_USER = 'Profesora';
process.env.ADMIN_PASSWORD = 'clave-admin-unit';

const require = createRequire(import.meta.url);
const origLog = console.log;
console.log = () => {}; // silencia el aviso de creación del admin
const dbModule = require(path.join(ROOT, 'src', 'db.js'));
const { db, cleanName, nameKey, hashPassword, checkPassword, hashPasswordAsync, checkPasswordAsync } = dbModule;
console.log = origLog;

after(() => {
  try { db.close(); } catch { /* ya cerrada */ }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('nameKey ignora tildes, mayúsculas y espacios repetidos', () => {
  assert.equal(nameKey('  José   Pérez '), 'jose perez');
  assert.equal(nameKey('MARÍA FERNANDA LÓPEZ'), 'maria fernanda lopez');
  assert.equal(nameKey('Ñandú Güemes'), 'nandu guemes');
  assert.equal(nameKey('Ana\tMaría\nRuiz'), 'ana maria ruiz');
});

test('nameKey ignora caracteres invisibles, de control y variantes de ancho', () => {
  assert.equal(nameKey('Ana Gómez\u200B'), 'ana gomez');
  assert.equal(nameKey('\u202EAna Gómez'), 'ana gomez');
  assert.equal(nameKey('Ana \u200DGómez'), 'ana gomez');
  assert.equal(nameKey('\uFF21\uFF4E\uFF41 Gómez'), 'ana gomez'); // letras de ancho completo
  assert.equal(nameKey('Ana\u00A0Gómez'), 'ana gomez'); // espacio duro
  assert.equal(nameKey('José Pérez'), 'jose perez'); // tildes combinadas
});

test('cleanName conserva tildes y mayúsculas pero quita invisibles y colapsa espacios', () => {
  assert.equal(cleanName('  Lucía\u200B   Pérez\t'), 'Lucía Pérez');
  assert.equal(cleanName('\u202EAna'), 'Ana');
  assert.equal(cleanName('Ana\nRuiz'), 'Ana Ruiz');
});

test('nameKey acepta valores no string sin lanzar', () => {
  assert.equal(nameKey(undefined), 'undefined');
  assert.equal(nameKey(123), '123');
});

test('hashPassword genera sal aleatoria y hash de 64 bytes', () => {
  const a = hashPassword('secreto');
  const b = hashPassword('secreto');
  assert.match(a.hash, /^[0-9a-f]{128}$/);
  assert.match(a.salt, /^[0-9a-f]{32}$/);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('hashPassword es determinista con la misma sal', () => {
  const { hash, salt } = hashPassword('secreto');
  assert.equal(hashPassword('secreto', salt).hash, hash);
});

test('checkPassword valida la correcta y rechaza las incorrectas', () => {
  const { hash, salt } = hashPassword('Clave-Ñ-2026');
  const user = { password_hash: hash, salt };
  assert.equal(checkPassword('Clave-Ñ-2026', user), true);
  assert.equal(checkPassword('clave-ñ-2026', user), false);
  assert.equal(checkPassword('', user), false);
  assert.equal(checkPassword(undefined, user), false);
});

test('las versiones asíncronas son compatibles con las síncronas', { skip: !hashPasswordAsync && 'db.js no exporta hashPasswordAsync' }, async () => {
  const { hash, salt } = await hashPasswordAsync('Asíncrona-1');
  assert.match(hash, /^[0-9a-f]{128}$/);
  assert.equal(hashPassword('Asíncrona-1', salt).hash, hash, 'el hash asíncrono difiere del síncrono');
  const legacy = hashPassword('Clave-vieja');
  assert.equal(await checkPasswordAsync('Clave-vieja', { password_hash: legacy.hash, salt: legacy.salt }), true);
  assert.equal(await checkPasswordAsync('otra', { password_hash: legacy.hash, salt: legacy.salt }), false);
  assert.equal(checkPassword('Asíncrona-1', { password_hash: hash, salt }), true);
});

test('el hash asíncrono no bloquea el event loop', { skip: !hashPasswordAsync && 'db.js no exporta hashPasswordAsync' }, async () => {
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 5);
  await Promise.all(Array.from({ length: 8 }, (_, i) => hashPasswordAsync('clave' + i)));
  clearInterval(timer);
  assert.ok(ticks > 0, 'el event loop no avanzó mientras se calculaban los hashes');
});

test('el esquema crea todas las tablas', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const t of ['users', 'sessions', 'logins', 'attempts', 'settings']) assert.ok(tables.includes(t), `falta la tabla ${t}`);
});

test('se crea un único administrador con ADMIN_USER / ADMIN_PASSWORD', () => {
  const admins = db.prepare("SELECT * FROM users WHERE role = 'admin'").all();
  assert.equal(admins.length, 1);
  assert.equal(admins[0].name, 'Profesora');
  assert.equal(admins[0].name_key, 'profesora');
  assert.equal(checkPassword('clave-admin-unit', admins[0]), true);
});

test('name_key es único en la base', () => {
  const { hash, salt } = hashPassword('x');
  db.prepare('INSERT INTO users (name, name_key, password_hash, salt) VALUES (?, ?, ?, ?)').run('Luis Gómez', nameKey('Luis Gómez'), hash, salt);
  assert.throws(() => db.prepare('INSERT INTO users (name, name_key, password_hash, salt) VALUES (?, ?, ?, ?)').run('LUIS GOMEZ', nameKey('LUIS GOMEZ'), hash, salt), /UNIQUE/);
});

test('las restricciones CHECK rechazan roles y estados inválidos', () => {
  const { hash, salt } = hashPassword('x');
  assert.throws(() => db.prepare("INSERT INTO users (name, name_key, password_hash, salt, role) VALUES ('X', 'x-rol', ?, ?, 'root')").run(hash, salt), /CHECK/);
  const uid = db.prepare("SELECT id FROM users WHERE role = 'student' LIMIT 1").get().id;
  assert.throws(() => db.prepare("INSERT INTO attempts (user_id, segment_index, despacho, num_questions, question_ids, status) VALUES (?, 0, 'Juzgado', 6, '[]', 'otro')").run(uid), /CHECK/);
});

test('borrar un usuario borra en cascada sus sesiones e intentos', () => {
  const uid = db.prepare("SELECT id FROM users WHERE name_key = 'luis gomez'").get().id;
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES ('tok-x', ?, '2999-01-01')").run(uid);
  db.prepare("INSERT INTO attempts (user_id, segment_index, despacho, num_questions, question_ids) VALUES (?, 0, 'Juzgado', 6, '[]')").run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ?').get(uid).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM attempts WHERE user_id = ?').get(uid).n, 0);
});
