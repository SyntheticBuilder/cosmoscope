import test from 'node:test';
import assert from 'node:assert/strict';
import { starCard, spectralWords, setPlaces, buildSearchIndex, search, distanceFacts } from '../src/catalog.mjs';

const row = (o) => ({ hip: null, hd: null, gl: '', bayer: '', flam: '', con: '', proper: '', ly: null, spect: '', mag: null, ...o });

test('starCard: named naked-eye star', () => {
  const c = starCard(row({ hip: 91262, hd: 172167, bayer: 'Alp', con: 'Lyr', proper: 'Vega', ly: 25.04, spect: 'A0Vvar', mag: 0.03 }), 2026);
  assert.equal(c.title, 'Vega');
  assert.equal(c.sub, 'Star · 25.04 light-years');
  assert.equal(c.hook, 'A brilliant white star.');
  assert.equal(c.source, 'HYG Database v4.1 (CC BY-SA 4.0)');
  assert.deepEqual(c.facts, [
    'About 25 light-years away.',
    'The light you see from it left around the year 2001.',
    'Spectral type A0Vvar: a white star.',
    'Brightness: magnitude 0.03, visible to the naked eye from Earth.',
    'In the constellation Lyra.',
    'Also known as Alpha Lyrae, HD 172167, HIP 91262.',
  ]);
});

test('starCard: faint catalog star, negative and boundary magnitudes', () => {
  const faint = starCard(row({ hip: 1, hd: 224700, con: 'Psc', ly: 716.83, spect: 'F5', mag: 9.1 }), 2026);
  assert.equal(faint.title, 'HD 224700');
  assert.ok(faint.facts.includes('Brightness: magnitude 9.1, too faint to see from Earth without a telescope.'));
  assert.ok(faint.facts.includes('Also known as HIP 1.'));
  assert.deepEqual(starCard(row({ hip: 2, mag: 6 })).facts, ['Brightness: magnitude 6, visible to the naked eye from Earth.']);
  assert.ok(starCard(row({ hip: 3, mag: -1.44 })).facts[0].includes('magnitude −1.44'));
});

test('starCard: at most 4 other names, no empty facts', () => {
  const c = starCard(row({ hip: 104214, hd: 201091, gl: 'Gl 820A', bayer: 'Alp', flam: '61', con: 'Cyg', proper: 'X', ly: 11.4 }));
  const aka = c.facts.find((f) => f.startsWith('Also known as'));
  assert.equal(aka, 'Also known as Alpha Cygni, 61 Cygni, Gliese 820A, HD 201091.');
  assert.ok(c.facts.every((f) => f && !f.includes('undefined') && !f.includes('null')));
});

test('spectralWords only for unambiguous letters', () => {
  assert.equal(spectralWords('K5V'), 'an orange star');
  assert.equal(spectralWords('DA2'), 'a white dwarf');
  assert.equal(spectralWords('T6'), 'a brown dwarf');
  for (const s of ['', 'm', 'k-m', 'dM4', 'sdG2', 'WC...', 'C5II', 'R0']) assert.equal(spectralWords(s), '');
  const c = starCard(row({ hip: 5, spect: 'k-m' }));
  assert.ok(c.facts.includes('Spectral type k-m.'));
  assert.equal(c.hook, 'One of the stars around us.');
});

test('distanceFacts: BCE wording for distant stars', () => {
  assert.deepEqual(distanceFacts(5000, 2026), ['About 5,000 light-years away.', 'The light you see left about 5,000 years ago, around 2,974 BCE.']);
  assert.deepEqual(distanceFacts(0.5, 2026), ['About 0.5 light-years away.']);
});

test('setPlaces swaps places without touching stars', () => {
  const idx = buildSearchIndex([row({ hip: 7, proper: 'Vega', ly: 25 })], []);
  assert.equal(search(idx, 'vega')[0].type, 'star');
  setPlaces(idx, [{ id: 'vega', name: 'Vega', kind: 'Star system', ly: 25, boost: 1 }, { id: 'x', name: '!!!' }]);
  assert.equal(idx.places.length, 1);
  const r = search(idx, 'vega');
  assert.equal(r[0].type, 'place'); assert.equal(r[1].type, 'star');
});
