# Favorites, collections, shared links and My Top 10: design

Date: Nov 20, 2026 · Status: draft, waiting for the owner's approval

## Why
The owner wants people to keep the places they love beyond the 9 quick pins, gather them into collections, and send a collection to a friend. The friend gets a list to tap through, or presses Tour to be flown through it. A personal "My Top 10" works the same way. This is part 1. Part 2, trending places (most visited today, this week, this month), comes later and needs a small Cloudflare counter (owner's pick: "Split, Cloudflare later").

## Owner's decisions
- **Where:** a **Saved** tab in the search panel, next to Search and Atlas.
- **Names:** automatic (for example "Saturn · Nov 20, 2026"), and the owner can rename any favorite.
- **What a favorite remembers:** everything. That means the place, camera angle and distance, the followed object, the simulated date and time, the time speed and direction, and the Sun or Galaxy view.
- **Opening a shared favorite or collection:** time **runs at the saved speed** from the saved moment.
- **Collections:** shown as a list to tap through, with a **Tour** button that flies through it in order.
- **Top 10:** personal and ranked, and shareable like any collection.
- **Trending:** part 2. Not in this design.

## Goals
1. **Save in one tap.**
   - A "★ Save" chip right after "📍 Pin" in the bottom row.
   - A ☆ button on every fact card.
   - Either one saves the current view as a favorite and shows a toast: "Saved as ‘Saturn · Nov 20, 2026’".
   - Saving from a card also remembers that card's place.
2. **Saved tab** in the search panel, with these sections in order:
   - **My Top 10:** ranked 1–10. Move items up or down; remove them.
   - **Favorites:** newest first. Each row has the name, a subtitle (scale name or kind · date shown · speed), Go, Rename, ★ add to Top 10, add to a collection, and Delete.
   - **Collections:** each with a name and item count. It opens into its list. Share, Tour, Rename and Delete sit at the top; items can be reordered or removed.
   - **Pins:** your current pins, each with "Keep" to turn it into a favorite. Pins themselves stay quick and nameless and still work as now.
   - When nothing is saved, the tab shows a single line: "Tap ★ Save to keep a view here."
3. **Going to a favorite** flies the camera there:
   - It restores the date and time, speed, direction and view, and starts time running.
   - If the favorite follows an object, the camera follows that object at the saved moment (the same rules as pins).
   - If it has a story, its card opens.
4. **Share** works for a collection, My Top 10, or a single favorite.
   - It makes a link that carries the whole list inside it, so no server is needed.
   - On phones it opens the system share sheet (`navigator.share`). Elsewhere it copies the link and shows the toast "Link copied".
5. **Opening a shared link:**
   - The panel opens on a "Shared with you" list: its name, its items, a **Tour** button and **Save to my collections**.
   - Tapping an item goes there. Tour flies through the items in order using the same rhythm as the built-in Tour (flight plus about 9 seconds, a Next stop button and a Stop button). Each stop's name shows as its caption, and a story card opens where one exists.
   - The link is cleared from the address bar after loading, so a reload doesn't reopen it. The list stays available until it is closed.
6. **Renaming:** in place, up to 60 characters. An empty name goes back to the automatic one.

## Data
- **Favorite:**
  - `{ id, name, autoName, created, view: { t, q, logD, focus, anchor, off }, time: { ms, speedIdx, dir }, frame: 'sun'|'galaxy' }`
  - `view` has the same fields and rules as a pin, so the existing pin capture and fly-back code is reused.
- **Collection:** `{ id, name, items: [favorite…] }`. Items are copies, so deleting a favorite doesn't break a collection. My Top 10 is a collection with a fixed id, capped at 10.
- **Storage:** localStorage keys `cosmo.favs` and `cosmo.collections`. Failed storage is handled silently, with a one-time toast "This browser can't keep saved views."
  - Limits: 200 favorites and 30 collections of 50 items each. Hitting a limit shows a toast; nothing is dropped silently.
- **Link format:** `#s=1.<base64url>`, where `1` is the format version.
  - The payload is compact JSON: `{n: name, i: [[name, t, q, logD, focus, anchor, off, ms, speedIdx, dir, frame], …]}`.
  - Numbers are rounded to keep it short (positions to 6 significant digits, quaternion to 4 decimals).
  - At most 50 items per link. Ten items should stay under about 2,000 characters.
- **Safety:** a shared link is untrusted input.
  - Parse it strictly. Drop items with non-finite numbers, unknown ids (anything that's not a known focusable or `star:<idx>` within range), out-of-range speed or direction, or overlong names.
  - Names are shown only as text, never as HTML.
  - A broken link shows the toast "This link couldn't be opened" and nothing else.
- **Names:** the automatic name is the followed object's name, otherwise the free anchor's name, otherwise the scale name, then " · " and the shown date (the same date format as the time bar). Nothing is ever invented.

## Non-goals
Trending (part 2), accounts, syncing between devices, links that update after sharing, comments, and thumbnails.

## Anti-goals
- A shared link that breaks after future updates. The link format is versioned, and old versions keep loading.
- New first-load cost: Saved code is part of the bundle, but no data is fetched.
- A top bar that wraps, or any horizontal scroll at 375 px.
- Shared content ever running as HTML.

## Approaches considered
- **Link carries the data (chosen).** Free, private and needs no server. The cost is that links are frozen copies and longer.
- **Short codes stored on a server.** Short links that could be edited later, but this needs the server from part 2 and accounts or moderation. Could be revisited after part 2.
- **UI:** a Saved tab (chosen by the owner) or its own ★ top-bar button (rejected: the top bar is full on phones).

## Phone
- The Saved tab lives in the existing bottom sheet, with rows at least 44 px tall.
- Reordering uses up and down buttons, not dragging, so it works with screen readers and on small screens.
- With 9 pins, the "★ Save" chip sits right after "📍 Pin", so the scale chips start further right. The row still scrolls (known limit M7).

## Calls made after the builder check (my calls; the owner can overrule)
- **Which card opens:** a favorite opens the same card that tapping its followed object's label opens. It's derived from `focus`, so there's no extra field in the record or the link. Saving from a card for an object you aren't following saves that object as the focus at the default distance, not the free spot.
- **Time on restore:**
  - Always running, even if the view was saved while paused (owner: "running at the saved speed").
  - The saved speed wins over the Galaxy view's usual speed bump.
  - The existing snap to "Live" when the time is within 5 s of now is fine.
  - Going to a favorite stops any running tour.
  - Opening a shared link replaces the visitor's current time and view. That is the point of a shared moment.
- **Stars in links:** a star is stored as `star:<idx>` plus its best catalog name. When a link loads and the name at that index doesn't match, it looks the name up in the star index. If nothing is found, the item is dropped. This keeps old links correct if the catalog is ever rebuilt.
- **Collection Tour:** the existing tour code is generalised to take a list of stops. The built-in Tour becomes one such list.
  - Each stop's caption is the item's name.
  - "Next stop" on the card advances it.
  - Stop only stops. It doesn't rewind the time or the view.
- **Copies:** a collection item is a copy, so renaming or deleting the original favorite doesn't change the copy. The same favorite can't be added to one collection twice; trying shows the toast "Already in <collection>". Adding to a full Top 10 shows the toast "Top 10 is full: remove one first."
- **Save to my collections:** makes one new collection with the shared name, adding " (2)", " (3)" and so on if that name is taken. At the 30-collection limit it shows a toast and saves nothing.
- **Rounding in links:** `t` is rounded to 7 significant digits. `off`, `logD` and `q` are rounded to 4 decimals. A free spot near a moving object is stored as anchor plus offset, so it stays exact relative to that object.

## Left to the builder
Exact icons and styling within the existing look, the copy of minor toasts, and code layout. Pure logic (record shape, link encode and decode, validation, auto names) goes in a tested module, like `zoom.mjs` and `catalog.mjs`.
