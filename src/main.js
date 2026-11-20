import * as THREE from 'three';
import * as Astro from 'astronomy-engine';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { STORIES } from './stories.js';
import { inWindow, newestRelease, shouldFlyIn, planetSubtitle, planetStory, teffToRGB, escapeHTML } from './newworlds.mjs';
import { starCard, starNames, distanceFacts, fmtLy, spectralHook, HYG_SOURCE } from './catalog.mjs';
import { initSearch } from './search.js';
import { segmentPairs, lineStars, meanDirection, perpendicular, constellationStats, constellationCard } from './constellations.mjs';
import { focusPlaneOffset, zoomTowardOffset, pinchEngaged, backOutOfSphere, loadPins, savePins, nextPinLetter, MAX_PINS } from './zoom.mjs';
import { FAV_KEY, COLL_KEY, TOP10_ID, TOP10_NAME, LIMITS, newId, validFavorite, loadFavs, saveFavs, loadColls, saveColls, autoName, cleanName, uniqueName, addItem, moveItem, removeItem, encodeShare, decodeShare } from './favorites.mjs';

// ───────────────────────── units & helpers ─────────────────────────
// Scene unit: 1 AU. Frame: J2000 equatorial (x → vernal equinox, z → celestial north).
const AU_KM = 149597870.7;
const PC_AU = 206264.806;
const LY_AU = 63241.077;
const RSUN_AU = 695700 / AU_KM;
const DAY_MS = 86400000;
const YEAR_D = 365.25;
const KMS_TO_AUD = 86400 / AU_KM;           // km/s → AU/day
const UNIVERSE_R = 46.5e9 * LY_AU;          // observable-universe radius (AU)
const deg = Math.PI / 180;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const radec = (raDeg, decDeg, dist = 1) => V(
  Math.cos(decDeg * deg) * Math.cos(raDeg * deg) * dist,
  Math.cos(decDeg * deg) * Math.sin(raDeg * deg) * dist,
  Math.sin(decDeg * deg) * dist);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// Galactic frame (in equatorial coordinates)
const GC_DIR = radec(266.40499, -28.93617);
const NGP = radec(192.85948, 27.12825);
const L90 = new THREE.Vector3().crossVectors(NGP, GC_DIR).normalize(); // Sun's direction of travel around the galaxy
const R0_AU = 8.2e3 * PC_AU;                                         // Sun → galactic center
const GC_POS = GC_DIR.clone().multiplyScalar(R0_AU);
const ECL_N = radec(270, 66.5607); // ecliptic north pole
const SUN_GAL_KMS = 230;

// B–V colour index → RGB (approximate blackbody look)
function bvToRGB(bv) {
  bv = clamp(bv, -0.4, 2.0);
  let r, g, b;
  if (bv < 0) { r = 0.62 + 0.38 * (bv + 0.4) / 0.4; g = 0.72 + 0.23 * (bv + 0.4) / 0.4; b = 1; }
  else if (bv < 0.6) { r = 1; g = 0.95 - 0.05 * bv / 0.6; b = 1 - 0.3 * bv / 0.6; }
  else if (bv < 1.4) { r = 1; g = 0.9 - 0.3 * (bv - 0.6) / 0.8; b = 0.7 - 0.45 * (bv - 0.6) / 0.8; }
  else { r = 1; g = 0.6 - 0.15 * (bv - 1.4) / 0.6; b = 0.25 - 0.1 * (bv - 1.4) / 0.6; }
  return [r, g, b];
}

// ───────────────────────── renderer / scene ─────────────────────────
const canvas = document.getElementById('scene');
const isMobile = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.75 : 2));
renderer.setClearColor(0x000000, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 1e-7, 1e18);
scene.add(new THREE.AmbientLight(0xffffff, 0.035));
const sunLight = new THREE.PointLight(0xfff4e8, 3.2, 0, 0);
scene.add(sunLight);

let pxPerUnit = 1; // pixels per world unit at distance 1
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pxPerUnit = (h * renderer.getPixelRatio()) / (2 * Math.tan(camera.fov * deg / 2));
  for (const m of lineMaterials) m.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
}
const lineMaterials = [];

// shared point-sprite shader with log depth
const POINT_VERT = `
  attribute vec3 color; attribute float size;
  uniform float uScale; uniform float uOpacity; uniform float uMax; uniform float uMin;
  varying vec3 vColor; varying float vA;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    float px = size * uScale / max(-mv.z, 1e-30);
    float s = clamp(px, uMin, uMax);
    vA = uOpacity * clamp(px*px/(uMin*uMin), 0.0, 1.0);
    vColor = color;
    gl_PointSize = s;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const POINT_FRAG = `
  varying vec3 vColor; varying float vA;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d*d*4.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a * vA);
  }`;
function pointMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uOpacity: { value: 1 }, uMax: { value: opts.max ?? 6 }, uMin: { value: opts.min ?? 1.2 } },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// Glow marker: a single always-visible point with fixed pixel size.
const MARKER_VERT = `
  uniform float uSize; varying float vS;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){ vec4 mv = modelViewMatrix*vec4(0.,0.,0.,1.); gl_PointSize = uSize; vS=uSize; gl_Position = projectionMatrix*mv;
  #include <logdepthbuf_vertex>
  }`;
const MARKER_FRAG = `
  uniform vec3 uColor; uniform float uOpacity; uniform float uCore;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    float d = length(gl_PointCoord-0.5)*2.0;
    float glow = exp(-d*d*5.0) ;
    float core = smoothstep(uCore, uCore*0.5, d);
    vec3 c = mix(uColor, vec3(1.0), core*0.8);
    float a = max(glow*0.75, core) * uOpacity;
    if (a < 0.005) discard;
    gl_FragColor = vec4(c, a);
  }`;
function makeMarker(color, size = 10) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: size }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uCore: { value: 0.18 } },
    vertexShader: MARKER_VERT, fragmentShader: MARKER_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 5;
  return p;
}

// ───────────────────────── time ─────────────────────────
const SPEEDS = [
  ['Live', 1], ['1 min/s', 60], ['1 hr/s', 3600], ['1 day/s', 86400], ['1 wk/s', 604800],
  ['1 mo/s', 2629800], ['1 yr/s', 31557600], ['10 yr/s', 315576000], ['100 yr/s', 3155760000],
  ['1,000 yr/s', 31557600000], ['100k yr/s', 3155760000000], ['1M yr/s', 31557600000000],
];
const time = { ms: Date.now(), speedIdx: 0, dir: 1, paused: false };
const NOW0 = Date.now();
const simDays = () => (time.ms - NOW0) / DAY_MS; // days since app start
const simYears = () => (time.ms - Date.now()) / (DAY_MS * YEAR_D); // offset from real now, years

// ───────────────────────── solar system ─────────────────────────
const textureLoader = new THREE.TextureLoader();
function bandTexture(stops, noise = 0.08, seed = 1, spots = 0) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d'); const r = rng(seed);
  for (let y = 0; y < 256; y++) {
    const t = y / 255; let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1]; const u = clamp((t - t0) / (t1 - t0), 0, 1);
    const n = 1 + (r() - 0.5) * noise;
    const col = c0.map((v, k) => clamp(lerp(v, c1[k], u) * n, 0, 255) | 0);
    x.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; x.fillRect(0, y, 512, 1);
  }
  for (let s = 0; s < spots; s++) { // speckle / craters
    x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`; x.beginPath(); x.arc(r() * 512, r() * 256, 2 + r() * 14, 0, 7); x.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const PLANETS = [
  { id: 'mercury', name: 'Mercury', body: 'Mercury', P: 87.969, rKm: 2439.7, pole: [281.01, 61.41], spinH: 1407.6, color: '#b9b2a8',
    tex: () => bandTexture([[0, [150, 145, 138]], [1, [120, 115, 110]]], 0.2, 3, 260) },
  { id: 'venus', name: 'Venus', body: 'Venus', P: 224.701, rKm: 6051.8, pole: [272.76, 67.16], spinH: -5832.5, color: '#f3dca4',
    tex: () => bandTexture([[0, [236, 214, 160]], [0.5, [246, 226, 178]], [1, [226, 200, 150]]], 0.06, 4) },
  { id: 'earth', name: 'Earth', body: 'Earth', P: 365.256, rKm: 6371, pole: null, spinH: 23.934, color: '#7fb4ff' },
  { id: 'mars', name: 'Mars', body: 'Mars', P: 686.98, rKm: 3389.5, pole: [317.68, 52.89], spinH: 24.623, color: '#ff8a5c',
    tex: () => bandTexture([[0, [235, 230, 225]], [0.06, [190, 110, 70]], [0.5, [176, 92, 56]], [0.94, [190, 110, 70]], [1, [235, 230, 225]]], 0.25, 5, 140) },
  { id: 'jupiter', name: 'Jupiter', body: 'Jupiter', P: 4332.59, rKm: 69911, pole: [268.06, 64.5], spinH: 9.925, color: '#e7c9a0',
    tex: () => bandTexture([[0, [190, 170, 150]], [0.2, [220, 200, 170]], [0.3, [170, 130, 100]], [0.4, [235, 220, 195]], [0.47, [190, 145, 105]], [0.55, [240, 225, 200]], [0.62, [180, 135, 100]], [0.75, [225, 205, 178]], [1, [180, 165, 150]]], 0.06, 6) },
  { id: 'saturn', name: 'Saturn', body: 'Saturn', P: 10759.22, rKm: 58232, pole: [40.59, 83.54], spinH: 10.656, color: '#f1dcaa',
    tex: () => bandTexture([[0, [200, 185, 150]], [0.3, [225, 205, 160]], [0.45, [210, 185, 140]], [0.55, [235, 215, 170]], [0.7, [215, 195, 150]], [1, [190, 175, 145]]], 0.05, 7) },
  { id: 'uranus', name: 'Uranus', body: 'Uranus', P: 30688.5, rKm: 25362, pole: [257.31, -15.18], spinH: -17.24, color: '#a6e4ec',
    tex: () => bandTexture([[0, [170, 220, 228]], [1, [150, 205, 215]]], 0.03, 8) },
  { id: 'neptune', name: 'Neptune', body: 'Neptune', P: 60182, rKm: 24622, pole: [299.36, 43.46], spinH: 16.11, color: '#5f86ff',
    tex: () => bandTexture([[0, [80, 110, 210]], [0.5, [70, 100, 220]], [1, [90, 120, 210]]], 0.08, 9) },
  { id: 'pluto', name: 'Pluto', body: 'Pluto', P: 90560, rKm: 1188.3, pole: [132.99, -6.16], spinH: -153.29, color: '#d9c3a5',
    tex: () => bandTexture([[0, [200, 180, 155]], [1, [170, 145, 120]]], 0.25, 10, 60), dwarf: true },
];

// Periodic orbit tables sampled from astronomy-engine (real positions).
function buildTable(P, n, fn) {
  const arr = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = new Date(NOW0 + (i / n) * P * DAY_MS); const v = fn(d);
    arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
  }
  return { P, n, arr };
}
function sampleTable(tb, tDays, out) {
  let f = (tDays / tb.P) % 1; if (f < 0) f += 1;
  const x = f * tb.n; const i = Math.floor(x) % tb.n, j = (i + 1) % tb.n, u = x - Math.floor(x);
  const a = tb.arr;
  return out.set(lerp(a[i * 3], a[j * 3], u), lerp(a[i * 3 + 1], a[j * 3 + 1], u), lerp(a[i * 3 + 2], a[j * 3 + 2], u));
}

const systems = [];        // all orbiting systems (solar + story systems)
const focusables = {};     // id → { name, getPos(out), radius, story, defaultDist }

function poleQuat(raDec) {
  const q = new THREE.Quaternion();
  if (!raDec) return q; // Earth: z already = celestial pole (J2000)
  return q.setFromUnitVectors(V(0, 0, 1), radec(raDec[0], raDec[1]));
}
function starMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vP = normalize(position); vN=normalize(normalMatrix*normal); vec4 mvp=modelViewMatrix*vec4(position,1.); vV=normalize(-mvp.xyz); gl_Position=projectionMatrix*mvp;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      #include <logdepthbuf_pars_fragment>
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        #include <logdepthbuf_fragment>
        float mu = max(dot(normalize(vN), vV), 0.0);
        float limb = 0.35 + 0.65*pow(mu, 0.45);
        float gran = 0.82 + 0.18*(n3(vP*22.0)*0.6 + n3(vP*55.0)*0.4);
        vec3 c = mix(uColor, vec3(1.0), 0.35*pow(mu,2.0)) * limb * gran * 1.15;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}
function sphereGeo(r, seg = 48) { const g = new THREE.SphereGeometry(r, seg, seg / 2); g.rotateX(Math.PI / 2); return g; }

const solar = { id: 'solar', host: () => V(), vHelio: V(), bodies: [], group: new THREE.Group() };
scene.add(solar.group);
systems.push(solar);

// Sun
{
  const r = RSUN_AU;
  const mesh = new THREE.Mesh(sphereGeo(r, 64), starMaterial('#ffd9a0'));
  const marker = makeMarker('#ffd27a', 26); marker.material.uniforms.uCore.value = 0.22;
  solar.group.add(mesh, marker);
  const b = { id: 'sun', name: 'Sun', color: '#ffd27a', radius: r, mesh, marker, pos: V(), posAt: (t, o) => o.set(0, 0, 0), P: 0, isStar: true };
  solar.bodies.push(b);
  focusables.sun = { name: 'The Sun', getPos: o => o.set(0, 0, 0), radius: r, story: 'sun', defaultDist: 6 };
}
// Planets
const earthTable = buildTable(365.256, 1460, d => Astro.HelioVector('Earth', d));
for (const p of PLANETS) {
  const tb = p.id === 'earth' ? earthTable : buildTable(p.P, p.P > 20000 ? 1440 : 960, d => Astro.HelioVector(p.body, d));
  const r = p.rKm / AU_KM;
  const frame = new THREE.Group(); frame.quaternion.copy(poleQuat(p.pole));
  let mesh;
  if (p.id === 'earth') mesh = makeEarth(r);
  else mesh = new THREE.Mesh(sphereGeo(r), new THREE.MeshLambertMaterial({ map: p.tex() }));
  frame.add(mesh);
  if (p.id === 'saturn') frame.add(makeRings(r));
  const marker = makeMarker(p.color, p.dwarf ? 7 : 9);
  const holder = new THREE.Group(); holder.add(frame, marker);
  solar.group.add(holder);
  const b = { id: p.id, name: p.name, color: p.color, radius: r, mesh, frame, holder, marker, P: p.P, spinH: p.spinH, table: tb, pos: V(),
    posAt: (t, o) => sampleTable(tb, t, o), dwarf: p.dwarf };
  // semi-major axis estimate for scale decisions
  let maxR = 0; for (let i = 0; i < tb.n; i++) maxR = Math.max(maxR, Math.hypot(tb.arr[i * 3], tb.arr[i * 3 + 1], tb.arr[i * 3 + 2])); b.orbitR = maxR;
  solar.bodies.push(b);
  focusables[p.id] = { name: p.name, getPos: o => o.copy(b.pos), radius: r, story: p.id, defaultDist: r * 4.5, body: b };
}
// Moon
const moonTable = buildTable(27.321661, 720, d => Astro.GeoMoon(d));
const earthBody = solar.bodies.find(b => b.id === 'earth');
{
  const r = 1737.4 / AU_KM;
  const tex = textureLoader.load('moon.jpg'); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(sphereGeo(r, 40), new THREE.MeshLambertMaterial({ map: tex }));
  const marker = makeMarker('#d8d8d8', 6);
  const holder = new THREE.Group(); holder.add(mesh, marker); solar.group.add(holder);
  const tmp = V();
  const b = { id: 'moon', name: 'Moon', color: '#cfcfcf', radius: r, mesh, holder, marker, P: 27.321661, pos: V(), parent: earthBody,
    posAt: (t, o) => { sampleTable(earthTable, t, o); return o.add(sampleTable(moonTable, t, tmp)); }, relAt: (t, o) => sampleTable(moonTable, t, o), orbitR: 0.0027 };
  solar.bodies.push(b);
  focusables.moon = { name: 'The Moon', getPos: o => o.copy(b.pos), radius: r, story: 'moon', defaultDist: r * 5, body: b };
}

function makeEarth(r) {
  const day = textureLoader.load('earth_day.jpg'); day.colorSpace = THREE.SRGBColorSpace;
  const night = textureLoader.load('earth_night.jpg'); night.colorSpace = THREE.SRGBColorSpace;
  for (const t of [day, night]) t.anisotropy = 4;
  const mat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: day }, nightMap: { value: night }, sunDir: { value: V(1, 0, 0) } },
    vertexShader: `uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vSunV;
      #include <common>
  #include <logdepthbuf_pars_vertex>
      void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mvp=modelViewMatrix*vec4(position,1.); vV=normalize(-mvp.xyz);
      vSunV = normalize((viewMatrix*vec4(sunDir,0.)).xyz); gl_Position=projectionMatrix*mvp;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform sampler2D dayMap; uniform sampler2D nightMap; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vSunV;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float ndl = dot(normalize(vN), vSunV);
        vec3 d = texture2D(dayMap, vUv).rgb; vec3 n = texture2D(nightMap, vUv).rgb;
        float dayAmt = smoothstep(-0.12, 0.22, ndl);
        vec3 col = d * (0.06 + 1.15*max(ndl,0.0)) * dayAmt + n * vec3(1.0,0.82,0.55) * 1.6 * (1.0-dayAmt);
        float rim = pow(1.0 - max(dot(normalize(vN), vV),0.0), 3.0);
        col += vec3(0.35,0.6,1.0) * rim * smoothstep(-0.3,0.5,ndl) * 0.9;
        gl_FragColor = vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(sphereGeo(r, 96), mat); g.add(m);
  const atm = new THREE.Mesh(sphereGeo(r * 1.025, 64), new THREE.ShaderMaterial({
    uniforms: { sunDir: mat.uniforms.sunDir },
    vertexShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vV; varying vec3 vSunV;
      #include <common>
  #include <logdepthbuf_pars_vertex>
      void main(){ vN=normalize(normalMatrix*normal); vec4 mvp=modelViewMatrix*vec4(position,1.); vV=normalize(-mvp.xyz); vSunV=normalize((viewMatrix*vec4(sunDir,0.)).xyz); gl_Position=projectionMatrix*mvp;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vSunV;
      #include <logdepthbuf_pars_fragment>
      void main(){
      #include <logdepthbuf_fragment>
      float f = pow(1.0-abs(dot(normalize(vN),vV)), 2.5); float l = smoothstep(-0.4,0.6,dot(normalize(vN),vSunV));
      gl_FragColor = vec4(vec3(0.3,0.55,1.0)*f*l*1.4, f*l); }`,
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
  }));
  g.add(atm);
  g.userData.sunDir = mat.uniforms.sunDir;
  return g;
}
function makeRings(r) {
  const g = new THREE.RingGeometry(r * 1.24, r * 2.27, 128, 1);
  const m = new THREE.ShaderMaterial({
    uniforms: { rIn: { value: r * 1.24 }, rOut: { value: r * 2.27 } },
    vertexShader: `varying vec3 vP;
      #include <common>
  #include <logdepthbuf_pars_vertex>
      void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float rIn; uniform float rOut; varying vec3 vP;
      #include <logdepthbuf_pars_fragment>
      float h(float x){ return fract(sin(x*127.1)*43758.5); }
      void main(){
        #include <logdepthbuf_fragment>
        float t = (length(vP.xy)-rIn)/(rOut-rIn);
        float band = 0.55 + 0.45*sin(t*90.0)*sin(t*23.0) ;
        float a = smoothstep(0.0,0.06,t) * (1.0 - smoothstep(0.93,1.0,t));
        a *= (t>0.52 && t<0.58) ? 0.08 : 1.0; // Cassini division
        a *= 0.35 + 0.65*band*(0.7+0.3*h(floor(t*200.)));
        gl_FragColor = vec4(vec3(0.93,0.85,0.68)*0.9, a*0.85);
      }`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  return new THREE.Mesh(g, m);
}

// Static full-orbit rings (Sun view)
const orbitRings = new THREE.Group(); solar.group.add(orbitRings);
for (const b of solar.bodies) {
  if (!b.table || b.id === 'moon') continue;
  const pts = []; const o = V();
  for (let i = 0; i <= 360; i++) { sampleTable(b.table, (i / 360) * b.P, o); pts.push(o.x, o.y, o.z); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: b.color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  orbitRings.add(line);
}

// ───────────────────────── story star systems ─────────────────────────
function solveKepler(M, e) { let E = M; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }
function keplerRel(a, e, P, phase, e1, e2) {
  return (t, o) => {
    const M = 2 * Math.PI * ((t / P + phase) % 1);
    const E = solveKepler(M, e);
    const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
    return o.copy(e1).multiplyScalar(x).addScaledVector(e2, y);
  };
}
function planeBasis(normal) {
  const n = normal.clone().normalize();
  const e1 = new THREE.Vector3().crossVectors(n, Math.abs(n.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0)).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  return [e1, e2];
}
let starData = null; // filled after load
// constellation state (lines, selection); declared early because showCard() touches it
const CON_VIEW_AU = 300; // the viewpoint sits this far from the Sun
const con = { list: null, byAbbr: new Map(), loading: null, geo: null, all: null, sel: null, range: null, segIdx: null, selAbbr: null, lastDt: NaN, stats: null, statsRows: null };
// catalog star index → story focusable id (stars drawn by a story system or followed by a story stop)
const starOwner = new Map();
const storyStarIdx = {}; // story id → its main catalog star
function makeStarSystem(def) {
  const group = new THREE.Group(); scene.add(group);
  const sys = { id: def.id, story: def.story, bodies: [], group, hostPos: def.pos.clone(), vHelio: def.vHelio || V(), isStory: true };
  group.position.copy(sys.hostPos);
  sys.host = () => sys.hostPos;
  const [e1, e2] = planeBasis(def.normal);
  for (const s of def.bodies) {
    const isStar = !!s.star;
    const mesh = new THREE.Mesh(sphereGeo(s.r, 40), isStar ? starMaterial(s.color) : new THREE.MeshLambertMaterial({ color: s.color, emissive: new THREE.Color(s.color).multiplyScalar(0.12) }));
    const marker = makeMarker(s.markerColor || s.color, (s.marker || (isStar ? 16 : 7)) * (isStar ? 1.7 : 1));
    const holder = new THREE.Group(); holder.add(mesh, marker); group.add(holder);
    let relFn;
    if (s.binary) { const k = s.binary.k; const base = keplerRel(s.binary.a, s.binary.e, s.binary.P, s.binary.phase || 0, e1, e2); relFn = (t, o) => base(t, o).multiplyScalar(k); }
    else if (s.orbit) relFn = keplerRel(s.orbit.a, s.orbit.e || 0, s.orbit.P, s.orbit.phase || 0, e1, e2);
    else if (s.posFn) relFn = s.posFn; // custom path (e.g. hierarchical triples, per-body orbit planes)
    else relFn = (t, o) => o.set(0, 0, 0);
    const b = { id: def.id + ':' + s.name, name: s.name, color: s.color, radius: s.r, mesh, holder, marker, isStar,
      P: s.binary ? s.binary.P : (s.orbit ? s.orbit.P : (s.P || 0)), orbitR: s.binary ? s.binary.a * Math.abs(s.binary.k) * 1.5 : (s.orbit ? s.orbit.a : (s.orbitR || 0)), posAt: relFn, pos: V() };
    sys.bodies.push(b);
  }
  systems.push(sys);
  return sys;
}
function initStorySystems() {
  const findStar = name => starData.names.find(n => n[1] === name);
  const starPos = idx => V(starData.buf[idx * 8], starData.buf[idx * 8 + 1], starData.buf[idx * 8 + 2]).multiplyScalar(PC_AU);
  const starVel = idx => V(starData.buf[idx * 8 + 3], starData.buf[idx * 8 + 4], starData.buf[idx * 8 + 5]).multiplyScalar(PC_AU / YEAR_D); // AU/day
  const hide = (idx, owner) => { starData.hidden.push(idx); if (owner) { starOwner.set(idx, owner); if (!(owner in storyStarIdx)) storyStarIdx[owner] = idx; } };
  const defs = [];
  // Alpha Centauri A+B (a = 23.4 AU, e = 0.52, P = 79.9 yr, masses 1.08 / 0.91)
  const acA = findStar('Rigil Kentaurus'), acB = findStar('Toliman');
  if (acA) {
    const mA = 1.08, mB = 0.91, M = mA + mB;
    defs.push({ id: 'alphacen', story: 'alphacen', name: 'Alpha Centauri', pos: starPos(acA[0]), vHelio: starVel(acA[0]), normal: V(0.3, -0.5, 0.8), defaultDist: 70,
      bodies: [
        { name: 'Alpha Centauri A', star: true, r: 1.22 * RSUN_AU, color: '#fff2d6', binary: { a: 23.4, e: 0.52, P: 79.91 * YEAR_D, k: -mB / M } },
        { name: 'Alpha Centauri B', star: true, r: 0.86 * RSUN_AU, color: '#ffd29a', binary: { a: 23.4, e: 0.52, P: 79.91 * YEAR_D, k: mA / M } },
      ] });
    hide(acA[0], 'alphacen'); if (acB) hide(acB[0], 'alphacen');
  }
  // Sirius A+B (a = 19.8 AU, e = 0.59, P = 50.1 yr, masses 2.06 / 1.02)
  const si = findStar('Sirius');
  if (si) {
    const mA = 2.06, mB = 1.02, M = mA + mB;
    defs.push({ id: 'sirius', story: 'sirius', name: 'Sirius', pos: starPos(si[0]), vHelio: starVel(si[0]), normal: V(-0.4, 0.2, 0.9), defaultDist: 55,
      bodies: [
        { name: 'Sirius A', star: true, r: 1.71 * RSUN_AU, color: '#cfe0ff', marker: 22, binary: { a: 19.8, e: 0.59, P: 50.13 * YEAR_D, k: -mB / M } },
        { name: 'Sirius B', star: true, r: 0.0084 * RSUN_AU, color: '#f2f6ff', marker: 9, binary: { a: 19.8, e: 0.59, P: 50.13 * YEAR_D, k: mA / M } },
      ] });
    hide(si[0], 'sirius');
  }
  // TRAPPIST-1 (RA 346.622°, Dec −5.041°, 12.47 pc) – not in HYG (too faint)
  {
    const T = [['b', 1.51087, 0.01154], ['c', 2.42182, 0.0158], ['d', 4.04961, 0.02227], ['e', 6.09962, 0.02925], ['f', 9.2054, 0.03849], ['g', 12.35294, 0.04683], ['h', 18.7729, 0.06189]];
    const pcol = ['#ffb38a', '#ff9f7a', '#f5c78e', '#9fd4ff', '#8fbfff', '#b6a6ff', '#d6a6ff'];
    defs.push({ id: 'trappist', story: 'trappist', name: 'TRAPPIST-1', pos: radec(346.622, -5.041, 12.47 * PC_AU), normal: V(0.15, 0.95, 0.25), defaultDist: 0.28,
      bodies: [{ name: 'TRAPPIST-1', star: true, r: 0.119 * RSUN_AU, color: '#ff7a4d', marker: 18 },
        ...T.map(([n, P, a], i) => ({ name: 'TRAPPIST-1' + n, r: 6371 / AU_KM * 1.0, color: pcol[i], marker: 6, orbit: { a, P, phase: (i * 0.37) % 1 } }))] });
  }
  // Betelgeuse – ~750 solar radii (uncertain)
  const be = findStar('Betelgeuse');
  if (be) {
    defs.push({ id: 'betelgeuse', story: 'betelgeuse', name: 'Betelgeuse', pos: starPos(be[0]), vHelio: starVel(be[0]), normal: V(0, 0, 1), defaultDist: 22,
      bodies: [{ name: 'Betelgeuse', star: true, r: 750 * RSUN_AU, color: '#ff8a4a', marker: 30 }] });
    hide(be[0], 'betelgeuse');
  }
  defs.push(...moreStoryDefs({ findStar, starPos, starVel, hide }));
  for (const d of defs) {
    const sys = makeStarSystem(d);
    focusables[d.id] = { name: d.name, getPos: d.focusFn ? o => d.focusFn(simDays(), o).add(sys.hostPos) : o => o.copy(sys.hostPos), radius: 0.02, story: d.story, defaultDist: d.defaultDist, sys, starIdx: storyStarIdx[d.id] };
    d.after?.(sys);
  }
  addMovingStarStops();
  addOrionNebula();
  addReadOnlyStops();
}

// ── More story stops (Nov 2026). Numbers from the sources named on each card in stories.js. ──
const MJ_MSUN = 1 / 1047.57, RJ_AU = 71492 / AU_KM, RE_AU = 6371 / AU_KM;
// position function for one body on its own orbit plane: k scales the relative orbit (barycentric share)
function orbitFn(a, e, P, phase, normal, k = 1) {
  const [e1, e2] = planeBasis(normal); const f = keplerRel(a, e, P, phase, e1, e2);
  return (t, o) => f(t, o).multiplyScalar(k);
}
// orbital phase (0–1, 0 = pericentre) right now, from a pericentre epoch in decimal years
const phaseNow = (periYear, Pyears) => { const y = 1970 + Date.now() / (DAY_MS * YEAR_D); return (((y - periYear) / Pyears) % 1 + 1) % 1; };
// brightest-enough HYG star closest to a sky direction (for stars without a proper name in our list)
function nearestStar(raDeg, decDeg, maxSepDeg = 0.2, dMin = 0, dMax = 1e9) {
  const dir = radec(raDeg, decDeg); const cosMax = Math.cos(maxSepDeg * deg); let best = -1, bestDot = cosMax;
  const b = starData.buf;
  for (let i = 0; i < starData.N; i++) {
    const x = b[i * 8], y = b[i * 8 + 1], z = b[i * 8 + 2]; const d = Math.hypot(x, y, z);
    if (d < dMin || d > dMax || d === 0) continue;
    const dot = (x * dir.x + y * dir.y + z * dir.z) / d;
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  return best;
}
function moreStoryDefs({ findStar, starPos, starVel, hide }) {
  const defs = [];
  const edgeOn = pos => new THREE.Vector3().crossVectors(pos.clone().normalize(), V(0, 0, 1)).normalize(); // orbit seen edge-on from Earth
  // Proxima Centauri b & d (NASA Exoplanet Archive default set: Suárez Mascareño et al. 2025)
  const px = findStar('Proxima Centauri');
  if (px) {
    defs.push({ id: 'proxima', story: 'proxima', name: 'Proxima Centauri', pos: starPos(px[0]), vHelio: starVel(px[0]), normal: V(0.2, 0.9, 0.35), defaultDist: 0.15,
      bodies: [{ name: 'Proxima Centauri', star: true, r: 0.141 * RSUN_AU, color: '#ff6a3d', marker: 18 },
        { name: 'Proxima d', r: RE_AU * 0.65, color: '#f5b48a', marker: 5, orbit: { a: 0.02881, P: 5.12338, phase: 0.6 } },
        { name: 'Proxima b', r: RE_AU, color: '#8fd0ff', marker: 7, orbit: { a: 0.04848, P: 11.18465, phase: 0.1 } }] });
    hide(px[0], 'proxima');
  }
  // 51 Pegasi b (archive: P 4.2307966 d, a 0.052 AU, M sin i 0.464 MJ; star 1.07 Msun, 1.19 Rsun). Star wobble ×300.
  const pg = findStar('Helvetios');
  if (pg) {
    const mS = 1.07, mP = 0.464 * MJ_MSUN, WOBBLE = 300;
    const bin = { a: 0.052, e: 0, P: 4.2307966 };
    defs.push({ id: 'peg51', story: 'peg51', name: '51 Pegasi', pos: starPos(pg[0]), vHelio: starVel(pg[0]), normal: V(-0.3, 0.4, 0.86), defaultDist: 0.16,
      bodies: [{ name: '51 Pegasi', star: true, r: 1.19 * RSUN_AU, color: '#fff0c8', marker: 18, binary: { ...bin, k: -(mP / (mS + mP)) * WOBBLE } },
        { name: '51 Pegasi b', r: RJ_AU, color: '#ffb36b', marker: 8, binary: { ...bin, k: mS / (mS + mP) } }] });
    hide(pg[0], 'peg51');
  }
  // Kepler-16 (Doyle et al. 2011; archive distance 75.0852 pc) – not in HYG (too faint). Transiting, so edge-on.
  {
    const pos = radec(289.0757, 51.7575, 75.0852 * PC_AU); const n = edgeOn(pos);
    const mA = 0.6897, mB = 0.20255, M = mA + mB; const bin = { a: 0.22431, e: 0.15944, P: 41.07922 };
    defs.push({ id: 'kepler16', story: 'kepler16', name: 'Kepler-16', pos, normal: n, defaultDist: 2.2,
      bodies: [{ name: 'Kepler-16 A', star: true, r: 0.6489 * RSUN_AU, color: '#ffc27a', marker: 16, binary: { ...bin, k: -mB / M } },
        { name: 'Kepler-16 B', star: true, r: 0.22623 * RSUN_AU, color: '#ff7a4a', marker: 11, binary: { ...bin, k: mA / M } },
        { name: 'Kepler-16 b', r: 0.7538 * RJ_AU, color: '#d9c7a0', marker: 8, orbit: { a: 0.7048, e: 0.0069, P: 228.776, phase: 0.3 } }] });
  }
  // Algol A–B (P 2.867328 d, a 2.15 mas) + C (P 680.168 d, a 93.43 mas, e 0.227), parallax 34.7 mas; mutual inclination 90.2° (Baron et al. 2012)
  const al = findStar('Algol');
  if (al) {
    const pos = starPos(al[0]); const los = pos.clone().normalize();
    const nIn = edgeOn(pos), nOut = new THREE.Vector3().crossVectors(los, nIn).normalize(); // both edge-on, 90° apart
    const plx = 34.7, aIn = 2.15 / plx, aOut = 93.43 / plx;
    const mA = 3.17, mB = 0.70, mC = 1.76, mAB = mA + mB, M = mAB + mC;
    const inner = orbitFn(aIn, 0, 2.867328, 0, nIn), outer = orbitFn(aOut, 0.227, 680.168, 0.4, nOut);
    const tmpO = V();
    const ab = (t, o, k) => { inner(t, o).multiplyScalar(k); return o.addScaledVector(outer(t, tmpO), -mC / M); };
    defs.push({ id: 'algol', story: 'algol', name: 'Algol', pos, vHelio: starVel(al[0]), normal: nIn, defaultDist: 0.4,
      focusFn: (t, o) => outer(t, o).multiplyScalar(-mC / M), // follow the eclipsing pair; zoom out to see C
      bodies: [{ name: 'Algol A', star: true, r: 2.73 * RSUN_AU, color: '#c4d6ff', marker: 18, posFn: (t, o) => ab(t, o, -mB / mAB), P: 2.867328, orbitR: aIn * 0.3 },
        { name: 'Algol B', star: true, r: 3.48 * RSUN_AU, color: '#ffbf80', marker: 12, posFn: (t, o) => ab(t, o, mA / mAB), P: 2.867328, orbitR: aIn },
        { name: 'Algol C', star: true, r: 1.73 * RSUN_AU, color: '#fff3dc', marker: 12, posFn: (t, o) => outer(t, o).multiplyScalar(mAB / M), P: 680.168, orbitR: aOut * mAB / M }] });
    hide(al[0], 'algol');
  }
  // Polaris Aa–Ab (Evans et al. 2024: P 29.416 yr, a 129.55 mas at 136.90 pc, e 0.6354, T 2016.831; Aa 5.13 Msun, 46.27 Rsun; Ab 1.316 Msun)
  const po = findStar('Polaris');
  if (po) {
    const a = 0.12955 * 136.90, mA = 5.13, mB = 1.316, M = mA + mB; const bin = { a, e: 0.6354, P: 29.416 * YEAR_D, phase: phaseNow(2016.831, 29.416) };
    defs.push({ id: 'polaris', story: 'polaris', name: 'Polaris', pos: starPos(po[0]), vHelio: starVel(po[0]), normal: V(0.5, -0.3, 0.8), defaultDist: 60,
      bodies: [{ name: 'Polaris Aa', star: true, r: 46.27 * RSUN_AU, color: '#fff1d0', marker: 22, binary: { ...bin, k: -mB / M } },
        { name: 'Polaris Ab', star: true, r: 1.2 * RSUN_AU, color: '#fff8ea', marker: 10, binary: { ...bin, k: mA / M } }] });
    hide(po[0], 'polaris');
  }
  // Mira + its 13-light-year ultraviolet tail (NASA/JPL GALEX). Tail drawn behind the star's catalog motion.
  const mi = findStar('Mira');
  if (mi) {
    const vel = starVel(mi[0]);
    defs.push({ id: 'mira', story: 'mira', name: 'Mira', pos: starPos(mi[0]), vHelio: vel, normal: V(0, 0, 1), defaultDist: 1.4e6,
      bodies: [{ name: 'Mira', star: true, r: 350 * RSUN_AU, color: '#ff7a45', marker: 22 }],
      after: sys => sys.group.add(makeMiraTail(vel.lengthSq() ? vel.clone().normalize() : V(1, 0, 0))) });
    hide(mi[0], 'mira');
  }
  // Sagittarius A* + S2 (GRAVITY 2020: a 125.058 mas at R0 8246.7 pc, e 0.884649, P 16.0455 yr, t_peri 2018.379, M 4.261e6 Msun)
  {
    const aS2 = 0.125058 * 8246.7, rs = 2 * 6.674e-11 * 4.261e6 * 1.989e30 / (299792458 ** 2) / 1000 / AU_KM; // Schwarzschild radius (AU)
    defs.push({ id: 'sgra', story: 'sgra', name: 'Sagittarius A*', pos: GC_POS.clone(), vHelio: L90.clone().multiplyScalar(-SUN_GAL_KMS * KMS_TO_AUD), // at rest in the galaxy frame
      normal: V(0.35, -0.6, 0.72), defaultDist: 4200,
      bodies: [{ name: 'Sagittarius A*', r: rs, color: '#000000', markerColor: '#ffae66', marker: 18 },
        { name: 'S2', star: true, r: 0.05, color: '#d6e4ff', marker: 12, orbit: { a: aS2, e: 0.884649, P: 16.0455 * YEAR_D, phase: phaseNow(2018.379, 16.0455) } }] });
  }
  defs.push(...readOnlyStoryDefs({ findStar, starPos, starVel, hide }));
  return defs;
}
// ── Read-only stops (tap to read; not in the Tour, no narration). Numbers from the sources on each card. ──
function readOnlyStoryDefs({ findStar, starPos, starVel, hide }) {
  const defs = [];
  const hideNear = (ra, dec, sep = 0.05, owner) => { const i = nearestStar(ra, dec, sep); if (i >= 0) hide(i, owner); };
  // Vega: polar 2.31, equatorial 2.87 Rsun (Peterson et al. 2006); pole points almost at us
  const ve = findStar('Vega');
  if (ve) {
    const pos = starPos(ve[0]);
    defs.push({ id: 'vega', story: 'vega', name: 'Vega', pos, vHelio: starVel(ve[0]), normal: V(0, 0, 1), defaultDist: 0.16,
      bodies: [{ name: 'Vega', star: true, r: 2.87 * RSUN_AU, color: '#dfe8ff', marker: 22 }],
      after: sys => { const m = sys.bodies[0].mesh; m.quaternion.setFromUnitVectors(V(0, 0, 1), pos.clone().normalize()); m.scale.set(1, 1, 2.31 / 2.87); } });
    hide(ve[0], 'vega');
  }
  // 61 Cygni A+B (not named in HYG): Izmailov et al. 2021 P 704.9 yr, e 0.435, M 1.286 Msun → a ≈ 86 AU; mass split from Kervella 2008 (0.690 / 0.605)
  {
    const iA = nearestStar(316.7246, 38.7494, 0.05, 2, 6);
    if (iA >= 0) {
      const mA = 0.690, mB = 0.605, M = mA + mB; const P = 704.9, a = Math.cbrt(1.286 * P * P);
      const bin = { a, e: 0.435, P: P * YEAR_D, phase: 0.3 };
      defs.push({ id: 'cyg61', story: 'cyg61', name: '61 Cygni', pos: starPos(iA), vHelio: starVel(iA), normal: V(0.4, 0.3, 0.86), defaultDist: 260,
        bodies: [{ name: '61 Cygni A', star: true, r: 0.665 * RSUN_AU, color: '#ffc480', marker: 16, binary: { ...bin, k: -mB / M } },
          { name: '61 Cygni B', star: true, r: 0.595 * RSUN_AU, color: '#ffa860', marker: 14, binary: { ...bin, k: mA / M } }] });
      hide(iA, 'cyg61'); hideNear(316.7303, 38.7421, 0.05, 'cyg61');
    }
  }
  // Luhman 16 A+B (not in HYG): RA 162.3149°, Dec −53.3184°, 1.996 pc; a 3.52 AU, e 0.344, P 26.55 yr, 35.4 / 29.4 MJ (HST 2024)
  {
    const mA = 35.4, mB = 29.4, M = mA + mB; const bin = { a: 3.52, e: 0.344, P: 26.55 * YEAR_D, phase: 0.2 };
    defs.push({ id: 'luhman16', story: 'luhman16', name: 'Luhman 16', pos: radec(162.3149, -53.3184, 1.996 * PC_AU), normal: V(-0.3, 0.5, 0.8), defaultDist: 12,
      bodies: [{ name: 'Luhman 16 A', star: true, r: RJ_AU, color: '#c2523e', marker: 13, binary: { ...bin, k: -mB / M } },
        { name: 'Luhman 16 B', star: true, r: RJ_AU, color: '#a64a6a', marker: 12, binary: { ...bin, k: mA / M } }] });
  }
  // Capella Aa+Ab (Torres et al. 2015): P 104.02128 d, a 0.74272 AU, masses 2.5687 / 2.4828, radii 11.98 / 8.83 Rsun
  const ca = findStar('Capella');
  if (ca) {
    const mA = 2.5687, mB = 2.4828, M = mA + mB; const bin = { a: 0.74272, e: 0, P: 104.02128 };
    defs.push({ id: 'capella', story: 'capella', name: 'Capella', pos: starPos(ca[0]), vHelio: starVel(ca[0]), normal: V(0.2, -0.4, 0.9), defaultDist: 2.6,
      bodies: [{ name: 'Capella Aa', star: true, r: 11.98 * RSUN_AU, color: '#ffd98f', marker: 20, binary: { ...bin, k: -mB / M } },
        { name: 'Capella Ab', star: true, r: 8.83 * RSUN_AU, color: '#fff0c0', marker: 18, binary: { ...bin, k: mA / M } }] });
    hide(ca[0], 'capella');
  }
  // Cygnus X-1 (Miller-Jones et al. 2021): 2.22 kpc, BH 21.2 Msun, O star 40.6 Msun / 22.3 Rsun, a 0.244 AU, e 0.019, P 5.6 d
  {
    const pos = radec(299.5903, 35.2016, 2220 * PC_AU);
    const mBH = 21.2, mO = 40.6, M = mBH + mO; const bin = { a: 0.244, e: 0.019, P: 5.5998 };
    const rs = 2 * 6.674e-11 * mBH * 1.989e30 / (299792458 ** 2) / 1000 / AU_KM;
    defs.push({ id: 'cygx1', story: 'cygx1', name: 'Cygnus X-1', pos, normal: V(0.3, 0.6, 0.74), defaultDist: 2.2,
      bodies: [{ name: 'HDE 226868', star: true, r: 22.3 * RSUN_AU, color: '#bcd0ff', marker: 20, binary: { ...bin, k: -mBH / M } },
        { name: 'Cygnus X-1 black hole', r: rs, color: '#000000', markerColor: '#ffae66', marker: 14, binary: { ...bin, k: mO / M } }] });
    const cx = findStar('Cygnus X-1'); if (cx) hide(cx[0], 'cygx1'); // HYG's Hipparcos distance (~1,940 ly) is superseded
  }
  // Eta Carinae: ~7,500 ly (NASA); 5.54-yr orbit; e ≈ 0.9 and a ≈ 15.4 AU as in published colliding-wind models (periastron ≈ Mars' distance)
  {
    const pos = radec(161.2650, -59.6845, 7500 / 3.2616 * PC_AU);
    const bin = { a: 15.4, e: 0.9, P: 5.54 * YEAR_D, phase: 0.5 }; const mA = 90, mB = 30, M = mA + mB;
    defs.push({ id: 'etacar', story: 'etacar', name: 'Eta Carinae', pos, normal: V(0.2, 0.3, 0.93), defaultDist: 6e4,
      bodies: [{ name: 'Eta Carinae A', star: true, r: 100 * RSUN_AU, color: '#cfe0ff', marker: 22, binary: { ...bin, k: -mB / M } },
        { name: 'Eta Carinae B', star: true, r: 20 * RSUN_AU, color: '#e8f0ff', marker: 14, binary: { ...bin, k: mA / M } }],
      after: sys => sys.group.add(makeHomunculus(pos.clone().normalize())) });
    hideNear(161.2650, -59.6845, 0.05, 'etacar');
  }
  defs.push(...batch3Defs({ findStar, starPos, starVel, hide }));
  return defs;
}
// ── Batch 3 read-only stops (Nov 2026). Planet numbers: NASA Exoplanet Archive (pscomppars) unless noted. ──
function batch3Defs({ findStar, starPos, starVel, hide }) {
  const defs = [];
  const los = p => p.clone().normalize();
  const edgeOn = pos => new THREE.Vector3().crossVectors(los(pos), V(0, 0, 1)).normalize();
  const planets = (list, col, rDef = RJ_AU) => list.map(([n, a, P, e, r], i) => ({ name: n, r: r ?? rDef, color: col[i % col.length], marker: 7, orbit: { a, P, e: e || 0, phase: (i * 0.29 + 0.1) % 1 } }));
  // HR 8799 (41.2441 pc): e 16.4, d 24, c 38, b 68 AU; periods from the archive. Seen close to face-on; drawn circular.
  {
    const pos = radec(346.8701, 21.1340, 41.2441 * PC_AU);
    defs.push({ id: 'hr8799', story: 'hr8799', name: 'HR 8799', pos, normal: los(pos).add(V(0.15, 0.1, 0)).normalize(), defaultDist: 240,
      bodies: [{ name: 'HR 8799', star: true, r: 1.49 * RSUN_AU, color: '#eef2ff', marker: 18 },
        ...planets([['HR 8799 e', 16.4, 20815.6], ['HR 8799 d', 24, 37000], ['HR 8799 c', 38, 69000], ['HR 8799 b', 68, 170000]].map(x => [...x, 0, 1.2 * RJ_AU]), ['#ff9f6a', '#ffc37a', '#e8a0ff', '#9fc4ff'])] });
    hideNear3(346.8701, 21.1340, hide, 'hr8799');
  }
  // Beta Pictoris (19.7442 pc): c 2.7 AU / 1202 d / e 0.307; b 10.07 AU / 8682 d / e 0.105; d 26 AU / 33200 d / e 0.44 (2026). Disk seen edge-on.
  {
    const pos = radec(86.8212, -51.0661, 19.7442 * PC_AU); const n = edgeOn(pos);
    defs.push({ id: 'betapic', story: 'betapic', name: 'Beta Pictoris', pos, normal: n, defaultDist: 300,
      bodies: [{ name: 'Beta Pictoris', star: true, r: 1.54 * RSUN_AU, color: '#f2f5ff', marker: 18 },
        ...planets([['Beta Pictoris c', 2.7, 1202, 0.307], ['Beta Pictoris b', 10.07, 8682, 0.105], ['Beta Pictoris d', 26, 33200, 0.44]].map(x => [...x, 1.2 * RJ_AU]), ['#ffb37a', '#ffd59a', '#a8c8ff'])],
      after: sys => sys.group.add(makeDustRing(n, 60, 28, 0.02, [1, 0.85, 0.65], 8000, 0.45, 6, 1.4)) });
    hideNear3(86.8212, -51.0661, hide, 'betapic');
  }
  // Fomalhaut: dust ring ~136 AU across its long axis, e ≈ 0.12 (ALMA, MacGregor et al. 2017)
  const fo = findStar('Fomalhaut');
  if (fo) {
    const n = V(0.35, 0.5, 0.79).normalize();
    defs.push({ id: 'fomalhaut', story: 'fomalhaut', name: 'Fomalhaut', pos: starPos(fo[0]), vHelio: starVel(fo[0]), normal: n, defaultDist: 520,
      bodies: [{ name: 'Fomalhaut', star: true, r: 1.84 * RSUN_AU, color: '#eef3ff', marker: 20 }],
      after: sys => sys.group.add(makeDustRing(n, 136, 8, 0.12, [0.9, 0.78, 0.6], 3200, 0.55, 8)) });
    hide(fo[0], 'fomalhaut');
  }
  // Epsilon Eridani (Ran): planet b a 3.53 AU, P 2680 d, e 0.06; outer dust ring ~70 AU (ALMA, Booth et al. 2017)
  const ee = findStar('Ran');
  if (ee) {
    const n = V(-0.2, 0.45, 0.87).normalize();
    defs.push({ id: 'epseri', story: 'epseri', name: 'Epsilon Eridani', pos: starPos(ee[0]), vHelio: starVel(ee[0]), normal: n, defaultDist: 190,
      bodies: [{ name: 'Epsilon Eridani', star: true, r: 0.76 * RSUN_AU, color: '#ffcf8f', marker: 18 },
        ...planets([['Epsilon Eridani b', 3.53, 2680, 0.06]], ['#d9c3a0'])],
      after: sys => sys.group.add(makeDustRing(n, 70, 10, 0, [0.8, 0.7, 0.55], 2400, 0.5, 6)) });
    hide(ee[0], 'epseri');
  }
  // Tau Ceti (3.603 pc): candidate planets g 0.133 AU / 20 d, h 0.243 / 49.41 d, f 1.334 / 636.13 d (minimum masses; unconfirmed)
  {
    const i = nearestStar(26.0170, -15.9375, 0.1, 3, 4.3);
    if (i >= 0) {
      defs.push({ id: 'taucet', story: 'taucet', name: 'Tau Ceti', pos: starPos(i), vHelio: starVel(i), normal: V(0.3, -0.3, 0.9), defaultDist: 4.2,
        bodies: [{ name: 'Tau Ceti', star: true, r: 0.83 * RSUN_AU, color: '#fff0cf', marker: 18 },
          ...planets([['Tau Ceti g', 0.133, 20, 0.06], ['Tau Ceti h', 0.243, 49.41, 0.23], ['Tau Ceti f', 1.334, 636.13, 0.16]], ['#f0b48a', '#d8c09a', '#9fc8ff'], RE_AU * 1.5)] });
      hide(i, 'taucet');
    }
  }
  // Spica (Tkachenko et al. 2016): P 4.0145 d, e 0.133, a 28.20 Rsun, masses 11.43 / 7.21, radii 7.47 / 3.74 Rsun
  const sp = findStar('Spica');
  if (sp) {
    const mA = 11.43, mB = 7.21, M = mA + mB; const bin = { a: 28.20 * RSUN_AU, e: 0.133, P: 4.0145 };
    defs.push({ id: 'spica', story: 'spica', name: 'Spica', pos: starPos(sp[0]), vHelio: starVel(sp[0]), normal: V(0.4, 0.2, 0.89), defaultDist: 0.75,
      bodies: [{ name: 'Spica A', star: true, r: 7.47 * RSUN_AU, color: '#b8ccff', marker: 20, binary: { ...bin, k: -mB / M } },
        { name: 'Spica B', star: true, r: 3.74 * RSUN_AU, color: '#cfdcff', marker: 14, binary: { ...bin, k: mA / M } }] });
    hide(sp[0], 'spica');
  }
  // 55 Cancri (Copernicus): e, b, c, f, d from the archive (e: R 1.875 Earth)
  const cn = findStar('Copernicus');
  if (cn) {
    defs.push({ id: 'cnc55', story: 'cnc55', name: '55 Cancri', pos: starPos(cn[0]), vHelio: starVel(cn[0]), normal: V(-0.25, 0.35, 0.9), defaultDist: 0.075,
      bodies: [{ name: '55 Cancri A', star: true, r: 0.98 * RSUN_AU, color: '#ffe3b0', marker: 18 },
        { name: '55 Cancri e', r: 1.875 * RE_AU, color: '#ff7a3a', marker: 8, orbit: { a: 0.01544, P: 0.7365474, e: 0.05, phase: 0.2 } },
        ...planets([['55 Cancri b', 0.118, 14.651552, 0.0029], ['55 Cancri c', 0.247, 44.3936, 0.088], ['55 Cancri f', 0.802, 260.58, 0.063], ['55 Cancri d', 5.6, 4799, 0.0913]], ['#ffd59a', '#c8b48a', '#9fc8ff', '#e0c8a0'])] });
    hide(cn[0], 'cnc55');
  }
  // Kepler-90 (848.254 pc; not in HYG). Eight transiting planets, so drawn edge-on.
  {
    const pos = radec(284.4335, 49.3051, 848.254 * PC_AU);
    const P8 = [['Kepler-90 b', 0.074, 7.008151, 1.31], ['Kepler-90 c', 0.089, 8.719375, 1.19], ['Kepler-90 i', 0.1201, 14.44912, 1.32], ['Kepler-90 d', 0.32, 59.73667, 2.87],
      ['Kepler-90 e', 0.42, 91.93913, 2.66], ['Kepler-90 f', 0.48, 124.9144, 2.88], ['Kepler-90 g', 0.71704, 210.73514, 7.718], ['Kepler-90 h', 0.97062, 331.60296, 11.252]];
    defs.push({ id: 'kepler90', story: 'kepler90', name: 'Kepler-90', pos, normal: edgeOn(pos).add(V(0, 0, 0.25)).normalize(), defaultDist: 2.6,
      bodies: [{ name: 'Kepler-90', star: true, r: 1.2 * RSUN_AU, color: '#fff2d8', marker: 18 },
        ...planets(P8.map(([n, a, P, re]) => [n, a, P, 0, re * RE_AU]), ['#f0a080', '#e8b090', '#ffc8a0', '#c8d0a0', '#a0c8c0', '#9fc0ff', '#e0c890', '#d8b88a'])] });
  }
  // Gaia BH1 (El-Badry et al. 2023): 480 pc; BH 9.62 Msun, star 0.93 Msun; P 185.6 d, e 0.45 → a ≈ 1.40 AU (Kepler's law)
  {
    const pos = radec(262.1711, -0.5809, 480 * PC_AU);
    const mBH = 9.62, mS = 0.93, M = mBH + mS; const P = 185.6; const a = Math.cbrt(M * (P / YEAR_D) ** 2);
    const bin = { a, e: 0.45, P }; const rs = 2 * 6.674e-11 * mBH * 1.989e30 / (299792458 ** 2) / 1000 / AU_KM;
    defs.push({ id: 'gaiabh1', story: 'gaiabh1', name: 'Gaia BH1', pos, normal: V(0.5, 0.3, 0.81), defaultDist: 6,
      bodies: [{ name: 'Gaia BH1 star', star: true, r: 1.0 * RSUN_AU, color: '#fff0c8', marker: 16, binary: { ...bin, k: mBH / M } },
        { name: 'Gaia BH1 black hole', r: rs, color: '#000000', markerColor: '#ffae66', marker: 12, binary: { ...bin, k: -mS / M } }] });
  }
  // Hulse–Taylor pulsar PSR B1913+16 (Weisberg & Huang 2016): P 0.322997 d, e 0.617134, masses 1.438 / 1.390; VLBI distance 4.1 kpc (Deller et al. 2018, uncertain)
  {
    const pos = radec(288.8667, 16.1075, 4100 * PC_AU);
    const m1 = 1.438, m2 = 1.390, M = m1 + m2, P = 0.322997; const a = Math.cbrt(M * (P / YEAR_D) ** 2); const bin = { a, e: 0.617134, P };
    const rNS = 12 / AU_KM;
    defs.push({ id: 'hulse', story: 'hulse', name: 'Hulse–Taylor pulsar', pos, normal: V(-0.3, 0.5, 0.81), defaultDist: 0.075,
      bodies: [{ name: 'PSR B1913+16', star: true, r: rNS, color: '#bfe0ff', marker: 13, binary: { ...bin, k: -m2 / M } },
        { name: 'Companion neutron star', star: true, r: rNS, color: '#d8d0ff', marker: 11, binary: { ...bin, k: m1 / M } }] });
  }
  // Antares: ~700 times the Sun's diameter, ~12 Msun (ESO / Ohnaka et al. 2017)
  const an = findStar('Antares');
  if (an) {
    defs.push({ id: 'antares', story: 'antares', name: 'Antares', pos: starPos(an[0]), vHelio: starVel(an[0]), normal: V(0, 0, 1), defaultDist: 21,
      bodies: [{ name: 'Antares', star: true, r: 700 * RSUN_AU, color: '#ff6a3a', marker: 30 }] });
    hide(an[0], 'antares');
  }
  // Epsilon Indi A + Ab (JWST, Matthews et al. 2024; archive: a 15.76 AU, P 25450 d, e 0.25)
  {
    const i = nearestStar(330.8714, -56.7969, 0.1, 3, 4.3);
    if (i >= 0) {
      defs.push({ id: 'epsind', story: 'epsind', name: 'Epsilon Indi', pos: starPos(i), vHelio: starVel(i), normal: V(0.2, 0.6, 0.77), defaultDist: 55,
        bodies: [{ name: 'Epsilon Indi A', star: true, r: 0.713 * RSUN_AU, color: '#ffc98a', marker: 18 },
          ...planets([['Epsilon Indi Ab', 15.76, 25450, 0.25, 1.13 * RJ_AU]], ['#c8b8d8'])] });
      hide(i, 'epsind');
    }
  }
  // Zeta Ophiuchi: runaway star at ~24 km/s with a bow shock ahead of it (NASA Spitzer). Shock is an illustration.
  {
    const i = nearestStar(249.2897, -10.5671, 0.1, 80, 200);
    if (i >= 0) {
      const vel = starVel(i);
      defs.push({ id: 'zetaoph', story: 'zetaoph', name: 'Zeta Ophiuchi', pos: starPos(i), vHelio: vel, normal: V(0, 0, 1), defaultDist: 4.5e5,
        bodies: [{ name: 'Zeta Ophiuchi', star: true, r: 8 * RSUN_AU, color: '#a8c4ff', marker: 22 }],
        after: sys => sys.group.add(makeBowShock(vel.lengthSq() ? vel.clone().normalize() : V(1, 0, 0))) });
      hide(i, 'zetaoph');
    }
  }
  return defs;
}
function hideNear3(ra, dec, hide, owner) { const i = nearestStar(ra, dec, 0.05); if (i >= 0) hide(i, owner); }
// Flat dust ring (illustration): radius R (AU), width W (AU), eccentricity e, around a plane normal
function makeDustRing(normal, R, W, e, c, n, opacity, max, ps) {
  const r = rng(Math.round(R * 31)); const N = isMobile ? Math.round(n * 0.6) : n; const [u, w] = planeBasis(normal);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const th = r() * Math.PI * 2; const rad = R * (1 - e * e) / (1 + e * Math.cos(th)) + gauss(r) * W * 0.4; const h = gauss(r) * W * 0.06;
    const x = rad * Math.cos(th), y = rad * Math.sin(th);
    pos[i * 3] = u.x * x + w.x * y + normal.x * h; pos[i * 3 + 1] = u.y * x + w.y * y + normal.y * h; pos[i * 3 + 2] = u.z * x + w.z * y + normal.z * h;
    const f = 0.35 + r() * 0.35; col[i * 3] = c[0] * f; col[i * 3 + 1] = c[1] * f; col[i * 3 + 2] = c[2] * f; sz[i] = (ps ?? Math.max(W, R * 0.04) * 0.25) * (0.5 + r());
  }
  return cloudPoints(pos, col, sz, opacity, max);
}
// Zeta Ophiuchi's bow shock (illustration): a glowing arc ~1.5 ly ahead of the star, opening backwards
function makeBowShock(dir) {
  const r = rng(1913), n = isMobile ? 1500 : 2500, L = 1.5 * LY_AU; const [u, w] = planeBasis(dir);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const th = r() * Math.PI * 2, s = Math.pow(r(), 0.7) * 1.4; const rad = L * s; const along = L * (1 - 0.45 * s * s) + gauss(r) * L * 0.03;
    const a = rad * Math.cos(th), b = rad * Math.sin(th);
    pos[i * 3] = dir.x * along + u.x * a + w.x * b; pos[i * 3 + 1] = dir.y * along + u.y * a + w.y * b; pos[i * 3 + 2] = dir.z * along + u.z * a + w.z * b;
    const f = (1 - s / 1.6) * 0.6 + 0.15; col[i * 3] = 1 * f; col[i * 3 + 1] = 0.45 * f; col[i * 3 + 2] = 0.4 * f; sz[i] = L * 0.05 * (0.5 + r());
  }
  return cloudPoints(pos, col, sz, 0.6, 14);
}
// Eta Carinae's hourglass cloud (illustration): two lobes along an axis, ~0.3 ly each
function makeHomunculus(los) {
  const r = rng(1843), n = isMobile ? 1600 : 2600, L = 0.3 * LY_AU;
  const axis = planeBasis(los)[0].clone().multiplyScalar(0.8).addScaledVector(los, 0.6).normalize(); const [u, w] = planeBasis(axis);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const side = r() < 0.5 ? -1 : 1; const t = r(); const rad = L * 0.45 * Math.sin(Math.PI * t) * (0.85 + 0.15 * r()); const th = r() * Math.PI * 2;
    const a = rad * Math.cos(th), b = rad * Math.sin(th), along = side * t * L;
    pos[i * 3] = axis.x * along + u.x * a + w.x * b; pos[i * 3 + 1] = axis.y * along + u.y * a + w.y * b; pos[i * 3 + 2] = axis.z * along + u.z * a + w.z * b;
    const f = 0.35 + r() * 0.35; col[i * 3] = 1 * f; col[i * 3 + 1] = 0.62 * f; col[i * 3 + 2] = 0.42 * f; sz[i] = L * 0.05 * (0.5 + r());
  }
  return cloudPoints(pos, col, sz, 0.6, 14);
}
function cloudPoints(pos, col, sz, opacity, max) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const p = new THREE.Points(g, pointMaterial({ max, min: 1.0 })); p.frustumCulled = false;
  p.onBeforeRender = () => { p.material.uniforms.uScale.value = pxPerUnit; p.material.uniforms.uOpacity.value = opacity; };
  return p;
}
// Illustrated clouds at real positions: Crab Nebula, Pillars of Creation, Omega Centauri; plus the Pleiades (real HYG stars)
function addReadOnlyStops() {
  const addCloud = (id, name, center, n, gen, opacity, max, defaultDist, radius) => {
    const r = rng(id.length * 7919); const N = isMobile ? Math.round(n * 0.6) : n;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) { const [x, y, z, c, s] = gen(r); pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; sz[i] = s; }
    const grp = new THREE.Group(); grp.position.copy(center); scene.add(grp); grp.add(cloudPoints(pos, col, sz, opacity, max));
    focusables[id] = { name, getPos: o => o.copy(center), radius, story: id, defaultDist };
    return grp;
  };
  // Crab Nebula: RA 83.6331°, Dec 22.0145°, ~6,500 ly; ~10 ly across. Filament shell + central pulsar.
  {
    const R = 5 * LY_AU; const center = radec(83.6331, 22.0145, 6500 / 3.2616 * PC_AU);
    addCloud('crab', 'Crab Nebula', center, 3200, r => {
      const shell = r() < 0.6; const u = gauss(r), v = gauss(r), w = gauss(r); const d = Math.hypot(u, v, w) || 1;
      const k = shell ? (0.75 + 0.25 * r()) / d : 0.45 * Math.pow(r(), 0.5) / d;
      const c = shell ? (r() < 0.5 ? [1, 0.45, 0.25] : [0.55, 1, 0.45]) : [0.55, 0.65, 1]; const f = shell ? 0.5 : 0.35;
      return [u * k * R * 1.3, v * k * R * 0.9, w * k * R * 0.9, c.map(x => x * f), R * (shell ? 0.05 : 0.09) * (0.5 + r())];
    }, 0.45, 18, 1.4e6, R * 0.2);
  }
  // Pillars of Creation (Eagle Nebula, M16): RA 274.70°, Dec −13.82°, ~6,500 ly. Three dusty columns (illustration).
  {
    const H = 3 * LY_AU; const center = radec(274.70, -13.82, 6500 / 3.2616 * PC_AU);
    const cols = [[-0.9, 1.0, 0.22], [0.15, 0.62, 0.17], [0.85, 0.45, 0.15]]; // x offset, height, width (× H)
    addCloud('pillars', 'Pillars of Creation', center, 3000, r => {
      if (r() < 0.25) { const c = [0.45, 0.75, 0.85]; return [gauss(r) * H * 1.2, (0.5 + gauss(r) * 0.6) * H, gauss(r) * H * 0.5, c.map(x => x * 0.25), H * 0.12 * (0.5 + r())]; }
      const [ox, h, w] = cols[(r() * 3) | 0]; const t = Math.pow(r(), 0.8); const wid = w * (1 - 0.5 * t) * H;
      const tip = t > 0.92; const c = tip ? [1, 0.75, 0.45] : [0.75, 0.42, 0.25]; const f = tip ? 0.8 : 0.4 + r() * 0.2;
      return [ox * H + gauss(r) * wid * 0.5 + t * h * H * 0.12, t * h * H, gauss(r) * wid * 0.5, c.map(x => x * f), H * 0.03 * (0.5 + r())];
    }, 0.55, 14, 6e5, H * 0.3);
  }
  // Omega Centauri: RA 201.697°, Dec −47.4795°, 17,700 ly (ESA/Hubble). Dense ball of old stars (illustration).
  {
    const R = 40 * LY_AU; const center = radec(201.697, -47.4795, 17700 / 3.2616 * PC_AU);
    addCloud('omegacen', 'Omega Centauri', center, 7000, r => {
      const u = gauss(r), v = gauss(r), w = gauss(r); const d = Math.hypot(u, v, w) || 1; const rr = R * Math.pow(r(), 1.9);
      const warm = r() < 0.7; const c = warm ? [1, 0.85, 0.6] : [0.85, 0.9, 1]; const f = 0.45 + r() * 0.4;
      return [u / d * rr, v / d * rr, w / d * rr, c.map(x => x * f), R * 0.012 * (0.5 + r())];
    }, 0.8, 5, 8e6, R * 0.2);
  }
  // Pleiades: centre on Alcyone (HYG), real member stars are already in the star field
  const al = starData.names.find(n => n[1] === 'Alcyone');
  if (al) {
    const i = al[0]; const p = V(starData.buf[i * 8], starData.buf[i * 8 + 1], starData.buf[i * 8 + 2]).multiplyScalar(PC_AU);
    focusables.pleiades = { name: 'Pleiades', getPos: o => o.copy(p), radius: 1e5, story: 'pleiades', defaultDist: 1.6e6 };
  }
  // ── batch 3 ──
  // Cassiopeia A: RA 350.85°, Dec 58.815°, ~11,000 ly (Chandra); ~10 ly across. Knotty shell + central neutron star.
  {
    const R = 5 * LY_AU; const center = radec(350.85, 58.815, 11000 / 3.2616 * PC_AU);
    addCloud('casa', 'Cassiopeia A', center, 3200, r => {
      const core = r() < 0.04; const u = gauss(r), v = gauss(r), w = gauss(r); const d = Math.hypot(u, v, w) || 1;
      if (core) return [u / d * R * 0.01, v / d * R * 0.01, w / d * R * 0.01, [0.6, 0.75, 1], R * 0.03];
      const k = (0.8 + 0.2 * r()) / d; const c = [[1, 0.5, 0.3], [0.5, 0.85, 1], [1, 0.85, 0.4], [0.6, 1, 0.55]][(r() * 4) | 0]; const f = 0.35 + r() * 0.3;
      return [u * k * R, v * k * R, w * k * R, c.map(x => x * f), R * 0.05 * (0.5 + r())];
    }, 0.5, 16, 1.4e6, R * 0.2);
  }
  // SN 1987A: RA 83.8666°, Dec −69.2697°, in the Large Magellanic Cloud ~160,000 ly (NASA). Inner ring + debris (illustration).
  {
    const R = 0.65 * LY_AU; const center = radec(83.8666, -69.2697, 160000 / 3.2616 * PC_AU);
    const nrm = V(0.3, 0.5, 0.81).normalize(); const [u, w] = planeBasis(nrm);
    addCloud('sn1987a', 'SN 1987A', center, 2400, r => {
      if (r() < 0.3) { const g = [gauss(r), gauss(r), gauss(r)].map(x => x * R * 0.18); return [...g, [0.9, 0.55, 0.45].map(x => x * 0.4), R * 0.05 * (0.5 + r())]; }
      const th = r() * Math.PI * 2; const rr = R * (1 + gauss(r) * 0.03); const x = rr * Math.cos(th), y = rr * Math.sin(th);
      const hot = r() < 0.3; const c = hot ? [1, 0.95, 0.8] : [1, 0.6, 0.45]; const f = hot ? 0.7 : 0.4;
      return [u.x * x + w.x * y, u.y * x + w.y * y, u.z * x + w.z * y, c.map(v => v * f), R * 0.03 * (0.5 + r())];
    }, 0.65, 12, 1.6e5, R * 0.3);
  }
  // Ring Nebula (M57): RA 283.396°, Dec 33.029°, 790 pc (Gaia parallax); ~1.6 ly across from its 2.1′ size. Seen down the barrel.
  {
    // drawn as a thin glowing shell: its bright rim reads as a ring from any viewing angle
    const center = radec(283.396, 33.029, 790 * PC_AU); const R = 0.6 * LY_AU;
    addCloud('ringneb', 'Ring Nebula', center, 3600, r => {
      const inner = r() < 0.18; const u = gauss(r), v = gauss(r), w = gauss(r); const d = Math.hypot(u, v, w) || 1;
      const rr = inner ? R * 0.5 * Math.cbrt(r()) : R * (1 + gauss(r) * 0.05);
      const c = inner ? [0.45, 0.8, 1] : (rr > R * 1.03 ? [1, 0.45, 0.35] : [1, 0.78, 0.45]); const f = inner ? 0.18 : 0.3 + r() * 0.2;
      return [u / d * rr, v / d * rr, w / d * rr, c.map(x => x * f), R * 0.05 * (0.5 + r())];
    }, 0.5, 12, 3.2e5, R * 0.3);
  }
  // WR 104 (Tuthill et al. 2008): 2.58 kpc; dust pinwheel turns once every 241.5 days. Spiral is an illustration, spun at the real period.
  {
    const center = radec(270.517, -23.628, 2580 * PC_AU); const axis = center.clone().normalize().negate(); const [u, w] = planeBasis(axis);
    const step = 170; // AU between spiral turns (illustrative)
    const grp = addCloud('wr104', 'WR 104', center, 3000, r => {
      if (r() < 0.03) return [gauss(r) * 2, gauss(r) * 2, gauss(r) * 2, [0.8, 0.85, 1], 6];
      const turns = Math.pow(r(), 0.8) * 4; const th = turns * Math.PI * 2; const rr = turns * step + gauss(r) * step * 0.07; const fade = 1 - turns / 4.4;
      const x = rr * Math.cos(th), y = rr * Math.sin(th), z = gauss(r) * step * 0.05;
      return [u.x * x + w.x * y + axis.x * z, u.y * x + w.y * y + axis.y * z, u.z * x + w.z * y + axis.z * z, [1, 0.62, 0.35].map(v => v * (0.25 + 0.5 * fade)), step * 0.12 * (0.5 + r())];
    }, 0.6, 12, 2600, 30);
    const pts = grp.children[0]; const prev = pts.onBeforeRender;
    // We see the dust spiral face-on from Earth, so keep it facing the camera and spin it at the real period.
    const qSpin = new THREE.Quaternion(), qFace = new THREE.Quaternion(), toCam = V();
    pts.onBeforeRender = (...a) => {
      prev(...a);
      toCam.copy(a[2].position).sub(center).normalize(); qFace.setFromUnitVectors(axis, toCam);
      qSpin.setFromAxisAngle(axis, 2 * Math.PI * ((simDays() / 241.5) % 1)); pts.quaternion.copy(qFace).multiply(qSpin); pts.updateMatrixWorld();
    };
  }
  // Hyades: centre on the mean position of its named HYG members (real stars already in the field)
  {
    const mem = ['Ain', 'Chamukuy', 'Prima Hyadum', 'Secunda Hyadum'].map(n => starData.names.find(x => x[1] === n)).filter(Boolean);
    if (mem.length) {
      const c = V(); for (const [i] of mem) c.add(V(starData.buf[i * 8], starData.buf[i * 8 + 1], starData.buf[i * 8 + 2])); c.multiplyScalar(PC_AU / mem.length);
      focusables.hyades = { name: 'Hyades', getPos: o => o.copy(c), radius: 1e5, story: 'hyades', defaultDist: 1.8e6 };
    }
  }
}
function makeMiraTail(dir) {
  // ~13 ly long, widening behind the star; a brighter bow at the front
  const r = rng(77), n = isMobile ? 1800 : 3000, L = 13 * LY_AU;
  const [u, w] = planeBasis(dir);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.pow(r(), 0.7); const along = -s * L; const width = L * (0.012 + 0.05 * s);
    const a = gauss(r) * width, b = gauss(r) * width;
    pos[i * 3] = dir.x * along + u.x * a + w.x * b; pos[i * 3 + 1] = dir.y * along + u.y * a + w.y * b; pos[i * 3 + 2] = dir.z * along + u.z * a + w.z * b;
    const f = (1 - s) * 0.7 + 0.3; col[i * 3] = 0.55 * f; col[i * 3 + 1] = 0.7 * f; col[i * 3 + 2] = 1.0 * f;
    sz[i] = L * 0.018 * (0.6 + r());
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const p = new THREE.Points(g, pointMaterial({ max: 14, min: 1.1 })); p.frustumCulled = false;
  p.onBeforeRender = () => { p.material.uniforms.uScale.value = pxPerUnit; p.material.uniforms.uOpacity.value = 0.65; };
  return p;
}
// Barnard's Star and Gliese 710: their story *is* their motion, so the stop follows the catalog star as time runs.
function addMovingStarStops() {
  const stops = [
    { id: 'barnard', idx: (starData.names.find(n => n[1] === 'Barnard\'s Star') || [])[0] },
    { id: 'gliese710', idx: nearestStar(274.9624, -1.9386, 0.1, 15, 25) }, // Gaia DR3: 19 pc
    { id: 'arcturus', idx: (starData.names.find(n => n[1] === 'Arcturus') || [])[0] },
    { id: 'kapteyn', idx: (starData.names.find(n => n[1] === 'Kapteyn\'s Star') || [])[0] },
  ];
  // Gliese 710's HYG (Hipparcos-era) motion misses the Sun by ~1.3 ly. Replace it with the Gaia DR3 flyby solution
  // (parallax 52.3963 mas → 19.085 pc; closest approach 0.052 pc in ~1.29 Myr, de la Fuente Marcos 2022): a straight path
  // from today's position to a point 0.052 pc from the Sun, offset along its catalog proper-motion direction.
  const g = stops[1].idx;
  if (g >= 0) {
    const b = starData.buf; const p0 = V(b[g * 8], b[g * 8 + 1], b[g * 8 + 2]).setLength(1000 / 52.3963);
    const pm = V(b[g * 8 + 3], b[g * 8 + 4], b[g * 8 + 5]); pm.addScaledVector(p0, -pm.dot(p0) / p0.lengthSq());
    const q = (pm.lengthSq() ? pm : planeBasis(p0)[0]).setLength(0.052);
    const v = q.clone().sub(p0).divideScalar(1.29e6);
    b[g * 8] = p0.x; b[g * 8 + 1] = p0.y; b[g * 8 + 2] = p0.z; b[g * 8 + 3] = v.x; b[g * 8 + 4] = v.y; b[g * 8 + 5] = v.z;
  }
  for (const { id, idx } of stops) {
    if (idx === undefined || idx < 0) continue;
    starOwner.set(idx, id);
    const p = V(), v = V();
    focusables[id] = { name: STORIES[id].title, story: id, radius: 0.01, defaultDist: 40, starIdx: idx,
      getPos: o => { p.set(starData.pos[idx * 3], starData.pos[idx * 3 + 1], starData.pos[idx * 3 + 2]); v.set(starData.vel[idx * 3], starData.vel[idx * 3 + 1], starData.vel[idx * 3 + 2]); return o.copy(p).addScaledVector(v, simYears()); } };
  }
}
// Orion Nebula (illustration) at RA 83.822°, Dec −5.391°, ~414 pc (Menten et al. 2007)
function addOrionNebula() {
  const center = radec(83.822, -5.391, 414 * PC_AU);
  const grp = new THREE.Group(); grp.position.copy(center); scene.add(grp);
  const r = rng(42), n = isMobile ? 2200 : 3600, R = 12 * LY_AU;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  const pal = [[1, 0.42, 0.55], [0.45, 0.85, 0.9], [1, 0.75, 0.5], [0.7, 0.55, 1]];
  for (let i = 0; i < n; i++) {
    const core = r() < 0.25; const s = core ? 0.15 : 0.55;
    let x = gauss(r) * R * s, y = gauss(r) * R * s * 0.8, z = gauss(r) * R * s * 0.6;
    const sw = Math.atan2(y, x) + Math.hypot(x, y) / R * 1.4; const h = Math.hypot(x, y); x = h * Math.cos(sw); y = h * Math.sin(sw); // gentle swirl
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const c = core ? [1, 0.95, 0.9] : pal[(r() * pal.length) | 0]; const f = core ? 0.35 : 0.3 + r() * 0.3;
    col[i * 3] = c[0] * f; col[i * 3 + 1] = c[1] * f; col[i * 3 + 2] = c[2] * f; sz[i] = R * (core ? 0.03 : 0.12) * (0.5 + r());
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const cloud = new THREE.Points(g, pointMaterial({ max: 22, min: 1.0 })); cloud.frustumCulled = false; grp.add(cloud);
  cloud.onBeforeRender = () => { cloud.material.uniforms.uScale.value = pxPerUnit; cloud.material.uniforms.uOpacity.value = 0.38; };
  focusables.orion = { name: 'Orion Nebula', getPos: o => o.copy(center), radius: R * 0.2, story: 'orion', defaultDist: 4.2e6 };
}

// ───────────────────────── trails (Line2) ─────────────────────────
function makeTrail(color, width = 1.6) {
  const geo = new LineGeometry(); geo.setPositions([0, 0, 0, 0, 0, 0]); geo.setColors([0, 0, 0, 0, 0, 0]);
  const mat = new LineMaterial({ color: 0xffffff, linewidth: width, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, worldUnits: false });
  lineMaterials.push(mat);
  const line = new Line2(geo, mat); line.frustumCulled = false; line.renderOrder = 3;
  line.userData.col = new THREE.Color(color);
  return line;
}
const settings = { view: 'sun', trailLen: 0.6, trailRange: 0.5, sunSpeed: 0.1, autoSpiral: true, labels: true, orbits: true, conLines: false };
const tmpA = V(), tmpB = V();

function updateTrails(sys, t, camDistHost) {
  const galaxy = settings.view === 'galaxy';
  if (!sys.trails) { sys.trails = sys.bodies.map(b => { const l = makeTrail(b.color, b.isStar ? 2.2 : 1.6); sys.group.add(l); return l; }); }
  // galactic-frame velocity of this system (AU/day), shortened for visibility
  // reference orbit: the largest one that fits in view
  const orbiting = sys.bodies.filter(b => b.P > 0 && (!b.parent || !galaxy)).sort((a, b) => a.P - b.P);
  let Pref = orbiting.length ? orbiting[0].P : 365, Rref = orbiting.length ? orbiting[0].orbitR : 1;
  for (const b of orbiting) if (b.orbitR < camDistHost * 0.6 && !b.parent) { Pref = b.P; Rref = b.orbitR; }
  const vReal = tmpB.copy(L90).multiplyScalar(SUN_GAL_KMS * KMS_TO_AUD).add(sys.vHelio);
  // auto: slow the galactic drift just enough that one orbit makes a loose coil (pitch ≈ 2.2 orbit widths)
  const auto = Math.min(1, (4.4 * Rref / Pref) / vReal.length());
  sys.visFactor = settings.autoSpiral ? auto : settings.sunSpeed;
  const vg = vReal.multiplyScalar(sys.visFactor);
  const W = settings.trailLen * 4 * Pref;
  sys.bodies.forEach((b, k) => {
    const line = sys.trails[k];
    let show = true, Wb, n;
    if (b.parent && galaxy) show = false;           // Moon: Sun view only
    if (!galaxy && !b.P) show = false;               // stars at rest in Sun view
    // rate check: trail would strobe at very high speeds
    const dayPerFrame = SPEEDS[time.speedIdx][1] / 86400 / 60;
    if (b.P && b.P / dayPerFrame < 6) show = false;
    if (!galaxy && b.P) { Wb = b.P * clamp(settings.trailLen * 1.4, 0.08, 0.98); n = 160; }
    else if (galaxy) {
      if (b.P) { Wb = Math.min(W, 30 * b.P); n = clamp(Math.ceil(Wb / b.P * 64), 64, 1600); }
      else { Wb = W; n = 2; }
    }
    if (b.parent && !galaxy) { Wb = b.P * 0.8; n = 90; }
    line.visible = show;
    if (!show) return;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = line.userData.col;
    for (let j = 0; j < n; j++) {
      const u = j / (n - 1); const tj = t - Wb * u;
      if (b.parent && !galaxy) { b.relAt(tj, tmpA); tmpA.add(b.parent.pos); }
      else b.posAt(tj, tmpA);
      if (galaxy) tmpA.addScaledVector(vg, -(t - tj));
      pos[j * 3] = tmpA.x; pos[j * 3 + 1] = tmpA.y; pos[j * 3 + 2] = tmpA.z;
      const f = Math.pow(1 - u, 1.6) * (b.isStar ? 0.9 : 1.0);
      col[j * 3] = c.r * f; col[j * 3 + 1] = c.g * f; col[j * 3 + 2] = c.b * f;
    }
    line.geometry.dispose();
    const g = new LineGeometry(); g.setPositions(pos); g.setColors(col); line.geometry = g;
    line.computeLineDistances?.();
  });
}

// ───────────────────────── stars (HYG) ─────────────────────────
let starsPoints = null, starTrails = null;
async function loadStars() {
  const [txt, names] = await Promise.all([fetch('stars.js').then(r => r.text()), fetch('starnames.json').then(r => r.json())]);
  const b64 = txt.slice(txt.indexOf('"') + 1, txt.lastIndexOf('"'));
  const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer); const N = dv.getUint32(0, true);
  const P = new Float32Array(bytes.buffer.slice(4, 4 + N * 12));
  const Vq = new Int16Array(bytes.buffer.slice(4 + N * 12, 4 + N * 18));
  const Mq = bytes.subarray(4 + N * 18, 4 + N * 19), Cq = bytes.subarray(4 + N * 19, 4 + N * 20);
  const buf = new Float32Array(N * 8);
  for (let i = 0; i < N; i++) {
    buf[i * 8] = P[i * 3]; buf[i * 8 + 1] = P[i * 3 + 1]; buf[i * 8 + 2] = P[i * 3 + 2];
    buf[i * 8 + 3] = Vq[i * 3] / 3e7; buf[i * 8 + 4] = Vq[i * 3 + 1] / 3e7; buf[i * 8 + 5] = Vq[i * 3 + 2] / 3e7;
    buf[i * 8 + 6] = Mq[i] / 8 - 16; buf[i * 8 + 7] = Cq[i] / 80 - 0.5;
  }
  starData = { buf, N, names, hidden: [] };
  initStorySystems();
  const hidden = new Set(starData.hidden);
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), mag = new Float32Array(N), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = buf[i * 8] * PC_AU; pos[i * 3 + 1] = buf[i * 8 + 1] * PC_AU; pos[i * 3 + 2] = buf[i * 8 + 2] * PC_AU;
    vel[i * 3] = buf[i * 8 + 3] * PC_AU; vel[i * 3 + 1] = buf[i * 8 + 4] * PC_AU; vel[i * 3 + 2] = buf[i * 8 + 5] * PC_AU;
    mag[i] = hidden.has(i) ? 99 : buf[i * 8 + 6];
    const c = bvToRGB(buf[i * 8 + 7]); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('vel', new THREE.BufferAttribute(vel, 3));
  g.setAttribute('absmag', new THREE.BufferAttribute(mag, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uDt: { value: 0 }, uLim: { value: 6.5 }, uOpacity: { value: 1 }, uPx: { value: 1 } },
    vertexShader: `attribute vec3 vel; attribute float absmag; attribute vec3 color;
      uniform float uDt; uniform float uLim; uniform float uOpacity; uniform float uPx;
      varying vec3 vC; varying float vA; varying float vCore;
      #include <common>
  #include <logdepthbuf_pars_vertex>
      void main(){
        vec3 p = position + vel * uDt;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        float dpc = max(length(mv.xyz) / 206264.806, 1e-12);
        float m = absmag + 5.0*log(dpc)/log(10.0) - 5.0;
        float f = pow(10.0, -0.4*(m - uLim));
        float s = clamp(2.6*pow(f, 0.26), 1.6, 34.0) * uPx;
        vA = clamp(f, 0.0, 1.0) * uOpacity;
        vCore = clamp(log(f+1.0)*0.25, 0.0, 0.6);
        vC = color;
        gl_PointSize = (absmag > 90.0) ? 0.0 : s;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `varying vec3 vC; varying float vA; varying float vCore;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord-0.5)*2.0;
        float core = exp(-d*d*18.0); float halo = exp(-d*d*4.0)*0.45;
        float a = (core + halo) * vA; if (a < 0.004) discard;
        gl_FragColor = vec4(mix(vC, vec3(1.0), core*vCore), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  starsPoints = new THREE.Points(g, m); starsPoints.frustumCulled = false; starsPoints.renderOrder = 1;
  scene.add(starsPoints);
  // star motion trails
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_STAR_TRAILS * 6), 3));
  tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_STAR_TRAILS * 6), 3));
  starTrails = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  starTrails.frustumCulled = false; scene.add(starTrails);
  starData.pos = pos; starData.vel = vel; starData.col = col; starData.mag = mag;
  // story stars are hidden from the point field while their story system draws them up close; when that system is
  // out of sight (far away) they come back as plain points, so e.g. Betelgeuse still shines in Orion seen from home.
  // Only where the story sits at the catalog position (Cygnus X-1 uses a newer distance, so it stays hidden).
  for (const [i, owner] of starOwner) {
    const s = systems.find(x => x.isStory && x.id === owner); if (!s) continue;
    const p = V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    if (p.distanceTo(s.hostPos) < 0.02 * p.length()) (s.hiddenIdx ||= []).push(i);
  }
  buildStarLabels();
}
const MAX_STAR_TRAILS = 420;
let trailSel = [], trailFrame = 0;
function updateStarTrails(camLog, target) {
  if (!starTrails) return;
  const vis = settings.view && smooth(4.6, 5.4, camLog) * (1 - smooth(8.4, 9.0, camLog));
  starTrails.visible = vis > 0.01;
  starTrails.material.opacity = vis * 0.8;
  if (!starTrails.visible) { trailSel = []; return; }
  const { pos, vel, col, N } = starData; const dt = simYears();
  const camDist = Math.pow(10, camLog);
  const R = camDist * (0.25 + settings.trailRange * 1.5);
  if (trailFrame++ % 12 === 0) {
    const R2 = R * R; const cand = [];
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3] + vel[i * 3] * dt - target.x, y = pos[i * 3 + 1] + vel[i * 3 + 1] * dt - target.y, z = pos[i * 3 + 2] + vel[i * 3 + 2] * dt - target.z;
      const d2 = x * x + y * y + z * z; if (d2 < R2) cand.push(i, d2);
    }
    const idx = []; for (let k = 0; k < cand.length; k += 2) idx.push(k);
    if (idx.length / 1 > MAX_STAR_TRAILS) idx.sort((a, b) => cand[a + 1] - cand[b + 1]);
    trailSel = idx.slice(0, MAX_STAR_TRAILS).map(k => cand[k]);
  }
  const galaxy = settings.view === 'galaxy';
  const vtyp = galaxy ? SUN_GAL_KMS * KMS_TO_AUD * YEAR_D : 25 * KMS_TO_AUD * YEAR_D; // AU/yr
  const Ts = settings.trailLen * 0.5 * camDist / vtyp; // years
  starData.trailYears = Ts;
  const vs = galaxy ? L90.clone().multiplyScalar(SUN_GAL_KMS * KMS_TO_AUD * YEAR_D) : V();
  const P = starTrails.geometry.attributes.position.array, C = starTrails.geometry.attributes.color.array;
  let k = 0;
  for (const i of trailSel) {
    const hx = pos[i * 3] + vel[i * 3] * dt, hy = pos[i * 3 + 1] + vel[i * 3 + 1] * dt, hz = pos[i * 3 + 2] + vel[i * 3 + 2] * dt;
    const vx = vel[i * 3] + vs.x, vy = vel[i * 3 + 1] + vs.y, vz = vel[i * 3 + 2] + vs.z;
    P[k * 6] = hx; P[k * 6 + 1] = hy; P[k * 6 + 2] = hz;
    P[k * 6 + 3] = hx - vx * Ts; P[k * 6 + 4] = hy - vy * Ts; P[k * 6 + 5] = hz - vz * Ts;
    C[k * 6] = col[i * 3] * 0.9; C[k * 6 + 1] = col[i * 3 + 1] * 0.9; C[k * 6 + 2] = col[i * 3 + 2] * 0.9;
    C[k * 6 + 3] = 0; C[k * 6 + 4] = 0; C[k * 6 + 5] = 0;
    k++;
  }
  // the Sun's own trail in galaxy view
  if (galaxy && k < MAX_STAR_TRAILS) {
    P.fill(0, k * 6, k * 6 + 3); P[k * 6 + 3] = -vs.x * Ts; P[k * 6 + 4] = -vs.y * Ts; P[k * 6 + 5] = -vs.z * Ts;
    C[k * 6] = 1; C[k * 6 + 1] = 0.85; C[k * 6 + 2] = 0.5; C[k * 6 + 3] = C[k * 6 + 4] = C[k * 6 + 5] = 0; k++;
  }
  starTrails.geometry.setDrawRange(0, k * 2);
  starTrails.geometry.attributes.position.needsUpdate = true; starTrails.geometry.attributes.color.needsUpdate = true;
}

// ───────────────────────── Milky Way (illustration) ─────────────────────────
function makeSpiralGalaxy({ n, radius, seed, arms = 4, pitch = 12, armFrac = 0.6, bulge = 0.16, bar = 0, barAngle = 0, thick = 0.012, armR0 = 7 / 8.2, warm = [1, 0.84, 0.6], cool = [0.62, 0.74, 1], size }) {
  const r = rng(seed); const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  const tp = Math.tan(pitch * deg); const th0 = -Math.log(armR0) / tp;
  for (let i = 0; i < n; i++) {
    let x, y, z, c; const k = r();
    if (k < bulge) { // bulge / bar
      const a = gauss(r) * radius * (bar ? 0.3 : 0.12), b = gauss(r) * radius * (bar ? 0.09 : 0.12);
      x = a * Math.cos(barAngle) - b * Math.sin(barAngle); y = a * Math.sin(barAngle) + b * Math.cos(barAngle);
      z = gauss(r) * radius * 0.05; c = warm.map(v => v * (0.85 + r() * 0.15));
    } else if (k < bulge + armFrac) { // arms
      const arm = Math.floor(r() * arms);
      const rr = radius * (0.12 + Math.pow(r(), 0.8) * 0.9);
      const th = th0 + Math.log(rr / radius) / tp + arm * 2 * Math.PI / arms + gauss(r) * 0.16;
      const jitter = gauss(r) * radius * 0.018;
      x = (rr + jitter) * Math.cos(th); y = (rr + jitter) * Math.sin(th); z = gauss(r) * radius * thick;
      const hii = r() < 0.06; c = hii ? [1, 0.45, 0.62] : cool.map(v => v * (0.8 + r() * 0.3));
    } else { // smooth disk
      const rr = radius * Math.min(1.1, -Math.log(1 - r() * 0.97) * 0.3); const th = r() * Math.PI * 2;
      x = rr * Math.cos(th); y = rr * Math.sin(th); z = gauss(r) * radius * thick * 1.6;
      const w = smooth(0, radius * 0.5, rr); c = [lerp(warm[0], 0.85, w), lerp(warm[1], 0.85, w), lerp(warm[2], 0.9, w)];
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    sz[i] = size * (0.6 + r() * 0.9);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const p = new THREE.Points(g, pointMaterial({ max: 5, min: 1.1 })); p.frustumCulled = false;
  return p;
}
function orientGroup(group, normal, xAxis) {
  const z = normal.clone().normalize(); const x = xAxis.clone().addScaledVector(z, -xAxis.dot(z)).normalize(); const y = new THREE.Vector3().crossVectors(z, x);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
// Milky Way: local x axis points from the centre toward the Sun; disk normal = −NGP (clockwise rotation seen from NGP)
const milkyWay = new THREE.Group(); milkyWay.position.copy(GC_POS); scene.add(milkyWay);
orientGroup(milkyWay, NGP.clone().negate(), GC_DIR.clone().negate());
const mwRadius = 15e3 * PC_AU;
milkyWay.add(makeSpiralGalaxy({ n: isMobile ? 110000 : 170000, radius: mwRadius, seed: 7, arms: 4, pitch: 12, armR0: 7.0 / 15, bar: 1, barAngle: 27 * deg, bulge: 0.15, size: 110 * PC_AU }));
// The Sun's path around the galaxy
const sunPath = (() => {
  const pts = []; for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(R0_AU * Math.cos(a), R0_AU * Math.sin(a), 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xffd27a, transparent: true, opacity: 0.5, dashSize: R0_AU * 0.04, gapSize: R0_AU * 0.03, depthWrite: false }));
  l.computeLineDistances(); milkyWay.add(l); return l;
})();
const sunHereMarker = makeMarker('#ffd27a', 9); scene.add(sunHereMarker);
focusables.galaxy = { name: 'The Milky Way', getPos: o => o.copy(GC_POS), radius: 1e3 * PC_AU, story: 'galaxy', defaultDist: 1.6e10 };

// Local Group neighbours
const localGroup = new THREE.Group(); scene.add(localGroup);
const LG = [
  { id: 'andromeda', name: 'Andromeda', ra: 10.6847, dec: 41.269, ly: 2.5e6, rLy: 75000, n: 60000, incl: 77, seed: 11, arms: 2 },
  { id: 'triangulum', name: 'Triangulum', ra: 23.4621, dec: 30.66, ly: 2.73e6, rLy: 30000, n: 18000, incl: 55, seed: 12, arms: 2 },
  { id: 'lmc', name: 'Large Magellanic Cloud', ra: 80.894, dec: -69.756, ly: 1.6e5, rLy: 16000, n: 16000, incl: 30, seed: 13, arms: 1, irregular: true },
  { id: 'smc', name: 'Small Magellanic Cloud', ra: 13.187, dec: -72.829, ly: 2.0e5, rLy: 9000, n: 9000, incl: 60, seed: 14, arms: 1, irregular: true },
];
for (const gdef of LG) {
  const center = radec(gdef.ra, gdef.dec, gdef.ly * LY_AU);
  const grp = new THREE.Group(); grp.position.copy(center); localGroup.add(grp);
  const los = center.clone().normalize(); const perp = new THREE.Vector3().crossVectors(los, V(0, 0, 1)).normalize();
  const normal = los.clone().multiplyScalar(Math.cos(gdef.incl * deg)).addScaledVector(perp, Math.sin(gdef.incl * deg));
  orientGroup(grp, normal, perp);
  grp.add(makeSpiralGalaxy({ n: isMobile ? Math.round(gdef.n * 0.6) : gdef.n, radius: gdef.rLy * LY_AU, seed: gdef.seed, arms: gdef.arms, pitch: gdef.irregular ? 30 : 14,
    armFrac: gdef.irregular ? 0.3 : 0.55, bulge: gdef.irregular ? 0.35 : 0.2, bar: gdef.irregular ? 1 : 0, thick: gdef.irregular ? 0.12 : 0.015, armR0: 0.3, size: gdef.rLy * LY_AU * 0.03 }));
  focusables[gdef.id] = { name: gdef.name, getPos: o => o.copy(center), radius: gdef.rLy * LY_AU * 0.1, story: gdef.id, defaultDist: gdef.rLy * LY_AU * 4.5 };
}

// Cosmic web (illustration)
const cosmicWeb = (() => {
  const r = rng(2024); const NODES = 1400, R = UNIVERSE_R * 0.985; const nodes = [];
  while (nodes.length < NODES) {
    const x = (r() * 2 - 1), y = (r() * 2 - 1), z = (r() * 2 - 1); const d = Math.hypot(x, y, z);
    if (d > 1 || d < 0.01) continue; nodes.push([x * R, y * R, z * R]);
  }
  const edges = [];
  for (let i = 0; i < NODES; i++) {
    const best = [];
    for (let j = 0; j < NODES; j++) { if (i === j) continue; const d = (nodes[i][0] - nodes[j][0]) ** 2 + (nodes[i][1] - nodes[j][1]) ** 2 + (nodes[i][2] - nodes[j][2]) ** 2; best.push([d, j]); }
    best.sort((a, b) => a[0] - b[0]); for (let k = 0; k < 3; k++) if (best[k][1] > i) edges.push([i, best[k][1]]);
  }
  const n = isMobile ? 110000 : 170000; const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  const sigN = R * 0.006, sigE = R * 0.0035; const minR = 2.0e7 * LY_AU;
  let i = 0;
  while (i < n) {
    let x, y, z;
    if (r() < 0.3) { const nd = nodes[(r() * NODES) | 0]; x = nd[0] + gauss(r) * sigN; y = nd[1] + gauss(r) * sigN; z = nd[2] + gauss(r) * sigN; }
    else { const e = edges[(r() * edges.length) | 0]; const a = nodes[e[0]], b = nodes[e[1]]; const t = r(); x = lerp(a[0], b[0], t) + gauss(r) * sigE; y = lerp(a[1], b[1], t) + gauss(r) * sigE; z = lerp(a[2], b[2], t) + gauss(r) * sigE; }
    const d = Math.hypot(x, y, z); if (d > R || d < minR) continue;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const w = r(); const c = w < 0.45 ? [1, 0.85, 0.62] : w < 0.8 ? [0.75, 0.82, 1] : [1, 0.6, 0.75];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; sz[i] = R * 0.0016 * (0.5 + r()); i++;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const p = new THREE.Points(g, pointMaterial({ max: 4, min: 1.0 })); p.frustumCulled = false; scene.add(p); return p;
})();
// CMB shell
const cmb = new THREE.Mesh(new THREE.SphereGeometry(UNIVERSE_R, 96, 48), new THREE.ShaderMaterial({
  uniforms: { uOpacity: { value: 0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
    #include <common>
  #include <logdepthbuf_pars_vertex>
    void main(){ vP = normalize(position); vN=normalize(normalMatrix*normal); vec4 mvp=modelViewMatrix*vec4(position,1.); vV=normalize(-mvp.xyz); gl_Position=projectionMatrix*mvp;
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    #include <logdepthbuf_pars_fragment>
    float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
    float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    void main(){
      #include <logdepthbuf_fragment>
      float n = noise(vP*3.1+1.7)*0.45 + noise(vP*7.3)*0.3 + noise(vP*17.0)*0.17 + noise(vP*41.0)*0.08;
      vec3 c = mix(vec3(0.12,0.3,0.95), vec3(1.0,0.5,0.18), smoothstep(0.3,0.7,n));
      float f = pow(1.0-abs(dot(normalize(vN),vV)), 3.0);
      gl_FragColor = vec4(c, (0.035 + 0.85*f) * uOpacity);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
}));
scene.add(cmb);
focusables.universe = { name: 'Observable Universe', getPos: o => o.set(0, 0, 0), radius: 1, story: 'universe', defaultDist: UNIVERSE_R * 2.6 };

// Galaxy glows (illustration): once a galaxy's point cloud is too small on screen to add up to visible light, a soft
// glow at its centre takes over so the Milky Way and its neighbours never vanish into black. One draw call, 5 points.
const galaxyGlow = (() => {
  const defs = [[GC_POS, mwRadius, [1, 0.88, 0.72]], ...LG.map(gdef => [radec(gdef.ra, gdef.dec, gdef.ly * LY_AU), gdef.rLy * LY_AU, gdef.irregular ? [0.8, 0.86, 1] : [1, 0.9, 0.78]])];
  const pos = new Float32Array(defs.length * 3), col = new Float32Array(defs.length * 3), rad = new Float32Array(defs.length);
  defs.forEach(([p, r, c], i) => { pos.set([p.x, p.y, p.z], i * 3); col.set(c, i * 3); rad[i] = r; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('rad', new THREE.BufferAttribute(rad, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uOpacity: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute float rad; uniform float uScale; uniform float uOpacity; uniform float uPx;
      varying vec3 vC; varying float vA;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float rpx = rad * uScale / max(-mv.z, 1e-30);   // apparent radius in device pixels
        vA = uOpacity * (1.0 - smoothstep(22.0 * uPx, 80.0 * uPx, rpx));
        vC = color;
        gl_PointSize = clamp(rpx * 1.1, 7.0 * uPx, 70.0 * uPx);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (exp(-d*d*14.0) + exp(-d*d*3.5) * 0.35) * vA; if (a < 0.004) discard;
        gl_FragColor = vec4(mix(vC, vec3(1.0), exp(-d*d*30.0) * 0.5), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.visible = false; scene.add(p); return p;
})();

// Star dust (illustration, not real stars; noted in About and on screen where it is the main thing visible): a faint,
// fixed, seeded sky of tiny points at infinity, so space never reads as an empty black screen. It turns with the view
// but never moves with zoom. One draw call. Depth-tested at the far plane, so planets and moons hide it.
const starDust = (() => {
  const n = isMobile ? 1800 : 3000; const r = rng(4242);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos[i * 3] = s * Math.cos(a); pos[i * 3 + 1] = s * Math.sin(a); pos[i * 3 + 2] = z;
    const b = 0.12 + Math.pow(r(), 3) * 0.33; const w = r(); // mostly very dim, a few a little brighter
    const c = w < 0.25 ? [0.8, 0.86, 1] : w < 0.4 ? [1, 0.9, 0.78] : [0.95, 0.95, 0.95];
    col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b; sz[i] = 1.4 + r() * 1.3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute float size; uniform float uPx; uniform float uOpacity; varying vec3 vC;
      void main(){
        vec4 c = projectionMatrix * vec4(mat3(viewMatrix) * position, 0.0); // a direction: no translation, no distance
        c.z = c.w * 0.999999; // just inside the far plane: behind everything that writes depth
        vC = color * uOpacity; gl_PointSize = size * uPx; gl_Position = c;
      }`,
    fragmentShader: `varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d*d*3.0); if (a < 0.05) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -10; scene.add(p); return p;
})();

// ───────────────────────── camera control ─────────────────────────
const cam = {
  target: V(), focusId: 'earth', logD: 0, q: new THREE.Quaternion(), vel: { x: 0, y: 0 }, anim: null,
};
const MIN_LOG = Math.log10(1e-6), MAX_LOG = Math.log10(UNIVERSE_R * 3.2);
function focusPos(id, out) { const f = focusables[id]; return f ? f.getPos(out) : out.set(0, 0, 0); }
// The camera orientation that looks at the target from direction lookFrom (screen-up: up, default ecliptic north).
function lookQ(lookFrom, up) {
  const U = up || ECL_N; const m = new THREE.Matrix4().lookAt(lookFrom.clone().normalize(), V(), U.clone().cross(lookFrom).lengthSq() > 1e-6 ? U : V(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
function flyTo(id, dist, dur, lookFrom, up) { // up: optional screen-up direction for lookFrom (default ecliptic north)
  const f = focusables[id]; if (!f) return;
  const fromPos = cam.target.clone(); const toPos = focusPos(id, V());
  const fromLog = cam.logD, toLog = Math.log10(dist ?? f.defaultDist);
  const gap = fromPos.distanceTo(toPos);
  const peak = gap > 0 ? Math.log10(gap * 1.8) : -99;
  const bump = Math.max(0, peak - Math.max(fromLog, toLog));
  const span = Math.abs(toLog - fromLog) + bump * 2;
  let toQ = null;
  if (lookFrom) toQ = lookQ(lookFrom, up);
  cam.anim = { id, fromPos, fromLog, toLog, bump, t0: performance.now(), dur: dur ?? clamp(1200 + span * 260, 1400, 5200), fromQ: cam.q.clone(), toQ };
  cam.focusId = id;
  showCard(f.story ? (typeof f.story === 'string' ? STORIES[f.story] : f.story) : null, id);
}
const STAR_FLY_DIST = 6 * LY_AU; // far enough out to see the star's neighbors
function flyToStar(idx) {
  const owner = starOwner.get(idx);
  if (owner && focusables[owner]) { flyTo(owner); return; } // a story star: use its story stop and card
  const id = ensureStarFocus(idx); if (id) flyTo(id);
}
// Focus entry for a catalog star, made on demand (pins use it too after a reload).
function ensureStarFocus(idx) {
  if (!starData?.pos || !(idx >= 0 && idx < starData.N)) return null;
  const id = 'star:' + idx;
  if (focusables[id]) return id;
  const p = V(starData.pos[idx * 3], starData.pos[idx * 3 + 1], starData.pos[idx * 3 + 2]);
  const v = V(starData.vel[idx * 3], starData.vel[idx * 3 + 1], starData.vel[idx * 3 + 2]);
  const story = starStory(idx);
  focusables[id] = { name: story.title, getPos: o => o.copy(p).addScaledVector(v, simYears()), radius: 0.01, defaultDist: STAR_FLY_DIST, starIdx: idx, story };
  return id;
}
// Card for any catalog star: HYG fields only. Uses the search index when loaded, else the 460 named stars.
function starStory(idx) {
  const row = searchUI.row(idx);
  if (row) return starCard(row);
  const n = starData?.names.find(x => x[0] === idx) || [idx, 'Unnamed star', 0, ''];
  const ly = n[2]; const sp = (n[3] || '').trim();
  const facts = distanceFacts(ly, new Date().getFullYear());
  if (sp) facts.push(`Spectral type ${sp}.`);
  return { title: n[1], sub: `Star · ${fmtLy(ly)} light-years`, hook: spectralHook(sp), facts, source: HYG_SOURCE };
}
// Thin pulsing ring around a catalog star while it is the focus (fixed pixel size: not to scale).
const FOCUS_RING_FRAG = `
  uniform vec3 uColor; uniform float uOpacity;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    float d = length(gl_PointCoord-0.5)*2.0;
    float a = smoothstep(0.80, 0.86, d) * (1.0 - smoothstep(0.90, 0.96, d)) * uOpacity;
    if (a < 0.005) discard;
    gl_FragColor = vec4(uColor, a);
  }`;
const focusRing = (() => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const m = new THREE.ShaderMaterial({ uniforms: { uSize: { value: 40 }, uColor: { value: new THREE.Color('#9fc4ff') }, uOpacity: { value: 0 } },
    vertexShader: MARKER_VERT, fragmentShader: FOCUS_RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 6; p.visible = false; scene.add(p); return p;
})();
let ringFade = 0;
const reduceMotionMQ = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch { return null; } })();
function updateFocusRing(now, dtReal) {
  const f = focusables[cam.focusId];
  const on = !!f && f.starIdx !== undefined && !f.sys; // story systems draw their own stars
  ringFade = clamp(ringFade + (on ? 1 : -1) * dtReal * 2.5, 0, 1);
  focusRing.visible = ringFade > 0.01;
  if (!focusRing.visible) return;
  if (on) f.getPos(focusRing.position);
  const zoomFade = 1 - smooth(7.4, 8.2, cam.logD); // gone once the view is far wider than the star's neighborhood
  const reduce = reduceMotionMQ?.matches;
  const pulse = reduce ? 0.75 : 0.6 + 0.25 * Math.sin(now * 0.0024);
  const u = focusRing.material.uniforms;
  u.uOpacity.value = pulse * ringFade * zoomFade;
  u.uSize.value = 40 * renderer.getPixelRatio();
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const tmpRel = V();
function updateCamera(now) {
  const tgt = V(); focusPos(cam.focusId, tgt);
  if (cam.anim) {
    const a = cam.anim; const u = clamp((now - a.t0) / a.dur, 0, 1); const e = ease(u);
    // pan mostly while zoomed out (middle of flight)
    const pu = smooth(0.15, 0.85, u);
    cam.target.copy(a.fromPos).lerp(tgt, pu);
    cam.logD = lerp(a.fromLog, a.toLog, e) + a.bump * Math.sin(Math.PI * u);
    if (a.toQ && !drag.active) cam.q.slerpQuaternions(a.fromQ, a.toQ, e);
    if (u >= 1) cam.anim = null;
  } else {
    cam.target.copy(tgt);
  }
  // inertia
  if (!drag.active && (Math.abs(cam.vel.x) + Math.abs(cam.vel.y)) > 1e-5) { rotateBy(cam.vel.x, cam.vel.y); cam.vel.x *= 0.92; cam.vel.y *= 0.92; }
  const f = focusables[cam.focusId];
  const minLog = Math.log10((f?.radius || 1e-6) * 1.15);
  cam.logD = clamp(cam.logD, Math.max(MIN_LOG, minLog), MAX_LOG);
  let d = Math.pow(10, cam.logD);
  const back = V(0, 0, 1).applyQuaternion(cam.q);
  camera.position.copy(cam.target).addScaledVector(back, d);
  // never inside a planet, moon, the Sun or a story star: stay ≥ 1.15 radii from every body's centre, by backing the
  // camera out along its view (same target, longer distance), so the spot you aimed at stays in front of you
  for (const sys of systems) for (const b of sys.bodies) {
    if (!(b.radius > 0)) continue;
    const s = backOutOfSphere(tmpRel.copy(camera.position).sub(b.pos), back, b.radius * 1.15);
    if (s > 0) { camera.position.addScaledVector(back, s); d += s; cam.logD = Math.log10(d); }
  }
  camera.quaternion.copy(cam.q);
  camera.near = Math.max(1e-8, d * 1e-4);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
function rotateBy(dx, dy) {
  const qy = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -dx);
  const qx = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -dy);
  cam.q.multiply(qy).multiply(qx).normalize();
}
// pointer input
const drag = { active: false, pts: new Map(), lastDist: 0, startDist: 0, engaged: false, moved: 0, multi: false };
canvas.addEventListener('pointerdown', e => {
  if (drag.pts.size === 0) drag.multi = false; // a fresh gesture
  try { canvas.setPointerCapture(e.pointerId); } catch { } drag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag.active = true; drag.moved = 0;
  cam.vel.x = cam.vel.y = 0; if (cam.anim && drag.pts.size === 1) { /* allow looking around during flight */ }
  if (drag.pts.size === 2) {
    const [a, b] = [...drag.pts.values()]; drag.startDist = drag.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    drag.multi = true; drag.engaged = false; drag.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  hideHint();
});
canvas.addEventListener('pointermove', e => {
  if (!drag.pts.has(e.pointerId)) return;
  const p = drag.pts.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (drag.pts.size === 1) {
    const s = 3.2 / innerHeight; rotateBy(dx * s, dy * s); cam.vel.x = dx * s; cam.vel.y = dy * s; drag.moved += Math.abs(dx) + Math.abs(dy);
  } else if (drag.pts.size === 2) {
    const [a, b] = [...drag.pts.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y);
    // a pinch only counts once the fingers really spread or close (a two-finger pan with jitter never zooms)
    if (!drag.engaged) { if (!pinchEngaged(drag.startDist, dist)) return; drag.engaged = true; }
    // toward the midpoint where the pinch started (fixed, so fingers moving one at a time don't make it wobble)
    if (drag.lastDist > 0) zoomAt(-Math.log10(dist / drag.lastDist) * 2.2, drag.mid.x, drag.mid.y);
    drag.lastDist = dist;
  }
});
const endPtr = e => { drag.pts.delete(e.pointerId); if (drag.pts.size === 0) drag.active = false; drag.lastDist = 0; drag.engaged = false; if (drag.pts.size === 1) cam.vel.x = cam.vel.y = 0; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY * (e.ctrlKey ? 0.01 : 0.0022), e.clientX, e.clientY); hideHint(); }, { passive: false });
let lastTap = 0;
// double-tap zooms in (centred); the two finger-lifts that end a pinch are not taps
canvas.addEventListener('pointerup', e => { if (drag.multi) { lastTap = 0; return; } if (drag.moved < 6) { const t = performance.now(); if (t - lastTap < 300) zoomBy(-0.6); lastTap = t; } });
function zoomBy(dLog) { if (cam.anim) { cam.anim.toLog += dLog; } else cam.logD += dLog; }
// Free focus: a spot kept as an OFFSET from the object you were following (its anchor), so the view rides along
// with that object as it moves (time running, Tour speeds). With no anchor (a stopped fly-in, a pin whose object is
// gone) the offset is an absolute position. An open card may stay.
const free = { anchor: null, off: V() };
function setFreeFocus(anchorId, off) {
  const a = anchorId && hasOwn(focusables, anchorId) ? focusables[anchorId] : null;
  free.anchor = a && !a.free && typeof a.getPos === 'function' ? anchorId : null;
  free.off.copy(off);
  focusables['free:here'] ||= { name: 'Deep space', free: true, radius: 1e-6, defaultDist: 1,
    getPos: o => { if (free.anchor) focusables[free.anchor].getPos(o); else o.set(0, 0, 0); return o.add(free.off); } };
  cam.focusId = 'free:here';
}
// Zoom toward the spot under the pointer (clientX/Y), which stays put on screen. Zooming out, +/− keys and double-tap
// stay centred; during a flight, wheel/pinch only change where the flight ends (no sideways shift mid-flight).
function zoomAt(dLog, clientX, clientY) {
  if (cam.anim || !(dLog < 0)) { zoomBy(dLog); return; }
  const w = innerWidth, h = innerHeight; // the canvas fills the window (no layout read per move)
  if (!(w > 0 && h > 0)) { zoomBy(dLog); return; } // hidden / mid-rotation: no pointer maths with a 0×0 view
  const px = clientX - w / 2, py = clientY - h / 2;
  if (!Number.isFinite(px) || !Number.isFinite(py) || Math.hypot(px, py) < Math.min(w, h) * 0.03) { zoomBy(dLog); return; } // at the centre: keep following
  const toLog = Math.max(cam.logD + dLog, MIN_LOG); if (!(toLog < cam.logD)) return;
  const factor = Math.pow(10, toLog - cam.logD);
  // the spot on the plane through the target, perpendicular to the view: an offset relative to the distance
  const o = focusPlaneOffset(px / (w / 2), -py / (h / 2), Math.pow(10, cam.logD), camera.fov * deg, w / h);
  const offW = V(o.x, o.y, 0).applyQuaternion(cam.q);
  const f = focusables[cam.focusId];
  // the target moves (1 − factor) of the way to the spot; only the offset from the anchor changes
  const t = zoomTowardOffset(f?.free ? free.off : { x: 0, y: 0, z: 0 }, offW, factor);
  if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) return;
  if (f?.free) free.off.set(t.x, t.y, t.z);
  else setFreeFocus(cam.focusId, V(t.x, t.y, t.z)); // leave the object's centre, keep riding along with it
  focusPos('free:here', cam.target); // fresh anchor position (cam.target can be a frame old)
  cam.logD = toLog;
}
// How the focused element got focus: by keyboard (Tab, or code moving focus after a key) or by pointer. Chrome turns
// :focus-visible on for a clicked button as soon as any key is pressed, so it can't tell these apart at keydown.
let lastInput = 'pointer', kbFocusEl = null;
addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
addEventListener('keydown', () => { lastInput = 'key'; }, true);
addEventListener('focusin', e => { kbFocusEl = lastInput === 'key' ? e.target : null; }, true);
addEventListener('keydown', e => {
  if (e.target instanceof Element && e.target.closest('input, textarea, select')) return; // typing in the search box
  // Space presses a button that has keyboard focus; after a mouse click (focus stays on the button) it still pauses
  const onControl = e.target === kbFocusEl && e.target instanceof Element && !!e.target.closest('button, [role=tab], a');
  if (e.key === '+' || e.key === '=') zoomBy(-0.25); if (e.key === '-') zoomBy(0.25);
  if (e.key === ' ' && !onControl) { togglePause(); e.preventDefault(); }
});

// ───────────────────────── labels ─────────────────────────
const labelLayer = document.getElementById('labels');
const labels = [];
function addLabel({ text, sub = '', cls = '', getPos, visible, onTap, prio = 1 }) {
  const el = document.createElement('button'); el.className = 'lbl ' + cls;
  el.innerHTML = `<span class="t">${text}</span>${sub ? `<span class="s">${sub}</span>` : ''}`;
  el.addEventListener('click', e => { e.stopPropagation(); onTap?.(); });
  labelLayer.appendChild(el);
  const L = { el, getPos, visible, prio, on: false, w: text.length * 7.5 + 22 };
  labels.push(L); return L;
}
const camDistTo = p => camera.position.distanceTo(p);
for (const b of solar.bodies) {
  const f = focusables[b.id];
  const range = b.id === 'sun' ? 4.6 : b.id === 'moon' ? 0.9 * 0 - 1.4 : Math.log10(Math.max(b.orbitR, 0.3) * 50);
  addLabel({ text: b.name, cls: b.id === 'sun' ? 'major' : (b.dwarf ? 'minor' : ''), prio: b.id === 'sun' ? 3 : 2,
    getPos: o => o.copy(b.pos),
    visible: () => { const d = camDistTo(b.pos); return settings.labels && d > b.radius * 6 && Math.log10(d) < range; },
    onTap: () => flyTo(b.id) });
}
function addStoryLabels() {
  for (const id of ['alphacen', 'sirius', 'trappist', 'betelgeuse', 'proxima', 'barnard', 'gliese710', 'peg51', 'kepler16', 'algol', 'polaris', 'mira', 'orion', 'vega', 'cyg61', 'luhman16', 'capella', 'pleiades', 'hr8799', 'betapic', 'fomalhaut', 'epseri', 'taucet', 'spica', 'arcturus', 'hyades', 'cnc55', 'kapteyn', 'antares', 'zetaoph', 'epsind']) {
    const f = focusables[id]; if (!f) continue; const s = STORIES[f.story];
    addLabel({ text: s.title.toUpperCase(), sub: s.sub, cls: 'story', prio: 4,
      getPos: o => f.getPos(o),
      visible: () => { const d = camDistTo(f.getPos(tmpL)); const L = Math.log10(d); return L > 2.2 && L < 8.6 && camLogSun > 4.2; },
      onTap: () => flyTo(id) });
  }
  for (const id of ['crab', 'etacar', 'cygx1', 'pillars', 'omegacen', 'ringneb', 'hulse', 'casa', 'sn1987a', 'wr104', 'kepler90', 'gaiabh1']) {
    const f = focusables[id]; if (!f) continue; const s = STORIES[f.story];
    addLabel({ text: s.title.toUpperCase(), sub: s.sub.split('·').pop().trim(), cls: 'story', prio: 4, getPos: o => f.getPos(o),
      visible: () => { const L = Math.log10(camDistTo(f.getPos(tmpL))); return L > 2.2 && L < 9.7 && camLogSun > 6.5; },
      onTap: () => flyTo(id) });
  }
  const sg = focusables.sgra;
  if (sg) addLabel({ text: STORIES.sgra.title.toUpperCase(), sub: 'black hole at the center', cls: 'story', prio: 5.5, getPos: o => sg.getPos(o),
    visible: () => { const L = Math.log10(camDistTo(sg.getPos(tmpL))); return L > 2.2 && L < 9.4; }, onTap: () => flyTo('sgra') });
}
const tmpL = V();
let camLogSun = 0;
for (const g of ['andromeda', 'triangulum', 'lmc', 'smc']) {
  const f = focusables[g]; const s = STORIES[g];
  addLabel({ text: s.title.toUpperCase(), sub: s.sub.split('·').pop().trim(), cls: 'story', prio: 4, getPos: o => f.getPos(o),
    visible: () => camLogSun > 9.9 && camLogSun < 13.5 && camDistTo(f.getPos(tmpL)) > f.defaultDist * 0.4, onTap: () => flyTo(g) });
}
addLabel({ text: 'MILKY WAY', sub: 'Sagittarius A* at the center', cls: 'story', prio: 5, getPos: o => o.copy(GC_POS),
  visible: () => camLogSun > 8.6 && camLogSun < 13.2, onTap: () => flyTo('galaxy', undefined, undefined, galaxyLook()) });
addLabel({ text: 'You are here', cls: 'here', prio: 6, getPos: o => o.set(0, 0, 0), visible: () => camLogSun > 5.2 && camLogSun < 12.9, onTap: () => flyTo('sun') });
addLabel({ text: 'THE EDGE OF WHAT WE CAN SEE', sub: 'cosmic microwave background', cls: 'story', prio: 5,
  getPos: o => o.set(-0.35, 0.62, 0).applyQuaternion(cam.q).multiplyScalar(UNIVERSE_R),
  visible: () => camLogSun > 15.4, onTap: () => flyTo('universe') });
let starLabels = [];
function buildStarLabels() {
  addStoryLabels();
  // brightest named stars get labels when they're among the brightest visible
  const cand = starData.names.filter(n => starData.mag[n[0]] < 90);
  starLabels = cand.map(n => {
    const idx = n[0];
    const L = addLabel({ text: n[1], cls: 'star', prio: 0, getPos: o => o.set(starData.pos[idx * 3], starData.pos[idx * 3 + 1], starData.pos[idx * 3 + 2]).addScaledVector(tmpV.set(starData.vel[idx * 3], starData.vel[idx * 3 + 1], starData.vel[idx * 3 + 2]), simYears()),
      visible: () => L.bright, onTap: () => flyToStar(idx) });
    L.idx = idx; L.bright = false; return L;
  });
}
const tmpV = V();
let starLabelFrame = 0;
function updateStarLabelSelection() {
  if (!starLabels.length || starLabelFrame++ % 20) return;
  const cp = camera.position; const dt = simYears();
  const scored = starLabels.map(L => {
    const i = L.idx; const x = starData.pos[i * 3] + starData.vel[i * 3] * dt - cp.x, y = starData.pos[i * 3 + 1] + starData.vel[i * 3 + 1] * dt - cp.y, z = starData.pos[i * 3 + 2] + starData.vel[i * 3 + 2] * dt - cp.z;
    const dpc = Math.max(Math.hypot(x, y, z) / PC_AU, 1e-9); return [L, starData.mag[i] + 5 * Math.log10(dpc) - 5];
  }).sort((a, b) => a[1] - b[1]);
  const show = settings.labels && camLogSun < 8.4;
  scored.forEach(([L, m], k) => { L.bright = show && k < (isMobile ? 9 : 14) && m < 5.5; });
}
const proj = V();
const _oc = V(), _od = V();
function occluded(p) {
  // hide labels behind a planet/star the camera is close to
  const cp = camera.position; _od.copy(p).sub(cp); const len = _od.length(); _od.divideScalar(len);
  for (const sys of systems) for (const b of sys.bodies) {
    if (!b.radius) continue;
    _oc.copy(b.pos).sub(cp); const along = _oc.dot(_od);
    if (along <= 0 || along >= len - b.radius * 1.01) continue;
    const perp2 = _oc.lengthSq() - along * along;
    if (perp2 < b.radius * b.radius * 1.02) return true;
  }
  return false;
}
function updateLabels() {
  const W = innerWidth, H = innerHeight; const placed = [];
  const sorted = labels.slice().sort((a, b) => b.prio - a.prio);
  for (const L of sorted) {
    let show = false;
    if (L.visible()) {
      L.getPos(proj);
      if (occluded(proj)) { if (L.on) { L.on = false; L.el.classList.remove('on'); } continue; }
      proj.project(camera);
      if (proj.z < 1 && proj.z > -1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
        const x = (proj.x + 1) / 2 * W, y = (1 - proj.y) / 2 * H;
        const flip = x + 8 + L.w > W - 6;
        const r = flip ? { x0: x - 8 - L.w, y0: y - 12, x1: x - 8, y1: y + 14 } : { x0: x + 8, y0: y - 12, x1: x + 8 + L.w, y1: y + 14 };
        L.el.classList.toggle('flip', flip);
        if (!placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) {
          placed.push(r); show = true; L.el.style.transform = `translate(${x | 0}px, ${y | 0}px)`;
        }
      }
    }
    if (show !== L.on) { L.on = show; L.el.classList.toggle('on', show); }
  }
}

// ───────────────────────── UI ─────────────────────────
const $ = s => document.querySelector(s);
const card = $('#card');
let cardStoryKey = null, cardFocusId = null, cardObjId = null, cardSaved = false;
// objId: what ☆ saves: the focusable id the card is about, or a function returning { view, label } (read-only cards
// whose "Fly there" goes to a computed spot), or null when the card has no place (then ☆ is hidden).
function showCard(story, focusId, objId = focusId) {
  cardFocusId = focusId; cardObjId = objId ?? null;
  setCardSaved(false); $('#cardSave').hidden = !cardObjId; // no place to save: no ☆
  selectConstellation(story?.con || null); // a constellation card draws its lines; any other card clears them
  if (!story) { card.classList.remove('open'); return; }
  cardStoryKey = story;
  $('#cardTitle').textContent = story.isNew ? story.title : story.title.toUpperCase(); // keep planet letters lowercase ("b", not "B")
  $('#cardNew').hidden = !story.isNew;
  $('#cardSub').textContent = story.sub;
  $('#cardHook').textContent = story.hook;
  $('#cardFacts').innerHTML = story.facts.map(f => `<li>${escapeHTML(f)}</li>`).join('');
  $('#cardSource').textContent = 'Source: ' + story.source;
  $('#cardNote').textContent = story.illustrative || '';
  $('#cardNote').style.display = story.illustrative ? '' : 'none';
  try { if (story.noAudio) $('#narrate').style.display = 'none'; else updateNarrateBtn(); } catch { }
  card.classList.add('open'); card.classList.toggle('collapsed', innerWidth < 820); syncMore();
  stopSpeaking();
}
$('#cardClose').onclick = () => { card.classList.remove('open'); stopSpeaking(); selectConstellation(null); };
function syncMore() { $('#more').textContent = card.classList.contains('collapsed') ? 'More' : 'Less'; }
$('#cardGrab').onclick = () => { card.classList.toggle('collapsed'); syncMore(); };
$('#more').onclick = () => { card.classList.toggle('collapsed'); syncMore(); };

// narration (Claude voice if offered, else browser speech)
let tts = null;
const hasSpeech = () => !!tts || ('speechSynthesis' in window);
function updateNarrateBtn() { $('#narrate').style.display = hasSpeech() ? '' : 'none'; }
updateNarrateBtn();
(async () => { try { if (window.claude?.use) tts = await window.claude.use('tts'); } catch { } updateNarrateBtn(); })();
let speaking = false;
function stopSpeaking() { speaking = false; $('#narrate').classList.remove('on'); try { tts?.stop(); } catch { } try { speechSynthesis?.cancel(); } catch { } }
$('#narrate').onclick = async () => {
  if (speaking) { stopSpeaking(); return; }
  const s = cardStoryKey; if (!s) return;
  const text = `${s.title}. ${s.hook} ${s.facts.join(' ')}`;
  speaking = true; $('#narrate').classList.add('on');
  try {
    if (tts) await tts.speak(text, { voice: 'rounded', rate: 0.95 });
    else { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; await new Promise(res => { u.onend = res; u.onerror = res; speechSynthesis.speak(u); }); }
  } catch { }
  speaking = false; $('#narrate').classList.remove('on');
};

// ───────────────────────── search & Atlas ─────────────────────────
const storyOf = f => f?.story ? (typeof f.story === 'string' ? STORIES[f.story] : f.story) : null;
// Favorites state (the logic is in the "favorites" section further down). Declared here, before initSearch, so the
// Saved tab can subscribe while it is being set up. Own lists load once the star data is in (story stops and
// star:<idx> ids only exist then).
const saved = { favs: [], colls: [{ id: TOP10_ID, name: TOP10_NAME, items: [] }], shared: null, loaded: false, starsDone: false, warned: false, warnNow: false, listeners: new Set() };
const savedAPI = {
  ready: () => saved.loaded,
  list: () => saved.favs.slice(),
  colls: () => saved.colls.slice(),
  pins: () => pins.map(p => ({ id: p.id, label: viewLabel(p) })),
  describe: fav => describeFav(fav),
  saveCurrent: fromCardFocusId => saveCurrent(fromCardFocusId),
  restore: fav => restoreFavorite(fav),
  rename: (id, name) => renameFav(id, name),
  remove: id => removeFav(id),
  addTo: (collId, favId) => addToColl(collId, favId),
  newColl: name => newColl(name),
  renameColl: (collId, name) => renameColl(collId, name),
  removeColl: collId => removeColl(collId),
  moveInColl: (collId, i, delta) => editColl(collId, c => moveItem(c, i, delta)),
  removeFromColl: (collId, i) => editColl(collId, c => removeItem(c, i)),
  share: x => shareSaved(x),
  startListTour: items => startListTour(items),
  keepPin: pinId => keepPin(pinId),
  shared: () => saved.shared,
  saveShared: () => saveShared(),
  closeShared: () => { if (saved.shared) { saved.shared = null; savedChanged(); } },
  onChange: cb => { saved.listeners.add(cb); return () => saved.listeners.delete(cb); },
};
const searchUI = initSearch({
  saved: savedAPI,
  toast: (m) => toast(m),
  namesLoaded: () => resolveLookups(),
  // every named place you can fly to (dynamic star: and free-point stops excluded)
  places: () => Object.entries(focusables)
    .filter(([id, f]) => f.name && !id.startsWith('star:') && !id.startsWith('con:') && !f.free)
    .map(([id, f]) => {
      const s = storyOf(f); const au = f.getPos(V()).length();
      return { id, name: s?.title || f.name, alias: s?.title && s.title !== f.name ? f.name : '', sub: s?.sub || '', ly: au > 2000 ? au / LY_AU : null, isNew: !!s?.isNew };
    }),
  namedStars: () => starData?.names || null,     // [idx, name, ly, spect] for the 460 named stars
  starsReady: () => !!starData?.pos,
  starCount: () => starData?.N ?? 0,
  storyForStar: idx => starOwner.get(idx) ?? null,
  flyPlace: id => { stopTour(); flyTo(id, undefined, undefined, id === 'galaxy' ? galaxyLook() : undefined); }, // same as tapping its label
  flyStar: idx => { stopTour(); flyToStar(idx); },
  // Read: card only. The camera and its focus stay where they are.
  readPlace: id => { const s = storyOf(focusables[id]); if (s) showCard(s, cam.focusId, id); },
  readStar: idx => { const owner = starOwner.get(idx); showCard(owner ? storyOf(focusables[owner]) : starStory(idx), cam.focusId, owner || ensureStarFocus(idx)); },
  loadExtras: () => { loadConstellations().catch(() => { }); }, // constellations come with the star names
  closeOthers: () => { stopTour(); for (const sel of ['#sheet', '#about', '#newList']) $(sel).classList.remove('open'); card.classList.remove('open'); stopSpeaking(); },
});
// ───────────────────────── full screen / clean mode ─────────────────────────
// Hides all UI (body.clean); the 3D view and time keep running. Browser full screen is a bonus (iOS Safari has none).
function setClean(on) {
  const was = document.body.classList.contains('clean');
  if (on === was) return;
  document.body.classList.toggle('clean', on);
  $('#cleanBtn').hidden = !on;
  if (on) {
    searchUI.close(); stopSpeaking();
    try { const p = document.documentElement.requestFullscreen?.(); p?.catch?.(() => { }); } catch { }
    $('#cleanBtn').focus({ preventScroll: true });
  } else {
    if (document.fullscreenElement) { try { document.exitFullscreen().catch(() => { }); } catch { } }
    $('#fsBtn').focus({ preventScroll: true });
  }
}
$('#fsBtn').onclick = () => setClean(true);
$('#cleanBtn').onclick = () => setClean(false);
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('clean') && !searchUI.isOpen()) setClean(false); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('clean')) setClean(false); });
function solarLook() { // above the plane of the planets, looking down at ~35°
  const side = new THREE.Vector3().crossVectors(ECL_N, V(1, 0, 0)).normalize();
  return ECL_N.clone().multiplyScalar(Math.sin(38 * deg)).addScaledVector(side, Math.cos(38 * deg));
}
function galaxyLook() { // from above the disk, tilted a little, with the Sun toward the viewer
  return NGP.clone().multiplyScalar(Math.sin(62 * deg)).addScaledVector(GC_DIR.clone().negate(), Math.cos(62 * deg));
}
// ───────────────────────── constellations ─────────────────────────
// Stick figures from Stellarium's modern sky culture, drawn between the stars' real 3D positions (with proper
// motion). One shared position buffer: "all 88" (Settings toggle) and the selected one (its card) draw ranges of it.
// constellations.json loads with the star names (first search open) or when the toggle is switched on.
function loadConstellations() {
  if (!con.loading) {
    con.loading = fetch('constellations.json')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(list => {
        con.list = list; for (const c of list) con.byAbbr.set(c.abbr, c);
        searchUI.addExtras(list.flatMap(c => {
          const e = { key: 'c:' + c.abbr, name: c.name, kind: 'Constellation', sub: c.english && c.english !== c.name ? c.english : '', ly: null, category: 'Constellations',
            fly: () => { stopTour(); flyToConstellation(c.abbr); }, read: () => showCard(conStory(c), cam.focusId, () => conSaveView(c.abbr)), flyDisabled: () => !starData?.pos };
          return e.sub ? [e, { ...e, name: c.english, alias: true }] : [e]; // "Great Bear" finds Ursa Major
        }));
        return list;
      })
      .catch(err => { console.warn('Constellations could not load', err); con.loading = null; throw err; });
  }
  return con.loading;
}
function conStory(c) {
  const rows = searchUI.rows(); // HYG rows once the star names are loaded, else null
  if (rows && con.statsRows !== rows) { con.stats = constellationStats(rows); con.statsRows = rows; }
  const P = starData?.pos;
  const lyOf = P ? i => Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) / LY_AU : null;
  return constellationCard(c, rows, rows ? con.stats : null, lyOf);
}
// From our Solar System, facing the figure with celestial north up. The viewpoint is 300 AU from the Sun, off to
// the side of the line of sight (toward ecliptic north), so the Sun and planets sit outside the view instead of in
// the middle of the figure. From the stars' distances (≥ 4 light-years) 300 AU changes nothing you could see.
function constellationView(abbr) { // where "Fly there" ends: { c, target, lookFrom, up } or null
  const c = con.byAbbr.get(abbr); if (!c || !starData?.pos) return null;
  const d = meanDirection(lineStars(c.lines), starData.pos, starData.vel, simYears()); if (!d) return null;
  const fig = V(d[0], d[1], d[2]);
  const eye = V(...perpendicular(d, [ECL_N.x, ECL_N.y, ECL_N.z])).multiplyScalar(CON_VIEW_AU);
  // aim a little below the figure's center so it sits above the card (bottom sheet on phones)
  const north = V(...perpendicular(d, [0, 0, 1])), a = (innerWidth < 820 ? 9 : 2) * deg;
  const dir = fig.clone().multiplyScalar(Math.cos(a)).addScaledVector(north, -Math.sin(a));
  const target = eye.clone().addScaledVector(dir, CON_VIEW_AU);
  return { c, target, lookFrom: dir.clone().negate(), up: V(0, 0, 1) };
}
function flyToConstellation(abbr) {
  const cv = constellationView(abbr); if (!cv) return;
  const { c, target } = cv;
  const id = 'con:' + abbr;
  focusables[id] = { name: c.name, getPos: o => o.copy(target), radius: CON_VIEW_AU / 10, defaultDist: CON_VIEW_AU, story: conStory(c) };
  flyTo(id, CON_VIEW_AU, undefined, cv.lookFrom, cv.up);
}
function selectConstellation(abbr) {
  con.selAbbr = abbr && con.byAbbr.has(abbr) ? abbr : null;
}
function buildConGeometry() {
  if (con.geo || !con.list || !starData?.pos) return;
  const pairs = []; con.range = new Map();
  for (const c of con.list) { const p = segmentPairs(c.lines); con.range.set(c.abbr, [pairs.length * 2, p.length * 2]); pairs.push(...p); }
  con.segIdx = Int32Array.from(pairs.flat());
  const attr = new THREE.BufferAttribute(new Float32Array(con.segIdx.length * 3), 3);
  const make = op => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', attr);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#86a8ff', transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.frustumCulled = false; l.visible = false; l.renderOrder = 2; l.userData.op = op; scene.add(l); return l;
  };
  con.geo = attr; con.all = make(0.2); con.sel = make(0.5);
  con.lastDt = NaN;
}
function updateConstellations(Lc) {
  if (!con.geo) { if ((settings.conLines || con.selAbbr) && con.list && starData?.pos) buildConGeometry(); if (!con.geo) return; }
  const fade = 1 - smooth(8.4, 9.1, Lc); // gone with the star field, well before galaxy views
  const allOn = settings.conLines && fade > 0.01, selOn = !!con.selAbbr && fade > 0.01;
  con.all.visible = allOn; con.sel.visible = selOn;
  if (!allOn && !selOn) return;
  // move the line ends with the stars only when time has moved enough to matter (half a year)
  const dt = simYears();
  if (!(Math.abs(dt - con.lastDt) < 0.5)) {
    const a = con.geo.array, P = starData.pos, Vl = starData.vel, I = con.segIdx;
    for (let k = 0; k < I.length; k++) {
      const i = I[k] * 3, o = k * 3;
      a[o] = P[i] + Vl[i] * dt; a[o + 1] = P[i + 1] + Vl[i + 1] * dt; a[o + 2] = P[i + 2] + Vl[i + 2] * dt;
    }
    con.geo.needsUpdate = true; con.lastDt = dt;
  }
  con.all.material.opacity = con.all.userData.op * fade;
  con.sel.material.opacity = con.sel.userData.op * fade;
  if (selOn) { const [s, n] = con.range.get(con.selAbbr); con.sel.geometry.setDrawRange(s, n); }
}

// scale chips
const CHIPS = [
  ['Earth', () => flyTo('earth')],
  ['Solar System', () => flyTo('sun', 70, undefined, solarLook())],
  ['Nearby Stars', () => flyTo('sun', 18 * LY_AU)],
  ['Milky Way', () => flyTo('galaxy', undefined, undefined, galaxyLook())],
  ['Local Group', () => flyTo('sun', 9e6 * LY_AU)],
  ['Universe', () => flyTo('universe')],
];
const chipsEl = $('#chips');
CHIPS.forEach(([t, fn]) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = t; b.onclick = () => { fn(); stopTour(); }; chipsEl.appendChild(b); });

// ───────────────────────── pins (checkpoints) ─────────────────────────
// "📍 Pin" saves the place, not the time: target, distance, orientation, and either the followed object or (after
// free zoom) the object the spot rides along with plus the offset from it, with the absolute spot as a fallback.
// Tap a letter to fly back; press and hold (touch), right-click or Delete to remove. Stored in localStorage.
const pinStore = (() => { try { return localStorage; } catch { return null; } })();
let pins = loadPins(pinStore);
let pinClickBlockUntil = 0; // after a long press, swallow the click that follows (the next chip may slide under the finger)
const pinAddBtn = document.createElement('button');
pinAddBtn.className = 'chip pinAdd'; pinAddBtn.textContent = '📍 Pin'; pinAddBtn.setAttribute('aria-label', 'Pin this view');
pinAddBtn.title = 'Pin this view to come back later';
chipsEl.prepend(pinAddBtn);
const saveFavBtn = document.createElement('button');
saveFavBtn.className = 'chip saveAdd'; saveFavBtn.textContent = '★ Save'; saveFavBtn.setAttribute('aria-label', 'Save this view to your favorites');
saveFavBtn.title = 'Save this view (place, time and speed) to your favorites';
pinAddBtn.after(saveFavBtn);
saveFavBtn.onclick = () => saveCurrent();
// The current view as pin fields: target, distance, orientation, and either the followed object or (after free zoom)
// the object the spot rides along with plus the offset from it. Mid-flight or free with no anchor: the spot itself.
function captureView() {
  const f = focusables[cam.focusId];
  const focus = !cam.anim && f && !f.free ? cam.focusId : null; // mid-flight or free: pin the spot itself
  const anchor = !cam.anim && f?.free && free.anchor ? free.anchor : null;
  return { t: cam.target.toArray(), q: [cam.q.x, cam.q.y, cam.q.z, cam.q.w], logD: cam.logD, focus, anchor, off: anchor ? free.off.toArray() : null };
}
pinAddBtn.onclick = () => {
  const id = nextPinLetter(pins);
  if (!id) { toast(`Up to ${MAX_PINS} pins: press and hold one to remove it.`); return; }
  pins = [...pins, { id, ...captureView() }].sort((a, b) => a.id.localeCompare(b.id));
  const ok = savePins(pinStore, pins); renderPins(); savedChanged();
  toast(ok ? `Pin ${id} saved: tap it to come back here.` : `Pin ${id} added for this visit (this browser can't save it).`);
};
// A stored id is only used if it is a real, own entry (never an inherited name like "toString").
function pinFocusId(id) {
  if (typeof id !== 'string') return null;
  if (id.startsWith('star:')) return /^star:\d+$/.test(id) ? ensureStarFocus(+id.slice(5)) : null; // made on demand
  const f = hasOwn(focusables, id) ? focusables[id] : null;
  return f && !f.free && typeof f.getPos === 'function' ? id : null;
}
function flyToPin(p) { stopTour(); restoreView(p); }
// Fly to a saved view (pin fields): its object if it still exists, else its anchor + offset, else the absolute spot.
function restoreView(p) {
  let id = pinFocusId(p.focus);
  if (!id) { // a free spot: relative to its object if that is still around, else the absolute spot
    const anchor = pinFocusId(p.anchor);
    const fromTarget = cam.target.clone();
    if (anchor && p.off) setFreeFocus(anchor, V(...p.off)); else setFreeFocus(null, V(...p.t));
    cam.target.copy(fromTarget); id = 'free:here';
  }
  flyTo(id, Math.pow(10, clamp(p.logD, MIN_LOG, MAX_LOG)));
  if (cam.anim) cam.anim.toQ = new THREE.Quaternion(...p.q).normalize();
}
function removePin(id) {
  if (!pins.some(p => p.id === id)) return false;
  pins = pins.filter(p => p.id !== id); savePins(pinStore, pins); renderPins(); savedChanged();
  toast(`Pin ${id} removed`); return true;
}
function renderPins() {
  chipsEl.querySelectorAll('.pinChip').forEach(el => el.remove());
  let after = saveFavBtn; // 📍 Pin, ★ Save, then the pin letters
  for (const p of pins) {
    const b = document.createElement('button'); b.className = 'chip pinChip'; b.textContent = p.id;
    b.setAttribute('aria-label', `Pin ${p.id} — fly back; hold or press Delete to remove`);
    b.title = `Pin ${p.id}: tap to fly back; press and hold, right-click or press Delete to remove`;
    let lp = null;
    const clear = () => { if (lp) clearTimeout(lp.t); lp = null; };
    b.addEventListener('pointerdown', e => {
      if (e.button > 0 || e.pointerType === 'mouse') return; // long press is for touch; mouse uses right-click
      clear();
      lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; pinClickBlockUntil = performance.now() + 700; removePin(p.id); }, 550) };
    });
    b.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) clear(); }); // scrolling the row
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, clear);
    b.addEventListener('contextmenu', e => { e.preventDefault(); clear(); pinClickBlockUntil = performance.now() + 700; removePin(p.id); });
    b.addEventListener('keydown', e => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault(); e.stopPropagation();
      if (removePin(p.id)) pinAddBtn.focus({ preventScroll: true }); // keep keyboard focus on the row
    });
    b.onclick = () => { if (performance.now() < pinClickBlockUntil) return; flyToPin(p); };
    after.after(b); after = b;
  }
}
// no browser menu or text selection from a long press anywhere on the chip row; no stray click right after a removal
chipsEl.addEventListener('contextmenu', e => e.preventDefault());
chipsEl.addEventListener('click', e => { if (performance.now() < pinClickBlockUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
renderPins();

// time controls
function setSpeed(i) { time.speedIdx = clamp(i, 0, SPEEDS.length - 1); time.paused = false; updateTimeUI(); }
$('#slower').onclick = () => { if (time.dir < 0 && time.speedIdx === 0) time.dir = 1; else if (time.speedIdx === 0) { time.dir = -1; setSpeed(1); return; } else if (time.dir < 0) { setSpeed(time.speedIdx + 1); return; } setSpeed(time.speedIdx - 1); };
$('#faster').onclick = () => { if (time.dir < 0) { if (time.speedIdx <= 1) { time.dir = 1; setSpeed(0); } else setSpeed(time.speedIdx - 1); return; } setSpeed(time.speedIdx + 1); };
function togglePause() { time.paused = !time.paused; updateTimeUI(); }
$('#play').onclick = togglePause;
$('#live').onclick = () => { time.ms = Date.now(); time.dir = 1; setSpeed(0); };
let speedText = '';
function updateTimeUI() {
  const [label] = SPEEDS[time.speedIdx];
  speedText = time.paused ? 'Paused' : (time.dir < 0 && time.speedIdx > 0 ? 'Reverse ' : '') + label;
  $('#play').innerHTML = time.paused ? PLAY_ICON : PAUSE_ICON;
}
const PLAY_ICON = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';
function fmtDate(ms, speedIdx = time.speedIdx) { // as the time bar shows it at that speed
  const yrs = ms / (DAY_MS * YEAR_D) + 1970;
  if (Math.abs(yrs - 2000) < 200000) {
    const d = new Date(ms);
    if (SPEEDS[speedIdx][1] < 31557600 * 2) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const y = Math.round(yrs);
  return y > 0 ? `Year ${y.toLocaleString()}` : `${Math.abs(y).toLocaleString()} BCE`;
}

// view toggle
// bump: switching to Galaxy view speeds time up so the spirals show; the Tour and favorites keep their own speed.
function setView(v, { bump = true, announce = false } = {}) {
  settings.view = v === 'galaxy' ? 'galaxy' : 'sun';
  document.querySelectorAll('#viewSeg button').forEach(x => x.classList.toggle('sel', x.dataset.v === settings.view));
  if (announce) toast(settings.view === 'galaxy' ? 'Galaxy view: watch everything get dragged along with the Sun.' : 'Sun view: orbits as seen riding along with the Sun.');
  if (bump && settings.view === 'galaxy' && time.speedIdx < 4) setSpeed(5);
}
document.querySelectorAll('#viewSeg button').forEach(b => b.onclick = () => setView(b.dataset.v, { announce: true }));
// settings sheet
$('#settingsBtn').onclick = () => { searchUI.close(); $('#newList').classList.remove('open'); $('#sheet').classList.toggle('open'); };
$('#sheetClose').onclick = () => $('#sheet').classList.remove('open');
const bindRange = (id, key, fmt) => { const el = $(id); const out = $(id + 'Out'); const upd = () => { settings[key] = parseFloat(el.value); out.textContent = fmt(settings[key]); }; el.oninput = upd; upd(); };
bindRange('#trailLen', 'trailLen', v => v < 0.35 ? 'Short' : v < 0.75 ? 'Medium' : 'Long');
bindRange('#trailRange', 'trailRange', v => v < 0.35 ? 'Few stars' : v < 0.75 ? 'Some stars' : 'Lots of stars');
bindRange('#sunSpeed', 'sunSpeed', v => v >= 0.99 ? 'Real speed' : `Slowed ${Math.round(1 / v)}×`);
$('#optLabels').onchange = e => settings.labels = e.target.checked;
$('#optOrbits').onchange = e => settings.orbits = e.target.checked;
$('#optCon').onchange = e => {
  settings.conLines = e.target.checked;
  if (settings.conLines) loadConstellations().catch(() => { settings.conLines = false; e.target.checked = false; toast('Constellation lines could not load.'); });
};
$('#optAuto').onchange = e => { settings.autoSpiral = e.target.checked; $('#sunSpeed').disabled = settings.autoSpiral; };
$('#sunSpeed').disabled = true;
$('#aboutBtn').onclick = () => { searchUI.close(); $('#about').classList.add('open'); $('#sheet').classList.remove('open'); $('#newList').classList.remove('open'); };
$('#aboutClose').onclick = () => $('#about').classList.remove('open');

// toast
let toastT = 0;
function toast(msg, ms = 3200) { const t = $('#toast'); t.classList.remove('link'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
// A toast holding a link in a read-only field (selectable: the toast takes pointer events only in this case).
function toastLink(url) {
  const t = $('#toast'); t.textContent = '';
  const p = document.createElement('span'); p.textContent = 'Copy this link:';
  const i = document.createElement('input'); i.type = 'text'; i.readOnly = true; i.value = url; i.setAttribute('aria-label', 'Link to share');
  i.addEventListener('focus', () => i.select());
  t.append(p, i); t.classList.add('on', 'link');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on', 'link'), 20000);
  try { i.focus({ preventScroll: true }); i.select(); } catch { }
}
// hint
let hinted = false;
function hideHint() { if (!hinted) { hinted = true; $('#hint').classList.add('gone'); } }

// guided tour
const TOUR = [
  ['earth', null, 'sun', 0], ['moon', null, 'sun', 3], ['sun', 9, 'galaxy', 6], ['alphacen', null, 'sun', 7], ['proxima', null, 'sun', 3], ['sirius', null, 'sun', 7],
  ['trappist', null, 'sun', 3], ['kepler16', null, 'sun', 4], ['betelgeuse', null, 'sun', 0], ['orion', null, 'sun', 0], ['galaxy', null, 'sun', 0], ['sgra', null, 'sun', 6], ['andromeda', null, 'sun', 0], ['universe', null, 'sun', 0],
];
// A tour is a list of stops [{ go(), caption }]: each stop flies somewhere, then the next one follows after the
// flight plus ~9 s (or "Next stop" on the card). The built-in Tour is one such list; collections make others.
let tour = null;
$('#tourBtn').onclick = () => { if (tour) stopTour(); else { searchUI.close(); startBuiltInTour(); } };
function builtInStops() {
  return TOUR.map(([id, dist, view, sp]) => ({ caption: null, go: () => {
    setView(view, { bump: false });
    setSpeed(sp); time.dir = 1;
    flyTo(id, dist ?? undefined, undefined, id === 'sun' ? solarLook() : id === 'galaxy' ? galaxyLook() : undefined);
  } }));
}
function startBuiltInTour() { time.ms = Date.now(); time.dir = 1; startTour(builtInStops()); }
function startTour(stops) {
  if (!Array.isArray(stops) || !stops.length) return;
  tour = { stops, i: -1, next: 0 }; $('#tourBtn').classList.add('on'); $('#tourBtn').textContent = 'Stop tour'; tourStep();
}
function stopTour() { if (!tour) return; tour = null; $('#tourBtn').classList.remove('on'); $('#tourBtn').textContent = 'Tour'; }
function tourStep() {
  if (!tour) return; tour.i++;
  if (tour.i >= tour.stops.length) { stopTour(); return; }
  const stop = tour.stops[tour.i];
  try { stop.go(); } catch (err) { console.warn('Tour stop failed', err); }
  if (!tour) return; // a stop may end the tour
  if (stop.caption) toast(stop.caption);
  tour.next = performance.now() + (cam.anim?.dur || 2000) + 9000;
}
$('#cardNext').onclick = () => { if (tour) tourStep(); else startBuiltInTour(); };

// ───────────────────────── favorites, collections, shared links ─────────────────────────
// A favorite is a pin view plus the moment: simulated time, speed, direction and Sun/Galaxy view. Pure rules
// (validation, storage, names, list edits, link format) live in favorites.mjs; this is the wiring.
// State is `saved` (declared before initSearch); the Saved tab uses `savedAPI`.
const DYNAMIC_ID = /^(con|new|free):/; // made on demand this visit only: saved as the spot instead
const STAR_ID = /^star:(\d{1,9})$/;
function savedChanged() { for (const cb of [...saved.listeners]) { try { cb(); } catch (err) { console.warn(err); } } }
function favOpts() { return { speeds: SPEEDS.length, isKnownId: favKnownId, starName: quickStarName }; }
// true: an own, lasting focusable or a star in range. 'lookup': a star we can't check yet (or out of range: its
// saved name may still find it), or, before the star data is in, a plain id that may be a story stop made then.
// false: anything else.
function favKnownId(id) {
  if (typeof id !== 'string') return false;
  const m = STAR_ID.exec(id);
  if (m) return starData?.pos && +m[1] < starData.N ? true : 'lookup';
  if (id.startsWith('star:') || DYNAMIC_ID.test(id)) return false;
  const f = hasOwn(focusables, id) ? focusables[id] : null;
  if (f && !f.free && typeof f.getPos === 'function') return true;
  return !saved.starsDone && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? 'lookup' : false;
}
// The best catalog name for a star: the name index's first name when it is loaded, else the named-star list.
function quickStarName(idx) {
  const row = searchUI.row(idx);
  if (row) return starNames(row)[0] || null;
  const n = starData?.names.find(x => x[0] === idx);
  return n ? n[1] : null;
}
const starIdxOf = id => { const m = typeof id === 'string' ? STAR_ID.exec(id) : null; return m ? +m[1] : null; };
function stableView(v) { // dynamic ids (constellation views, live planets, free spots) can't be found next visit
  let out = { t: v.t.slice(), q: v.q.slice(), logD: v.logD, focus: v.focus ?? null, anchor: v.anchor ?? null, off: v.off ? v.off.slice() : null };
  if (out.focus && DYNAMIC_ID.test(out.focus)) out.focus = null;
  if (out.anchor && DYNAMIC_ID.test(out.anchor)) { out.anchor = null; out.off = null; }
  if (!out.anchor) out.off = null;
  return out;
}
const objName = id => { const f = id && hasOwn(focusables, id) ? focusables[id] : null; return f ? (storyOf(f)?.title || f.name || '') : ''; };
// What a view is "of": its object, else its anchor, else the scale (from the distances alone).
function viewLabel(v) {
  for (const id of [v.focus, v.anchor]) {
    if (!id) continue;
    const idx = starIdxOf(id); const sn = idx !== null ? quickStarName(idx) : null;
    const n = sn || objName(id); if (n) return n;
  }
  const len = Math.hypot(...v.t), Ld = clamp(v.logD, MIN_LOG, MAX_LOG);
  return scaleNameAt(Ld, Math.log10(Math.max(len, Math.pow(10, Ld), 1e-9)));
}
const speedLabel = (idx, dir) => (dir < 0 && idx > 0 ? 'Reverse ' : '') + SPEEDS[idx][0];
function describeFav(f) {
  if (!f?.view || !f.time) return null;
  return { place: viewLabel(f.view), date: fmtDate(f.time.ms, f.time.speedIdx), speed: speedLabel(f.time.speedIdx, f.time.dir), frame: f.frame };
}
function makeFav(view, label) {
  const auto = autoName(label, fmtDate(time.ms));
  const fav = { id: newId(), name: auto, autoName: auto, created: Date.now(), view, time: { ms: time.ms, speedIdx: time.speedIdx, dir: time.dir }, frame: settings.view === 'galaxy' ? 'galaxy' : 'sun' };
  const idx = starIdxOf(view.focus) ?? starIdxOf(view.anchor);
  const sn = idx !== null ? quickStarName(idx) : null;
  if (sn) fav.starName = sn;
  return validFavorite(fav, favOpts()) ? fav : null;
}
const store = pinStore;
// Write the lists. A failed write keeps everything in memory for this visit; the first failure is announced once by
// the next done() (so it can join that action's own toast instead of being overwritten by it).
function persist(which) {
  const ok = (which !== 'colls' ? saveFavs(store, saved.favs) : true) && (which !== 'favs' ? saveColls(store, saved.colls) : true);
  if (!ok && !saved.warned) { saved.warned = true; saved.warnNow = true; }
  return ok;
}
const STORE_FAIL = "This browser can't keep saved views.";
// End of every change: tell the Saved tab, then show the action's toast (if any) with the one-time storage warning.
function done(msg = '', ms = 3200) {
  const warn = saved.warnNow; saved.warnNow = false;
  savedChanged();
  if (warn) toast(msg ? msg + ' · ' + STORE_FAIL : STORE_FAIL, 5000);
  else if (msg) toast(msg, ms);
}
function addFav(fav) {
  if (saved.favs.length >= LIMITS.favs) { toast(`You have ${LIMITS.favs} favorites: delete one first.`); return null; }
  saved.favs = [fav, ...saved.favs];
  persist('favs'); done(`Saved as ‘${fav.name}’`);
  return fav;
}
const camQ = () => [cam.q.x, cam.q.y, cam.q.z, cam.q.w];
// An object as the place: where flying to it ends (the running flight's end if it is flying there now).
function objectView(id, keepFocus) {
  const f = focusables[id]; const flying = cam.anim?.id === id;
  return { t: focusPos(id, V()).toArray(), q: flying && cam.anim.toQ ? cam.anim.toQ.toArray() : camQ(),
    logD: flying ? cam.anim.toLog : Math.log10(f.defaultDist), focus: keepFocus ? id : null, anchor: null, off: null };
}
// A constellation card: the spot its "Fly there" ends at (a fixed spot, so saved as one).
function conSaveView(abbr) {
  const cv = constellationView(abbr); if (!cv) return null;
  return { view: { t: cv.target.toArray(), q: lookQ(cv.lookFrom, cv.up).toArray(), logD: Math.log10(CON_VIEW_AU), focus: null, anchor: null, off: null }, label: cv.c.name };
}
// ★ Save (chip) or ☆ (card). From a card about an object you aren't following, the place its "Fly there" leads to.
function saveCurrent(fromCard) {
  let view, label;
  const spec = typeof fromCard === 'function' ? fromCard() : null;
  const id = typeof fromCard === 'string' && hasOwn(focusables, fromCard) && !focusables[fromCard].free ? fromCard : null;
  const lasting = id && favKnownId(id) === true;
  const conAbbr = id && id.startsWith('con:') ? id.slice(4) : null;
  if (typeof fromCard === 'function') {
    if (!spec) { toast("This place couldn't be saved."); return null; }
    ({ view, label } = spec);
  } else if (id && (id !== cam.focusId || cam.anim)) {
    const cs = conAbbr && !(cam.anim?.id === id && cam.anim.toQ) ? conSaveView(conAbbr) : null;
    if (cs) ({ view, label } = cs);
    else if (lasting || DYNAMIC_ID.test(id)) { view = objectView(id, lasting); label = lasting ? viewLabel(view) : objName(id); }
    else { toast("This place couldn't be saved."); return null; }
  } else {
    view = stableView(captureView());
    const followingDyn = !cam.anim && /^(con|new):/.test(cam.focusId) ? objName(cam.focusId) : '';
    label = view.focus || view.anchor ? viewLabel(view) : followingDyn || (cam.anim ? scaleNameAt(cam.logD, camLogSun) : scaleName(cam.logD, camLogSun));
  }
  const fav = makeFav(view, label);
  if (!fav) { toast("This view couldn't be saved."); return null; }
  return addFav(fav);
}
function keepPin(pinId) {
  const p = pins.find(x => x.id === pinId); if (!p) return null;
  const view = stableView(p);
  const fav = makeFav(view, viewLabel(view));
  if (!fav) { toast("This pin couldn't be saved."); return null; }
  return addFav(fav);
}
// Fly to a favorite: stop any tour, the place (pin rules), its moment and speed (running), its view without the
// Galaxy speed bump; flyTo opens the object's card the same way tapping its label does.
function restoreFavorite(fav, { fromTour = false } = {}) {
  if (!fav?.view || !fav.time) return;
  if (!fromTour) stopTour();
  // a star still waiting for its name check: go to the saved spot rather than a star that may be the wrong one
  const v = fav.needsLookup ? { ...fav.view, focus: null, anchor: null, off: null } : fav.view;
  time.ms = fav.time.ms; time.dir = fav.time.dir === -1 ? -1 : 1;
  setSpeed(fav.time.speedIdx); // also unpauses
  setView(fav.frame, { bump: false });
  restoreView(v);
}
const findFav = id => saved.favs.find(f => f.id === id) || saved.shared?.items.find(f => f.id === id) || null;
function renameFav(id, name) {
  const f = saved.favs.find(x => x.id === id); if (!f) return null;
  f.name = cleanName(name, f.autoName);
  persist('favs'); done(); return f.name;
}
function removeFav(id) {
  const f = saved.favs.find(x => x.id === id); if (!f) return false;
  saved.favs = saved.favs.filter(x => x !== f);
  persist('favs'); done(`Removed ‘${f.name}’`); return true;
}
function addToColl(collId, favId) {
  const c = saved.colls.find(x => x.id === collId), f = findFav(favId); if (!c || !f) return false;
  const top = c.id === TOP10_ID;
  const r = addItem(c, f, top ? LIMITS.top10 : LIMITS.items);
  if (!r.ok) { toast(r.reason === 'dup' ? `Already in ${c.name}` : top ? 'Top 10 is full: remove one first.' : `${c.name} is full (${LIMITS.items} places): remove one first.`); return false; }
  saved.colls = saved.colls.map(x => x === c ? r.coll : x);
  persist('colls'); done(`Added to ${c.name}`); return true;
}
function newColl(name, items = [], okMsg = null) { // → the new collection, or null at the limit
  if (saved.colls.length >= LIMITS.colls) { toast(`Up to ${LIMITS.colls} collections: delete one first.`); return null; }
  const c = { id: newId(), name: uniqueName(cleanName(name, 'New collection'), saved.colls.map(x => x.name)), items };
  saved.colls = [...saved.colls, c];
  persist('colls'); done(okMsg ? okMsg(c) : ''); return c;
}
function renameColl(collId, name) {
  const c = saved.colls.find(x => x.id === collId); if (!c || c.id === TOP10_ID) return null;
  const n = uniqueName(cleanName(name, c.name), saved.colls.filter(x => x !== c).map(x => x.name));
  saved.colls = saved.colls.map(x => x === c ? { ...c, name: n } : x);
  persist('colls'); done(); return n;
}
function removeColl(collId) {
  const c = saved.colls.find(x => x.id === collId); if (!c || c.id === TOP10_ID) return false;
  saved.colls = saved.colls.filter(x => x !== c);
  persist('colls'); done(`Removed ‘${c.name}’`); return true;
}
function editColl(collId, fn) {
  const c = saved.colls.find(x => x.id === collId); if (!c) return false;
  const n = fn(c); if (n === c) return false;
  saved.colls = saved.colls.map(x => x === c ? n : x);
  persist('colls'); done(); return true;
}
function saveShared() {
  const s = saved.shared; if (!s) return null;
  // a link holds at most 50 items (LIMITS.linkItems), the same as a collection, so nothing is cut here
  const items = s.items.map(f => ({ ...JSON.parse(JSON.stringify(f)), id: newId() })); // a star still being checked keeps its flag
  return newColl(s.name, items, c => `Saved as ‘${c.name}’`);
}
function startListTour(items) {
  const list = (items || []).filter(f => f?.view && f.time);
  if (!list.length) { toast('Nothing to tour yet.'); return; }
  stopTour(); searchUI.close(); setClean(false);
  startTour(list.map(f => ({ caption: f.name, go: () => restoreFavorite(f, { fromTour: true }) })));
}
// Share a collection ({ name, items }) or one favorite as a link that carries the list itself.
async function shareSaved(x) {
  const items = Array.isArray(x?.items) ? x.items : x?.view ? [x] : [];
  if (!items.length) { toast('Nothing to share yet.'); return; }
  const title = typeof x.name === 'string' ? x.name : 'Cosmoscope';
  let url;
  try { url = location.origin + location.pathname + '#s=' + encodeShare({ name: title, items }); } catch { toast("This link couldn't be made."); return; }
  // the share sheet on phones and tablets only; elsewhere copy the link
  let touch = false; try { touch = matchMedia('(pointer: coarse)').matches; } catch { }
  if (touch && navigator.share) {
    try { await navigator.share({ title, url }); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); return; } catch { }
  toastLink(url); // no share sheet, no clipboard: show the link in a field it can be copied from
}

// ── star lookups: shared (or old) star items carry the star's catalog name; check it against the catalog ──
// → the star's index, null (not in the catalog), or undefined (needs the name index, not loaded yet).
// own: an item from this browser's own storage. Our own catalog build made its index, so it is trusted while
// idx < star count; the name index is never loaded for it (only shared items pay for that check).
function resolveStarRef(idx, name, own = false) {
  const N = starData?.N ?? 0;
  if (typeof name !== 'string') return idx < N ? idx : null;
  const rows = searchUI.rows();
  if (own && !rows) return idx < N ? idx : undefined;
  const namesAt = i => { const out = []; const q = starData.names.find(n => n[0] === i); if (q) out.push(q[1]); const r = rows?.[i]; if (r) out.push(...starNames(r)); return out; };
  if (idx < N && namesAt(idx).includes(name)) return idx;
  const q = starData.names.find(n => n[1] === name); if (q && q[0] < N) return q[0];
  if (!rows) return undefined;
  const m = starNameMap(rows, N);
  return m.best.get(name) ?? m.any.get(name) ?? null; // a star's first (best) name wins over its other names
}
// name → star index, built once per loaded name index (one pass), so a 50-item link costs 50 map lookups.
let nameMapFor = null, nameMap = null;
function starNameMap(rows, N) {
  if (nameMapFor !== rows) {
    const best = new Map(), any = new Map();
    for (let i = 0; i < rows.length && i < N; i++) {
      const ns = starNames(rows[i]);
      if (ns[0] && !best.has(ns[0])) best.set(ns[0], i);
      for (const n of ns) if (!any.has(n)) any.set(n, i);
    }
    nameMap = { best, any }; nameMapFor = rows;
  }
  return nameMap;
}
// → 'ok' | 'drop' | 'wait'; rewrites the star ids in place when the star moved to another index.
function resolveItem(f, own = false) {
  if (!f.needsLookup) return 'ok';
  const map = new Map();
  for (const id of [f.view.focus, f.view.anchor]) {
    if (!id || map.has(id)) continue;
    const idx = starIdxOf(id);
    if (idx === null) { // a story stop that didn't exist yet when the list loaded
      if (favKnownId(id) === true) continue;
      return saved.starsDone ? 'drop' : 'wait';
    }
    if (!starData?.pos) return saved.starsDone ? 'drop' : 'wait';
    const r = resolveStarRef(idx, f.starName, own);
    if (r === undefined) return 'wait';
    if (r === null) return 'drop';
    map.set(id, 'star:' + r);
  }
  if (map.has(f.view.focus)) f.view.focus = map.get(f.view.focus);
  if (map.has(f.view.anchor)) f.view.anchor = map.get(f.view.anchor);
  delete f.needsLookup; return 'ok';
}
// Resolve every waiting item. final: the name index failed, so waiting ones can't be checked (own ones are kept
// and go to their saved spot; shared ones are left out, with a toast).
let lookupLoading = false;
function resolveLookups(final = false) {
  try {
    let wait = false, dropShared = 0, dropOwn = 0; // wait: a SHARED item needs the name index
    const msgs = [];
    const sweep = (items, own) => items.filter(f => {
      const r = resolveItem(f, own);
      if (r === 'wait') { if (own) return true; if (final) { dropShared++; return false; } wait = true; return true; }
      // own items are only removed when the catalog really lacks them; if the star data failed this visit, keep them
      if (r === 'drop') { if (own && !starData?.pos) return true; own ? dropOwn++ : dropShared++; return false; }
      return true;
    });
    const anyFlag = list => list.some(f => f.needsLookup);
    let changed = false;
    if (saved.shared && anyFlag(saved.shared.items)) {
      saved.shared = { ...saved.shared, items: sweep(saved.shared.items, false) }; changed = true;
      if (!saved.shared.items.length) { saved.shared = null; msgs.push("This link couldn't be opened"); }
      else if (dropShared) msgs.push(`${dropShared === 1 ? 'A place' : dropShared + ' places'} in this link couldn't be found, so ${dropShared === 1 ? 'it was' : 'they were'} left out.`);
    }
    if (anyFlag(saved.favs)) { const n = saved.favs.length; saved.favs = sweep(saved.favs, true); changed = true; if (saved.favs.length !== n) persist('favs'); }
    if (saved.colls.some(c => anyFlag(c.items))) {
      const before = saved.colls.reduce((n, c) => n + c.items.length, 0);
      saved.colls = saved.colls.map(c => anyFlag(c.items) ? { ...c, items: sweep(c.items, true) } : c); changed = true;
      if (saved.colls.reduce((n, c) => n + c.items.length, 0) !== before) persist('colls');
    }
    if (dropOwn) msgs.push(`${dropOwn === 1 ? 'A saved place' : dropOwn + ' saved places'} couldn't be found in the catalog and ${dropOwn === 1 ? 'was' : 'were'} removed.`);
    if (changed || saved.warnNow) done(msgs.join(' '), 5000);
    if (wait && !final && !lookupLoading && starData?.pos) { // the checks need the star name index: load it now
      lookupLoading = true;
      searchUI.loadNames().then(rows => { lookupLoading = false; if (!rows) resolveLookups(true); }) // success: namesLoaded() runs it
        .catch(() => { lookupLoading = false; resolveLookups(true); });
    }
  } catch (err) { console.warn('Star lookup failed', err); }
}

// ── shared links: #s=1.<data> ──
function takeShareHash() { // read once, then clear it so a reload doesn't open it again
  try {
    if (!location.hash.startsWith('#s=')) return null;
    const s = location.hash.slice(3);
    history.replaceState(null, '', location.pathname + location.search);
    return s;
  } catch { return null; }
}
let pendingShare = takeShareHash();
addEventListener('hashchange', () => { const s = takeShareHash(); if (s === null) return; if (saved.starsDone) openShared(s); else pendingShare = s; });
function openShared(str) {
  const res = decodeShare(str, favOpts());
  if (!res) { toast("This link couldn't be opened"); return; }
  // a star whose saved name we couldn't confirm yet gets checked against the catalog before it is trusted
  for (const f of res.items) if (typeof f.starName === 'string' && (starIdxOf(f.view.focus) !== null || starIdxOf(f.view.anchor) !== null)) f.needsLookup = true;
  saved.shared = res;
  setClean(false); stopTour();
  searchUI.open('saved');
  toast(`Shared with you: ‘${res.name}’`);
  savedChanged(); resolveLookups();
}
// Own lists load right away (localStorage is synchronous), so limits always see the real lists and every save is
// written at once. Story stops and stars only exist once the star data is in: until then their items carry
// needsLookup and are confirmed by resolveLookups() afterwards. Shared links are opened then too.
saved.favs = loadFavs(store, favOpts());
saved.colls = loadColls(store, favOpts());
saved.loaded = true;
function afterStars() {
  saved.starsDone = true;
  resolveLookups();
  if (pendingShare !== null) { const s = pendingShare; pendingShare = null; openShared(s); }
}
// Once this card's place is saved, ☆ becomes ★ and another tap only says so (until another card opens).
function setCardSaved(on) {
  cardSaved = on; const b = $('#cardSave');
  b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'Saved' : 'Save this place'); b.title = on ? 'Saved' : 'Save this place';
}
$('#cardSave').onclick = () => { if (cardSaved) { toast('Already saved'); return; } if (saveCurrent(cardObjId)) setCardSaved(true); };
// Another tab changed the saved lists: take its version (it wrote last) and redraw.
addEventListener('storage', e => {
  if (e.key !== null && e.key !== FAV_KEY && e.key !== COLL_KEY) return;
  try {
    saved.favs = loadFavs(store, favOpts());
    saved.colls = loadColls(store, favOpts());
    resolveLookups(); savedChanged();
  } catch (err) { console.warn(err); }
});

// ───────────────────────── new worlds (live NASA feed) ─────────────────────────
// Planets NASA added in the last 90 days. Each placed host is a glowing dot at NASA's
// position plus a pulsing ring (both a fixed pixel size, so "not to scale").
const NW_FEED_KEY = 'cosmo.newPlanets', NW_SEEN_KEY = 'cosmo.lastSeenBatch';
const nwGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const nwSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
const newWorlds = { planets: [], hosts: [], noteOn: false, ringMat: null, userActed: false };
// Any input since load means the visitor has started exploring: never hijack their camera.
for (const ev of ['pointerdown', 'wheel', 'keydown']) addEventListener(ev, () => { newWorlds.userActed = true; }, { capture: true, passive: true });
const nwReducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
// The automatic fly-in may only start from the untouched opening shot.
const nwIdleAtStart = () => cam.focusId === 'earth' && !cam.anim && !newWorlds.userActed && !card.classList.contains('open')
  && !['#sheet', '#about', '#newList', '#searchPanel'].some(sel => $(sel)?.classList.contains('open'));
const NW_RING_FRAG = `
  uniform vec3 uColor; uniform float uOpacity;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    float d = length(gl_PointCoord-0.5)*2.0;
    float a = smoothstep(0.74, 0.84, d) * (1.0 - smoothstep(0.88, 0.98, d)) * uOpacity;
    if (a < 0.005) discard;
    gl_FragColor = vec4(uColor, a);
  }`;
const nwHasDist = p => Number.isFinite(p.sy_dist) && p.sy_dist > 0 && Number.isFinite(p.ra) && Number.isFinite(p.dec);
const nwValid = list => inWindow(list.filter(p => p && typeof p.pl_name === 'string' && p.pl_name), Date.now());
async function loadNewPlanets() {
  let planets = null;
  try {
    const r = await fetch('new_planets.json', { cache: 'no-cache' });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j?.planets)) planets = j.planets; }
  } catch { }
  if (planets) { planets = nwValid(planets); nwSet(NW_FEED_KEY, JSON.stringify(planets)); return planets; }
  try { const c = JSON.parse(nwGet(NW_FEED_KEY)); if (Array.isArray(c)) return nwValid(c); } catch { }
  return [];
}
function buildNewWorlds(planets) {
  const seen = new Set();
  newWorlds.planets = planets.filter(p => !seen.has(p.pl_name) && seen.add(p.pl_name));
  newWorlds.ringMat = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 44 }, uColor: { value: new THREE.Color('#ffd27a') }, uOpacity: { value: 0 } },
    vertexShader: MARKER_VERT, fragmentShader: NW_RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const byHost = new Map();
  for (const p of newWorlds.planets) {
    if (!nwHasDist(p)) continue;
    const key = `${p.hostname}|${p.ra}|${p.dec}|${p.sy_dist}`;
    let h = byHost.get(key);
    if (!h) {
      const pos = radec(p.ra, p.dec, p.sy_dist * PC_AU);
      const dot = makeMarker(new THREE.Color().setRGB(...teffToRGB(p.st_teff)), 13);
      const ring = new THREE.Points(dot.geometry, newWorlds.ringMat); ring.frustumCulled = false; ring.renderOrder = 5;
      const group = new THREE.Group(); group.position.copy(pos); group.add(ring, dot); group.visible = false; scene.add(group);
      h = { pos, dot, group, planets: [], vis: 0 };
      byHost.set(key, h); newWorlds.hosts.push(h);
    }
    h.planets.push(p);
    focusables['new:' + p.pl_name] = { name: p.pl_name, getPos: o => o.copy(h.pos), radius: 0.01, story: planetStory(p), defaultDist: 3000 };
  }
  for (const h of newWorlds.hosts) {
    const first = h.planets[0];
    const host = typeof first.hostname === 'string' ? first.hostname : '';
    const letters = h.planets.map(p => host && p.pl_name.startsWith(host + ' ') ? p.pl_name.slice(host.length + 1) : null);
    const text = h.planets.length > 1 && letters.every(Boolean) ? `${host} ${letters.join(' & ')}` : h.planets.map(p => p.pl_name).join(' & ');
    // prio -1: below bright-star names (prio 0), so NEW labels yield to them when crowded
    addLabel({ text: escapeHTML(text), sub: 'NEW', cls: 'newp', prio: -1, getPos: o => o.copy(h.pos),
      visible: () => settings.labels && h.vis > 0.3 && Math.log10(camDistTo(h.pos)) < 8.6,
      onTap: () => flyTo('new:' + first.pl_name) });
  }
}
function updateNewWorlds(now, Lc) {
  if (!newWorlds.hosts.length) return;
  const pr = renderer.getPixelRatio();
  // nearby stars → edge of the Milky Way; gone before galaxy scale, where ~30 rings would pile up into one blob at the Sun
  const zoomVis = smooth(4.2, 5.0, Lc) * (1 - smooth(9.5, 10.1, Lc));
  let maxVis = 0;
  for (const h of newWorlds.hosts) {
    const near = 1 - smooth(4.6, 5.4, Math.log10(Math.max(camera.position.distanceTo(h.pos), 1e-9)));
    h.vis = Math.max(zoomVis, near);
    h.group.visible = h.vis > 0.01;
    h.dot.material.uniforms.uOpacity.value = h.vis;
    h.dot.material.uniforms.uSize.value = 13 * pr;
    if (h.vis > maxVis) maxVis = h.vis;
  }
  newWorlds.ringMat.uniforms.uOpacity.value = (0.55 + 0.35 * Math.sin(now * 0.0026)) * maxVis; // slow ~2.4 s pulse
  newWorlds.ringMat.uniforms.uSize.value = 44 * pr;
  newWorlds.noteOn = maxVis > 0.3;
}
function buildNewList() {
  const list = $('#newItems'); list.textContent = '';
  for (const p of newWorlds.planets) {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.className = 'nwRow';
    const t = document.createElement('span'); t.className = 'nwName'; t.textContent = p.pl_name;
    const s = document.createElement('span'); s.className = 'nwSub'; s.textContent = planetSubtitle(p) || 'Distance not measured';
    b.append(t, s);
    const fac = typeof p.disc_facility === 'string' ? p.disc_facility.replace(/<[^>]*>/g, '').trim() : '';
    if (fac) { const f = document.createElement('span'); f.className = 'nwFac'; f.textContent = fac; b.append(f); }
    b.onclick = () => {
      $('#newList').classList.remove('open');
      if (focusables['new:' + p.pl_name]) flyTo('new:' + p.pl_name);
      else showCard(planetStory(p), cam.focusId, null); // no distance: card only, no flight
    };
    li.append(b); list.append(li);
  }
}
// Phones: keep the pill on the same row as Search, Tour and Settings; drop the word "NEW" if it would wrap.
function fitNewBtn() {
  const btn = $('#newBtn'); btn.classList.remove('compact');
  if ($('#settingsBtn').getBoundingClientRect().top > btn.getBoundingClientRect().top + 4) btn.classList.add('compact');
}
function startNewFlyIn(newest) {
  const closest = list => list.filter(nwHasDist).sort((a, b) => a.sy_dist - b.sy_dist)[0];
  // Introduce a planet from the batch that triggered the fly-in. If nobody in that batch has a
  // measured distance, fall back to the closest placed planet overall (the batch is still marked seen).
  const target = closest(newWorlds.planets.filter(p => p.first_release === newest)) || closest(newWorlds.planets);
  if (!target) return;
  toast('New world confirmed');
  if (nwReducedMotion()) return; // caption only: no automatic camera flight
  flyTo('new:' + target.pl_name);
  const anim = cam.anim;
  const cancel = e => {
    if (e.target instanceof Node && card.contains(e.target)) return; // More / Listen / close on the card are not "stop"
    removeEventListener('pointerdown', cancel, true); removeEventListener('wheel', cancel, true); removeEventListener('keydown', cancel, true);
    if (!anim || cam.anim !== anim) return; // flight already finished or replaced
    // stop right here: hold the current view point instead of snapping on to the planet
    cam.anim = null; setFreeFocus(null, cam.target);
    card.classList.remove('open'); stopSpeaking();
  };
  addEventListener('pointerdown', cancel, true); addEventListener('wheel', cancel, true); addEventListener('keydown', cancel, true);
}
async function initNewWorlds(starsReady) {
  try {
    const introGone = new Promise(r => setTimeout(r, 2800));
    await starsReady;
    const planets = await loadNewPlanets();
    if (!planets.length) return;
    buildNewWorlds(planets);
    buildNewList();
    $('#newCount').textContent = newWorlds.planets.length;
    $('#newBtn').setAttribute('aria-label', `${newWorlds.planets.length} new worlds from NASA`);
    $('#newBtn').hidden = false;
    fitNewBtn(); addEventListener('resize', fitNewBtn);
    $('#newBtn').onclick = () => { searchUI.close(); $('#sheet').classList.remove('open'); $('#about').classList.remove('open'); $('#newList').classList.toggle('open'); };
    $('#newClose').onclick = () => $('#newList').classList.remove('open');
    await introGone;
    const newest = newestRelease(newWorlds.planets);
    // If the visitor is already exploring, leave the batch unseen so the fly-in happens next visit.
    if (shouldFlyIn(newest, nwGet(NW_SEEN_KEY), !!tour) && nwIdleAtStart()) { nwSet(NW_SEEN_KEY, newest); startNewFlyIn(newest); }
  } catch { /* the feed is optional: stay silent */ }
}

// ───────────────────────── frame loop ─────────────────────────
const clock = { last: performance.now() };
const tmpS = V();
function layerFades(Lc) {
  starsPoints && (starsPoints.material.uniforms.uOpacity.value = 1 - smooth(8.4, 9.1, Lc));
  const solarVis = 1 - smooth(4.4, 5.3, Lc);
  solar.group.visible = solarVis > 0.01;
  for (const b of solar.bodies) b.marker.material.uniforms.uOpacity.value = solarVis;
  orbitRings.visible = settings.orbits && settings.view === 'sun';
  orbitRings.children.forEach(l => l.material.opacity = 0.16 * solarVis);
  // Adjacent layers overlap so some structure is always on screen (see docs/superpowers/specs/2026-11-19-free-zoom-checkpoints-design.md).
  const mw = smooth(7.6, 8.6, Lc) * (1 - smooth(13.2, 14.0, Lc));
  milkyWay.visible = mw > 0.01; milkyWay.children[0].material.uniforms.uOpacity.value = mw * 0.42;
  sunPath.material.opacity = 0.45 * smooth(8.6, 9.4, Lc) * (1 - smooth(10.6, 11.2, Lc));
  sunHereMarker.material.uniforms.uOpacity.value = smooth(4.9, 5.4, Lc) * (1 - smooth(12.2, 12.9, Lc));
  const lg = smooth(9.6, 10.4, Lc) * (1 - smooth(13.8, 14.6, Lc));
  localGroup.visible = lg > 0.01; localGroup.children.forEach(g => g.children[0].material.uniforms.uOpacity.value = lg * 0.7);
  const glow = smooth(9.8, 10.6, Lc) * (1 - smooth(14.2, 15.0, Lc)); // per-galaxy fade by apparent size is in the shader
  galaxyGlow.visible = glow > 0.01; galaxyGlow.material.uniforms.uOpacity.value = glow * 0.9;
  const web = smooth(10.6, 12.2, Lc);
  cosmicWeb.visible = web > 0.01; cosmicWeb.material.uniforms.uOpacity.value = web * 0.9;
  const dust = 1 - smooth(15.42, 15.6, Lc); // none outside the observable-universe sphere
  starDust.visible = dust > 0.01; starDust.material.uniforms.uOpacity.value = dust;
  const c = smooth(14.6, 15.4, Lc); cmb.visible = c > 0.01; cmb.material.uniforms.uOpacity.value = c * 0.55;
  return { solarVis };
}
function updateNotes(Lc) {
  const notes = [];
  if (Lc < 5.3) notes.push('Planet sizes & glows not to scale');
  if (settings.view === 'galaxy' && Lc < 8.5) {
    const f = focusables[cam.focusId]; const sys = f?.sys || solar; const k = sys.visFactor ?? 1;
    notes.push(k < 0.99 ? `Motion through the galaxy slowed ${Math.round(1 / k)}× so the spirals show` : 'Real speed through the galaxy');
  }
  if (Lc > 7.6 && Lc < 9.8) notes.push('Milky Way shape is an illustration');
  else if (Lc >= 9.8 && Lc < 15.0) notes.push('Galaxy shapes & glows are illustrations');
  if (Lc > 10.3 && Lc < 11.6) notes.push('Background dust is decorative'); // where it is most of what you see
  if (Lc > 10.9) notes.push('Galaxy web is an illustration');
  if (newWorlds.noteOn) notes.push('New-world markers not to scale');
  if (starTrails?.visible && starData?.trailYears) notes.push(`Star trails: last ${fmtYears(starData.trailYears)}`);
  $('#note').textContent = notes.join(' · ');
}
function fmtYears(y) { if (y < 1e3) return Math.round(y) + ' years'; if (y < 1e6) return (y / 1e3).toFixed(y < 1e4 ? 1 : 0) + 'k years'; return (y / 1e6).toFixed(1) + ' million years'; }
function fmtDist(au) {
  const km = au * AU_KM;
  if (km < 1e6) return Math.round(km).toLocaleString() + ' km';
  if (au < 2000) return (au < 10 ? au.toFixed(2) : Math.round(au).toLocaleString()) + ' AU';
  const ly = au / LY_AU;
  if (ly < 1e6) return (ly < 10 ? ly.toFixed(2) : Math.round(ly).toLocaleString()) + ' light-years';
  if (ly < 1e9) return (ly / 1e6).toFixed(ly < 1e7 ? 2 : 0) + ' million light-years';
  return (ly / 1e9).toFixed(1) + ' billion light-years';
}
const tmpAnchor = V();
function scaleName(Ld, Lc) {
  let f = focusables[cam.focusId];
  if (f?.free) { // after free zoom: name the object you left while still near it (within 3× its usual viewing distance)
    const a = free.anchor ? focusables[free.anchor] : null; f = null;
    if (a) { a.getPos(tmpAnchor); const dist = camera.position.distanceTo(tmpAnchor); if (dist < (a.defaultDist || 0) * 3) { f = a; Ld = Math.log10(Math.max(dist, 1e-12)); } }
  }
  if (f && ((f.sys || f.starIdx !== undefined) ? Ld < 4.6 : Ld < Math.log10((f.radius || 1e-6) * 40)) && (Lc < 8 || f.sys === undefined && Ld < Math.log10((f.radius || 1) * 40))) return f.name;
  return scaleNameAt(Ld, Lc, f);
}
// The scale part of scaleName (no object name): Ld = log10 view distance, Lc = log10 camera distance from the Sun.
function scaleNameAt(Ld, Lc, f = null) {
  const Lx = Math.max(Ld, Lc > 4 ? Lc - 0.3 : Ld);
  if (Lx < -1.2) return f ? (f.name || 'Planet') + ' & neighborhood' : 'Solar System'; if (Lx < 2.6) return 'Solar System'; Lc = Lx;
  if (Lc < 5.4) return 'Outer Solar System'; if (Lc < 8.3) return 'Nearby stars'; if (Lc < 10.3) return 'Milky Way';
  if (Lc < 12.4) return 'Local Group'; if (Lc < 14.4) return 'Cosmic web'; return 'Observable universe';
}

let frames = 0, fpsT = performance.now(), fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - clock.last) / 1000); clock.last = now;
  if (!time.paused) time.ms += dtReal * 1000 * SPEEDS[time.speedIdx][1] * time.dir;
  if (time.speedIdx === 0 && time.dir > 0 && !time.paused && Math.abs(time.ms - Date.now()) < 5000) time.ms = Date.now();
  const t = simDays();

  // bodies
  for (const sys of systems) {
    for (const b of sys.bodies) {
      b.posAt(t, b.pos); if (sys.isStory) b.pos.add(sys.hostPos);
      const local = sys.isStory ? tmpS.copy(b.pos).sub(sys.hostPos) : b.pos;
      (b.holder || b.mesh).position.copy(local);
      if (!b.holder) b.marker.position.copy(local);
    }
  }
  // spins & orientations
  const date = new Date(Math.min(Math.max(time.ms, -8.64e15), 8.64e15));
  for (const b of solar.bodies) {
    if (b.id === 'earth') {
      let gst = 0; try { gst = Astro.SiderealTime(date); } catch { }
      b.frame.rotation.set(0, 0, gst * 15 * deg);
      b.mesh.userData.sunDir.value.copy(b.pos).negate().normalize();
    } else if (b.id === 'moon') {
      const toEarth = tmpS.copy(earthBody.pos).sub(b.pos).normalize();
      b.mesh.quaternion.setFromUnitVectors(V(1, 0, 0), toEarth);
    } else if (b.spinH) {
      b.mesh.rotation.set(0, 0, ((t * 24 / b.spinH) % 1) * Math.PI * 2);
    }
  }
  updateCamera(now);
  updateFocusRing(now, dtReal);
  const Lc = Math.log10(Math.max(camera.position.length(), 1e-9)); camLogSun = Lc;
  const camDistTarget = Math.pow(10, cam.logD);

  // marker sizes: shrink planet markers when we're close enough to see the sphere
  for (const sys of systems) for (const b of sys.bodies) {
    const d = camera.position.distanceTo(b.pos);
    const px = b.radius / d * pxPerUnit / renderer.getPixelRatio();
    const base = b.marker.userData.base ?? (b.marker.userData.base = b.marker.material.uniforms.uSize.value);
    b.marker.material.uniforms.uSize.value = base * renderer.getPixelRatio() * (1 - smooth(2, 10, px));
    if (sys.isStory) {
      const vis = 1 - smooth(5.6, 7.2, Math.log10(d));
      b.marker.material.uniforms.uOpacity.value = vis;
      sys.group.visible = vis > 0.01;
      if (b === sys.bodies[0]) sys.vis = vis;
    }
  }
  if (starsPoints) { // see loadStars: story stars back as points while their system is not drawn
    // Hand over at half fade (not when the system is fully gone), so e.g. Betelgeuse doesn't dim between ~100 and 250 ly.
    let changed = false;
    for (const sys of systems) {
      const want = !sys.group.visible || (sys.vis ?? 1) < 0.5;
      if (!sys.hiddenIdx || sys.pointOn === want) continue;
      sys.pointOn = want; changed = true;
      for (const i of sys.hiddenIdx) starData.mag[i] = sys.pointOn ? starData.buf[i * 8 + 6] : 99;
    }
    if (changed) starsPoints.geometry.attributes.absmag.needsUpdate = true;
  }
  const { solarVis } = layerFades(Lc);
  updateNewWorlds(now, Lc);
  // trails
  for (const sys of systems) {
    const host = sys.isStory ? sys.hostPos : solar.bodies[0].pos;
    const dh = camera.position.distanceTo(host);
    if ((sys.isStory && Math.log10(dh) < 5.5) || (!sys.isStory && solarVis > 0.01)) {
      if (!sys.trails || frames % 1 === 0) updateTrails(sys, t, dh);
      sys.trails.forEach(l => { l.material.opacity = sys.isStory ? 1 : solarVis; });
    } else if (sys.trails) sys.trails.forEach(l => l.visible = false);
  }
  // stars
  if (starsPoints) {
    starsPoints.material.uniforms.uDt.value = simYears();
    starsPoints.material.uniforms.uLim.value = 6.5 + clamp((Lc - 4.0) * 1.25, 0, 5.5);
    starsPoints.material.uniforms.uPx.value = renderer.getPixelRatio() * 0.75;
  }
  updateStarTrails(cam.logD, cam.target);
  updateConstellations(Lc);
  // point materials scale
  const pS = pxPerUnit;
  milkyWay.children[0].material.uniforms.uScale.value = pS;
  localGroup.children.forEach(g => g.children[0].material.uniforms.uScale.value = pS);
  cosmicWeb.material.uniforms.uScale.value = pS;
  galaxyGlow.material.uniforms.uScale.value = pS; galaxyGlow.material.uniforms.uPx.value = renderer.getPixelRatio();
  starDust.material.uniforms.uPx.value = renderer.getPixelRatio();

  updateStarLabelSelection();
  updateLabels();
  // HUD
  const viewW = 2 * camDistTarget * Math.tan(camera.fov * deg / 2) * camera.aspect;
  $('#scale').textContent = scaleName(cam.logD, Lc);
  $('#scaleDist').textContent = `View ≈ ${fmtDist(viewW)} across`;
  if (frames % 6 === 0) {
    $('#date').textContent = fmtDate(time.ms);
    const sp = SPEEDS[time.speedIdx][1]; const yrs = time.ms / (DAY_MS * YEAR_D) + 1970;
    const clockStr = (sp < 86400 * 2 && Math.abs(yrs - 2000) < 200000) ? new Date(time.ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: sp <= 60 ? '2-digit' : undefined }) + '  ·  ' : '';
    $('#speed').textContent = clockStr + speedText;
  }
  $('#live').classList.toggle('on', time.speedIdx === 0 && time.dir > 0 && !time.paused && Math.abs(time.ms - Date.now()) < 6000);
  if (frames % 15 === 0) updateNotes(Lc);
  if (tour && now > tour.next && !cam.anim) tourStep();

  renderer.render(scene, camera);
  frames++;
  if (now - fpsT > 2000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; window.__fps = fps; }
}

// ───────────────────────── boot ─────────────────────────
addEventListener('resize', resize); resize();
// opening shot: hovering over Earth, sunlit side with a sliver of night
{
  earthBody.posAt(simDays(), earthBody.pos);
  const sunDir = earthBody.pos.clone().negate().normalize();
  const side = new THREE.Vector3().crossVectors(sunDir, V(0, 0, 1)).normalize();
  const dir = sunDir.clone().multiplyScalar(Math.cos(55 * deg)).addScaledVector(side, Math.sin(55 * deg)).addScaledVector(V(0, 0, 1), 0.35).normalize();
  const m = new THREE.Matrix4().lookAt(dir, V(), V(0, 0, 1)); cam.q.setFromRotationMatrix(m);
  cam.focusId = 'earth'; cam.logD = Math.log10(earthBody.radius * 3.4);
}
updateTimeUI();
requestAnimationFrame(frame);
const starsReady = loadStars().then(() => { document.body.classList.add('ready'); searchUI.refresh(); }).catch(err => { console.error(err); document.body.classList.add('ready'); toast('Star catalog could not load.'); });
setTimeout(() => { $('#intro').classList.add('gone'); }, 2600);
setTimeout(hideHint, 11000);
initNewWorlds(starsReady);
starsReady.then(afterStars);
window.__cosmo = { cam, flyTo, settings, time, setSpeed, focusables, saved: savedAPI };
