// Pure logic for favorites, collections and shared links. No DOM, no three.js, so it can be unit-tested in node.
// A favorite: { id, name, autoName, created, view: { t, q, logD, focus, anchor, off }, time: { ms, speedIdx, dir },
//               frame: 'sun'|'galaxy', starName? }. `view` follows the pin rules in zoom.mjs.
// Everything that comes from storage or a link is untrusted: own-property checks only, and fresh objects are built
// from the known fields (parsed keys are never copied onto anything), so `__proto__` tricks have nothing to grab.

export const FAV_KEY = 'cosmo.favs';
export const COLL_KEY = 'cosmo.collections';
export const TOP10_ID = 'top10';
export const TOP10_NAME = 'My Top 10';
export const LIMITS = { favs: 200, colls: 30, items: 50, top10: 10, name: 60, linkItems: 50 };
export const SHARE_VERSION = '1.';
// Positions (AU) are bounded at 10x the observable-universe radius main.js draws: UNIVERSE_R = 46.5e9 light-years
// x LY_AU (63241.077 AU per light-year). Anything farther is not a place in the map.
export const MAX_COORD_AU = 10 * 46.5e9 * 63241.077;
const MAX_LINK_CHARS = 200000; // a 50-item link is a few thousand; anything near this is hostile

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const vecOk = (a, n) => Array.isArray(a) && a.length === n && a.every(finite);
const posOk = (a) => vecOk(a, 3) && a.every((x) => Math.abs(x) <= MAX_COORD_AU);
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const cpLen = (s) => Array.from(s).length;
const cpSlice = (s, n) => Array.from(s).slice(0, n).join('');
const nameOk = (s) => typeof s === 'string' && s.length > 0 && s.length <= LIMITS.name * 2 && cpLen(s) <= LIMITS.name;
const optId = (v) => v === null || v === undefined || (typeof v === 'string' && v.length > 0 && v.length < 200);

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── ids ──
// 'ok' | 'lookup' | 'bad'. isKnownId may answer true, false or 'lookup' (star list not loaded yet).
function idState(id, opts) {
  if (id === null || id === undefined) return 'ok';
  let r = false;
  try { r = opts && typeof opts.isKnownId === 'function' ? opts.isKnownId(id) : false; } catch { r = false; }
  return r === 'lookup' ? 'lookup' : r ? 'ok' : 'bad';
}

function starIdx(id) {
  const m = typeof id === 'string' ? /^star:(\d{1,9})$/.exec(id) : null;
  return m ? Number(m[1]) : null;
}

// Strict check of one favorite. Returns null when invalid, else { needsLookup } describing what main.js must resolve.
function check(f, opts) {
  if (!isObj(f)) return null;
  if (!own(f, 'id') || typeof f.id !== 'string' || f.id.length < 1 || f.id.length >= 40) return null;
  if (!own(f, 'name') || !nameOk(f.name) || !own(f, 'autoName') || !nameOk(f.autoName)) return null;
  if (!own(f, 'created') || !finite(f.created)) return null;
  if (!own(f, 'frame') || (f.frame !== 'sun' && f.frame !== 'galaxy')) return null;

  const v = own(f, 'view') ? f.view : null;
  if (!isObj(v)) return null;
  if (!own(v, 't') || !posOk(v.t) || !own(v, 'q') || !vecOk(v.q, 4) || Math.hypot(...v.q) < 1e-6) return null;
  if (!own(v, 'logD') || !finite(v.logD) || Math.abs(v.logD) > 30) return null;
  if (own(v, 'focus') && !optId(v.focus)) return null;
  if (own(v, 'anchor') && !optId(v.anchor)) return null;
  if (own(v, 'off') && v.off !== null && !posOk(v.off)) return null;

  const tm = own(f, 'time') ? f.time : null;
  if (!isObj(tm)) return null;
  if (!own(tm, 'ms') || !finite(tm.ms)) return null;
  const n = opts && Number.isInteger(opts.speeds) ? opts.speeds : 0;
  if (!own(tm, 'speedIdx') || !Number.isInteger(tm.speedIdx) || tm.speedIdx < 0 || tm.speedIdx >= n) return null;
  if (!own(tm, 'dir') || (tm.dir !== 1 && tm.dir !== -1)) return null;
  if (own(f, 'starName') && f.starName !== null && f.starName !== undefined && !nameOk(f.starName)) return null;

  let needsLookup = false;
  for (const id of [v.focus ?? null, v.anchor ?? null]) {
    const s = idState(id, opts);
    if (s === 'bad') return null;
    if (s === 'lookup') needsLookup = true;
    const idx = starIdx(id);
    if (idx !== null && typeof f.starName === 'string' && opts && typeof opts.starName === 'function') {
      let name = null;
      try { name = opts.starName(idx); } catch { name = null; }
      if (name !== null && name !== undefined && name !== f.starName) needsLookup = true;
    }
  }
  return { needsLookup };
}

export function validFavorite(f, opts) { return check(f, opts) !== null; }

// A fresh copy built only from the known fields (never the parsed object itself).
function clone(f, needsLookup) {
  const v = f.view;
  const anchor = typeof v.anchor === 'string' && Array.isArray(v.off) ? v.anchor : null;
  const out = {
    id: f.id, name: f.name, autoName: f.autoName, created: f.created,
    view: { t: v.t.slice(), q: v.q.slice(), logD: v.logD, focus: v.focus ?? null, anchor, off: anchor ? v.off.slice() : null },
    time: { ms: f.time.ms, speedIdx: f.time.speedIdx, dir: f.time.dir },
    frame: f.frame,
  };
  if (typeof f.starName === 'string') out.starName = f.starName;
  if (needsLookup) out.needsLookup = true;
  return out;
}

function sanitize(f, opts) {
  const c = check(f, opts);
  return c ? clone(f, c.needsLookup) : null;
}

const stripFlag = (f) => { const { needsLookup, ...rest } = f; return rest; };

// ── storage ──
function readArray(storage, key) {
  let raw = null;
  try { raw = storage ? storage.getItem(key) : null; } catch { return []; }
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

function loadItems(arr, opts, cap) {
  const seen = new Set(); const out = [];
  for (const f of arr) {
    if (out.length >= cap) break;
    const c = sanitize(f, opts);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id); out.push(c);
  }
  return out;
}

export function loadFavs(storage, opts) { return loadItems(readArray(storage, FAV_KEY), opts, LIMITS.favs); }

export function saveFavs(storage, favs) {
  try { if (!storage) return false; storage.setItem(FAV_KEY, JSON.stringify((favs || []).map(stripFlag))); return true; } catch { return false; }
}

// Always returns Top 10 first (created empty if missing), then the other collections.
export function loadColls(storage, opts) {
  let top = null; const rest = []; const seen = new Set();
  for (const c of readArray(storage, COLL_KEY)) {
    if (!isObj(c) || !own(c, 'id') || typeof c.id !== 'string' || c.id.length < 1 || c.id.length >= 40) continue;
    if (!own(c, 'name') || !nameOk(c.name) || !own(c, 'items') || !Array.isArray(c.items)) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const isTop = c.id === TOP10_ID;
    const items = loadItems(c.items, opts, isTop ? LIMITS.top10 : LIMITS.items);
    if (isTop) top = { id: TOP10_ID, name: TOP10_NAME, items };
    else rest.push({ id: c.id, name: c.name, items });
  }
  if (!top) top = { id: TOP10_ID, name: TOP10_NAME, items: [] };
  return [top, ...rest.slice(0, LIMITS.colls - 1)];
}

export function saveColls(storage, colls) {
  try {
    if (!storage) return false;
    const out = (colls || []).map((c) => ({ id: c.id, name: c.name, items: (c.items || []).map(stripFlag) }));
    storage.setItem(COLL_KEY, JSON.stringify(out));
    return true;
  } catch { return false; }
}

// ── names ──
export function autoName(label, dateText) {
  const tail = dateText ? ' · ' + dateText : '';
  const room = Math.max(1, LIMITS.name - cpLen(tail));
  return cpSlice(cpSlice(String(label ?? ''), room) + tail, LIMITS.name);
}

export function cleanName(input, auto) {
  const s = cpSlice(String(input ?? '').trim(), LIMITS.name).trim();
  return s || auto;
}

export function uniqueName(name, takenNames) {
  const taken = new Set(takenNames || []);
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const suffix = ' (' + n + ')';
    const cand = cpSlice(name, Math.max(0, LIMITS.name - suffix.length)) + suffix;
    if (!taken.has(cand)) return cand;
  }
}

// ── list operations (return new collections, never mutate) ──
export function addItem(coll, fav, cap = LIMITS.items) {
  if (coll.items.some((x) => x.id === fav.id)) return { ok: false, reason: 'dup', coll };
  if (coll.items.length >= cap) return { ok: false, reason: 'full', coll };
  const copy = stripFlag(JSON.parse(JSON.stringify(fav)));
  return { ok: true, reason: null, coll: { ...coll, items: [...coll.items, copy] } };
}

export function moveItem(coll, i, delta) {
  const j = i + delta;
  const n = coll.items.length;
  if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || i >= n || j < 0 || j >= n || i === j) return coll;
  const items = coll.items.slice();
  [items[i], items[j]] = [items[j], items[i]];
  return { ...coll, items };
}

export function removeItem(coll, i) {
  if (!Number.isInteger(i) || i < 0 || i >= coll.items.length) return coll;
  return { ...coll, items: coll.items.filter((_, k) => k !== i) };
}

// ── shared links ──
const r4 = (x) => Math.round(x * 1e4) / 1e4 + 0; // + 0 turns -0 into 0
const r7sig = (x) => Number(x.toPrecision(7)) + 0;

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { return null; }
}

// Returns the part after `#s=`: "1.<base64url of compact JSON>".
export function encodeShare({ name, items }) {
  const i = (items || []).slice(0, LIMITS.linkItems).map((f) => [
    f.name,
    f.view.t.map(r7sig), f.view.q.map(r4), r4(f.view.logD),
    f.view.focus ?? null, f.view.anchor ?? null, f.view.off ? f.view.off.map(r4) : null,
    Math.round(f.time.ms), f.time.speedIdx, f.time.dir, f.frame,
    typeof f.starName === 'string' ? f.starName : null,
  ]);
  return SHARE_VERSION + b64urlEncode(JSON.stringify({ n: name, i }));
}

// Untrusted input in, a clean { name, items } or null out. Never throws.
export function decodeShare(str, opts) {
  try {
    if (typeof str !== 'string' || str.length > MAX_LINK_CHARS || !str.startsWith(SHARE_VERSION)) return null;
    const json = b64urlDecode(str.slice(SHARE_VERSION.length));
    if (json === null) return null;
    const d = JSON.parse(json);
    if (!isObj(d) || !own(d, 'i') || !Array.isArray(d.i)) return null;
    const name = cleanName(own(d, 'n') && typeof d.n === 'string' ? d.n : '', 'Shared views');
    const items = [];
    for (const row of d.i.slice(0, LIMITS.linkItems)) {
      if (!Array.isArray(row) || (row.length !== 11 && row.length !== 12)) continue;
      const [nm, t, q, logD, focus, anchor, off, ms, speedIdx, dir, frame, sn] = row;
      if (!nameOk(nm)) continue;
      const cand = {
        id: newId() + items.length, name: nm, autoName: nm, created: Date.now(),
        view: { t, q, logD, focus: focus ?? null, anchor: anchor ?? null, off: off ?? null },
        time: { ms, speedIdx, dir }, frame,
      };
      if (typeof sn === 'string') cand.starName = sn;
      else if (sn !== null && sn !== undefined) continue;
      const c = sanitize(cand, opts);
      if (c) items.push(c);
    }
    return items.length ? { name, items } : null;
  } catch { return null; }
}
