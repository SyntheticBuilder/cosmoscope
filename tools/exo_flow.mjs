import { firstReleaseQuery, detailQuery, shapePlanets } from './exo_data.mjs';

const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const DAY = 86400000;
const TIMEOUT_MS = 30000;

// Returns planets data from NASA, else the deployed copy, else null. Never throws.
export async function getPlanets({ fetchFn = fetch, siteUrl = '', now = Date.now(), timeoutMs = TIMEOUT_MS, log = () => {} } = {}) {
  const getJson = async (url) => {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const tap = async (query) => {
    const rows = await getJson(`${TAP}?format=json&query=${encodeURIComponent(query)}`);
    if (!Array.isArray(rows)) throw new Error('non-array response');
    return rows;
  };
  try {
    const cutoff = new Date(now - 90 * DAY).toISOString().slice(0, 10);
    const firstRows = await tap(firstReleaseQuery(cutoff));
    const detailRows = firstRows.length ? await tap(detailQuery(firstRows.map(r => r.pl_name))) : [];
    const data = shapePlanets(firstRows, detailRows, new Date(now).toISOString());
    log(`NASA: ${data.planets.length} new planets`);
    return data;
  } catch (e) {
    log(`NASA fetch failed (${e.message}); trying deployed copy`);
  }
  try {
    if (!siteUrl) throw new Error('SITE_URL not set');
    const data = await getJson(`${siteUrl}/new_planets.json`);
    if (!data || !Array.isArray(data.planets)) throw new Error('malformed');
    log(`Deployed copy: ${data.planets.length} planets`);
    return data;
  } catch (e) {
    log(`Deployed copy failed (${e.message}); writing no file`);
    return null;
  }
}
