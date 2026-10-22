// Límite de intentos de login: servidores propios con umbrales bajos (por variables de entorno) para no esperar minutos.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, uniqueName } from '../helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('bloqueo por nombre', () => {
  let srv;
  before(async () => { srv = await startServer({ port: 3926, name: 'login-nombre', env: { LOGIN_MAX_FAILS: '3', LOGIN_LOCK_MS: '1200', LOGIN_IP_MAX_FAILS: '1000' } }); });
  after(async () => { await srv?.stop(); });

  async function student() {
    const c = new Client(srv.base);
    const name = uniqueName('Bloqueo');
    assert.equal((await c.register(name, 'clave-buena')).status, 201);
    return name;
  }
  const login = (name, password) => new Client(srv.base).req('POST', '/api/auth/login', { name, password });

  test('tras N fallos seguidos responde 429 con Retry-After, incluso con la clave correcta', async () => {
    const name = await student();
    assert.equal((await login(name, 'mala')).status, 401);
    assert.equal((await login(name, 'mala')).status, 401);
    const third = await login(name, 'mala');
    assert.equal(third.status, 429);
    assert.match(third.data.error, /^Demasiados intentos fallidos\. Espera \d+ segundos e inténtalo de nuevo\.$/);
    assert.equal(third.headers.get('retry-after'), '2');
    const right = await login(name, 'clave-buena');
    assert.equal(right.status, 429, 'el bloqueo no debe dejar pasar ni la clave correcta');
    assert.ok(Number(right.headers.get('retry-after')) >= 1);
  });

  test('el bloqueo de un nombre no afecta a los demás', async () => {
    const a = await student();
    const b = await student();
    for (let i = 0; i < 3; i++) await login(a, 'mala');
    assert.equal((await login(a, 'clave-buena')).status, 429);
    assert.equal((await login(b, 'clave-buena')).status, 200);
  });

  test('el nombre se compara normalizado: no se evade con mayúsculas o tildes', async () => {
    const name = await student();
    await login(name, 'mala');
    await login(name.toUpperCase(), 'mala');
    assert.equal((await login(' ' + name + '\u200B', 'mala')).status, 429);
  });

  test('al vencer el bloqueo se puede entrar, y un ingreso correcto reinicia el contador', async () => {
    const name = await student();
    for (let i = 0; i < 3; i++) await login(name, 'mala');
    await sleep(1300);
    assert.equal((await login(name, 'clave-buena')).status, 200);
    // Contador en cero: dos fallos más no bloquean.
    assert.equal((await login(name, 'mala')).status, 401);
    assert.equal((await login(name, 'mala')).status, 401);
    assert.equal((await login(name, 'clave-buena')).status, 200);
  });

  test('cada bloqueo siguiente dura el doble', async () => {
    const name = await student();
    for (let i = 0; i < 3; i++) await login(name, 'mala');
    await sleep(1300); // vence el primer bloqueo (1,2 s) sin ingresar bien
    let r;
    for (let i = 0; i < 3; i++) r = await login(name, 'mala');
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('retry-after'), '3', 'el segundo bloqueo debería ser de 2,4 s');
  });

  test('sin errores no controlados', () => {
    assert.ok(srv.alive);
    assert.ok(!/Uncaught|unhandled/i.test(srv.output), srv.output);
  });
});

describe('tope por IP', () => {
  let srv;
  before(async () => { srv = await startServer({ port: 3927, name: 'login-ip', env: { LOGIN_MAX_FAILS: '100', LOGIN_IP_MAX_FAILS: '5' } }); });
  after(async () => { await srv?.stop(); });

  test('muchos fallos desde la misma IP con nombres distintos terminan en 429', async () => {
    const c = new Client(srv.base);
    for (let i = 0; i < 5; i++) {
      const r = await c.req('POST', '/api/auth/login', { name: uniqueName('Nadie'), password: 'x' });
      assert.ok([401, 429].includes(r.status));
    }
    const r = await c.req('POST', '/api/auth/login', { name: uniqueName('Nadie'), password: 'x' });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  });
});
