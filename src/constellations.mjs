// Constellation helpers: pure functions, no Three.js or DOM, so they can be unit-tested with node --test.
// Data: public/constellations.json ([{abbr, name, english, lines: [[starIdx, ...], ...]}], Stellarium modern sky
// culture, CC BY-SA 4.0) and the HYG rows from catalog.mjs (parseStarIndex).
import { starNames, fmtLy } from './catalog.mjs';

export const CON_SOURCE = 'Stellarium modern sky culture (CC BY-SA 4.0) · HYG Database v4.1';
export const CON_SHAPE_FACT = 'The lines join stars at their real distances; from anywhere but Earth the shape falls apart.';

// Each chain [a, b, c] becomes segments a–b, b–c. Repeated segments (either direction) and a–a are dropped.
export function segmentPairs(lines) {
  const out = [], seen = new Set();
  for (const chain of lines || []) {
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1], b = chain[i];
      if (a === b || !(a >= 0) || !(b >= 0)) continue;
      const k = a < b ? a + ':' + b : b + ':' + a;
      if (seen.has(k)) continue;
      seen.add(k); out.push([a, b]);
    }
  }
  return out;
}

// Unique star indices used by the figure, in first-seen order.
export function lineStars(lines) {
  const out = [], seen = new Set();
  for (const chain of lines || []) for (const i of chain) if (i >= 0 && !seen.has(i)) { seen.add(i); out.push(i); }
  return out;
}

// Mean sky direction of the figure's stars as seen from the Sun (origin): the normalized sum of the unit
// vectors toward each star, so near and far stars count equally. pos is a flat xyz array; vel (optional,
// same layout, per year) moves them by dt years. Returns [x, y, z] or null if there are no usable stars.
export function meanDirection(idxs, pos, vel = null, dt = 0) {
  let sx = 0, sy = 0, sz = 0;
  for (const i of idxs) {
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (vel && dt) { x += vel[i * 3] * dt; y += vel[i * 3 + 1] * dt; z += vel[i * 3 + 2] * dt; }
    const d = Math.hypot(x, y, z);
    if (!(d > 0)) continue;
    sx += x / d; sy += y / d; sz += z / d;
  }
  const L = Math.hypot(sx, sy, sz);
  return L > 1e-12 ? [sx / L, sy / L, sz / L] : null;
}

// Unit vector perpendicular to dir, as close as possible to pref (falls back to other axes when pref is parallel).
export function perpendicular(dir, pref = [0, 0, 1]) {
  for (const p of [pref, [1, 0, 0], [0, 1, 0]]) {
    const dot = p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2];
    const x = p[0] - dot * dir[0], y = p[1] - dot * dir[1], z = p[2] - dot * dir[2];
    const L = Math.hypot(x, y, z);
    if (L > 1e-3) return [x / L, y / L, z / L];
  }
  return [1, 0, 0];
}

// One pass over the HYG rows: per constellation abbreviation (row.con), the number of catalog stars and the
// brightest one (lowest apparent magnitude; rows without a magnitude are counted but never brightest).
export function constellationStats(rows) {
  const out = new Map();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.con) continue;
    let s = out.get(r.con);
    if (!s) out.set(r.con, (s = { count: 0, brightest: -1, mag: Infinity }));
    s.count++;
    if (r.mag != null && Number.isFinite(r.mag) && r.mag < s.mag) { s.mag = r.mag; s.brightest = i; }
  }
  return out;
}

// "The Great Bear" but "Orion" (English = Latin) and "Bernice's Hair" (a person's name starts it).
export function englishPhrase(con) {
  const e = con.english || con.name;
  if (e === con.name || /^[A-Z][a-z]+'s\s/.test(e) && !/^(Painter|Carpenter)'s\s/.test(e)) return e;
  return 'The ' + e;
}

/**
 * Card for a constellation. Every number comes from the data passed in:
 *   con   – entry from constellations.json
 *   rows  – parsed HYG rows (or null while the star names are still loading)
 *   stats – constellationStats(rows) (or null)
 *   lyOf  – optional idx → distance in light-years for the line stars (from the star field), used when rows are not loaded
 */
export function constellationCard(con, rows = null, stats = null, lyOf = null) {
  const facts = [];
  const s = stats?.get(con.abbr);
  if (s && s.brightest >= 0 && rows?.[s.brightest]) {
    const r = rows[s.brightest];
    const name = starNames(r)[0] || 'An unnamed star';
    facts.push(r.ly != null && Number.isFinite(r.ly)
      ? `Brightest star: ${name}, ${fmtLy(r.ly)} light-years away.`
      : `Brightest star: ${name}.`);
  }
  if (s) facts.push(`Our star catalog places ${s.count.toLocaleString('en-US')} stars within its borders.`);
  // distance range of the stars the lines join
  const dist = lineStars(con.lines).map((i) => (rows?.[i]?.ly ?? lyOf?.(i))).filter((d) => d != null && Number.isFinite(d) && d > 0);
  if (dist.length >= 2) {
    const lo = Math.min(...dist), hi = Math.max(...dist);
    facts.push(`Its line stars lie between ${fmtLy(lo)} and ${fmtLy(hi)} light-years from us.`);
  }
  facts.push(CON_SHAPE_FACT);
  const english = con.english && con.english !== con.name ? con.english : '';
  return {
    title: con.name,
    sub: english ? `Constellation · ${english}` : 'Constellation',
    hook: `${englishPhrase(con)}, as seen from Earth.`,
    facts,
    source: CON_SOURCE,
    con: con.abbr,
  };
}
