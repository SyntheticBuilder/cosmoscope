// Search & Atlas panel. Finds every place with a story and all 109,400 catalog stars by their real names.
// The star name index (starindex.txt, ~4 MB) loads only when the panel first opens.
import { parseStarIndex, buildSearchIndex, buildSearchIndexAsync, setPlaces, search, normalize, fmtLy } from './catalog.mjs';
import { initSavedTab } from './savedtab.js';

// Atlas categories, in display order. Empty ones are hidden.
export const CATEGORIES = ['Solar System', 'Named stars', 'Star systems & stories', 'Exoplanets', 'Nebulae & clusters', 'Galaxies', 'Black holes', 'Constellations', 'Other places'];

// Focusable id → [category, kind shown on the row]. Anything not listed goes to "Other places".
const PLACES = {
  sun: ['Solar System', 'Star'], mercury: ['Solar System', 'Planet'], venus: ['Solar System', 'Planet'], earth: ['Solar System', 'Planet'],
  moon: ['Solar System', 'Moon'], mars: ['Solar System', 'Planet'], jupiter: ['Solar System', 'Planet'], saturn: ['Solar System', 'Planet'],
  uranus: ['Solar System', 'Planet'], neptune: ['Solar System', 'Planet'], pluto: ['Solar System', 'Dwarf planet'],
  alphacen: ['Star systems & stories', 'Star system'], sirius: ['Star systems & stories', 'Star system'], betelgeuse: ['Star systems & stories', 'Star'],
  barnard: ['Star systems & stories', 'Star'], gliese710: ['Star systems & stories', 'Star'], algol: ['Star systems & stories', 'Star system'],
  polaris: ['Star systems & stories', 'Star system'], mira: ['Star systems & stories', 'Star'], vega: ['Star systems & stories', 'Star'],
  cyg61: ['Star systems & stories', 'Star system'], luhman16: ['Star systems & stories', 'Brown dwarf pair'], capella: ['Star systems & stories', 'Star system'],
  etacar: ['Star systems & stories', 'Star system'],
  trappist: ['Exoplanets', 'Planetary system'], proxima: ['Exoplanets', 'Exoplanet'], peg51: ['Exoplanets', 'Exoplanet'], kepler16: ['Exoplanets', 'Exoplanet'],
  orion: ['Nebulae & clusters', 'Nebula'], crab: ['Nebulae & clusters', 'Supernova remnant'], pillars: ['Nebulae & clusters', 'Nebula'],
  pleiades: ['Nebulae & clusters', 'Star cluster'], omegacen: ['Nebulae & clusters', 'Star cluster'],
  galaxy: ['Galaxies', 'Our galaxy'], andromeda: ['Galaxies', 'Galaxy'], triangulum: ['Galaxies', 'Galaxy'], lmc: ['Galaxies', 'Galaxy'], smc: ['Galaxies', 'Galaxy'],
  sgra: ['Black holes', 'Black hole'], cygx1: ['Black holes', 'Black hole + star'],
  universe: ['Other places', 'Universe'],
};
const placeInfo = (id) => (id.startsWith('new:') ? ['Exoplanets', 'Exoplanet'] : PLACES[id] || ['Other places', 'Place']);
// The kind shown on a saved view's subtitle ("Planet", "Star"), or null when it isn't a known place.
const savedKind = (id) => (/^star:\d+$/.test(id) ? 'Star' : Object.prototype.hasOwnProperty.call(PLACES, id) ? PLACES[id][1] : null);

const $ = (s) => document.querySelector(s);
const lyText = (ly) => (ly != null && Number.isFinite(ly) ? `${fmtLy(ly)} light-years` : '');
const join = (...parts) => parts.filter(Boolean).join(' · ');

// Sorting for the A–Z list: ignore a leading "The"; anything not starting with A–Z goes under "#" at the end.
const sortName = (n) => n.replace(/^the\s+/i, '');
const letterOf = (n) => {
  const c = sortName(n).normalize('NFD')[0]?.toUpperCase() || '#';
  return c >= 'A' && c <= 'Z' ? c : '#';
};
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const byName = (a, b) => {
  const la = letterOf(a.name), lb = letterOf(b.name);
  if (la !== lb) return LETTERS.indexOf(la) - LETTERS.indexOf(lb);
  return sortName(a.name).localeCompare(sortName(b.name), 'en', { numeric: true, sensitivity: 'base' });
};

/**
 * api (from main.js):
 *   places() → [{ id, name, alias, sub, ly, isNew }]   every named focusable
 *   namedStars() → [[idx, name, ly, spect], …] | null   the 460 named stars
 *   starsReady() → bool,  starCount() → number
 *   storyForStar(idx) → focusable id | null
 *   flyPlace(id), flyStar(idx), readPlace(id), readStar(idx), closeOthers()
 *   namesLoaded()   called once the star name index has loaded
 *   saved           favorites, collections and shared lists (see the favorites section in main.js)
 */
export function initSearch(api) {
  const panel = $('#searchPanel'), input = $('#searchInput'), list = $('#spList'), status = $('#spStatus');
  const btn = $('#searchBtn'), cats = $('#atlasCats'), letters = $('#atlasLetters');
  let tab = 'search', atlasCat = null;
  let index = buildSearchIndex([], []);   // places only until the star names arrive
  let loadState = 'idle';                  // idle | loading | ready | error
  let extraEntries = [];                   // added by later features (constellations)
  const actions = new Map();               // row key → { fly, read, flyDisabled }

  // ── entries ──
  function placeEntries() {
    const out = [];
    for (const p of api.places()) {
      const [category, kind] = placeInfo(p.id);
      const e = { key: 'p:' + p.id, id: p.id, name: p.name, kind: p.isNew ? 'Exoplanet · NEW' : kind, sub: p.sub, ly: p.ly, category,
        fly: () => api.flyPlace(p.id), read: () => api.readPlace(p.id) };
      out.push(e);
      if (p.alias) out.push({ ...e, name: p.alias, alias: true }); // findable by both names, listed once in the Atlas
    }
    return out.concat(extraEntries);
  }
  function refreshPlaces() {
    const entries = placeEntries();
    placeByKey = new Map(entries.filter((e) => !e.alias).map((e) => [e.key, e]));
    setPlaces(index, entries.map((e) => ({ id: e.key, name: e.name, kind: e.kind, ly: e.ly, boost: e.category === 'Other places' ? 1 : 2 })));
    return entries;
  }
  let placeByKey = new Map();

  function starEntry(idx, name, ly, spect) {
    const owner = api.storyForStar(idx);
    return { key: 's:' + idx, idx, name, kind: join('Star', spect), sub: lyText(ly), owner,
      fly: () => api.flyStar(idx), read: () => api.readStar(idx), flyDisabled: () => !api.starsReady() };
  }

  // ── loading the star names (once) ──
  let loadPromise = null;
  function loadStars() { // one shared promise while loading; after an error the next call tries again
    if (!loadPromise) loadPromise = loadStarsOnce().finally(() => { if (loadState !== 'ready') loadPromise = null; });
    return loadPromise;
  }
  async function loadStarsOnce() {
    if (loadState === 'ready') return;
    loadState = 'loading'; showStatus();
    try {
      const r = await fetch('starindex.txt');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const { rows } = parseStarIndex(await r.text());
      const n = api.starCount();
      if (n && rows.length !== n) console.warn(`starindex.txt has ${rows.length} rows, star field has ${n}`);
      const built = await buildSearchIndexAsync(rows, []);
      index = built; refreshPlaces();
      loadState = 'ready';
    } catch (err) {
      console.warn('Star names could not load', err);
      loadState = 'error';
    }
    showStatus();
    if (tab === 'search') runSearch();
    if (loadState === 'ready') { try { api.namesLoaded?.(); } catch (err) { console.warn(err); } }
  }
  function showStatus() {
    let t = '';
    if (tab === 'search') {
      if (loadState === 'loading') t = 'Loading star names…';
      else if (loadState === 'error') t = 'Star names could not load. Places are still searchable.';
    } else if (tab === 'atlas' && atlasCat === 'Named stars' && !api.namedStars()) t = 'Stars are still loading…';
    status.textContent = t;
    status.hidden = !t;
  }

  // ── rendering ──
  function rowEl(e) {
    const li = document.createElement('li'); li.className = 'spRow'; li.dataset.k = e.key;
    const txt = document.createElement('div'); txt.className = 'spText';
    const nm = document.createElement('span'); nm.className = 'spName'; nm.textContent = e.name;
    const sb = document.createElement('span'); sb.className = 'spSub'; sb.textContent = e.sub && e.sub.toLowerCase().startsWith(e.kind.toLowerCase()) ? e.kind + e.sub.slice(e.kind.length) : join(e.kind, e.sub); // no "Star cluster · star cluster"
    txt.append(nm, sb);
    const acts = document.createElement('div'); acts.className = 'spActs';
    const fly = document.createElement('button'); fly.className = 'pill spBtn'; fly.dataset.act = 'fly'; fly.textContent = 'Fly there';
    fly.setAttribute('aria-label', `Fly to ${e.name}`);
    if (e.flyDisabled?.()) { fly.disabled = true; fly.title = 'Stars are still loading'; }
    const rd = document.createElement('button'); rd.className = 'pill spBtn'; rd.dataset.act = 'read'; rd.textContent = 'Read';
    rd.setAttribute('aria-label', `Read about ${e.name}`);
    acts.append(fly, rd);
    li.append(txt, acts);
    actions.set(e.key, e);
    return li;
  }
  function render(entries, { headers = false, empty = '' } = {}) {
    actions.clear();
    const frag = document.createDocumentFragment();
    let last = null;
    for (const e of entries) {
      if (headers) {
        const L = letterOf(e.name);
        if (L !== last) {
          const h = document.createElement('li'); h.className = 'spLetter'; h.id = 'atl-' + (L === '#' ? 'num' : L); h.textContent = L;
          frag.append(h); last = L;
        }
      }
      frag.append(rowEl(e));
    }
    list.textContent = '';
    if (!entries.length && empty) { const li = document.createElement('li'); li.className = 'spEmpty'; li.textContent = empty; frag.append(li); }
    list.append(frag);
    list.scrollTop = 0;
  }

  function runSearch() {
    const q = input.value;
    if (!q.trim()) { render([], { empty: loadState === 'ready' ? 'Type a name: a planet, a star like “Vega” or “HIP 70890”, or a place.' : '' }); return; }
    const res = search(index, q, 40);
    const seen = new Set(), out = [];
    for (const r of res) {
      if (r.type === 'place') {
        const e = placeByKey.get(r.id);
        if (!e || seen.has(e.key)) continue;
        seen.add(e.key); out.push(e);
      } else {
        const row = index.rows[r.idx];
        let e = starEntry(r.idx, r.name, r.ly, row?.spect);
        if (e.owner && placeByKey.has('p:' + e.owner)) e = placeByKey.get('p:' + e.owner); // a story star: list its story stop instead
        if (seen.has(e.key)) continue;
        seen.add(e.key); out.push(e);
      }
      if (out.length >= 30) break;
    }
    render(out, { empty: normalize(q) ? (loadState === 'loading' ? 'No places with that name yet. Still loading star names…' : 'Nothing found with that name.') : '' });
  }
  let debounce = 0;
  input.addEventListener('input', () => {
    if (tab !== 'search') setTab('search');
    clearTimeout(debounce); debounce = setTimeout(runSearch, 60);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { // fly to the top result of what is typed now
      e.preventDefault(); // focus moves to the search button on close; without this the same Enter "clicks" it and reopens the panel
      clearTimeout(debounce); if (tab !== 'search') setTab('search'); else runSearch();
      const first = list.querySelector('.spRow'); const a = first && actions.get(first.dataset.k);
      if (a && !a.flyDisabled?.()) { close(); a.fly(); }
    }
  });

  function atlasEntries(cat) {
    if (cat === 'Named stars') return (api.namedStars() || []).map(([idx, name, ly, spect]) => starEntry(idx, name, ly, (spect || '').trim()));
    return [...placeByKey.values()].filter((e) => e.category === cat);
  }
  function renderAtlas() {
    const counts = new Map(CATEGORIES.map((c) => [c, atlasEntries(c).length]));
    if (!atlasCat || !counts.get(atlasCat)) atlasCat = CATEGORIES.find((c) => counts.get(c)) || null;
    cats.textContent = '';
    for (const c of CATEGORIES) {
      const n = counts.get(c);
      if (!n && !(c === 'Named stars' && !api.namedStars())) continue; // hide empty categories (keep Named stars while loading)
      const b = document.createElement('button'); b.className = 'chip spCat'; b.textContent = c;
      b.setAttribute('aria-pressed', String(c === atlasCat));
      b.dataset.cat = c;
      // re-rendering replaces the chips, so put focus back on the new one
      b.onclick = () => { atlasCat = c; renderAtlas(); [...cats.children].find((x) => x.dataset.cat === c)?.focus({ preventScroll: true }); };
      cats.append(b);
    }
    const entries = atlasCat ? atlasEntries(atlasCat).sort(byName) : [];
    const have = new Set(entries.map((e) => letterOf(e.name)));
    letters.textContent = '';
    for (const L of LETTERS) {
      const b = document.createElement('button'); b.className = 'spL'; b.textContent = L;
      b.setAttribute('aria-label', L === '#' ? 'Names starting with a number' : `Names starting with ${L}`);
      if (!have.has(L)) b.disabled = true;
      else b.onclick = () => { const h = $('#atl-' + (L === '#' ? 'num' : L)); if (h) list.scrollTop = h.offsetTop; }; // list is position:relative
      letters.append(b);
    }
    render(entries, { headers: true });
    showStatus();
  }

  function setTab(t) {
    if (tab === 'saved' && t !== 'saved') savedTab.leave();
    tab = t;
    for (const b of panel.querySelectorAll('[role=tab]')) {
      const on = b.dataset.tab === t;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    }
    panel.classList.toggle('atlas', t === 'atlas');
    panel.classList.toggle('saved', t === 'saved');
    if (t === 'atlas') renderAtlas();
    else if (t === 'saved') { showStatus(); actions.clear(); savedTab.show(); }
    else { showStatus(); runSearch(); }
  }
  const tabs = [...panel.querySelectorAll('[role=tab]')];
  for (const b of tabs) {
    b.onclick = () => setTab(b.dataset.tab);
    // ARIA tabs pattern: arrows / Home / End move between tabs (only the selected tab is in the Tab order)
    b.onkeydown = (e) => {
      const i = tabs.indexOf(b);
      const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); setTab(tabs[j].dataset.tab); tabs[j].focus();
    };
  }

  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-act]'); if (!b || b.disabled) return;
    const e = actions.get(b.closest('.spRow')?.dataset.k); if (!e) return;
    close();
    if (b.dataset.act === 'fly') e.fly(); else e.read();
  });

  // ── open / close ──
  const isOpen = () => panel.classList.contains('open');
  const savedTab = initSavedTab({ list, S: api.saved, close: () => close(), kindOf: savedKind, isActive: () => isOpen() && tab === 'saved' });
  api.saved.onChange(() => savedTab.draw()); // draws only while the Saved tab is showing, and only if something changed
  // open(t): optionally on a given tab ('search', 'atlas', or any tab added later such as 'saved'); an unknown tab
  // keeps the current one.
  function open(t) {
    const want = typeof t === 'string' && [...panel.querySelectorAll('[role=tab]')].some((b) => b.dataset.tab === t) ? t : null;
    if (isOpen()) { if (want && (want !== tab || want === 'saved')) setTab(want); else input.focus(); return; }
    if (want) tab = want;
    api.closeOthers();
    refreshPlaces();
    panel.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    setTab(tab);
    loadStars();
    api.loadExtras?.();
    if (tab === 'search') { input.focus({ preventScroll: true }); input.select(); }
  }
  function close() {
    if (!isOpen()) return;
    clearTimeout(debounce);
    panel.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
    if (panel.contains(document.activeElement)) btn.focus({ preventScroll: true });
  }
  btn.onclick = () => (isOpen() ? close() : open());
  $('#searchClose').onclick = close;
  // Esc closes search first (capture phase, so nothing else reacts to that Esc); "/" opens it.
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (tab === 'saved' && savedTab.esc()) return; // a rename box or chooser closes first
      close(); return;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof Element && e.target.closest('input, textarea, select'))) {
      e.preventDefault();
      if (document.body.classList.contains('clean')) document.getElementById('cleanBtn')?.click(); // bring controls back first
      open();
    }
  }, true);

  return {
    open, close, isOpen,
    // Re-render the open panel (e.g. once the star field is ready, so star rows can fly).
    refresh() {
      if (!isOpen()) return;
      const y = list.scrollTop;
      if (tab === 'saved') { savedTab.draw(); return; }
      if (tab === 'atlas') renderAtlas(); else runSearch();
      list.scrollTop = y;
    },
    // Load the star name index now (it otherwise loads on first open); resolves to the rows, or null if it failed.
    loadNames: () => loadStars().then(() => (loadState === 'ready' ? index.rows : null)),
    row: (idx) => (loadState === 'ready' ? index.rows[idx] || null : null),
    rows: () => (loadState === 'ready' ? index.rows : null),
    // Hook for later features: entries { key, name, kind, sub, ly, category, fly(), read() }.
    addExtras(list) { extraEntries = extraEntries.concat(list); if (isOpen()) { refreshPlaces(); setTab(tab); } },
  };
}
