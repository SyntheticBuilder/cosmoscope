# Trending (favorites part 2): design

Date: Nov 20, 2026 · Status: waiting for the owner's approval

## Why
The owner wants people to see what's hot: the most visited places today, this week and this month. It gives visitors a reason to explore something new and makes the map feel alive. It's part 2 of favorites. Part 1 (favorites, collections, Top 10, shared links) is live.

## Owner's decisions
- **Where:** a "Trending" section at the **top of the Atlas tab**.
- **Ranges:** Today, This week, This month.
- **Minimum:** a place shows only once it has **at least 3 visits** in that range. Until then the section says "Not enough visits yet."
- **What counts:** **anything you can fly to**: planets, moons, story stops, constellations, new worlds and any of the 109,400 catalog stars.
- **A visit:** flying to a named place and staying there for 5 seconds or more. It counts once per person per place per day and is anonymous.
- **Hosting:** a small free Cloudflare counter. The owner made the account and connected this computer (Nov 20).

## Goals
1. **Trending section (Atlas tab, top):**
   - A small "TRENDING" heading with three choices: Today · Week · Month (Today is picked first).
   - Up to 10 places, ranked. Each row has the place name, a line such as "Planet · 14 visits", and Go.
   - Go flies there, the same as Fly there in the Atlas.
   - While loading: one quiet line, "Loading…". If the counter can't be reached (offline, blocked, down), the whole section is hidden and the Atlas works as before.
2. **Counting:** after a flight ends on a place, if the camera is still following it 5 seconds later, the app sends one anonymous "+1 for this place".
   - The app remembers what it has already counted today on this device (localStorage), so it doesn't ask twice.
   - The counter also refuses a second count from the same person for the same place on the same day (see Privacy).
3. **Fast and cheap:** the app loads nothing about Trending until the Atlas tab is opened. The list is cached for 5 minutes in the app and at Cloudflare.

## Non-goals
Accounts, comments, per-country lists, charts over time, and showing visit counts on cards.

## Anti-goals
- A visitor's identity stored anywhere: no IP addresses, no device ids, no cookies.
- Made-up or junk names showing on the list. The app shows only places it can name itself from its own data; anything else sent to the counter is ignored.
- Trending breaking the app. A failed or slow counter must never delay start-up, search or flights.
- Any new cost. Everything stays inside Cloudflare's free plan, and no card is on file, so it can't be charged.

## Approaches considered
- **Cloudflare Worker + D1 database (chosen).** A Worker is a small program that runs on Cloudflare; D1 is its free SQL database. The free plan has 100,000 requests a day, 100,000 database writes a day and 5 million reads a day, which is plenty. Counts are exact, and the top 10 for any range is one query.
- **Worker + KV storage.** KV allows only 1,000 writes a day on the free plan and is slow to show changes. It would run out on a busy day. Rejected.
- **Worker + Durable Object.** This works too, but it's more code and harder for the owner to look at. Rejected because D1 can be viewed in the Cloudflare dashboard as plain tables.
- **A ready-made analytics service** (for example GoatCounter). It needs another account, its lists can't be shaped into "place top 10 with a minimum of 3", and it would add a tracking script. Rejected.

## How it works

### The counter (Cloudflare Worker `cosmoscope-trending`)
- `POST /visit` with `{ id }` → 204 (empty). It checks the id's shape, checks it hasn't already been counted today for this person, then adds 1 to this hour's count for that place.
- `GET /top?range=day|week|month` → `{ places: [{ id, n }] }`: the top 10 with n ≥ 3 over the last 24 hours, 7 days or 30 days. Cloudflare caches it for 5 minutes.
- **Allowed ids (shape only):**
  - a plain app id (`[a-z0-9]`, up to 24 characters)
  - `star:<0–109,399>`
  - `con:<3 letters>`
  - `new:<planet name>`: letters, digits, spaces and `.+-'`, up to 40 characters
  - Anything else gets a 400 response and is not stored.
- Only pages from `syntheticbuilder.github.io` (and localhost while testing) are allowed to call it.

### Data (D1)
- `counts(hour, id, n)`: one row per place per hour. Rows older than 31 days are deleted once a day by a scheduled job.
- `seen(day, key)`: today's "already counted" marks. Rows from earlier days are deleted by the same daily job.

### Privacy
- `key` is a scrambled code made from the visitor's IP address, the place, and a secret that changes every day.
- It can't be turned back into an IP, and it means nothing the next day.
- The IP itself is never stored or logged.
- The About panel gets one line: "Trending counts visits anonymously: no IP addresses, cookies or accounts."

### The app side
- `src/trending.mjs`: the pure parts, with tests.
  - visit rules: which ids count, the 5 s timer and the once-a-day memory
  - id shape checks that match the Worker's
  - turning `{ id, n }` into rows, dropping any id the app can't name
- `main.js`: starts the 5 s timer when a flight ends on a place and cancels it if the camera leaves.
- `search.js`: draws the Trending section at the top of the Atlas tab.
- The counter's address lives in one setting at the top of `trending.mjs`.

## Calls I made (the owner can overrule)
- **Tours don't count.** Stops reached by the built-in Tour or a collection tour aren't counted, otherwise the Tour's stops would always top the list. Places you go to yourself (search, Atlas, labels, favorites, pins, shared links) do count.
- **The opening view doesn't count.** The app opens on Earth, so Earth would win every day. Earth counts only when someone flies to it.
- **"Today" means the last 24 hours**, not the calendar day. Counts are kept per hour, so the list doesn't empty out at midnight somewhere in the world.
- **Opt-out:** a "Count my visits for Trending" switch in Settings, on by default. Browsers that send the Global Privacy Control signal are never counted.
- **Star ids follow the current catalog order**, the same as pins and favorites. If the star catalog is ever rebuilt, old star counts could point at different stars. The plan would be to reset the counts at that point. Noted as a known limit.
- **Counter address:** `cosmoscope-trending.<subdomain>.workers.dev`. On first deploy Cloudflare asks for a subdomain name. The owner picks one that doesn't include their real name, because it's visible to anyone who looks at the app's network requests.

## Left to the builder
Exact styling within the existing Atlas look, toast wording, the SQL, and code layout.

## Setup steps for the owner (after approval)
1. When Cloudflare asks for a workers.dev subdomain during the first deploy, choose a name (I'll prompt you).
2. Nothing else. I create the database and the Worker from this computer with the login you approved, then show you where to see them in the dashboard.
