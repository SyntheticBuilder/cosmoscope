# Cosmoscope progress

**Live:** https://syntheticbuilder.github.io/cosmoscope/ · **Repo:** https://github.com/SyntheticBuilder/cosmoscope (MIT)
Launched Nov 19, 2026. NASA's archive was returning 503 at launch, so the first deploy has no `new_planets.json` (no NEW pill) until a daily run succeeds.

## v1 prototype (Nov 19, 2026)
Done:
- Opens hovering over Earth (real day/night line, real rotation, NASA Blue/Black Marble)
- Seamless zoom: Earth → Solar System → nearby stars → Milky Way → Local Group → cosmic web → observable universe (CMB shell)
- Real positions right now for the Sun, 8 planets, Pluto and the Moon (Astronomy Engine)
- 109,400 real stars (HYG v4.1) at real distances, drifting with real motions when time speeds up
- Sun view / Galaxy view: Galaxy view turns orbits into spirals (auto-fit, honestly labeled)
- Story systems: Alpha Centauri A+B, Sirius A+B, TRAPPIST-1 (7 planets), Betelgeuse
- 10 more motion stories: Proxima Centauri b+d, Barnard's Star (moves with time), Gliese 710 (future Oort-cloud flyby you can watch at 1M yr/s), 51 Pegasi b (exaggerated star wobble), Kepler-16 b (planet around two stars), Algol (eclipsing pair + third star at 90°), Polaris (29-yr orbit), Mira (13-ly tail), Orion Nebula, Sagittarius A* (S2 at its real current orbital phase)
- 10 tap-to-read stops (not in the Tour, no narration): Vega (flattened by its spin), 61 Cygni, Luhman 16, Capella, Pleiades, Crab Nebula, Eta Carinae (hourglass cloud), Cygnus X-1, Pillars of Creation, Omega Centauri
- Story cards with sources, "Listen" narration, guided Tour (14 stops; adds Proxima b, Kepler-16 b, Orion Nebula, Sagittarius A*)
- Time controls: Live, up to 1 million years/sec, reverse, pause
- Settings: trail length, how many stars show trails, spiral fitting, names, orbit paths
- Search & Atlas: real catalog names for all 109,400 stars (Bayer, Flamsteed, Gliese, HD, HIP), places and constellations, with Read and Fly there; A to Z Atlas by category (the name index loads only when search is first opened)
- Catalog star cards (distance, spectral type, brightness, constellation, other names) and star flights that arrive at 6 ly with a pulsing focus ring
- 88 constellations from Stellarium (CC BY-SA 4.0): fly-to view from the Solar System, drawn lines, optional "Constellation lines" toggle
- Full screen / clean mode: hides all controls, view stays interactive, Esc or corner button restores
- Story stars now show as points from afar
- Live new-planets feed: planets NASA confirmed in the last 90 days ("✦ N NEW" pill, list, pulsing markers at NASA's positions, cards with sources, one fly-in per new batch; cached for offline, silent if unavailable)

Known limits:
- Milky Way, other galaxies and the cosmic web are illustrations (labeled)
- The NASA Exoplanet Archive doesn't allow browser requests from other sites (no CORS), so a daily GitHub Action fetches the list into new_planets.json next to the page; the app only reads that file
- Story-system orbit orientations are illustrative (except Kepler-16 and Algol's inner pair, drawn edge-on as seen from Earth)
- Gliese 710 uses the Gaia DR3 flyby solution (0.052 pc in 1.29 Myr) instead of its older HYG motion, which would miss by ~1.3 ly
- Orion, Crab, Pillars, Omega Centauri and Eta Carinae clouds and Mira's tail are illustrations (labeled); Eta Carinae orbit/sizes follow published models (approximate); Cygnus X-1 uses the 2021 radio distance (2.22 kpc), not HYG's; Sagittarius A* only shows S2 so far
- Wide constellations don't fit the width of a phone screen
- The hook wording for K-class stars doesn't suit giants
- Betelgeuse dims between about 100 and 250 ly when zooming out
- GitHub pauses the daily feed job after 60 days without repo activity — if the feed stops updating, re-enable the workflow in the repo's Actions tab

Next ideas (in order):
1. Zoom fixes: no black gap when zooming in from the universe; zoom toward where you point instead of always the focus; checkpoints (A, B, C...) to fly back to
2. Favorites, shareable collections, Top 10
3. More data: asteroids & comets (JPL), all ~6,500 exoplanets, pulsars (ATNF), quasars (SDSS)
4. Filters: planet type (estimated), temperature, number of suns, habitable zone, water detected (debated cases marked), moons (Solar System only)
5. Sky-events timeline: eclipses, moon phases, conjunctions, oppositions, equinoxes/solstices (Astronomy Engine), meteor shower peaks; tap to jump time and camera
6. Gravity views (owner to pick: space-fabric grid, falling dust, bent starlight around black holes)
7. Real galaxy maps (SDSS/DESI); share/record vertical clips; Gaia stars by the millions

## Build
npm install && bash build.sh  → dist/ (static files, host anywhere)
tools/prep_stars.py converts the HYG csv; stars are then packed into public/stars.js
Optional: node tools/prep_search.mjs <hygdata_v41.csv> <stellarium index.json> public  → public/starindex.txt + public/constellations.json
  hygdata_v41.csv: github.com/astronexus/HYG-Database → hyg/CURRENT/hygdata_v41.csv
  index.json: github.com/Stellarium/stellarium → skycultures/modern/index.json
