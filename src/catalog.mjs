// Pure star-catalog helpers: names, normalizing and search. No DOM, no Three.js.
// Every name here is built from catalog fields (HYG v4.1); nothing is invented.

const CON_TABLE = `
And|Andromeda|Andromedae
Ant|Antlia|Antliae
Aps|Apus|Apodis
Aqr|Aquarius|Aquarii
Aql|Aquila|Aquilae
Ara|Ara|Arae
Ari|Aries|Arietis
Aur|Auriga|Aurigae
Boo|Boötes|Boötis
Cae|Caelum|Caeli
Cam|Camelopardalis|Camelopardalis
Cnc|Cancer|Cancri
CVn|Canes Venatici|Canum Venaticorum
CMa|Canis Major|Canis Majoris
CMi|Canis Minor|Canis Minoris
Cap|Capricornus|Capricorni
Car|Carina|Carinae
Cas|Cassiopeia|Cassiopeiae
Cen|Centaurus|Centauri
Cep|Cepheus|Cephei
Cet|Cetus|Ceti
Cha|Chamaeleon|Chamaeleontis
Cir|Circinus|Circini
Col|Columba|Columbae
Com|Coma Berenices|Comae Berenices
CrA|Corona Australis|Coronae Australis
CrB|Corona Borealis|Coronae Borealis
Crv|Corvus|Corvi
Crt|Crater|Crateris
Cru|Crux|Crucis
Cyg|Cygnus|Cygni
Del|Delphinus|Delphini
Dor|Dorado|Doradus
Dra|Draco|Draconis
Equ|Equuleus|Equulei
Eri|Eridanus|Eridani
For|Fornax|Fornacis
Gem|Gemini|Geminorum
Gru|Grus|Gruis
Her|Hercules|Herculis
Hor|Horologium|Horologii
Hya|Hydra|Hydrae
Hyi|Hydrus|Hydri
Ind|Indus|Indi
Lac|Lacerta|Lacertae
Leo|Leo|Leonis
LMi|Leo Minor|Leonis Minoris
Lep|Lepus|Leporis
Lib|Libra|Librae
Lup|Lupus|Lupi
Lyn|Lynx|Lyncis
Lyr|Lyra|Lyrae
Men|Mensa|Mensae
Mic|Microscopium|Microscopii
Mon|Monoceros|Monocerotis
Mus|Musca|Muscae
Nor|Norma|Normae
Oct|Octans|Octantis
Oph|Ophiuchus|Ophiuchi
Ori|Orion|Orionis
Pav|Pavo|Pavonis
Peg|Pegasus|Pegasi
Per|Perseus|Persei
Phe|Phoenix|Phoenicis
Pic|Pictor|Pictoris
Psc|Pisces|Piscium
PsA|Piscis Austrinus|Piscis Austrini
Pup|Puppis|Puppis
Pyx|Pyxis|Pyxidis
Ret|Reticulum|Reticuli
Sge|Sagitta|Sagittae
Sgr|Sagittarius|Sagittarii
Sco|Scorpius|Scorpii
Scl|Sculptor|Sculptoris
Sct|Scutum|Scuti
Ser|Serpens|Serpentis
Sex|Sextans|Sextantis
Tau|Taurus|Tauri
Tel|Telescopium|Telescopii
Tri|Triangulum|Trianguli
TrA|Triangulum Australe|Trianguli Australis
Tuc|Tucana|Tucanae
UMa|Ursa Major|Ursae Majoris
UMi|Ursa Minor|Ursae Minoris
Vel|Vela|Velorum
Vir|Virgo|Virginis
Vol|Volans|Volantis
Vul|Vulpecula|Vulpeculae`;

export const CONSTELLATIONS = {};
for (const line of CON_TABLE.trim().split('\n')) {
  const [abbr, name, genitive] = line.split('|');
  CONSTELLATIONS[abbr] = { name, genitive };
}

const GREEK_LIST = [
  ['Alp', 'Alpha', 'α'], ['Bet', 'Beta', 'β'], ['Gam', 'Gamma', 'γ'], ['Del', 'Delta', 'δ'],
  ['Eps', 'Epsilon', 'ε'], ['Zet', 'Zeta', 'ζ'], ['Eta', 'Eta', 'η'], ['The', 'Theta', 'θ'],
  ['Iot', 'Iota', 'ι'], ['Kap', 'Kappa', 'κ'], ['Lam', 'Lambda', 'λ'], ['Mu', 'Mu', 'μ'],
  ['Nu', 'Nu', 'ν'], ['Xi', 'Xi', 'ξ'], ['Omi', 'Omicron', 'ο'], ['Pi', 'Pi', 'π'],
  ['Rho', 'Rho', 'ρ'], ['Sig', 'Sigma', 'σ'], ['Tau', 'Tau', 'τ'], ['Ups', 'Upsilon', 'υ'],
  ['Phi', 'Phi', 'φ'], ['Chi', 'Chi', 'χ'], ['Psi', 'Psi', 'ψ'], ['Ome', 'Omega', 'ω'],
];
export const GREEK = {};
const GREEK_CHAR = { 'ς': 'sigma', 'ϑ': 'theta', 'ϕ': 'phi', 'ϵ': 'epsilon' };
for (const [code, name, letter] of GREEK_LIST) {
  GREEK[code] = { name, letter };
  GREEK_CHAR[letter] = name.toLowerCase();
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUP_RE = new RegExp(`[${SUP}]`, 'g');
const toSup = (digits) => [...digits].map((d) => SUP[+d]).join('');

const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'); // accent marks

export function normalize(s) {
  let t = String(s ?? '').toLowerCase();
  t = t.replace(SUP_RE, (c) => String(SUP.indexOf(c)));
  t = t.replace(/[α-ωϑϕϵ]/g, (c) => (GREEK_CHAR[c] ? ` ${GREEK_CHAR[c]} ` : ' '));
  t = t.normalize('NFD').replace(COMBINING, '');
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
}

export function parseStarIndex(text) {
  const rows = [];
  const num = (v) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  for (const line of String(text).split('\n')) {
    if (line === '' || line[0] === '#') continue;
    const f = line.replace(/\r$/, '').split('\t');
    rows.push({
      hip: num(f[0]), hd: num(f[1]), gl: f[2] || '', bayer: f[3] || '', flam: f[4] || '',
      con: f[5] || '', proper: f[6] || '', ly: num(f[7]), spect: f[8] || '', mag: num(f[9]),
    });
  }
  return { rows };
}

function bayerParts(row) {
  if (!row.bayer) return null;
  const [code, suffix = ''] = row.bayer.split('-');
  const g = GREEK[code];
  const c = CONSTELLATIONS[row.con];
  if (!g || !c) return null;
  return { code, suffix, greek: g, con: c };
}

export function starNames(row) {
  const out = [];
  const add = (n) => { if (n && !out.includes(n)) out.push(n); };
  add(row.proper);
  const b = bayerParts(row);
  if (b) add(`${b.greek.name}${toSup(b.suffix)} ${b.con.genitive}`);
  const c = CONSTELLATIONS[row.con];
  if (row.flam && c) add(`${row.flam} ${c.genitive}`);
  if (row.gl) add(row.gl.replace(/^Gl\s+/, 'Gliese '));
  if (row.hd != null) add(`HD ${row.hd}`);
  if (row.hip != null) add(`HIP ${row.hip}`);
  return out;
}

// Extra searchable forms: "alp cen", "alpha cen", "61 cyg", "gl 699".
function starAbbreviations(row) {
  const out = [];
  const b = bayerParts(row);
  if (b) {
    const s = b.suffix;
    out.push(`${b.code} ${row.con}${s ? ' ' + s : ''}`, `${b.greek.name} ${row.con}${s ? ' ' + s : ''}`);
    if (s) out.push(`${b.code}${s} ${row.con}`, `${b.greek.name}${s} ${row.con}`, `${b.greek.name} ${s} ${b.con.genitive}`);
  }
  if (row.flam && row.con) out.push(`${row.flam} ${row.con}`);
  if (row.gl) out.push(row.gl);
  return out;
}

export function buildSearchIndex(rows, extras = []) {
  const hay = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const keys = new Set();
    for (const n of starNames(rows[i]).concat(starAbbreviations(rows[i]))) {
      const k = normalize(n);
      if (k) keys.add(k);
    }
    hay[i] = '|' + [...keys].join('|') + '|';
  }
  const places = extras.map((e) => ({ e, key: normalize(e.name) })).filter((p) => p.key);
  return { rows, hay, places };
}

// Tier: 0 exact, 1 starts with, 2 a word starts with, 3 contains. -1 = no match.
function tierOf(key, q) {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.includes(' ' + q)) return 2;
  return key.includes(q) ? 3 : -1;
}

export function search(index, query, limit = 30) {
  const q = normalize(query);
  if (!q) return [];
  const hits = [];
  for (const p of index.places) {
    const t = tierOf(p.key, q);
    if (t < 0) continue;
    const e = p.e;
    hits.push({ t, place: 1, boost: e.boost || 0, ly: e.ly ?? Infinity, name: e.name,
      res: { type: 'place', id: e.id, name: e.name, kind: e.kind, ly: e.ly ?? null } });
  }
  const { rows, hay } = index;
  for (let i = 0; i < hay.length; i++) {
    if (!hay[i].includes(q)) continue;
    let best = 9;
    for (const key of hay[i].split('|')) {
      if (!key) continue;
      const t = tierOf(key, q);
      if (t >= 0 && t < best) { best = t; if (t === 0) break; }
    }
    if (best === 9) continue;
    const r = rows[i];
    const name = starNames(r)[0] || `Star ${i}`;
    hits.push({ t: best, place: 0, boost: 0, ly: r.ly ?? Infinity, name,
      res: { type: 'star', idx: i, name, kind: 'Star', ly: r.ly } });
  }
  hits.sort((a, b) => a.t - b.t || b.place - a.place || b.boost - a.boost || a.ly - b.ly
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return hits.slice(0, limit).map((h) => h.res);
}
