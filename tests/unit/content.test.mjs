// Integridad del contenido académico (public/js/content.js): se carga en un contexto aislado de `vm`,
// igual que lo haría el navegador como script clásico, y se validan sus estructuras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../helpers.mjs';

const NAMES = ['WORK', 'CHAPTERS', 'INTRO', 'LEVELS', 'CPACA_POINTS', 'BEFORE_1991', 'CONCEPT', 'TRAITS', 'PRINCIPLES', 'PURPOSES', 'OBJECT', 'DUTY',
  'DUTY_EXAMPLE', 'NOT_ENFORCEABLE', 'PRACTICAL_RULE', 'STANDING', 'PRIVATE_REQS', 'PRIVATES', 'WHOM_TO_SUE', 'RENUENCIA', 'IMPROCEDENCE', 'CADUCIDAD',
  'COMPETENCE', 'STEPS', 'SPECIAL', 'RULING', 'RULING_NOTES', 'COMPARE', 'ADVANCED', 'CHECKLIST', 'MODELS', 'VERDICTS', 'CASES', 'FAQ', 'CASE_LAW',
  'CONCLUSIONS', 'REFERENCES'];
// Rutas que existen en la SPA (además de #/ingresar, #/registro y #/admin).
const KNOWN_ROUTES = ['/inicio', '/procedencia', '/tramite', '/comparativo', '/casos', '/evaluacion'];

const code = fs.readFileSync(path.join(ROOT, 'public', 'js', 'content.js'), 'utf8');
// Las declaraciones `const` de un script no quedan en el objeto global: se devuelven explícitamente.
// typeof evita un ReferenceError si alguna global se renombra; la prueba de abajo lo reporta.
// JSON: los objetos del contexto aislado tienen otros prototipos y deepEqual los consideraría distintos.
const C = JSON.parse(JSON.stringify(vm.runInNewContext(`${code}\n;({ ${NAMES.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} })`, {}, { filename: 'content.js' }), (k, v) => (v === undefined ? null : v)));

// Todas las cadenas del contenido con su ruta (p. ej. "CASES[2].facts").
function strings(value, at = '', out = []) {
  if (typeof value === 'string') out.push([at, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${at}[${i}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, at ? `${at}.${k}` : k, out);
  return out;
}
const ALL = strings(C);

test('content.js define todas las globales que usa la aplicación', () => {
  for (const n of NAMES) assert.ok(C[n] != null, `falta la global ${n}`);
});

test('no hay cadenas vacías ni con espacios sobrantes', () => {
  for (const [at, s] of ALL) {
    assert.ok(s.trim().length > 0, `${at} está vacía`);
    assert.equal(s, s.trim(), `${at} tiene espacios al inicio o al final`);
    assert.ok(!/ {2,}/.test(s.replace(/\n/g, '')), `${at} tiene espacios dobles`);
  }
});

test('ortografía: palabras que siempre llevan tilde', () => {
  // Formas que en español correcto nunca se escriben sin tilde (las rutas como "/tramite" se excluyen).
  const bad = /\b(accion|constitucion|administracion|jurisdiccion|tambien|peticion|notificacion|impugnacion|ademas|resolucion|regulacion|aplicacion|obligacion|funcion|autonomia|politica|publica|publico|juridico|juridica|tecnico|unico)\b/i;
  for (const [at, s] of ALL) {
    if (/^\/[a-z]+$/.test(s)) continue;
    const m = s.match(bad);
    assert.ok(!m, `${at}: "${m?.[0]}" sin tilde en «${s.slice(0, 80)}…»`);
  }
});

test('comillas y paréntesis balanceados', () => {
  for (const [at, s] of ALL) {
    const count = (re) => (s.match(re) || []).length;
    assert.equal(count(/«/g), count(/»/g), `${at}: comillas « » desbalanceadas`);
    // Los modelos usan enumeraciones del tipo «a) … b)», que abren sin cerrar a propósito.
    if (at.startsWith('MODELS')) continue;
    assert.equal(count(/\(/g), count(/\)/g), `${at}: paréntesis desbalanceados`);
    assert.equal(count(/\[/g), count(/\]/g), `${at}: corchetes desbalanceados`);
  }
});

test('CHAPTERS: rutas únicas y conocidas, numeración consecutiva', () => {
  const paths = C.CHAPTERS.map((c) => c.path);
  assert.equal(new Set(paths).size, paths.length, 'rutas repetidas');
  for (const p of paths) assert.ok(KNOWN_ROUTES.includes(p), `ruta desconocida ${p}`);
  assert.ok(paths.includes('/inicio') && paths.includes('/evaluacion'));
  C.CHAPTERS.forEach((c, i) => {
    assert.equal(c.n, String(i + 1).padStart(2, '0'), `numeración de ${c.path}`);
    assert.ok(c.title && c.short && c.text && c.color, `capítulo ${c.path} incompleto`);
  });
});

test('LEVELS: los tres niveles normativos', () => {
  assert.equal(C.LEVELS.length, 3);
  assert.deepEqual(C.LEVELS.map((l) => l.k), ['cp', 'ley', 'cpaca']);
  assert.match(C.LEVELS[0].norma, /Art\. 87/);
  assert.match(C.LEVELS[1].norma, /Ley 393 de 1997/);
  assert.match(C.LEVELS[2].norma, /Art\. 146/);
});

test('CASES: veredicto válido y campos completos', () => {
  assert.ok(C.VERDICTS.length >= 2);
  assert.equal(C.CASES.length, 6, 'el trabajo tiene seis casos resueltos');
  for (const [i, c] of C.CASES.entries()) {
    assert.ok(Number.isInteger(c.verdict) && c.verdict >= 0 && c.verdict < C.VERDICTS.length, `caso ${i + 1}: veredicto ${c.verdict} fuera de VERDICTS`);
    for (const k of ['t', 'label', 'facts', 'analysis', 'solution']) assert.ok(c[k], `caso ${i + 1}: falta ${k}`);
  }
  // Los veredictos de los casos del trabajo.
  assert.deepEqual(C.CASES.map((c) => C.VERDICTS[c.verdict]), ['Procede', 'Improcedente', 'Se rechaza', 'Improcedente', 'Procede', 'Improcedente']);
});

test('COMPARE: cada acción tiene un valor por criterio y nombre único', () => {
  const n = C.COMPARE.criteria.length;
  assert.ok(n >= 4);
  assert.equal(C.COMPARE.actions[0].k, 'cumplimiento', 'la acción de cumplimiento debe ir primero');
  assert.equal(new Set(C.COMPARE.actions.map((a) => a.k)).size, C.COMPARE.actions.length);
  for (const a of C.COMPARE.actions) {
    assert.equal(a.values.length, n, `${a.k}: ${a.values.length} valores para ${n} criterios`);
    assert.ok(a.name && a.color);
  }
  assert.ok(C.COMPARE.key);
});

test('STEPS: días numéricos o null, referencias y textos', () => {
  assert.ok(C.STEPS.length >= 6);
  for (const s of C.STEPS) {
    assert.ok(s.days === null || (Number.isInteger(s.days) && s.days > 0), `${s.n}: days inválido (${s.days})`);
    assert.ok(s.n && s.ref && s.unit && s.d && s.color, `${s.n}: paso incompleto`);
    assert.match(s.ref, /^arts?\. /, `${s.n}: referencia «${s.ref}»`);
  }
  // Términos de la Ley 393 que la exposición presenta.
  const days = Object.fromEntries(C.STEPS.map((s) => [s.n, s.days]));
  assert.equal(days['Fallo'], 20);
  assert.equal(days['Cumplimiento'], 10);
  assert.equal(days['Impugnación'], 3);
});

test('COMPETENCE: nacional → tribunal, territorial → juzgado', () => {
  assert.match(C.COMPETENCE.nacional.first, /Tribunal/i);
  assert.match(C.COMPETENCE.nacional.second, /Sección Quinta/);
  assert.match(C.COMPETENCE.territorial.first, /Juzgado/i);
  assert.match(C.COMPETENCE.territorial.firstRef, /155/);
});

test('FAQ, ADVANCED, CASE_LAW y listas completas', () => {
  assert.equal(C.FAQ.length, 18);
  for (const f of C.FAQ) { assert.ok(f.q.endsWith('?'), `pregunta sin "?": ${f.q}`); assert.ok(f.q.startsWith('¿'), `pregunta sin "¿": ${f.q}`); assert.ok(f.a.length > 20); }
  assert.equal(C.ADVANCED.length, 8);
  C.ADVANCED.forEach((a, i) => { assert.equal(a.n, `10.${i + 1}`); assert.ok(a.t && Array.isArray(a.d) && a.d.length > 0); });
  assert.ok(C.CASE_LAW.length >= 10);
  for (const j of C.CASE_LAW) { assert.ok(['cc', 'ce'].includes(j.court), `tribunal inválido en ${j.p}`); assert.ok(j.p && j.who && j.r); }
  assert.equal(new Set(C.CASE_LAW.map((j) => j.p)).size, C.CASE_LAW.length, 'providencias repetidas');
  assert.equal(C.CHECKLIST.length, 11);
  assert.equal(C.CONCLUSIONS.length, 5);
  assert.equal(C.TRAITS.length, 5);
  assert.equal(C.NOT_ENFORCEABLE.length, 9);
  for (const x of C.NOT_ENFORCEABLE) assert.ok(x.t && x.why && x.via);
  assert.equal(C.PRACTICAL_RULE.length, 4);
  assert.equal(C.RENUENCIA.identity.length, 5);
});

test('MODELS: plantillas con campos [por diligenciar]', () => {
  for (const [k, m] of Object.entries(C.MODELS)) {
    assert.ok(m.title && m.tip, `${k}: incompleto`);
    assert.ok((m.text.match(/\[[^\]]+\]/g) || []).length >= 5, `${k}: pocos campos por diligenciar`);
    assert.equal((m.text.match(/\[/g) || []).length, (m.text.match(/\]/g) || []).length, `${k}: corchetes desbalanceados`);
  }
  assert.match(C.MODELS.renuencia.text, /art\. 8 de la Ley 393/);
  assert.match(C.MODELS.demanda.text, /artículo 87 de la Constitución/);
});

test('autoría y título del trabajo', () => {
  assert.equal(C.WORK.author, 'Yury Carolina Ochoa Álvarez');
  assert.match(C.WORK.title, /acción de cumplimiento/i);
});
