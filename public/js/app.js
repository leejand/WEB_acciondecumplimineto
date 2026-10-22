/* Acción de cumplimiento · Guía interactiva — SPA sin dependencias (hash routing). */
(() => {
  'use strict';

  document.documentElement.classList.add('js');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dec = (n) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','));
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
  };

  // Estado local (práctica de casos, lista de verificación, respuestas en curso) ligado a quien inició
  // sesión: en un celular compartido, la siguiente persona no ve nada de la anterior.
  const OWNER_KEY = 'cumplir-owner';
  function clearLocal() {
    try { Object.keys(localStorage).filter((k) => k.startsWith('cumplir-')).forEach((k) => localStorage.removeItem(k)); } catch { /* sin almacenamiento */ }
  }
  function claimLocal(user) {
    if (store.get(OWNER_KEY) !== user.id) clearLocal();
    store.set(OWNER_KEY, user.id);
  }

  const state = { user: null, current: null, evalConfig: null, after: null };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Tareas de limpieza de la vista actual (intervalos, observadores): se ejecutan al cambiar de sección.
  const cleanups = [];
  const onLeave = (fn) => cleanups.push(fn);
  const runCleanups = () => { while (cleanups.length) { try { cleanups.pop()(); } catch { /* ya limpio */ } } };

  // ---------------- API ----------------
  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    } catch { throw new Error('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.'); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      // Sesión vencida a mitad: tras volver a entrar se regresa a la misma sección. Las respuestas
      // guardadas del cuestionario se conservan (es la misma persona); solo el cierre explícito las borra.
      if (state.user) toast('Tu sesión venció. Ingresa de nuevo para continuar.', true);
      if (state.current && state.current !== 'ingresar' && state.current !== 'registro') state.after = '/' + state.current;
      state.user = null;
      go('/ingresar');
    }
    if (!res.ok) throw new Error(data.error || 'Ocurrió un error. Intenta de nuevo.');
    return data;
  }

  let toastTimer;
  function toast(msg, isError = false) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('error', isError); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
  }

  const go = (path) => { if (location.hash !== '#' + path) location.hash = path; else route(); };

  // =========================================================
  // ILUSTRACIONES (trazo a mano, se dibujan al entrar en pantalla)
  // =========================================================
  const svg = (vb, body, cls = '') => `<svg class="ill draw ${cls}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const spark = (x, y, r = 12) => `<path class="fill-o" d="M${x} ${y - r} C${x + r * 0.15} ${y - r * 0.25} ${x + r * 0.25} ${y - r * 0.15} ${x + r} ${y} C${x + r * 0.25} ${y + r * 0.15} ${x + r * 0.15} ${y + r * 0.25} ${x} ${y + r} C${x - r * 0.15} ${y + r * 0.25} ${x - r * 0.25} ${y + r * 0.15} ${x - r} ${y} C${x - r * 0.25} ${y - r * 0.15} ${x - r * 0.15} ${y - r * 0.25} ${x} ${y - r} Z"/>`;
  const aster = (x, y, r = 6) => `<path d="M${x - r} ${y} h${2 * r} M${x} ${y - r} v${2 * r} M${x - r * 0.7} ${y - r * 0.7} l${1.4 * r} ${1.4 * r} M${x + r * 0.7} ${y - r * 0.7} l${-1.4 * r} ${1.4 * r}"/>`;
  const diamond = (x, y, r = 6) => `<path d="M${x} ${y - r * 1.6} C${x + 1} ${y - 2} ${x + 2} ${y - 1} ${x + r} ${y} C${x + 2} ${y + 1} ${x + 1} ${y + 2} ${x} ${y + r * 1.6} C${x - 1} ${y + 2} ${x - 2} ${y + 1} ${x - r} ${y} C${x - 2} ${y - 1} ${x - 1} ${y - 2} ${x} ${y - r * 1.6} Z"/>`;
  const clockTicks = () => Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180; const r1 = i % 3 ? 52 : 46; const r2 = 58;
    return `<path d="M${(75 + r1 * Math.sin(a)).toFixed(1)} ${(76 - r1 * Math.cos(a)).toFixed(1)} L${(75 + r2 * Math.sin(a)).toFixed(1)} ${(76 - r2 * Math.cos(a)).toFixed(1)}"/>`;
  }).join('');

  const ILL = {
    door: svg('0 0 150 190', `
      <rect class="fill-o" x="60" y="26" width="52" height="144"/>
      <path d="M58 24 H114 V172"/><path d="M58 24 L30 38 L30 186 L58 172 Z"/><path d="M36 108 l3 0"/>
      <path d="M86 56 C78 55 73 62 75 69 C77 77 90 78 93 70 C96 62 93 56 86 56 Z"/><path d="M80 66 q3 3 7 0"/>
      <path d="M84 78 C82 100 80 118 82 136"/><path d="M82 136 L72 168 L64 170 M82 136 L94 166 L102 168"/>
      <path d="M84 92 C98 86 108 76 120 64"/><path d="M83 94 C72 102 64 112 60 124"/>
      ${aster(118, 14, 6)}${diamond(96, 12, 4)}<circle cx="78" cy="10" r="1.5"/><circle cx="132" cy="34" r="1.5"/>`),
    point: svg('0 0 170 210', `
      <path d="M70 44 C58 43 51 54 55 64 C59 75 77 76 83 66 C89 55 82 44 70 44 Z"/><path d="M63 62 q5 4 10 0"/><path d="M64 54 l2 0 M75 54 l2 0"/>
      <path d="M69 78 C66 104 64 128 66 152"/><path d="M66 152 L54 202 M66 152 L82 202"/>
      <path d="M68 94 C86 84 104 66 118 40"/><path d="M118 40 l5 -10 M118 40 l9 -4"/>
      <path d="M67 98 C54 108 46 120 42 134"/>
      ${spark(140, 22, 13)}${aster(150, 62, 5)}${diamond(20, 30, 5)}`),
    doc: svg('0 0 130 175', `
      <path d="M22 10 L88 8 L108 30 L106 152 L20 154 Z"/><path d="M88 8 L87 31 L108 30"/>
      <path d="M36 52 C56 50 76 53 92 51 M36 70 C54 72 74 68 92 70 M36 88 C52 86 70 90 92 87 M36 106 C48 108 60 104 70 106"/>
      <circle class="fill-o" cx="84" cy="130" r="14"/><path d="M76 142 l-5 16 l9 -5 l6 8 l2 -16"/>`),
    clock: svg('0 0 150 160', `
      <path d="M75 18 C110 16 136 44 135 78 C134 113 107 138 74 137 C40 136 14 109 15 76 C16 42 42 19 75 18 Z"/>
      ${clockTicks()}<path d="M75 76 L75 44 M75 76 L99 90"/><circle class="fill-o" cx="75" cy="76" r="6"/>
      <path d="M60 6 H90 M75 6 V17"/><path d="M128 26 l8 -8 M22 26 l-8 -8"/>`),
    hourglass: svg('0 0 130 180', `
      <path d="M26 16 H100 M26 162 H100"/>
      <path d="M34 16 C34 62 60 72 63 89 C60 106 34 116 34 162 M92 16 C92 62 66 72 63 89 C66 106 92 116 92 162"/>
      <path d="M46 46 C56 60 70 60 80 46"/><path d="M48 150 C56 136 70 136 78 150"/>
      <path class="stroke-o" d="M12 168 L118 8" stroke-width="5"/>`),
    gavel: svg('0 0 170 170', `
      <g transform="rotate(-35 84 64)"><path d="M46 42 H120 V80 H46 Z"/><path d="M58 42 V80 M108 42 V80"/><path d="M83 80 V146"/></g>
      <path d="M28 152 H136 M40 152 V138 H124 V152"/>
      <path d="M22 120 l-10 -6 M28 106 l-12 -2 M36 130 l-8 8"/>${spark(140, 30, 11)}`),
    scales: svg('0 0 160 160', `
      <path d="M80 20 L81 136 M54 138 C68 135 92 135 108 139"/><path d="M27 44 C55 38 105 38 133 45"/>
      <path d="M27 44 L11 88 M27 44 L45 88 M9 88 C17 104 39 104 47 88 Z"/>
      <path d="M133 45 L115 90 M133 45 L151 90 M113 90 C121 106 143 106 151 90 Z"/>
      <circle class="fill-o" cx="80" cy="20" r="7"/>`),
    building: svg('0 0 170 150', `
      <path d="M14 50 L85 12 L156 50 Z"/><path d="M20 56 H150"/>
      <path d="M36 62 V118 M60 62 V118 M85 62 V118 M110 62 V118 M134 62 V118"/>
      <path d="M18 124 H152 M10 136 H160"/><circle class="fill-o" cx="85" cy="36" r="7"/>`),
    park: svg('0 0 170 125', `
      <path d="M42 112 V72"/><path d="M42 74 C20 76 13 52 27 42 C25 24 49 16 59 30 C75 26 82 48 70 58 C72 72 56 78 42 74 Z"/>
      <path d="M84 88 H154 M86 78 H152 M90 88 V112 M148 88 V112 M84 98 H154"/>
      <path d="M6 114 C50 110 112 116 164 112"/>${spark(140, 30, 9)}`),
    knock: svg('0 0 180 200', `
      <path d="M28 14 H108 V190 H28 Z"/><path d="M42 30 H94 V94 H42 Z M42 108 H94 V172 H42 Z"/><circle cx="98" cy="104" r="3"/>
      <path d="M134 74 C125 69 120 78 122 86 C124 97 137 99 143 92 C149 85 145 75 137 76"/>
      <path d="M143 92 C152 104 158 120 162 140"/><path d="M137 76 C140 70 146 70 148 76"/>
      <path d="M116 66 l-8 -6 M114 84 l-10 0 M116 102 l-8 6"/>
      <text class="hand" x="112" y="40">toc, toc</text>`),
    burst: svg('0 0 320 200', `
      ${Array.from({ length: 9 }, (_, i) => { const a = ((200 + i * 17.5) * Math.PI) / 180; return `<path d="M${(160 + 50 * Math.cos(a)).toFixed(1)} ${(185 + 50 * Math.sin(a)).toFixed(1)} L${(160 + (110 + (i % 2) * 30) * Math.cos(a)).toFixed(1)} ${(185 + (110 + (i % 2) * 30) * Math.sin(a)).toFixed(1)}"/>`; }).join('')}
      ${spark(232, 64, 20)}${aster(84, 54, 8)}${diamond(54, 120, 7)}${diamond(270, 130, 6)}${aster(282, 40, 6)}<circle cx="120" cy="30" r="2"/><circle cx="210" cy="20" r="2"/>`),
  };

  // Etiqueta entre paréntesis, al estilo "( ABOUT US )" de la referencia.
  const label = (t) => `<p class="plabel">( ${t} )</p>`;
  const typed = (html, cls = '') => `<p class="type ${cls}">${html}</p>`;
  const colorClass = (c) => `c-${c}`;

  // =========================================================
  // ENCABEZADO, PESTAÑAS Y MENÚ DE USUARIO
  // =========================================================
  const TAB_ICONS = {
    '/inicio': '<path d="M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z"/>',
    '/procedencia': '<path d="M7 3 H15 L19 7 V21 H7 Z"/><path d="M15 3 V7 H19 M10 12 H16 M10 16 H14"/>',
    '/tramite': '<circle cx="12" cy="13" r="8"/><path d="M12 9 V13 L15 15 M9 2 H15"/>',
    '/comparativo': '<path d="M12 3 V21 M5 7 H19 M5 7 L2 14 Q5 17 8 14 Z M19 7 L16 14 Q19 17 22 14 Z"/>',
    '/casos': '<path d="M13 3 L21 11 M10 6 L18 14 M11.5 4.5 L19.5 12.5 M14 10 L4 20"/><path d="M3 21 H12"/>',
    '/evaluacion': '<path d="M5 4 H19 V20 H5 Z"/><path d="M9 9 L11 11 L15 7 M9 15 H15"/>',
    '/admin': '<path d="M5 20 V11 M11 20 V5 M17 20 V14 M3 20 H21"/>',
  };
  // El admin no presenta la evaluación: su última pestaña es el panel de resultados.
  const navItems = () => (state.user?.role === 'admin' ? [...CHAPTERS.slice(0, -1), { n: '06', path: '/admin', title: 'Panel', tab: 'Panel' }] : CHAPTERS);
  const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  function renderChrome() {
    const logged = !!state.user;
    $('#topbar').hidden = !logged;
    document.body.classList.toggle('logged', logged);
    if (!logged) { closeUserMenu(); return; }
    const here = '/' + state.current;
    $('#tabbar').innerHTML = navItems().map((c) => `
      <a href="#${c.path}" data-nav="${c.path}" class="${c.path === '/evaluacion' || c.path === '/admin' ? 'nav-eval' : ''}${here === c.path ? ' on' : ''}"${here === c.path ? ' aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[c.path] || ''}</svg>
        <span class="nav-n" aria-hidden="true">${c.n}</span><span class="nav-t">${esc(c.tab || c.short)}</span>
      </a>`).join('');
    const cur = navItems().find((c) => c.path === here);
    $('#topChapter').textContent = cur ? cur.title : '';
    $('#userInitials').textContent = initials(state.user.name);
    $('#userFirst').textContent = state.user.name.split(' ')[0];
    $('#userBtn').setAttribute('aria-label', `Cuenta de ${state.user.name}`);
    const isAdmin = state.user.role === 'admin';
    $('#userMenu').innerHTML = `
      <div class="um-head"><span class="avatar big" aria-hidden="true">${esc(initials(state.user.name))}</span><div><b>${esc(state.user.name)}</b><small>${isAdmin ? 'Administración' : 'Estudiante'}</small></div></div>
      <a href="#/${isAdmin ? 'admin' : 'evaluacion'}">${isAdmin ? 'Panel de resultados' : 'Mi evaluación'}</a>
      <a href="#/inicio">Ir al inicio</a>
      <button class="um-logout" id="logoutBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5 H5 V19 H10 M14 8 L18 12 L14 16 M18 12 H9"/></svg><span>Cerrar sesión</span></button>`;
    $('#logoutBtn').addEventListener('click', logout);
  }

  async function logout() {
    const btn = $('#logoutBtn');
    if (btn) { btn.disabled = true; $('span', btn).textContent = 'Cerrando sesión…'; }
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null; state.after = null; state.evalConfig = null;
    clearLocal();
    closeUserMenu();
    toast('Sesión cerrada. ¡Hasta pronto!');
    go('/ingresar');
  }

  function openUserMenu() { $('#userMenu').hidden = false; $('#userBtn').setAttribute('aria-expanded', 'true'); $('#userMenu a')?.focus({ preventScroll: true }); }
  function closeUserMenu() { $('#userMenu').hidden = true; $('#userBtn').setAttribute('aria-expanded', 'false'); }
  $('#userBtn').addEventListener('click', (e) => { e.stopPropagation(); if ($('#userMenu').hidden) openUserMenu(); else closeUserMenu(); });
  document.addEventListener('click', (e) => { if (!$('#userMenu').hidden && !e.target.closest('.user')) closeUserMenu(); });
  $('#userMenu').addEventListener('click', (e) => { if (e.target.closest('a')) closeUserMenu(); });
  // Con Tab, al salir del menú se cierra. (Sin relatedTarget es un clic: lo resuelve el listener de arriba;
  // así un toque en Safari, que no enfoca botones, no cierra el menú antes de que llegue el clic.)
  $('.user').addEventListener('focusout', (e) => { if (!$('#userMenu').hidden && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) closeUserMenu(); });
  // El enlace "Saltar al contenido" enfoca la vista sin cambiar el hash (el hash es la ruta).
  $('.skip-link').addEventListener('click', (e) => { e.preventDefault(); view.focus(); });

  // Encabezado con fondo al bajar, barra de progreso de lectura y botón "volver arriba".
  function onScrollChrome() {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('#topbar').classList.toggle('scrolled', scrollY > 20);
    $('#readProgress').style.transform = `scaleX(${max > 0 ? clamp(scrollY / max, 0, 1) : 0})`;
    $('#toTop').hidden = !state.user || scrollY < innerHeight * 1.5;
  }
  addEventListener('scroll', onScrollChrome, { passive: true });
  addEventListener('resize', onScrollChrome);
  $('#toTop').addEventListener('click', () => scrollToY(0));

  // =========================================================
  // EFECTOS
  // =========================================================

  // --- Scroll suave con inercia (equivalente a Lenis, lerp 0.1) ---
  const smooth = { cur: 0, target: 0, last: 0, active: false, enabled: finePointer && !reduceMotion };
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  // ¿Hay un contenedor bajo el puntero que todavía puede desplazarse en vertical? Entonces la rueda es suya.
  function innerScrollsY(el, dy) {
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
      }
    }
    return false;
  }
  window.addEventListener('wheel', (e) => {
    if (!smooth.enabled || e.ctrlKey || e.shiftKey) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (e.target.closest('[data-native-scroll]') || innerScrollsY(e.target, e.deltaY)) return;
    e.preventDefault();
    if (!smooth.active) { smooth.cur = scrollY; smooth.target = scrollY; smooth.last = scrollY; }
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    smooth.target = clamp(smooth.target + d, 0, maxScroll());
    smooth.active = true;
    kick();
  }, { passive: false });
  function scrollToY(y, instant = false) {
    y = clamp(y, 0, maxScroll());
    if (instant || reduceMotion) { smooth.active = false; window.scrollTo(0, y); return; }
    if (!smooth.active) { smooth.cur = scrollY; smooth.last = scrollY; }
    smooth.target = y; smooth.active = true;
    kick();
  }
  const scrollToEl = (el, offset = 0) => el && scrollToY(el.getBoundingClientRect().top + scrollY - offset);

  // --- Cursor: punto naranja que crece sobre enlaces y muestra etiquetas ---
  const cursor = { el: $('#cursor'), label: $('#cursorLabel'), x: -100, y: -100, cx: -100, cy: -100 };
  if (finePointer) {
    document.body.classList.add('has-cursor');
    addEventListener('mousemove', (e) => { cursor.x = e.clientX; cursor.y = e.clientY; cursor.el.classList.remove('hidden'); }, { passive: true });
    document.addEventListener('mouseleave', () => cursor.el.classList.add('hidden'));
    document.addEventListener('mouseover', (e) => {
      const lab = e.target.closest('[data-cursor]');
      const link = e.target.closest('a, button, [role=button], input, label, .note-stage');
      cursor.el.classList.toggle('has-label', !!lab);
      cursor.el.classList.toggle('is-larger', !lab && !!link);
      if (lab) cursor.label.textContent = lab.dataset.cursor;
    });
  }

  // --- Títulos que suben palabra por palabra desde una máscara ---
  function splitWords(root) {
    $$('.wsplit', root).forEach((el) => {
      if (el.dataset.splitDone) return;
      el.dataset.splitDone = '1';
      let w = 0;
      [...el.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const outer = document.createElement('span'); outer.className = 'w';
            const inner = document.createElement('span'); inner.className = 'wi'; inner.style.setProperty('--w', w++); inner.textContent = part;
            outer.appendChild(inner); frag.appendChild(outer);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') { n.classList.add('w-el'); n.style.setProperty('--w', w++); }
      });
    });
  }

  // --- Máquina de escribir con cursor "|" (respeta el marcado interno: <b>, <mark>…) ---
  function typewrite(el) {
    if (el.dataset.typed) return;
    el.dataset.typed = '1';
    el.classList.add('typing');
    if (reduceMotion) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    const texts = nodes.map((n) => n.textContent);
    const total = texts.reduce((a, t) => a + t.length, 0);
    if (!total) return;
    if (!el.classList.contains('ghost-fg')) el.style.minHeight = el.offsetHeight + 'px';
    const hidden = $$('*', el); hidden.forEach((e) => e.classList.add('tw-hide'));
    nodes.forEach((n) => { n.textContent = ''; });
    const caret = document.createElement('i'); caret.className = 'caret';
    const perChar = clamp((el.dataset.typeMs ? +el.dataset.typeMs : 1700) / total, 7, 40);
    let k = 0; let done = 0; const t0 = performance.now();
    const unhide = (n) => { for (let p = n.parentElement; p && p !== el; p = p.parentElement) p.classList.remove('tw-hide'); };
    const step = (now) => {
      if (!el.isConnected) return;
      const want = Math.min(total, Math.floor((now - t0) / perChar));
      while (done < want && k < nodes.length) {
        const n = nodes[k]; unhide(n);
        const take = Math.min(texts[k].length - n.textContent.length, want - done);
        n.textContent = texts[k].slice(0, n.textContent.length + take); done += take;
        n.parentNode.insertBefore(caret, n.nextSibling);
        if (n.textContent.length >= texts[k].length) k++;
      }
      if (done < total) requestAnimationFrame(step);
      else { hidden.forEach((e) => e.classList.remove('tw-hide')); el.style.minHeight = ''; setTimeout(() => caret.remove(), 2200); }
    };
    requestAnimationFrame(step);
  }

  // --- Ilustraciones que se dibujan solas ---
  function prepDraw(root) {
    $$('svg.draw', root).forEach((s) => {
      if (s.dataset.prepped) return; s.dataset.prepped = '1';
      $$('path, circle, rect, line, ellipse, polyline', s).forEach((p, i) => {
        if (p.classList.contains('fill-o')) { p.style.setProperty('--d', i); return; }
        p.setAttribute('pathLength', '1'); p.style.setProperty('--d', i);
      });
    });
  }

  // --- Números que cuentan hasta su valor ---
  function countUp(el) {
    if (el.dataset.counted) return; el.dataset.counted = '1';
    const to = parseFloat(el.dataset.count); const decimals = +(el.dataset.decimals || 0);
    const fmt = (v) => (decimals ? v.toFixed(decimals).replace('.', ',') : String(Math.round(v)));
    if (reduceMotion || !to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(); const dur = +(el.dataset.dur || 1300);
    const tick = (now) => { const p = clamp((now - t0) / dur, 0, 1); el.textContent = fmt(to * (1 - (1 - p) ** 3)); if (p < 1 && el.isConnected) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // --- Secciones sticky con desplazamiento horizontal ---
  function layoutHScroll() {
    $$('.hscroll', view).forEach((sec) => {
      const track = $('.hs-track', sec);
      if (innerWidth >= 992) {
        sec._dist = Math.max(0, track.scrollWidth - innerWidth);
        sec.style.height = sec._dist + innerHeight + 'px';
      } else { sec._dist = 0; sec.style.height = ''; track.style.transform = ''; }
    });
  }
  addEventListener('resize', layoutHScroll);

  // --- Bucle de animación: scroll suave, cursor, horizontal y parallax ---
  // Solo corre cuando hay algo que mover (rueda/scroll programado, mouse, scroll de la página) y se
  // apaga solo al terminar: en el celular, sin scroll suave ni cursor, solo trabaja mientras se desplaza.
  // Las listas de elementos se guardan por vista en `fxEls` (se recalculan en observe()).
  const fxEls = { hs: [], speed: [] };
  function cacheFx() {
    fxEls.hs = $$('.hscroll', view).map((sec) => ({ sec, track: $('.hs-track', sec), bar: $('.hs-progress i', sec) }));
    fxEls.speed = !reduceMotion && finePointer ? $$('[data-speed]', view) : [];
  }
  let frameQueued = false;
  const kick = () => { if (!frameQueued) { frameQueued = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  if (finePointer) addEventListener('mousemove', kick, { passive: true });
  function frame() {
    frameQueued = false;
    let again = false;
    if (smooth.active) {
      // Si algo más movió la página (teclado, barra, foco), se le cede el control en vez de devolverla.
      if (Math.abs(scrollY - smooth.last) > 3) smooth.active = false;
      else {
        smooth.target = clamp(smooth.target, 0, maxScroll());
        smooth.cur += (smooth.target - smooth.cur) * 0.1;
        if (Math.abs(smooth.target - smooth.cur) < 0.5) { smooth.cur = smooth.target; smooth.active = false; }
        window.scrollTo(0, smooth.cur);
        smooth.last = scrollY;
        again = smooth.active;
      }
    }
    if (finePointer) {
      const dx = cursor.x - cursor.cx; const dy = cursor.y - cursor.cy;
      if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
        cursor.cx += dx * 0.25; cursor.cy += dy * 0.25;
        cursor.el.style.transform = `translate3d(${cursor.cx}px, ${cursor.cy}px, 0)`;
        again = true;
      }
    }
    for (const { sec, track, bar } of fxEls.hs) {
      if (!sec._dist || !sec.isConnected) continue;
      const r = sec.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const p = clamp(-r.top / (sec.offsetHeight - innerHeight), 0, 1);
      track.style.transform = `translate3d(${(-p * sec._dist).toFixed(1)}px,0,0)`;
      bar?.style.setProperty('width', (p * 100).toFixed(1) + '%');
    }
    for (const el of fxEls.speed) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) continue;
      el.style.translate = `0 ${((r.top + r.height / 2 - innerHeight / 2) * +el.dataset.speed).toFixed(1)}px`;
    }
    if (again) kick();
  }

  // --- Cortina naranja entre capítulos ---
  const curtainEl = $('#curtain');
  async function curtainIn(text) {
    if (reduceMotion) return;
    $('#curtainLabel').textContent = text;
    curtainEl.className = 'curtain';
    void curtainEl.offsetWidth;
    curtainEl.classList.add('in');
    await wait(560);
  }
  function curtainOut() {
    if (reduceMotion || !curtainEl.classList.contains('in')) return;
    curtainEl.classList.replace('in', 'out');
    setTimeout(() => { curtainEl.className = 'curtain'; }, 700);
  }

  // ---------------- Observador de entradas ----------------
  let io;
  function observe(root = view) {
    splitWords(root);
    prepDraw(root);
    layoutHScroll();
    cacheFx();
    kick();
    io?.disconnect();
    io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add('in-view');
      if (el.classList.contains('type')) typewrite(el);
      if (el.dataset.count != null) countUp(el);
      io.unobserve(el);
    }), { threshold: 0.2 });
    $$('.reveal, .wsplit, .draw, .type, [data-count], .stagger', view).forEach((el) => { if (!el.classList.contains('in-view')) io.observe(el); });
  }
  // Para contenido que se dibuja después de una interacción (pestañas, casos, resultados).
  const refresh = (root) => { observe(root); };

  const chapterIndex = () => CHAPTERS.findIndex((c) => c.path === '/' + state.current);

  // Teclado: Esc cierra el menú de usuario; el cuestionario registra sus atajos en quizKeys.
  let quizKeys = null;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#userMenu').hidden) { closeUserMenu(); $('#userBtn').focus(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (quizKeys) quizKeys(e);
  });

  // =========================================================
  // COMPONENTES COMPARTIDOS
  // =========================================================
  function chapterHero(n, title, lead, ill) {
    return `
    <section class="ch-hero ruled">
      <div class="wrap ch-hero-grid">
        <div>
          ${label(`Capítulo ${n}`)}
          <h1 class="ch-title wsplit">${esc(title)}</h1>
        </div>
        <div class="ch-side">
          <div class="ch-ill" data-speed="-0.06">${ill}</div>
          ${typed(`<span class="o">(*)</span> ${esc(lead)}`, 'ch-lead')}
        </div>
      </div>
    </section>`;
  }

  function nextChapter() {
    const c = chapterIndex();
    const pv = CHAPTERS[c - 1]; const nx = CHAPTERS[c + 1];
    return `
    ${nx ? `<a class="next-ch" href="#${nx.path}" data-cursor="Siguiente">
      ${label(`Siguiente capítulo · ${nx.n}`)}
      <span class="next-title">${esc(nx.title.toLowerCase())} <i>→</i></span>
      <span class="next-text">${esc(nx.text)}</span>
    </a>` : ''}
    <nav class="ch-nav" aria-label="Más navegación">
      ${pv ? `<a href="#${pv.path}"><span aria-hidden="true">←</span> ${esc(pv.title)}</a>` : '<span></span>'}
      <button class="link-btn" data-top>Volver arriba ↑</button>
    </nav>`;
  }

  function footer() {
    return `
    <footer class="footer">
      <div class="wrap">
        ${label('Que la ley no sea letra muerta')}
        <p class="footer-title">que la ley<br>se cumpla<span class="o">*</span></p>
        <ol class="footer-nav">${CHAPTERS.map((c) => `<li><a href="#${c.path}"><span>${c.n}</span> ( ${esc(c.title.toUpperCase())} )</a></li>`).join('')}</ol>
        <div class="footer-meta">
          <span>${esc(WORK.title)} — ${esc(WORK.subtitle)}</span>
          <span>Trabajo de ${esc(WORK.author)} · ${WORK.year}</span>
        </div>
      </div>
    </footer>`;
  }

  // Acordeón genérico (temas avanzados, preguntas frecuentes).
  function accordion(items, id) {
    return `<div class="acc" id="${id}">${items.map((it, i) => `
      <div class="acc-item" data-i="${i}">
        <button class="acc-head" aria-expanded="false"><span class="acc-n">${esc(it.n)}</span><span class="acc-t">${esc(it.t)}</span><i class="acc-plus" aria-hidden="true"></i></button>
        <div class="acc-body"><div class="acc-inner">${it.html}</div></div>
      </div>`).join('')}</div>`;
  }
  function bindAccordion(root, single = false) {
    const items = $$('.acc-item', root);
    const set = (it, open) => { it.classList.toggle('open', open); $('.acc-head', it).setAttribute('aria-expanded', open); };
    items.forEach((it) => $('.acc-head', it).addEventListener('click', () => {
      const open = !it.classList.contains('open');
      if (single) items.forEach((o) => set(o, false));
      set(it, open);
    }));
  }

  // Pestañas verticales tipo "lomo de libro" (como la sección de trabajos de la referencia).
  function vtabs(items, id) {
    return `<div class="vtabs" id="${id}">${items.map((it, i) => `
      <div class="vtab ${colorClass(it.color || 'paper')}${i === 0 ? ' open' : ''}">
        <button class="vtab-head" aria-expanded="${i === 0}"><span class="vtab-n">${pad(i + 1)}</span><span class="vtab-t">${esc(it.title)}</span></button>
        <div class="vtab-body">${it.html}</div>
      </div>`).join('')}</div>`;
  }
  function bindVtabs(root) {
    const tabs = $$('.vtab', root);
    const open = (t) => tabs.forEach((x) => { x.classList.toggle('open', x === t); $('.vtab-head', x).setAttribute('aria-expanded', x === t); });
    tabs.forEach((t) => $('.vtab-head', t).addEventListener('click', () => {
      open(t);
      // En móvil las pestañas son un acordeón: se lleva la abierta a la vista.
      if (innerWidth < 900) setTimeout(() => scrollToEl(t, 80), 60);
    }));
  }

  // =========================================================
  // 01 · INICIO / CONCEPTO
  // =========================================================
  const NOTE_POS = [[4, 4, -5], [30, 24, 3], [57, 2, -2], [14, 50, 2], [48, 46, -4]];

  function renderHome() {
    view.innerHTML = `
    <section class="hero ruled">
      <div class="hero-grid">
        <h1 class="hero-title" aria-label="Que la ley se cumpla">
          <span class="hl-row"><span class="wsplit">que la ley</span><span class="hero-door" data-speed="-0.04">${ILL.door}</span></span>
          <span class="hl-row r2"><span class="paren">(</span><span class="hero-stack" id="heroStack" aria-hidden="true">${LEVELS.map((l, i) => `<span class="stack-card ${colorClass(['orange', 'blue', 'yellow'][i])}" data-k="${i}"><b>${esc(l.short)}</b><small>${esc(l.tag)}</small></span>`).join('')}</span><span class="paren">)</span><span class="wsplit">se cumpla</span></span>
        </h1>
        <div class="hero-side">
          ${typed(`<span class="o">(*)</span> ${esc(INTRO)}`, 'hero-note')}
          <div class="hero-ctas">
            <button class="btn-o" id="startTour">• Empezar el recorrido</button>
            <a class="btn-line" href="#/evaluacion">Ir a la evaluación</a>
          </div>
          <p class="hero-credit">Trabajo de <b>${esc(WORK.author)}</b> · ${WORK.year}</p>
        </div>
      </div>
      <div class="scroll-hint" aria-hidden="true"><span>Desliza para descubrir</span><i><svg viewBox="0 0 24 24"><path d="M6 10 L12 16 L18 10"/></svg></i></div>
    </section>

    <section class="section center">
      <div class="wrap narrow">
        ${label('Antes de 1991')}
        <p class="ghost"><span class="ghost-bg">de poco sirve una norma vigente que la autoridad se niega a ejecutar</span><span class="ghost-fg type" data-type-ms="2600">de poco sirve una norma vigente que la autoridad se niega a ejecutar</span></p>
        <p class="body-l reveal">${esc(BEFORE_1991)}</p>
      </div>
    </section>

    <section class="section levels">
      <div class="wrap">
        ${label('Marco normativo · tres niveles')}
        <div class="levels-stage">
          <p class="giant-word" aria-hidden="true">cumplir</p>
          <div class="level-circles">${LEVELS.map((l, i) => `<button class="level-circle${i === 0 ? ' on' : ''}" data-l="${i}" style="--i:${i}" data-cursor="Ver"><span class="lc-tag">${esc(l.tag)}</span><span class="lc-name">${esc(l.short)}</span></button>`).join('')}</div>
        </div>
        <p class="levels-caption">Tres niveles. <b>Una sola acción.</b></p>
        <div class="level-detail" id="levelDetail"></div>
      </div>
    </section>

    <section class="section">
      <div class="wrap split-2">
        <div>
          ${label('El CPACA no reemplaza a la Ley 393')}
          <h2 class="h2" data-fx="type">el art. 146 solo la toca en tres puntos</h2>
          <p class="body reveal">Se limita a ubicar la acción dentro de los medios de control y a remitir a la Ley 393. El trámite, los términos y el fallo siguen sus reglas especiales.</p>
        </div>
        <ol class="num-list stagger">${CPACA_POINTS.map((p, i) => `<li style="--i:${i}"><span class="nl-n">${pad(i + 1)}</span><div><b>${esc(p.t)}</b><span>${esc(p.d)}</span></div></li>`).join('')}</ol>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${label('Concepto, naturaleza y finalidad')}
        ${typed('Es una acción <mark>constitucional</mark>, <mark>pública</mark>, <mark>residual</mark> y <mark>de condena</mark>. Su objeto es que el juez ordene a la autoridad renuente ejecutar un deber concreto previsto en una norma con fuerza material de ley o en un acto administrativo.', 'statement')}
        <blockquote class="quote reveal">
          <span class="q-mark" aria-hidden="true">“</span>
          <p>${esc(CONCEPT.quote)}</p>
          <cite>— ${esc(CONCEPT.source)}</cite>
        </blockquote>
      </div>
    </section>

    <section class="section traits">
      <div class="wrap">
        ${label('Sus rasgos principales')}
        <p class="fx-rotator">una acción <span data-fx-words="pública|residual|preferente|no indemnizatoria|de condena">pública</span></p>
        <div class="note-stage" id="noteStage" data-cursor="Descubrir">
          <p class="note-bg" aria-hidden="true">cinco<br>rasgos</p>
          <p class="hand-hint" aria-hidden="true">¡Haz clic para<br>descubrir más!</p>
          ${TRAITS.map((t, i) => `
            <article class="note ${colorClass(t.color)}" style="--x:${NOTE_POS[i][0]}%;--y:${NOTE_POS[i][1]}%;--r:${NOTE_POS[i][2]}deg">
              <span class="note-ref">${esc(t.ref)}</span>
              <h3>${esc(t.t)}</h3>
              <p>${esc(t.d)}</p>
            </article>`).join('')}
        </div>
        <div class="note-actions"><button class="btn-line" id="noteNext">Descubrir rasgo <span id="noteCount">0/5</span></button><button class="link-btn" id="noteAll">Mostrar todos</button></div>
      </div>
    </section>

    <section class="section principles">
      ${label('Principios · art. 2 de la Ley 393')}
      <div class="marquee" aria-label="${esc(PRINCIPLES.join(', '))}"><div class="marquee-track">${[0, 1].map(() => `<span>${PRINCIPLES.map((p) => `${esc(p)} <i>*</i> `).join('')}</span>`).join('')}</div></div>
      <div class="wrap">
        <div class="purposes">
          <p class="purposes-label reveal">Su finalidad es <b>doble</b>:</p>
          ${PURPOSES.map((p, i) => `<div class="purpose reveal" style="--i:${i}"><span class="purpose-n">${pad(i + 1)}</span><h3>${esc(p.t)}</h3><p>${esc(p.d)}</p></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="versus">
      <div class="vs-side vs-null">
        ${label('Nulidad y restablecimiento')}
        <p class="vs-big">ataca lo que la administración <em>hizo mal</em></p>
        <p class="vs-small">Pide al juez que retire una norma ilegal.</p>
      </div>
      <div class="vs-mid" aria-hidden="true">vs</div>
      <div class="vs-side vs-cump">
        ${label('Acción de cumplimiento')}
        <p class="vs-big">ataca lo que la administración <em>no hace</em></p>
        <p class="vs-small">Su inactividad frente a un mandato vigente: pide al juez que haga eficaz la norma.</p>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${label('Explora por capítulos')}
        <p class="ghost small-ghost"><span class="ghost-bg">una acción para que la ley no sea letra muerta</span><span class="ghost-fg type" data-type-ms="2000">una acción para que la ley no sea letra muerta</span></p>
        <div class="spines">${CHAPTERS.slice(1).map((c) => `
          <a class="spine ${colorClass(c.color)}" href="#${c.path}" data-cursor="Abrir">
            <span class="spine-n">( ${c.n} )</span><span class="spine-t">${esc(c.title)}</span><span class="spine-d">${esc(c.text)}</span>
          </a>`).join('')}</div>
      </div>
    </section>
    ${nextChapter()}
    ${footer()}`;

    $('#startTour').addEventListener('click', () => scrollToEl($('.hero').nextElementSibling, 70));

    // Pila de tarjetas dentro del paréntesis: la de arriba pasa al fondo cada 1,8 s.
    const stack = $$('#heroStack .stack-card');
    if (!reduceMotion) {
      let top = 0;
      const t = setInterval(() => { top = (top + 1) % stack.length; stack.forEach((c, i) => { c.dataset.k = (i - top + stack.length) % stack.length; }); }, 1800);
      onLeave(() => clearInterval(t));
    }

    // Tres niveles: cada círculo abre su detalle.
    const showLevel = (i) => {
      $$('.level-circle').forEach((b) => b.classList.toggle('on', +b.dataset.l === i));
      const l = LEVELS[i];
      const box = $('#levelDetail');
      box.innerHTML = `<div class="ld-in"><p class="ld-tag">${esc(l.tag)}</p><h3>${esc(l.norma)}</h3>${typed(esc(l.text), 'ld-text')}</div>`;
      refresh(box);
    };
    $$('.level-circle').forEach((b) => b.addEventListener('click', () => showLevel(+b.dataset.l)));
    showLevel(0);

    // Notas adhesivas: se descubren una por una (clic en la pizarra o en el botón).
    const notes = $$('.note');
    // En el celular las notas se apilan: se muestra la primera para que la pizarra no quede vacía.
    let shown = innerWidth < 900 ? 1 : 0;
    const paintNotes = () => { notes.forEach((n, i) => n.classList.toggle('shown', i < shown)); $('#noteCount').textContent = `${shown}/${notes.length}`; $('#noteStage').classList.toggle('all', shown >= notes.length); };
    const revealNote = () => { if (shown >= notes.length) return false; shown++; paintNotes(); return true; };
    $('#noteStage').addEventListener('click', revealNote);
    $('#noteNext').addEventListener('click', revealNote);
    $('#noteAll').addEventListener('click', () => { shown = notes.length; paintNotes(); });
    paintNotes();
  }

  // =========================================================
  // 02 · PROCEDENCIA
  // =========================================================
  function renderProcedencia() {
    view.innerHTML = `
    ${chapterHero('02', 'procedencia', 'No toda norma vigente es exigible por esta vía. ¿Qué se puede pedir, quién puede pedirlo y qué debe hacerse antes de demandar?', ILL.doc)}

    <section class="section">
      <div class="wrap">
        ${label('Objeto · qué se puede exigir')}
        <h2 class="h2" data-fx="type">dos clases de normas</h2>
        <div class="cards-2">${OBJECT.map((o, i) => `
          <article class="paper-card reveal" style="--i:${i}"><span class="pc-n">${pad(i + 1)}</span><h3>${esc(o.t)}</h3><p>${esc(o.d)}</p></article>`).join('')}</div>
      </div>
    </section>

    <section class="section ruled">
      <div class="wrap">
        ${label('El mandato debe ser imperativo e inobjetable')}
        <div class="duty">${DUTY.map((d, i) => `
          <div class="duty-row reveal" style="--i:${i}"><span class="duty-word">${esc(d.k)}<i>.</i></span><p>${esc(d.d)}</p></div>`).join('')}</div>
        <div class="example">
          <div class="example-note c-yellow reveal"><span class="note-ref">Ejemplo</span><p>${esc(DUTY_EXAMPLE)}</p></div>
          <div class="example-ill">${ILL.park}</div>
        </div>
        <p class="body reveal">Por eso la acción no sirve para exigir normas que solo establecen principios, fines o facultades discrecionales. Tampoco para discutir el contenido de la norma: si el acto es ilegal, la vía es la nulidad.</p>
      </div>
    </section>

    <section class="section" id="notSlide">
      <div class="wrap">
        ${label('Lo que no puede exigirse por esta vía')}
        <h2 class="h2" data-fx="type">nueve puertas cerradas</h2>
        ${vtabs(NOT_ENFORCEABLE.map((x, i) => ({ title: x.t, color: ['paper', 'sand', 'paper2'][i % 3], html: `<h3>${esc(x.t)}</h3><p class="vt-label">Por qué no procede</p><p>${esc(x.why)}</p><p class="vt-label">Vía adecuada</p><p class="vt-via">${esc(x.via)}</p>` })), 'notTabs')}
      </div>
    </section>

    <section class="section ruled">
      <div class="wrap split-2">
        <div>
          ${label('Regla práctica antes de demandar')}
          <h2 class="h2" data-fx="type">¿prosperaría tu acción?</h2>
          <p class="body reveal">Responde las cuatro preguntas. Si alguna respuesta es negativa, la acción probablemente fracasará.</p>
          <div class="verdict" id="ruleVerdict"><span class="verdict-stamp">Responde las preguntas</span></div>
        </div>
        <ol class="rule-list">${PRACTICAL_RULE.map((q, i) => `
          <li class="rule reveal" style="--i:${i}" data-i="${i}"><span class="rule-n">${pad(i + 1)}</span><p>${esc(q)}</p>
            <div class="yn"><button data-v="1">Sí</button><button data-v="0">No</button></div></li>`).join('')}</ol>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${label('Legitimación')}
        <h2 class="h2" data-fx="type">quién demanda y a quién</h2>
        <div class="standing">
          <div class="stand reveal">
            <p class="stand-ref">${esc(STANDING.active.ref)}</p><h3>${esc(STANDING.active.title)}</h3>
            <p>${esc(STANDING.active.lead)}</p>
            <ul class="dash">${STANDING.active.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
            <div class="mini-note c-green">${esc(STANDING.active.note)}</div>
          </div>
          <div class="stand reveal" style="--i:1">
            <p class="stand-ref">${esc(STANDING.passive.ref)}</p><h3>${esc(STANDING.passive.title)}</h3>
            <ul class="dash">${STANDING.passive.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
            <div class="stand-ill">${ILL.building}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${label('Art. 6 · la acción contra particulares')}
        <h2 class="h2" data-fx="type">cuando el particular ejerce funciones públicas</h2>
        <p class="body reveal">Fundamento: arts. 123 (inciso final), 210 y 365 de la Constitución. Si quien ejerce una función pública no es una autoridad estatal, debe responder igual que ella por el cumplimiento de la ley.</p>
        <ol class="steps-row stagger">${PRIVATE_REQS.map((r, i) => `<li style="--i:${i}"><span>${pad(i + 1)}</span><b>${esc(r.t)}</b><p>${esc(r.d)}</p></li>`).join('')}</ol>
        <div class="table-wrap" data-native-scroll><table class="ptable">
          <thead><tr><th>Particular</th><th>Función pública</th><th>Autoridad que puede imponer el cumplimiento</th></tr></thead>
          <tbody>${PRIVATES.map((p) => `<tr><td class="cell-title"><b>${esc(p.p)}</b></td><td data-label="Función pública">${esc(p.f)}</td><td data-label="Quién le exige cumplir">${esc(p.a)}</td></tr>`).join('')}</tbody>
        </table></div>
        <div class="whom">
          <p class="whom-q reveal">¿A quién conviene demandar?</p>
          <div class="chips" id="whomChips">${WHOM_TO_SUE.map((w, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-i="${i}">${esc(w.t)}</button>`).join('')}</div>
          <p class="whom-a" id="whomA">${esc(WHOM_TO_SUE[0].d)}</p>
          <p class="warn reveal"><b>Cuidado con el límite:</b> si la pretensión se refiere a la actividad privada del particular, o a obligaciones contractuales con él, la acción es improcedente.</p>
        </div>
      </div>
    </section>

    <section class="section renuencia">
      <div class="wrap">
        ${label('Requisito de procedibilidad · art. 8 Ley 393 y art. 161.3 CPACA')}
        <div class="ren-grid">
          <div class="ren-ill">${ILL.knock}</div>
          <div>
            <h2 class="h2" data-fx="type">la constitución en renuencia</h2>
            ${typed(esc(RENUENCIA.text), 'body-l')}
            <div class="ren-days reveal"><b data-count="10">10</b><span>días para responder.<br>Silencio o ratificación = renuencia.</span></div>
          </div>
        </div>
        <blockquote class="quote small reveal"><p>${esc(RENUENCIA.why)}</p><cite>— ${esc(RENUENCIA.whySource)}</cite></blockquote>
        <div class="identity">
          <p class="vt-label">Identidad con la demanda (Sección Quinta)</p>
          <ul class="checks stagger">${RENUENCIA.identity.map((x, i) => `<li style="--i:${i}"><i class="tick" aria-hidden="true"></i>${esc(x)}</li>`).join('')}</ul>
        </div>
        <div class="cards-2">
          <div class="mini-note c-pink reveal"><b>Ojo:</b> ${esc(RENUENCIA.warning)}</div>
          <div class="mini-note c-blue reveal"><b>Excepción:</b> ${esc(RENUENCIA.exception)}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${label('Causales de improcedencia · art. 9')}
        <h2 class="h2" data-fx="type">cuándo no procede</h2>
        <div class="cards-3">${IMPROCEDENCE.map((x, i) => `
          <article class="paper-card reveal" style="--i:${i}"><span class="pc-n big">${pad(i + 1)}</span><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p></article>`).join('')}</div>
        <p class="body reveal">La causal de gastos es la que más debate genera: la Sección Quinta la ha aplicado a pretensiones que implican pagos, como un reajuste pensional (26 de febrero de 2004). La razón es la separación de poderes: el juez no administra recursos ni prioriza el gasto público.</p>
      </div>
    </section>
    ${nextChapter()}
    ${footer()}`;

    bindVtabs($('#notTabs'));

    // Regla práctica: cuatro respuestas → veredicto.
    const answers = {};
    const paintVerdict = () => {
      const v = Object.values(answers);
      const box = $('#ruleVerdict');
      if (v.includes(0)) box.innerHTML = '<span class="verdict-stamp bad">Probablemente fracasará</span><p>Hay al menos una respuesta negativa. Revisa la sección «Lo que no puede exigirse» para encontrar la vía adecuada.</p>';
      else if (v.length === PRACTICAL_RULE.length) box.innerHTML = '<span class="verdict-stamp ok">Puede prosperar</span><p>Cumples la regla práctica. Ahora constituye en renuencia a la autoridad.</p>';
      else box.innerHTML = `<span class="verdict-stamp">Faltan ${PRACTICAL_RULE.length - v.length} respuesta(s)</span>`;
    };
    $$('.rule').forEach((li) => $$('.yn button', li).forEach((b) => b.addEventListener('click', () => {
      answers[li.dataset.i] = +b.dataset.v;
      $$('.yn button', li).forEach((x) => x.classList.toggle('on', x === b));
      li.classList.toggle('no', b.dataset.v === '0');
      paintVerdict();
    })));

    $$('#whomChips .chip').forEach((b) => b.addEventListener('click', () => {
      $$('#whomChips .chip').forEach((x) => x.classList.toggle('on', x === b));
      const a = $('#whomA'); a.textContent = WHOM_TO_SUE[+b.dataset.i].d; a.classList.remove('pop'); void a.offsetWidth; a.classList.add('pop');
    }));
  }

  // =========================================================
  // 03 · TRÁMITE
  // =========================================================
  function renderTramite() {
    view.innerHTML = `
    ${chapterHero('03', 'trámite', 'Breve y preferente: tiene prelación sobre los demás asuntos, salvo la tutela, y sus términos son perentorios (art. 11).', ILL.clock)}

    <section class="section ruled">
      <div class="wrap split-2 align-c">
        <div class="hg-ill">${ILL.hourglass}</div>
        <div>
          ${label('Caducidad · art. 7 de la Ley 393')}
          <h2 class="mega" data-fx="type">no caduca.</h2>
          ${typed(esc(CADUCIDAD), 'body-l')}
          <p class="mini-note c-yellow reveal">Diferencia esencial con la nulidad y restablecimiento, que caduca por regla en cuatro meses.</p>
        </div>
      </div>
    </section>

    <section class="section" id="compSlide">
      <div class="wrap">
        ${label('Competencia · arts. 152 y 155 del CPACA')}
        <h2 class="h2" data-fx="type">¿qué juez conoce?</h2>
        <p class="body reveal">El art. 3 de la Ley 393 asignó la primera instancia a los jueces administrativos del domicilio del accionante. El CPACA la distribuyó según el nivel de la autoridad demandada. En el Consejo de Estado, los asuntos de cumplimiento están asignados a la Sección Quinta.</p>
        <div class="toggle" role="group" aria-label="Nivel de la autoridad demandada">
          <span>La autoridad demandada es del orden</span>
          ${Object.entries(COMPETENCE).map(([k, c], i) => `<button class="${i === 0 ? 'on' : ''}" aria-pressed="${i === 0}" aria-controls="compRoute" data-k="${k}">${esc(c.label)}</button>`).join('')}
        </div>
        <div class="route" id="compRoute"></div>
      </div>
    </section>

    <section class="hscroll" id="stepsSlide">
      <div class="hs-sticky">
        <div class="hs-progress"><i></i></div>
        <div class="hs-track">
          <div class="panel panel-intro ruled">
            ${label('Trámite · arts. 10 a 29')}
            <h2 class="mega" data-fx="type">paso a paso</h2>
            <p class="body-l">Del escrito al desacato: cada término es perentorio.</p>
            <span class="hs-hint">Sigue bajando →</span>
          </div>
          ${STEPS.map((s, i) => `
          <div class="panel step-panel ${colorClass(s.color)}">
            <div class="sp-top"><span class="sp-n">${pad(i + 1)}</span><span class="sp-ref">${esc(s.ref)}</span></div>
            <h3 class="sp-title">${esc(s.n)}</h3>
            <div class="sp-days">${s.days != null ? `<b data-count="${s.days}">${s.days}</b>` : '<b class="sp-star">*</b>'}<span>${esc(s.unit)}</span></div>
            <p class="sp-text">${esc(s.d)}</p>
          </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${label('Situaciones especiales durante el proceso')}
        <h2 class="h2" data-fx="type">lo que puede pasar en el camino</h2>
        <div class="notes-grid">${SPECIAL.map((s, i) => `
          <article class="note static ${colorClass(s.color)} reveal" style="--i:${i};--r:${[-2, 1.5, -1, 2][i]}deg"><span class="note-ref">${esc(s.ref)}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></article>`).join('')}</div>
      </div>
    </section>

    <section class="section ruled">
      <div class="wrap split-2">
        <div>
          ${label('Sentencia · art. 21')}
          <h2 class="h2" data-fx="type">si la acción prospera, el fallo debe…</h2>
          <div class="ruling-notes">${RULING_NOTES.map((n, i) => `<div class="rn reveal" style="--i:${i}"><b>${esc(n.t)}</b><p>${esc(n.d)}</p></div>`).join('')}</div>
        </div>
        <div class="paper-doc reveal">
          <p class="doc-head">RESUELVE</p>
          <ol>${RULING.map((r, i) => `<li><b>${['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'][i]}.</b> ${esc(r)}</li>`).join('')}</ol>
          <span class="stamp">Art. 21<br>Ley 393</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap split-2">
        <div class="reveal">
          ${label('Impugnación · arts. 26 y 27')}
          <p class="big-num"><b data-count="3">3</b> días</p>
          <p class="body">Dentro de los tres días siguientes a la notificación pueden impugnar el solicitante, la autoridad renuente o su representante, y el Defensor del Pueblo. Por regla, en efecto suspensivo, salvo que la suspensión genere un perjuicio irremediable. El superior decide en <b>diez días</b>.</p>
        </div>
        <div class="reveal" style="--i:1">
          ${label('Cumplimiento y desacato · arts. 25 y 29')}
          <div class="desacato-ill">${ILL.gavel}</div>
          <p class="body">En firme el fallo, la autoridad debe cumplirlo sin demora. Si no lo hace, el juez se dirige a su superior y abre el disciplinario; conserva la competencia hasta que la orden se cumpla. El incumplimiento es <b>desacato</b>: lo sanciona el mismo juez y se revisa en consulta.</p>
        </div>
      </div>
    </section>
    ${nextChapter()}
    ${footer()}`;

    const paintRoute = (k) => {
      const c = COMPETENCE[k];
      $$('.toggle button').forEach((b) => { b.classList.toggle('on', b.dataset.k === k); b.setAttribute('aria-pressed', b.dataset.k === k); });
      const r = $('#compRoute');
      r.innerHTML = `
        <div class="route-who"><p class="vt-label">Quiénes</p><p>${esc(c.who)}</p></div>
        <div class="route-path">
          <div class="route-box c-orange"><span>Primera instancia</span><b>${esc(c.first)}</b><small>${esc(c.firstRef)}</small></div>
          <svg class="route-arrow draw" viewBox="0 0 120 40" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 24 C40 6 76 6 110 20"/><path d="M98 8 L112 20 L96 30"/></svg>
          <div class="route-box"><span>Segunda instancia</span><b>${esc(c.second)}</b><small>Impugnación · 10 días para decidir</small></div>
        </div>`;
      refresh(r);
    };
    $$('.toggle button').forEach((b) => b.addEventListener('click', () => paintRoute(b.dataset.k)));
    paintRoute('nacional');
  }

  // =========================================================
  // 04 · DIFERENCIAS Y TEMAS AVANZADOS
  // =========================================================
  function renderComparativo() {
    const others = COMPARE.actions.slice(1);
    view.innerHTML = `
    ${chapterHero('04', 'diferencias', 'Frente a la tutela, la acción popular y la nulidad y restablecimiento: qué protege cada una, qué ataca y qué exige.', ILL.scales)}

    <section class="section" id="cmpSlide">
      <div class="wrap">
        ${label('Diferencias con otras acciones')}
        <h2 class="h2" data-fx="type">compárala con…</h2>
        <div class="chips big" id="cmpChips">${others.map((a, i) => `<button class="chip ${colorClass(a.color)}${i === 0 ? ' on' : ''}" data-k="${a.k}">${esc(a.name)}</button>`).join('')}</div>
        <div class="compare" id="compare"></div>
      </div>
    </section>

    <section class="section ruled">
      <div class="wrap">
        ${label('Cuadro completo')}
        <div class="table-wrap reveal" data-native-scroll><table class="ctable">
          <thead><tr><th>Criterio</th>${COMPARE.actions.map((a) => `<th class="${a.k === 'cumplimiento' ? 'hl' : ''}">${esc(a.name)}</th>`).join('')}</tr></thead>
          <tbody>${COMPARE.criteria.map((c, r) => `<tr><th>${esc(c)}</th>${COMPARE.actions.map((a) => `<td class="${a.k === 'cumplimiento' ? 'hl' : ''}" data-label="${esc(a.name)}">${esc(a.values[r])}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>
    </section>

    <section class="section center">
      <div class="wrap narrow">
        ${label('La diferencia clave con la nulidad')}
        <p class="ghost"><span class="ghost-bg">${esc(COMPARE.key)}</span><span class="ghost-fg type" data-type-ms="3200">${esc(COMPARE.key)}</span></p>
        <p class="body-l reveal">Por eso la Sección Quinta declara improcedente la acción de cumplimiento cuando lo que realmente se cuestiona es la legalidad de un acto. Con la tutela, el criterio es el art. 9: si el incumplimiento vulnera un derecho fundamental, la vía es la tutela.</p>
      </div>
    </section>

    <section class="section" id="advSlide">
      <div class="wrap">
        ${label('Temas avanzados')}
        <h2 class="h2" data-fx="type">ocho puntos finos</h2>
        ${accordion(ADVANCED.map((a) => ({ n: a.n, t: a.t, html: a.d.map((p) => `<p>${esc(p)}</p>`).join('') + (a.tip ? `<div class="mini-note c-yellow"><b>Tip:</b> ${esc(a.tip)}</div>` : '') })), 'advAcc')}
      </div>
    </section>
    ${nextChapter()}
    ${footer()}`;

    const paintCompare = (k) => {
      const a = COMPARE.actions[0]; const b = COMPARE.actions.find((x) => x.k === k);
      $$('#cmpChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.k === k));
      const box = $('#compare');
      box.innerHTML = `
        <div class="cmp-head"><span class="${colorClass(a.color)}">${esc(a.name)}</span><span class="${colorClass(b.color)}">${esc(b.name)}</span></div>
        ${COMPARE.criteria.map((c, i) => `
          <div class="cmp-row" style="--i:${i}">
            <p class="cmp-crit">${esc(c)}</p>
            <p class="cmp-a">${esc(a.values[i])}</p>
            <p class="cmp-b">${esc(b.values[i])}</p>
          </div>`).join('')}`;
      box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
    };
    $$('#cmpChips .chip').forEach((c) => c.addEventListener('click', () => paintCompare(c.dataset.k)));
    paintCompare(others[0].k);
    bindAccordion($('#advAcc'), true);
  }

  // =========================================================
  // 05 · CASOS, GUÍA, MODELOS, FAQ, JURISPRUDENCIA, CONCLUSIONES
  // =========================================================
  function renderCasos() {
    view.innerHTML = `
    ${chapterHero('05', 'casos', 'Seis casos hipotéticos construidos a partir de las reglas jurisprudenciales. Tú decides: ¿procede, es improcedente o se rechaza?', ILL.gavel)}

    <section class="section ruled" id="caseSlide">
      <div class="wrap">
        ${label('Casos prácticos resueltos · tú eres el juez')}
        <div class="case-top"><div class="case-dots" id="caseDots"></div><p class="case-score" id="caseScore"></p></div>
        <div class="case" id="caseBox"></div>
      </div>
    </section>

    <section class="section">
      <div class="wrap split-2">
        <div>
          ${label('Guía práctica · antes de demandar')}
          <h2 class="h2" data-fx="type">lista de verificación</h2>
          <div class="ring-wrap"><svg class="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle class="ring-fg" id="ringFg" cx="60" cy="60" r="52" pathLength="100"/></svg><p><b id="checkCount">0</b><span>/ ${CHECKLIST.length}</span></p></div>
          <p class="body" id="checkMsg">Marca cada punto a medida que lo verificas.</p>
          <button class="link-btn" id="checkReset">Reiniciar lista</button>
        </div>
        <ul class="checklist" id="checklist">${CHECKLIST.map((c, i) => `<li><label><input type="checkbox" data-i="${i}"><i class="box" aria-hidden="true"></i><span>${esc(c)}</span></label></li>`).join('')}</ul>
      </div>
    </section>

    <section class="section ruled">
      <div class="wrap">
        ${label('Modelos para diligenciar')}
        <div class="chips" id="modelChips">${Object.entries(MODELS).map(([k, m], i) => `<button class="chip${i === 0 ? ' on' : ''}" data-k="${k}">${esc(m.title)}</button>`).join('')}</div>
        <div class="model-grid">
          <div class="paper-doc model" id="modelDoc" data-native-scroll></div>
          <aside class="model-side"><div class="mini-note c-yellow" id="modelTip"></div><button class="btn-line" id="copyModel">Copiar modelo</button></aside>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${label('Preguntas frecuentes')}
        <div class="faq-head"><h2 class="h2" data-fx="type">dieciocho dudas</h2><input class="search" id="faqSearch" type="search" placeholder="Buscar una pregunta…" aria-label="Buscar en las preguntas frecuentes"></div>
        ${accordion(FAQ.map((f, i) => ({ n: pad(i + 1), t: f.q, html: `<p>${esc(f.a)}</p>` })), 'faqAcc')}
      </div>
    </section>

    <section class="section ruled">
      <div class="wrap">
        ${label('Jurisprudencia relevante')}
        <div class="chips" id="jurChips"><button class="chip on" data-c="all">Todas</button><button class="chip" data-c="cc">Corte Constitucional</button><button class="chip" data-c="ce">Consejo de Estado</button></div>
        <ol class="juris" id="juris">${CASE_LAW.map((j) => `<li data-c="${j.court}"><div class="j-p"><span class="j-court">${j.court === 'cc' ? 'Corte Constitucional' : 'Consejo de Estado'}</span><b>${esc(j.p)}</b><small>${esc(j.who)}</small></div><p>${esc(j.r)}</p></li>`).join('')}</ol>
        <p class="small-print">Puedes consultar el texto completo de cada sentencia en la relatoría de la Corte Constitucional y del Consejo de Estado.</p>
      </div>
    </section>

    <section class="section conclusions" id="conclSlide">
      <div class="wrap">
        <div class="burst" aria-hidden="true">${ILL.burst}</div>
        ${label('Conclusiones')}
        <ol class="concl">${CONCLUSIONS.map((c, i) => `<li class="reveal" style="--i:${i}"><span>${pad(i + 1)}</span><p>${esc(c)}</p></li>`).join('')}</ol>
      </div>
    </section>

    <section class="section cta-final">
      <div class="wrap center">
        ${label('Evaluación')}
        <h2 class="mega" data-fx="type">¿listo para el reparto?</h2>
        <p class="body-l reveal">Tu demanda irá a un despacho al azar. El despacho decide cuántas preguntas respondes.</p>
        <a class="btn-o big" href="#/evaluacion">• Radicar mi demanda</a>
        <details class="refs"><summary>Referencias</summary><ol>${REFERENCES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></details>
      </div>
    </section>
    ${footer()}`;

    // --- Juego de casos ---
    const picks = store.get('cumplir-casos') || {};
    let ci = 0;
    const paintCase = () => {
      const c = CASES[ci]; const pick = picks[ci];
      const box = $('#caseBox');
      const answered = pick != null;
      const ok = pick === c.verdict;
      box.innerHTML = `
        <div class="case-card">
          <p class="case-n">Caso ${ci + 1} de ${CASES.length}</p>
          <h3 class="case-title">${esc(c.t)}</h3>
          <div class="case-facts"><p class="vt-label">Hechos</p><p>${esc(c.facts)}</p></div>
          <div class="case-options">${VERDICTS.map((v, i) => `<button class="vbtn${answered && i === c.verdict ? ' right' : ''}${answered && i === pick && !ok ? ' wrong' : ''}" data-v="${i}" ${answered ? 'disabled' : ''}>${esc(v)}</button>`).join('')}</div>
          ${answered ? `
            <div class="case-result">
              <span class="stamp ${ok ? 'ok' : 'bad'}">${esc(c.label)}</span>
              <p class="vt-label">${ok ? '¡Bien resuelto!' : 'No era esa la respuesta'}</p>
              <p><b>Análisis.</b> ${esc(c.analysis)}</p>
              <p><b>Solución.</b> ${esc(c.solution)}</p>
            </div>` : ''}
          <div class="case-nav"><button class="btn-line" id="casePrev" ${ci === 0 ? 'disabled' : ''}>← Anterior</button><button class="btn-o" id="caseNext" ${ci === CASES.length - 1 ? 'disabled' : ''}>Siguiente caso →</button></div>
        </div>`;
      $('#caseDots').innerHTML = CASES.map((x, i) => `<button class="${i === ci ? 'on' : ''} ${picks[i] == null ? '' : picks[i] === x.verdict ? 'ok' : 'bad'}" data-i="${i}" aria-label="Caso ${i + 1}">${i + 1}</button>`).join('');
      const done = Object.keys(picks).length;
      const right = CASES.filter((x, i) => picks[i] === x.verdict).length;
      $('#caseScore').innerHTML = done ? `Aciertos de práctica: <b>${right}/${done}</b> <button class="link-btn" id="caseReset">Reiniciar</button>` : 'Práctica sin nota: elige tu decisión.';
      $$('.vbtn', box).forEach((b) => b.addEventListener('click', () => { picks[ci] = +b.dataset.v; store.set('cumplir-casos', picks); paintCase(); }));
      $$('#caseDots button').forEach((b) => b.addEventListener('click', () => { ci = +b.dataset.i; paintCase(); }));
      $('#casePrev').addEventListener('click', () => { ci--; paintCase(); });
      $('#caseNext').addEventListener('click', () => { ci++; paintCase(); });
      $('#caseReset')?.addEventListener('click', () => { Object.keys(picks).forEach((k) => delete picks[k]); store.del('cumplir-casos'); ci = 0; paintCase(); });
    };
    paintCase();

    // --- Lista de verificación (se recuerda en este navegador) ---
    const checked = new Set(store.get('cumplir-checklist') || []);
    const paintChecks = () => {
      $$('#checklist input').forEach((c) => { c.checked = checked.has(+c.dataset.i); c.closest('li').classList.toggle('done', c.checked); });
      $('#checkCount').textContent = checked.size;
      $('#ringFg').style.strokeDashoffset = 100 - (checked.size / CHECKLIST.length) * 100;
      $('#checkMsg').textContent = checked.size === CHECKLIST.length ? '¡Lista completa! Tu demanda está lista para radicarse.' : `Te faltan ${CHECKLIST.length - checked.size} punto(s) por verificar.`;
    };
    $$('#checklist input').forEach((c) => c.addEventListener('change', () => { c.checked ? checked.add(+c.dataset.i) : checked.delete(+c.dataset.i); store.set('cumplir-checklist', [...checked]); paintChecks(); }));
    $('#checkReset').addEventListener('click', () => { checked.clear(); store.del('cumplir-checklist'); paintChecks(); });
    paintChecks();

    // --- Modelos ---
    let modelKey = 'renuencia';
    const paintModel = (k) => {
      modelKey = k;
      $$('#modelChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.k === k));
      const m = MODELS[k];
      $('#modelDoc').innerHTML = esc(m.text).split('\n\n').map((p) => `<p>${p.replace(/\n/g, '<br>').replace(/\[([^\]]*)\]/g, '<mark>[$1]</mark>')}</p>`).join('');
      $('#modelDoc').scrollTop = 0;
      $('#modelTip').innerHTML = `<b>Recomendación:</b> ${esc(m.tip)}`;
    };
    $$('#modelChips .chip').forEach((c) => c.addEventListener('click', () => paintModel(c.dataset.k)));
    $('#copyModel').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(MODELS[modelKey].text); toast('Modelo copiado al portapapeles.'); } catch { toast('No se pudo copiar. Selecciona el texto manualmente.', true); }
    });
    paintModel('renuencia');

    // --- Preguntas frecuentes ---
    bindAccordion($('#faqAcc'));
    $('#faqSearch').addEventListener('input', (e) => {
      const q = e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      $$('#faqAcc .acc-item').forEach((it) => {
        const f = FAQ[+it.dataset.i];
        it.hidden = !!q && !(f.q + ' ' + f.a).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q);
      });
    });

    // --- Jurisprudencia ---
    $$('#jurChips .chip').forEach((c) => c.addEventListener('click', () => {
      $$('#jurChips .chip').forEach((x) => x.classList.toggle('on', x === c));
      $$('#juris li').forEach((li) => { li.hidden = c.dataset.c !== 'all' && li.dataset.c !== c.dataset.c; });
    }));
  }

  // =========================================================
  // AUTENTICACIÓN
  // =========================================================
  function renderAuth(mode) {
    const login = mode === 'login';
    view.innerHTML = `
    <section class="auth">
      <div class="auth-hero ruled">
        <p class="logo auth-logo" aria-hidden="true">cumplir<i class="caret"></i></p>
        <h1 class="auth-title" aria-label="Que la ley se cumpla"><span class="wsplit">que la ley</span><span class="auth-door" aria-hidden="true">${ILL.door}</span><br><span class="wsplit">se cumpla</span></h1>
        <p class="auth-lead">Guía interactiva sobre la <b>acción de cumplimiento</b>: art. 87 de la Constitución, Ley 393 de 1997 y art. 146 del CPACA. ${login ? 'Ingresa' : 'Crea tu cuenta'} para recorrerla y presentar la evaluación.</p>
        <p class="auth-credit">Trabajo de ${esc(WORK.author)} · ${WORK.year}</p>
      </div>
      <div class="auth-panel">
        <div class="auth-card">
          <div class="tabs" role="tablist" aria-label="Acceso">
            <button class="tab${login ? ' active' : ''}" data-mode="login" role="tab" aria-selected="${login}">Iniciar sesión</button>
            <button class="tab${login ? '' : ' active'}" data-mode="register" role="tab" aria-selected="${!login}">Crear cuenta</button>
          </div>
          <h2 class="auth-h">${login ? 'bienvenido de nuevo' : 'crea tu cuenta'}</h2>
          <p class="auth-sub">${login ? 'Usa el nombre y la contraseña con los que te registraste.' : 'Solo necesitas tu nombre completo y una contraseña. Tu nota quedará registrada con ese nombre.'}</p>
          <form id="authForm" novalidate>
            <label class="field"><span>${login ? 'Tu nombre' : 'Nombre completo'}</span>
              <input name="name" autocomplete="name" autocapitalize="words" enterkeyhint="next" required minlength="3" maxlength="80" placeholder="Ej. María Fernanda López"></label>
            <label class="field"><span>Contraseña</span>
              <span class="pw"><input name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" enterkeyhint="${login ? 'go' : 'next'}" required minlength="4"><button type="button" class="pw-toggle" aria-label="Mostrar contraseña">Ver</button></span></label>
            ${login ? '' : '<label class="field"><span>Confirmar contraseña</span><input name="confirm" type="password" autocomplete="new-password" enterkeyhint="go" required minlength="4"></label>'}
            <p class="form-error" id="authError" role="alert"></p>
            <button class="btn-o big block" type="submit">${login ? 'Ingresar' : 'Crear cuenta'} <span aria-hidden="true">→</span></button>
          </form>
          <p class="form-note">${login ? '¿Primera vez aquí? <a href="#/registro">Crea tu cuenta</a>.' : '¿Ya tienes cuenta? <a href="#/ingresar">Inicia sesión</a>.'}</p>
        </div>
      </div>
    </section>`;

    const form = $('#authForm');
    // El nombre escrito se conserva al cambiar de pestaña.
    if (state.authName) form.name.value = state.authName;
    form.name.addEventListener('input', () => { state.authName = form.name.value; });
    $$('.tab', view).forEach((b) => b.addEventListener('click', () => go(b.dataset.mode === 'login' ? '/ingresar' : '/registro')));
    $('.pw-toggle', view).addEventListener('click', (e) => {
      const input = $('#authForm input[name=password]'); const show = input.type === 'password';
      input.type = show ? 'text' : 'password'; e.currentTarget.textContent = show ? 'Ocultar' : 'Ver';
      e.currentTarget.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
    // En el celular no se abre el teclado de golpe: taparía la portada.
    if (finePointer) form.name.focus({ preventScroll: true });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#authError');
      const name = form.name.value.trim(); const password = form.password.value;
      const fail = (msg, field) => { err.textContent = msg; field?.focus(); };
      if (name.length < 3) return fail('Escribe tu nombre completo (al menos 3 letras).', form.name);
      if (password.length < 4) return fail('La contraseña debe tener al menos 4 caracteres.', form.password);
      if (!login && password !== form.confirm.value) return fail('Las contraseñas no coinciden. Escríbelas de nuevo.', form.confirm);
      err.textContent = '';
      const btn = form.querySelector('button[type=submit]'); const original = btn.innerHTML;
      btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = login ? 'Ingresando…' : 'Creando cuenta…';
      try {
        const { user } = await api(login ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: { name, password } });
        state.user = user; state.authName = '';
        claimLocal(user);
        toast(login ? `Hola de nuevo, ${user.name.split(' ')[0]}.` : `¡Bienvenido, ${user.name.split(' ')[0]}! Tu cuenta está lista.`);
        const after = state.after; state.after = null;
        go(user.role === 'admin' ? '/admin' : after || '/inicio');
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.classList.remove('is-loading'); btn.innerHTML = original; }
    });
  }

  // =========================================================
  // 06 · EVALUACIÓN: reparto → cuestionario → sentencia
  // =========================================================
  const SEG_COLORS = ['orange', 'blue', 'yellow', 'green', 'pink', 'sand'];
  const LETTERS = ['A', 'B', 'C', 'D'];
  const TYPE_LABEL = { opcion: 'Selección múltiple', vf: 'Verdadero o falso', caso: '¿Procede la acción?' };

  async function renderEvaluacion() {
    view.innerHTML = '<section class="section"><div class="wrap"><p class="body-l">Cargando evaluación…</p></div></section>';
    try {
      if (!state.evalConfig) state.evalConfig = await api('/api/eval/config');
      const { attempt } = await api('/api/eval/status');
      if (state.current !== 'evaluacion') return; // se navegó a otra sección mientras cargaba
      if (attempt?.status === 'done') return renderResults(attempt);
      return renderReparto(attempt);
    } catch (ex) { view.innerHTML = `<section class="section"><div class="wrap"><p class="body-l">${esc(ex.message)}</p></div></section>`; }
  }

  function renderReparto(attempt) {
    const { segments, passScore, maxScore } = state.evalConfig;
    const unique = [...new Map(segments.map((s) => [s.title, s])).values()];
    view.innerHTML = `
    <section class="reparto ruled">
      <div class="wrap reparto-grid">
        <div class="reparto-copy">
          ${label('Capítulo 06 · Evaluación')}
          <h1 class="ch-title wsplit">el reparto</h1>
          ${typed('Como toda demanda que se radica, la tuya va a <mark>reparto</mark>. El despacho que te corresponda decide cuántas preguntas respondes. Tienes <b>una sola radicación</b>.', 'body-l')}
          <ul class="despachos">${unique.map((s) => `<li class="${s.bonus ? 'bonus' : ''}"><b>${s.questions}</b><span>${esc(s.title)}${s.bonus ? ` · <em>+${dec(s.bonus)} en tu nota</em>` : ''}</span></li>`).join('')}</ul>
          <ol class="eval-steps" aria-label="Cómo funciona">
            <li><b>Radicas</b><span>Pulsas «Radicar demanda». Solo se puede una vez.</span></li>
            <li><b>Reparto</b><span>Tu demanda cae en un despacho al azar.</span></li>
            <li><b>Respondes</b><span>Selección múltiple, verdadero o falso y casos. Tus respuestas se guardan si recargas.</span></li>
            <li><b>Sentencia</b><span>Recibes tu nota al instante. Las explicaciones se publican cuando la docente cierra la evaluación.</span></li>
          </ol>
          <p class="small-print">Nota de 0,0 a ${dec(maxScore)} · se aprueba con ${dec(passScore)}.</p>
        </div>
        <div class="reparto-stage">
          <div class="folders" id="folders">${segments.map((s, i) => `
            <div class="folder" data-i="${i}" style="--i:${i}">
              <div class="folder-inner">
                <div class="folder-back"><span class="f-tab">EXP. ${pad(i + 1)}</span><span class="f-lines"></span><span class="f-seal">Reparto</span></div>
                <div class="folder-front ${colorClass(SEG_COLORS[i % SEG_COLORS.length])}"><span class="f-label">Despacho</span><b>${esc(s.title)}</b><span class="f-q">${s.questions} preguntas${s.bonus ? ` · +${dec(s.bonus)}` : ''}</span></div>
              </div>
            </div>`).join('')}</div>
          <button class="btn-o big" id="spinBtn" ${attempt ? 'hidden' : ''}>• Radicar demanda</button>
          <div id="spinResult" aria-live="polite"></div>
        </div>
      </div>
    </section>`;

    const folders = $$('.folder');
    const settle = (a) => {
      $('#folders').classList.add('settled');
      folders.forEach((f, i) => { f.classList.toggle('chosen', i === a.segmentIndex); f.classList.add('flipped'); });
    };
    if (attempt) { settle(attempt); showSpinResult(attempt, true); return; }

    $('#spinBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Repartiendo…';
      try {
        const { attempt: a } = await api('/api/eval/spin', { method: 'POST' });
        if (!reduceMotion) {
          const r = (n) => (Math.random() * 2 - 1) * n;
          await Promise.all(folders.map((f) => {
            const kf = [{ transform: 'none' }];
            for (let k = 0; k < 5; k++) kf.push({ transform: `translate(${r(110).toFixed(0)}px, ${r(70).toFixed(0)}px) rotate(${r(16).toFixed(1)}deg)` });
            kf.push({ transform: 'none' });
            return f.animate(kf, { duration: 2300, easing: 'cubic-bezier(.6,0,.35,1)' }).finished;
          }));
          if (!btn.isConnected) return;
          folders[a.segmentIndex].classList.add('chosen');
          await wait(450);
          folders[a.segmentIndex].classList.add('flipped');
          await wait(900);
          if (!btn.isConnected) return;
        }
        settle(a);
        btn.hidden = true;
        showSpinResult(a, false);
      } catch (ex) { toast(ex.message, true); btn.disabled = false; btn.textContent = '• Radicar demanda'; }
    });
  }

  function showSpinResult(a, resumed) {
    const box = $('#spinResult');
    box.innerHTML = `
      <div class="spin-result">
        <p class="plabel">( ${resumed ? 'Tu demanda está en' : 'Tu demanda correspondió a'} )</p>
        <p class="sr-title">${esc(a.despachoTitle)}</p>
        <p class="sr-q"><b>${a.numQuestions}</b> preguntas${a.bonus ? ` · <mark>+${dec(a.bonus)} en tu nota</mark>` : ''}</p>
        <button class="btn-o big" id="startQuiz">• ${resumed ? 'Continuar evaluación' : 'Comenzar evaluación'}</button>
      </div>`;
    $('#startQuiz').addEventListener('click', () => renderQuiz(a));
    if (!resumed) { box.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); if (a.bonus) toast('¡Cumplimiento inmediato! +0,5 en tu nota final.'); }
  }

  function renderQuiz(a) {
    const key = `cumplir-eval-${a.id}`;
    const saved = store.get(key) || {};
    const answers = saved.answers || {};
    let i = clamp(Number(saved.i) || 0, 0, a.questions.length - 1);
    let advance; let sending = false;
    const t0 = saved.t0 || Date.now();

    view.innerHTML = `<section class="quiz ruled" id="quiz"></section>`;
    document.body.classList.add('in-quiz');
    onLeave(() => document.body.classList.remove('in-quiz'));
    const root = $('#quiz');
    const save = () => store.set(key, { answers, i, t0 });
    const timer = setInterval(() => { const el = $('#qTime'); if (!el) return; const s = Math.floor((Date.now() - t0) / 1000); el.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }, 1000);
    onLeave(() => clearInterval(timer));

    const draw = () => {
      const q = a.questions[i];
      const answered = Object.keys(answers).length;
      const isCase = q.type === 'caso';
      root.innerHTML = `
        <div class="wrap">
          <div class="quiz-top">
            <span class="plabel">( Folio ${pad(i + 1)} / ${pad(a.questions.length)} · ${esc(a.despachoTitle)}${a.bonus ? ' · <span class="o">+0,5</span>' : ''} )</span>
            <span class="q-time" id="qTime">00:00</span>
          </div>
          <div class="qdots">${a.questions.map((qq, k) => `<button class="qdot${answers[qq.id] != null ? ' answered' : ''}${k === i ? ' current' : ''}" data-k="${k}" aria-label="Pregunta ${k + 1}">${k + 1}</button>`).join('')}</div>
          <div class="quiz-progress"><i style="width:${(answered / a.questions.length) * 100}%"></i></div>
          <div class="question swap-in">
            <p class="q-meta"><span class="q-type t-${q.type}">${esc(TYPE_LABEL[q.type] || 'Pregunta')}</span><span>${esc(q.topic)}</span></p>
            ${isCase ? `<div class="case-note c-yellow"><p>${esc(q.q)}</p></div>` : `<p class="q-text">${esc(q.q)}</p>`}
            <div class="options opts-${q.type}" role="group" aria-label="Opciones de respuesta">
              ${q.options.map((o, k) => `<button class="option${answers[q.id] === k ? ' selected' : ''}" aria-pressed="${answers[q.id] === k}" data-opt="${k}"><span class="letter">${q.type === 'opcion' ? LETTERS[k] : k + 1}</span><span>${esc(o)}</span></button>`).join('')}
            </div>
          </div>
          <div class="quiz-nav">
            <button class="btn-line" id="prevQ" ${i === 0 ? 'disabled' : ''}>← Anterior</button>
            <span class="kbd-hint">Teclas ${q.type === 'opcion' ? 'A–D' : `1–${q.options.length}`} para responder · ← → para navegar</span>
            ${i < a.questions.length - 1 ? '<button class="btn-o" id="nextQ">Siguiente →</button>' : `<button class="btn-o big" id="submitQ">• Enviar respuestas (${answered}/${a.questions.length})</button>`}
          </div>
        </div>`;
      const choose = (k) => {
        answers[q.id] = k; save();
        clearTimeout(advance); draw();
        // Un solo avance pendiente: con doble clic no se salta preguntas ni se sale del rango.
        if (i < a.questions.length - 1) advance = setTimeout(() => { if (!root.isConnected) return; i = Math.min(i + 1, a.questions.length - 1); save(); draw(); }, 420);
      };
      $$('.option', root).forEach((b) => b.addEventListener('click', () => choose(+b.dataset.opt)));
      const goTo = (k) => { clearTimeout(advance); i = clamp(k, 0, a.questions.length - 1); save(); draw(); };
      $$('.qdot', root).forEach((b) => b.addEventListener('click', () => goTo(+b.dataset.k)));
      $('#prevQ')?.addEventListener('click', () => goTo(i - 1));
      $('#nextQ')?.addEventListener('click', () => goTo(i + 1));
      $('#submitQ')?.addEventListener('click', submit);
      quizKeys = (e) => {
        if (!root.isConnected) { quizKeys = null; return; }
        const kk = e.key.toUpperCase();
        const idx = q.type === 'opcion' ? LETTERS.indexOf(kk) : Number(kk) - 1;
        if (idx >= 0 && idx < q.options.length && (q.type === 'opcion' ? LETTERS.includes(kk) : /^[1-9]$/.test(kk))) { e.preventDefault(); choose(idx); } else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(i - 1); }
      };
      window.scrollTo({ top: 0 });
    };

    async function submit(e) {
      if (sending) return;
      const missing = a.questions.filter((q) => answers[q.id] == null).length;
      if (missing > 0 && !confirm(`Tienes ${missing} pregunta(s) sin responder. Las preguntas sin respuesta cuentan como incorrectas. ¿Enviar de todos modos?`)) return;
      if (missing === 0 && !confirm('¿Enviar tus respuestas? Esta acción es definitiva.')) return;
      const btn = e?.currentTarget; sending = true; if (btn) btn.disabled = true;
      try {
        const { attempt } = await api('/api/eval/submit', { method: 'POST', body: { answers } });
        store.del(key); quizKeys = null;
        renderResults(attempt, true);
      } catch (ex) {
        sending = false; if (btn) btn.disabled = false;
        toast(ex.message, true);
        // Si el envío sí llegó (p. ej. se cortó la respuesta), el intento ya está cerrado: mostrar la nota.
        if (state.user) api('/api/eval/status').then(({ attempt }) => { if (attempt?.status === 'done' && root.isConnected) { store.del(key); quizKeys = null; renderResults(attempt); } }).catch(() => {});
      }
    }
    draw();
  }

  function renderResults(a, fresh = false) {
    quizKeys = null;
    document.body.classList.remove('in-quiz');
    const passed = a.passed;
    const { maxScore } = state.evalConfig;
    view.innerHTML = `
    <section class="verdict-hero ${passed ? 'pass' : 'fail'}">
      <div class="wrap">
        <div class="sentence">
          <p class="doc-head">SENTENCIA · EVALUACIÓN DE LA ACCIÓN DE CUMPLIMIENTO</p>
          <p class="sent-meta">Demandante: <b>${esc(state.user.name)}</b> · Despacho: <b>${esc(a.despachoTitle)}</b> · ${fmtDate(a.finishedAt)}</p>
          <div class="score-row">
            <p class="score-num"><b data-count="${a.score}" data-decimals="1" data-dur="1600">${dec(a.score)}</b><small> / ${dec(maxScore)}</small></p>
            <span class="stamp big ${passed ? 'ok' : 'bad'}">${passed ? 'Aprobado' : 'No aprobado'}</span>
          </div>
          <p class="doc-head">RESUELVE</p>
          <ol class="resuelve">
            <li><b>PRIMERO.</b> Declarar que el demandante respondió correctamente <b>${a.correct} de ${a.numQuestions}</b> preguntas.</li>
            <li><b>SEGUNDO.</b> ${a.bonus ? `Reconocer <b>+${dec(a.bonus)}</b> por cumplimiento inmediato (art. 15).` : 'Sin bonificación por el despacho asignado.'}</li>
            <li><b>TERCERO.</b> Calificar con nota de <b>${dec(a.score)}</b>, que ${passed ? '<b>aprueba</b>' : '<b>no alcanza</b>'} el mínimo de ${dec(state.evalConfig.passScore)}.</li>
          </ol>
          ${passed ? `<div class="burst result-burst" aria-hidden="true">${ILL.burst}</div>` : ''}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="wrap" id="reviewBox">${reviewHTML(a)}</div>
    </section>
    ${footer()}`;
    bindReview(a);
    if (fresh) toast(passed ? '¡Evaluación enviada! Aprobaste.' : 'Evaluación enviada. Tu nota quedó registrada.');
    scrollToY(0, true);
    observe();
  }

  // Retroalimentación: las respuestas correctas solo llegan cuando la docente publica las soluciones
  // (así nadie las saca con cuentas de prueba mientras la clase presenta).
  function reviewHTML(a) {
    if (!a.solutionsPublished) {
      return `
        ${label('Retroalimentación')}
        <div class="pending-solutions">
          <h2 class="h2">soluciones en espera</h2>
          <p class="body-l">Las respuestas correctas y la explicación de cada pregunta se publicarán cuando la docente cierre la evaluación.</p>
          <p class="small-print" id="solutionsHint">Esta página revisa sola cada 20 segundos.</p>
          <button class="btn-line" id="checkSolutions">Revisar de nuevo</button>
        </div>
        <div class="row-btns"><a class="btn-o" href="#/procedencia">• Repasar la procedencia</a><a class="btn-line" href="#/casos">Ir a los casos</a></div>`;
    }
    return `
        ${label('Retroalimentación')}
        <h2 class="h2">revisa tus respuestas</h2>
        <div class="review">
          ${a.questions.map((q, k) => {
            const ok = q.chosen === q.answer;
            const opt = (n) => (q.type === 'opcion' ? `${LETTERS[n]}. ` : '') + esc(q.options[n]);
            return `<div class="review-item reveal"><span class="mark ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✕'}</span><div>
              <p class="q-meta"><span>${pad(k + 1)}</span><span class="q-type t-${q.type}">${esc(TYPE_LABEL[q.type] || '')}</span><span>${esc(q.topic)}</span></p>
              <h4>${esc(q.q)}</h4>
              <p>Tu respuesta: <b>${q.chosen == null ? 'Sin responder' : opt(q.chosen)}</b></p>
              ${ok ? '' : `<p>Respuesta correcta: <b>${opt(q.answer)}</b></p>`}
              <p class="explain">${esc(q.explain)}</p></div></div>`;
          }).join('')}
        </div>
        <div class="row-btns"><a class="btn-o" href="#/procedencia">• Repasar la procedencia</a><a class="btn-line" href="#/casos">Ir a los casos</a></div>`;
  }

  // Mientras las soluciones no estén publicadas, se vuelve a consultar cada 20 s y con el botón.
  function bindReview(a) {
    if (a.solutionsPublished) return;
    let checking = false;
    const check = async (manual) => {
      if (checking || state.current !== 'evaluacion' || !$('#reviewBox')) return;
      checking = true;
      const btn = $('#checkSolutions');
      if (manual && btn) { btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = 'Revisando…'; }
      try {
        const { attempt } = await api('/api/eval/status');
        const box = $('#reviewBox');
        if (!box || state.current !== 'evaluacion') return;
        if (attempt?.status === 'done' && attempt.solutionsPublished) {
          clearInterval(poll);
          box.innerHTML = reviewHTML(attempt);
          observe();
          toast('La docente publicó las soluciones.');
        } else if (manual) toast('Las soluciones todavía no se han publicado.');
      } catch (ex) { if (manual) toast(ex.message, true); } finally {
        checking = false;
        const b = $('#checkSolutions');
        if (b) { b.disabled = false; b.classList.remove('is-loading'); b.textContent = 'Revisar de nuevo'; }
      }
    };
    $('#checkSolutions').addEventListener('click', () => check(true));
    const poll = setInterval(() => check(false), 20000);
    onLeave(() => clearInterval(poll));
  }

  // =========================================================
  // ADMIN
  // =========================================================
  const adminState = { q: '', sort: 'last', asc: false, live: false };

  // El panel se pinta una vez; "Actualizar", el modo en vivo y los reinicios solo cambian los datos en
  // su sitio (indicadores, gráficos, filas, actividad). Si nada cambió no se toca el DOM: sin parpadeo,
  // sin repetir animaciones y sin perder el foco ni el scroll.
  const admin = { data: null, sig: '' };

  async function renderAdmin() {
    if (state.user?.role !== 'admin') return go('/inicio');
    view.innerHTML = '<section class="section"><div class="wrap"><p class="body-l">Cargando panel…</p></div></section>';
    let data;
    try {
      if (!state.evalConfig) state.evalConfig = await api('/api/eval/config');
      data = await api('/api/admin/overview');
    } catch (ex) { view.innerHTML = `<section class="section"><div class="wrap"><p class="body-l">${esc(ex.message)}</p></div></section>`; return; }
    if (state.current !== 'admin') return; // se navegó a otra sección mientras cargaba

    view.innerHTML = `
    <section class="section admin-head ruled">
      <div class="wrap">
        <div class="admin-title-row">
          <div>${label('Administración · despacho de la docente')}<h1 class="ch-title">panel</h1></div>
          <div class="admin-actions">
            <button class="live-btn" id="liveBtn" aria-pressed="false"><span class="dot"></span><span class="live-t">Activar en vivo</span></button>
            <button class="btn-line" id="reloadAdmin">Actualizar</button>
            <a class="btn-o" href="/api/admin/export.csv">• Descargar CSV</a>
          </div>
        </div>
        <div class="kpis" id="kpis">
          <div class="kpi"><b data-k="total"></b><span>Registrados</span></div>
          <div class="kpi"><b data-k="done"></b><span>Evaluaciones terminadas</span></div>
          <div class="kpi"><b data-k="progress"></b><span>En curso</span></div>
          <div class="kpi c-orange"><b data-k="avg"></b><span>Promedio</span></div>
          <div class="kpi"><b data-k="passed"></b><span>Aprobados</span></div>
        </div>
        <div class="solutions-row">
          <div><p class="vt-label">Soluciones para los estudiantes</p><p class="body" id="solutionsState"></p></div>
          <button class="btn-line" id="solutionsBtn" aria-pressed="false"></button>
        </div>
        <div class="admin-charts">
          <div class="chart-card">
            <p class="vt-label">Distribución de notas</p>
            <div class="hist" id="hist"></div>
          </div>
          <div class="chart-card">
            <p class="vt-label">Preguntas con menos aciertos</p>
            <div id="hardList"></div>
          </div>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="wrap">
        <div class="table-tools">
          <div>${label('Estudiantes y notas')}<input class="search" id="adminSearch" type="search" placeholder="Buscar estudiante…" value="${esc(adminState.q)}" aria-label="Buscar estudiante"></div>
        </div>
        <div class="table-wrap" data-native-scroll><table class="data">
          <thead><tr>
            <th data-sort="name">Estudiante</th><th data-sort="created">Registro</th><th data-sort="last">Último ingreso</th><th data-sort="logins">Ingresos</th>
            <th>Despacho</th><th data-sort="correct">Aciertos</th><th data-sort="score">Nota</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody id="adminRows"></tbody>
        </table></div>
      </div>
    </section>
    <section class="section admin-activity">
      <div class="wrap split-2">
        <div>${label('Actividad reciente')}<h2 class="h2">ingresos</h2></div>
        <ul class="activity" id="activity"></ul>
      </div>
    </section>`;

    admin.data = null; admin.sig = '';
    paintAdmin(data);
    paintLive();

    $('#adminSearch').addEventListener('input', (e) => { adminState.q = e.target.value; drawAdminRows(); });
    $('#reloadAdmin').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      await refreshAdmin(true);
      b.disabled = false;
    });
    $$('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      if (adminState.sort === th.dataset.sort) adminState.asc = !adminState.asc; else { adminState.sort = th.dataset.sort; adminState.asc = th.dataset.sort === 'name'; }
      drawAdminRows();
    }));
    $('#liveBtn').addEventListener('click', () => { adminState.live = !adminState.live; paintLive(); scheduleLive(); if (adminState.live) refreshAdmin(); });
    $('#solutionsBtn').addEventListener('click', toggleSolutions);
    // Delegado: las filas se repintan, el listener no.
    $('#adminRows').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-reset]');
      if (!b) return;
      if (!confirm(`¿Reiniciar la evaluación de ${b.dataset.name}? Se borrará su reparto y su nota, y podrá presentarla de nuevo.`)) return;
      b.disabled = true;
      try { await api('/api/admin/attempts/' + b.dataset.reset, { method: 'DELETE' }); toast('Evaluación reiniciada.'); await refreshAdmin(); } catch (ex) { b.disabled = false; toast(ex.message, true); }
    });
  }

  function paintLive() {
    const b = $('#liveBtn');
    if (!b) return;
    b.classList.toggle('on', adminState.live);
    b.setAttribute('aria-pressed', adminState.live);
    $('.live-t', b).textContent = adminState.live ? 'En vivo' : 'Activar en vivo';
  }

  async function refreshAdmin(manual = false) {
    try {
      const data = await api('/api/admin/overview');
      if (state.current === 'admin' && $('#adminRows')) paintAdmin(data);
      if (manual) toast('Panel actualizado.');
    } catch (ex) { if (manual) toast(ex.message, true); }
  }

  function paintAdmin(data) {
    const sig = JSON.stringify(data);
    if (sig === admin.sig) return; // nada cambió: no se toca el DOM
    admin.sig = sig; admin.data = data;
    const s = data.students;
    const done = s.filter((x) => x.status === 'done');
    const avg = done.length ? done.reduce((t, x) => t + x.score, 0) / done.length : null;
    const values = {
      total: s.length, done: done.length, progress: s.filter((x) => x.status === 'in_progress').length,
      avg: avg == null ? '—' : dec(avg), passed: done.filter((x) => x.score >= data.passScore).length,
    };
    $$('#kpis [data-k]').forEach((b) => { const v = String(values[b.dataset.k]); if (b.textContent !== v) b.textContent = v; });

    const bins = [0, 1, 2, 3, 4].map((b) => done.filter((x) => (b === 4 ? x.score >= 4 : x.score >= b && x.score < b + 1)).length);
    const maxBin = Math.max(1, ...bins);
    const hist = $('#hist');
    if (!hist.children.length) hist.innerHTML = bins.map((_, b) => `<div class="hist-col"><span class="hist-n"></span><i class="${b >= 3 ? 'pass' : ''}"></i><span class="hist-l">${b},0–${b === 4 ? '5,0' : `${b},9`}</span></div>`).join('');
    $$('.hist-col', hist).forEach((col, b) => { $('.hist-n', col).textContent = bins[b]; $('i', col).style.height = `${(bins[b] / maxBin) * 100}%`; });

    const hardest = data.questions.slice(0, 6);
    $('#hardList').innerHTML = hardest.length
      ? `<ul class="hard">${hardest.map((q) => { const p = Math.round((q.correct / q.asked) * 100); return `<li><div class="hard-top"><span>${esc(q.topic)}</span><b>${p}%</b></div><p>${esc(q.q)}</p><div class="bar"><i style="width:${p}%"></i></div><small>${q.correct} de ${q.asked} acertaron</small></li>`; }).join('')}</ul>`
      : '<p class="body">Aún no hay evaluaciones terminadas.</p>';

    $('#activity').innerHTML = data.activity.length
      ? data.activity.map((x) => `<li><span>${esc(x.name)} <em>· ${x.kind === 'register' ? 'se registró' : 'ingresó'}</em></span><span>${fmtDate(x.at)}</span></li>`).join('')
      : '<li>Aún no hay ingresos de estudiantes.</li>';

    paintSolutions(!!data.solutionsPublished);
    drawAdminRows();
  }

  function paintSolutions(published) {
    const b = $('#solutionsBtn');
    if (!b) return;
    b.dataset.published = published ? '1' : '';
    b.setAttribute('aria-pressed', published);
    b.classList.toggle('on', published);
    b.textContent = published ? 'Soluciones publicadas · Ocultar' : 'Publicar soluciones';
    $('#solutionsState').textContent = published
      ? 'Los estudiantes que terminaron ven las respuestas correctas y las explicaciones.'
      : 'Ocultas: los estudiantes solo ven su nota. Publícalas cuando todos hayan terminado.';
  }

  async function toggleSolutions(e) {
    const b = e.currentTarget;
    const publish = !b.dataset.published;
    const msg = publish
      ? '¿Publicar las soluciones? Quienes ya terminaron verán las respuestas correctas y las explicaciones.'
      : '¿Ocultar de nuevo las soluciones?';
    if (!confirm(msg)) return;
    b.disabled = true;
    try {
      const { solutionsPublished } = await api('/api/admin/solutions', { method: 'POST', body: { published: publish } });
      paintSolutions(!!solutionsPublished);
      toast(solutionsPublished ? 'Soluciones publicadas.' : 'Soluciones ocultas.');
      refreshAdmin();
    } catch (ex) { toast(ex.message, true); }
    b.disabled = false;
  }

  function drawAdminRows() {
    const tbody = $('#adminRows');
    if (!tbody || !admin.data) return;
    const data = admin.data;
    const segTitle = (x) => state.evalConfig?.segments[x.segment_index]?.title || x.despacho;
    const sorters = {
      name: (x) => x.name.toLowerCase(), created: (x) => x.created_at || '', last: (x) => x.last_login || x.created_at || '',
      logins: (x) => x.logins, correct: (x) => x.correct ?? -1, score: (x) => x.score ?? -1,
    };
    const q = adminState.q.toLowerCase();
    const rows = data.students.filter((x) => x.name.toLowerCase().includes(q)).sort((x, y) => {
      const a = sorters[adminState.sort](x); const b = sorters[adminState.sort](y);
      return (a > b ? 1 : a < b ? -1 : 0) * (adminState.asc ? 1 : -1);
    });
    const html = rows.length ? rows.map((x) => `
        <tr>
          <td><b>${esc(x.name)}</b></td>
          <td class="nowrap" data-label="Registro">${fmtDate(x.created_at)}</td>
          <td class="nowrap" data-label="Último ingreso">${fmtDate(x.last_login)}</td>
          <td data-label="Ingresos">${x.logins}</td>
          <td data-label="Despacho">${x.despacho ? (x.bonus ? `<span class="badge bonus">${esc(segTitle(x))}</span>` : esc(segTitle(x))) : '—'}</td>
          <td data-label="Aciertos">${x.status === 'done' ? `${x.correct} / ${x.num_questions}` : '—'}</td>
          <td data-label="Nota">${x.status === 'done' ? `<span class="grade ${x.score >= data.passScore ? 'pass' : 'fail'}">${dec(x.score)}</span>` : '—'}</td>
          <td data-label="Estado">${x.status === 'done' ? '<span class="badge">Terminada</span>' : x.status === 'in_progress' ? '<span class="badge live">En curso</span>' : '<span class="badge muted">Sin iniciar</span>'}</td>
          <td>${x.attempt_id ? `<button class="link-btn" data-reset="${x.attempt_id}" data-name="${esc(x.name)}">Reiniciar</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="9" class="empty">No hay estudiantes que coincidan.</td></tr>';
    if (tbody._html === html) return;
    // Si el foco estaba en un botón de una fila, vuelve al mismo botón tras repintar.
    const focused = document.activeElement?.closest?.('#adminRows [data-reset]')?.dataset.reset;
    tbody.innerHTML = html;
    tbody._html = html;
    if (focused) $(`#adminRows [data-reset="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    $$('th[data-sort]').forEach((th) => { th.classList.toggle('sorted', th.dataset.sort === adminState.sort); th.classList.toggle('asc', th.dataset.sort === adminState.sort && adminState.asc); });
  }

  // Modo en vivo: actualiza los datos cada 5 s (útil para proyectar el avance de la clase).
  let liveTimer = null;
  function scheduleLive() {
    clearInterval(liveTimer);
    if (!adminState.live) return;
    liveTimer = setInterval(() => {
      if (state.current !== 'admin') { clearInterval(liveTimer); return; }
      refreshAdmin();
    }, 5000);
  }

  // =========================================================
  // ROUTER
  // =========================================================
  const ROUTES = {
    inicio: renderHome, procedencia: renderProcedencia, tramite: renderTramite, comparativo: renderComparativo, casos: renderCasos,
    evaluacion: renderEvaluacion, admin: renderAdmin, ingresar: () => renderAuth('login'), registro: () => renderAuth('register'),
  };
  const LABELS = Object.fromEntries([...CHAPTERS.map((c) => [c.path.slice(1), `( ${c.n} ) ${c.title.toLowerCase()}`]), ['admin', 'panel'], ['ingresar', 'bienvenido'], ['registro', 'registro']]);

  let navSeq = 0;
  async function route() {
    let path = location.hash.slice(1) || '/inicio';
    // Un hash que no es ruta (#view, #algo): si es un ancla de la vista actual se deja; si no, se
    // reemplaza por la ruta actual (o el inicio) para no dejar la página en blanco.
    if (!path.startsWith('/')) {
      let anchor = null;
      try { anchor = state.current && view.querySelector('#' + CSS.escape(path)); } catch { /* id inválido */ }
      if (anchor) return;
      history.replaceState(null, '', '#/' + (state.current || 'inicio'));
      if (state.current) return;
      path = '/inicio';
    }
    const [, section] = path.split('/');
    const fn = ROUTES[section];
    if (!fn) return go('/inicio');

    // Todo exige sesión salvo el ingreso y el registro.
    const isAuth = section === 'ingresar' || section === 'registro';
    if (!state.user && !isAuth) { state.after = '/' + section; return go('/ingresar'); }
    if (state.user && isAuth) return go(state.user.role === 'admin' ? '/admin' : '/inicio');
    if (section === 'admin' && state.user.role !== 'admin') return go('/inicio');

    // Entre "Iniciar sesión" y "Crear cuenta" no hay cortina: es un cambio de pestaña, no de capítulo.
    const authSwap = isAuth && (state.current === 'ingresar' || state.current === 'registro');
    const changing = state.current && state.current !== section && !authSwap;
    const nav = ++navSeq;
    if (changing) await curtainIn(LABELS[section]);
    if (nav !== navSeq) return; // otra navegación empezó durante la cortina
    runCleanups();
    quizKeys = null;
    state.current = section;
    renderChrome();
    closeUserMenu();
    scrollToY(0, true);
    if (section === 'admin') scheduleLive(); else clearInterval(liveTimer);
    await fn();
    if (nav !== navSeq) return;
    observe();
    $$('[data-top]', view).forEach((b) => b.addEventListener('click', () => scrollToY(0)));
    onScrollChrome();
    curtainOut();
    view.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('view:rendered', { detail: { section } }));
  }

  window.addEventListener('hashchange', route);

  (async () => {
    try { const { user } = await api('/api/auth/me'); state.user = user; if (user) claimLocal(user); } catch { state.user = null; }
    route();
  })();
})();
