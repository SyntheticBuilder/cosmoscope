import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, day, hour } from '../worker/src/index.js';

// A memory store with the same behaviour as d1Store.
function memStore() {
  const seen = new Map(), h = new Map(), d = new Map();
  return {
    seen, h, d,
    async mark(dayStr, key, pk, cap) {
      const used = [...seen.values()].filter((v) => v.day === dayStr && v.pk === pk).length;
      if (used >= cap) return 'cap';
      const k = dayStr + '|' + key; if (seen.has(k)) return 'dup';
      seen.set(k, { day: dayStr, pk }); return 'new';
    },
    async add(hr, dayStr, id) {
      h.set(hr + '|' + id, (h.get(hr + '|' + id) || 0) + 1);
      d.set(dayStr + '|' + id, (d.get(dayStr + '|' + id) || 0) + 1);
    },
    async top(range, now) {
      const sums = new Map();
      if (range === 'day') { for (const [k, n] of h) { const [hr, id] = [Number(k.split('|')[0]), k.slice(k.indexOf('|') + 1)]; if (hr > hour(now) - 24) sums.set(id, (sums.get(id) || 0) + n); } }
      else { const from = day(now - (range === 'week' ? 7 : 30) * 86400000); for (const [k, n] of d) { const [ds, id] = [k.slice(0, 10), k.slice(11)]; if (ds > from) sums.set(id, (sums.get(id) || 0) + n); } }
      return [...sums].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10).map(([id, n]) => ({ id, n }));
    },
  };
}
const ORIGIN = 'https://syntheticbuilder.github.io';
const env = { SALT: 'test-secret' };
const NOW = Date.UTC(2026, 10, 20, 12);
const visit = (id, { ip = '1.2.3.4', origin = ORIGIN, body } = {}) => new Request('https://c.example/visit', {
  method: 'POST', headers: { origin, 'cf-connecting-ip': ip, 'content-type': 'text/plain' }, body: body ?? JSON.stringify({ id }),
});
const top = (range, origin = ORIGIN) => new Request('https://c.example/top?range=' + range, { headers: { origin } });

test('a visit counts once per person per place per day', async () => {
  const store = memStore();
  assert.equal((await handle(visit('saturn'), env, { store, now: NOW })).status, 204);
  assert.equal((await handle(visit('saturn'), env, { store, now: NOW + 1000 })).status, 204);
  assert.equal(store.d.get('2026-11-20|saturn'), 1);
  await handle(visit('saturn', { ip: '5.6.7.8' }), env, { store, now: NOW });
  assert.equal(store.d.get('2026-11-20|saturn'), 2);
  await handle(visit('saturn'), env, { store, now: NOW + 86400000 }); // next day counts again
  assert.equal(store.d.get('2026-11-21|saturn'), 1);
});

test('no IP address is stored', async () => {
  const store = memStore();
  await handle(visit('earth', { ip: '203.0.113.77' }), env, { store, now: NOW });
  assert.ok(!JSON.stringify([...store.seen]).includes('203.0.113.77'));
});

test('bad bodies and ids are refused and nothing is stored', async () => {
  const store = memStore();
  for (const body of ['nope', '[]', '{"id":"__proto__x"}', '{"__proto__":{"id":"earth"}}', JSON.stringify({ id: 'x'.repeat(300) }), '{"id":"star:999999"}', '{"id":"<script>"}']) {
    assert.equal((await handle(visit(null, { body }), env, { store, now: NOW })).status, 400, body);
  }
  assert.equal(store.seen.size, 0);
});

test('only the site (and localhost) may count', async () => {
  const store = memStore();
  assert.equal((await handle(visit('earth', { origin: 'https://evil.example' }), env, { store, now: NOW })).status, 403);
  const r = await handle(visit('earth', { origin: 'http://localhost:8080' }), env, { store, now: NOW });
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  const t = await handle(top('day', 'https://evil.example'), env, { store, now: NOW });
  assert.equal(t.headers.get('access-control-allow-origin'), null);
});

test('one person can add at most 300 places a day', async () => {
  const store = memStore();
  for (let i = 0; i < 300; i++) await handle(visit('star:' + i), env, { store, now: NOW });
  assert.equal((await handle(visit('star:300'), env, { store, now: NOW })).status, 429);
});

test('top lists: ranges, at least 3 visits, at most 10', async () => {
  const store = memStore();
  const many = async (id, n, now) => { for (let i = 0; i < n; i++) await handle(visit(id, { ip: '10.0.0.' + i }), env, { store, now }); };
  await many('saturn', 5, NOW); await many('mars', 2, NOW); await many('vega', 4, NOW - 3 * 86400000); await many('sgra', 6, NOW - 20 * 86400000);
  const get = async (range) => (await (await handle(top(range), env, { store, now: NOW, topCache: new Map() })).json()).places;
  assert.deepEqual(await get('day'), [{ id: 'saturn', n: 5 }]);
  assert.deepEqual(await get('week'), [{ id: 'saturn', n: 5 }, { id: 'vega', n: 4 }]);
  assert.deepEqual(await get('month'), [{ id: 'sgra', n: 6 }, { id: 'saturn', n: 5 }, { id: 'vega', n: 4 }]);
  for (let s = 0; s < 12; s++) await many('star:' + s, 3, NOW);
  assert.equal((await get('day')).length, 10);
  assert.equal((await handle(top('year'), env, { store, now: NOW })).status, 400);
});

test('top lists are cached for 5 minutes', async () => {
  const store = memStore(); let calls = 0; const s = { ...store, top: async () => { calls++; return []; } };
  const cache = new Map();
  await handle(top('day'), env, { store: s, now: NOW, topCache: cache });
  await handle(top('day'), env, { store: s, now: NOW + 60000, topCache: cache });
  assert.equal(calls, 1);
  await handle(top('day'), env, { store: s, now: NOW + 6 * 60000, topCache: cache });
  assert.equal(calls, 2);
});

test('a storage failure answers 503, not a crash', async () => {
  const s = { ...memStore(), top: async () => { throw new Error('D1 down'); } };
  assert.equal((await handle(top('day'), env, { store: s, now: NOW, topCache: new Map() })).status, 503);
});
