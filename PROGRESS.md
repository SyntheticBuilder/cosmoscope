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
- Story cards with sources, "Listen" narration, guided Tour (14 stops; adds Proxima b, Kepler-16 b, Orion Nebula, Sagittarius A*)
- Time controls: Live, up to 1 million years/sec, reverse, pause
- Settings: trail length, how many stars show trails, spiral fitting, names, orbit paths
- Live new-planets feed: planets NASA confirmed in the last 90 days ("✦ N NEW" pill, list, pulsing markers at NASA's positions, cards with sources, one fly-in per new batch; cached for offline, silent if unavailable)

Known limits:
- Milky Way, other galaxies and the cosmic web are illustrations (labeled)
- The NASA Exoplanet Archive doesn't allow browser requests from other sites (no CORS), so a daily GitHub Action fetches the list into new_planets.json next to the page; the app only reads that file
- Story-system orbit orientations are illustrative (except Kepler-16 and Algol's inner pair, drawn edge-on as seen from Earth)
- Gliese 710 uses the Gaia DR3 flyby solution (0.052 pc in 1.29 Myr) instead of its older HYG motion, which would miss by ~1.3 ly
- Orion Nebula cloud and Mira's tail are illustrations (labeled); Sagittarius A* only shows S2 so far
- GitHub pauses the daily feed job after 60 days without repo activity — if the feed stops updating, re-enable the workflow in the repo's Actions tab

Next ideas (in order):
1. Publish the website (GitHub Pages) so the daily feed runs
2. Real galaxy maps (SDSS / DESI) for the cosmic web
3. More story stops (spare idea: Pillars of Creation; more S-stars around Sagittarius A*; Orion runaway-star paths, tried and dropped for now because they got lost among the star trails)
4. Share / record a vertical clip of the current view
5. Gaia DR3 stars by the millions (streamed by zoom level)

## Build
npm install && bash build.sh  → dist/ (static files, host anywhere)
tools/prep_stars.py converts the HYG csv; stars are then packed into public/stars.js
