// Utilidades compartidas por las pruebas: arrancar server.js aislado y un cliente HTTP con cookie.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TMP = path.join(ROOT, 'tests', '.tmp');
export const ADMIN = { name: 'admin', password: 'Admin-Test-2026' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const live = new Set();

// Si el proceso de pruebas termina de cualquier forma, no deja servidores huérfanos.
process.on('exit', () => { for (const p of live) { try { p.kill(); } catch { /* ya terminó */ } } });

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '0.0.0.0');
  });
}

export async function freePort(from, to = from + 4) {
  for (let p = from; p <= to; p++) if (await portFree(p)) return p;
  throw new Error(`No hay puertos libres entre ${from} y ${to}`);
}

/**
 * Arranca server.js en un proceso hijo con su propia base de datos temporal.
 * Nunca toca data/app.db.
 */
export async function startServer({ port, name = 'srv', env = {} } = {}) {
  port = await freePort(port);
  const dir = path.join(TMP, `${name}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'app.db');
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, ADMIN_USER: ADMIN.name, ADMIN_PASSWORD: ADMIN.password, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  live.add(proc);
  let output = '';
  proc.stdout.on('data', (d) => { output += d; });
  proc.stderr.on('data', (d) => { output += d; });
  let exited = null;
  proc.on('exit', (code, signal) => { exited = { code, signal }; live.delete(proc); });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  for (;;) {
    if (exited) throw new Error(`server.js terminó al arrancar (${JSON.stringify(exited)}):\n${output}`);
    try { const r = await fetch(base + '/api/auth/me'); if (r.ok) break; } catch { /* aún no escucha */ }
    if (Date.now() > deadline) { proc.kill(); throw new Error(`server.js no respondió a tiempo:\n${output}`); }
    await sleep(100);
  }

  return {
    base, port, dbPath, proc,
    get output() { return output; },
    get alive() { return !exited; },
    async stop() {
      if (!exited) {
        const done = new Promise((r) => proc.once('exit', r));
        proc.kill();
        await Promise.race([done, sleep(3000)]);
      }
      for (let i = 0; i < 10; i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch { await sleep(200); } // Windows puede tardar en soltar el .db
      }
    },
  };
}

/** Cliente HTTP mínimo que conserva la cookie de sesión `sid`. */
export class Client {
  constructor(base) { this.base = base; this.sid = null; }

  async req(method, url, body, { raw = false, headers = {} } = {}) {
    const h = { ...headers };
    if (this.sid) h.cookie = `sid=${this.sid}`;
    let payload;
    if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(this.base + url, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const m = c.match(/^sid=([^;]*)/);
      if (m) this.sid = m[1] || null;
    }
    if (raw) return res;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }

  get(url, opts) { return this.req('GET', url, undefined, opts); }
  post(url, body = {}, opts) { return this.req('POST', url, body, opts); }
  del(url, opts) { return this.req('DELETE', url, undefined, opts); }

  register(name, password = 'clave1234') { return this.post('/api/auth/register', { name, password }); }
  login(name, password = 'clave1234') { return this.post('/api/auth/login', { name, password }); }
}

let seq = 0;
/** Nombre de estudiante único dentro de la corrida. */
export const uniqueName = (prefix = 'Estudiante') => `${prefix} ${process.pid} ${Date.now().toString(36)} ${++seq}`;
