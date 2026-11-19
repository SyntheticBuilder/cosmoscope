// Usage: node tools/fetch_exoplanets.mjs <outPath>
// Fetches planets first added to NASA's archive in the last 90 days.
// Never fails the build: on error, falls back to the deployed copy, else writes nothing.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { firstReleaseQuery, detailQuery, shapePlanets } from './exo_data.mjs';

const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const DAY = 86400000;

async function tap(query) {
  const res = await fetch(`${TAP}?format=json&query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`NASA TAP HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('NASA TAP returned a non-array response');
  return rows;
}

async function fromNasa() {
  const cutoff = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
  const firstRows = await tap(firstReleaseQuery(cutoff));
  const detailRows = firstRows.length
    ? await tap(detailQuery(firstRows.map(r => r.pl_name)))
    : [];
  return shapePlanets(firstRows, detailRows, new Date().toISOString());
}

async function fromDeployedSite() {
  const base = process.env.SITE_URL;
  if (!base) throw new Error('SITE_URL not set');
  const res = await fetch(`${base}/new_planets.json`);
  if (!res.ok) throw new Error(`deployed copy HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.planets)) throw new Error('deployed copy malformed');
  return data;
}

const outPath = process.argv[2];
if (!outPath) {
  console.error('usage: node tools/fetch_exoplanets.mjs <outPath>');
  process.exit(1);
}

let data = null;
try {
  data = await fromNasa();
  console.log(`NASA: ${data.planets.length} new planets`);
} catch (e) {
  console.warn(`NASA fetch failed (${e.message}); trying deployed copy`);
  try {
    data = await fromDeployedSite();
    console.log(`Deployed copy: ${data.planets.length} planets`);
  } catch (e2) {
    console.warn(`Deployed copy failed (${e2.message}); writing no file`);
  }
}
if (data) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(data));
}
