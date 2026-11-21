// Cosmoscope Trending counter (Cloudflare Worker + D1).
//   POST /visit  body {"id": "<place id>"}  → 204 (counted or already counted today), 400 bad id, 429 too many today
//   GET  /top?range=day|week|month           → {"places":[{"id","n"}]}  (top 10 with at least 3 visits)
// Privacy: no IP address is stored. A visit leaves only a scrambled key made from (secret, day, IP, place) that
// means nothing the next day; old keys are deleted daily.
import { validId, RANGES, MIN_VISITS, TOP_N } from '../../src/trending.mjs';

const ALLOWED = [/^https:\/\/syntheticbuilder\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const MAX_BODY = 200;
const PER_PERSON_DAY = 300; // most places one person can add in a day (stops one script from filling the day)
const TOP_TTL_MS = 5 * 60 * 1000;

export const day = (ms) => new Date(ms).toISOString().slice(0, 10);
export const hour = (ms) => Math.floor(ms / 3600000);

async function hmac(secret, text) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
  return [...sig.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cors(origin) {
  if (!origin || !ALLOWED.some((r) => r.test(origin))) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}
const reply = (status, origin, body, extra = {}) => new Response(body == null ? null : JSON.stringify(body), {
  status, headers: { ...cors(origin), ...(body == null ? {} : { 'content-type': 'application/json' }), ...extra },
});

// D1 storage. counts_h: per hour (Today), counts_d: per day (Week, Month), seen: today's "already counted" keys.
export function d1Store(db) {
  return {
    async mark(dayStr, key, pk, cap) {
      const used = await db.prepare('SELECT COUNT(*) AS c FROM seen WHERE day = ?1 AND pk = ?2').bind(dayStr, pk).first();
      if ((used?.c ?? 0) >= cap) return 'cap';
      const r = await db.prepare('INSERT OR IGNORE INTO seen (day, key, pk) VALUES (?1, ?2, ?3)').bind(dayStr, key, pk).run();
      return r.meta?.changes ? 'new' : 'dup';
    },
    async add(h, dayStr, id) {
      await db.batch([
        db.prepare('INSERT INTO counts_h (hour, id, n) VALUES (?1, ?2, 1) ON CONFLICT (hour, id) DO UPDATE SET n = n + 1').bind(h, id),
        db.prepare('INSERT INTO counts_d (day, id, n) VALUES (?1, ?2, 1) ON CONFLICT (day, id) DO UPDATE SET n = n + 1').bind(dayStr, id),
      ]);
    },
    async top(range, now) {
      const q = range === 'day'
        ? db.prepare('SELECT id, SUM(n) AS n FROM counts_h WHERE hour > ?1 GROUP BY id HAVING SUM(n) >= ?2 ORDER BY n DESC, id LIMIT ?3').bind(hour(now) - 24, MIN_VISITS, TOP_N)
        : db.prepare('SELECT id, SUM(n) AS n FROM counts_d WHERE day > ?1 GROUP BY id HAVING SUM(n) >= ?2 ORDER BY n DESC, id LIMIT ?3').bind(day(now - (range === 'week' ? 7 : 30) * 86400000), MIN_VISITS, TOP_N);
      const { results } = await q.all();
      return (results || []).map((r) => ({ id: r.id, n: Number(r.n) }));
    },
    async cleanup(now) {
      await db.batch([
        db.prepare('DELETE FROM seen WHERE day < ?1').bind(day(now)),
        db.prepare('DELETE FROM counts_h WHERE hour <= ?1').bind(hour(now) - 26),
        db.prepare('DELETE FROM counts_d WHERE day < ?1').bind(day(now - 32 * 86400000)),
      ]);
    },
  };
}

// The request handler, with storage and clock passed in (tests use a memory store).
export async function handle(request, env, { store, now = Date.now(), topCache = new Map() } = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors(origin), 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
  }
  try {
    if (url.pathname === '/visit' && request.method === 'POST') {
      if (!cors(origin)['access-control-allow-origin']) return reply(403, origin, null);
      if (!env.SALT) return reply(500, origin, null);
      const len = Number(request.headers.get('content-length') || 0);
      if (len > MAX_BODY) return reply(400, origin, null);
      const text = await request.text();
      if (text.length > MAX_BODY) return reply(400, origin, null);
      let id = null;
      try { const b = JSON.parse(text); if (b && typeof b === 'object' && !Array.isArray(b) && Object.hasOwn(b, 'id')) id = b.id; } catch { }
      if (!validId(id)) return reply(400, origin, null);
      const ip = request.headers.get('cf-connecting-ip') || '';
      const d = day(now);
      const key = await hmac(env.SALT, `${d}|${ip}|${id}`);
      const pk = await hmac(env.SALT, `${d}|${ip}`);
      const m = await store.mark(d, key, pk, PER_PERSON_DAY);
      if (m === 'cap') return reply(429, origin, null);
      if (m === 'new') await store.add(hour(now), d, id);
      return reply(204, origin, null);
    }
    if (url.pathname === '/top' && request.method === 'GET') {
      const range = url.searchParams.get('range');
      if (!RANGES.includes(range)) return reply(400, origin, null);
      const hit = topCache.get(range);
      let places;
      if (hit && now - hit.t < TOP_TTL_MS) places = hit.places;
      else { places = await store.top(range, now); topCache.set(range, { t: now, places }); }
      return reply(200, origin, { places }, { 'cache-control': 'public, max-age=300' });
    }
    return reply(404, origin, null);
  } catch (err) {
    console.error('trending error', err?.message); // no request data in logs
    return reply(503, origin, null);
  }
}

const memo = new Map(); // per-instance cache of top lists (5 minutes)
export default {
  fetch: (request, env) => handle(request, env, { store: d1Store(env.DB), topCache: memo }),
  scheduled: (event, env, ctx) => ctx.waitUntil(d1Store(env.DB).cleanup(Date.now())),
};
