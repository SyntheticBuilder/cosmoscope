# Search, Atlas, star names, constellations and full screen: design

Date: Nov 19, 2026 · Status: approved by the owner ("Approve, build it")

## Why
The owner wants people who have questions about the universe to pull up any place, fly in and look at it from every angle. Today you can only reach a place by spotting its label or taking the Tour. Search and an index ("Atlas") make every object reachable and help people stumble on things they didn't know existed.

## Goals
- A **search** button (magnifier) left of Tour. Results appear as you type. Each result shows name, kind and distance, plus two actions: **Fly there** and **Read about it**. "Read" opens the card and leaves the camera where it is.
- An **Atlas** tab in the same panel: categories, then A–Z within each category, with a letter-jump row.
- **All 109,400 stars are findable** by real names only: proper name, Bayer or Flamsteed name written out ("Alpha Centauri", "61 Cygni", "Kappa¹ Sculptoris"), Gliese/GJ, HD and HIP. Never invent a name.
- **Read cards for ordinary stars** use catalog fields only: distance, when the light left, spectral type and what it means, apparent brightness (naked-eye or not), constellation, other names. Source: HYG v4.1.
- **Flying to a star** stops far enough out to see its neighbors (about 6 light-years), marks the star with a ring, and leaves zoom free.
- **Constellations (88)** are searchable and in the Atlas. Fly there turns the camera, from our Solar System, toward the constellation and draws its stick figure between the real 3D star positions. A card gives its name, meaning, brightest star and star count. Settings gets a "Constellation lines" toggle, off by default, to draw all 88.
- A **full-screen** button next to search hides every button, label and card. A faint corner icon, Esc, or leaving browser full screen restores everything. It also requests browser full screen where allowed.
- The 10 extra stories from the stories session are included (already on main as d29fed6).

## Non-goals
- Favorites, collections and Top 10 (part 3); asteroids, comets and all exoplanets (part 4); gravity views and filters (part 5).
- No server, accounts or analytics.

## Anti-goals
- Any invented star name or fact. A star with no proper name shows its catalog name.
- A slower first load. The name index loads only when search or the Atlas first opens.
- UI that covers the subject or breaks the phone layout at 375 px wide.

## Data
- **HYG v4.1** CSV (`astronexus/HYG-Database`, `hyg/CURRENT/hygdata_v41.csv`, CC BY-SA 4.0). It is not committed; it is the input to a Node prep script. Star order must match `public/stars.js`: skip `Sol`, skip rows whose `dist` is not a number, ≤ 0, or ≥ 100000. Checked: this gives exactly 109,400 rows and all 460 `starnames.json` indices match.
- **Stellarium "modern" sky culture** `skycultures/modern/index.json` (CC BY-SA 4.0): 88 constellations, lines as HIP chains, English and native names. Not committed either; also input to the prep script.
- Generated and committed: `public/starindex.txt` (one line per star, line number = star index) and `public/constellations.json`. Lines whose HIP is not in our star list are dropped.
- Credit Stellarium in About, README and the constellation card source.

## Approaches considered
1. **Generated text index, lazy-loaded, searched on the main thread (chosen).** About 4 MB raw, much smaller gzipped by Pages, loaded once on first open. A linear scan over one normalized string per star takes a few ms.
2. Web Worker with a prefix trie: faster for huge lists but more code and memory; not needed at 109k.
3. Ship names inside `stars.js`: slows every first visit, against the anti-goals.

## Ranking
Exact name match, then name starts with the query, then a word in the name starts with it, then substring. Places with stories, planets and constellations rank above plain catalog stars on ties; then nearer first. At most 30 results. Abbreviations work too ("alp cen", "gl 699", "hd 209458", "hip 70890").

## Atlas categories
Solar System · Named stars (460) · Star systems & stories · Exoplanets · Nebulae & clusters · Galaxies · Black holes · Constellations. Each story id gets a category in one small map; anything unmapped goes to "Other places".

## Phone
Panel is a bottom sheet (about 80% height), input font-size 16 px, results as large tap rows. Top bar must not wrap at 375 px.

## Left to the builder
Exact visuals within the existing style (thin uppercase labels, pills, blue accent), the ring marker look, and line colors for constellations (subtle, additive).
