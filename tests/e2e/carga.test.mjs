// Carga de extremo a extremo: N estudiantes reales (Chromium) usan la app al mismo tiempo, casi todos desde el celular.
//
//   npm run test:e2e:carga                          → 50 usuarios, todos a la vez
//   USERS=80 npm run test:e2e:carga                 → más usuarios
//   CONCURRENCY=10 npm run test:e2e:carga           → solo 10 navegadores abiertos a la vez (equipos con poca RAM:
//                                                     cada contexto de Chromium usa ~60–100 MB)
//   (PowerShell: $env:USERS=80; $env:CONCURRENCY=10; npm run test:e2e:carga)
//
// Cada usuario: abre / → lo manda al ingreso → se registra → recorre un capítulo → reparto → responde todas las
// preguntas (una mezcla al azar de correctas e incorrectas, cuyas respuestas conoce la prueba) → envía → ve la
// sentencia → cierra sesión y comprueba que ya no puede entrar. La mitad de los navegadores corre con
// animaciones normales y la otra mitad con `prefers-reduced-motion`. Al final, la administradora verifica que
// la nota guardada de cada uno coincide con sus aciertos y que el CSV tiene todas las filas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { startServer, Client, ADMIN, ROOT } from '../helpers.mjs';

const require = createRequire(import.meta.url);
const byId = new Map(require(path.join(ROOT, 'src', 'questions.js')).map((q) => [q.id, q]));

const USERS = Number(process.env.USERS) || 50;
const CONCURRENCY = Math.min(USERS, Number(process.env.CONCURRENCY) || USERS);
const RUN = Date.now().toString(36);
const PREFIX = `Carga E2E ${RUN}`;
const PASSWORD = 'clave-carga-1';
const T = 90_000; // timeout holgado por acción: 50 navegadores comparten la CPU

let srv, browser;

before(async () => {
  srv = await startServer({ port: 3940, name: 'carga' });
  browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
});

after(async () => {
  await browser?.close();
  await srv?.stop();
});

const pct = (arr, p) => { if (!arr.length) return NaN; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]; };
const fmt = (n) => (Number.isNaN(n) ? '—' : `${(n / 1000).toFixed(2)} s`);

async function userFlow(i) {
  const desktop = i % 5 === 0; // 1 de cada 5 en escritorio; el resto en celular
  const reduced = i % 2 === 1;
  const name = `${PREFIX} ${String(i + 1).padStart(3, '0')}`;
  const out = { i, name, desktop, reduced, phases: {}, errors: [], done: false, expected: null };
  const ctx = await browser.newContext({
    ...(desktop ? { viewport: { width: 1280, height: 800 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }),
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  page.on('pageerror', (e) => out.errors.push(`pageerror: ${e.message}`));
  // 401 (sesión cerrada) y 409 (nombre repetido) son respuestas esperadas de la API, no errores de la página.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.* (400|401|409|429) /.test(m.text())) out.errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  let phase = 'inicio';
  const step = async (label, fn) => { phase = label; const t = performance.now(); await fn(); out.phases[label] = performance.now() - t; };

  try {
    await step('1 abrir → ingreso', async () => {
      await page.goto(srv.base + '/');
      await page.waitForURL(/#\/ingresar$/);
      await page.waitForSelector('#authForm');
    });

    await step('2 registro', async () => {
      await page.click('.tab[data-mode="register"]');
      await page.waitForSelector('#authForm input[name=confirm]');
      await page.fill('#authForm input[name=name]', name);
      await page.fill('#authForm input[name=password]', PASSWORD);
      await page.fill('#authForm input[name=confirm]', PASSWORD);
      await page.click('#authForm button[type=submit]');
      await page.waitForURL(/#\/inicio$/);
      await page.waitForSelector('#view section');
    });

    await step('3 capítulo', async () => {
      const target = ['/procedencia', '/tramite', '/comparativo', '/casos'][i % 4];
      await page.locator(`a[data-nav="${target}"]:visible`).first().click();
      await page.waitForURL(new RegExp(`#${target}$`));
      await page.waitForSelector('#view section');
      // Lee un poco: desplazarse dispara las animaciones de entrada de la sección.
      for (let k = 1; k <= 3; k++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
    });

    let attempt;
    await step('4 reparto', async () => {
      await page.locator('a[data-nav="/evaluacion"]:visible').first().click();
      await page.waitForURL(/#\/evaluacion$/);
      await page.waitForSelector('#spinBtn');
      const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/eval/spin')), page.click('#spinBtn')]);
      attempt = (await res.json()).attempt;
      await page.waitForSelector('#startQuiz');
      assert.equal(await page.locator('.folder.chosen').count(), 1);
    });

    await step('5 cuestionario', async () => {
      await page.click('#startQuiz');
      let correct = 0;
      for (const [k, q] of attempt.questions.entries()) {
        await page.waitForFunction((n) => document.querySelector('.qdot.current')?.textContent.trim() === String(n), k + 1);
        const real = byId.get(q.id);
        const right = Math.random() < 0.65;
        const pick = right ? real.answer : (real.answer + 1 + Math.floor(Math.random() * (real.options.length - 1))) % real.options.length;
        if (pick === real.answer) correct++;
        await page.locator('.option').nth(pick).click();
        await page.waitForFunction((n) => document.querySelectorAll('.qdot.answered').length >= n, k + 1);
      }
      out.expected = { correct, n: attempt.questions.length, bonus: attempt.bonus };
    });

    await step('6 envío → sentencia', async () => {
      await page.click('#submitQ');
      await page.waitForSelector('.sentence .stamp');
      // Las soluciones siguen ocultas mientras la clase presenta: solo la nota y el aviso.
      await page.waitForSelector('#checkSolutions');
      assert.equal(await page.locator('.review-item').count(), 0, 'se ven las soluciones antes de que la docente las publique');
    });

    await step('7 cerrar sesión', async () => {
      await page.click('#userBtn');
      await page.waitForSelector('#userMenu #logoutBtn', { state: 'visible' });
      await page.click('#logoutBtn');
      await page.waitForURL(/#\/ingresar$/);
      await page.goto(srv.base + '/#/inicio');
      await page.waitForURL(/#\/ingresar$/);
      const me = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
      assert.equal(me.user, null, 'la sesión sigue activa tras cerrar sesión');
    });
    out.done = true;
  } catch (e) {
    // Primera línea y las últimas del registro de Playwright: dicen por qué no se pudo hacer clic.
    const lines = e.message.split('\n').map((l) => l.trim()).filter(Boolean);
    out.errors.push(`fase «${phase}»: ${[lines[0], ...[...new Set(lines.slice(1))].slice(-6)].join(' ⏎ ')}`);
    try { await page.screenshot({ path: path.join(ROOT, 'tests', '.tmp', `carga-${RUN}-${i + 1}.png`) }); } catch { /* sin captura */ }
  } finally {
    await ctx.close().catch(() => {});
  }
  return out;
}

// Ejecuta `n` tareas con a lo sumo `limit` en paralelo.
async function pool(n, limit, fn) {
  const results = new Array(n); let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < n) { const i = next++; results[i] = await fn(i); } }));
  return results;
}

test(`${USERS} estudiantes usan la app al mismo tiempo (concurrencia ${CONCURRENCY})`, { timeout: 30 * 60_000 }, async () => {
  const t0 = performance.now();
  const results = await pool(USERS, CONCURRENCY, userFlow);
  const total = performance.now() - t0;

  // --- Resumen por fase ---
  const labels = [...new Set(results.flatMap((r) => Object.keys(r.phases)))].sort();
  console.table(labels.map((l) => {
    const v = results.map((r) => r.phases[l]).filter((x) => x != null);
    return { fase: l, usuarios: v.length, p50: fmt(pct(v, 50)), p95: fmt(pct(v, 95)), máx: fmt(v.length ? Math.max(...v) : NaN) };
  }));
  const group = (f) => results.filter(f).map((r) => Object.values(r.phases).reduce((a, b) => a + b, 0));
  console.table([
    { grupo: 'celular', usuarios: results.filter((r) => !r.desktop).length, 'p50 total': fmt(pct(group((r) => !r.desktop && r.done), 50)) },
    { grupo: 'escritorio', usuarios: results.filter((r) => r.desktop).length, 'p50 total': fmt(pct(group((r) => r.desktop && r.done), 50)) },
    { grupo: 'con animaciones', usuarios: results.filter((r) => !r.reduced).length, 'p50 total': fmt(pct(group((r) => !r.reduced && r.done), 50)) },
    { grupo: 'movimiento reducido', usuarios: results.filter((r) => r.reduced).length, 'p50 total': fmt(pct(group((r) => r.reduced && r.done), 50)) },
  ]);
  const finished = results.filter((r) => r.done).length;
  console.log(`Duración total: ${(total / 1000).toFixed(1)} s · terminaron ${finished}/${USERS}`);
  const failed = results.filter((r) => r.errors.length);
  for (const r of failed) console.log(`✖ ${r.name} (${r.desktop ? 'escritorio' : 'celular'}, ${r.reduced ? 'movimiento reducido' : 'con animaciones'}):\n   ${r.errors.slice(0, 5).join('\n   ')}`);

  // --- Verificación en el servidor ---
  const admin = new Client(srv.base);
  assert.equal((await admin.login(ADMIN.name, ADMIN.password)).status, 200);
  const { data } = await admin.get('/api/admin/overview');
  const mine = new Map(data.students.filter((s) => s.name.startsWith(PREFIX)).map((s) => [s.name, s]));
  const graded = [...mine.values()].filter((s) => s.status === 'done').length;
  console.log(`Evaluaciones guardadas: ${graded}/${USERS}`);
  const wrongScore = [];
  for (const r of results.filter((x) => x.done)) {
    const row = mine.get(r.name);
    if (!row || row.correct !== r.expected.correct) wrongScore.push(`${r.name}: esperaba ${r.expected.correct} aciertos, guardó ${row?.correct}`);
    const score = Math.min(5, Math.round(((r.expected.correct / r.expected.n) * 5 + r.expected.bonus) * 10) / 10);
    if (row && row.score !== score) wrongScore.push(`${r.name}: nota ${row.score} ≠ ${score}`);
  }
  // --- La docente publica las soluciones y una muestra de estudiantes vuelve a entrar a verlas ---
  assert.deepEqual((await admin.post('/api/admin/solutions', { published: true })).data, { solutionsPublished: true });
  const sample = results.filter((r) => r.done).slice(0, Math.min(5, USERS));
  const sampleErrors = [];
  await Promise.all(sample.map(async (r) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(T);
    try {
      await page.goto(srv.base + '/#/ingresar');
      await page.fill('#authForm input[name=name]', r.name);
      await page.fill('#authForm input[name=password]', PASSWORD);
      await page.click('#authForm button[type=submit]');
      await page.waitForURL(/#\/inicio$/);
      await page.goto(srv.base + '/#/evaluacion');
      await page.waitForSelector('.sentence .stamp');
      await page.waitForFunction((n) => document.querySelectorAll('.review-item').length === n, r.expected.n);
    } catch (e) { sampleErrors.push(`${r.name}: ${e.message.split('\n')[0]}`); } finally { await ctx.close().catch(() => {}); }
  }));
  console.log(`Ven las soluciones publicadas: ${sample.length - sampleErrors.length}/${sample.length}`);

  const csv = (await admin.get('/api/admin/export.csv')).data;
  const csvRows = String(csv).split('\r\n').filter((l) => l.includes(PREFIX)).length;
  console.log(`Filas en el CSV: ${csvRows}/${USERS}`);

  assert.deepEqual(failed.map((r) => `${r.name}: ${r.errors.join(' | ')}`), [], 'hubo errores de JavaScript o usuarios que no terminaron');
  assert.equal(finished, USERS);
  assert.equal(graded, USERS, 'no todas las evaluaciones quedaron guardadas');
  assert.deepEqual(wrongScore, [], 'la nota guardada no coincide con las respuestas dadas en el navegador');
  assert.equal(csvRows, USERS, 'el CSV no tiene una fila por estudiante');
  assert.deepEqual(sampleErrors, [], 'tras publicar las soluciones, algunos estudiantes no las ven');
  assert.ok(srv.alive, 'el servidor se cayó');
  assert.ok(!/Error|SQLITE_BUSY/i.test(srv.output), `el servidor registró errores:\n${srv.output}`);
});
