// Usage: node tools/fetch_exoplanets.mjs <outPath>
// Never fails the build: NASA -> deployed copy -> write nothing.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getPlanets } from './exo_flow.mjs';

const outPath = process.argv[2];
if (!outPath) {
  console.error('usage: node tools/fetch_exoplanets.mjs <outPath>');
  process.exit(1);
}
const data = await getPlanets({ siteUrl: process.env.SITE_URL, log: console.log });
if (data) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(data));
}
