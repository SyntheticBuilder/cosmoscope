import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inWindow, newestRelease, shouldFlyIn, lightYears, planetSubtitle,
  planetStory, teffToRGB, escapeHTML,
} from '../src/newworlds.mjs';

const full = {
  pl_name: 'TOI-1 b', first_release: '2026-11-12', disc_facility: 'TESS',
  disc_pubdate: '2026-10', pl_rade: 1.2, pl_orbper: 0.25, sy_dist: 20.24,
  discoverymethod: 'Transit', sy_pnum: 1, ref_text: 'Smith et al. 2026',
};
const DAY = 86400000;

test('inWindow keeps 89 days, drops 91 days', () => {
  const now = Date.UTC(2026, 10, 19);
  const iso = (d) => new Date(now - d * DAY).toISOString().slice(0, 10);
  const out = inWindow([{ pl_name: 'old', first_release: iso(91) }, { pl_name: 'new', first_release: iso(89) }], now);
  assert.deepEqual(out.map((p) => p.pl_name), ['new']);
});

test('newestRelease', () => {
  assert.equal(newestRelease([{ first_release: '2026-10-01' }, { first_release: '2026-11-12' }]), '2026-11-12');
  assert.equal(newestRelease([]), null);
});

test('shouldFlyIn', () => {
  assert.equal(shouldFlyIn('2026-11-12', null, false), true);
  assert.equal(shouldFlyIn('2026-11-12', '2026-11-12', false), false);
  assert.equal(shouldFlyIn('2026-11-12', '2026-11-05', true), false);
  assert.equal(shouldFlyIn(null, null, false), false);
});

test('lightYears', () => {
  assert.ok(Math.abs(lightYears(full) - 66.01) < 0.05);
  assert.equal(lightYears({ sy_dist: null }), null);
});

test('planetSubtitle', () => {
  assert.equal(planetSubtitle(full), '1.2× Earth · 6-hour year · 66 light-years');
  assert.equal(planetSubtitle({ pl_orbper: 10 }), '10-day year');
  assert.equal(planetSubtitle({ pl_orbper: 730 }), '2-year year'.replace('2-year year', '2-year year'));
  assert.equal(planetSubtitle({ pl_name: 'x' }), '');
});

test('planetStory full', () => {
  const s = planetStory(full);
  assert.equal(s.title, 'TOI-1 b');
  assert.equal(s.hook, "Added to NASA's confirmed planets on November 12, 2026.");
  assert.equal(s.sub, 'Planet · 66 light-years');
  assert.equal(s.source, 'NASA Exoplanet Archive · Smith et al. 2026');
  assert.equal(s.isNew, true);
  assert.ok(s.facts.includes('Discovered by TESS'));
  assert.ok(s.facts.includes('Discovery published October 2026'));
  assert.ok(s.facts.includes("About 1.2× Earth's width"));
});

test('planetStory without distance', () => {
  assert.equal(planetStory({ ...full, sy_dist: null }).sub, 'Planet · distance not measured');
});

test('planetStory sparse has no junk', () => {
  const s = planetStory({ pl_name: 'X', first_release: '2026-11-12' });
  assert.equal(s.source, 'NASA Exoplanet Archive');
  for (const f of s.facts) assert.doesNotMatch(f, /null|NaN|undefined/);
  assert.doesNotMatch(JSON.stringify(s), /null|NaN|undefined/);
});

test('planetStory strips markup, temperature and multi-planet', () => {
  const s = planetStory({ ...full, disc_facility: '<b>X</b>', pl_eqt: 300, sy_pnum: 3, pl_bmasse: 5 });
  assert.ok(s.facts.every((f) => !f.includes('<')));
  assert.ok(s.facts.includes('Discovered by X'));
  assert.ok(s.facts.includes('About 27 °C'));
  assert.ok(s.facts.includes("About 5× Earth's mass".replace('5×', '5.0×')));
  assert.ok(s.facts.some((f) => /3 planets/.test(f)));
});

test('escapeHTML', () => assert.equal(escapeHTML('<a>&'), '&lt;a&gt;&amp;'));

test('teffToRGB', () => {
  assert.deepEqual(teffToRGB(null), [1, 0.96, 0.9]);
  const cool = teffToRGB(3200), hot = teffToRGB(9000);
  assert.ok(cool[0] > cool[2]);
  assert.ok(hot[2] >= hot[0]);
  for (const v of [...cool, ...hot]) assert.ok(v >= 0 && v <= 1);
});
