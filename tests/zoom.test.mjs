import test from 'node:test';
import assert from 'node:assert/strict';
import {
  focusPlaneOffset, zoomTowardOffset, zoomTowardPoint, loadPins, savePins, nextPinLetter, PIN_KEY, MAX_PINS,
  validPin, pinchEngaged, backOutOfSphere,
} from '../src/zoom.mjs';

// Camera looking down −z from target + (0, 0, d); returns the spot's screen position (tan-space).
const project = (P, T, d) => { const C = { x: T.x, y: T.y, z: T.z + d }; const depth = C.z - P.z; return [(P.x - C.x) / depth, (P.y - C.y) / depth]; };
const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b)), `${a} vs ${b}`);

test('zoomTowardPoint keeps the pointed spot fixed on screen', () => {
  const T = { x: 3, y: -2, z: 5 }, d = 10;
  const P = { x: 7, y: 1, z: 5 }; // on the plane through T perpendicular to the view
  for (const f of [0.5, 0.9, 0.1]) {
    const T2 = zoomTowardPoint(T, { x: T.x, y: T.y, z: T.z + d }, P, f);
    const [a, b] = project(P, T, d), [a2, b2] = project(P, T2, d * f);
    close(a, a2); close(b, b2);
  }
});

test('factor 1 is a no-op; factor 0 lands on the spot', () => {
  const T = { x: 1, y: 2, z: 3 }, P = { x: 4, y: 6, z: 3 };
  assert.deepEqual(zoomTowardPoint(T, null, P, 1), T);
  assert.deepEqual(zoomTowardPoint(T, null, P, 0), P);
});

test('focusPlaneOffset: screen centre is the target, edges scale with distance', () => {
  const o = focusPlaneOffset(0, 0, 1e12, Math.PI / 3, 2);
  assert.equal(o.x, 0); assert.equal(o.y, 0);
  const e = focusPlaneOffset(1, 1, 10, Math.PI / 2, 2); // tan(45°) = 1
  close(e.x, 20); close(e.y, 10); assert.equal(e.z, 0);
});

test('offset path stays precise at universe scale and at km scale', () => {
  for (const [Tmag, d] of [[1e16, 1e15], [1e9, 1e-6], [1, 1e-6]]) {
    const T = { x: Tmag, y: -Tmag, z: Tmag / 3 };
    const off = focusPlaneOffset(0.4, -0.3, d, 55 * Math.PI / 180, 0.46);
    const T2 = zoomTowardOffset(T, off, 0.8);
    // the move is exactly 20% of the offset, relative to d (not to the huge coordinates)
    close((T2.x - T.x) / d, 0.2 * off.x / d, 1e-6 * Math.max(1, Tmag / d));
    const [a, b] = project({ x: T.x + off.x, y: T.y + off.y, z: T.z }, T, d);
    const [a2, b2] = [(T.x + off.x - T2.x) / (d * 0.8), (T.y + off.y - T2.y) / (d * 0.8)];
    close(a, a2, 1e-6 * Math.max(1, Tmag / d)); close(b, b2, 1e-6 * Math.max(1, Tmag / d));
  }
});

const mem = (init) => { const m = new Map(init ? [[PIN_KEY, init]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
const pin = (id, extra = {}) => ({ id, t: [1, 2, 3], q: [0, 0, 0, 1], logD: 4.5, focus: null, anchor: null, off: null, ...extra });

test('pins round-trip through storage', () => {
  const s = mem(); const pins = [pin('A', { focus: 'earth' }), pin('C')];
  assert.equal(savePins(s, pins), true);
  assert.deepEqual(loadPins(s), pins);
});

test('loadPins survives missing, throwing and corrupt storage', () => {
  assert.deepEqual(loadPins(null), []);
  assert.deepEqual(loadPins(mem()), []);
  assert.deepEqual(loadPins({ getItem() { throw new Error('denied'); } }), []);
  assert.deepEqual(loadPins(mem('{not json')), []);
  assert.deepEqual(loadPins(mem('{"a":1}')), []);
  assert.deepEqual(loadPins(mem('null')), []);
});

test('loadPins drops bad entries and duplicates, sorts, caps at 9', () => {
  const bad = [pin('B'), pin('A'), pin('A'), { id: 'Z', t: [0, 0, 0], q: [0, 0, 0, 1], logD: 1 }, pin('C', { t: [1, 'x', 3] }),
    pin('D', { logD: NaN }), pin('E', { q: [0, 0, 1] }), null, 7, pin('F', { focus: 5 })];
  assert.deepEqual(loadPins(mem(JSON.stringify(bad))).map((p) => p.id), ['A', 'B']);
  const many = 'IHGFEDCBA'.split('').map((c) => pin(c));
  assert.equal(loadPins(mem(JSON.stringify(many))).length, MAX_PINS);
});

test('savePins never throws', () => {
  assert.equal(savePins(null, []), false);
  assert.equal(savePins({ setItem() { throw new Error('quota'); } }, [pin('A')]), false);
});

test('nextPinLetter fills gaps and stops at 9', () => {
  assert.equal(nextPinLetter([]), 'A');
  assert.equal(nextPinLetter([pin('A'), pin('C')]), 'B');
  assert.equal(nextPinLetter([pin('A'), pin('B')]), 'C');
  assert.equal(nextPinLetter('ABCDEFGHI'.split('').map((c) => pin(c))), null);
});

test('pins keep an anchor + offset; older pins without them still load', () => {
  const s = mem(); const pins = [pin('A', { anchor: 'earth', off: [1e-5, 0, -2e-5] })];
  savePins(s, pins); assert.deepEqual(loadPins(s), pins);
  const old = [{ id: 'B', t: [1, 2, 3], q: [0, 0, 0, 1], logD: 2, focus: 'sun' }];
  assert.deepEqual(loadPins(mem(JSON.stringify(old))), [{ ...old[0], anchor: null, off: null }]);
  // an anchor without an offset is dropped (falls back to the absolute spot)
  assert.equal(loadPins(mem(JSON.stringify([pin('C', { anchor: 'earth', off: null })])))[0].anchor, null);
});

test('validPin is strict', () => {
  assert.equal(validPin(pin('A')), true);
  assert.equal(validPin(Object.create(pin('A'))), false); // inherited properties do not count
  assert.equal(validPin(pin('A', { q: [0, 0, 0, 0] })), false);
  assert.equal(validPin(pin('A', { logD: 1e308 })), false);
  assert.equal(validPin(pin('A', { focus: '' })), false);
  assert.equal(validPin(pin('A', { focus: 7 })), false);
  assert.equal(validPin(pin('A', { anchor: 'earth', off: [1, 2] })), false);
  assert.equal(validPin([]), false);
});

test('pinchEngaged ignores jitter and small spreads', () => {
  assert.equal(pinchEngaged(100, 102), false);   // 2 px jitter
  assert.equal(pinchEngaged(100, 107), false);   // under 8 px
  assert.equal(pinchEngaged(1000, 1012), false); // 12 px on wide fingers is under 0.02 in log zoom
  assert.equal(pinchEngaged(100, 115), true);
  assert.equal(pinchEngaged(100, 85), true);
  assert.equal(pinchEngaged(0, 50), false);
});

test('backOutOfSphere backs the camera out along its view', () => {
  assert.equal(backOutOfSphere({ x: 3, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 2), 0); // already outside
  // camera inside at x = 0.5 looking toward −x (back = +x): must back up to x = 2
  close(backOutOfSphere({ x: 0.5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 2), 1.5);
  // off-axis: the end point is exactly on the sphere and the move is along `back`
  const rel = { x: 0.3, y: 0.4, z: 0 }, back = { x: 0, y: 0, z: 1 }, R = 4.26e-5 * 1.15;
  const r2 = { x: rel.x * 1e-5, y: rel.y * 1e-5, z: 0 }; const s = backOutOfSphere(r2, back, R);
  close(Math.hypot(r2.x, r2.y, r2.z + s), R, 1e-9);
  assert.ok(s > 0);
});
