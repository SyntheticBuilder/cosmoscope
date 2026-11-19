// Pure helpers for the "new worlds" feature. No dependencies, no Node-only APIs.

const DAY_MS = 86400000;
const LY_PER_PC = 3.26156;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const stripTags = (s) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').trim() : '');
// One decimal, dropping a trailing ".0".
const dec1 = (n) => String(Math.round(n * 10) / 10);
// Whole number with locale-independent thousands grouping ("25,603").
const whole = (n) => Math.round(n).toLocaleString('en-US');

export function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function inWindow(planets, nowMs, days = 90) {
  return planets.filter((p) => {
    const t = Date.parse(p.first_release + 'T00:00:00Z');
    return Number.isFinite(t) && nowMs - t <= days * DAY_MS;
  });
}

export function newestRelease(planets) {
  let best = null;
  for (const p of planets) if (p.first_release && (!best || p.first_release > best)) best = p.first_release;
  return best;
}

export function shouldFlyIn(newest, lastSeen, touring) {
  return !!newest && !touring && (!lastSeen || newest > lastSeen);
}

export function lightYears(p) {
  const d = num(p.sy_dist);
  return d === null ? null : d * LY_PER_PC;
}

function yearParts(days) {
  if (days < 2) return [Math.round(days * 24), 'hour'];
  if (days < 730) return [Math.round(days), 'day'];
  return [dec1(days / 365.25), 'year'];
}
function yearText(days) {
  const [n, u] = yearParts(days);
  return u === 'year' ? `${n}-year orbit` : `${n}-${u} year`;
}
function yearFact(days) {
  const [n, u] = yearParts(days);
  return `A year there lasts about ${n} ${u}${Number(n) === 1 ? '' : 's'}`;
}

export function planetSubtitle(p) {
  const parts = [];
  if (num(p.pl_rade) !== null) parts.push(`${dec1(p.pl_rade)}× Earth`);
  if (num(p.pl_orbper) !== null) parts.push(yearText(p.pl_orbper));
  const ly = lightYears(p);
  if (ly !== null) parts.push(`${whole(ly)} light-years`);
  return parts.join(' · ');
}

function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

function monthYear(pub) {
  const m = /^(\d{4})-(\d{2})/.exec(pub || '');
  return m && MONTHS[+m[2] - 1] ? `${MONTHS[+m[2] - 1]} ${m[1]}` : null;
}

export function planetStory(p) {
  const ly = lightYears(p);
  const sub = `Planet · ${ly === null ? 'distance not measured' : `${whole(ly)} light-years`}`;
  const rel = longDate(p.first_release);
  const hook = rel ? `Added to NASA's confirmed planets on ${rel}.` : 'Newly added to NASA\'s confirmed planets.';
  const facts = [];
  const fac = stripTags(p.disc_facility);
  if (fac) facts.push(`Discovered by ${fac}`);
  const pub = monthYear(stripTags(p.disc_pubdate));
  if (pub) facts.push(`Discovery published ${pub}`);
  if (num(p.pl_rade) !== null) facts.push(`About ${dec1(p.pl_rade)}× Earth's width`);
  if (num(p.pl_bmasse) !== null) {
    // Radial-velocity masses (Msini) are lower limits: the orbit's tilt is unknown.
    const atLeast = /msini/i.test(String(p.pl_bmassprov || ''));
    facts.push(`${atLeast ? 'At least' : 'About'} ${dec1(p.pl_bmasse)}× Earth's mass`);
  }
  if (num(p.pl_orbper) !== null) facts.push(yearFact(p.pl_orbper));
  if (num(p.pl_eqt) !== null) facts.push(`Estimated temperature from starlight: about ${whole(p.pl_eqt - 273)} °C`);
  const method = stripTags(p.discoverymethod);
  if (method) facts.push(`Found using the ${method} method`);
  if (num(p.sy_pnum) !== null && p.sy_pnum > 1) facts.push(`${p.sy_pnum} planets in this system`);
  const ref = stripTags(p.ref_text);
  return {
    title: stripTags(p.pl_name),
    sub,
    hook,
    facts,
    source: ref ? `NASA Exoplanet Archive · ${ref}` : 'NASA Exoplanet Archive',
    isNew: true,
  };
}

// Approximate blackbody colour (Tanner Helland fit), returned as 0-1 floats.
export function teffToRGB(teff) {
  const t = num(teff);
  if (t === null) return [1, 0.96, 0.9];
  const k = Math.min(40000, Math.max(1000, t)) / 100;
  const clamp = (v) => Math.min(255, Math.max(0, v)) / 255;
  const r = k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592);
  const g = k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661
    : 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  const b = k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  return [clamp(r), clamp(g), clamp(b)];
}
