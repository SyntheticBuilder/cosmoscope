# Search, Atlas, Star Names, Constellations and Full Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every object (all 109,400 stars, 88 constellations, every story place) findable through search and an A–Z Atlas, with Fly there / Read actions and a full-screen mode.

**Architecture:** A Node prep script turns the HYG CSV and Stellarium's constellation file into two committed files. A pure module (`src/catalog.mjs`) parses them, writes out names and ranks searches; it is unit-tested with `node --test`. UI lives in a new `src/search.js` wired from `src/main.js`.

**Tech Stack:** Three.js, esbuild IIFE bundle (`bash build.sh`), Node 22 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-19-search-atlas-design.md`

## Global Constraints
- Never invent a name or a number. Every name comes from HYG (`proper`, `bayer`/`flam`+`con`, `gl`, `hd`, `hip`) or Stellarium; every star fact from HYG fields.
- Star index order must match `public/stars.js`: skip `proper == "Sol"`, skip rows whose `dist` is NaN, ≤ 0 or ≥ 100000 (gives 109,400 rows).
- The name index loads only on first open of the search panel (or `/` key). Nothing new on first page load except the buttons.
- Phone first: no horizontal scroll and no top-bar wrap at 375×812; inputs font-size ≥ 16 px.
- Sources: star cards "HYG Database v4.1 (CC BY-SA 4.0)"; constellation cards "Stellarium modern sky culture (CC BY-SA 4.0) · HYG Database v4.1".
- Commits authored as the repo's configured user (SyntheticBuilder, noreply email), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Serve for manual checks: `tail -f /dev/null | npx esbuild --servedir=dist --serve=8080` after `bash build.sh` (a server may already be running on 8080).

## Review Focus
- Query with only spaces, punctuation, or Greek letters ("α Cen") → no crash; Greek letters map to their names.
- Duplicate names across stars (e.g. two "HD" components) → both listed, no key collisions in the UI.
- Opening search before stars finished loading → Fly there waits or is disabled, never throws.
- Esc while search is open closes search first, not full screen; Esc in full screen restores the UI.
- Fly there to a story star (e.g. Vega) uses its story focusable and story card, not the plain catalog card.

---

### Task 1: Prep script, generated data, catalog module

**Files:** Create `tools/prep_search.mjs`, `src/catalog.mjs`, `tests/catalog.test.mjs`, `public/starindex.txt`, `public/constellations.json`.

**Interfaces — Produces:**
- `public/starindex.txt`: line i = star i, tab-separated `hip, hd, gl, bayer, flam, con, proper, distLy, spect, mag` (empty string for missing; distLy = dist_pc × 3.26156 rounded to 2 decimals; mag as in CSV). First line is a header starting with `#`.
- `public/constellations.json`: `[{ abbr, name, english, lines: [[starIdx, starIdx, ...], ...] }]` for all 88, from Stellarium `constellations[].id` ("CON modern Aql" → abbr "Aql"), `common_name.native`, `common_name.english`, HIP chains mapped to star indices via HYG `hip` (drop missing HIPs, split chains at gaps, drop chains < 2).
- `src/catalog.mjs` exports:
  - `CONSTELLATIONS`: abbr → `{ name, genitive }` for all 88 IAU constellations.
  - `GREEK`: 3-letter HYG Bayer code (Alp…Ome) → `{ name: 'Alpha', letter: 'α' }`.
  - `parseStarIndex(text) → { rows: Array<{hip,hd,gl,bayer,flam,con,proper,ly,spect,mag}> }` (numbers parsed; empty → null/'').
  - `starNames(row) → string[]`, best first: proper; Bayer ("Kap-1" + "Scl" → "Kappa¹ Sculptoris"); Flamsteed ("61 Cygni"); Gliese ("Gl 699" → "Gliese 699", "GJ 1001" kept as "GJ 1001"); "HD n"; "HIP n". Never empty for real rows.
  - `normalize(s) → string`: lowercase, strip diacritics, superscripts → digits, Greek letters → names, punctuation → space, collapse spaces.
  - `buildSearchIndex(rows, extras) → index` where extras = `[{ id, name, kind, ly, boost }]` for focusables/constellations; each star also gets searchable abbreviations ("alp cen", "gl 699").
  - `search(index, query, limit = 30) → Array<{ type: 'star'|'place', idx?, id?, name, kind, ly }>` using the spec's ranking.

- [ ] Write `tests/catalog.test.mjs` with at least: `starNames` for Alpha Centauri row (bayer "Alp", con "Cen", proper "Rigil Kentaurus") returns `["Rigil Kentaurus", "Alpha Centauri", ...]`; `Kap-1`/`Scl` → "Kappa¹ Sculptoris"; flam 61/Cyg → "61 Cygni"; gl "Gl 699" → "Gliese 699"; hd 224700 → "HD 224700"; `normalize("α Cen")` equals `normalize("alpha cen")`; search for "alp cen", "gliese 699", "hip 1", "vega", "   ", "!!!" behaves (blank/punctuation → `[]`); exact beats prefix beats substring; places outrank stars on ties.
- [ ] Run `npm test`, see failures. Implement `src/catalog.mjs`. Run `npm test`, all pass.
- [ ] Write `tools/prep_search.mjs <hyg.csv> <stellarium-index.json> <outdir>` (pure Node, handles quoted CSV). Run it with the downloaded files; it prints row count (must be 109400) and constellation count (88). Spot-check line 80155 (index 80154) is Barnard's Star.
- [ ] Commit tools, src, tests and both generated files.

### Task 2: Search & Atlas panel, Read/Fly, star cards, star flights

**Files:** Create `src/search.js`. Modify `src/main.js`, `index.html`, `src/stories.js` only if a category map belongs there (prefer a map in `search.js`).

**Interfaces — Consumes:** Task 1 exports. From `main.js`: `focusables`, `STORIES`, `flyTo(id)`, `flyToStar(idx)`, `showCard(story, focusId)`, `starData` (names, pos, vel), `stopTour()`. Export what `search.js` needs via a small `initSearch(api)` call rather than globals.

- [ ] Magnifier icon button `#searchBtn` (aria-label "Search") immediately left of `#tourBtn`. Opens a panel `#searchPanel` (same sheet style as settings) with an input, tabs "Search" / "Atlas", and a results list. Opening closes other sheets/cards that would overlap; `/` opens it; Esc closes it.
- [ ] First open fetches `starindex.txt` (shows "Loading star names…"), builds the index once.
- [ ] Results rows: name, kind ("Star · K5V", "Constellation", "Planet", …), distance in light-years where known; buttons "Fly there" and "Read". Read shows the card without moving the camera. Fly there closes the panel, calls `flyTo(id)` for places and `flyToStar(idx)` for stars — but if the star index belongs to a story focusable (has `starIdx`), use that focusable instead.
- [ ] Atlas tab: category chips (spec list), then A–Z rows with a letter-jump strip. Named stars = the 460 with proper names. Constellations come from Task 3's list (show the category once Task 3 lands; until then hide it).
- [ ] Replace `starStory(idx)` with a catalog-only card: title = best name; sub = "Star · N light-years"; hook from spectral class (keep existing hook map); facts: distance + light-left year (existing logic), "Spectral type X: <plain words>", "Brightness: magnitude M, visible to the naked eye" when M ≤ 6 else "too faint to see without a telescope", "In the constellation <name>" when con known, "Also known as …" (up to 4 other names). If the index isn't loaded, fall back to existing data (proper name, distance, spectral type).
- [ ] `flyToStar` default distance 6 light-years (`6 * LY_AU`); label taps use the same. A thin pulsing ring marks the focused star while it is the focus.
- [ ] Manual check desktop and 375×812: search "Vega" (story card), "61 Cyg", "HIP 70890", "gl 581", Read vs Fly; Atlas letter jump; no console errors; no top-bar wrap.
- [ ] Commit.

### Task 3: Constellations

**Files:** Modify `src/main.js`, `src/search.js`, `index.html`.

- [ ] Load `constellations.json` with the star index (lazy). Add each as a search/Atlas entry ("Constellation", english meaning as subtitle).
- [ ] Fly there: focus the Sun at about 300 AU, `lookFrom` = minus the unit vector toward the mean direction of the constellation's line stars, so the figure fills the view from our Solar System. Draw its lines (additive, subtle blue, `THREE.LineSegments` between current star positions including proper motion) while it is selected; clear when another place is chosen.
- [ ] Card: title = Latin name; sub = "Constellation · <English>"; hook "The <english>, as seen from Earth."; facts: brightest star by `mag` among stars with `con` = abbr (best name, distance), number of catalog stars with that `con`, "The lines join stars at their real distances; from anywhere but Earth the shape falls apart." Source per Global Constraints.
- [ ] Settings toggle "Constellation lines" (off by default) draws all 88, loading data on demand.
- [ ] Manual check: Orion and Ursa Major look right from Earth; zooming out shows the 3D shape distort; phone size OK.
- [ ] Commit.

### Task 4: Full screen, credits, docs

**Files:** Modify `src/main.js`, `index.html`, `README.md`, `PROGRESS.md`.

- [ ] Button `#fsBtn` (aria-label "Full screen", corner-arrows icon) right after `#searchBtn`. Toggles `body.clean`: hides `#top`, `#bottom`, `#card`, `#labels`, sheets. Shows a faint restore button in the top-right corner (44×44 tap area). Calls `document.documentElement.requestFullscreen?.()` (catch errors). Restore on button, Esc (only when search is not open), or `fullscreenchange` leaving full screen.
- [ ] About panel and README credit Stellarium (CC BY-SA 4.0) for constellation lines; README features list gets search, Atlas, constellations and full screen; PROGRESS.md "Done" updated and the HYG CSV/Stellarium download steps documented under Build (`node tools/prep_search.mjs …`).
- [ ] Manual check desktop and 375×812. Commit.
