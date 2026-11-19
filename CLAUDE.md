# CLAUDE.md: Cosmoscope

## What we're building
An interactive, zoomable map of the visible universe for the web and phones. You start at the Milky Way, pinch or scroll down into star systems, and back out to galaxy clusters and the edge of the observable universe. Each stop explains something cool.

**Our unique angle: motion.** Other universe maps show things standing still. Ours shows how everything moves: stars dragging their planets through the galaxy in spiral trails, binary stars dancing, the galaxy rotating. Each stop tells a short story.

Inspiration: the "Cosmos in Motion" reels (glowing helix orbit trails on black, short narrated captions). Take the *feeling*, never copy their graphics, wording, or branding.

## Owner
- Builds projects with Claude and isn't a full-time developer. Explain choices in plain language and keep setup steps simple.
- Wants this to be exceptional and shareable. Polish matters as much as features.

## Session start checklist
1. Read this file and `PROGRESS.md` (create it if it's missing).
2. Summarize where we left off in 3 lines or fewer.
3. Confirm today's goal before writing code.
4. Before any new feature, run the brainstorming skill and agree on the design.

## Core features (priority order)
1. **Seamless zoom**: smooth, continuous zoom across scale levels (Solar System → nearby stars → Milky Way → Local Group → cosmic web → observable universe). No hard cuts.
2. **Motion trails**: helix and spiral trails showing real relative motion. Toggle between "galaxy frame" (spirals) and "star frame" (normal orbits).
3. **Story stops**: tap a highlighted object to get a fact card (name, distance, number of planets/stars, one hook line, 2 to 4 short facts). An optional guided "tour" mode flies between stops with captions.
4. **Time controls**: play, pause, speed up, reverse.
5. **Live updates**: new exoplanets and discoveries pulled from public data sources, with a "New" badge.
6. **Video / share mode**: record a clip of the current view, sized vertically for reels.

## Science rules
- Positions, distances, and planet counts come from real data. Never invent numbers.
- When something is exaggerated for visibility (sizes, trail spacing, speed), show a small "not to scale" label, like the reels do.
- Each fact card lists its data source.
- If a fact is uncertain or debated, say so on the card.
- Data sources to use: HYG star catalog, ESA Gaia, NASA Exoplanet Archive (live), JPL Horizons (Solar System), SDSS / DESI (galaxies), NASA/ESA public imagery with credit.

## Visual style
- Pure black space with a fine star-dust background. Glowing additive-blend trails, each system with its own palette.
- Minimal UI: thin uppercase labels with small subtitles (e.g. "3 stars · 4.37 light-years"). Text never covers the subject.
- Calm, cinematic motion. Smooth camera easing, no jarring jumps.
- Original look only. No copyrighted imagery, logos, or characters.

## Tech rules
- Three.js / WebGL. Single page for the prototype; move to a proper project structure in Claude Code later.
- **Mobile first.** Target 60fps on a mid-range phone. Touch gestures (pinch zoom, drag, tap) are the main controls; mouse and keyboard come second.
- Use level-of-detail (LOD) and a logarithmic depth buffer or floating-origin system for universe-scale distances.
- Load data in chunks by zoom level. Never load everything at once.
- Keep live-data calls cached and fail gracefully if offline.
- Test on a phone-sized viewport before calling anything done.

## Workflow rules
- One feature at a time. Get it working and looking good, then move on.
- After each session, update `PROGRESS.md`: what's done, what's next, known bugs.
- Run a performance and polish review (audit-suite) before sharing any version.
- Ask before big changes to structure or style. Small fixes, just do them.
- Never claim something works without testing it.

## Don'ts
- Don't copy Cosmos in Motion graphics, captions, or audio.
- Don't add features that hurt phone performance without a toggle.
- Don't make up astronomy facts or data.
- Don't bury the experience in menus. Exploring should feel effortless.
