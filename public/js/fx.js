/* fx.js — animaciones inspiradas en untold.site, sin dependencias.
   Se engancha a `view:rendered` (lo despacha app.js tras cada vista). Reglas:
   - Solo transform / opacity / clip-path / stroke-dashoffset; nada de layout en scroll.
   - Nunca deja contenido invisible: lo que se oculta antes de animar se muestra igual si el
     IntersectionObserver no dispara (comprobación de respaldo en el scroll y temporizador).
   - prefers-reduced-motion: no se instala nada; app.js ya deja todo en su estado final.
   - No toca lo que anima app.js (.wsplit, .type, .ghost-fg, [data-count]). */
(() => {
  'use strict';

  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (RM) return;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const MOBILE = matchMedia('(max-width: 899px)');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const view = $('#view');
  const EASE = 'cubic-bezier(.23,1,.32,1)';

  // Tareas de la vista actual: se ejecutan al pintar la siguiente.
  let cleanups = [];
  const onLeave = (fn) => cleanups.push(fn);
  const runCleanups = () => { cleanups.forEach((fn) => { try { fn(); } catch { /* ya limpio */ } }); cleanups = []; };

  // ---------------------------------------------------------------------------
  // Disparo al entrar en pantalla, con respaldo: si el IO no llega a disparar (contenedor raro,
  // navegador viejo), el chequeo en el scroll y un temporizador terminan mostrando el contenido.
  // ---------------------------------------------------------------------------
  const pending = new Set();
  let io = null;
  const inView = (el, frac = 0.15) => {
    const r = el.getBoundingClientRect();
    return r.bottom > innerHeight * frac && r.top < innerHeight * (1 - frac) && r.width > 0;
  };
  function whenVisible(el, start, { hide = '', frac = 0.15 } = {}) {
    if (el._fxJob && pending.has(el._fxJob)) return; // ya está en espera
    if (inView(el, 0)) { start(); return; } // ya está en pantalla: sin ocultar nada
    if (hide) el.classList.add(hide);
    const job = { el, frac, run: () => { if (!pending.delete(job)) return; io?.unobserve(el); if (hide) el.classList.remove(hide); start(); } };
    el._fxJob = job;
    pending.add(job);
    io?.observe(el);
  }
  function setupIO() {
    io?.disconnect();
    io = 'IntersectionObserver' in window
      ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target._fxJob?.run(); }), { threshold: 0.12 })
      : null;
  }
  let checkQueued = false;
  function checkPending() {
    checkQueued = false;
    pending.forEach((j) => { if (!j.el.isConnected) pending.delete(j); else if (inView(j.el, 0)) j.run(); });
  }
  addEventListener('scroll', () => { if (pending.size && !checkQueued) { checkQueued = true; requestAnimationFrame(checkPending); } }, { passive: true });

  // ---------------------------------------------------------------------------
  // P3 · Títulos que se escriben con caret ([data-fx="type"])
  // ---------------------------------------------------------------------------
  function typeHeading(el) {
    if (el.dataset.fxDone) return;
    el.dataset.fxDone = '1';
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    el.setAttribute('aria-label', text);
    el.style.minHeight = el.offsetHeight + 'px';
    const out = document.createElement('span'); out.setAttribute('aria-hidden', 'true');
    const caret = document.createElement('i'); caret.className = 'caret fx-caret';
    el.replaceChildren(out, caret);
    const per = clamp(700 / text.length, 18, 45);
    const t0 = performance.now();
    const step = (now) => {
      if (!el.isConnected) return;
      const n = Math.min(text.length, Math.floor((now - t0) / per) + 1);
      out.textContent = text.slice(0, n);
      if (n < text.length) requestAnimationFrame(step);
      else { el.style.minHeight = ''; setTimeout(() => caret.remove(), 1500); }
    };
    requestAnimationFrame(step);
  }

  // Palabra rotativa: escribe, espera, borra y pasa a la siguiente; solo corre en pantalla.
  function rotator(el) {
    const words = el.dataset.fxWords.split('|');
    el.setAttribute('aria-label', words.join(', '));
    const out = document.createElement('span'); out.setAttribute('aria-hidden', 'true'); out.textContent = words[0];
    const caret = document.createElement('i'); caret.className = 'caret fx-caret';
    el.replaceChildren(out, caret);
    let k = 0; let timer = null; let visible = false; let busy = false;
    const sleep = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });
    async function loop() {
      if (busy) return; busy = true;
      while (visible && el.isConnected) {
        await sleep(1600);
        if (!visible) break;
        for (let w = out.textContent; w.length; w = w.slice(0, -1)) { out.textContent = w.slice(0, -1); await sleep(26); }
        k = (k + 1) % words.length;
        for (let i = 1; i <= words[k].length; i++) { out.textContent = words[k].slice(0, i); await sleep(48); }
      }
      busy = false;
    }
    const obs = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); });
    obs.observe(el);
    onLeave(() => { obs.disconnect(); visible = false; clearTimeout(timer); });
  }

  // ---------------------------------------------------------------------------
  // P4 · Resaltado tinta que se dibuja detrás de las palabras (<mark>)
  // ---------------------------------------------------------------------------
  function highlight(root) {
    const marks = $$('mark', root).filter((m) => !m.closest('.paper-doc, .tw-hide') && !m.dataset.fx);
    const groups = new Map();
    marks.forEach((m) => { const g = m.closest('p, li, div') || root; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(m); });
    groups.forEach((ms, g) => {
      ms.forEach((m) => { m.dataset.fx = '1'; m.classList.add('fx-mark'); });
      // Dentro de un párrafo que se escribe solo, se espera a que empiece a escribirse.
      const typer = g.closest('.type');
      const go = () => ms.forEach((m, i) => setTimeout(() => m.classList.add('fx-in'), 150 * i + (typer ? 900 : 120)));
      whenVisible(g, go, { frac: 0.2 });
    });
  }

  // ---------------------------------------------------------------------------
  // P5 · Grupos que caen escalonados (lomos, tarjetas, indicadores, despachos)
  // WAAPI con fill "backwards": no queda ningún estilo pegado al terminar.
  // ---------------------------------------------------------------------------
  const DROP = '.spines, .vtabs, .notes-grid, .cards-2, .cards-3, .kpis, .despachos, .steps-row, .concl, .juris, .eval-steps';
  function drops(root) {
    $$(DROP, root).forEach((group) => {
      if (group.dataset.fx) return; group.dataset.fx = '1';
      const items = [...group.children].filter((c) => c.nodeType === 1 && getComputedStyle(c).display !== 'none');
      if (!items.length) return;
      whenVisible(group, () => {
        items.forEach((c, i) => {
          const r = i % 2 ? -1 : 1;
          c.animate([
            { opacity: 0, transform: `translateY(-30px) rotate(${r}deg)` },
            { opacity: 1, transform: 'none' },
          ], { duration: 700, delay: Math.min(i, 8) * 60, easing: EASE, fill: 'backwards' });
        });
      }, { hide: 'fx-pre-drop' });
    });
  }

  // ---------------------------------------------------------------------------
  // P6 · Ilustraciones que se dibujan y "desdibujan" con el scroll (como los Lottie de untold)
  // P7 · Salida del hero / títulos de capítulo palabra a palabra (rotateX ligado al scroll)
  // Un solo listener de scroll + rAF, y solo para los elementos en pantalla.
  // ---------------------------------------------------------------------------
  const SCRUB_SVG = '.ch-ill svg.draw, .ren-ill svg.draw, .hg-ill svg.draw, .burst svg.draw, .stand-ill svg.draw, .desacato-ill svg.draw, .example-ill svg.draw';
  let scrubbers = [];
  let scrubQueued = false;
  // Al pintar una vista, lo que ya está en pantalla se dibuja en ~1,4 s en vez de aparecer de golpe.
  let introT0 = 0;
  const INTRO = 1400;
  const introP = () => clamp((performance.now() - introT0) / INTRO);
  function scrubFrame() {
    scrubQueued = false;
    if (introP() < 1) queueScrub();
    const vh = innerHeight;
    for (const s of scrubbers) {
      const r = s.el.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) continue;
      s.update(r, vh);
    }
  }
  const queueScrub = () => { if (!scrubQueued) { scrubQueued = true; requestAnimationFrame(scrubFrame); } };
  addEventListener('scroll', queueScrub, { passive: true });
  addEventListener('resize', queueScrub);

  function scrubSvg(svgEl) {
    if (svgEl.dataset.fx) return; svgEl.dataset.fx = '1';
    const strokes = $$('path, circle, rect, line, ellipse, polyline', svgEl).filter((p) => !p.classList.contains('fill-o'));
    const fills = $$('.fill-o', svgEl);
    if (!strokes.length) return;
    strokes.forEach((p) => p.setAttribute('pathLength', '1'));
    svgEl.classList.add('fx-scrub');
    const n = strokes.length;
    let last = -1;
    scrubbers.push({
      el: svgEl,
      update(r, vh) {
        // p: 0 cuando el centro entra por abajo (95 % de la ventana), 1 cuando llega al 45 %.
        const p = Math.min(introP(), clamp(((vh * 0.95) - (r.top + r.height / 2)) / (vh * 0.5)));
        if (Math.abs(p - last) < 0.004) return;
        last = p;
        strokes.forEach((s, i) => { s.style.strokeDashoffset = (1 - clamp(p * 1.25 - (i / n) * 0.25)).toFixed(3); });
        fills.forEach((f) => { f.style.transform = `scale(${clamp((p - 0.75) / 0.25).toFixed(3)})`; });
      },
    });
  }

  function heroExit(block) {
    if (block.dataset.fxExit) return; block.dataset.fxExit = '1';
    const words = $$('.wsplit .w', block);
    if (!words.length) return;
    let armed = false;
    // Se espera a que termine la entrada de .wsplit (app.js) para no pisar su transición.
    const arm = setTimeout(() => { armed = true; queueScrub(); }, 1400);
    onLeave(() => clearTimeout(arm));
    const maxRot = MOBILE.matches ? 8 : 14;
    const minOp = MOBILE.matches ? 0.6 : 0.45;
    let last = -1;
    scrubbers.push({
      el: block,
      update(r) {
        if (!armed) return;
        // p: 0 con el bloque arriba del todo, 1 cuando ya subió el 70 % de su alto.
        const p = clamp(-r.top / (r.height * 0.7 || 1));
        if (Math.abs(p - last) < 0.003) return;
        last = p;
        words.forEach((w, k) => {
          const t = clamp(p * 1.4 - k * 0.08);
          w.style.transform = t ? `perspective(600px) translate3d(0, ${(-t * 14).toFixed(1)}px, 0) rotateX(${(t * maxRot).toFixed(2)}deg)` : '';
          w.style.opacity = t ? (1 - t * (1 - minOp)).toFixed(3) : '';
        });
      },
    });
  }

  // ---------------------------------------------------------------------------
  // P8 · Movimiento en reposo: solo mientras está en pantalla (ahorra batería en el celular)
  // ---------------------------------------------------------------------------
  function idle(root) {
    const els = $$('.level-circles, .note-stage, .hero-stack, .next-ch, .ch-nav', root);
    if (!els.length) return;
    const obs = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('fx-idle', e.isIntersecting)));
    els.forEach((e) => obs.observe(e));
    onLeave(() => obs.disconnect());
  }

  // ---------------------------------------------------------------------------
  // P2 · Botones con barrido tinta + caret (hover en escritorio, toque en el celular).
  // Se inyectan dos <span> al primer contacto, porque app.js ya usa ::after (.is-loading).
  // ---------------------------------------------------------------------------
  const BTN = '.btn-o, .btn-line, .vbtn, .chip';
  function prepBtn(b) {
    if (!b || b.disabled || b.querySelector(':scope > .fx-fill')) return;
    const fill = document.createElement('span'); fill.className = 'fx-fill'; fill.setAttribute('aria-hidden', 'true');
    const caret = document.createElement('span'); caret.className = 'fx-bcaret'; caret.setAttribute('aria-hidden', 'true');
    b.classList.add('fx-btn');
    b.prepend(fill); b.append(caret);
  }
  document.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') prepBtn(e.target.closest?.(BTN)); }, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.(BTN);
    if (!b || e.pointerType === 'mouse') return;
    prepBtn(b);
    b.classList.add('fx-press');
    const off = () => { setTimeout(() => b.classList.remove('fx-press'), 160); removeEventListener('pointerup', off); removeEventListener('pointercancel', off); };
    addEventListener('pointerup', off); addEventListener('pointercancel', off);
  }, { passive: true });

  // ---------------------------------------------------------------------------
  // P9 · Encabezado: reescritura de etiquetas en hover (escritorio) e indicador deslizante (móvil)
  // ---------------------------------------------------------------------------
  function retype(a) {
    const t = a.querySelector('.nav-t');
    if (!t || a._fxTyping) return;
    const full = t.dataset.full || (t.dataset.full = t.textContent);
    a._fxTyping = true;
    t.style.minWidth = t.offsetWidth + 'px';
    let i = full.length;
    const back = setInterval(() => {
      t.textContent = full.slice(0, --i) || '​';
      if (i <= 1) {
        clearInterval(back);
        let j = 1;
        const fwd = setInterval(() => {
          t.textContent = full.slice(0, ++j);
          if (j >= full.length) { clearInterval(fwd); a._fxTyping = false; t.style.minWidth = ''; }
        }, 34);
      }
    }, 20);
  }
  if (FINE) {
    document.addEventListener('pointerover', (e) => {
      const a = e.target.closest?.('#tabbar a');
      if (a && !MOBILE.matches && !a.contains(e.relatedTarget)) retype(a);
    }, { passive: true });
  }

  let pillX = null;
  function tabPill() {
    const bar = $('#tabbar');
    if (!bar || !bar.children.length) return;
    let pill = $('.fx-pill', bar);
    if (!pill) { pill = document.createElement('span'); pill.className = 'fx-pill'; pill.setAttribute('aria-hidden', 'true'); bar.append(pill); }
    const on = $('a.on', bar);
    bar.classList.toggle('fx-has-pill', !!on && MOBILE.matches);
    if (!on || !MOBILE.matches) { pillX = null; return; }
    const br = bar.getBoundingClientRect(); const r = on.getBoundingClientRect();
    const w = r.width * 0.44; const x = r.left - br.left + (r.width - w) / 2;
    pill.style.width = w + 'px';
    // app.js reescribe la barra en cada vista: la píldora arranca donde estaba y se desliza a la nueva.
    pill.style.transition = 'none';
    pill.style.transform = `translateX(${pillX ?? x}px)`;
    void pill.offsetWidth;
    pill.style.transition = '';
    pill.style.transform = `translateX(${x}px)`;
    pillX = x;
  }
  addEventListener('resize', () => { pillX = null; tabPill(); });
  // ---------------------------------------------------------------------------
  // P10 · Estela de cursor (solo escritorio con mouse): línea naranja que se desvanece
  // ---------------------------------------------------------------------------
  if (FINE) {
    const cv = document.createElement('canvas');
    cv.className = 'fx-trail'; cv.setAttribute('aria-hidden', 'true');
    document.body.append(cv);
    const ctx = cv.getContext('2d');
    const pts = [];
    let running = false;
    const size = () => { const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    size(); addEventListener('resize', size);
    addEventListener('mousemove', (e) => {
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (pts.length > 24) pts.shift();
      if (!running) { running = true; requestAnimationFrame(draw); }
    }, { passive: true });
    function draw(now) {
      while (pts.length && now - pts[0].t > 320) pts.shift();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      // Sin estela sobre el cuestionario ni cuando el puntero se detiene (el bucle se apaga).
      if (pts.length < 2 || document.body.classList.contains('in-quiz')) { pts.length = 0; running = false; return; }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        const a = 1 - (now - pts[i].t) / 320;
        ctx.strokeStyle = `rgba(255, 86, 35, ${(a * 0.85).toFixed(3)})`;
        ctx.lineWidth = 1 + a * 2.2;
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      }
      requestAnimationFrame(draw);
    }
  }

  // ---------------------------------------------------------------------------
  // Orquestación por vista
  // ---------------------------------------------------------------------------
  function run() {
    runCleanups();
    pending.clear();
    scrubbers = [];
    setupIO();
    $$('[data-fx="type"]', view).forEach((el) => whenVisible(el, () => typeHeading(el), { hide: 'fx-pre-type' }));
    $$('[data-fx-words]', view).forEach(rotator);
    highlight(view);
    drops(view);
    $$(SCRUB_SVG, view).forEach(scrubSvg);
    $$('.hero-title, .ch-title', view).forEach(heroExit);
    idle(view);
    tabPill();
    introT0 = performance.now();
    queueScrub();
    // Respaldo final: nada se queda oculto aunque no haya scroll ni IO.
    const safety = setTimeout(checkPending, 1200);
    onLeave(() => clearTimeout(safety));
  }

  // Contenido que app.js vuelve a pintar dentro de la misma vista (casos, comparador, resultados…).
  const mo = new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(mo._t);
    mo._t = setTimeout(() => { highlight(view); drops(view); $$('[data-fx="type"]:not([data-fx-done])', view).forEach((el) => whenVisible(el, () => typeHeading(el), { hide: 'fx-pre-type' })); $$(SCRUB_SVG, view).forEach(scrubSvg); queueScrub(); }, 60);
  });
  mo.observe(view, { childList: true, subtree: true });

  document.addEventListener('view:rendered', run);
  // app.js puede haber pintado la primera vista antes de que este archivo (defer) se ejecutara.
  if (view.children.length) run();
})();
