# Design: Cosmoscope website + live "New worlds" feed

Date: 2026-11-19 · Status: draft, awaiting owner approval

## Why
Cosmoscope needs a public home so it can be shared, and core feature #5 ("Live updates") asks for newly confirmed exoplanets with a "New" badge. New planets make the app feel alive, and give returning visitors a reason to come back. Polish matters as much as function (CLAUDE.md).

## What we learned (recon, 2026-11-19)
- NASA's Exoplanet Archive API (`exoplanetarchive.ipac.caltech.edu/TAP/sync`) sends **no CORS header**, so a browser page on *any* website cannot read it directly. PROGRESS.md's "works once it has its own website" is not quite right; we need a copy of the data hosted on our own site.
- NASA updates the archive in roughly weekly batches (usually Thursdays). **A recent `releasedate` does not mean a new planet.** Of 39 default rows released in the last 30 days, only 21 were discovered in 2026. The rest were old planets re-measured by a newer paper.
- A planet's true *first appearance* is `min(releasedate)` across all its `ps` rows. `GROUP BY pl_name HAVING min(releasedate) >= …` works; subqueries do not. Genuinely new planets: 6 in the last 30 days, 33 in 90 days, 175 in a year.
- Most new host stars (TESS, Kepler, microlensing) are too faint to be in HYG. Where HYG does have the star, its Hipparcos distance differs from NASA's Gaia-based `sy_dist` by far more than a close-up view's width.
- Scene units are AU in an equatorial frame. The existing `radec(raDeg, decDeg, dist)` helper matches the HYG star frame, so archive `ra`, `dec`, `sy_dist` (parsecs) can be placed with `radec(ra, dec, sy_dist * PC_AU)`.
- `showCard()` writes facts with `innerHTML`. NASA fields (`disc_refname` contains HTML links) must be escaped or written as text.
- No `gh` CLI and no Python on this PC; Node is available. The owner has a GitHub account.

## Goals
1. Cosmoscope is live on a free public web address (GitHub Pages), rebuilt automatically on every push to `main`.
2. Once a day, GitHub rebuilds the site and fetches newly confirmed planets from NASA into `new_planets.json` at build time. Nothing is committed to the repo.
3. In the app, a pill next to Tour ("✦ 33 NEW") opens a list of new planets, closest first. Tapping one flies to its host star, shows a soft pulsing ring, and opens a fact card built only from NASA's fields.
4. **Fly-in moment:** when there is a batch the visitor hasn't seen yet, after the opening title fades, the camera glides to the closest new planet's star and its card opens with a caption "New world confirmed". Any touch or key stops it and hands control back.

## Non-goals
- Drawing the new planets' orbits (NASA has no orbit orientation for most, so we'd be inventing them).
- Showing all ~6,000 known exoplanets.
- Push notifications, accounts, custom domain (later).

## Anti-goals (a failure even if it "works")
- Any number on a card that didn't come from NASA. A missing field shows "not measured", never a guess.
- An old, re-measured planet shown as "NEW".
- A fly-in that blocks the opening, repeats every visit, or can't be skipped.
- The feed failing loudly. If the file can't load, the pill simply doesn't appear.
- Hurting phone frame rate (the data is tiny; a few extra markers).

## Approaches considered
- **A. GitHub Pages + daily GitHub Actions job (chosen by owner).** Free, one place, nothing runs on the owner's PC. "New" can lag NASA by up to a day, which doesn't matter given weekly batches.
- **B. Netlify/Vercel with a serverless proxy calling NASA live per visit.** Slightly fresher, but another account, another moving part, slower first load on phones. Rejected.

## The design

### "New" window (Claude's call, owner was unsure)
"New" = **first added to NASA's confirmed-planet archive in the last 90 days** (`min(releasedate)` per planet). Re-measured old planets never count. The window is 90 days because truly new planets arrive at only ~6 a month, and 90 days gives a steady ~30. The list is sorted **closest to Earth first** (an objective, relatable order), and the fly-in goes to the closest one that can be placed. If the window is ever empty, the pill is hidden.

### Data script: `tools/fetch_exoplanets.mjs` (Node, no extra deps)
- Query 1 (ADQL): `select pl_name, min(releasedate) as first_release from ps group by pl_name having min(releasedate) >= '<today−90d>'`.
- Query 2: for those names, the `default_flag=1` row from `ps`, with fields `pl_name, hostname, disc_pubdate, disc_year, disc_facility, discoverymethod, pl_rade, pl_bmasse, pl_orbper, pl_eqt, sy_dist, ra, dec, sy_pnum, st_teff, disc_refname`. Attach `first_release` to each.
- Strip HTML from `disc_refname`, keeping plain text plus a separate URL if present.
- Write `dist/new_planets.json`: `{ fetchedAt, windowDays: 90, planets: [...] }`, sorted by `sy_dist` (nulls last). Values stay as NASA gave them; nulls stay null.
- On any NASA error or malformed response, fall back to downloading the currently deployed `new_planets.json` from the live site. If that also fails, write no file, and the app shows no pill. The build never fails because of NASA.

### GitHub workflow: `.github/workflows/site.yml`
Triggers: push to `main`, daily schedule (~10:00 UTC), manual run. Steps: checkout → Node → `npm ci` → build (`build.sh`) → run the fetch script into `dist/` → deploy `dist/` to GitHub Pages. The job never commits, so the owner's local copy never falls behind and pushes never get rejected. (Claude's call: chosen over a daily bot commit for exactly that reason.)

### App changes (`src/main.js`, `index.html`)
- Load `new_planets.json` after the stars load. Remember the last good copy in localStorage for offline use, dropping planets older than 90 days. If both fail, there's no pill.
- **Pill** in the top bar beside Tour: "✦ N NEW", matching the existing pill style.
- **List sheet**: name, a one-line subtitle (e.g. "1.2× Earth · 6-hour year · 66 light-years"), the facility. Built with `textContent`.
- **Placement**: `radec(ra, dec, sy_dist * PC_AU)`, registered as a focusable `new:<pl_name>`. The **host star is drawn as its own glowing dot** at NASA's position (tinted from `st_teff`, neutral white if that's missing), with a pulsing ring around it, labeled "not to scale". NASA's position wins and there is no HYG cross-match. (Claude's call: most hosts aren't in HYG, and a HYG twin at a slightly different distance sits far off-screen at close-up framing.) The dot and ring stay fixed while time runs, like the story systems. Planets with no distance can't be placed: the card opens without flying and says the distance is not measured.
- **Card** (via the existing `showCard`, with facts escaped):
  - title = the planet's name; sub = "Planet · X light-years"
  - hook = "Added to NASA's confirmed planets on <Month D, YYYY>." (from `first_release`)
  - facts, drawn only from fields that are present: discovered by <facility>; discovery published <Month YYYY> (from `disc_pubdate`); size vs Earth; mass vs Earth; year length; temperature; discovery method; planets in the system
  - source = "NASA Exoplanet Archive · <reference>"
  - a small "NEW" tag
- **Fly-in**: on load, if the newest `first_release` > localStorage `cosmo.lastSeenBatch` (missing counts as unseen, so first-time visitors get it too), wait for the intro title to fade (~2.6 s) and the stars to load. Then show the caption "New world confirmed" and `flyTo` the closest placed planet. Any pointerdown, wheel or key cancels it: the camera stays where it is and the card closes. The value is saved when the fly-in starts, so it happens once per batch. It's skipped during the Tour.

### Hosting setup (owner does the clicks; Claude walks through it)
1. Owner creates a public repo `cosmoscope` on github.com (empty, no README).
2. Claude adds the remote and pushes. Git for Windows opens a browser sign-in the first time.
3. Owner sets repo Settings → Pages → Source: **GitHub Actions**.
4. Claude runs the workflow, opens the live URL, tests desktop + phone size, and confirms the feed loaded.

### Also in this change
- Fix PROGRESS.md's CORS note, and update the "Coming soon" line in index.html about the feed.
- Audit-suite performance/polish pass before sharing the link (CLAUDE.md rule).

## Left to the builder
Exact pill/list/ring styling (match the current UI), caption wording beyond "New world confirmed", cron time, number formatting, workflow permissions.
