# Free zoom, no black gap, checkpoints: design

Date: Nov 19, 2026 · Status: approved by the owner ("Approve, build it")

## Why
The owner zoomed in from outside the observable universe and the screen went black for a stretch. Zoom also always ended at the Milky Way, so they couldn't explore anywhere else. They want to zoom freely, and to drop checkpoints they can fly back to if they get lost.

## Findings
- **Black gap:** stepping the camera out from home, the Local Group range (log10 distance from the Sun in AU ≈ 11–13, i.e. ~2–30 million ly) is nearly empty. HYG stars are gone above 9.1, the Milky Way fades out over 12.6–13.4, Local Group galaxies sit at opacity 0.55 and look small, and the cosmic web only fades in over 12.2–13.4 (`layerFades` in src/main.js).
- **Always the Milky Way:** `zoomBy` only changes `cam.logD` around `cam.target`, which follows `cam.focusId`. From the universe view the focus is at the Sun.

## Goals
1. **Never black:**
   - A faint, distant star-dust background is always drawn: a camera-centred sky layer, very low opacity, that doesn't move with zoom.
   - Adjacent scale layers overlap so at least one structure is always visible at every zoom level. The cosmic web starts fading in earlier, around 11.2.
   - Local Group galaxies stay visible longer and slightly brighter.
   - The Betelgeuse zoom-out dimming from the review (~100–250 ly) is fixed in the same pass if it's the same fade logic.
2. **Free zoom (zoom toward pointer):**
   - Wheel zoom moves toward the point under the cursor. Pinch moves toward the midpoint between the fingers.
   - The point under the pointer is the spot on the plane through `cam.target`, perpendicular to the view, under the cursor. Each zoom step moves the target toward it by the matching fraction, so that point stays put on screen.
   - Once the target leaves the focused object, the camera switches to a free focus fixed in space (the existing `new:here` pattern shows how). It stops following the old object, and the scale name still updates from distance.
   - Zooming out stays centred, so you can always pull back.
   - Keyboard +/− and double-tap zoom keep zooming toward the screen centre (double-tap could zoom toward the tap point: builder's call).
   - Taps on labels, search "Fly there", chips and the Tour still fly to objects as now.
3. **Checkpoints:**
   - A "📍 Pin" chip at the start of the bottom chip row saves the current view: target position, `logD`, camera orientation, and the focus id if it was following an object. It saves the place only, not the simulated time.
   - Pins show as chips "A", "B", … (at most 9). Adding a 10th says "Up to 9 pins: press and hold one to remove it."
   - Tap a pin to fly back. If it was following an object, it returns to that object's current position.
   - Press and hold (or right-click) a pin to remove it, with a toast "Pin B removed".
   - Pins are stored in localStorage (`cosmo.pins`). They survive reloads, and failing storage is handled silently.
   - Later, part 3 Favorites can import them.

## Non-goals
Naming pins, sharing pins, and saving the time in a pin.

## Anti-goals
- Any frame-rate cost on phones.
- Jarring jumps: everything eases.
- A drag that rotates the view must never be read as a zoom.

## Approaches considered
- **Zoom toward pointer (chosen, owner's pick).**
- Double-tap to re-centre: rejected by the owner in favour of free zoom.
- Ray-pick the nearest object under the cursor and fly to it: jumpy, and fails in empty space.

## Phone
Pinch focal point, 375×812 layout, and the chip row still scrolls. A long press must not trigger the browser's context menu or text selection on the chip.
