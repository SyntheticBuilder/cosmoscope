import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstReleaseQuery, detailQuery, cleanRef, shapePlanets } from '../tools/exo_data.mjs';

test('firstReleaseQuery groups by planet and filters on first release', () => {
  const q = firstReleaseQuery('2026-08-21');
  assert.ok(q.includes('group by pl_name'));
  assert.ok(q.includes("having min(releasedate) >= '2026-08-21'"));
});

test('detailQuery uses default rows and doubles single quotes', () => {
  const q = detailQuery(["O'Brien b", 'X b']);
  assert.ok(q.includes('default_flag=1'));
  assert.ok(q.includes("'O''Brien b'"));
  assert.ok(q.includes("'X b'"));
});

test('cleanRef extracts text and url from NASA html', () => {
  const html = '<a refstr=X href=https://ui.adsabs.harvard.edu/abs/2026AJ/abstract target=ref>Smith et al. 2026</a>';
  assert.deepEqual(cleanRef(html), {
    text: 'Smith et al. 2026',
    url: 'https://ui.adsabs.harvard.edu/abs/2026AJ/abstract',
  });
  assert.deepEqual(cleanRef(null), { text: null, url: null });
});

test('shapePlanets sorts by distance, nulls last, attaches first_release', () => {
  const first = [
    { pl_name: 'A b', first_release: '2026-09-01' },
    { pl_name: 'B b', first_release: '2026-09-02' },
    { pl_name: 'C b', first_release: '2026-09-03' },
  ];
  const detail = [
    { pl_name: 'A b', sy_dist: 50, disc_refname: '<a href=https://x.org>R 1</a>' },
    { pl_name: 'B b', sy_dist: null, disc_refname: null },
    { pl_name: 'C b', sy_dist: 10, disc_refname: null },
    { pl_name: 'Orphan b', sy_dist: 1, disc_refname: null },
  ];
  const out = shapePlanets(first, detail, '2026-11-19T00:00:00Z');
  assert.equal(out.windowDays, 90);
  assert.equal(out.fetchedAt, '2026-11-19T00:00:00Z');
  assert.deepEqual(out.planets.map(p => p.sy_dist), [10, 50, null]);
  assert.equal(out.planets[0].first_release, '2026-09-03');
  assert.equal(out.planets[1].ref_text, 'R 1');
  assert.equal(out.planets[1].ref_url, 'https://x.org');
  assert.ok(!('disc_refname' in out.planets[1]));
});

test('cleanRef decodes common HTML entities in the text', () => {
  const html = '<a href=https://x.org/a?b=1&amp;c=2>Smith &amp; Jones &lt;2026&gt; &quot;Q&quot; O&#39;Neil &#233;</a>';
  assert.deepEqual(cleanRef(html), {
    text: 'Smith & Jones <2026> "Q" O\'Neil é',
    url: 'https://x.org/a?b=1&c=2',
  });
});

test('detailQuery asks for the mass provenance field', () => {
  assert.ok(detailQuery(['X b']).includes('pl_bmassprov'));
});
