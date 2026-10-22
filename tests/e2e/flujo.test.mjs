// Pruebas de extremo a extremo con Playwright: estudiantes y administradora usan la app real.
// Requiere `npm install` (devDependency playwright) y el navegador Chromium de Playwright
// (`npx playwright install chromium` si no está descargado).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { startServer, ADMIN } from '../helpers.mjs';

const PASSWORD = 'clave-e2e-1';
const RUN = Date.now().toString(36);
const STUDENT = `Estudiante E2E ${RUN}`;
const CHAPTERS = ['inicio', 'procedencia', 'tramite', 'comparativo', 'casos'];
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const pageErrors = [];
let seq = 0;

let srv, browser;

function watch(page, who) {
  page.on('pageerror', (e) => pageErrors.push(`[${who}] ${e.message}`));
  // 400/401/409/429 (nombre inválido, login fallido o sesión vencida, nombre repetido, bloqueo) son respuestas
  // esperadas de la API, no errores de la página.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.* (400|401|409|429) /.test(m.text())) pageErrors.push(`[${who}] console: ${m.text()}`); });
  // Confirmaciones de enviar / reiniciar / publicar. Un alert() sería código inyectado: se registra como error.
  page.on('dialog', (d) => { if (d.type() === 'alert') pageErrors.push(`[${who}] alert inesperado: ${d.message()}`); d.accept(); });
  return page;
}

async function loginAs(page, name, password = PASSWORD) {
  await page.goto(`${srv.base}/#/ingresar`);
  await page.waitForSelector('#authForm');
  await page.fill('#authForm input[name=name]', name);
  await page.fill('#authForm input[name=password]', password);
  await page.click('#authForm button[type=submit]');
}

// Reparto + cuestionario completo (respondiendo con el teclado) + envío; deja la sentencia en pantalla.
async function finishEval(page) {
  await goto(page, 'evaluacion');
  await page.click('#spinBtn');
  await page.click('#startQuiz');
  const n = (await page.$$('.qdot')).length;
  for (let i = 0; i < n; i++) {
    await page.waitForFunction((k) => document.querySelector('.qdot.current')?.textContent.trim() === String(k), i + 1);
    const type = await page.$eval('.q-type', (e) => e.textContent);
    await page.keyboard.press(/múltiple/i.test(type) ? 'B' : '2');
    await page.waitForFunction((k) => document.querySelectorAll('.qdot.answered').length >= k, i + 1);
  }
  await page.click('#submitQ');
  await page.waitForSelector('.sentence .stamp');
  return n;
}

async function setSolutions(published) {
  const login = await fetch(`${srv.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) });
  const sid = login.headers.getSetCookie().map((c) => c.match(/^sid=([^;]*)/)?.[1]).find(Boolean);
  const r = await fetch(`${srv.base}/api/admin/solutions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `sid=${sid}` }, body: JSON.stringify({ published }) });
  assert.equal(r.status, 200);
}

async function newPage(opts = {}, who = 'estudiante') {
  const ctx = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce', acceptDownloads: true, ...opts });
  return watch(await ctx.newPage(), who);
}

// Espera a que el router termine de dibujar la sección (evento `view:rendered`).
async function goto(page, section) {
  const done = page.evaluate((s) => new Promise((r) => document.addEventListener('view:rendered', (e) => { if (e.detail?.section === s) r(); })), section);
  await page.goto(`${srv.base}/#/${section}`);
  await Promise.race([done, page.waitForTimeout(8000)]);
}

async function register(page, name = `Estudiante ${RUN} ${++seq}`) {
  await page.goto(`${srv.base}/#/registro`);
  await page.waitForSelector('#authForm input[name=confirm]');
  await page.fill('#authForm input[name=name]', name);
  await page.fill('#authForm input[name=password]', PASSWORD);
  await page.fill('#authForm input[name=confirm]', PASSWORD);
  await page.click('#authForm button[type=submit]');
  return name;
}

async function logout(page) {
  await page.click('#userBtn');
  await page.waitForSelector('#userMenu #logoutBtn', { state: 'visible' });
  await page.click('#logoutBtn');
  await page.waitForURL(/#\/ingresar$/);
}

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

before(async () => {
  srv = await startServer({ port: 3930, name: 'e2e' });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await srv?.stop();
});

test('sin sesión, toda ruta lleva al ingreso', async () => {
  const page = await newPage({}, 'sin sesión');
  await page.goto(`${srv.base}/`);
  await page.waitForURL(/#\/ingresar$/);
  for (const s of [...CHAPTERS, 'evaluacion', 'admin', 'no-existe']) {
    await page.goto(`${srv.base}/#/${s}`);
    await page.waitForURL(/#\/ingresar$/);
  }
  assert.equal(await page.$('#deck'), null, 'el modo exposición debería haberse eliminado');
  assert.equal(await page.isVisible('#userBtn'), false, 'sin sesión no debe verse el menú de usuario');
});

test('la validación del formulario muestra errores', async () => {
  const page = await newPage({}, 'validación');
  await page.goto(`${srv.base}/#/registro`);
  await page.fill('#authForm input[name=name]', 'Nombre Prueba');
  await page.fill('#authForm input[name=password]', 'abcd');
  await page.fill('#authForm input[name=confirm]', 'abce');
  await page.click('#authForm button[type=submit]');
  await page.waitForFunction(() => /no coinciden/.test(document.querySelector('#authError').textContent));
  await page.click('.tab[data-mode="login"]');
  await page.waitForURL(/#\/ingresar$/);
  // El cambio de hash precede al nuevo dibujo: hay que esperar a que desaparezca el formulario de registro.
  await page.waitForSelector('#authForm input[name=confirm]', { state: 'detached' });
  await page.fill('#authForm input[name=name]', 'Nadie Registrado');
  await page.fill('#authForm input[name=password]', 'clave-mala');
  await page.click('#authForm button[type=submit]');
  await page.waitForFunction(() => /incorrectos/.test(document.querySelector('#authError').textContent));
});

test('tras el registro se entra al inicio y se navega por los capítulos', async () => {
  const page = await newPage({}, 'capítulos');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  for (const c of CHAPTERS.slice(1)) {
    await page.locator(`a[data-nav="/${c}"]:visible`).first().click();
    await page.waitForURL(new RegExp(`#/${c}$`));
    await page.waitForSelector('#view section');
  }
  assert.equal(await page.$('#deck'), null);
});

test('al iniciar sesión se vuelve a la ruta que se intentó abrir', async () => {
  const page = await newPage({}, 'redirección');
  const name = await register(page);
  await page.waitForURL(/#\/inicio$/);
  await logout(page);
  await page.goto(`${srv.base}/#/evaluacion`);
  await page.waitForURL(/#\/ingresar$/);
  await page.fill('#authForm input[name=name]', name);
  await page.fill('#authForm input[name=password]', PASSWORD);
  await page.click('#authForm button[type=submit]');
  await page.waitForURL(/#\/evaluacion$/);
});

test('interacciones: rasgos, regla práctica, comparación y casos', async () => {
  const page = await newPage({}, 'interacciones');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  await page.waitForSelector('#noteNext');
  for (let i = 0; i < 5; i++) await page.click('#noteNext');
  assert.equal(await page.textContent('#noteCount'), '5/5');
  assert.equal((await page.$$('.note.shown')).length, 5);

  await goto(page, 'procedencia');
  await page.waitForSelector('.rule');
  for (const li of await page.$$('.rule')) await (await li.$('button[data-v="1"]')).click();
  assert.match(await page.textContent('#ruleVerdict'), /Puede prosperar/);
  await (await page.$('.rule button[data-v="0"]')).click();
  assert.match(await page.textContent('#ruleVerdict'), /fracasará/);

  await goto(page, 'comparativo');
  await page.click('#cmpChips .chip[data-k="popular"]');
  await page.waitForSelector('#cmpChips .chip[data-k="popular"].on');
  const acc = page.locator('.acc-item').first();
  await acc.locator('button').first().click();
  await page.waitForFunction(() => document.querySelector('.acc-item')?.classList.contains('open'));

  await goto(page, 'casos');
  await page.click('#caseBox .vbtn[data-v="0"]'); // caso 1: procede
  await page.waitForSelector('.case-result .stamp.ok');
  await page.click('#caseNext');
  await page.click('#caseBox .vbtn[data-v="0"]'); // caso 2: improcedente (se responde mal a propósito)
  await page.waitForSelector('.case-result .stamp.bad');
  assert.match(await page.textContent('#caseScore'), /1\/2/);
});

test('estudiante: reparto, cuestionario con teclado y sentencia', async () => {
  const page = await newPage();
  await register(page, STUDENT);
  await page.waitForURL(/#\/inicio$/);
  await goto(page, 'evaluacion');

  await page.click('#spinBtn');
  await page.waitForSelector('#startQuiz');
  assert.equal((await page.$$('.folder.chosen')).length, 1);
  assert.equal(await page.isVisible('#spinBtn'), false);
  await page.click('#startQuiz');

  const n = (await page.$$('.qdot')).length;
  assert.ok(n >= 5);
  for (let i = 0; i < n; i++) {
    await page.waitForFunction((k) => document.querySelector('.qdot.current')?.textContent.trim() === String(k), i + 1);
    const type = await page.$eval('.q-type', (e) => e.textContent);
    await page.keyboard.press(/múltiple/i.test(type) ? 'A' : '1');
    await page.waitForFunction((k) => document.querySelectorAll('.qdot.answered').length >= k, i + 1);
  }
  // Navegación hacia atrás y adelante sin perder respuestas.
  await page.click('#prevQ');
  await page.waitForFunction((k) => document.querySelector('.qdot.current')?.textContent.trim() === String(k), n - 1);
  await page.click('#nextQ');
  await page.click('#submitQ');
  await page.waitForSelector('.sentence .stamp');
  // Mientras la docente no publique las soluciones, solo se ven la nota y el aviso.
  await page.waitForSelector('#checkSolutions');
  assert.equal(await page.$$eval('.review-item', (items) => items.length), 0);
  assert.match(await page.textContent('.sentence'), new RegExp(`de ${n}`));

  // Al volver, la sentencia sigue ahí: no se puede repartir de nuevo.
  await goto(page, 'inicio');
  await goto(page, 'evaluacion');
  await page.waitForSelector('.sentence');
});

// Regresión: un efecto :hover que desplaza el botón hace que, con el puntero en su borde inferior, el botón
// suba, pierda el hover, baje, lo recupere… y tiemble sin parar (en la prueba de carga el toque nunca llegaba).
test('las opciones del cuestionario no tiemblan con el puntero en su borde', async () => {
  const page = await newPage(DESKTOP, 'temblor');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  await goto(page, 'evaluacion');
  await page.click('#spinBtn');
  await page.click('#startQuiz');
  await page.waitForSelector('.option');
  for (const edge of ['bottom', 'top']) {
    const box = await page.locator('.option').first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, edge === 'bottom' ? box.y + box.height - 1 : box.y + 1);
    await page.waitForTimeout(300);
    const ys = await page.evaluate(() => new Promise((resolve) => {
      const el = document.querySelector('.option'); const out = [];
      const tick = () => { out.push(Math.round(el.getBoundingClientRect().y * 10) / 10); if (out.length < 40) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
    }));
    assert.equal(new Set(ys.slice(-20)).size, 1, `la opción se mueve sola con el puntero en el borde ${edge}: ${[...new Set(ys)].join(', ')}`);
  }
});

test('cerrar sesión desde el encabezado en escritorio', async () => {
  const page = await newPage(DESKTOP, 'logout escritorio');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  assert.ok(await page.isVisible('#topbar'));
  // En escritorio la navegación va arriba, dentro del encabezado.
  const nav = await page.locator('a[data-nav]:visible').first().boundingBox();
  assert.ok(nav && nav.y < 120, `la navegación de escritorio no está en el encabezado (y=${nav?.y})`);
  await logout(page);
  await page.goto(`${srv.base}/#/inicio`);
  await page.waitForURL(/#\/ingresar$/);
  assert.equal(await page.isVisible('#userBtn'), false);
});

test('móvil: barra inferior de capítulos y cierre de sesión', async () => {
  const page = await newPage(MOBILE, 'logout móvil');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  assert.ok(await page.isVisible('#tabbar'), 'falta la barra inferior en móvil');
  const box = await page.locator('#tabbar').boundingBox();
  assert.ok(box && box.y + box.height >= 844 - 4, `la barra de capítulos no está abajo (y=${box?.y}, h=${box?.height})`);
  await page.locator('#tabbar a[data-nav="/procedencia"]').click();
  await page.waitForURL(/#\/procedencia$/);
  // Los botones de la barra son cómodos para el dedo (≥ 40 px de alto).
  const heights = await page.$$eval('#tabbar a', (as) => as.map((a) => a.getBoundingClientRect().height));
  assert.ok(heights.every((h) => h >= 40), `botones de la barra muy bajos: ${heights}`);
  await logout(page);
  await page.goto(`${srv.base}/#/casos`);
  await page.waitForURL(/#\/ingresar$/);
});

test('administradora: panel, en vivo, CSV y reinicio', async () => {
  const page = await newPage({}, 'admin');
  await page.goto(`${srv.base}/#/ingresar`);
  await page.fill('#authForm input[name=name]', ADMIN.name);
  await page.fill('#authForm input[name=password]', ADMIN.password);
  await page.click('#authForm button[type=submit]');
  await page.waitForURL(/#\/admin$/);
  await page.waitForSelector('#adminRows tr');
  assert.match(await page.textContent('#adminRows'), new RegExp(STUDENT));
  assert.ok((await page.$$('.hard li')).length > 0, 'faltan las estadísticas por pregunta');

  await page.click('#liveBtn');
  await page.waitForSelector('#liveBtn.on');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('a[href="/api/admin/export.csv"]')]);
  assert.match(download.suggestedFilename(), /\.csv$/);

  await page.fill('#adminSearch', STUDENT);
  await page.click('[data-reset]');
  await page.waitForFunction((name) => [...document.querySelectorAll('#adminRows tr')].some((tr) => tr.textContent.includes(name) && /Sin iniciar/.test(tr.textContent)), STUDENT);
  await logout(page);
});

test('un estudiante no puede abrir el panel admin', async () => {
  const page = await newPage({}, 'no admin');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  await page.goto(`${srv.base}/#/admin`);
  await page.waitForURL(/#\/inicio$/);
  assert.equal(await page.$('#adminRows'), null);
});

test('vista móvil sin desbordes horizontales', async () => {
  const page = await newPage(MOBILE, 'móvil');
  await page.goto(`${srv.base}/#/ingresar`);
  await page.waitForSelector('#authForm');
  assert.ok(await noHorizontalScroll(page), 'ingreso: hay desplazamiento horizontal en móvil');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  for (const c of [...CHAPTERS, 'evaluacion']) {
    await goto(page, c);
    await page.waitForSelector('#view section');
    // Recorre la página entera: algunos desbordes solo aparecen al animar secciones de abajo.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 800) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(40); }
    assert.ok(await noHorizontalScroll(page), `${c}: hay desplazamiento horizontal en móvil`);
  }
});

test('con animaciones: recorrido y evaluación completa sin contenido oculto', async () => {
  const page = await newPage({ ...MOBILE, reducedMotion: 'no-preference' }, 'animaciones');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  for (const c of ['inicio', 'procedencia']) {
    await goto(page, c);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 600) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(60); }
    await page.waitForTimeout(1500); // respaldo de fx.js: nada queda oculto aunque el observador no dispare
    const hidden = await page.evaluate(() => document.querySelectorAll('.fx-pre-type, .fx-pre-drop').length);
    assert.equal(hidden, 0, `${c}: quedó contenido oculto por animaciones`);
  }
  await finishEval(page);
  await page.waitForSelector('#checkSolutions');
});

test('cambio de usuario en el mismo navegador: no queda nada del anterior', async () => {
  const page = await newPage({}, 'cambio de usuario');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  await goto(page, 'casos');
  await page.click('#caseBox .vbtn[data-v="0"]');
  await page.waitForSelector('.case-result');
  await goto(page, 'evaluacion');
  await page.click('#spinBtn');
  await page.click('#startQuiz');
  await page.locator('.option').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.qdot.answered').length === 1);
  const keysA = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cumplir-')));
  assert.ok(keysA.includes('cumplir-casos') && keysA.some((k) => k.startsWith('cumplir-eval-')), `estado local inesperado: ${keysA}`);

  await logout(page);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cumplir-'))), [], 'cerrar sesión no borró el estado local');

  await register(page);
  await page.waitForURL(/#\/inicio$/);
  await goto(page, 'casos');
  assert.match(await page.textContent('#caseScore'), /sin nota/i, 'la segunda persona ve la práctica de la primera');

  // Si al cargar hay estado de otro usuario (p. ej. la sesión anterior venció sin cerrar), también se borra.
  await page.evaluate(() => { localStorage.setItem('cumplir-owner', '999999'); localStorage.setItem('cumplir-casos', JSON.stringify({ 0: 0 })); });
  await page.reload();
  await page.waitForSelector('#caseScore');
  assert.match(await page.textContent('#caseScore'), /sin nota/i);
});

test('las soluciones se ven solo cuando la docente las publica', async () => {
  const page = await newPage({}, 'soluciones');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  const n = await finishEval(page);
  await page.waitForSelector('#checkSolutions');
  assert.equal(await page.$$eval('.review-item', (els) => els.length), 0);
  const leaked = await page.evaluate(() => fetch('/api/eval/status').then((r) => r.json()));
  assert.ok(leaked.attempt.questions.every((q) => q.answer === undefined && q.explain === undefined), 'la API filtra las respuestas antes de publicar');

  await page.click('#checkSolutions');
  await page.waitForFunction(() => /todavía no/.test(document.querySelector('#toast').textContent));
  await setSolutions(true);
  await page.click('#checkSolutions');
  await page.waitForFunction((k) => document.querySelectorAll('.review-item').length === k, n);
  assert.ok(await page.isVisible('.review-item .explain'));
  await setSolutions(false);
});

test('modo en vivo: actualiza los datos sin re-animar ni perder el foco', async () => {
  const page = await newPage({ reducedMotion: 'no-preference' }, 'en vivo');
  await loginAs(page, ADMIN.name, ADMIN.password);
  await page.waitForURL(/#\/admin$/);
  await page.waitForSelector('#adminRows [data-reset]');
  assert.ok(await page.isVisible('#solutionsBtn'));
  await page.click('#liveBtn');
  await page.waitForSelector('#liveBtn.on');
  await page.waitForTimeout(1500); // termina la entrada animada del panel
  const before = await page.$eval('#kpis [data-k="total"]', (e) => Number(e.textContent));
  const focused = await page.evaluate(() => {
    window.__kpis = document.querySelector('#kpis');
    const b = document.querySelector('#adminRows [data-reset]'); b.focus();
    return b.dataset.reset;
  });
  // Llega un estudiante nuevo: el siguiente refresco en vivo (cada 5 s) debe pintarlo.
  const r = await fetch(`${srv.base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `En vivo ${RUN}`, password: PASSWORD }) });
  assert.equal(r.status, 201);
  await page.waitForFunction((k) => Number(document.querySelector('#kpis [data-k="total"]').textContent) === k + 1, before, { timeout: 12000 });
  const st = await page.evaluate(() => ({
    same: window.__kpis === document.querySelector('#kpis'),
    anims: [...document.querySelectorAll('#kpis, #kpis *')].flatMap((e) => e.getAnimations()).length,
    focus: document.activeElement?.dataset?.reset,
  }));
  assert.ok(st.same, 'el refresco volvió a dibujar el panel completo');
  assert.equal(st.anims, 0, 'el refresco volvió a animar los indicadores');
  assert.equal(st.focus, focused, 'el refresco quitó el foco del botón');
  await page.click('#liveBtn');
});

test('un nombre con HTML se rechaza y no se ejecuta', async () => {
  const page = await newPage({}, 'nombre html');
  await page.goto(`${srv.base}/#/registro`);
  await page.waitForSelector('#authForm input[name=confirm]');
  await page.fill('#authForm input[name=name]', '<img src=x onerror=alert(1)> Ana');
  await page.fill('#authForm input[name=password]', PASSWORD);
  await page.fill('#authForm input[name=confirm]', PASSWORD);
  await page.click('#authForm button[type=submit]');
  await page.waitForFunction(() => /letras/.test(document.querySelector('#authError').textContent));
  assert.match(page.url(), /#\/registro$/);
});

test('un hash que no es ruta no deja la página en blanco', async () => {
  const page = await newPage({}, 'hash');
  await register(page);
  await page.waitForURL(/#\/inicio$/);
  await page.evaluate(() => { location.hash = 'view'; });
  await page.waitForFunction(() => location.hash === '#/inicio');
  assert.ok((await page.$$('#view section')).length > 0);
  await page.evaluate(() => history.replaceState(null, '', '#view'));
  await page.reload();
  await page.waitForFunction(() => location.hash === '#/inicio' && document.querySelectorAll('#view section').length > 0);
  // "Saltar al contenido" enfoca la vista sin cambiar la ruta.
  await page.focus('.skip-link');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => [location.hash, document.activeElement?.id].join(' ')), '#/inicio view');
});

test('si la sesión vence a mitad de la evaluación, al volver a entrar se retoma', async () => {
  const page = await newPage({}, 'sesión vencida');
  const name = await register(page);
  await page.waitForURL(/#\/inicio$/);
  await goto(page, 'evaluacion');
  await page.click('#spinBtn');
  await page.click('#startQuiz');
  await page.locator('.option').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.qdot.answered').length === 1);
  const db = new DatabaseSync(srv.dbPath);
  db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE name = ?)').run(name);
  db.close();
  await goto(page, 'procedencia'); // sin llamadas a la API: todavía no se nota
  await page.goto(`${srv.base}/#/evaluacion`); // aquí la API responde 401
  await page.waitForURL(/#\/ingresar$/);
  await page.waitForFunction(() => /venció/.test(document.querySelector('#toast').textContent));
  await page.fill('#authForm input[name=name]', name);
  await page.fill('#authForm input[name=password]', PASSWORD);
  await page.click('#authForm button[type=submit]');
  await page.waitForURL(/#\/evaluacion$/);
  await page.click('#startQuiz');
  await page.waitForFunction(() => document.querySelectorAll('.qdot.answered').length === 1, null, { timeout: 5000 });
});

test('sin errores de JavaScript en ninguna página', () => {
  assert.deepEqual(pageErrors, []);
});
