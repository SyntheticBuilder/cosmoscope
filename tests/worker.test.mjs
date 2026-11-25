import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, day, hour, network, knownId } from '../worker/src/index.js';

// A memory store with the same behaviour as d1Store.
function memStore() {
  const seen = new Map(), caps = new Map(), keys = new Map(), h = new Map(), d = new Map();
  return {
    seen, caps, keys, h, d,
    async daySecret(dayStr) { if (!keys.has(dayStr)) keys.set(dayStr, 'k' + Math.random()); return keys.get(dayStr); },
    async mark(dayStr, key, pk, cap) {
      if ((caps.get(dayStr + '|' + pk) || 0) >= cap) return 'cap';
      const k = dayStr + '|' + key; if (seen.has(k)) return 'dup';
      seen.set(k, dayStr); caps.set(dayStr + '|' + pk, (caps.get(dayStr + '|' + pk) || 0) + 1); return 'new';
    },
    async add(hr, dayStr, id) {
      h.set(hr + '|' + id, (h.get(hr + '|' + id) || 0) + 1);
      d.set(dayStr + '|' + id, (d.get(dayStr + '|' + id) || 0) + 1);
    },
    async top(range, asOf) {
      const sums = new Map(), plus = (id, n) => sums.set(id, (sums.get(id) || 0) + n), h0 = hour(asOf);
      const hours = (from) => { for (const [k, n] of h) { const hr = Number(k.split('|')[0]); if (hr >= from && hr < h0) plus(k.slice(k.indexOf('|') + 1), n); } };
      if (range === 'day') hours(h0 - 24);
      else {
        const from = day(asOf - (range === 'week' ? 7 : 30) * 86400000), to = day(asOf);
        for (const [k, n] of d) { const ds = k.slice(0, 10); if (ds > from && ds < to) plus(k.slice(11), n); }
        hours(hour(Date.parse(to)));
      }
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

test('no IP address is stored, and marks hold no visitor-wide value', async () => {
  const store = memStore();
  await handle(visit('earth', { ip: '203.0.113.77' }), env, { store, now: NOW });
  await handle(visit('mars', { ip: '203.0.113.77' }), env, { store, now: NOW });
  const all = JSON.stringify([...store.seen, ...store.caps]);
  assert.ok(!all.includes('203.0.113.77'));
  assert.equal(store.caps.size, 1); // one per-network count, kept apart from the places
  assert.equal(new Set([...store.seen.keys()]).size, 2);
});

test('a new day uses a new random key', async () => {
  const store = memStore();
  await handle(visit('earth'), env, { store, now: NOW });
  await handle(visit('earth'), env, { store, now: NOW + 86400000 });
  assert.equal(store.keys.size, 2);
  assert.notEqual(store.keys.get('2026-11-20'), store.keys.get('2026-11-21'));
  const [a, b] = [...store.seen.keys()].map((k) => k.split('|')[1]);
  assert.notEqual(a, b);
});

test('only places the app can show are counted', async () => {
  const store = memStore();
  const newNames = async () => new Set(['TOI-4324 b']);
  const st = async (id) => (await handle(visit(id), env, { store, now: NOW, newNames })).status;
  for (const id of ['saturn', 'sgra', 'universe', 'star:42', 'con:Ori', 'con:UMa', 'new:TOI-4324 b']) assert.equal(await st(id), 204, id);
  for (const id of ['zz1', 'notaplace', 'con:Xyz', 'con:ori', 'new:Fake 1 b', 'star:109400']) assert.equal(await st(id), 400, id);
  assert.equal(await knownId('new:TOI-4324 b', async () => new Set()), false); // feed not readable: refuse
});

test('a whole IPv6 /64 counts as one network', async () => {
  assert.equal(network('203.0.113.7'), '203.0.113.7');
  assert.equal(network('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(network('2001:0DB8:0001:0002:ffff:1:2:3'), '2001:db8:1:2::/64');
  assert.equal(network('2001:db8::5'), '2001:db8:0:0::/64');
  assert.equal(network('::1'), '0:0:0:0::/64');
  const store = memStore();
  await handle(visit('saturn', { ip: '2001:db8:1:2::1' }), env, { store, now: NOW });
  await handle(visit('saturn', { ip: '2001:db8:1:2::9999' }), env, { store, now: NOW });
  assert.equal(store.d.get('2026-11-20|saturn'), 1);
  await handle(visit('saturn', { ip: '2001:db8:1:3::1' }), env, { store, now: NOW });
  assert.equal(store.d.get('2026-11-20|saturn'), 2);
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
  const LATER = NOW + 6 * 3600000; // the next 6-hour mark (18:00 UTC)
  const get = async (range) => (await (await handle(top(range), env, { store, now: LATER, topCache: new Map() })).json()).places;
  assert.deepEqual(await get('day'), [{ id: 'saturn', n: 5 }]);
  assert.deepEqual(await get('week'), [{ id: 'saturn', n: 5 }, { id: 'vega', n: 4 }]);
  assert.deepEqual(await get('month'), [{ id: 'sgra', n: 6 }, { id: 'saturn', n: 5 }, { id: 'vega', n: 4 }]);
  for (let s = 0; s < 12; s++) await many('star:' + s, 3, NOW);
  assert.equal((await get('day')).length, 10);
  assert.equal((await handle(top('year'), env, { store, now: NOW })).status, 400);
});

test('top lists change only at the 6-hour marks (00, 06, 12, 18 UTC)', async () => {
  const store = memStore();
  const many = async (id, n, now) => { for (let i = 0; i < n; i++) await handle(visit(id, { ip: '10.0.1.' + i }), env, { store, now }); };
  const get = async (now, cache = new Map()) => {
    const r = await handle(top('day'), env, { store, now, topCache: cache });
    return { places: (await r.json()).places, age: Number(r.headers.get('cache-control').match(/max-age=(\d+)/)[1]) };
  };
  await many('saturn', 3, NOW + 3600000); // 13:00, after the 12:00 mark
  assert.deepEqual((await get(NOW + 2 * 3600000)).places, []); // 14:00: still the 12:00 list
  assert.equal((await get(NOW + 2 * 3600000)).age, 4 * 3600); // browsers keep it until 18:00
  assert.deepEqual((await get(NOW + 6 * 3600000)).places, [{ id: 'saturn', n: 3 }]); // 18:00: shows up
  let calls = 0; const s = { ...store, top: async () => { calls++; return []; } }; const cache = new Map();
  for (const t of [0, 1, 5.9]) await handle(top('day'), env, { store: s, now: NOW + t * 3600000, topCache: cache });
  assert.equal(calls, 1);
  await handle(top('day'), env, { store: s, now: NOW + 6 * 3600000, topCache: cache });
  assert.equal(calls, 2);
});

test('a storage failure answers 503, not a crash', async () => {
  const s = { ...memStore(), top: async () => { throw new Error('D1 down'); } };
  assert.equal((await handle(top('day'), env, { store: s, now: NOW, topCache: new Map() })).status, 503);
});
