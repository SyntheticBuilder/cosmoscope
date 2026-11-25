import test from 'node:test';
import assert from 'node:assert/strict';
import { validId, visitMemory, shouldCount, fetchTop, sendVisit, VISIT_KEY, optedOut, OPTOUT_KEY } from '../src/trending.mjs';
import { STORIES } from '../src/stories.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) });

test('validId accepts the four shapes only', () => {
  for (const id of ['earth', 'alphacen', 'kepler16', 'star:0', 'star:109399', 'con:UMa', 'new:TOI-1234 b', "new:HD 1 b"]) assert.ok(validId(id), id);
  for (const id of ['', 'Earth', 'star:109400', 'star:-1', 'star:1e3', 'con:UMaj', 'con:U1a', 'new:', 'new:<b>', 'free:here',
    '__proto__', 'a'.repeat(25), 'new:' + 'x'.repeat(41), null, 42, {}, ['earth']]) assert.ok(!validId(id), String(id));
});

test('every story stop has an id the counter accepts', () => {
  for (const id of Object.keys(STORIES)) assert.ok(validId(id), id);
});

test('visitMemory keeps only today and survives broken storage', () => {
  const s = mem();
  const a = visitMemory(s, '2026-11-20'); a.add('earth');
  assert.ok(visitMemory(s, '2026-11-20').has('earth'));
  assert.ok(!visitMemory(s, '2026-11-21').has('earth'));
  s.m.set(VISIT_KEY, '{not json'); assert.ok(!visitMemory(s, '2026-11-20').has('earth'));
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  const b = visitMemory(bad, '2026-11-20'); b.add('mars'); assert.ok(b.has('mars'));
  assert.ok(!visitMemory(null, 'd').has('x'));
});

test('optedOut', () => {
  const s = mem(); assert.equal(optedOut(s), false); s.setItem(OPTOUT_KEY, '0'); assert.equal(optedOut(s), true);
  assert.equal(optedOut({ getItem() { throw new Error(); } }), false);
});

test('shouldCount', () => {
  const ok = { id: 'saturn', hadInput: true };
  assert.equal(shouldCount(ok), true);
  assert.equal(shouldCount({ ...ok, touring: true }), false);
  assert.equal(shouldCount({ ...ok, hadInput: false }), false);
  assert.equal(shouldCount({ ...ok, free: true }), false);
  assert.equal(shouldCount({ ...ok, optOut: true }), false);
  assert.equal(shouldCount({ ...ok, gpc: true }), false);
  assert.equal(shouldCount({ ...ok, id: 'free:x' }), false);
  assert.equal(shouldCount({ ...ok, id: null }), false);
});

test('fetchTop cleans the answer', async () => {
  const f = async () => res(200, { places: [{ id: 'mars', n: 4 }, { id: 'earth', n: 9 }, { id: '<b>', n: 99 }, { id: 'venus', n: 2 }, { id: 'mars', n: 4 }, null, { id: 'moon', n: 3.5 }] });
  assert.deepEqual(await fetchTop('https://x', 'day', f), [{ id: 'earth', n: 9 }, { id: 'mars', n: 4 }]);
  const many = { places: Array.from({ length: 15 }, (_, i) => ({ id: 'star:' + i, n: 20 - i })) };
  assert.equal((await fetchTop('https://x', 'week', async () => res(200, many))).length, 10);
});

test('fetchTop returns null on failure, never throws', async () => {
  assert.equal(await fetchTop('https://x', 'day', async () => res(500, {})), null);
  assert.equal(await fetchTop('https://x', 'day', async () => res(200, '{bad')), null);
  assert.equal(await fetchTop('https://x', 'day', async () => res(200, { places: 'no' })), null);
  assert.equal(await fetchTop('https://x', 'day', async () => { throw new Error('offline'); }), null);
  assert.equal(await fetchTop('', 'day', async () => res(200, { places: [] })), null);
  assert.equal(await fetchTop('https://x', 'year', async () => res(200, { places: [] })), null);
  const slow = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
  assert.equal(await fetchTop('https://x', 'day', slow, 30), null);
});

test('sendVisit posts a simple request and never throws', async () => {
  let seen = null;
  assert.equal(await sendVisit('https://x', 'earth', async (url, init) => { seen = { url, init }; return res(204); }), true);
  assert.equal(seen.url, 'https://x/visit');
  assert.equal(seen.init.headers['content-type'], 'text/plain'); // no CORS preflight
  assert.deepEqual(JSON.parse(seen.init.body), { id: 'earth' });
  assert.equal(await sendVisit('https://x', 'bad id', async () => res(204)), false);
  assert.equal(await sendVisit('https://x', 'earth', async () => { throw new Error(); }), false);
});
