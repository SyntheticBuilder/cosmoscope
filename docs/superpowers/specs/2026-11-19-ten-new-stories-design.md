# Ten new story stops — design (approved by owner "go", Nov 19 2026)

## Why
More "motion" stories: each stop shows something moving (orbits, flybys, runaways, a tail), in line with the app's angle.

## The 10 stops
| id | Stop | Motion shown | How it's drawn |
|---|---|---|---|
| proxima | Proxima Centauri b (+ d) | 11-day / 5-day orbits; Proxima's ~550,000-yr lap of α Cen | story system at HYG Proxima |
| barnard | Barnard's Star | fastest proper motion; approaching | follows the moving HYG star |
| gliese710 | Gliese 710 | future Oort-cloud flyby (~1.3 Myr) | follows the moving HYG star |
| peg51 | 51 Pegasi b | 4.2-day orbit + star wobble (exaggerated, labeled) | story system at HYG Helvetios |
| kepler16 | Kepler-16 b | planet around a 41-day binary | story system from NASA archive RA/Dec/distance |
| algol | Algol | eclipsing pair (2.87 d) + third star at 90° | story system at HYG Algol, two orbit planes |
| polaris | Polaris | 29.4-yr Aa–Ab orbit; precession facts | story system at HYG Polaris |
| mira | Mira | 13-ly tail behind a fast star | HYG Mira + illustrated tail along its motion |
| orion | Orion Nebula | runaway stars AE Aur & μ Col flung from it | illustrated glow cloud + paths to the two HYG runaways |
| sgra | Sagittarius A* | S2's 16-yr orbit | story system at the galactic centre |

Tour adds: Proxima b, Kepler-16 b, Orion Nebula, Sagittarius A*.

## Approaches considered
1. **Reuse the story-system machinery** (chosen): `makeStarSystem` + `STORIES` cards + `addStoryLabels`. Minimal new code, same look.
2. Bespoke scene objects per stop: more freedom, much more code and merge risk.
3. Card-only stops (no visuals): cheap but loses the motion angle.

## Constraints
- Real numbers only; each card names its sources; "not to scale" / illustrative notes where exaggerated.
- `main.js` edits stay inside story-system setup, labels and the tour list (another branch edits shared functions).
- Small generic extensions to `makeStarSystem`: per-body custom position function and marker colour.

## Left to the builder
Exact colours, camera distances, label visibility ranges, nebula particle counts (kept small for phones).
