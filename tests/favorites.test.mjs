import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAV_KEY, COLL_KEY, TOP10_ID, LIMITS, validFavorite, loadFavs, saveFavs, loadColls, saveColls,
  autoName, cleanName, addItem, moveItem, removeItem, uniqueName, encodeShare, decodeShare, newId,
} from '../src/favorites.mjs';

const known = new Set(['saturn', 'earth', 'sgrA', 'star:5', 'star:7']);
const opts = { speeds: 8, isKnownId: (id) => known.has(id) };
const mk = (over = {}) => ({
  id: 'f1', name: 'Saturn · Nov 20, 2026', autoName: 'Saturn · Nov 20, 2026', created: 1700000000000,
  view: { t: [1.5, -2, 3], q: [0, 0, 0, 1], logD: 2.5, focus: 'saturn', anchor: null, off: null },
  time: { ms: 1795000000000, speedIdx: 3, dir: 1 }, frame: 'sun', ...over,
});
const mem = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };

test('validFavorite accepts a good favorite and rejects bad fields', () => {
  assert.equal(validFavorite(mk(), opts), true);
  const bad = [
    null, [], 'x', mk({ id: '' }), mk({ id: 'x'.repeat(40) }), mk({ name: '' }), mk({ name: 'n'.repeat(61) }),
    mk({ autoName: 5 }), mk({ created: NaN }), mk({ frame: 'moon' }),
    mk({ view: { ...mk().view, t: [1, 2, NaN] } }), mk({ view: { ...mk().view, q: [0, 0, 0, 0] } }),
    mk({ view: { ...mk().view, logD: 31 } }), mk({ view: { ...mk().view, focus: 'nope' } }),
    mk({ view: { ...mk().view, anchor: 'nope', off: [0, 0, 0] } }),
    mk({ time: { ms: 1, speedIdx: 8, dir: 1 } }), mk({ time: { ms: 1, speedIdx: 1.5, dir: 1 } }),
    mk({ time: { ms: 1, speedIdx: 1, dir: 2 } }), mk({ time: { ms: 'x', speedIdx: 1, dir: 1 } }),
  ];
  for (const b of bad) assert.equal(validFavorite(b, opts), false, JSON.stringify(b));
});

test('validFavorite ignores inherited properties', () => {
  const f = Object.create(mk());
  assert.equal(validFavorite(f, opts), false);
});

test('round trip: encode then decode keeps values (after rounding)', () => {
  const f = mk({ view: { t: [1.23456789, -2.5, 3000000.123], q: [0.123456, 0.2, -0.3, 0.9], logD: 2.123456, focus: null, anchor: 'earth', off: [0.123456, 1, -2] } });
  const link = encodeShare({ name: 'Mine ✨ 日本', items: [f] });
  assert.ok(link.startsWith('1.'));
  assert.ok(/^[A-Za-z0-9_.-]+$/.test(link));
  const d = decodeShare(link, opts);
  assert.equal(d.name, 'Mine ✨ 日本');
  assert.equal(d.items.length, 1);
  const g = d.items[0];
  assert.deepEqual(g.view.t, [1.234568, -2.5, 3000000]);
  assert.deepEqual(g.view.q, [0.1235, 0.2, -0.3, 0.9]);
  assert.equal(g.view.logD, 2.1235);
  assert.deepEqual(g.view.off, [0.1235, 1, -2]);
  assert.equal(g.view.anchor, 'earth');
  assert.equal(g.view.focus, null);
  assert.deepEqual(g.time, f.time);
  assert.equal(g.frame, 'sun');
  assert.equal(g.name, f.name);
  assert.ok(validFavorite(g, opts));
});

test('t keeps 7 significant digits for huge and tiny values', () => {
  const f = mk({ view: { ...mk().view, t: [123456789012, 0.000012345678, -9.8765432] } });
  const g = decodeShare(encodeShare({ name: 'a', items: [f] }), opts).items[0];
  assert.deepEqual(g.view.t, [123456800000, 0.00001234568, -9.876543]);
});

test('bad prefixes, garbage and empty lists give null', () => {
  const ok = encodeShare({ name: 'a', items: [mk()] });
  assert.equal(decodeShare('2.' + ok.slice(2), opts), null);
  assert.equal(decodeShare('garbage', opts), null);
  assert.equal(decodeShare('1.@@@@', opts), null);
  assert.equal(decodeShare('1.', opts), null);
  assert.equal(decodeShare(null, opts), null);
  assert.equal(decodeShare(undefined, opts), null);
  assert.equal(decodeShare(encodeShare({ name: 'a', items: [] }), opts), null);
  assert.equal(decodeShare('1.' + 'A'.repeat(300000), opts), null);
});

const raw = (obj) => '1.' + Buffer.from(JSON.stringify(obj)).toString('base64url');
const row = (over = []) => {
  const r = ['n', [1, 2, 3], [0, 0, 0, 1], 1, 'saturn', null, null, 1700000000000, 2, 1, 'sun', null];
  over.forEach(([i, v]) => { r[i] = v; });
  return r;
};

test('hostile payloads drop items and never throw', () => {
  const hostile = [
    row([[1, [1, 2, 'NaN']]]), row([[1, [1, 2, null]]]), row([[4, 'star:999999999']]), row([[4, '__proto__']]),
    row([[0, 'x'.repeat(61)]]), row([[0, 'x'.repeat(10 * 1024 * 1024)]]), row([[8, 99]]), row([[9, 0]]), row([[9, '1']]),
    row([[10, 'moon']]), row([[1, [[1], [2], [3]]]]), row([[2, [[0], 0, 0, 1]]]), row([[3, 1e9]]), row([[7, 'NaN']]),
    row([[11, 5]]), row([[11, 'x'.repeat(100)]]), [1, 2, 3], 'str', null, 7, {},
  ];
  for (const h of hostile) assert.equal(decodeShare(raw({ n: 'x', i: [h] }), opts), null, JSON.stringify(h).slice(0, 80));
  assert.equal(decodeShare('1.' + Buffer.from('{"__proto__":{"i":[1]}}').toString('base64url'), opts), null);
  assert.equal(decodeShare('1.' + Buffer.from('not json').toString('base64url'), opts), null);
  assert.equal(decodeShare('1.' + Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url'), opts), null);
  assert.equal(decodeShare(raw({ n: 'x', i: 'nope' }), opts), null);
  assert.equal({}.polluted, undefined);
  const d = decodeShare(raw({ n: 'x', i: [row([[1, [1, 2, NaN]]]), row()] }), opts);
  assert.equal(d.items.length, 1);
});

test('__proto__ keys inside a payload do not pollute or leak', () => {
  const s = '1.' + Buffer.from('{"n":"x","__proto__":{"polluted":1},"i":[' + JSON.stringify(row()) + ']}').toString('base64url');
  const d = decodeShare(s, opts);
  assert.equal(d.items.length, 1);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(d.items[0]), Object.prototype);
});

test('51 items become 50; items over 60 characters are dropped', () => {
  const rows = Array.from({ length: 51 }, () => row());
  const d = decodeShare(raw({ n: 'x', i: rows }), opts);
  assert.equal(d.items.length, 50);
  const ids = new Set(d.items.map((x) => x.id));
  assert.equal(ids.size, 50);
  const e = encodeShare({ name: 'x', items: Array.from({ length: 60 }, () => mk()) });
  assert.equal(decodeShare(e, opts).items.length, 50);
  const d2 = decodeShare(raw({ n: 'x', i: [row([[0, 'y'.repeat(61)]]), row([[0, 'y'.repeat(60)]])] }), opts);
  assert.equal(d2.items.length, 1);
});

test('a long list name is capped to 60; missing name gets a fallback', () => {
  assert.equal(decodeShare(raw({ n: 'z'.repeat(500), i: [row()] }), opts).name.length, 60);
  assert.ok(decodeShare(raw({ i: [row()] }), opts).name.length > 0);
});

test('stars: lookup, matching names and mismatches', () => {
  const star = (name) => row([[4, 'star:5'], [11, name]]);
  const lazy = { speeds: 8, isKnownId: (id) => (id.startsWith('star:') ? 'lookup' : known.has(id)), starName: () => null };
  const d = decodeShare(raw({ n: 'x', i: [star('Vega')] }), lazy);
  assert.equal(d.items[0].needsLookup, true);
  const loaded = { ...opts, starName: (i) => (i === 5 ? 'Vega' : null) };
  assert.equal(decodeShare(raw({ n: 'x', i: [star('Vega')] }), loaded).items[0].needsLookup, undefined);
  assert.equal(decodeShare(raw({ n: 'x', i: [star('Altair')] }), loaded).items[0].needsLookup, true);
  assert.equal(decodeShare(raw({ n: 'x', i: [row([[4, 'star:6'], [11, 'Vega']])] }), loaded), null); // unknown, not 'lookup'
  assert.equal(decodeShare(raw({ n: 'x', i: [row([[4, 'zzz']])] }), lazy), null); // non-star unknown drops
  const g = decodeShare(encodeShare({ name: 'a', items: [mk({ starName: 'Vega', view: { ...mk().view, focus: 'star:5' } })] }), loaded);
  assert.equal(g.items[0].starName, 'Vega');
});

test('cleanName trims, caps and falls back; autoName formats', () => {
  assert.equal(cleanName('  Hello  ', 'auto'), 'Hello');
  assert.equal(cleanName('   ', 'auto'), 'auto');
  assert.equal(cleanName('', 'auto'), 'auto');
  assert.equal(cleanName(null, 'auto'), 'auto');
  assert.equal(cleanName('a'.repeat(100), 'auto').length, 60);
  assert.equal(autoName('Saturn', 'Nov 20, 2026'), 'Saturn · Nov 20, 2026');
  assert.ok(autoName('L'.repeat(200), 'Nov 20, 2026').length <= LIMITS.name);
  assert.ok(autoName('L'.repeat(200), 'Nov 20, 2026').endsWith(' · Nov 20, 2026'));
});

test('addItem reports dup and full', () => {
  const c = { id: 'c', name: 'C', items: [] };
  const a = addItem(c, mk());
  assert.deepEqual([a.ok, a.reason, a.coll.items.length], [true, null, 1]);
  assert.equal(c.items.length, 0);
  const d = addItem(a.coll, mk());
  assert.deepEqual([d.ok, d.reason], [false, 'dup']);
  let top = { id: TOP10_ID, name: 'T', items: [] };
  for (let i = 0; i < 10; i++) top = addItem(top, mk({ id: 'a' + i }), LIMITS.top10).coll;
  assert.equal(addItem(top, mk({ id: 'z' }), LIMITS.top10).reason, 'full');
  let big = { id: 'b', name: 'B', items: [] };
  for (let i = 0; i < 50; i++) big = addItem(big, mk({ id: 'a' + i })).coll;
  assert.equal(addItem(big, mk({ id: 'z' })).reason, 'full');
  const cp = addItem(c, mk()).coll.items[0];
  assert.notEqual(cp, mk());
  assert.notEqual(cp.view, a.coll.items[0].view);
});

test('moveItem edges do nothing; removeItem removes', () => {
  const c = { id: 'c', name: 'C', items: [mk({ id: 'a' }), mk({ id: 'b' }), mk({ id: 'c' })] };
  assert.equal(moveItem(c, 0, -1), c);
  assert.equal(moveItem(c, 2, 1), c);
  assert.equal(moveItem(c, 5, 1), c);
  assert.deepEqual(moveItem(c, 0, 1).items.map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(c, 2, -1).items.map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(c.items.map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(removeItem(c, 1).items.map((x) => x.id), ['a', 'c']);
  assert.equal(removeItem(c, 9), c);
});

test('uniqueName adds (2), (3)', () => {
  assert.equal(uniqueName('Trip', []), 'Trip');
  assert.equal(uniqueName('Trip', ['Trip']), 'Trip (2)');
  assert.equal(uniqueName('Trip', ['Trip', 'Trip (2)']), 'Trip (3)');
  assert.ok(uniqueName('t'.repeat(60), ['t'.repeat(60)]).length <= 60);
});

test('load and save favorites: round trip, bad JSON, throwing storage, bad entries', () => {
  const s = mem();
  assert.equal(saveFavs(s, [mk(), mk({ id: 'f2' })]), true);
  assert.deepEqual(loadFavs(s, opts).map((f) => f.id), ['f1', 'f2']);
  assert.equal(s.m[FAV_KEY].includes('needsLookup'), false);
  assert.deepEqual(loadFavs(mem({ [FAV_KEY]: '{oops' }), opts), []);
  assert.deepEqual(loadFavs(mem({ [FAV_KEY]: '{"a":1}' }), opts), []);
  assert.deepEqual(loadFavs(null, opts), []);
  const boom = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(loadFavs(boom, opts), []);
  assert.equal(saveFavs(boom, [mk()]), false);
  assert.equal(saveFavs(null, []), false);
  const mixed = mem({ [FAV_KEY]: JSON.stringify([mk(), { junk: 1 }, mk(), mk({ id: 'f3', frame: 'x' }), mk({ id: 'f4' })]) });
  assert.deepEqual(loadFavs(mixed, opts).map((f) => f.id), ['f1', 'f4']); // junk, duplicate and invalid dropped
  const many = mem({ [FAV_KEY]: JSON.stringify(Array.from({ length: 250 }, (_, i) => mk({ id: 'k' + i }))) });
  assert.equal(loadFavs(many, opts).length, 200);
});

test('load and save collections: Top 10 always first, caps, bad data', () => {
  assert.deepEqual(loadColls(mem(), opts), [{ id: TOP10_ID, name: 'My Top 10', items: [] }]);
  assert.equal(loadColls(mem({ [COLL_KEY]: 'nope' }), opts)[0].id, TOP10_ID);
  const boom = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(loadColls(boom, opts)[0].id, TOP10_ID);
  assert.equal(saveColls(boom, []), false);
  const s = mem();
  const cs = [{ id: 'c1', name: 'Mine', items: [mk()] }, { id: TOP10_ID, name: 'My Top 10', items: Array.from({ length: 12 }, (_, i) => mk({ id: 'a' + i })) }];
  assert.equal(saveColls(s, cs), true);
  const back = loadColls(s, opts);
  assert.equal(back[0].id, TOP10_ID);
  assert.equal(back[0].items.length, 10);
  assert.equal(back[1].name, 'Mine');
  assert.equal(back[1].items[0].id, 'f1');
  const lots = mem({ [COLL_KEY]: JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, name: 'N' + i, items: [] }))) });
  assert.equal(loadColls(lots, opts).length, 30);
  const bad = mem({ [COLL_KEY]: JSON.stringify([{ id: 'c1', name: '', items: [] }, { id: 'c2', name: 'ok', items: 'no' }, { id: 'c3', name: 'ok', items: [{ x: 1 }, mk()] }, null]) });
  const r = loadColls(bad, opts);
  assert.deepEqual(r.map((c) => c.id), [TOP10_ID, 'c3']);
  assert.equal(r[1].items.length, 1);
});

test('stored star items keep their needsLookup flag when the name differs', () => {
  const star = mk({ starName: 'Vega', view: { ...mk().view, focus: 'star:5' } });
  const s = mem({ [FAV_KEY]: JSON.stringify([star]) });
  const o = { ...opts, starName: () => 'Altair' };
  assert.equal(loadFavs(s, o)[0].needsLookup, true);
  assert.equal(loadFavs(s, { ...opts, starName: () => 'Vega' })[0].needsLookup, undefined);
});

test('newId gives distinct short strings', () => {
  const a = newId(), b = newId();
  assert.notEqual(a, b);
  assert.ok(a.length > 0 && a.length < 40);
});

test('names are measured in code points everywhere', () => {
  const e60 = cleanName('😀'.repeat(60), 'auto');
  assert.equal(Array.from(e60).length, 60);
  assert.equal(validFavorite(mk({ name: e60, autoName: e60 }), opts), true);
  assert.equal(Array.from(cleanName('😀'.repeat(61), 'auto')).length, 60);
  assert.equal(validFavorite(mk({ name: '😀'.repeat(61) }), opts), false);
  const s = mem(); saveFavs(s, [mk({ name: e60, autoName: e60 })]);
  assert.equal(loadFavs(s, opts).length, 1);
  assert.equal(decodeShare(encodeShare({ name: 'a', items: [mk({ name: e60 })] }), opts).items.length, 1);
});

test('autoName and uniqueName never leave lone surrogates', () => {
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  for (const n of [55, 56, 57, 58, 59, 60]) {
    const a = autoName('😀'.repeat(n), '😀 Nov 20, 2026');
    assert.equal(lone.test(a), false);
    assert.ok(Array.from(a).length <= 60);
    const u = uniqueName('😀'.repeat(n), ['😀'.repeat(n)]);
    assert.equal(lone.test(u), false);
    assert.ok(Array.from(u).length <= 60);
  }
});
