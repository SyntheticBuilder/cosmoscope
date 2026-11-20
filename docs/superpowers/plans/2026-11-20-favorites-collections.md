# Favorites, Collections, Shared Links and My Top 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people save views (place, angle, time, speed, view mode) as favorites, group them into collections and a ranked My Top 10, share any of these as a link, and tap through or tour a shared list.

**Architecture:** One pure, unit-tested module `src/favorites.mjs` holds the record shape, validation, storage, link encoding and decoding, auto names and list operations. `src/main.js` adds capture and restore of a full view, the "★ Save" chip, a card ☆ button, a tour engine generalised to any list of stops, and the start-up link handling. `src/search.js` gets the third "Saved" tab.

**Tech Stack:** Three.js, esbuild IIFE bundle (`bash build.sh`), Node 22 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-20-favorites-collections-design.md`

## Global Constraints
- localStorage keys `cosmo.favs` and `cosmo.collections`. Limits: 200 favorites, 30 collections, 50 items per collection, Top 10 capped at 10. Every limit hit shows a toast; nothing is dropped silently.
- Link format `#s=1.<base64url of compact JSON>`. Payload: `{n: name, i: [[name, t, q, logD, focus, anchor, off, ms, speedIdx, dir, frame, starName], …]}`. At most 50 items. `t` is rounded to 7 significant digits; `off`, `logD` and `q` to 4 decimals.
- Names are 60 characters at most. An empty name goes back to the auto name, which is `<followed object name | anchor name | scale name> · <date as shown in the time bar>`.
- Shared links are untrusted. Drop items with non-finite numbers, unknown ids (not an own non-free focusable, not `star:<idx>` within the star count), speedIdx outside SPEEDS, dir not ±1, frame not 'sun' or 'galaxy', or names over 60 characters. Render names only with textContent. A broken link shows only the toast "This link couldn't be opened".
- Stars in links: `star:<idx>` plus the star's best catalog name. On load, if the name at that index differs, look the name up in the star index. If it's not found, drop the item.
- Restoring a favorite: stop any tour, fly to the place (pin rules: focus, else anchor + offset, else absolute spot), set `time.ms`, `speedIdx` and `dir`, unpause, set Sun or Galaxy view without the Galaxy view's usual speed bump, and open the focus object's card if it has one.
- Collection items are copies. The same favorite id can't appear twice in one collection ("Already in <name>"). Top 10 full: "Top 10 is full: remove one first."
- Collection tour: same rhythm as the built-in Tour (flight plus about 9 s), each item's name as the caption, "Next stop" on the card advances it, and Stop only stops.
- Phone first: no top-bar wrap and no horizontal page scroll at 375×812; rows ≥ 44 px; reordering with up and down buttons.
- Commits authored as the repo's configured user (noreply email), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never invent astronomy names or facts. Every name shown comes from existing focusables, the star index, or the user.

## Review Focus
- A link whose JSON is valid but whose fields are hostile (`__proto__` keys, a 10 MB name, nested arrays, `star:999999999`, NaN written as a string) → item dropped, no crash, nothing rendered as HTML.
- localStorage full or throwing mid-save → favorites stay usable for this visit, with the one-time toast "This browser can't keep saved views."
- Opening a shared link before stars have loaded (an item is `star:<idx>`) → that item waits for the star data or resolves once it loads; it never throws and is never silently lost.
- Saving while a flight is in progress or in a free spot with no anchor → the absolute spot is saved, never a half-finished flight target.
- A shared link opened while the built-in Tour is running, or while full-screen (clean) mode is on → the Tour stops and the UI comes back so the list can be seen.

---

### Task 1: `src/favorites.mjs`, the pure logic

**Files:** Create `src/favorites.mjs` and `tests/favorites.test.mjs`.

**Interfaces, produced:**
- `FAV_KEY = 'cosmo.favs'`, `COLL_KEY = 'cosmo.collections'`, `TOP10_ID = 'top10'`, `LIMITS = { favs: 200, colls: 30, items: 50, top10: 10, name: 60, linkItems: 50 }`.
- `validFavorite(f, { speeds, isKnownId }) → boolean`. Strict own-property checks, the same as `validPin` in `src/zoom.mjs`, plus `time: { ms, speedIdx, dir }`, `frame`, `name` and `autoName`.
- `loadFavs(storage, opts)` / `saveFavs(storage, favs) → boolean`; `loadColls(storage, opts)` / `saveColls(storage, colls) → boolean`. They never throw; broken entries are dropped. `loadColls` always returns a Top 10 collection first.
- `autoName(label, dateText) → string` (`"Saturn · Nov 20, 2026"`). `cleanName(input, autoName) → string`: trims, caps at 60 characters, and falls back to the auto name if empty.
- `addItem(coll, fav, cap) → { ok, reason: 'dup'|'full'|null, coll }`, `moveItem(coll, i, delta) → coll`, `removeItem(coll, i) → coll`, `uniqueName(name, takenNames) → string` (adds " (2)", " (3)" …).
- `encodeShare({ name, items }) → string` (the part after `#s=`), and `decodeShare(str, { speeds, isKnownId, starName }) → { name, items } | null`. `starName(idx)` returns the catalog name at that index, or null if the index isn't loaded. Items whose star names don't match are returned with `needsLookup: true` instead of being dropped, so main.js can resolve them through the star index.

- [ ] Write tests:
  - round trip encode then decode, with values equal after rounding
  - rounding rules (7 significant digits for `t`, 4 decimals for the rest)
  - version prefix: `2.` → null; garbage → null; an empty item list → null
  - hostile payloads (see Review Focus): dropped items, no throw
  - 51 items → 50
  - name over 60 characters → item dropped
  - `cleanName` falls back to the auto name and caps the length
  - `addItem` reports dup and full (Top 10 and 50 items)
  - `moveItem` at the edges does nothing
  - `uniqueName`
  - load and save with throwing storage, bad JSON and a missing Top 10
- [ ] Run `npm test` and see the new tests fail. Implement. Run `npm test` and see everything pass.
- [ ] Commit.

### Task 2: Capture, restore, save chip, card ☆, generalised tour, link start-up (main.js)

**Files:** Modify `src/main.js`, `index.html` (the card ☆ button and any styles).

**Interfaces, consumed:** Task 1 exports; the existing `pinFocusId`, `flyToPin` logic, `setFreeFocus`, `fmtDate`, `scaleName`, `toast`, `TOUR` and `tourStep`, `settings.view`, and `ensureStarFocus`.

**Interfaces, produced** (passed to `initSearch(api)` for Task 3): `api.saved = { list(), colls(), saveCurrent(fromCardFocusId?), restore(fav), rename(id, name), remove(id), addTo(collId, favId), newColl(name), renameColl, removeColl, moveInColl, removeFromColl, share(coll | fav), startListTour(items), keepPin(pinId), shared: () => sharedList | null, saveShared() , onChange(cb) }`.

- [ ] Factor `captureView()` out of the pin chip (same rules: during a flight or in a free spot with no anchor, save the absolute spot). Factor `restoreView(v)` out of `flyToPin`. The pin chip keeps working exactly as before.
- [ ] Add the "★ Save" chip right after "📍 Pin", and a ☆ button on the fact card (aria-label "Save this place"). Saving from a card for an object you aren't following saves that object as the focus at its default distance. Show the toast "Saved as ‘<name>’".
- [ ] Add `restoreFavorite(fav)` following the Global Constraints. Go through a new `setView(frame, { bump: false })` helper so the Galaxy view's speed bump is skipped.
- [ ] Generalise the tour. `startTour(stops)` takes `[{ go(), caption }]`, and the built-in Tour becomes one such list built from `TOUR`. A collection tour uses favorites' `restoreFavorite`, with each item's name as the caption. "Next stop" advances it, and Stop only stops.
- [ ] Start-up: if `location.hash` starts with `#s=`, decode the link, then clear the hash with `history.replaceState`. If the link is broken, show the toast. Otherwise exit clean mode, stop the Tour, keep the shared list in memory, and open the search panel on the Saved tab's "Shared with you" section. Items that need a star lookup are resolved when the star index loads.
- [ ] `share(listOrFav)`: build the URL (`location.origin + location.pathname + '#s=' + encodeShare(...)`). Use `navigator.share({ title, url })` if it exists (ignore AbortError), otherwise `navigator.clipboard.writeText` and the toast "Link copied". If both fail, show the URL in a prompt-free toast.
- [ ] Manual check, desktop and 375×812: save from the chip and from a card, reload and restore, open your own share link in a new tab, and confirm the tour runs. No console errors.
- [ ] Commit.

### Task 3: Saved tab (search.js)

**Files:** Modify `src/search.js`, `index.html` (the tab button and styles).

**Interfaces, consumed:** `api.saved` from Task 2.

- [ ] Add a third tab "Saved" (the ARIA tab pattern already in place handles the arrow keys). The sections, in order, are:
  - "Shared with you", only when there is one: name, Tour, Save to my collections, items.
  - "My Top 10"
  - "Favorites"
  - "Collections"
  - "Pins", only when there are some
  - When nothing is saved, show the single line "Tap ★ Save to keep a view here."
- [ ] Favorite row: name, then a subtitle `<scale or kind> · <date> · <speed label>`. Buttons: Go, Rename (an inline input; Enter saves, Esc cancels), ★ Top 10, + Collection (a small chooser listing collections plus "New collection"), and Delete. All rows and buttons are at least 44 px tall on phones, with aria-labels that include the item name.
- [ ] A collection opens into its own list (a back button returns). At the top: Share, Tour, Rename and Delete; each item has up, down, remove and Go. Up is disabled on the first item and down on the last.
- [ ] Pins section: each pin with "Keep", which turns it into a favorite using the auto name.
- [ ] Re-render on `api.saved.onChange`. Focus stays on a sensible element after deleting or moving.
- [ ] Manual check, desktop and 375×812: every button, keyboard-only pass, no horizontal scroll, no console errors.
- [ ] Commit.

### Task 4: Docs and polish

**Files:** Modify `README.md`, `PROGRESS.md`, and the About panel in `index.html`.

- [ ] README "What's inside": add Favorites, collections, My Top 10 and shared links. PROGRESS.md: add to Done; Next ideas has part 2 Trending (Cloudflare counter, 5 s visit rule, once per person per place per day) at the top; note any known limits.
- [ ] About: one line that shared links carry the list inside the link, and nothing is sent to a server.
- [ ] `npm test` and `bash build.sh` both pass. Commit.
