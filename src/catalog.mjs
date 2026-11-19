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
  t = t.replace(/[^a-z0-9]+/g, ' ');
  // split letter/digit boundaries so "kappa1", "kappa 1" and "hd209458" match consistently
  return t.replace(/([a-z])([0-9])|([0-9])([a-z])/g, '$1$3 $2$4').trim();
}

export function parseStarIndex(text) {
  const rows = [];
  text = String(text);
  const num = (v) => (v === '' ? null : Number(v));
  const f = new Array(10);
  let pos = 0;
  const len = text.length;
  while (pos < len) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = len;
    if (end > pos && text.charCodeAt(pos) !== 35) {
      let lineEnd = end;
      if (text.charCodeAt(lineEnd - 1) === 13) lineEnd--;
      let from = pos;
      for (let k = 0; k < 10; k++) {
        const tab = k < 9 ? text.indexOf('\t', from) : -1;
        const to = tab >= 0 && tab < lineEnd ? tab : lineEnd;
        f[k] = text.slice(from, to);
        from = to + 1;
      }
      const ly = num(f[7]);
      const mag = num(f[9]);
      rows.push({
        hip: num(f[0]), hd: num(f[1]), gl: f[2], bayer: f[3], flam: f[4],
        con: f[5], proper: f[6], ly: Number.isFinite(ly) ? ly : null, spect: f[8],
        mag: Number.isFinite(mag) ? mag : null,
      });
    }
    pos = end + 1;
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

// Pre-normalized pieces so building the index needs no regex for most stars.
const GREEK_N = {};
for (const code of Object.keys(GREEK)) GREEK_N[code] = GREEK[code].name.toLowerCase();
const CON_N = {};
for (const abbr of Object.keys(CONSTELLATIONS)) {
  CON_N[abbr] = { abbr: abbr.toLowerCase(), gen: normalize(CONSTELLATIONS[abbr].genitive) };
}

// One "|key|key|" string per star. Keys are already normalized.
function hayFor(r) {
  let s = '|';
  if (r.proper) s += normalize(r.proper) + '|';
  const c = CON_N[r.con];
  if (c) {
    if (r.bayer) {
      const dash = r.bayer.indexOf('-');
      const code = dash < 0 ? r.bayer : r.bayer.slice(0, dash);
      const g = GREEK_N[code];
      if (g) {
        const sfx = dash < 0 ? '' : ' ' + r.bayer.slice(dash + 1);
        const lc = code.toLowerCase();
        s += g + sfx + ' ' + c.gen + '|' + lc + ' ' + c.abbr + sfx + '|' + g + ' ' + c.abbr + sfx + '|';
        if (sfx) {
          // also without the number, and with it before the constellation ("kap 1 scl")
          s += g + ' ' + c.gen + '|' + lc + ' ' + c.abbr + '|' + g + ' ' + c.abbr + '|' + lc + sfx + ' ' + c.abbr + '|' + g + sfx + ' ' + c.abbr + '|';
        }
      }
    }
    if (r.flam) s += r.flam + ' ' + c.gen + '|' + r.flam + ' ' + c.abbr + '|';
  }
  if (r.gl) {
    const g = normalize(r.gl);
    s += g + '|';
    if (g.startsWith('gl ')) s += 'gliese ' + g.slice(3) + '|';
  }
  if (r.hd != null) s += 'hd ' + r.hd + '|';
  if (r.hip != null) s += 'hip ' + r.hip + '|';
  return s;
}

function makeIndex(rows, extras, hay) {
  const ly = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) ly[i] = rows[i].ly ?? Infinity;
  const places = extras.map((e) => ({ e, key: normalize(e.name) })).filter((p) => p.key);
  return { rows, hay, ly, places };
}

export function buildSearchIndex(rows, extras = []) {
  const hay = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) hay[i] = hayFor(rows[i]);
  return makeIndex(rows, extras, hay);
}

// Same result as buildSearchIndex, but yields to the event loop between chunks.
export async function buildSearchIndexAsync(rows, extras = [], { chunk = 5000 } = {}) {
  const hay = new Array(rows.length);
  for (let s = 0; s < rows.length; s += chunk) {
    const e = Math.min(rows.length, s + chunk);
    for (let i = s; i < e; i++) hay[i] = hayFor(rows[i]);
    await new Promise((r) => setTimeout(r));
  }
  return makeIndex(rows, extras, hay);
}

// Tier: 0 exact, 1 starts with, 2 a word starts with, 3 contains. 4 = no match.
function tierOf(key, q) {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.includes(' ' + q)) return 2;
  return key.includes(q) ? 3 : 4;
}

// Best tier of q across the keys of one "|k|k|" haystack string.
function hayTier(h, q) {
  let best = 4;
  const n = q.length;
  let p = h.indexOf(q);
  while (p >= 0) {
    const c = h.charCodeAt(p - 1);
    let t;
    if (c === 124) t = h.charCodeAt(p + n) === 124 ? 0 : 1;
    else t = c === 32 ? 2 : 3;
    if (t < best) { best = t; if (t === 0) break; }
    p = h.indexOf(q, p + 1);
  }
  return best;
}

export function search(index, query, limit = 30) {
  const q = normalize(query);
  if (!q) return [];
  const hits = [];
  for (const p of index.places) {
    const t = tierOf(p.key, q);
    if (t > 3) continue;
    const e = p.e;
    hits.push({ t, place: 1, boost: e.boost || 0, ly: e.ly ?? Infinity, name: e.name, i: 0,
      res: { type: 'place', id: e.id, name: e.name, kind: e.kind, ly: e.ly ?? null } });
  }
  // Stars: keep only the nearest `limit` per tier while scanning.
  const { rows, hay, ly } = index;
  const buckets = [[], [], [], []];
  let cutoff = 3;
  for (let i = 0; i < hay.length; i++) {
    const h = hay[i];
    if (h.indexOf(q) < 0) continue;
    const t = hayTier(h, q);
    if (t > cutoff) continue;
    const b = buckets[t];
    const d = ly[i];
    if (b.length >= limit && d >= ly[b[limit - 1]]) continue;
    let j = b.length;
    if (j >= limit) { b.pop(); j--; }
    while (j > 0 && ly[b[j - 1]] > d) j--;
    b.splice(j, 0, i);
    let sum = 0;
    cutoff = 3;
    for (let k = 0; k < 4; k++) { sum += buckets[k].length; if (sum >= limit) { cutoff = k; break; } }
  }
  for (let t = 0; t < 4; t++) {
    for (const i of buckets[t]) hits.push({ t, place: 0, boost: 0, ly: ly[i], name: '', i, res: null });
  }
  hits.sort((a, b) => a.t - b.t || b.place - a.place || b.boost - a.boost || a.ly - b.ly
    || (a.place ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.i - b.i));
  return hits.slice(0, limit).map((h) => {
    if (h.res) return h.res;
    const r = rows[h.i];
    return { type: 'star', idx: h.i, name: starNames(r)[0] || `Star ${h.i}`, kind: 'Star', ly: r.ly };
  });
}

// Replace the non-star entries (places, constellations…) of an index without rebuilding the stars.
export function setPlaces(index, extras = []) {
  index.places = extras.map((e) => ({ e, key: normalize(e.name) })).filter((p) => p.key);
  return index;
}

// ── Catalog-only star card (HYG fields only; nothing invented) ──
export const SPECTRAL_HOOKS = {
  O: 'Blazing hot, blue, and short-lived.', B: 'Hot, blue-white, and young.', A: 'A brilliant white star.',
  F: 'A bright yellow-white star.', G: 'A star a lot like our Sun.', K: 'An orange star with a very long life ahead.', M: 'A cool red star.',
};
const SPECTRAL_WORDS = {
  O: 'a very hot blue star', B: 'a hot blue-white star', A: 'a white star', F: 'a yellow-white star',
  G: 'a yellow star, the same class as the Sun', K: 'an orange star', M: 'a cool red star',
  D: 'a white dwarf', L: 'a brown dwarf', T: 'a brown dwarf', Y: 'a brown dwarf',
};
// Plain words for a spectral type, judged only by an unambiguous first letter ('' when unsure).
export function spectralWords(spect) {
  const c = String(spect || '').trim()[0] || '';
  return SPECTRAL_WORDS[c] || '';
}
export const fmtLy = (ly) => ly.toLocaleString('en-US', { maximumFractionDigits: ly < 100 ? 2 : ly < 1000 ? 1 : 0 });
const fmtMag = (m) => String(m).replace('-', '−');

// Light-travel facts shared by every star card.
export function distanceFacts(ly, nowYear) {
  const facts = [`About ${ly.toLocaleString('en-US', { maximumFractionDigits: 1 })} light-years away.`];
  const year = nowYear - Math.round(ly);
  if (ly > 1) facts.push(year > 0 ? `The light you see from it left around the year ${year}.` : `The light you see left about ${Math.round(ly).toLocaleString('en-US')} years ago, around ${Math.abs(year).toLocaleString('en-US')} BCE.`);
  return facts;
}

export const HYG_SOURCE = 'HYG Database v4.1 (CC BY-SA 4.0)';

export function starCard(row, nowYear = new Date().getFullYear()) {
  const names = starNames(row);
  const title = names[0] || 'Unnamed star';
  const sp = String(row.spect || '').trim();
  const cls = sp[0] || '';
  const facts = row.ly != null ? distanceFacts(row.ly, nowYear) : [];
  if (sp) {
    const w = spectralWords(sp);
    facts.push(w ? `Spectral type ${sp}: ${w}.` : `Spectral type ${sp}.`);
  }
  if (row.mag != null) {
    facts.push(row.mag <= 6
      ? `Brightness: magnitude ${fmtMag(row.mag)}, visible to the naked eye from Earth.`
      : `Brightness: magnitude ${fmtMag(row.mag)}, too faint to see from Earth without a telescope.`);
  }
  const con = CONSTELLATIONS[row.con];
  if (con) facts.push(`In the constellation ${con.name}.`);
  const other = names.slice(1, 5);
  if (other.length) facts.push(`Also known as ${other.join(', ')}.`);
  return {
    title,
    sub: row.ly != null ? `Star · ${fmtLy(row.ly)} light-years` : 'Star',
    hook: SPECTRAL_HOOKS[cls] || 'One of the stars around us.',
    facts, source: HYG_SOURCE,
  };
}
