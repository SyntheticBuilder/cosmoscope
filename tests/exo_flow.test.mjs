import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlanets } from '../tools/exo_flow.mjs';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const deployed = { fetchedAt: 'x', windowDays: 90, planets: [{ pl_name: 'D b' }] };
const opts = (fetchFn) => ({ fetchFn, siteUrl: 'https://site.test/app', now: Date.parse('2026-11-19T00:00:00Z') });

test('NASA success shapes planets and asks for the 90-day cutoff', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(decodeURIComponent(url));
    return urls.length === 1
      ? ok([{ pl_name: 'A b', first_release: '2026-10-01' }])
      : ok([{ pl_name: 'A b', sy_dist: 5, disc_refname: null }]);
  };
  const d = await getPlanets(opts(fetchFn));
  assert.equal(d.planets.length, 1);
  assert.ok(urls[0].includes("min(releasedate) >= '2026-08-21'"));
});

test('NASA fails -> deployed copy is returned', async () => {
  const fetchFn = async (url) => {
    if (url.includes('exoplanetarchive')) throw new Error('boom');
    assert.equal(url, 'https://site.test/app/new_planets.json');
    return ok(deployed);
  };
  assert.deepEqual(await getPlanets(opts(fetchFn)), deployed);
});

test('NASA returns non-array -> falls back', async () => {
  const fetchFn = async (url) => (url.includes('exoplanetarchive') ? ok({ error: 1 }) : ok(deployed));
  assert.deepEqual(await getPlanets(opts(fetchFn)), deployed);
});

test('both fail -> null (no file to write)', async () => {
  const fetchFn = async () => { throw new Error('down'); };
  assert.equal(await getPlanets(opts(fetchFn)), null);
});

test('deployed copy malformed -> null', async () => {
  const fetchFn = async (url) => (url.includes('exoplanetarchive') ? { ok: false, status: 500 } : ok({ nope: 1 }));
  assert.equal(await getPlanets(opts(fetchFn)), null);
});

test('hanging fetch is aborted by timeout and falls through', async () => {
  const fetchFn = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
  assert.equal(await getPlanets({ ...opts(fetchFn), timeoutMs: 20 }), null);
});
