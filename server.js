// Servidor HTTP sin dependencias: API REST + archivos estáticos.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { db, cleanName, nameKey, hashPasswordAsync, checkPasswordAsync } = require('./src/db');
const QUESTIONS = require('./src/questions');

const PORT = Number(process.env.PORT) || 3100;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 7;

// Despachos del reparto: como toda demanda radicada, la evaluación "se reparte" a un despacho al azar,
// y el despacho decide cuántas preguntas se responden. El sorteo ocurre aquí; el frontend recibe la
// lista por la API y solo anima hasta `segmentIndex`.
const SEGMENTS = [
  { label: 'Juzgado', title: 'Juzgado Administrativo', questions: 6, bonus: 0 },
  { label: 'Tribunal', title: 'Tribunal Administrativo', questions: 8, bonus: 0 },
  { label: 'Sección Quinta', title: 'Consejo de Estado · Sección Quinta', questions: 10, bonus: 0 },
  { label: 'Art. 15', title: 'Cumplimiento inmediato (art. 15)', questions: 5, bonus: 0.5 },
  { label: 'Juzgado', title: 'Juzgado Administrativo', questions: 6, bonus: 0 },
  { label: 'Tribunal', title: 'Tribunal Administrativo', questions: 8, bonus: 0 },
];
const MAX_SCORE = 5;
const PASS_SCORE = 3;

// Límite de intentos de login (en memoria). Ajustables por entorno para las pruebas.
const LOGIN_MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS) || 5; // fallos seguidos por nombre antes de bloquear
const LOGIN_LOCK_MS = Number(process.env.LOGIN_LOCK_MS) || 30_000; // primer bloqueo; se duplica en cada bloqueo siguiente
const LOGIN_LOCK_MAX_MS = 15 * 60_000;
// Tope por IP generoso: en el aula todos salen por la misma IP pública.
const IP_MAX_FAILS = Number(process.env.LOGIN_IP_MAX_FAILS) || 100; // fallos por minuto
const NAME_RE = /^[\p{L}\p{M}\p{N} .'\-]+$/u;

// Cabeceras de seguridad comunes a la API y a los estáticos.
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(data);
}

// Siempre resuelve un objeto plano: JSON inválido, `null`, números o arreglos se tratan como {}.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; let tooBig = false; const chunks = [];
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > 1e6) { tooBig = true; reject(Object.assign(new Error('Solicitud demasiado grande.'), { status: 413 })); } else chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return;
      let data = {};
      try { data = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { /* JSON inválido */ }
      resolve(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
    });
    req.on('error', reject);
  });
}

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, safeDecode(v.join('='))]));
}

// Secure cuando se sirve por HTTPS (directo con COOKIE_SECURE=1 o detrás de un proxy que lo indica).
const isSecure = (req) => process.env.COOKIE_SECURE === '1' || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const cookieAttrs = (req) => `HttpOnly; SameSite=Lax; Path=/${isSecure(req) ? '; Secure' : ''}`;

function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires.toISOString());
  res.setHeader('Set-Cookie', `sid=${token}; ${cookieAttrs(req)}; Max-Age=${SESSION_DAYS * 86400}`);
}

// ---------- límite de intentos de login ----------
// Por nombre: tras LOGIN_MAX_FAILS fallos seguidos se bloquea LOGIN_LOCK_MS, y cada bloqueo siguiente dura el doble
// (máx. 15 min). Un ingreso correcto lo reinicia. Mientras dura, se responde 429 sin calcular scrypt.
const loginFails = new Map(); // name_key → { fails, locks, until, last }
const ipFails = new Map(); // ip → { count, windowStart }
const clientIp = (req) => req.socket.remoteAddress || '';
function lockRemaining(key, ip, now = Date.now()) {
  const f = loginFails.get(key);
  const byName = f && f.until > now ? f.until - now : 0;
  const w = ipFails.get(ip);
  const byIp = w && now - w.windowStart < 60_000 && w.count >= IP_MAX_FAILS ? w.windowStart + 60_000 - now : 0;
  return Math.max(byName, byIp);
}
function registerFail(key, ip, now = Date.now()) {
  const f = loginFails.get(key) || { fails: 0, locks: 0, until: 0, last: now };
  f.fails++; f.last = now;
  if (f.fails >= LOGIN_MAX_FAILS) { f.until = now + Math.min(LOGIN_LOCK_MAX_MS, LOGIN_LOCK_MS * 2 ** f.locks); f.locks++; f.fails = 0; }
  loginFails.set(key, f);
  const w = ipFails.get(ip);
  if (!w || now - w.windowStart >= 60_000) ipFails.set(ip, { count: 1, windowStart: now }); else w.count++;
}
const tooMany = (res, ms) => {
  const secs = Math.max(1, Math.ceil(ms / 1000));
  return send(res, 429, { error: `Demasiados intentos fallidos. Espera ${secs} segundos e inténtalo de nuevo.` }, { 'Retry-After': String(secs) });
};
// Limpieza de entradas viejas: nombres sin actividad ni bloqueo vigente en la última hora, ventanas de IP vencidas.
setInterval(() => {
  const now = Date.now();
  for (const [k, f] of loginFails) if (f.until < now && now - f.last > 36e5) loginFails.delete(k);
  for (const [k, w] of ipFails) if (now - w.windowStart >= 60_000) ipFails.delete(k);
}, 60_000).unref();

function currentUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); return null; }
  return { id: row.id, name: row.name, role: row.role, token };
}

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role });
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const byId = new Map(QUESTIONS.map((q) => [q.id, q]));

// Mezcla de tipos: los casos prácticos siempre aparecen (al menos uno) y el resto sale al azar.
function pickQuestions(n) {
  const casos = shuffle(QUESTIONS.filter((q) => q.type === 'caso')).slice(0, Math.max(1, Math.round(n / 5)));
  const rest = shuffle(QUESTIONS.filter((q) => q.type !== 'caso')).slice(0, n - casos.length);
  return shuffle([...rest, ...casos]).map((q) => q.id);
}

// Soluciones de la evaluación: ocultas hasta que el administrador las publique. Si se mostraran al enviar,
// bastaría con cuentas desechables (registrarse, enviar en blanco) para obtener todo el banco.
const solutionsPublished = () => db.prepare("SELECT value FROM settings WHERE key = 'solutions_published'").get()?.value === '1';

// Vista de un intento. Antes de enviar: solo preguntas y opciones. Terminado: lo elegido, la nota y los aciertos;
// la respuesta correcta y la explicación solo si las soluciones están publicadas.
function attemptView(a) {
  const ids = JSON.parse(a.question_ids);
  const answers = a.answers ? JSON.parse(a.answers) : {};
  const seg = SEGMENTS[a.segment_index];
  const done = a.status === 'done';
  const published = done && solutionsPublished();
  return {
    id: a.id, status: a.status, segmentIndex: a.segment_index, despacho: a.despacho, despachoTitle: seg?.title ?? a.despacho,
    numQuestions: a.num_questions, bonus: a.bonus, correct: a.correct, score: a.score,
    passed: a.score != null ? a.score >= PASS_SCORE : null, startedAt: a.started_at, finishedAt: a.finished_at,
    ...(done ? { solutionsPublished: published } : {}),
    // filter: si el banco de preguntas cambia, un id antiguo no debe romper la vista del intento.
    questions: ids.filter((id) => byId.has(id)).map((id) => {
      const q = byId.get(id);
      const base = { id: q.id, type: q.type, topic: q.topic, q: q.q, options: q.options };
      if (!done) return base;
      return published ? { ...base, answer: q.answer, explain: q.explain, chosen: answers[id] ?? null } : { ...base, chosen: answers[id] ?? null };
    }),
  };
}

// Aciertos por pregunta en las evaluaciones terminadas: muestra al expositor qué temas reforzar.
function questionStats() {
  const stats = new Map();
  for (const a of db.prepare("SELECT question_ids, answers FROM attempts WHERE status = 'done'").all()) {
    const answers = a.answers ? JSON.parse(a.answers) : {};
    for (const id of JSON.parse(a.question_ids)) {
      const q = byId.get(id);
      if (!q) continue;
      const s = stats.get(id) || { id, topic: q.topic, q: q.q, asked: 0, correct: 0 };
      s.asked++;
      if (answers[id] === q.answer) s.correct++;
      stats.set(id, s);
    }
  }
  return [...stats.values()].sort((x, y) => x.correct / x.asked - y.correct / y.asked || y.asked - x.asked);
}

// ---------- API ----------
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const user = currentUser(req);

  // --- autenticación ---
  if (route === 'POST /api/auth/register') {
    const { name = '', password = '' } = await readBody(req);
    const clean = cleanName(name);
    if (clean.length < 3 || clean.length > 80) return send(res, 400, { error: 'Escribe tu nombre completo (entre 3 y 80 caracteres).' });
    if (!NAME_RE.test(clean) || (clean.match(/\p{L}/gu) || []).length < 2) return send(res, 400, { error: "Usa solo letras, números, espacios y los signos . ' -" });
    if (String(password).length < 4) return send(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' });
    const taken = () => send(res, 409, { error: 'Ya existe un usuario con ese nombre. Ingresa desde "Iniciar sesión".' });
    if (db.prepare('SELECT id FROM users WHERE name_key = ?').get(nameKey(clean))) return taken();
    const { hash, salt } = await hashPasswordAsync(password);
    // Durante el hash (asíncrono) otro registro con el mismo nombre pudo adelantarse: lo resuelve la restricción UNIQUE.
    let lastInsertRowid;
    try {
      ({ lastInsertRowid } = db.prepare("INSERT INTO users (name, name_key, password_hash, salt, last_login) VALUES (?, ?, ?, ?, datetime('now'))").run(clean, nameKey(clean), hash, salt));
    } catch (e) { if (/UNIQUE/i.test(e.message)) return taken(); throw e; }
    const id = Number(lastInsertRowid);
    db.prepare("INSERT INTO logins (user_id, kind) VALUES (?, 'register')").run(id);
    createSession(req, res, id);
    return send(res, 201, { user: { id, name: clean, role: 'student' } });
  }

  if (route === 'POST /api/auth/login') {
    const { name = '', password = '' } = await readBody(req);
    const key = nameKey(name); const ip = clientIp(req);
    const wait = lockRemaining(key, ip);
    if (wait > 0) return tooMany(res, wait);
    const u = db.prepare('SELECT * FROM users WHERE name_key = ?').get(key);
    if (!u || !(await checkPasswordAsync(password, u))) {
      registerFail(key, ip);
      const now = lockRemaining(key, ip);
      return now > 0 ? tooMany(res, now) : send(res, 401, { error: 'Nombre o contraseña incorrectos.' });
    }
    loginFails.delete(key);
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(u.id);
    db.prepare("INSERT INTO logins (user_id, kind) VALUES (?, 'login')").run(u.id);
    createSession(req, res, u.id);
    return send(res, 200, { user: publicUser(u) });
  }

  if (route === 'POST /api/auth/logout') {
    if (user) db.prepare('DELETE FROM sessions WHERE token = ?').run(user.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=; ${cookieAttrs(req)}; Max-Age=0` });
  }

  if (route === 'GET /api/debug/static-cache' && process.env.EXPOSE_TEST_INFO === '1') return send(res, 200, { size: staticCache.size, files: staticFiles.size });

  if (route === 'GET /api/auth/me') return send(res, 200, { user: user ? publicUser(user) : null });

  if (!user) return send(res, 401, { error: 'Debes iniciar sesión.' });

  // --- evaluación ---
  if (route === 'GET /api/eval/config') {
    return send(res, 200, { segments: SEGMENTS.map(({ label, title, questions, bonus }) => ({ label, title, questions, bonus })), maxScore: MAX_SCORE, passScore: PASS_SCORE });
  }

  if (route === 'GET /api/eval/status') {
    const a = db.prepare('SELECT * FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id);
    return send(res, 200, { attempt: a ? attemptView(a) : null });
  }

  if (route === 'POST /api/eval/spin') {
    const existing = db.prepare('SELECT * FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id);
    if (existing) return send(res, 200, { attempt: attemptView(existing), alreadySpun: true });
    const segmentIndex = crypto.randomInt(SEGMENTS.length);
    const seg = SEGMENTS[segmentIndex];
    const ids = pickQuestions(seg.questions);
    // Sin await entre la consulta de arriba y este INSERT: dos repartos simultáneos no crean dos intentos.
    const { lastInsertRowid } = db.prepare('INSERT INTO attempts (user_id, segment_index, despacho, num_questions, bonus, question_ids) VALUES (?, ?, ?, ?, ?, ?)')
      .run(user.id, segmentIndex, seg.label, seg.questions, seg.bonus, JSON.stringify(ids));
    const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(Number(lastInsertRowid));
    return send(res, 201, { attempt: attemptView(a) });
  }

  if (route === 'POST /api/eval/submit') {
    // Primero el cuerpo, después leer y cerrar el intento sin ningún await de por medio: dos envíos
    // simultáneos (doble clic, red lenta) no pueden calificar dos veces el mismo intento.
    const body = await readBody(req);
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const a = db.prepare("SELECT * FROM attempts WHERE user_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1").get(user.id);
    if (!a) return send(res, 400, { error: 'No tienes una evaluación en curso.' });
    const ids = JSON.parse(a.question_ids);
    const clean = {};
    let correct = 0;
    for (const id of ids) {
      const q = byId.get(id);
      const v = answers[id];
      if (q && Number.isInteger(v) && v >= 0 && v < q.options.length) { clean[id] = v; if (q.answer === v) correct++; }
    }
    const score = Math.min(MAX_SCORE, Math.round(((correct / ids.length) * MAX_SCORE + a.bonus) * 10) / 10);
    const { changes } = db.prepare("UPDATE attempts SET answers = ?, correct = ?, score = ?, status = 'done', finished_at = datetime('now') WHERE id = ? AND status = 'in_progress'")
      .run(JSON.stringify(clean), correct, score, a.id);
    if (changes !== 1) return send(res, 400, { error: 'No tienes una evaluación en curso.' });
    return send(res, 200, { attempt: attemptView(db.prepare('SELECT * FROM attempts WHERE id = ?').get(a.id)) });
  }

  // --- administración ---
  if (url.pathname.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return send(res, 403, { error: 'Solo el administrador puede ver esta sección.' });

    if (route === 'GET /api/admin/overview') {
      const students = db.prepare(`
        SELECT u.id, u.name, u.created_at, u.last_login,
          (SELECT COUNT(*) FROM logins l WHERE l.user_id = u.id) AS logins,
          a.id AS attempt_id, a.segment_index, a.despacho, a.num_questions, a.bonus, a.correct, a.score, a.status, a.started_at, a.finished_at
        FROM users u
        LEFT JOIN attempts a ON a.id = (SELECT MAX(id) FROM attempts WHERE user_id = u.id)
        WHERE u.role = 'student'
        ORDER BY COALESCE(u.last_login, u.created_at) DESC`).all();
      const activity = db.prepare(`
        SELECT l.kind, l.at, u.name FROM logins l JOIN users u ON u.id = l.user_id
        WHERE u.role = 'student' ORDER BY l.id DESC LIMIT 40`).all();
      return send(res, 200, { students, activity, questions: questionStats(), passScore: PASS_SCORE, maxScore: MAX_SCORE, solutionsPublished: solutionsPublished() });
    }

    if (route === 'POST /api/admin/solutions') {
      const { published } = await readBody(req);
      if (typeof published !== 'boolean') return send(res, 400, { error: 'Indica published: true o false.' });
      db.prepare("INSERT INTO settings (key, value) VALUES ('solutions_published', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(published ? '1' : '0');
      return send(res, 200, { solutionsPublished: published });
    }

    const reset = url.pathname.match(/^\/api\/admin\/attempts\/(\d+)$/);
    if (reset && req.method === 'DELETE') {
      db.prepare('DELETE FROM attempts WHERE id = ?').run(Number(reset[1]));
      return send(res, 200, { ok: true });
    }

    if (route === 'GET /api/admin/export.csv') {
      const rows = db.prepare(`
        SELECT u.name, u.created_at, u.last_login, (SELECT COUNT(*) FROM logins l WHERE l.user_id = u.id) AS logins,
          a.segment_index, a.despacho, a.num_questions, a.correct, a.bonus, a.score, a.status, a.finished_at
        FROM users u LEFT JOIN attempts a ON a.id = (SELECT MAX(id) FROM attempts WHERE user_id = u.id)
        WHERE u.role = 'student' ORDER BY u.name`).all();
      // Anteponer ' a celdas que empiezan por = + - @ (o tab/CR) evita que Excel ejecute un nombre como fórmula.
      const esc = (v) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
      // Separador ; (Excel en español) con coma decimal: "4,2", no "4.2" (que Excel puede leer como fecha).
      const num = (v) => (v == null ? '' : String(v).replace('.', ','));
      const header = ['Nombre', 'Registro (UTC)', 'Último ingreso (UTC)', 'Ingresos', 'Despacho', 'Preguntas', 'Aciertos', 'Bonus', 'Nota', 'Estado', 'Finalizó (UTC)'];
      const csv = '﻿' + [header, ...rows.map((r) => [r.name, r.created_at, r.last_login, r.logins, r.despacho ? (SEGMENTS[r.segment_index]?.title ?? r.despacho) : '', r.num_questions, r.correct, num(r.bonus), num(r.score), r.status, r.finished_at])]
        .map((r) => r.map(esc).join(';')).join('\r\n');
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="notas_accion_de_cumplimiento.csv"' });
      return res.end(csv);
    }
  }

  return send(res, 404, { error: 'Ruta no encontrada.' });
}

// ---------- estáticos ----------
// Solo se sirven los archivos que existen en public/ con su nombre exacto (sensible a mayúsculas). En Windows,
// /CSS/STYLES.CSS o /js/app.js::$DATA abren el mismo archivo: sin esta lista, cada variante ocupaba memoria en la caché.
let staticFiles = new Set();
let lastScan = 0;
function scanPublic() {
  const found = new Set();
  const walk = (dir, rel) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel + '/' + d.name;
      if (d.isDirectory()) walk(path.join(dir, d.name), r); else if (d.isFile()) found.add(r);
    }
  };
  walk(PUBLIC_DIR, '');
  staticFiles = found; lastScan = Date.now();
}
scanPublic();
// Un archivo nuevo en public/ aparece sin reiniciar: si la ruta no está, se reescanea como mucho una vez por segundo.
function knownStatic(rel) {
  if (staticFiles.has(rel)) return true;
  if (Date.now() - lastScan < 1000) return false;
  try { scanPublic(); } catch { return false; }
  return staticFiles.has(rel);
}

const notFound = (res) => { res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); };

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD' }); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Solicitud inválida'); }
  if (rel.includes('\0') || rel.includes(':') || rel.includes('\\')) { res.writeHead(400, SECURITY_HEADERS); return res.end(); }
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  if (rel.split('/').some((seg) => seg === '..' || seg === '.')) { res.writeHead(403, SECURITY_HEADERS); return res.end(); }
  if (!knownStatic(rel)) return notFound(res);
  const file = path.join(PUBLIC_DIR, rel);
  loadStatic(rel, file, (err, entry) => {
    if (err) return notFound(res);
    // no-cache + ETag: el navegador revalida en cada visita (los cambios en public/ se ven al instante)
    // pero solo descarga de nuevo si el archivo cambió; si no, recibe un 304 vacío.
    const headers = { ...SECURITY_HEADERS, 'Content-Type': entry.type, 'Cache-Control': 'no-cache', ETag: entry.etag, Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers); return res.end(); }
    const gzip = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const body = gzip ? entry.gz : entry.raw;
    res.writeHead(200, { ...headers, 'Content-Length': body.length, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}

// Caché en memoria de estáticos (contenido, ETag y versión gzip), con clave en la ruta canónica de la lista.
// El stat se reutiliza durante 1 s: con toda la clase entrando a la vez no compite con scrypt por el pool de hilos.
// Con datos móviles, el texto comprimido pesa ~4 veces menos.
const staticCache = new Map();
const STAT_TTL = 1000;
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg)/;
function loadStatic(rel, file, cb) {
  const hit = staticCache.get(rel);
  if (hit && Date.now() - hit.checked < STAT_TTL) return cb(null, hit);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { staticCache.delete(rel); return cb(err || new Error('no es un archivo')); }
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) { hit.checked = Date.now(); return cb(null, hit); }
    fs.readFile(file, (err2, raw) => {
      if (err2) return cb(err2);
      const type = MIME[path.extname(file)] || 'application/octet-stream';
      const entry = {
        mtimeMs: st.mtimeMs, size: st.size, checked: Date.now(), type, raw,
        etag: `"${crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"`,
        gz: COMPRESSIBLE.test(type) && raw.length > 1024 ? zlib.gzipSync(raw, { level: 6 }) : null,
      };
      staticCache.set(rel, entry);
      cb(null, entry);
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // Base fija: una cabecera Host malformada no debe poder lanzar fuera del try (y tumbar el proceso).
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    if (e.status === 413) return send(res, 413, { error: e.message }, { Connection: 'close' });
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Error interno del servidor.' });
    else res.destroy();
  }
});

// Última red de seguridad: un error inesperado se registra, pero no apaga el servidor en plena clase.
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

// Limpieza periódica de sesiones vencidas.
setInterval(() => db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString()), 36e5).unref();

server.listen(PORT, () => console.log(`Acción de cumplimiento · Guía interactiva → http://localhost:${PORT}`));
