// Pruebas de integración de la API: server.js real, en un proceso hijo con base de datos temporal.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { startServer, Client, ADMIN, ROOT, uniqueName } from '../helpers.mjs';

const require = createRequire(import.meta.url);
const QUESTIONS = require(path.join(ROOT, 'src', 'questions.js'));
const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
const wrong = (id) => (byId.get(id).answer + 1) % byId.get(id).options.length;
const expectedScore = (correct, n, bonus) => Math.min(5, Math.round(((correct / n) * 5 + bonus) * 10) / 10);

let srv;
const client = () => new Client(srv.base);
async function student(prefix) {
  const c = client();
  const name = uniqueName(prefix);
  const r = await c.register(name);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return Object.assign(c, { name });
}
async function admin() {
  const c = client();
  const r = await c.login(ADMIN.name, ADMIN.password);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return c;
}

/**
 * POST cuyo cuerpo llega `delay` ms después de las cabeceras (red lenta del aula).
 * Permite reproducir de forma determinista carreras entre peticiones simultáneas.
 */
function slowPost(c, pathname, body, delay) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port: srv.port, path: pathname, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': data.length, cookie: `sid=${c.sid}` } }, (res) => {
      let text = ''; res.setEncoding('utf8');
      res.on('data', (d) => { text += d; }); res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* no JSON */ } resolve({ status: res.statusCode, data: json }); });
    });
    req.on('error', reject);
    req.flushHeaders();
    setTimeout(() => req.end(data), delay);
  });
}

/** Petición HTTP cruda (sin normalizar la ruta como hace fetch). */
function rawGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: srv.port, path: pathname, method: 'GET' }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (d) => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject); req.end();
  });
}

before(async () => { srv = await startServer({ port: 3923, name: 'api', env: { EXPOSE_TEST_INFO: '1' } }); });
after(async () => { await srv?.stop(); });

// ---------------------------------------------------------------------------
describe('autenticación', () => {
  test('registro crea la sesión con cookie HttpOnly', async () => {
    const c = client();
    const name = uniqueName('Registro');
    const res = await c.post('/api/auth/register', { name, password: 'clave1234' }, { raw: true });
    assert.equal(res.status, 201);
    const cookie = res.headers.getSetCookie().find((x) => x.startsWith('sid='));
    assert.ok(cookie, 'no llegó la cookie sid');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//);
    const body = await res.json();
    assert.deepEqual(Object.keys(body.user).sort(), ['id', 'name', 'role']);
    assert.equal(body.user.role, 'student');
    const me = await c.get('/api/auth/me');
    assert.equal(me.data.user.name, name);
  });

  test('normaliza espacios del nombre al registrar', async () => {
    const c = client();
    const r = await c.register('  Carla    Ruiz   ' + Date.now());
    assert.equal(r.status, 201);
    assert.match(r.data.user.name, /^Carla Ruiz \d+$/);
  });

  test('el nombre no distingue tildes ni mayúsculas (name_key)', async () => {
    const suf = Date.now();
    const a = client();
    assert.equal((await a.register(`María José Ñúñez ${suf}`)).status, 201);
    const dup = await client().register(`MARIA  JOSE nunez ${suf}`);
    assert.equal(dup.status, 409);
    assert.match(dup.data.error, /Ya existe/);
    const b = client();
    const login = await b.login(`maria jose ÑUÑEZ ${suf}`);
    assert.equal(login.status, 200);
    assert.equal(login.data.user.name, `María José Ñúñez ${suf}`);
  });

  test('nombres con caracteres invisibles no duplican a un usuario existente', async () => {
    const base = uniqueName('Invisible');
    assert.equal((await client().register(base)).status, 201);
    for (const v of [base + '\u200b', '\u202e' + base, base.replace(' ', ' \u200d'), base.toUpperCase(), base.replace(/ /g, '\u00a0')]) {
      const r = await client().register(v);
      assert.equal(r.status, 409, JSON.stringify(v));
    }
    // Y se puede ingresar escribiendo el nombre con esos caracteres de más.
    assert.equal((await client().login(base + '\u200b')).status, 200);
  });

  test('el nombre guardado queda limpio (sin invisibles ni anchos especiales)', async () => {
    const r = await client().register('Ｌｕｃíａ\u200b  Pérez ' + Date.now().toString(36).replace(/\d/g, 'q'));
    assert.equal(r.status, 201);
    assert.match(r.data.user.name, /^Lucía Pérez [a-zq]+$/);
  });

  test('validaciones de registro', async () => {
    assert.equal((await client().register('Al')).status, 400);
    assert.equal((await client().register('x'.repeat(81))).status, 400);
    assert.equal((await client().register('     ')).status, 400);
    assert.equal((await client().register(uniqueName('Corta'), '123')).status, 400);
    assert.equal((await client().post('/api/auth/register', {})).status, 400);
  });

  test('registro simultáneo con el mismo nombre: uno 201 y el resto 409', async () => {
    const name = uniqueName('Simultáneo');
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => client().register(i % 2 ? name.toUpperCase() : name)));
    const codes = results.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 201).length, 1, `códigos: ${codes}`);
    assert.equal(codes.filter((c) => c === 409).length, 7, `códigos: ${codes}`);
  });

  test('login con contraseña incorrecta o usuario inexistente → 401', async () => {
    const s = await student('Login');
    assert.equal((await client().login(s.name, 'otra-clave')).status, 401);
    assert.equal((await client().login('No Existe ' + Date.now())).status, 401);
    assert.equal((await client().post('/api/auth/login', {})).status, 401);
  });

  test('login registra el ingreso y devuelve el usuario público', async () => {
    const s = await student('Ingreso');
    const c = client();
    const r = await c.login(s.name);
    assert.equal(r.status, 200);
    assert.equal(r.data.user.password_hash, undefined);
    assert.equal(r.data.user.salt, undefined);
    assert.equal(r.data.user.role, 'student');
  });

  test('logout invalida la sesión en el servidor', async () => {
    const s = await student('Logout');
    const sid = s.sid;
    const out = await s.post('/api/auth/logout');
    assert.equal(out.status, 200);
    assert.equal(s.sid, null, 'la cookie no se borró');
    // Reutilizar el token antiguo ya no sirve.
    const replay = client(); replay.sid = sid;
    assert.equal((await replay.get('/api/auth/me')).data.user, null);
    assert.equal((await replay.get('/api/eval/status')).status, 401);
  });

  test('sin sesión o con cookie falsa → 401 en rutas protegidas', async () => {
    for (const url of ['/api/eval/status', '/api/eval/config', '/api/eval/spin', '/api/admin/overview']) {
      assert.equal((await client().get(url)).status, 401, url);
    }
    const fake = client(); fake.sid = 'a'.repeat(64);
    assert.equal((await fake.get('/api/eval/status')).status, 401);
    assert.equal((await fake.get('/api/auth/me')).data.user, null);
  });

  test('una sesión vencida deja de ser válida', async () => {
    const s = await student('Vencida');
    const db = new DatabaseSync(srv.dbPath);
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(new Date(Date.now() - 1000).toISOString(), s.sid);
    db.close();
    assert.equal((await s.get('/api/auth/me')).data.user, null);
    assert.equal((await s.get('/api/eval/status')).status, 401);
  });

  test('un estudiante no puede acceder al panel admin → 403', async () => {
    const s = await student('NoAdmin');
    assert.equal((await s.get('/api/admin/overview')).status, 403);
    assert.equal((await s.get('/api/admin/export.csv')).status, 403);
    assert.equal((await s.del('/api/admin/attempts/1')).status, 403);
  });

  test('ruta de API desconocida → 404 JSON', async () => {
    const s = await student('404');
    const r = await s.get('/api/no-existe');
    assert.equal(r.status, 404);
    assert.ok(r.data.error);
  });
});

// ---------------------------------------------------------------------------
describe('evaluación', () => {
  test('config expone segmentos y escala sin respuestas', async () => {
    const s = await student('Config');
    const { data } = await s.get('/api/eval/config');
    assert.equal(data.maxScore, 5);
    assert.equal(data.passScore, 3);
    assert.ok(data.segments.length >= 2);
    for (const seg of data.segments) {
      assert.ok(Number.isInteger(seg.questions) && seg.questions > 0);
      assert.ok(seg.questions <= QUESTIONS.length, 'un segmento pide más preguntas que el banco');
    }
    assert.ok(data.segments.some((x) => x.bonus > 0), 'no hay despacho con bonus');
    assert.ok(data.segments.every((x) => x.title && x.label), 'despacho sin nombre');
  });

  test('el banco de preguntas es válido', () => {
    const ids = new Set();
    for (const q of QUESTIONS) {
      assert.ok(!ids.has(q.id), `id repetido ${q.id}`); ids.add(q.id);
      const n = { opcion: 4, vf: 2, caso: 3 }[q.type];
      assert.ok(n, `tipo inválido en ${q.id}`);
      assert.equal(q.options.length, n, `pregunta ${q.id} con ${q.options.length} opciones`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < n, `respuesta inválida en ${q.id}`);
      assert.ok(q.q && q.explain && q.topic, `pregunta ${q.id} incompleta`);
      assert.equal(new Set(q.options).size, n, `opciones repetidas en ${q.id}`);
    }
  });

  test('status es null antes de girar', async () => {
    const s = await student('Status');
    assert.deepEqual((await s.get('/api/eval/status')).data, { attempt: null });
  });

  test('giro: preguntas únicas y SIN respuestas ni explicaciones', async () => {
    const s = await student('Giro');
    const r = await s.post('/api/eval/spin');
    assert.equal(r.status, 201);
    const a = r.data.attempt;
    assert.equal(a.status, 'in_progress');
    assert.equal(a.questions.length, a.numQuestions);
    assert.equal(new Set(a.questions.map((q) => q.id)).size, a.numQuestions);
    const cfg = (await s.get('/api/eval/config')).data;
    assert.equal(cfg.segments[a.segmentIndex].questions, a.numQuestions);
    assert.equal(cfg.segments[a.segmentIndex].bonus, a.bonus);
    assert.equal(cfg.segments[a.segmentIndex].title, a.despachoTitle);
    assert.ok(a.questions.some((q) => q.type === 'caso'), 'el reparto no incluyó ningún caso práctico');
    assert.ok(a.questions.every((q) => q.type && q.options.length >= 2));
    const leak = JSON.stringify(r.data);
    assert.ok(!/"answer"|"explain"|"chosen"/.test(leak), 'el giro filtra respuestas');
    const st = JSON.stringify((await s.get('/api/eval/status')).data);
    assert.ok(!/"answer"|"explain"/.test(st), 'status filtra respuestas antes de enviar');
  });

  test('un solo giro por estudiante (idempotente)', async () => {
    const s = await student('UnGiro');
    const first = (await s.post('/api/eval/spin')).data.attempt;
    const again = await s.post('/api/eval/spin');
    assert.equal(again.status, 200);
    assert.equal(again.data.alreadySpun, true);
    assert.equal(again.data.attempt.id, first.id);
    assert.deepEqual(again.data.attempt.questions.map((q) => q.id), first.questions.map((q) => q.id));
  });

  test('giros concurrentes del mismo estudiante crean un solo intento', async () => {
    const s = await student('GiroConc');
    const results = await Promise.all(Array.from({ length: 10 }, () => s.post('/api/eval/spin')));
    const ids = new Set(results.map((r) => r.data.attempt.id));
    assert.equal(ids.size, 1);
    assert.equal(results.filter((r) => r.status === 201).length, 1);
  });

  test('todas correctas → nota máxima (5,0) y el bonus no la supera', async () => {
    const s = await student('Perfecto');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    const answers = Object.fromEntries(a.questions.map((q) => [q.id, byId.get(q.id).answer]));
    const r = await s.post('/api/eval/submit', { answers });
    assert.equal(r.status, 200);
    assert.equal(r.data.attempt.correct, a.numQuestions);
    assert.equal(r.data.attempt.score, 5);
    assert.equal(r.data.attempt.passed, true);
    assert.equal(r.data.attempt.status, 'done');
  });

  test('todas incorrectas → nota = bonus', async () => {
    const s = await student('Cero');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    const answers = Object.fromEntries(a.questions.map((q) => [q.id, wrong(q.id)]));
    const r = await s.post('/api/eval/submit', { answers });
    assert.equal(r.data.attempt.correct, 0);
    assert.equal(r.data.attempt.score, a.bonus);
    assert.equal(r.data.attempt.passed, false);
  });

  test('nota parcial con redondeo a una décima', async () => {
    const s = await student('Parcial');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    const half = Math.floor(a.numQuestions / 2) + 1;
    const answers = Object.fromEntries(a.questions.map((q, i) => [q.id, i < half ? byId.get(q.id).answer : wrong(q.id)]));
    const r = await s.post('/api/eval/submit', { answers });
    assert.equal(r.data.attempt.correct, half);
    assert.equal(r.data.attempt.score, expectedScore(half, a.numQuestions, a.bonus));
    assert.equal(r.data.attempt.passed, r.data.attempt.score >= 3);
  });

  test('tras enviar: nota y lo elegido, pero sin soluciones mientras no estén publicadas', async () => {
    const s = await student('Revision');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    const q0 = a.questions[0];
    const sub = (await s.post('/api/eval/submit', { answers: { [q0.id]: 1 } })).data.attempt;
    for (const att of [sub, (await s.get('/api/eval/status')).data.attempt, (await s.post('/api/eval/spin')).data.attempt]) {
      assert.equal(att.status, 'done');
      assert.equal(att.solutionsPublished, false);
      assert.ok(Number.isFinite(att.score) && Number.isInteger(att.correct) && typeof att.passed === 'boolean');
      assert.ok(!/"answer"|"explain"/.test(JSON.stringify(att)), 'se filtran soluciones sin publicar');
      assert.equal(att.questions[0].chosen, 1);
      assert.equal(att.questions[1].chosen, null);
    }
  });

  test('cuando el admin publica las soluciones, el resultado trae respuesta y explicación', async () => {
    const s = await student('Publicadas');
    await s.post('/api/eval/spin');
    await s.post('/api/eval/submit', { answers: {} });
    const adm = await admin();
    try {
      const pub = await adm.post('/api/admin/solutions', { published: true });
      assert.equal(pub.status, 200);
      assert.deepEqual(pub.data, { solutionsPublished: true });
      assert.equal((await adm.get('/api/admin/overview')).data.solutionsPublished, true);
      const st = (await s.get('/api/eval/status')).data.attempt;
      assert.equal(st.solutionsPublished, true);
      for (const q of st.questions) { assert.equal(q.answer, byId.get(q.id).answer); assert.ok(q.explain); }
      // Un intento en curso nunca trae soluciones, aunque estén publicadas.
      const otro = await student('EnCurso');
      const enCurso = (await otro.post('/api/eval/spin')).data.attempt;
      assert.ok(!/"answer"|"explain"|"chosen"|"solutionsPublished"/.test(JSON.stringify(enCurso)));
    } finally {
      assert.equal((await adm.post('/api/admin/solutions', { published: false })).data.solutionsPublished, false);
    }
    assert.ok(!/"answer"|"explain"/.test(JSON.stringify((await s.get('/api/eval/status')).data)), 'despublicar no oculta de nuevo');
  });

  test('publicar soluciones: solo admin y con un booleano', async () => {
    const s = await student('NoPublica');
    assert.equal((await s.post('/api/admin/solutions', { published: true })).status, 403);
    const adm = await admin();
    for (const published of ['true', 1, null, undefined]) {
      assert.equal((await adm.post('/api/admin/solutions', { published })).status, 400, String(published));
    }
    assert.equal((await adm.get('/api/admin/overview')).data.solutionsPublished, false);
  });

  test('respuestas inválidas se ignoran (cuentan como no respondidas)', async () => {
    const s = await student('Invalidas');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    const bad = ['0', 4, -1, 1.5, null, true, { x: 1 }, [1]];
    const answers = Object.fromEntries(a.questions.map((q, i) => [q.id, bad[i % bad.length]]));
    // Fuera de rango según el tipo: una de verdadero o falso solo admite 0 y 1.
    const vf = a.questions.find((q) => q.type === 'vf');
    if (vf) answers[vf.id] = 2;
    answers[999999] = 0; // pregunta que no pertenece al intento
    const r = await s.post('/api/eval/submit', { answers });
    assert.equal(r.status, 200);
    assert.equal(r.data.attempt.correct, 0);
    assert.equal(r.data.attempt.score, a.bonus);
    assert.ok(r.data.attempt.questions.every((q) => q.chosen === null));
  });

  test('answers con forma inválida no tumba el servidor', async () => {
    for (const answers of [null, 'texto', 42, [1, 2, 3]]) {
      const s = await student('Forma');
      await s.post('/api/eval/spin');
      const r = await s.post('/api/eval/submit', { answers });
      assert.ok(r.status < 500, `answers=${JSON.stringify(answers)} → ${r.status}`);
    }
    assert.ok(srv.alive);
  });

  test('enviar sin girar → 400', async () => {
    const s = await student('SinGiro');
    assert.equal((await s.post('/api/eval/submit', { answers: {} })).status, 400);
  });

  test('doble envío secuencial → el segundo es 400 y la nota no cambia', async () => {
    const s = await student('Doble');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    const all = Object.fromEntries(a.questions.map((q) => [q.id, byId.get(q.id).answer]));
    const first = await s.post('/api/eval/submit', { answers: {} });
    const second = await s.post('/api/eval/submit', { answers: all });
    assert.equal(first.status, 200);
    assert.equal(second.status, 400);
    assert.equal((await s.get('/api/eval/status')).data.attempt.score, first.data.attempt.score);
  });

  test('envíos concurrentes (doble clic) califican una sola vez', async () => {
    const s = await student('DobleClic');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    const right = Object.fromEntries(a.questions.map((q) => [q.id, byId.get(q.id).answer]));
    // Las cabeceras de los tres envíos llegan antes que cualquier cuerpo, como en un doble clic con red lenta.
    const results = await Promise.all([slowPost(s, '/api/eval/submit', { answers: {} }, 150), slowPost(s, '/api/eval/submit', { answers: right }, 250), slowPost(s, '/api/eval/submit', { answers: {} }, 350)]);
    const ok = results.filter((r) => r.status === 200);
    assert.equal(ok.length, 1, `se aceptaron ${ok.length} envíos: ${results.map((r) => r.status)}`);
    const final = (await s.get('/api/eval/status')).data.attempt;
    assert.equal(final.score, ok[0].data.attempt.score, 'la nota guardada no coincide con la mostrada al estudiante');
  });

  test('tras terminar no se puede volver a girar', async () => {
    const s = await student('Terminado');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    await s.post('/api/eval/submit', { answers: {} });
    const again = await s.post('/api/eval/spin');
    assert.equal(again.data.alreadySpun, true);
    assert.equal(again.data.attempt.id, a.id);
    assert.equal(again.data.attempt.status, 'done');
  });
});

// ---------------------------------------------------------------------------
describe('administración', () => {
  test('overview lista estudiantes con su intento e ingresos', async () => {
    const s = await student('Panel');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    await s.post('/api/eval/submit', { answers: {} });
    await client().login(s.name);
    const adm = await admin();
    const { status, data } = await adm.get('/api/admin/overview');
    assert.equal(status, 200);
    assert.equal(data.passScore, 3);
    const row = data.students.find((x) => x.name === s.name);
    assert.ok(row, 'el estudiante no aparece');
    assert.equal(row.attempt_id, a.id);
    assert.equal(row.status, 'done');
    assert.ok(row.despacho);
    assert.equal(row.logins, 2);
    assert.ok(!data.students.some((x) => x.name === ADMIN.name), 'el admin aparece como estudiante');
    assert.ok(data.activity.some((x) => x.name === s.name && x.kind === 'register'));
    assert.ok(data.activity.length <= 40);
  });

  test('overview trae aciertos por pregunta, de menor a mayor', async () => {
    const s = await student('Estadística');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    const right = Object.fromEntries(a.questions.map((q) => [q.id, byId.get(q.id).answer]));
    await s.post('/api/eval/submit', { answers: right });
    const { data } = await (await admin()).get('/api/admin/overview');
    assert.ok(Array.isArray(data.questions) && data.questions.length > 0);
    for (const q of a.questions) assert.ok(data.questions.some((x) => x.id === q.id), `falta la pregunta ${q.id}`);
    const rates = data.questions.map((x) => x.correct / x.asked);
    assert.deepEqual(rates, [...rates].sort((x, y) => x - y));
    assert.ok(!/"answer"|"explain"/.test(JSON.stringify(data.questions)), 'las estadísticas filtran respuestas');
  });

  test('reiniciar un intento permite volver a girar', async () => {
    const s = await student('Reinicio');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    await s.post('/api/eval/submit', { answers: {} });
    const adm = await admin();
    assert.equal((await adm.del(`/api/admin/attempts/${a.id}`)).status, 200);
    assert.equal((await s.get('/api/eval/status')).data.attempt, null);
    const again = await s.post('/api/eval/spin');
    assert.equal(again.status, 201);
    assert.notEqual(again.data.attempt.id, a.id);
    const row = (await adm.get('/api/admin/overview')).data.students.find((x) => x.name === s.name);
    assert.equal(row.status, 'in_progress');
  });

  test('reiniciar un intento inexistente no falla', async () => {
    const adm = await admin();
    assert.ok((await adm.del('/api/admin/attempts/99999999')).status < 500);
    assert.equal((await adm.del('/api/admin/attempts/abc')).status, 404);
  });

  test('CSV: BOM, separador ; y una fila por estudiante', async () => {
    const s = await student("Csv O'Neil-Ruiz punto");
    const a = (await s.post('/api/eval/spin')).data.attempt;
    await s.post('/api/eval/submit', { answers: {} });
    const adm = await admin();
    const res = await adm.get('/api/admin/export.csv', { raw: true });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename=".+\.csv"/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'falta el BOM UTF-8 (Excel mostraría mal las tildes)');
    const text = buf.toString('utf8').slice(1);
    const lines = text.split('\r\n');
    assert.match(lines[0], /^"Nombre";/);
    assert.equal(lines[0].split(';').length, 11);
    const line = lines.find((l) => l.includes("Csv O'Neil-Ruiz punto"));
    assert.ok(line, 'falta la fila del estudiante');
    assert.ok(line.includes(`"${a.despachoTitle}"`));
    // Coma decimal (Excel en español): bonus y nota nunca con punto.
    const cells = line.split(';');
    for (const i of [7, 8]) assert.match(cells[i], /^"\d+(,\d+)?"$/, `columna ${i}: ${cells[i]}`);
  });

  test('CSV usa coma decimal en notas con décimas', async () => {
    const s = await student('Decimal');
    const a = (await s.post('/api/eval/spin')).data.attempt;
    // Una correcta de 5 a 10 preguntas da casi siempre una nota con décimas (p. ej. 0,8 o 0,6).
    const answers = { [a.questions[0].id]: byId.get(a.questions[0].id).answer };
    const score = (await s.post('/api/eval/submit', { answers })).data.attempt.score;
    const text = (await (await admin()).get('/api/admin/export.csv')).data;
    const cells = text.split('\r\n').find((l) => l.includes(s.name)).split(';');
    assert.equal(cells[8], `"${String(score).replace('.', ',')}"`);
    assert.ok(!cells[8].includes('.'));
  });

  test('nombres con signos de fórmula o comillas se rechazan al registrarse', async () => {
    for (const name of [`=HYPERLINK("http://x";"clic") ${Date.now()}`, 'Csv "Comillas"; punto', '@Ana Ruiz', '<b>Ana</b> Ruiz']) {
      const r = await client().register(name);
      assert.equal(r.status, 400, name);
      assert.equal(r.data.error, "Usa solo letras, números, espacios y los signos . ' -");
    }
  });

  test('CSV neutraliza un nombre válido que empieza por "-" (inyección CSV en Excel)', async () => {
    const name = `-Ana O'Neil ${Date.now().toString(36).replace(/\d/g, 'x')}`;
    assert.equal((await client().register(name)).status, 201);
    const text = (await (await admin()).get('/api/admin/export.csv')).data;
    const cell = text.split('\r\n').map((l) => l.split(';')[0]).find((c) => c.includes("Ana O'Neil"));
    assert.ok(cell);
    assert.ok(cell.startsWith(`"'-`), `la celda no está neutralizada: ${cell}`);
  });
});

// ---------------------------------------------------------------------------
describe('archivos estáticos y robustez', () => {
  test('sirve la página y los recursos con su tipo', async () => {
    const home = await fetch(srv.base + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /<main id="view"/);
    for (const [url, type] of [['/css/styles.css', /text\/css/], ['/js/app.js', /javascript/], ['/js/content.js', /javascript/]]) {
      const r = await fetch(srv.base + url);
      assert.equal(r.status, 200, url);
      assert.match(r.headers.get('content-type'), type, url);
    }
  });

  test('estáticos con ETag: la revalidación devuelve 304 sin cuerpo', async () => {
    const first = await fetch(srv.base + '/js/app.js');
    const etag = first.headers.get('etag');
    assert.ok(etag, 'falta ETag');
    assert.equal(first.headers.get('cache-control'), 'no-cache');
    const again = await fetch(srv.base + '/js/app.js', { headers: { 'if-none-match': etag } });
    assert.equal(again.status, 304);
    assert.equal((await again.text()).length, 0);
    const stale = await fetch(srv.base + '/js/app.js', { headers: { 'if-none-match': '"otro"' } });
    assert.equal(stale.status, 200);
  });

  test('estáticos de texto se comprimen con gzip si el navegador lo acepta', async () => {
    const zlib = await import('node:zlib');
    const r = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: srv.port, path: '/css/styles.css', headers: { 'accept-encoding': 'gzip' } }, (res) => {
        const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
    assert.equal(r.res.headers['content-encoding'], 'gzip');
    assert.match(r.res.headers.vary, /Accept-Encoding/);
    const plain = await (await fetch(srv.base + '/css/styles.css', { headers: { 'accept-encoding': 'identity' } })).text();
    assert.equal(zlib.gunzipSync(r.body).toString('utf8'), plain);
    assert.ok(r.body.length < Buffer.byteLength(plain) / 2, 'la compresión no reduce el tamaño');
  });

  test('HEAD de un estático no envía cuerpo', async () => {
    const r = await rawGet('/js/content.js');
    assert.equal(r.status, 200);
    const head = await fetch(srv.base + '/js/content.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.text()).length, 0);
  });

  test('rutas sin extensión devuelven index.html (SPA)', async () => {
    const r = await fetch(srv.base + '/admin/cualquier/cosa');
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<main id="view"/);
  });

  test('archivo inexistente → 404', async () => {
    assert.equal((await fetch(srv.base + '/no-existe.png')).status, 404);
  });

  test('no permite salir de public/ (path traversal)', async () => {
    for (const p of ['/..%2fserver.js', '/%2e%2e/server.js', '/..%5cserver.js', '/css/..%2f..%2fsrc%2fquestions.js', '/..%2fdata%2fapp.db', '/%2e%2e%2f%2e%2e%2fpackage.json']) {
      const r = await rawGet(p);
      assert.ok([400, 403, 404].includes(r.status), `${p} → ${r.status}`);
      assert.ok(!/QUESTIONS|require\(|"answer"|SQLite format/.test(r.body), `${p} filtró contenido`);
    }
  });

  test('URL mal codificada o con byte nulo → 4xx, no 500', async () => {
    for (const p of ['/%E0%A4%A.js', '/%E0%A4%A', '/css/%00styles.css']) {
      const r = await rawGet(p);
      assert.ok(r.status >= 400 && r.status < 500, `${p} → ${r.status}`);
    }
  });

  test('cabecera Host malformada no tumba el proceso', async () => {
    for (const host of ['[::', 'a b', '%', '']) {
      await new Promise((resolve) => {
        const sock = net.connect(srv.port, '127.0.0.1', () => sock.end(`GET /api/auth/me HTTP/1.1
Host: ${host}
Connection: close

`));
        sock.on('data', () => {}); sock.on('error', resolve); sock.on('close', resolve);
      });
    }
    assert.equal((await client().get('/api/auth/me')).status, 200);
    assert.ok(srv.alive, 'el proceso murió');
  });

  test('cuerpo JSON null o no-objeto no provoca 500', async () => {
    for (const body of ['null', '"texto"', '123', '[]']) {
      assert.ok((await client().req('POST', '/api/auth/login', body)).status < 500, `login ${body}`);
      assert.ok((await client().req('POST', '/api/auth/register', body)).status < 500, `register ${body}`);
    }
  });

  test('JSON inválido en el cuerpo no tumba el servidor', async () => {
    const c = client();
    const reg = await c.req('POST', '/api/auth/register', '{"name": "roto",');
    assert.equal(reg.status, 400);
    const login = await c.req('POST', '/api/auth/login', 'no es json');
    // Nombre vacío: los intentos fallidos de pruebas anteriores con cuerpo vacío pueden haberlo bloqueado.
    assert.ok([401, 429].includes(login.status), `login con JSON roto → ${login.status}`);
    const s = await student('JsonRoto');
    await s.post('/api/eval/spin');
    const sub = await s.req('POST', '/api/eval/submit', '{{{');
    assert.ok(sub.status < 500, `submit con JSON roto → ${sub.status}`);
    assert.equal((await client().get('/api/auth/me')).status, 200);
  });

  test('cuerpo mayor a 1 MB se rechaza y el servidor sigue vivo', async () => {
    const big = JSON.stringify({ name: 'x'.repeat(2 * 1024 * 1024), password: 'clave1234' });
    let status = null;
    try { status = (await client().req('POST', '/api/auth/register', big)).status; } catch { status = 'conexión cortada'; }
    assert.ok(status === 'conexión cortada' || status === 413, `status ${status}`);
    assert.equal((await client().get('/api/auth/me')).status, 200);
    assert.ok(srv.alive, 'el proceso murió');
  });

  test('método no soportado en ruta conocida → 404 JSON', async () => {
    const s = await student('Metodo');
    const r = await s.req('PUT', '/api/eval/submit', {});
    assert.equal(r.status, 404);
  });

  test('rutas con ":" (flujos alternos de NTFS) → 400', async () => {
    for (const p of ['/js/app.js::$DATA', '/js/app.js:x', '/css/styles.css%3A%3A%24DATA']) {
      const r = await rawGet(p);
      assert.equal(r.status, 400, p);
    }
  });

  test('variantes de mayúsculas no se sirven ni hacen crecer la caché', async () => {
    await fetch(srv.base + '/css/styles.css');
    const before = (await client().get('/api/debug/static-cache')).data;
    assert.ok(before.size >= 1 && before.files >= 5, JSON.stringify(before));
    const variants = ['/CSS/STYLES.CSS', '/Css/styles.css', '/css/Styles.css', '/JS/APP.JS', '/js/App.js', '/INDEX.HTML'];
    for (let i = 0; i < 40; i++) variants.push('/css/' + [...'styles.css'].map((ch, k) => ((i >> (k % 6)) & 1 ? ch.toUpperCase() : ch)).join(''));
    for (const p of variants) {
      if (p === '/css/styles.css') continue;
      const r = await rawGet(p);
      assert.equal(r.status, 404, p);
    }
    const after = (await client().get('/api/debug/static-cache')).data;
    assert.equal(after.size, before.size, 'la caché creció con variantes de mayúsculas');
  });

  test('cabeceras de seguridad en la API, los estáticos y el CSV', async () => {
    const adm = await admin();
    const responses = [await fetch(srv.base + '/'), await fetch(srv.base + '/js/app.js'), await fetch(srv.base + '/api/auth/me'), await fetch(srv.base + '/no-existe.js'),
      await adm.get('/api/admin/export.csv', { raw: true })];
    for (const r of responses) {
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff', r.url);
      assert.equal(r.headers.get('x-frame-options'), 'DENY', r.url);
      assert.equal(r.headers.get('referrer-policy'), 'same-origin', r.url);
    }
  });

  test('la cookie lleva Secure solo detrás de HTTPS', async () => {
    const plain = await client().post('/api/auth/register', { name: uniqueName('Cookie'), password: 'clave1234' }, { raw: true });
    assert.ok(!/;\s*Secure/i.test(plain.headers.getSetCookie().join()), 'Secure sin HTTPS rompería el login en http://');
    const https = await client().post('/api/auth/register', { name: uniqueName('Cookie'), password: 'clave1234' }, { raw: true, headers: { 'x-forwarded-proto': 'https' } });
    assert.match(https.headers.getSetCookie().join(), /;\s*Secure/i);
  });

  test('el proceso sigue vivo y sin errores no controlados', () => {
    assert.ok(srv.alive, 'server.js terminó durante las pruebas');
    assert.ok(!/Uncaught|unhandled/i.test(srv.output), srv.output);
  });
});
