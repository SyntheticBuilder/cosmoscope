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
- 20 more tap-to-read stops (Nov 20; not in the Tour, no narration): HR 8799 (4 imaged planets), Beta Pictoris (3 planets incl. 2026's d + dust disk), Fomalhaut (ring; the "planet" that was a dust cloud), Epsilon Eridani, Tau Ceti (candidate planets, flagged), Spica, Arcturus and Kapteyn's Star (follow the moving catalog star), Hyades, Ring Nebula, Hulse–Taylor pulsar, Antares, Zeta Ophiuchi (runaway + bow shock), 55 Cancri e, Cassiopeia A, SN 1987A, WR 104 (dust pinwheel spinning at its real 241.5-day period), Epsilon Indi Ab, Kepler-90 (8 planets), Gaia BH1
- Story labels light up by neighborhood (Nov 20): only the stops closest to the camera and on screen show a label (5 on phones, 8 on desktop), plus the stop being viewed; labels fade in and out as you travel
- Story cards with sources, "Listen" narration, guided Tour (14 stops; adds Proxima b, Kepler-16 b, Orion Nebula, Sagittarius A*)
- Time controls: Live, up to 1 million years/sec, reverse, pause
- Settings: trail length, how many stars show trails, spiral fitting, names, orbit paths
- Search & Atlas: real catalog names for all 109,400 stars (Bayer, Flamsteed, Gliese, HD, HIP), places and constellations, with Read and Fly there; A to Z Atlas by category (the name index loads only when search is first opened)
- Catalog star cards (distance, spectral type, brightness, constellation, other names) and star flights that arrive at 6 ly with a pulsing focus ring
- 88 constellations from Stellarium (CC BY-SA 4.0): fly-to view from the Solar System, drawn lines, optional "Constellation lines" toggle
- Full screen / clean mode: hides all controls, view stays interactive, Esc or corner button restores
- Story stars now show as points from afar
- No black gap when zooming: a faint, fixed star-dust sky is always drawn; scale layers overlap (galaxy web starts fading in when you are ~600,000 ly from the Sun instead of ~2.5 million; Local Group galaxies stay longer and brighter); far-away galaxies keep a soft glow (illustration, labeled)
- Free zoom: scroll zooms toward the cursor, pinch toward where the fingers started (only once the fingers really spread or close, so two-finger pans don't zoom). The spot you zoom to rides along with the object you were looking at, so it stays in view while time runs. The camera never goes inside a planet, moon, the Sun or a story star. Zooming out, +/− keys and double-tap stay centred. Pinch release no longer triggers the double-tap zoom
- Pins: "📍 Pin" chip saves the current view as A to I (up to 9, gaps refilled); tap to fly back (to the object, or to the same spot next to it, wherever it has moved); press and hold (touch), right-click or Delete to remove; kept on this device (localStorage)
- Betelgeuse no longer dims between about 100 and 250 ly when zooming out
- Favorites: ★ Save chip and a ☆ on fact cards (keeps a place or your exact view); collections; My Top 10; a Saved tab in search; collection tours; shared links (`#s=1.…`: the list is inside the link, nothing goes to a server). Kept on this device
- Live new-planets feed: planets NASA confirmed in the last 90 days ("✦ N NEW" pill, list, pulsing markers at NASA's positions, cards with sources, one fly-in per new batch; cached for offline, silent if unavailable)

Known limits:
- Milky Way, other galaxies (and their far-away glows) and the cosmic web are illustrations (labeled); the faint star-dust background is decoration, not real stars
- The NASA Exoplanet Archive doesn't allow browser requests from other sites (no CORS), so a daily GitHub Action fetches the list into new_planets.json next to the page; the app only reads that file
- Story-system orbit orientations are illustrative (except Kepler-16 and Algol's inner pair, drawn edge-on as seen from Earth)
- Gliese 710 uses the Gaia DR3 flyby solution (0.052 pc in 1.29 Myr) instead of its older HYG motion, which would miss by ~1.3 ly
- Orion, Crab, Pillars, Omega Centauri and Eta Carinae clouds and Mira's tail are illustrations (labeled); Eta Carinae orbit/sizes follow published models (approximate); Cygnus X-1 uses the 2021 radio distance (2.22 kpc), not HYG's; Sagittarius A* only shows S2 so far
- Batch-3 clouds/disks are illustrations (Beta Pic disk, Fomalhaut & Epsilon Eridani rings, Zeta Oph bow shock, Ring Nebula, Cas A, SN 1987A, WR 104 spiral). WR 104's spiral always faces the camera (we see it face-on from Earth). HR 8799 orbits drawn circular. Hulse–Taylor placed at the VLBI distance (4.1 kpc; estimates 4–10 kpc).
- Wide constellations don't fit the width of a phone screen
- Pins are saved per browser/device only (no sharing yet); they save the place, not the time. Pins on a catalog star depend on the star list's order, and pins on a constellation or a new-world planet fall back to the saved spot if that data hasn't loaded
- With 9 pins, the scale chips (Earth, Solar System...) start off-screen on phones; scroll the chip row
- Shared links are frozen copies: editing a list later doesn't change links already sent
- Deleting a favorite is one tap with no undo
- Long Saved lists get tall (two lines per row)
- Small polish left from review: Space can re-press a button you tabbed to and then clicked; in the rare copy-the-link fallback, keys stay inactive until you tap elsewhere; the card ☆ tells screen readers "pressed"; a saved star past the catalog end waits for search to load names; "Stop tour" pushes the full-screen button to a third row on phones (as with the built-in Tour)
- GitHub pauses the daily feed job after 60 days without repo activity — if the feed stops updating, re-enable the workflow in the repo's Actions tab

Next ideas (in order):
1. Trending (part 2): most visited today / this week / this month, via a small free Cloudflare counter the owner sets up; a visit = flying to a named place and staying 5 s or more, counted once per person per place per day; anonymous
2. More data: asteroids & comets (JPL), all ~6,500 exoplanets, pulsars (ATNF), quasars (SDSS)
3. Filters: planet type (estimated), temperature, number of suns, habitable zone, water detected (debated cases marked), moons (Solar System only)
4. Sky-events timeline (owner, Nov 20: tonight's sky from the visitor's own location): eclipses, moon phases, conjunctions, oppositions, equinoxes/solstices (Astronomy Engine), meteor shower peaks; tap to jump time and camera
5. Gravity view: space-fabric grid (owner's pick, Nov 20)
6. Real galaxy maps (SDSS/DESI); share/record vertical clips; Gaia stars by the millions

## Build
npm install && bash build.sh  → dist/ (static files, host anywhere)
tools/prep_stars.py converts the HYG csv; stars are then packed into public/stars.js
Optional: node tools/prep_search.mjs <hygdata_v41.csv> <stellarium index.json> public  → public/starindex.txt + public/constellations.json
  hygdata_v41.csv: github.com/astronexus/HYG-Database → hyg/CURRENT/hygdata_v41.csv
  index.json: github.com/Stellarium/stellarium → skycultures/modern/index.json
