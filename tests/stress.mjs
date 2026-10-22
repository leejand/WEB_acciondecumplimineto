// Prueba de estrés sin dependencias: simula una clase completa usando la app al mismo tiempo desde el celular.
//
//   npm run test:stress                      → 50 estudiantes contra un servidor temporal
//   STUDENTS=150 npm run test:stress         → más estudiantes (PowerShell: $env:STUDENTS=150; npm run test:stress)
//   ROUNDS=2 npm run test:stress             → repetir el ciclo completo
//   BASE=http://localhost:3100 ADMIN_PASSWORD=... npm run test:stress   → contra un servidor ya encendido
//      (crea estudiantes «Carga …» en esa base: no lo use contra la base real de la clase)
//
// Fases (todos los estudiantes a la vez en cada una):
//   1) registro, 2) carga de la página y sus recursos como un navegador móvil, 3) nuevo inicio de sesión,
//   4) flujo de evaluación (reparto y envío) mientras el admin consulta panel y CSV,
//   5) sesión: cerrar sesión (la cookie deja de valer), volver a entrar y ver la nota guardada.
// Una sonda consulta /api/auth/me cada 50 ms: su latencia máxima indica cuánto se bloqueó el servidor.
import { startServer, Client, ADMIN } from './helpers.mjs';

const N = Number(process.env.STUDENTS) || 50;
const ROUNDS = Number(process.env.ROUNDS) || 1;
const TIMEOUT = 30000;
// Lo que pide un navegador al abrir la app: la página y, en paralelo, sus hojas de estilo y scripts.
const ASSETS = ['/css/styles.css', '/css/fx.css', '/js/content.js', '/js/app.js', '/js/fx.js'];

const stats = new Map(); // etiqueta → { lat: [], errors: {} }
const record = (label, ms, err) => {
  if (!stats.has(label)) stats.set(label, { lat: [], errors: {} });
  const s = stats.get(label);
  if (err) s.errors[err] = (s.errors[err] || 0) + 1; else s.lat.push(ms);
};

async function timed(label, fn, okStatus = [200, 201]) {
  const t = performance.now();
  try {
    const r = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))]);
    const ms = performance.now() - t;
    if (!okStatus.includes(r.status)) record(label, ms, `HTTP ${r.status}`); else record(label, ms);
    return r;
  } catch (e) {
    record(label, performance.now() - t, e.message === 'timeout' ? 'timeout' : `red: ${e.cause?.code || e.message}`);
    return null;
  }
}

const pct = (arr, p) => { if (!arr.length) return NaN; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]; };
const fmt = (n) => (Number.isNaN(n) ? '—' : `${Math.round(n)} ms`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bytes = 0;

async function register(base, i, round) {
  const c = new Client(base);
  const name = `Carga ${round}-${i} ${Date.now().toString(36)}`;
  const reg = await timed('1 registro', () => c.register(name));
  if (reg?.status !== 201) return null;
  return { c, name };
}

// Fase 2: la página completa, como la carga un celular (documento y luego recursos en paralelo).
async function loadPage({ c }) {
  const t = performance.now();
  const doc = await timed('2 estáticos: /', () => c.get('/'));
  // Bytes por la red: Content-Length del servidor (comprimido si se envió con gzip), no el texto ya descomprimido.
  const wire = (r) => Number(r.headers.get('content-length')) || Buffer.byteLength(String(r.data));
  if (doc?.status === 200) bytes += wire(doc);
  const assets = await Promise.all(ASSETS.map((a) => timed(`2 estáticos: ${a}`, () => c.get(a))));
  for (const r of assets) if (r?.status === 200) bytes += wire(r);
  if (doc?.status === 200 && assets.every((r) => r?.status === 200)) record('2 página completa', performance.now() - t);
  else record('2 página completa', performance.now() - t, 'recurso faltante');
}

async function evalFlow({ c }) {
  await timed('4 config', () => c.get('/api/eval/config'));
  await timed('4 status', () => c.get('/api/eval/status'));
  const spin = await timed('4 reparto', () => c.post('/api/eval/spin'));
  const a = spin?.data?.attempt;
  if (!a) return;
  await sleep(Math.random() * 300); // pequeño "tiempo de respuesta" desordena los envíos
  const answers = Object.fromEntries(a.questions.map((q) => [q.id, Math.floor(Math.random() * q.options.length)]));
  const sub = await timed('4 enviar evaluación', () => c.post('/api/eval/submit', { answers }));
  if (sub?.data?.attempt?.status !== 'done') record('4 enviar evaluación', 0, 'nota no guardada');
  else { const s = (await timed('4 ver resultado', () => c.get('/api/eval/status')))?.data?.attempt; if (s?.score !== sub.data.attempt.score) record('4 ver resultado', 0, 'nota distinta'); }
}

// Fase 5: cerrar sesión invalida la cookie; al volver a entrar la nota sigue ahí.
async function sessionFlow(s) {
  const old = s.c.sid;
  await timed('5 cerrar sesión', () => s.c.post('/api/auth/logout'));
  const replay = new Client(s.c.base); replay.sid = old;
  const after = await timed('5 cookie anterior → 401', () => replay.get('/api/eval/status'), [401]);
  if (after && after.status !== 401) record('5 cookie anterior → 401', 0, 'la sesión cerrada sigue válida');
  const back = new Client(s.c.base);
  const login = await timed('5 volver a entrar', () => back.login(s.name));
  if (login?.status !== 200) return;
  const me = await timed('5 /api/auth/me', () => back.get('/api/auth/me'));
  if (me && me.data?.user?.name !== s.name) record('5 /api/auth/me', 0, 'usuario equivocado');
  const st = await timed('5 nota tras volver', () => back.get('/api/eval/status'));
  if (st && st.data?.attempt?.status !== 'done') record('5 nota tras volver', 0, 'nota perdida');
}

async function main() {
  let srv = null;
  let base = process.env.BASE;
  if (!base) {
    srv = await startServer({ port: 3935, name: 'stress' });
    base = srv.base;
  }
  console.log(`\nPrueba de estrés · ${N} estudiantes · ${ROUNDS} ronda(s) · ${base}\n`);

  // Sonda de disponibilidad: mide la latencia de una petición trivial durante toda la prueba.
  let probing = true;
  const probe = (async () => { while (probing) { await timed('sonda /api/auth/me', () => new Client(base).get('/api/auth/me')); await sleep(50); } })();

  const admin = new Client(base);
  const adminLogin = await timed('admin login', () => admin.login(process.env.ADMIN_USER || ADMIN.name, process.env.ADMIN_PASSWORD || ADMIN.password));
  if (adminLogin?.status !== 200) console.warn('⚠ No se pudo iniciar sesión como admin; se omiten sus consultas.');

  const t0 = performance.now();
  const phases = [];
  const phase = async (name, fn) => { const t = performance.now(); await fn(); phases.push([name, performance.now() - t]); };
  for (let round = 1; round <= ROUNDS; round++) {
    let students = [];
    await phase('1 registro', async () => { students = (await Promise.all(Array.from({ length: N }, (_, i) => register(base, i, round)))).filter(Boolean); });
    await phase('2 estáticos', () => Promise.all(students.map(loadPage)));
    // Fase 3: todos inician sesión a la vez (p. ej. al volver del descanso).
    await phase('3 login', () => Promise.all(students.map((s) => timed('3 login simultáneo', () => new Client(base).login(s.name)))));

    // Fase 4: evaluación + admin consultando.
    let adminBusy = adminLogin?.status === 200;
    const adminLoop = (async () => {
      while (adminBusy) {
        await Promise.all([timed('admin panel', () => admin.get('/api/admin/overview')), timed('admin CSV', () => admin.get('/api/admin/export.csv'))]);
        await sleep(200);
      }
    })();
    await phase('4 evaluación', () => Promise.all(students.map(evalFlow)));
    adminBusy = false;
    await adminLoop;

    await phase('5 sesión', () => Promise.all(students.map(sessionFlow)));
  }
  const total = performance.now() - t0;
  probing = false;
  await probe;

  // Verificación final: todos los estudiantes quedaron calificados.
  let graded = null;
  if (adminLogin?.status === 200) {
    const ov = await admin.get('/api/admin/overview');
    const mine = ov.data.students.filter((s) => s.name.startsWith('Carga '));
    graded = `${mine.filter((s) => s.status === 'done').length}/${mine.length}`;
    if (mine.filter((s) => s.status === 'done').length !== N * ROUNDS && !process.env.BASE) record('verificación final', 0, `calificados ${graded}`);
  }
  const alive = srv ? srv.alive : (await new Client(base).get('/api/auth/me').then((r) => r.status === 200, () => false));

  const rows = [...stats.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, s]) => ({
    operación: label,
    ok: s.lat.length,
    errores: Object.entries(s.errors).map(([k, v]) => `${k}×${v}`).join(', ') || '0',
    p50: fmt(pct(s.lat, 50)), p95: fmt(pct(s.lat, 95)), p99: fmt(pct(s.lat, 99)), máx: fmt(s.lat.length ? Math.max(...s.lat) : NaN),
  }));
  console.table(rows);
  console.table(phases.map(([fase, ms]) => ({ fase, duración: `${(ms / 1000).toFixed(2)} s` })));
  const errors = [...stats.values()].reduce((n, s) => n + Object.values(s.errors).reduce((a, b) => a + b, 0), 0);
  console.log(`Duración total: ${(total / 1000).toFixed(1)} s`);
  console.log(`Estáticos servidos: ${(bytes / 1024 / 1024).toFixed(1)} MB (${(bytes / Math.max(1, N * ROUNDS) / 1024).toFixed(0)} KB por estudiante)`);
  console.log(`Evaluaciones guardadas: ${graded ?? '— (sin admin)'}`);
  console.log(`Errores: ${errors}`);
  console.log(`Servidor vivo al final: ${alive ? 'sí' : 'NO'}`);
  if (srv && /Error|SQLITE_BUSY/i.test(srv.output)) console.log('\nSalida del servidor con errores:\n' + srv.output.split('\n').filter((l) => /Error|BUSY/i.test(l)).slice(0, 20).join('\n'));

  await srv?.stop();
  process.exitCode = errors || !alive ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
