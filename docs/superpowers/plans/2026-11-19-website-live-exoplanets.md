# Website + Live "New Worlds" Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Cosmoscope on GitHub Pages with a daily-refreshed list of newly confirmed exoplanets, shown in-app as a "✦ N NEW" pill, list, star markers, fact cards and a one-time fly-in.

**Architecture:** A Node script (run by a GitHub Actions workflow at build time, daily and on push) queries NASA's TAP API and writes `dist/new_planets.json`. Pure helpers live in small `.mjs` modules tested with Node's built-in test runner. `src/main.js` loads the JSON and wires UI and scene objects using those helpers.

**Tech Stack:** Node 20+ (`fetch`, `node:test`), esbuild, Three.js, GitHub Actions + `actions/deploy-pages`.

**Spec:** `docs/superpowers/specs/2026-11-19-website-live-exoplanets-design.md`

## Global Constraints
- "New" = `min(releasedate)` per planet within the last **90** days. `windowDays: 90`.
- No number on screen that isn't a NASA field. Missing → omitted fact, or "not measured" for distance. Never print `null`, `NaN`, `undefined`.
- NASA text is untrusted: render with `textContent` or escape before `innerHTML`.
- Fly-in caption: exactly `New world confirmed`. Card hook: `Added to NASA's confirmed planets on <Month D, YYYY>.`
- Card source: `NASA Exoplanet Archive · <reference text>`.
- localStorage key for fly-in: `cosmo.lastSeenBatch`; feed cache key: `cosmo.newPlanets`. All storage access in try/catch.
- Feed failure is silent: no pill, no thrown error, no toast.
- The workflow never commits to the repo.
- No new npm dependencies.

## Review Focus
1. Planet with `sy_dist` null → listed, card opens without flying, sub says "distance not measured" (Task 2 test `story without distance`).
2. Planet with most fields null → card has only the facts that exist, no "null"/"NaN" text (Task 2 test `sparse planet`).
3. `disc_refname` / facility containing HTML → tags stripped in data, and story strings contain no `<` (Task 1 test `cleanRef`, Task 2 test `no markup`).
4. Feed missing (404) or offline with no cache, or localStorage throwing → no pill, app still works (Task 3 manual check with file renamed).
5. Very distant host (microlensing, `sy_dist` ≈ 7,000 pc) → fly-in still frames the dot and the ring stays visible (Task 3 manual check).

---

### Task 1: NASA fetch script + GitHub workflow

**Files:**
- Create: `tools/exo_data.mjs` (pure helpers), `tools/fetch_exoplanets.mjs` (CLI), `tests/exo_data.test.mjs`, `.github/workflows/site.yml`
- Modify: `package.json` (`"test": "node --test tests/"`)

**Interfaces:**
- Produces (`tools/exo_data.mjs`):
  - `firstReleaseQuery(cutoffISO: string) -> string` (ADQL)
  - `detailQuery(names: string[]) -> string` (ADQL; single quotes in names doubled)
  - `cleanRef(html: string|null) -> { text: string|null, url: string|null }`
  - `shapePlanets(firstRows: {pl_name, first_release}[], detailRows: object[], fetchedAt: string) -> { fetchedAt, windowDays: 90, planets: Planet[] }`, where `Planet` = the detail fields from the spec plus `first_release`, `ref_text`, `ref_url` (without `disc_refname`), sorted by `sy_dist` ascending, nulls last
- File `dist/new_planets.json` in that shape (consumed by Task 3).

- [ ] **Step 1: Write failing tests** in `tests/exo_data.test.mjs`:
  - `firstReleaseQuery('2026-08-21')` contains `group by pl_name` and `having min(releasedate) >= '2026-08-21'`
  - `detailQuery(["O'Brien b","X b"])` contains `default_flag=1` and `'O''Brien b'`
  - `cleanRef('<a refstr=X href=https://ui.adsabs.harvard.edu/abs/2026AJ/abstract target=ref>Smith et al. 2026</a>')` → `{ text: 'Smith et al. 2026', url: 'https://ui.adsabs.harvard.edu/abs/2026AJ/abstract' }`; `cleanRef(null)` → both null
  - `shapePlanets`: two planets with `sy_dist` 50 and null, plus one with 10 → order `[10, 50, null]`; each has `first_release` from the first rows; a detail row with no first row is dropped; `windowDays === 90`
- [ ] **Step 2:** `npm test` → FAIL (module not found)
- [ ] **Step 3: Implement `tools/exo_data.mjs`.** Use the field list from the spec plus `pl_name`. Keep numbers as numbers (TAP JSON gives numbers or null).
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: Implement `tools/fetch_exoplanets.mjs <outPath>`.** TAP endpoint `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?format=json&query=…`. Cutoff = today − 90 days (UTC). On any error, or a non-array response: try `process.env.SITE_URL + '/new_planets.json'`; if that fails too, log and exit 0 without writing.
- [ ] **Step 6: Verify live:** `node tools/fetch_exoplanets.mjs dist/new_planets.json` → file exists, `planets.length` is roughly 30, and every planet has `first_release >= cutoff`.
- [ ] **Step 7: Write `.github/workflows/site.yml`.** Triggers `push: main`, `schedule: cron '0 10 * * *'`, `workflow_dispatch`. Permissions `contents: read, pages: write, id-token: write`; concurrency group `pages`. Job: `actions/checkout@v4` → `actions/setup-node@v4` (node 20, cache npm) → `npm ci` → `npm test` → `bash build.sh` → `node tools/fetch_exoplanets.mjs dist/new_planets.json` with env `SITE_URL: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` (path `dist`) → `actions/deploy-pages@v4`.
- [ ] **Step 8: Commit** `feat: NASA new-planets fetch script and Pages workflow`

### Task 2: New-worlds helpers (pure)

**Files:**
- Create: `src/newworlds.mjs`, `tests/newworlds.test.mjs`

**Interfaces:**
- Consumes: the `Planet` shape from Task 1.
- Produces:
  - `inWindow(planets: Planet[], nowMs: number, days = 90) -> Planet[]`
  - `newestRelease(planets) -> string|null` (max `first_release`)
  - `shouldFlyIn(newest: string|null, lastSeen: string|null, touring: boolean) -> boolean` (true iff newest && !touring && (!lastSeen || newest > lastSeen))
  - `lightYears(p) -> number|null` (`sy_dist * 3.26156`)
  - `planetSubtitle(p) -> string` (e.g. `1.2× Earth · 6-hour year · 66 light-years`; parts omitted when null; year as hours under 2 days, days under 2 years, otherwise years)
  - `planetStory(p) -> { title, sub, hook, facts: string[], source, isNew: true }`
  - `teffToRGB(teff: number|null) -> [r, g, b]` (0–1 floats; null → `[1, 0.96, 0.9]`)
  - `escapeHTML(s: string) -> string`

- [ ] **Step 1: Write failing tests:**
  - `inWindow` drops a planet released 91 days before `nowMs` and keeps one from 89 days before
  - `shouldFlyIn('2026-11-12', null, false)` true; `('2026-11-12','2026-11-12',false)` false; `('2026-11-12','2026-11-05',true)` false; `(null,null,false)` false
  - `planetStory` for a full planet (`pl_name:'TOI-1 b'`, `first_release:'2026-11-12'`, `disc_facility:'TESS'`, `disc_pubdate:'2026-10'`, `pl_rade:1.2`, `pl_orbper:0.25`, `sy_dist:20.24`, `discoverymethod:'Transit'`, `sy_pnum:1`, `ref_text:'Smith et al. 2026'`): `hook === "Added to NASA's confirmed planets on November 12, 2026."`, `sub === 'Planet · 66 light-years'`, `source === 'NASA Exoplanet Archive · Smith et al. 2026'`, facts include `Discovered by TESS` and `Discovery published October 2026`
  - **story without distance:** `sy_dist:null` → `sub === 'Planet · distance not measured'`
  - **sparse planet:** only `pl_name` and `first_release` set → no fact contains `null`, `NaN` or `undefined`
  - **no markup:** `disc_facility:'<b>X</b>'` → `planetStory` facts contain no `<`; `escapeHTML('<a>&')` === `'&lt;a&gt;&amp;'`
  - `planetSubtitle` of the full planet === `'1.2× Earth · 6-hour year · 66 light-years'`
  - `teffToRGB(null)` → `[1, 0.96, 0.9]`; `teffToRGB(3200)` has red > blue; `teffToRGB(9000)` has blue ≥ red
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3: Implement `src/newworlds.mjs`.** Dates are parsed as UTC; month names in English. Strip tags from all NASA strings in `planetStory`. Facts in order: discovered by, discovery published, size (`About N× Earth's width`), mass (`About N× Earth's mass`), year length, temperature (`About N °C`, from `pl_eqt` − 273), method, planets in system (only if `sy_pnum` > 1).
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: pure helpers for new-worlds stories and fly-in rules`

### Task 3: In-app pill, list, markers, card and fly-in

**Files:**
- Modify: `src/main.js` (`showCard` ~L975, `flyTo` ~L773, startup ~L1260, label system ~L871), `index.html` (top bar near Tour, card markup, styles, "Coming soon" line ~L209)

**Interfaces:**
- Consumes: everything Task 2 produces; `radec`, `PC_AU`, `flyTo`, `focusables`, `showCard`, `addLabel`, `makeMarker`, `toast`/caption from `main.js`.
- Produces: `focusables['new:' + pl_name]` entries with `story` set to a `planetStory` object (extend `flyTo` to accept a story object, not only a key).

- [ ] **Step 1: Make `showCard` safe.** Escape facts with `escapeHTML`. Show a `NEW` tag when `story.isNew`.
- [ ] **Step 2: Load the feed** after `loadStars()` resolves: `fetch('new_planets.json')`, falling back to the cached `cosmo.newPlanets`. Apply `inWindow`, save to the cache on success. Any failure → return `[]`.
- [ ] **Step 3: Scene objects** for each planet with `sy_dist`: a star dot (`makeMarker`-style, colour from `teffToRGB`) plus a pulsing ring (marker shader with a time-driven opacity uniform), at `radec(ra, dec, sy_dist * PC_AU)`. Add a focusable with a `defaultDist` that frames the ring, plus a label (planet name, sub `NEW`) shown at nearby-star zoom levels. Add one "not to scale" line to the existing notes.
- [ ] **Step 4: Pill + list sheet.** A `✦ N NEW` button beside Tour, hidden when N = 0. The list is built with `textContent`: name, `planetSubtitle`, facility. Tap → `flyTo('new:'+name)`; with no distance → `showCard(planetStory(p))` without flying.
- [ ] **Step 5: Fly-in.** After the intro fades and the stars and feed are loaded: if `shouldFlyIn(newestRelease, stored, touring)`, store the newest value, show the caption `New world confirmed`, and fly to the first planet that has a distance. The first `pointerdown`/`wheel`/`keydown` during the flight cancels it (`cam.anim = null`, close the card).
- [ ] **Step 6: Build and verify locally.** `bash build.sh && node tools/fetch_exoplanets.mjs dist/new_planets.json`, serve on 8080. Check at desktop and at mobile (375×812):
  - the fly-in happens once, and a reload doesn't repeat it
  - a tap cancels the fly-in
  - the pill count matches `planets.length`
  - a list tap flies to the planet and the card shows real fields
  - the farthest planet frames correctly (Review Focus 5)
  - no console errors
- [ ] **Step 7: Failure check.** Rename `dist/new_planets.json` and clear localStorage → no pill and no errors. Restore the file.
- [ ] **Step 8: Update docs.** Fix the CORS note in PROGRESS.md, add "Live new-planets feed" to Done, and reword the index.html "Coming soon" line.
- [ ] **Step 9: Commit** `feat: New worlds pill, markers, cards and fly-in`

### Task 4: Polish review and publish (with the owner)

- [ ] **Step 1:** Run the audit-suite performance + polish pass (CLAUDE.md rule) on the diff and fix what it finds. Commit.
- [ ] **Step 2:** Owner creates an empty public repo `cosmoscope` on github.com.
- [ ] **Step 3:** `git remote add origin https://github.com/<owner>/cosmoscope.git && git push -u origin main` (Git Credential Manager browser sign-in).
- [ ] **Step 4:** Owner sets Settings → Pages → Source: GitHub Actions. Re-run the workflow.
- [ ] **Step 5:** Open the live URL in the browser pane. Confirm `new_planets.json` loads and the pill shows. Check desktop + mobile.
- [ ] **Step 6:** Owner opens the URL on their phone. Note any issues in PROGRESS.md and commit.
