// Trending: the rules shared by the app and the Cloudflare counter (worker/src/index.js).
// A visit = a flight that ends on a place, then 5 s there. Counted once per place per day, anonymously.

// The counter's address (no trailing slash). Empty: Trending is off.
export const COUNTER_URL = '';
export const VISIT_KEY = 'cosmo.visits';      // { day: 'YYYY-MM-DD', ids: [...] } — what this browser already counted today
export const OPTOUT_KEY = 'cosmo.countVisits'; // '0' = don't count my visits
export const DWELL_MS = 5000;
export const STAR_COUNT = 109400;
export const MIN_VISITS = 3;
export const TOP_N = 10;
export const RANGES = ['day', 'week', 'month'];
export const RANGE_LABELS = { day: 'Today', week: 'Week', month: 'Month' };
const HOURS = { day: 24, week: 168, month: 720 };
export const rangeHours = (r) => HOURS[r] ?? null;

// The shapes of ids the counter accepts. The app only shows ids it can name itself, so a shape check is enough here.
export function validId(id) {
  if (typeof id !== 'string' || id.length > 44) return false;
  if (/^[a-z0-9]{1,24}$/.test(id)) return true;
  const s = /^star:(\d{1,6})$/.exec(id);
  if (s) return Number(s[1]) < STAR_COUNT;
  return /^con:[A-Za-z]{3}$/.test(id) || /^new:[A-Za-z0-9 .+\-']{1,40}$/.test(id);
}

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Today's counted ids on this device. Never throws; an unusable storage just remembers for this visit.
export function visitMemory(storage, today) {
  let ids = new Set();
  try {
    const v = JSON.parse(storage?.getItem(VISIT_KEY) || 'null');
    if (v && v.day === today && Array.isArray(v.ids)) ids = new Set(v.ids.filter((x) => typeof x === 'string'));
  } catch { }
  return {
    has: (id) => ids.has(id),
    add(id) {
      ids.add(id);
      try { storage?.setItem(VISIT_KEY, JSON.stringify({ day: today, ids: [...ids] })); } catch { }
    },
  };
}

export function optedOut(storage) {
  try { return storage?.getItem(OPTOUT_KEY) === '0'; } catch { return false; }
}

// Whether a finished stay should be sent.
export function shouldCount({ id, free = false, touring = false, hadInput = false, optOut = false, gpc = false }) {
  return !!id && !free && !touring && hadInput && !optOut && !gpc && validId(id);
}

function withTimeout(fetchFn, url, init, ms) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), ms);
  return Promise.resolve()
    .then(() => fetchFn(url, { ...init, signal: ctl?.signal }))
    .finally(() => clearTimeout(t));
}

// Top places for a range → [{ id, n }] (best first), or null if the counter can't be reached or answered nonsense.
export async function fetchTop(base, range, fetchFn = globalThis.fetch, ms = 4000) {
  if (!base || !RANGES.includes(range) || typeof fetchFn !== 'function') return null;
  try {
    const r = await withTimeout(fetchFn, `${base}/top?range=${range}`, { method: 'GET' }, ms);
    if (!r?.ok) return null;
    const body = await r.json();
    if (!body || !Array.isArray(body.places)) return null;
    const out = [];
    for (const p of body.places) {
      if (!p || !validId(p.id) || !Number.isInteger(p.n) || p.n < MIN_VISITS) continue;
      if (out.some((x) => x.id === p.id)) continue;
      out.push({ id: p.id, n: p.n });
      if (out.length >= TOP_N) break;
    }
    return out.sort((a, b) => b.n - a.n);
  } catch { return null; }
}

// One visit. Never throws; → true if the counter took it.
export async function sendVisit(base, id, fetchFn = globalThis.fetch, ms = 4000) {
  if (!base || !validId(id) || typeof fetchFn !== 'function') return false;
  try {
    const r = await withTimeout(fetchFn, `${base}/visit`, {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ id }), keepalive: true,
    }, ms);
    return !!r?.ok;
  } catch { return false; }
}
