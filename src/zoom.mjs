// Pure helpers for free zoom (zoom toward the pointer) and checkpoint pins. No DOM, no three.js:
// vectors are plain {x, y, z} objects so the math can be unit-tested in node.

// Offset (camera-local x right, y up, z 0) from the orbit target to the spot under the pointer, on the
// plane through the target perpendicular to the view. ndcX/ndcY in -1..1 (y up), d = camera-to-target
// distance, fovY in radians. Everything is relative to d, so it stays precise at any scale.
export function focusPlaneOffset(ndcX, ndcY, d, fovY, aspect) {
  const h = d * Math.tan(fovY / 2);
  return { x: ndcX * h * aspect, y: ndcY * h, z: 0 };
}

// New orbit target after scaling the camera distance by `factor` (< 1 zooms in) about a spot given as an
// offset from the current target. The camera keeps its orientation; the spot stays put on screen.
// Derivation: camera C = T + d·b. Keeping spot P fixed means C' = P + factor·(C − P), and
// T' = C' − factor·d·b = P + factor·(T − P) = T + (1 − factor)·(P − T).
export function zoomTowardOffset(target, offset, factor) {
  const k = 1 - factor;
  return { x: target.x + k * offset.x, y: target.y + k * offset.y, z: target.z + k * offset.z };
}

// Same, with the spot given in world coordinates. cameraPos is accepted for clarity of intent (the result
// does not depend on it: any camera on the line through the target along the view keeps the spot fixed).
// Prefer zoomTowardOffset when the offset is known, to avoid subtracting huge nearly-equal coordinates.
export function zoomTowardPoint(target, cameraPos, pointWorld, factor) {
  return zoomTowardOffset(target, { x: pointWorld.x - target.x, y: pointWorld.y - target.y, z: pointWorld.z - target.z }, factor);
}

// ── pins (checkpoints) ──
export const PIN_KEY = 'cosmo.pins';
export const PIN_LETTERS = 'ABCDEFGHI'; // at most 9
export const MAX_PINS = PIN_LETTERS.length;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const vecOk = (a, n) => Array.isArray(a) && a.length === n && a.every(finite);

export function validPin(p) {
  return !!p && typeof p === 'object' && typeof p.id === 'string' && p.id.length === 1 && PIN_LETTERS.includes(p.id)
    && vecOk(p.t, 3) && vecOk(p.q, 4) && finite(p.logD)
    && (p.focus === null || p.focus === undefined || typeof p.focus === 'string');
}

// Read pins; anything broken (no storage, throwing storage, bad JSON, bad entries) is dropped silently.
export function loadPins(storage) {
  let raw = null;
  try { raw = storage ? storage.getItem(PIN_KEY) : null; } catch { return []; }
  if (!raw) return [];
  let arr;
  try { arr = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const seen = new Set(); const out = [];
  for (const p of arr) {
    if (!validPin(p) || seen.has(p.id)) continue;
    seen.add(p.id); out.push({ id: p.id, t: p.t.slice(), q: p.q.slice(), logD: p.logD, focus: p.focus ?? null });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_PINS);
}

// Returns true when saved; false (never throws) when storage is missing or fails (quota, private mode).
export function savePins(storage, pins) {
  try { if (!storage) return false; storage.setItem(PIN_KEY, JSON.stringify(pins)); return true; } catch { return false; }
}

// First free letter (fills gaps: A, C → B); null when all 9 are used.
export function nextPinLetter(pins) {
  const used = new Set((pins || []).map((p) => p.id));
  for (const c of PIN_LETTERS) if (!used.has(c)) return c;
  return null;
}
