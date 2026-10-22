# Acción de cumplimiento · Guía interactiva

Guía interactiva, pensada para el celular, basada en el trabajo *La acción de cumplimiento (art. 87 de la Constitución, Ley 393 de 1997 y art. 146 del CPACA)* (Yury Carolina Ochoa Álvarez, 2026), con evaluación final calificada.

## Requisitos

- Node.js 22.13 o superior (usa el módulo nativo `node:sqlite`; **no requiere `npm install`** para arrancar).

## Ejecutar

```bash
npm start
```

Abrir <http://localhost:3100>. El puerto se cambia con la variable `PORT`.

## Cómo se usa

- **Sesión obligatoria**: al entrar se pide registrarse o iniciar sesión (nombre completo + contraseña). Sin sesión, cualquier enlace lleva al ingreso y, tras entrar, vuelve a la página pedida.
- **Navegación**: en el celular, una barra de pestañas abajo (Inicio, Procedencia, Trámite, Diferencias, Casos, Evaluación); en escritorio, la misma navegación en el encabezado. El botón con las iniciales abre el menú de usuario con **Cerrar sesión**.
- **Evaluación**: un solo intento. Al enviar, el estudiante ve su nota; las respuestas correctas y las explicaciones aparecen cuando la docente pulsa **Publicar soluciones** en el panel.
- Al cerrar sesión se borra del navegador lo guardado (práctica de casos, lista de verificación, respuestas en curso), para que otra persona pueda usar el mismo celular.

## Administrador

El usuario administrador (`admin`, o el valor de `ADMIN_USER`) se crea en el **primer arranque**, cuando aún no existe la base de datos. Su contraseña se toma de la variable `ADMIN_PASSWORD`:

```powershell
$env:ADMIN_PASSWORD = "<su-clave>"; npm start
```

Si no se define `ADMIN_PASSWORD`, se genera una contraseña aleatoria y se muestra **una sola vez** en la consola. Use una clave larga: el nombre `admin` es conocido. Para empezar de cero, borre `data/app.db*`.

**Soluciones de la evaluación.** Al enviar, cada estudiante ve su nota, sus aciertos y lo que eligió, pero **no** las respuestas correctas ni las explicaciones hasta que el administrador las publique desde el panel (`POST /api/admin/solutions`). Así nadie puede sacar el banco con cuentas desechables mientras la clase presenta. Se pueden volver a ocultar.

**Seguridad del ingreso.**

- Tras 5 intentos fallidos seguidos con un mismo nombre, ese nombre queda bloqueado 30 s (cada bloqueo siguiente dura el doble, hasta 15 min); un ingreso correcto reinicia el contador. Hay además un tope de 100 fallos por minuto por IP (en el aula todos comparten IP). Se ajusta con `LOGIN_MAX_FAILS`, `LOGIN_LOCK_MS` y `LOGIN_IP_MAX_FAILS`.
- Los nombres admiten letras, números, espacios y `. ' -`; los caracteres invisibles se eliminan, así nadie puede registrar un nombre que se vea igual al de un compañero.
- Si se publica detrás de HTTPS, defina `COOKIE_SECURE=1` (o el proxy debe enviar `x-forwarded-proto: https`).
- El CSV usa `;` y coma decimal (`4,2`), como lo espera Excel en español.

## Secciones

| Ruta | Contenido |
|------|-----------|
| `#/inicio` | Portada, antes de 1991, marco normativo (tres niveles), art. 146 CPACA, concepto, cinco rasgos, principios y finalidad, cumplimiento vs. nulidad |
| `#/procedencia` | Objeto, deber claro/expreso/exigible, lo que no puede exigirse, regla práctica interactiva, legitimación, particulares, renuencia e improcedencia |
| `#/tramite` | Caducidad, competencia interactiva, trámite paso a paso (desplazamiento horizontal), situaciones especiales, sentencia, impugnación y desacato |
| `#/comparativo` | Comparador con tutela, popular y nulidad; cuadro completo; temas avanzados |
| `#/casos` | Seis casos para resolver, lista de verificación, modelos de renuencia y demanda, preguntas frecuentes, jurisprudencia y conclusiones |
| `#/evaluacion` | **Reparto**: la demanda cae al azar en un despacho (Juzgado 6, Tribunal 8, Sección Quinta 10 preguntas, o art. 15: 5 preguntas + 0,5). Preguntas de selección múltiple, verdadero o falso y casos. Nota de 0,0 a 5,0 (aprueba con 3,0), entregada como «sentencia» |
| `#/admin` | Solo admin: indicadores, distribución de notas, preguntas con menos aciertos, modo en vivo (se actualiza cada 5 s), tabla de estudiantes, CSV y reinicio de evaluaciones |

## Base de datos (`data/app.db`, SQLite)

- `users` — nombre, contraseña (scrypt + sal), rol, fecha de registro, último ingreso
- `sessions` — sesiones con cookie HttpOnly (7 días)
- `logins` — historial de cada registro e ingreso
- `attempts` — despacho asignado, preguntas, respuestas, aciertos, bonus y nota
- `settings` — ajustes globales (si las soluciones están publicadas)

El reparto y la calificación se resuelven en el servidor: el navegador nunca recibe las respuestas correctas antes de que el administrador publique las soluciones. Cada estudiante tiene una sola radicación; el administrador puede reiniciarla.

## Pruebas

Cada prueba arranca su propio `server.js` con una base temporal en `tests/.tmp/`: nunca toca `data/app.db`. Puertos usados: 3923 (API), 3930 (e2e) y 3935 (estrés).

```bash
npm test               # unitarias + integración de la API (node:test, sin dependencias)
npm run test:e2e       # extremo a extremo en Chromium (requiere npm install)
npm run test:stress    # carga: 60 estudiantes simultáneos + consultas del admin
```

- Para el e2e, `npm install` instala Playwright 1.63.0 (solo para pruebas). Si falta el navegador: `npx playwright install chromium`.
- Estrés con más estudiantes: `$env:STUDENTS=150; npm run test:stress`.

## Estructura

```
server.js            API REST + archivos estáticos
src/db.js            Esquema SQLite y usuario administrador
src/questions.js     Banco de 49 preguntas (con respuestas y explicaciones)
public/index.html    Página única
public/css/styles.css
public/js/content.js Contenido del trabajo (normas, trámite, casos, FAQ, jurisprudencia)
public/js/app.js     Enrutador, sesión, encabezado, vistas, reparto, evaluación y panel admin
public/js/fx.js      Animaciones inspiradas en untold.site
public/css/fx.css
```

## Diseño

Inspirado en <https://untold.site/en>: papel crema con renglones y grano, grafito y acento naranja, tipografía geométrica ligera (Jost), etiquetas entre paréntesis, texto que se escribe con cursor «|», texto fantasma que se rellena, ilustraciones a mano que se dibujan solas, notas adhesivas que se descubren con clic, círculos translúcidos sobre una palabra gigante, pestañas verticales tipo lomo de libro, cinta de texto en movimiento, cursor naranja con etiquetas, menú con revelado circular y cortina entre capítulos. Los efectos se desactivan con `prefers-reduced-motion`.
