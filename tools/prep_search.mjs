// Builds public/starindex.txt and public/constellations.json.
// Usage: node tools/prep_search.mjs <hygdata_v41.csv> <stellarium modern index.json> <outdir>
// Inputs (HYG v4.1, Stellarium modern sky culture; both CC BY-SA 4.0) are not committed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [csvPath, stelPath, outDir] = process.argv.slice(2);
if (!csvPath || !stelPath || !outDir) {
  console.error('Usage: node tools/prep_search.mjs <hyg.csv> <stellarium-index.json> <outdir>');
  process.exit(1);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/);
const head = parseCsvLine(lines[0]);
const col = Object.fromEntries(head.map((h, i) => [h, i]));
const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();

const out = ['#hip\thd\tgl\tbayer\tflam\tcon\tproper\tdistLy\tspect\tmag'];
const hipToIdx = new Map();
let n = 0;
for (let li = 1; li < lines.length; li++) {
  if (!lines[li]) continue;
  const f = parseCsvLine(lines[li]);
  if (f[col.proper] === 'Sol') continue;
  const d = parseFloat(f[col.dist]);
  if (!Number.isFinite(d) || d <= 0 || d >= 100000) continue;
  const hip = clean(f[col.hip]);
  if (hip && !hipToIdx.has(hip)) hipToIdx.set(hip, n);
  const ly = Math.round(d * 3.26156 * 100) / 100;
  out.push([hip, clean(f[col.hd]), clean(f[col.gl]), clean(f[col.bayer]), clean(f[col.flam]),
    clean(f[col.con]), clean(f[col.proper]), String(ly), clean(f[col.spect]), clean(f[col.mag])].join('\t'));
  n++;
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'starindex.txt'), out.join('\n') + '\n');

const stel = JSON.parse(readFileSync(stelPath, 'utf8'));
const cons = stel.constellations.map((c) => {
  const chains = [];
  for (const chain of c.lines) {
    let cur = [];
    for (const hip of chain) {
      const idx = hipToIdx.get(String(hip));
      if (idx === undefined) { if (cur.length >= 2) chains.push(cur); cur = []; } else cur.push(idx);
    }
    if (cur.length >= 2) chains.push(cur);
  }
  const cn = c.common_name || {};
  return { abbr: c.id.replace(/^CON modern /, ''), name: cn.native || '', english: cn.english || '', lines: chains };
});
writeFileSync(join(outDir, 'constellations.json'), JSON.stringify(cons));
console.log(`${n} stars (starindex.txt), ${cons.length} constellations (constellations.json)`);
