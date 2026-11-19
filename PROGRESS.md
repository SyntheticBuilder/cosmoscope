# Cosmoscope progress

## v1 prototype (Nov 19, 2026)
Done:
- Opens hovering over Earth (real day/night line, real rotation, NASA Blue/Black Marble)
- Seamless zoom: Earth → Solar System → nearby stars → Milky Way → Local Group → cosmic web → observable universe (CMB shell)
- Real positions right now for the Sun, 8 planets, Pluto and the Moon (Astronomy Engine)
- 109,400 real stars (HYG v4.1) at real distances, drifting with real motions when time speeds up
- Sun view / Galaxy view: Galaxy view turns orbits into spirals (auto-fit, honestly labeled)
- Story systems: Alpha Centauri A+B, Sirius A+B, TRAPPIST-1 (7 planets), Betelgeuse
- Story cards with sources, "Listen" narration, guided Tour (10 stops)
- Time controls: Live, up to 1 million years/sec, reverse, pause
- Settings: trail length, how many stars show trails, spiral fitting, names, orbit paths

Known limits:
- Milky Way, other galaxies and the cosmic web are illustrations (labeled)
- Live NASA exoplanet feed is blocked inside the claude.ai preview (needs its own website)
- Story-system orbit orientations are illustrative

Next ideas (in order):
1. Own website + NASA Exoplanet Archive live feed ("New" badges)
2. Real galaxy maps (SDSS / DESI) for the cosmic web
3. More story stops (Proxima b, Polaris, Orion Nebula, Sagittarius A*, Pillars of Creation)
4. Share / record a vertical clip of the current view
5. Gaia DR3 stars by the millions (streamed by zoom level)

## Build
npm install && bash build.sh  → dist/ (static files, host anywhere)
tools/prep_stars.py converts the HYG csv; stars are then packed into public/stars.js
