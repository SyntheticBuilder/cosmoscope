import test from 'node:test';
import assert from 'node:assert/strict';
import { favSubtitle, focusAfterRemove, EMPTY_TEXT } from '../src/savedtab.js';

const kinds = { saturn: 'Planet', 'star:5': 'Star' };
const kindOf = (id) => kinds[id] || null;
const d = { place: 'Saturn', date: 'Nov 20, 2026', speed: '1 day/s', frame: 'sun' };

test('favSubtitle: kind of the followed object, then date and speed', () => {
  assert.equal(favSubtitle({ view: { focus: 'saturn' } }, d, kindOf), 'Planet · Nov 20, 2026 · 1 day/s');
  assert.equal(favSubtitle({ view: { focus: 'star:5' } }, { ...d, place: 'Vega' }, kindOf), 'Star · Nov 20, 2026 · 1 day/s');
});

test('favSubtitle: no known kind falls back to the place or scale name', () => {
  assert.equal(favSubtitle({ view: { focus: null } }, { ...d, place: 'Nearby stars' }, kindOf), 'Nearby stars · Nov 20, 2026 · 1 day/s');
  assert.equal(favSubtitle({ view: { focus: 'mystery' } }, { ...d, place: 'Milky Way' }, kindOf), 'Milky Way · Nov 20, 2026 · 1 day/s');
  assert.equal(favSubtitle({}, { ...d, place: '' }, kindOf), 'Nov 20, 2026 · 1 day/s');
});

test('favSubtitle: no description gives an empty subtitle', () => {
  assert.equal(favSubtitle({ view: { focus: 'saturn' } }, null, kindOf), '');
});

test('focusAfterRemove: next item, then the one before, then the fallbacks', () => {
  const k = (id) => 'go:' + id;
  assert.deepEqual(focusAfterRemove(['a', 'b', 'c'], 1, k, 'sec'), ['go:c', 'go:a', 'sec']);
  assert.deepEqual(focusAfterRemove(['a', 'b', 'c'], 0, k, 'sec'), ['go:b', 'sec']);
  assert.deepEqual(focusAfterRemove(['a', 'b', 'c'], 2, k, 'sec', 'first'), ['go:b', 'sec', 'first']);
  assert.deepEqual(focusAfterRemove(['a'], 0, k, 'sec'), ['sec']);
});

test('empty state text is the agreed line', () => {
  assert.equal(EMPTY_TEXT, 'Tap ★ Save to keep a view here.');
});
