import * as THREE from 'three';
import * as Astro from 'astronomy-engine';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { STORIES } from './stories.js';

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
function makeStarSystem(def) {
  const group = new THREE.Group(); scene.add(group);
  const sys = { id: def.id, story: def.story, bodies: [], group, hostPos: def.pos.clone(), vHelio: def.vHelio || V(), isStory: true };
  group.position.copy(sys.hostPos);
  sys.host = () => sys.hostPos;
  const [e1, e2] = planeBasis(def.normal);
  for (const s of def.bodies) {
    const isStar = !!s.star;
    const mesh = new THREE.Mesh(sphereGeo(s.r, 40), isStar ? starMaterial(s.color) : new THREE.MeshLambertMaterial({ color: s.color, emissive: new THREE.Color(s.color).multiplyScalar(0.12) }));
    const marker = makeMarker(s.color, (s.marker || (isStar ? 16 : 7)) * (isStar ? 1.7 : 1));
    const holder = new THREE.Group(); holder.add(mesh, marker); group.add(holder);
    let relFn;
    if (s.binary) { const k = s.binary.k; const base = keplerRel(s.binary.a, s.binary.e, s.binary.P, s.binary.phase || 0, e1, e2); relFn = (t, o) => base(t, o).multiplyScalar(k); }
    else if (s.orbit) relFn = keplerRel(s.orbit.a, s.orbit.e || 0, s.orbit.P, s.orbit.phase || 0, e1, e2);
    else relFn = (t, o) => o.set(0, 0, 0);
    const b = { id: def.id + ':' + s.name, name: s.name, color: s.color, radius: s.r, mesh, holder, marker, isStar,
      P: s.binary ? s.binary.P : (s.orbit ? s.orbit.P : 0), orbitR: s.binary ? s.binary.a * Math.abs(s.binary.k) * 1.5 : (s.orbit ? s.orbit.a : 0), posAt: relFn, pos: V() };
    sys.bodies.push(b);
  }
  systems.push(sys);
  return sys;
}
function initStorySystems() {
  const findStar = name => starData.names.find(n => n[1] === name);
  const starPos = idx => V(starData.buf[idx * 8], starData.buf[idx * 8 + 1], starData.buf[idx * 8 + 2]).multiplyScalar(PC_AU);
  const starVel = idx => V(starData.buf[idx * 8 + 3], starData.buf[idx * 8 + 4], starData.buf[idx * 8 + 5]).multiplyScalar(PC_AU / YEAR_D); // AU/day
  const hide = idx => { starData.hidden.push(idx); };
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
    hide(acA[0]); if (acB) hide(acB[0]);
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
    hide(si[0]);
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
    hide(be[0]);
  }
  for (const d of defs) {
    const sys = makeStarSystem(d);
    focusables[d.id] = { name: d.name, getPos: o => o.copy(sys.hostPos), radius: 0.02, story: d.story, defaultDist: d.defaultDist, sys };
  }
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
const settings = { view: 'sun', trailLen: 0.6, trailRange: 0.5, sunSpeed: 0.1, autoSpiral: true, labels: true, orbits: true };
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

// ───────────────────────── camera control ─────────────────────────
const cam = {
  target: V(), focusId: 'earth', logD: 0, q: new THREE.Quaternion(), vel: { x: 0, y: 0 }, anim: null,
};
const MIN_LOG = Math.log10(1e-6), MAX_LOG = Math.log10(UNIVERSE_R * 3.2);
function focusPos(id, out) { const f = focusables[id]; return f ? f.getPos(out) : out.set(0, 0, 0); }
function flyTo(id, dist, dur, lookFrom) {
  const f = focusables[id]; if (!f) return;
  const fromPos = cam.target.clone(); const toPos = focusPos(id, V());
  const fromLog = cam.logD, toLog = Math.log10(dist ?? f.defaultDist);
  const gap = fromPos.distanceTo(toPos);
  const peak = gap > 0 ? Math.log10(gap * 1.8) : -99;
  const bump = Math.max(0, peak - Math.max(fromLog, toLog));
  const span = Math.abs(toLog - fromLog) + bump * 2;
  let toQ = null;
  if (lookFrom) { const m = new THREE.Matrix4().lookAt(lookFrom.clone().normalize(), V(), ECL_N.clone().cross(lookFrom).lengthSq() > 1e-6 ? ECL_N : V(0, 1, 0)); toQ = new THREE.Quaternion().setFromRotationMatrix(m); }
  cam.anim = { id, fromPos, fromLog, toLog, bump, t0: performance.now(), dur: dur ?? clamp(1200 + span * 260, 1400, 5200), fromQ: cam.q.clone(), toQ };
  cam.focusId = id;
  showCard(f.story ? STORIES[f.story] : null, id);
}
function flyToStar(idx) {
  const n = starData.names.find(x => x[0] === idx);
  const id = 'star:' + idx;
  const p = V(starData.pos[idx * 3], starData.pos[idx * 3 + 1], starData.pos[idx * 3 + 2]);
  const v = V(starData.vel[idx * 3], starData.vel[idx * 3 + 1], starData.vel[idx * 3 + 2]);
  focusables[id] = { name: n ? n[1] : 'Star', getPos: o => o.copy(p).addScaledVector(v, simYears()), radius: 0.01, defaultDist: 40, starIdx: idx };
  flyTo(id);
  showCard(starStory(idx), id);
}
function starStory(idx) {
  const n = starData.names.find(x => x[0] === idx) || [idx, 'Unnamed star', 0, ''];
  const ly = n[2]; const sp = (n[3] || '').trim(); const cls = sp[0] || '';
  const hooks = { O: 'Blazing hot, blue, and short-lived.', B: 'Hot, blue-white, and young.', A: 'A brilliant white star.', F: 'A bright yellow-white star.', G: 'A star a lot like our Sun.', K: 'An orange star with a very long life ahead.', M: 'A cool red star.' };
  const year = new Date().getFullYear() - Math.round(ly);
  const facts = [`About ${ly.toLocaleString(undefined, { maximumFractionDigits: 1 })} light-years away.`];
  if (ly > 1) facts.push(year > 0 ? `The light you see from it left around the year ${year}.` : `The light you see left about ${Math.round(ly).toLocaleString()} years ago, around ${Math.abs(year).toLocaleString()} BCE.`);
  if (sp) facts.push(`Spectral type ${sp}.`);
  return { title: n[1], sub: `${ly.toLocaleString(undefined, { maximumFractionDigits: 1 })} light-years`, hook: hooks[cls] || 'One of the stars around us.', facts, source: 'HYG Database v4.1 (CC BY-SA 4.0)' };
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  const d = Math.pow(10, cam.logD);
  const off = V(0, 0, d).applyQuaternion(cam.q);
  camera.position.copy(cam.target).add(off);
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
const drag = { active: false, pts: new Map(), lastDist: 0, moved: 0 };
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); drag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag.active = true; drag.moved = 0;
  cam.vel.x = cam.vel.y = 0; if (cam.anim && drag.pts.size === 1) { /* allow looking around during flight */ }
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()]; drag.lastDist = Math.hypot(a.x - b.x, a.y - b.y); }
  hideHint();
});
canvas.addEventListener('pointermove', e => {
  if (!drag.pts.has(e.pointerId)) return;
  const p = drag.pts.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (drag.pts.size === 1) {
    const s = 3.2 / innerHeight; rotateBy(dx * s, dy * s); cam.vel.x = dx * s; cam.vel.y = dy * s; drag.moved += Math.abs(dx) + Math.abs(dy);
  } else if (drag.pts.size === 2) {
    const [a, b] = [...drag.pts.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (drag.lastDist > 0) zoomBy(-Math.log10(dist / drag.lastDist) * 2.2);
    drag.lastDist = dist;
  }
});
const endPtr = e => { drag.pts.delete(e.pointerId); if (drag.pts.size === 0) drag.active = false; drag.lastDist = 0; if (drag.pts.size === 1) cam.vel.x = cam.vel.y = 0; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)); hideHint(); }, { passive: false });
let lastTap = 0;
canvas.addEventListener('pointerup', e => { if (drag.moved < 6) { const t = performance.now(); if (t - lastTap < 300) zoomBy(-0.6); lastTap = t; } });
function zoomBy(dLog) { if (cam.anim) { cam.anim.toLog += dLog; } else cam.logD += dLog; }
addEventListener('keydown', e => {
  if (e.key === '+' || e.key === '=') zoomBy(-0.25); if (e.key === '-') zoomBy(0.25);
  if (e.key === ' ') { togglePause(); e.preventDefault(); }
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
  for (const id of ['alphacen', 'sirius', 'trappist', 'betelgeuse']) {
    const f = focusables[id]; if (!f) continue; const s = STORIES[f.story];
    addLabel({ text: s.title.toUpperCase(), sub: s.sub, cls: 'story', prio: 4,
      getPos: o => f.getPos(o),
      visible: () => { const d = camDistTo(f.getPos(tmpL)); const L = Math.log10(d); return L > 2.2 && L < 8.6 && camLogSun > 4.2; },
      onTap: () => flyTo(id) });
  }
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
let cardStoryKey = null, cardFocusId = null;
function showCard(story, focusId) {
  cardFocusId = focusId;
  if (!story) { card.classList.remove('open'); return; }
  cardStoryKey = story;
  $('#cardTitle').textContent = story.title.toUpperCase();
  $('#cardSub').textContent = story.sub;
  $('#cardHook').textContent = story.hook;
  $('#cardFacts').innerHTML = story.facts.map(f => `<li>${f}</li>`).join('');
  $('#cardSource').textContent = 'Source: ' + story.source;
  $('#cardNote').textContent = story.illustrative || '';
  $('#cardNote').style.display = story.illustrative ? '' : 'none';
  card.classList.add('open'); card.classList.toggle('collapsed', innerWidth < 820); syncMore();
  stopSpeaking();
}
$('#cardClose').onclick = () => { card.classList.remove('open'); stopSpeaking(); };
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

function solarLook() { // above the plane of the planets, looking down at ~35°
  const side = new THREE.Vector3().crossVectors(ECL_N, V(1, 0, 0)).normalize();
  return ECL_N.clone().multiplyScalar(Math.sin(38 * deg)).addScaledVector(side, Math.cos(38 * deg));
}
function galaxyLook() { // from above the disk, tilted a little, with the Sun toward the viewer
  return NGP.clone().multiplyScalar(Math.sin(62 * deg)).addScaledVector(GC_DIR.clone().negate(), Math.cos(62 * deg));
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
function fmtDate(ms) {
  const yrs = ms / (DAY_MS * YEAR_D) + 1970;
  if (Math.abs(yrs - 2000) < 200000) {
    const d = new Date(ms);
    if (SPEEDS[time.speedIdx][1] < 31557600 * 2) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const y = Math.round(yrs);
  return y > 0 ? `Year ${y.toLocaleString()}` : `${Math.abs(y).toLocaleString()} BCE`;
}

// view toggle
document.querySelectorAll('#viewSeg button').forEach(b => b.onclick = () => {
  settings.view = b.dataset.v; document.querySelectorAll('#viewSeg button').forEach(x => x.classList.toggle('sel', x === b));
  toast(settings.view === 'galaxy' ? 'Galaxy view: watch everything get dragged along with the Sun.' : 'Sun view: orbits as seen riding along with the Sun.');
  if (settings.view === 'galaxy' && time.speedIdx < 4) setSpeed(5);
});
// settings sheet
$('#settingsBtn').onclick = () => $('#sheet').classList.toggle('open');
$('#sheetClose').onclick = () => $('#sheet').classList.remove('open');
const bindRange = (id, key, fmt) => { const el = $(id); const out = $(id + 'Out'); const upd = () => { settings[key] = parseFloat(el.value); out.textContent = fmt(settings[key]); }; el.oninput = upd; upd(); };
bindRange('#trailLen', 'trailLen', v => v < 0.35 ? 'Short' : v < 0.75 ? 'Medium' : 'Long');
bindRange('#trailRange', 'trailRange', v => v < 0.35 ? 'Few stars' : v < 0.75 ? 'Some stars' : 'Lots of stars');
bindRange('#sunSpeed', 'sunSpeed', v => v >= 0.99 ? 'Real speed' : `Slowed ${Math.round(1 / v)}×`);
$('#optLabels').onchange = e => settings.labels = e.target.checked;
$('#optOrbits').onchange = e => settings.orbits = e.target.checked;
$('#optAuto').onchange = e => { settings.autoSpiral = e.target.checked; $('#sunSpeed').disabled = settings.autoSpiral; };
$('#sunSpeed').disabled = true;
$('#aboutBtn').onclick = () => { $('#about').classList.add('open'); $('#sheet').classList.remove('open'); };
$('#aboutClose').onclick = () => $('#about').classList.remove('open');

// toast
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
// hint
let hinted = false;
function hideHint() { if (!hinted) { hinted = true; $('#hint').classList.add('gone'); } }

// guided tour
const TOUR = [
  ['earth', null, 'sun', 0], ['moon', null, 'sun', 3], ['sun', 9, 'galaxy', 6], ['alphacen', null, 'sun', 7], ['sirius', null, 'sun', 7],
  ['trappist', null, 'sun', 3], ['betelgeuse', null, 'sun', 0], ['galaxy', null, 'sun', 0], ['andromeda', null, 'sun', 0], ['universe', null, 'sun', 0],
];
let tour = null;
$('#tourBtn').onclick = () => { if (tour) stopTour(); else startTour(); };
function startTour() { time.ms = Date.now(); time.dir = 1; tour = { i: -1, next: 0 }; $('#tourBtn').classList.add('on'); $('#tourBtn').textContent = 'Stop tour'; tourStep(); }
function stopTour() { if (!tour) return; tour = null; $('#tourBtn').classList.remove('on'); $('#tourBtn').textContent = 'Tour'; }
function tourStep() {
  if (!tour) return; tour.i++;
  if (tour.i >= TOUR.length) { stopTour(); return; }
  const [id, dist, view, sp] = TOUR[tour.i];
  settings.view = view; document.querySelectorAll('#viewSeg button').forEach(x => x.classList.toggle('sel', x.dataset.v === view));
  setSpeed(sp); time.dir = 1;
  flyTo(id, dist ?? undefined, undefined, id === 'sun' ? solarLook() : id === 'galaxy' ? galaxyLook() : undefined);
  tour.next = performance.now() + (cam.anim?.dur || 2000) + 9000;
}
$('#cardNext').onclick = () => { if (tour) tourStep(); else startTour(); };

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
  const mw = smooth(7.6, 8.6, Lc) * (1 - smooth(12.6, 13.4, Lc));
  milkyWay.visible = mw > 0.01; milkyWay.children[0].material.uniforms.uOpacity.value = mw * 0.42;
  sunPath.material.opacity = 0.45 * smooth(8.6, 9.4, Lc) * (1 - smooth(10.6, 11.2, Lc));
  sunHereMarker.material.uniforms.uOpacity.value = smooth(4.9, 5.4, Lc) * (1 - smooth(12.2, 12.9, Lc));
  const lg = smooth(9.6, 10.4, Lc) * (1 - smooth(13.4, 14.2, Lc));
  localGroup.visible = lg > 0.01; localGroup.children.forEach(g => g.children[0].material.uniforms.uOpacity.value = lg * 0.55);
  const web = smooth(12.2, 13.4, Lc);
  cosmicWeb.visible = web > 0.01; cosmicWeb.material.uniforms.uOpacity.value = web * 0.9;
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
  if (Lc > 7.6 && Lc < 13) notes.push('Milky Way shape is an illustration');
  if (Lc > 12.4) notes.push('Galaxy web is an illustration');
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
function scaleName(Ld, Lc) {
  const f = focusables[cam.focusId];
  if (f && ((f.sys || f.starIdx !== undefined) ? Ld < 4.6 : Ld < Math.log10((f.radius || 1e-6) * 40)) && (Lc < 8 || f.sys === undefined && Ld < Math.log10((f.radius || 1) * 40))) return f.name;
  const Lx = Math.max(Ld, Lc > 4 ? Lc - 0.3 : Ld);
  if (Lx < -1.2) return (f?.name || 'Planet') + ' & neighborhood'; if (Lx < 2.6) return 'Solar System'; Lc = Lx;
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
    }
  }
  const { solarVis } = layerFades(Lc);
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
  // point materials scale
  const pS = pxPerUnit;
  milkyWay.children[0].material.uniforms.uScale.value = pS;
  localGroup.children.forEach(g => g.children[0].material.uniforms.uScale.value = pS);
  cosmicWeb.material.uniforms.uScale.value = pS;

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
loadStars().then(() => { document.body.classList.add('ready'); }).catch(err => { console.error(err); document.body.classList.add('ready'); toast('Star catalog could not load.'); });
setTimeout(() => { $('#intro').classList.add('gone'); }, 2600);
setTimeout(hideHint, 11000);
window.__cosmo = { cam, flyTo, settings, time, setSpeed, focusables };
