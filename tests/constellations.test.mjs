import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { segmentPairs, lineStars, meanDirection, perpendicular, constellationStats, englishPhrase, constellationCard, CON_SOURCE, CON_SHAPE_FACT } from '../src/constellations.mjs';

const row = (o) => ({ hip: null, hd: null, gl: '', bayer: '', flam: '', con: '', proper: '', ly: null, spect: '', mag: null, ...o });
const close = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('segmentPairs: chains become segments, duplicates and self-joins dropped', () => {
  assert.deepEqual(segmentPairs([[1, 2, 3], [3, 2], [4, 4, 5], [7]]), [[1, 2], [2, 3], [4, 5]]);
  assert.deepEqual(segmentPairs([]), []);
  assert.deepEqual(segmentPairs(undefined), []);
});

test('lineStars: unique indices in first-seen order', () => {
  assert.deepEqual(lineStars([[5, 2, 5], [2, 9]]), [5, 2, 9]);
});

test('meanDirection: equal weight per star, proper motion applied, empty → null', () => {
  // one star 1 unit along x, one 1000 units along y: the mean direction is 45° between them
  const pos = [1, 0, 0, 0, 1000, 0, 0, 0, 0];
  assert.ok(close(meanDirection([0, 1], pos), [Math.SQRT1_2, Math.SQRT1_2, 0]));
  // a star at the origin is ignored
  assert.ok(close(meanDirection([0, 2], pos), [1, 0, 0]));
  assert.equal(meanDirection([2], pos), null);
  assert.equal(meanDirection([], pos), null);
  // velocity moves the star: after 1 year star 0 sits at (1, 1, 0)
  const vel = [0, 1, 0, 0, 0, 0, 0, 0, 0];
  assert.ok(close(meanDirection([0], pos, vel, 1), [Math.SQRT1_2, Math.SQRT1_2, 0]));
});

test('perpendicular: unit, orthogonal, prefers the given axis, survives parallel input', () => {
  const p = perpendicular([1, 0, 0], [0, 0, 1]);
  assert.ok(close(p, [0, 0, 1]));
  const q = perpendicular([0, 0, 1], [0, 0, 1]); // parallel: falls back
  assert.ok(Math.abs(q[2]) < 1e-12 && Math.abs(Math.hypot(...q) - 1) < 1e-12);
  const d = [0.6, 0.0, 0.8]; const r = perpendicular(d);
  assert.ok(Math.abs(r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) < 1e-12 && Math.abs(Math.hypot(...r) - 1) < 1e-12);
});

test('constellationStats: counts per con and brightest by lowest magnitude', () => {
  const rows = [row({ con: 'Ori', mag: 1.6 }), row({ con: 'Ori', mag: 0.18 }), row({ con: 'Ori', mag: null }), row({ con: 'Lyr', mag: 0.03 }), row({ con: '' , mag: -1 })];
  const s = constellationStats(rows);
  assert.deepEqual(s.get('Ori'), { count: 3, brightest: 1, mag: 0.18 });
  assert.deepEqual(s.get('Lyr'), { count: 1, brightest: 3, mag: 0.03 });
  assert.equal(s.has(''), false);
});

test('englishPhrase: article only where it reads right', () => {
  assert.equal(englishPhrase({ name: 'Ursa Major', english: 'Great Bear' }), 'The Great Bear');
  assert.equal(englishPhrase({ name: 'Orion', english: 'Orion' }), 'Orion');
  assert.equal(englishPhrase({ name: 'Coma Berenices', english: "Bernice's Hair" }), "Bernice's Hair");
  assert.equal(englishPhrase({ name: 'Pictor', english: "Painter's Easel" }), "The Painter's Easel");
});

test('constellationCard: facts from data only', () => {
  const rows = [row({ con: 'Lyr', proper: 'Vega', mag: 0.03, ly: 25.04 }), row({ con: 'Lyr', bayer: 'Bet', mag: 3.5, ly: 960.1 }), row({ con: 'Lyr', mag: 9 })];
  const con = { abbr: 'Lyr', name: 'Lyra', english: 'Lyre', lines: [[0, 1], [1, 0]] };
  const c = constellationCard(con, rows, constellationStats(rows));
  assert.equal(c.title, 'Lyra');
  assert.equal(c.sub, 'Constellation · Lyre');
  assert.equal(c.hook, 'The Lyre, as seen from Earth.');
  assert.equal(c.source, CON_SOURCE);
  assert.equal(c.source, 'Stellarium modern sky culture (CC BY-SA 4.0) · HYG Database v4.1');
  assert.equal(c.con, 'Lyr');
  assert.deepEqual(c.facts, [
    'Brightest star: Vega, 25.04 light-years away.',
    'Our star catalog places 3 stars within its borders.',
    'Its line stars lie between 25.04 and 960.1 light-years from us.',
    CON_SHAPE_FACT,
  ]);
});

test('constellationCard: before star names load, uses star-field distances only', () => {
  const con = { abbr: 'Ori', name: 'Orion', english: 'Orion', lines: [[0, 1]] };
  const c = constellationCard(con, null, null, (i) => [500, 860][i]);
  assert.equal(c.sub, 'Constellation');
  assert.equal(c.hook, 'Orion, as seen from Earth.');
  assert.deepEqual(c.facts, ['Its line stars lie between 500 and 860 light-years from us.', CON_SHAPE_FACT]);
});

test('generated constellations.json: 88 entries, valid star indices, every abbr known to HYG names', () => {
  const data = JSON.parse(readFileSync(new URL('../public/constellations.json', import.meta.url), 'utf8'));
  assert.equal(data.length, 88);
  assert.equal(new Set(data.map((c) => c.abbr)).size, 88);
  for (const c of data) {
    assert.ok(c.name && c.english, c.abbr);
    assert.ok(segmentPairs(c.lines).length >= 1, c.abbr);
    for (const i of lineStars(c.lines)) assert.ok(Number.isInteger(i) && i >= 0 && i < 109400, `${c.abbr} ${i}`);
  }
});
