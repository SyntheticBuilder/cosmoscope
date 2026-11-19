import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  CONSTELLATIONS, GREEK, parseStarIndex, starNames, normalize, buildSearchIndex, search,
} from '../src/catalog.mjs';

const row = (o) => ({ hip: null, hd: null, gl: '', bayer: '', flam: '', con: '', proper: '', ly: null, spect: '', mag: null, ...o });

const rows = [
  row({ hip: 1, hd: 224700, ly: 716.8, mag: 9.1 }),
  row({ hip: 71683, hd: 128620, bayer: 'Alp', con: 'Cen', proper: 'Rigil Kentaurus', ly: 4.37, mag: -0.01 }),
  row({ hip: 91262, hd: 172167, bayer: 'Alp', con: 'Lyr', proper: 'Vega', ly: 25.04, mag: 0.03 }),
  row({ hip: 54035, gl: 'Gl 699', ly: 5.96 }),
  row({ gl: 'GJ 1001', ly: 12.0 }),
  row({ hip: 1000, bayer: 'Kap-1', con: 'Scl', ly: 300 }),
  row({ hip: 104214, flam: '61', con: 'Cyg', ly: 11.4 }),
  row({ hip: 10, ly: 100 }),
  row({ hip: 100, ly: 50 }),
];
const extras = [
  { id: 'vega', name: 'Vega', kind: 'Star system', ly: 25, boost: 1 },
  { id: 'con:Cen', name: 'Centaurus', kind: 'Constellation', ly: null, boost: 1 },
];
const idx = buildSearchIndex(rows, extras);

test('88 constellations and 24 Greek letters', () => {
  assert.equal(Object.keys(CONSTELLATIONS).length, 88);
  assert.deepEqual(CONSTELLATIONS.Cen, { name: 'Centaurus', genitive: 'Centauri' });
  assert.equal(Object.keys(GREEK).length, 24);
  assert.deepEqual(GREEK.Alp, { name: 'Alpha', letter: 'α' });
});

test('parseStarIndex skips header, parses numbers, empties', () => {
  const t = '#hip\thd\n71683\t128620\t\tAlp\t\tCen\tRigil Kentaurus\t4.37\tG2V\t-0.01\n\t\tGJ 1\t\t\t\t\t12\t\t\n';
  const { rows: r } = parseStarIndex(t);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { hip: 71683, hd: 128620, gl: '', bayer: 'Alp', flam: '', con: 'Cen', proper: 'Rigil Kentaurus', ly: 4.37, spect: 'G2V', mag: -0.01 });
  assert.equal(r[1].hip, null);
  assert.equal(r[1].gl, 'GJ 1');
  assert.equal(r[1].mag, null);
});

test('starNames: Alpha Centauri', () => {
  assert.deepEqual(starNames(rows[1]).slice(0, 2), ['Rigil Kentaurus', 'Alpha Centauri']);
});
test('starNames: superscript Bayer, Flamsteed, Gliese, HD, HIP', () => {
  assert.ok(starNames(rows[5]).includes('Kappa¹ Sculptoris'));
  assert.ok(starNames(rows[6]).includes('61 Cygni'));
  assert.ok(starNames(rows[3]).includes('Gliese 699'));
  assert.ok(starNames(rows[4]).includes('GJ 1001'));
  assert.ok(starNames(rows[0]).includes('HD 224700'));
  assert.deepEqual(starNames(rows[0]), ['HD 224700', 'HIP 1']);
});
test('starNames never empty for real rows', () => {
  for (const r of rows) assert.ok(starNames(r).length > 0);
});

test('normalize', () => {
  assert.equal(normalize('α Cen'), normalize('alpha cen'));
  assert.equal(normalize('Kappa¹ Sculptoris'), 'kappa1 sculptoris');
  assert.equal(normalize('Boötes'), 'bootes');
  assert.equal(normalize('  Gl-699!! '), 'gl 699');
  assert.equal(normalize('   '), '');
  assert.equal(normalize('!!!'), '');
});

test('blank, punctuation-only and Greek-only queries do not crash', () => {
  assert.deepEqual(search(idx, '   '), []);
  assert.deepEqual(search(idx, '!!!'), []);
  assert.deepEqual(search(idx, ''), []);
  assert.ok(Array.isArray(search(idx, 'α')));
  assert.ok(Array.isArray(search(idx, 'α Cen')));
});

test('abbreviations work', () => {
  assert.equal(search(idx, 'alp cen')[0].idx, 1);
  assert.equal(search(idx, 'α Cen')[0].idx, 1);
  assert.equal(search(idx, 'gliese 699')[0].idx, 3);
  assert.equal(search(idx, 'gl 699')[0].idx, 3);
  assert.equal(search(idx, 'gj 1001')[0].idx, 4);
  assert.equal(search(idx, '61 cyg')[0].idx, 6);
  assert.equal(search(idx, 'kappa 1 sculptoris')[0].idx, 5);
  assert.equal(search(idx, 'hd 224700')[0].idx, 0);
});

test('exact beats prefix beats substring', () => {
  const r = search(idx, 'hip 1');
  assert.equal(r[0].idx, 0);                       // exact
  assert.ok([7, 8].every((i) => r.some((x) => x.idx === i))); // hip 10, hip 100 are prefixes
  assert.ok(r.slice(1).every((x) => x.idx !== 0));
  const sub = search(idx, 'entauri');              // substring only
  assert.ok(sub.some((x) => x.idx === 1));
  const order = search(idx, 'cen').map((x) => x.name);
  assert.equal(order[0], 'Centaurus');             // place, prefix
});

test('places outrank stars on ties', () => {
  const r = search(idx, 'vega');
  assert.equal(r[0].type, 'place');
  assert.equal(r[0].id, 'vega');
  assert.equal(r[1].type, 'star');
  assert.equal(r[1].idx, 2);
});

test('limit and result shape', () => {
  assert.equal(search(idx, 'hip', 3).length, 3);
  const s = search(idx, 'rigil')[0];
  assert.deepEqual(s, { type: 'star', idx: 1, name: 'Rigil Kentaurus', kind: 'Star', ly: 4.37 });
});

const gen = new URL('../public/starindex.txt', import.meta.url);
test('generated starindex.txt: 109400 rows, Barnard\'s Star at 80154', { skip: !existsSync(gen) }, () => {
  const { rows: r } = parseStarIndex(readFileSync(gen, 'utf8'));
  assert.equal(r.length, 109400);
  assert.equal(r[80154].proper, "Barnard's Star");
  const big = buildSearchIndex(r, []);
  assert.equal(search(big, 'barnard')[0].idx, 80154);
});

const cgen = new URL('../public/constellations.json', import.meta.url);
test('generated constellations.json: 88 with lines', { skip: !existsSync(cgen) }, () => {
  const c = JSON.parse(readFileSync(cgen, 'utf8'));
  assert.equal(c.length, 88);
  assert.ok(c.every((x) => CONSTELLATIONS[x.abbr] && x.lines.length > 0));
});
