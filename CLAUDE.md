# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Guía interactiva (en español) basada en el trabajo *La acción de cumplimiento (art. 87 CP, Ley 393 de 1997 y art. 146 CPACA)* (Yury Carolina Ochoa Álvarez, 2026). Los estudiantes la recorren desde sus celulares: el ingreso (nombre + contraseña) es obligatorio desde la primera pantalla, y al final presentan una evaluación calificada en el servidor; un administrador ve resultados, publica las soluciones y exporta CSV. Misma arquitectura que el proyecto anterior de APP (derecho comparado).

**Cero dependencias en tiempo de ejecución**: solo módulos nativos de Node (`node:http`, `node:sqlite`, `node:crypto`); `npm start` no necesita `npm install`. La única devDependency es Playwright, fijada en 1.63.0 porque es la versión cuyo Chromium está descargado (solo para `test:e2e`). No hay bundler, framework ni linter. No añadas dependencias sin que se pida.

## Comandos

```bash
npm start          # http://localhost:3100 (PORT para cambiar el puerto)
npm run dev        # igual, con --watch
node --check public/js/app.js   # verificación de sintaxis (no hay linter)
npm test                        # unitarias + integración de la API (node:test)
npm run test:e2e                # Playwright/Chromium (requiere npm install)
npm run test:e2e:carga          # 50 usuarios simultáneos en el navegador (USERS, CONCURRENCY)
npm run test:stress             # carga: STUDENTS=150 para más estudiantes
node --test --test-name-pattern="doble clic" "tests/unit/*.test.mjs"   # una sola prueba
```

- Requiere Node ≥ 22.13 (`node:sqlite`).
- Límite de login (en memoria): `LOGIN_MAX_FAILS` (5 fallos seguidos por nombre), `LOGIN_LOCK_MS` (30 s, se duplica en cada bloqueo, máx. 15 min) y `LOGIN_IP_MAX_FAILS` (100 fallos/min por IP: en el aula todos comparten IP). `COOKIE_SECURE=1` añade `Secure` a la cookie (también si llega `x-forwarded-proto: https`). `EXPOSE_TEST_INFO=1` habilita `GET /api/debug/static-cache` (solo pruebas).
- Variables de entorno: `PORT`, `DB_PATH` (por defecto `data/app.db`), `ADMIN_USER` / `ADMIN_PASSWORD` (solo se leen al crear el admin en el **primer arranque**; sin `ADMIN_PASSWORD` se genera una clave aleatoria que se imprime una vez). No escribas contraseñas en el README, el código ni este archivo. Para regenerar la base, borra `data/app.db*`.
- Las pruebas arrancan su propio `server.js` con `DB_PATH` en `tests/.tmp/`; nunca usan `data/app.db` (en `.gitignore`).
- Los cambios en `public/` no requieren reiniciar el servidor (`Cache-Control: no-cache` + ETag; los archivos nuevos aparecen en ≤1 s).

## Arquitectura

**Backend (`server.js`)** — un único `http.createServer`; `/api/*` pasa por `api()`, una cadena de `if (route === 'MÉTODO /ruta')`. Las rutas `/api/auth/*` van antes del `if (!user) return 401`, y `/api/admin/*` tras la comprobación de `role === 'admin'`. Cualquier ruta sin extensión devuelve `index.html` (SPA).
- **Estáticos**: solo se sirven archivos de la lista exacta de `public/` (sensible a mayúsculas, reescaneada como mucho 1 vez/s); rutas con `:`, barra invertida o byte nulo → 400. Esto evita que en Windows `/CSS/STYLES.CSS` o `::$DATA` abran el mismo archivo y llenen la caché. Caché en memoria por ruta canónica con ETag (304), gzip si el cliente lo acepta y `stat` reutilizado 1 s (no compite con scrypt en el pool de hilos).
- **Cabeceras**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy: same-origin` en API, estáticos y CSV (`SECURITY_HEADERS`).
- **Login**: `lockRemaining`/`registerFail` por `name_key` y por IP; bloqueado → 429 con `Retry-After` sin calcular scrypt; un ingreso correcto reinicia el contador.
- **Nombres**: `cleanName` (NFKC, sin `\p{Cf}`, controles a espacio, espacios colapsados) y `NAME_RE` (letras, números, espacios y `. ' -`, mínimo 2 letras) → 400 si no cumple. `nameKey` parte de `cleanName`, así un nombre con caracteres invisibles no duplica a otro.
- **CSV**: separador `;` y coma decimal (Excel en español); celdas que empiezan por `= + - @` se neutralizan con `'`.

**Base de datos (`src/db.js`)** — `CREATE TABLE IF NOT EXISTS` al importarse (sin migraciones). Tablas: `users`, `sessions`, `logins`, `attempts`, `settings` (clave/valor; `solutions_published`) (la columna `despacho` guarda la etiqueta corta del despacho; el nombre largo sale de `SEGMENTS[segment_index]`). Usuarios identificados por `name_key` (sin tildes, minúsculas). scrypt asíncrono en las peticiones.

**Evaluación — la lógica sensible vive en el servidor:**
- `src/questions.js`: banco con `type` (`opcion` 4 opciones, `vf` 2, `caso` 3: Procede / Es improcedente / Se rechaza), `answer` y `explain`. **Nunca** se carga en el navegador. `attemptView(a)`: en curso, solo preguntas y opciones; terminado, nota, aciertos, lo elegido y `solutionsPublished`, y `answer`/`explain` **solo si el admin publicó las soluciones** (`POST /api/admin/solutions {published}`). Si se mostraran al enviar, cuentas desechables sacarían todo el banco. El envío valida cada respuesta contra `q.options.length`.
- `SEGMENTS` en `server.js` son los despachos del «reparto» (se sortean en el servidor; el frontend los recibe por `GET /api/eval/config` y anima hasta `segmentIndex`). `pickQuestions` garantiza al menos un caso práctico.
- Un intento por estudiante; envío atómico (`UPDATE … AND status = 'in_progress'`). Nota = aciertos/total × 5 + bonus, tope 5,0; aprueba con 3,0.
- `GET /api/admin/overview` incluye `questions` (aciertos por pregunta, de menor a mayor, sin respuestas) y `solutionsPublished`.
- Las posiciones de la respuesta correcta en selección múltiple están equilibradas entre A–D (una prueba lo exige).

**Frontend (`public/`)** — SPA sin dependencias con hash routing (`#/inicio`, `#/procedencia`, `#/tramite`, `#/comparativo`, `#/casos`, `#/evaluacion`, `#/admin`).
- `public/js/content.js` define **globales** con todo el contenido académico (`CHAPTERS`, `LEVELS`, `TRAITS`, `NOT_ENFORCEABLE`, `STEPS`, `COMPARE`, `CASES`, `FAQ`, `CASE_LAW`, …). Para editar textos se toca este archivo, no `app.js`.
- `public/js/app.js` es un IIFE: helper `api()`, `state`, ilustraciones `ILL` (SVG a mano), efectos, una función `render*` por vista y `route()` al final. Escapa datos dinámicos con `esc()`. La usan estudiantes desde su celular: no hay modo exposición ni diapositivas (se quitaron a propósito; no lo reintroduzcas).
- **Sesión obligatoria**: toda ruta salvo `ingresar`/`registro` exige sesión; `state.after` guarda la ruta pedida (también cuando la API responde 401 a mitad de uso). Al cerrar sesión o al entrar otro usuario (`cumplir-owner`) se borran las claves `localStorage` `cumplir-*`.
- **Encabezado**: `nav#tabbar` es la misma navegación en escritorio (en el header) y en móvil (barra inferior fija, <900px). `#userBtn` abre `#userMenu` (sin `role=menu`) con `#logoutBtn`. `#readProgress` es la barra de lectura.
- El cuestionario registra sus propios atajos (A–D / 1–n, ← →) en `quizKeys`; `route()` los limpia.
- **Sentencia**: si `solutionsPublished` es falso no hay `.review-item`; se muestra el aviso con `#checkSolutions` y se reconsulta cada 20 s. El admin publica con `#solutionsBtn`.
- **Panel admin**: se dibuja una vez; «Actualizar» y el modo en vivo solo repintan datos en su sitio (y nada si no cambiaron), para no re-animar ni perder el foco.
- `public/js/fx.js` + `public/css/fx.css`: animaciones inspiradas en untold (grano, barrido en botones, títulos `data-fx="type"` que se escriben, palabra rotativa, resaltado de `mark`, grupos que caen, ilustraciones ligadas al scroll, salida del hero, movimiento en reposo, píldora del tabbar, estela del cursor). Se engancha a `document` `view:rendered` (que `route()` despacha tras cada render). Regla: el elemento que recibe hover/clic nunca se desplaza (mueve un hijo); nada puede dejar contenido invisible si un observador no dispara.
- Intervalos y temporizadores de una vista se registran con `onLeave(fn)` y se limpian al navegar. `route()` usa `navSeq` para descartar vistas lentas.
- Efectos activados por `observe()` (IntersectionObserver): `.wsplit` (palabras desde máscara), `.type` (máquina de escribir; `data-type-ms` fija la duración — no uses `data-speed`, que es el parallax), `.ghost` (texto fantasma), `svg.draw` (trazo; `.fill-o` = relleno naranja), `[data-count]` (contador), `.reveal`, `.stagger`, `.hscroll` (sticky horizontal).
- Scroll suave con inercia propio: la rueda se cede a contenedores que se desplazan en vertical o marcados con `data-native-scroll`.

## Diseño

Inspirado en untold.site: papel `--paper` con renglones (`.ruled`) y grano, tinta `--ink`, acento `--orange`, notas `--blue`/`--yellow`/`--green`/`--pink` (clases `c-*`), Jost ligera para display, Archivo para etiquetas `( ENTRE PARÉNTESIS )`, Caveat para notas a mano y Courier Prime para documentos (modelos, sentencia). Todos los efectos respetan `prefers-reduced-motion`. Interfaz y errores de la API en español. Ojo: `[hidden]` está forzado a `display: none !important` porque las clases de botones fijan `display`.
