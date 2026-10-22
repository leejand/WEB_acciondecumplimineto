// Banco de preguntas (src/questions.js) y su uso real en el reparto (POST /api/eval/spin).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer, Client, uniqueName } from '../helpers.mjs';
import { ROOT } from '../helpers.mjs';

const require = createRequire(import.meta.url);
const QUESTIONS = require(path.join(ROOT, 'src', 'questions.js'));
const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
const OPTIONS = { opcion: 4, vf: 2, caso: 3 };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

describe('banco de preguntas', () => {
  test('ids enteros, únicos y tipos conocidos', () => {
    const ids = QUESTIONS.map((q) => q.id);
    assert.ok(ids.every((id) => Number.isInteger(id) && id > 0));
    assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
    for (const q of QUESTIONS) assert.ok(q.type in OPTIONS, `pregunta ${q.id}: tipo «${q.type}»`);
  });

  test('alcanza para el despacho más grande (10 preguntas) con variedad', () => {
    assert.ok(QUESTIONS.length >= 40, `solo hay ${QUESTIONS.length} preguntas`);
    const count = (t) => QUESTIONS.filter((q) => q.type === t).length;
    assert.ok(count('caso') >= 4, 'pocos casos prácticos: el reparto de 10 preguntas pide 2');
    assert.ok(count('vf') >= 5, 'pocas de verdadero o falso');
    assert.ok(count('opcion') >= QUESTIONS.length / 2, 'la mayoría deberían ser de selección múltiple');
    assert.ok(count('caso') / QUESTIONS.length <= 0.3, 'demasiados casos para el resto del banco');
  });

  test('número de opciones según el tipo, sin repetidas y respuesta válida', () => {
    for (const q of QUESTIONS) {
      assert.equal(q.options.length, OPTIONS[q.type], `pregunta ${q.id}`);
      assert.equal(new Set(q.options.map(norm)).size, q.options.length, `opciones repetidas en ${q.id}`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `respuesta inválida en ${q.id}`);
      assert.ok(q.options.every((o) => typeof o === 'string' && o.trim()), `opción vacía en ${q.id}`);
    }
  });

  test('verdadero o falso y casos usan las opciones estándar', () => {
    for (const q of QUESTIONS.filter((x) => x.type === 'vf')) assert.deepEqual(q.options, ['Verdadero', 'Falso'], `pregunta ${q.id}`);
    for (const q of QUESTIONS.filter((x) => x.type === 'caso')) assert.deepEqual(q.options, ['Procede', 'Es improcedente', 'Se rechaza'], `pregunta ${q.id}`);
  });

  test('las de verdadero o falso no tienen todas la misma respuesta', () => {
    const vf = QUESTIONS.filter((q) => q.type === 'vf').map((q) => q.answer);
    assert.ok(vf.includes(0) && vf.includes(1));
    const casos = new Set(QUESTIONS.filter((q) => q.type === 'caso').map((q) => q.answer));
    assert.ok(casos.size >= 2, 'todos los casos tienen el mismo veredicto');
  });

  test('las respuestas de selección múltiple están repartidas entre A, B, C y D', () => {
    const dist = [0, 0, 0, 0];
    for (const q of QUESTIONS.filter((x) => x.type === 'opcion')) dist[q.answer]++;
    const total = dist.reduce((a, b) => a + b, 0);
    // Un banco donde casi todo es «B» se adivina: cada letra debe rondar el 25 % (entre 15 % y 35 %).
    for (const n of dist) assert.ok(n / total >= 0.15 && n / total <= 0.35, `distribución de respuestas A–D: ${dist}`);
  });

  test('sin preguntas duplicadas por texto', () => {
    const seen = new Map();
    for (const q of QUESTIONS) {
      const k = norm(q.q);
      assert.ok(!seen.has(k), `las preguntas ${seen.get(k)} y ${q.id} tienen el mismo texto`);
      seen.set(k, q.id);
    }
  });

  test('enunciado, tema y explicación completos', () => {
    for (const q of QUESTIONS) {
      assert.ok(q.q.trim().length >= 20, `enunciado corto en ${q.id}`);
      assert.ok(q.topic && q.topic.trim(), `sin tema en ${q.id}`);
      assert.ok(q.explain && q.explain.trim().length >= 20, `explicación vacía o corta en ${q.id}`);
      if (q.type !== 'vf') assert.match(q.q, /[?:…]$|\?$/, `pregunta ${q.id} no termina en «?», «:» o «…»`);
      if (q.type === 'vf') assert.match(q.explain, /^(Verdadero|Falso)\b/, `la explicación de ${q.id} debería empezar por Verdadero o Falso`);
    }
  });

  test('la explicación de verdadero o falso coincide con la respuesta', () => {
    for (const q of QUESTIONS.filter((x) => x.type === 'vf')) {
      assert.equal(q.explain.startsWith('Verdadero') ? 0 : 1, q.answer, `pregunta ${q.id}: la explicación contradice la respuesta`);
    }
  });
});

describe('reparto real de preguntas (API)', () => {
  let srv; let segments;
  before(async () => {
    srv = await startServer({ port: 3924, name: 'preguntas' });
  });
  after(async () => { await srv?.stop(); });

  test('200 repartos: tamaño del despacho, al menos un caso, sin repetidas y sin respuestas', async () => {
    const N = 200; const BATCH = 25;
    const sizes = new Map(); const seenIds = new Set(); const seenSegments = new Set();
    for (let start = 0; start < N; start += BATCH) {
      const results = await Promise.all(Array.from({ length: Math.min(BATCH, N - start) }, async () => {
        const c = new Client(srv.base);
        const reg = await c.register(uniqueName('Reparto'));
        assert.equal(reg.status, 201);
        if (!segments) segments = (await c.get('/api/eval/config')).data.segments;
        const r = await c.post('/api/eval/spin');
        assert.equal(r.status, 201);
        return r.data;
      }));
      for (const { attempt: a } of results) {
        const ids = a.questions.map((q) => q.id);
        const seg = segments[a.segmentIndex];
        assert.equal(ids.length, seg.questions, `el despacho ${seg.title} pide ${seg.questions}`);
        assert.equal(new Set(ids).size, ids.length, `preguntas repetidas en un reparto: ${ids}`);
        const casos = a.questions.filter((q) => byId.get(q.id).type === 'caso').length;
        assert.ok(casos >= 1, `reparto sin casos prácticos: ${ids}`);
        assert.equal(casos, Math.max(1, Math.round(seg.questions / 5)), `casos esperados para ${seg.questions} preguntas`);
        for (const q of a.questions) {
          assert.equal(q.type, byId.get(q.id).type);
          assert.deepEqual(q.options, byId.get(q.id).options);
          assert.ok(!('answer' in q) && !('explain' in q), 'el reparto filtra la respuesta');
          seenIds.add(q.id);
        }
        sizes.set(seg.questions, (sizes.get(seg.questions) || 0) + 1);
        seenSegments.add(a.segmentIndex);
      }
    }
    // Con 200 sorteos, todos los despachos deberían salir y casi todo el banco debería usarse.
    assert.equal(seenSegments.size, segments.length, `despachos sorteados: ${[...seenSegments]}`);
    assert.ok(seenIds.size >= QUESTIONS.length * 0.9, `solo se usaron ${seenIds.size} de ${QUESTIONS.length} preguntas`);
    // El orden de las preguntas se mezcla: los casos no van siempre al final.
    assert.ok(srv.alive);
  });
});
