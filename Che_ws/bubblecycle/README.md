# BubbleCycle 🫧

A friendly, mobile-first recycling and sustainable-shopping MVP for Switzerland.
Find recycling stations, discover treats with honest sustainability info, scan packaging
for recycling instructions, log recycling, earn points, redeem demo rewards and climb a
fair leaderboard.

## Run it

You need **Python 3** (https://www.python.org/downloads/). Nothing else: no Node, no build step, no packages.
All libraries and fonts are bundled in `vendor/`, so the app runs offline after its first load.

| Platform | How |
|---|---|
| Windows | double-click **`start.bat`** |
| macOS | double-click **`start.command`** (first time: right-click › Open) or run `./start.sh` |
| Linux | `./start.sh` (first time: `chmod +x start.sh`) |
| Any | `python serve.py` (options: a port number, `--no-open`, `--lan`) |

It opens http://localhost:5173 in your browser. Press Ctrl+C in the console window to stop. Don’t double-click
`index.html` itself: browsers block ES modules on `file://` pages.

**Install it like an app.** In Chrome or Edge use the install icon in the address bar (or Profile › Install). On a phone, use
“Add to Home screen”. The service worker keeps an offline copy; map tiles and the optional Open Food Facts lookup still need a connection.

**Camera and location** work on `http://localhost` and on `https`. With `python serve.py --lan` other devices on your network can open
the app, but browsers block the camera and location on plain `http` there; to use those on a phone, host the folder on any HTTPS static host
(Netlify, Vercel, GitHub Pages, Cloudflare Pages…): it’s just static files.

**Your data** lives in your browser’s storage for that address (`localhost:5173`). Using another port or browser starts fresh.

**Updating the bundled libraries** (optional, needs internet): `python tools/vendor.py .` re-downloads the pinned versions into `vendor/`.
`python tools/make_icons.py .` regenerates the icons.

## Stack

- **Preact + htm** (bundled in `vendor/`): React-style components, no bundler.
- **Leaflet** (bundled) + OpenStreetMap tiles for the map.
- **BarcodeDetector API** for camera scanning, falling back to **ZXing** (bundled, loaded on demand) in
  browsers without it; manual entry always works.
- **localStorage** for all user data (nothing leaves the device).

## Project layout

```
bubblecycle/
  index.html            app shell
  css/styles.css        pastel design system (tokens, components, reduced-motion)
  serve.py              no-cache dev server
  js/
    app.js              routing + bottom navigation
    config.js           provider switches (demo/live), limits, points
    store.js            local state, logging, redemption
    ui.js               icons, chips, sheets, toasts, states
    logic/              pure logic: recycling rules, logging/leaderboard, discovery, hours
    data/               DEMO data: stations, places, products, barcodes, rewards, players
    services/
      index.js          the only module screens call; routes to demo or live
      demo.js           demo providers (sample data + simulated latency)
      live.js           live provider stubs to implement
      openfoodfacts.js  optional real barcode lookup (opt-in)
    screens/            home, map, scan, discover, rewards, leaderboard, activity, profile
```

## Try the main flows

1. **Find a station**: Map tab → type `8003`, `Bern` or `Lausanne`, or tap the locate button.
   Filter by material, switch Map/List, tap a station for hours, materials and directions.
2. **Discover**: Home → *Find a sustainable treat*, or type "I want a sweet treat from Migros".
   Answer the optional diet question or open *Refine*.
3. **Scan**: Scan tab → tap a demo barcode (e.g. *Dark chocolate bar* needs packaging
   confirmation; *Unknown product* shows the fallback), or type `2000000000015`.
4. **Log recycling**: from Home, a station or a scan result. Use a demo receipt code such as
   `BC-1002-ZH` to make the log *verified*. Try logging the same thing twice to see the
   duplicate safeguard.
5. **Rewards**: redeem a badge or demo voucher. Your points drop, your rank doesn't change.
6. **Leaderboard**: set a nickname and opt in on Profile, then compare weekly/monthly.
7. **Error states**: Profile › Developer › *Simulate network errors*.

## What's demo vs. what's real

| Feature | In this MVP | Needed for a real launch |
|---|---|---|
| Stations and bins (Rotkreuz) | **Real** OpenStreetMap snapshot (3 recycling points, ~21 bins) plus 4 labelled **demo** stations | Municipal open data (Risch), live OSM refresh, or your own database; see "Rotkreuz launch" below |
| Place search | **Demo** gazetteer (Rotkreuz places; other towns only answer "starting in Rotkreuz") | Geocoder, e.g. geo.admin.ch (swisstopo) search or Nominatim |
| Your location | **Real** (browser geolocation, stored only as ~1 km area) | Same |
| Map | **Real** OpenStreetMap tiles | A tile provider with a commercial plan or self-hosted tiles (the OSM tile servers aren't for production apps) |
| Products | **Demo** listings ("Migros (example retailer)"); prices illustrative; labels marked *not verified* | Retailer product API agreement; label verification from official registries; live prices and availability |
| Barcode → packaging | **Demo** barcodes (GS1 internal prefix 200…, so they can't clash with real products) | Packaging database (retailer data, GS1 data); optional **real** Open Food Facts lookup is built in (Profile › Data sources, off by default) |
| Recycling rules | General Swiss guidance plus a few municipality tweaks | Per-municipality rules and collection calendars (municipal data or a provider) |
| Receipt verification | **Demo** codes `BC-xxxx-XX` | Station machines or retailer systems that issue verifiable codes, checked server-side |
| Points and rewards | Points are **real** (local); rewards are **fictional** (no partners) | Partner agreements, voucher issuing, fraud controls |
| Leaderboard | Other players are **fictional**; your entry is real (opt-in) | Backend with accounts or anonymous IDs, server-side limits and duplicate detection, moderation of nicknames |

To connect a real service, implement the function in `js/services/live.js` (same
signature and return shape as `demo.js`), then set that domain to `'live'` in
`js/config.js`. Screens don't need to change.

## Honesty and fairness rules built in

- Every sample station, demo product, demo reward and demo player is visibly tagged.
- No environmental claims: products aren't ranked by "greenness"; certifications in demo data
  are shown as *Example label, not verified*; trade-offs (e.g. glass is heavier, PET trays aren't
  accepted by PET collection) are spelled out.
- Allergy filters hide products that contain **or may contain** the allergen.
- Leaderboard ranks by **accepted recyclable items** in the selected period only. Points are a
  separate ledger, so redeeming never changes rank.
- Safeguards: max 50 items per material per log, 150 items and 20 logs per day, duplicate
  logs (same material and count within 10 minutes) blocked, receipt codes single-use, and
  verified items shown separately with a "verified only" ranking toggle. In this MVP these
  run on the device; a real launch must enforce them on a server.

## Privacy

No account, no email, no analytics. Stored locally: optional nickname, municipality, weekly goal,
preferences, recycling logs, points, redemptions and the last searched area (coarse). Camera
frames are processed on-device and never stored. *Profile › Delete all my data* wipes everything.

## Accessibility

Large tap targets (44–48 px+), strong text contrast, visible focus rings, labelled controls,
keyboard-closable dialogs, live-region toasts, and every animation disabled under
`prefers-reduced-motion`.

## Rotkreuz launch and community map

The app is limited to **Rotkreuz (Risch, Canton Zug)**: the map is centred there, the supported
area is drawn as a dashed circle with the outside dimmed, and searching elsewhere answers
“We’re starting in Rotkreuz. More places are coming!”.

**Adding another town later:** add an entry to `js/data/areas.js` (id, centre, radius), load its
locations, and add places/postcodes to `js/data/places.js`. Every location has an `areaId`, and
the map only loads locations for one area and the current view (`loadLocations({ areaId, bbox })`).

**Location data**
- **Real:** `js/data/osm-rotkreuz.js`, a dated snapshot of OpenStreetMap nodes (© contributors, ODbL).
  OSM is community-made, so it’s labelled “OpenStreetMap”, not “verified”. Refresh with
  `python tools/fetch_osm.py` (then regenerate the JS file; the Overpass API can be flaky, retry).
- **Demo:** 4 stations, labelled “Demo location”.
- OSM only knows 3 recycling points here and often lacks accepted materials, which the community can add.

**Community flow** (all on-device in this demo, in `js/services/community.js`)
1. Map › **Add a place**: drop/drag the pin (or use location; arrow buttons nudge it), choose station or
   bin, materials, optional photo (resized and stripped of metadata on-device), optional hours/access/description.
   Nearby existing places are suggested first so people update instead of duplicating.
2. The submission is **Pending review**: only its author sees it on the map. Status messages appear under
   Profile › **My contributions**.
3. Profile › **Admin review (demo)**: approve, edit, merge into a duplicate, or reject with a reason.
   Approved places become normal public map locations.
4. Each place has **Still here ✓**, **Suggest a correction** and **Report an issue**
   (wrong location, bin full, damaged/inaccessible, incorrect info, removed). *Temporary* issues
   (full, damaged) show as a ⚠ on the place and expire by themselves (24 h / 7 days) without changing the
   record. *Permanent* ones (wrong location, wrong info, removed) wait for review. The place shows when it was
   last confirmed.

**Rewards for helping the map:** approved place +25 (+5 with photo), merged +10, accepted fix +5,
confirming a place +2 (max 3/day, once per place per week). Temporary reports earn nothing (anti-farming).
These are spendable points in the points ledger only. They never create recycling activity, so recycling
counts and the leaderboard are unaffected. Points arrive after review, never on submit.

**Privacy:** public pages show only the place, never who added it. Contributions are tied to a random ID on the
device. Users are reminded not to photograph people, faces or number plates, and the admin view reminds
reviewers to check photos.

**Before accepting real public submissions you need:** a backend and database (PostGIS/area-bbox queries),
authentication or abuse-resistant identities, server-side rate limits, object storage with image scanning
and moderation for photos, authenticated reviewers with an audit log, server-side reward payout, a
privacy notice and terms for contributions, and agreed data licensing (OSM data must stay credited/ODbL;
decide the licence for community submissions). Replace the demo admin view, which has no login.

## Discover search

Typing a product type returns that type: “soda” gives sodas, “chocolate” chocolates. Mood words like
“something sweet” only act as flavour hints. If you ask for something the demo can’t match (e.g. “pizza”) it says so
instead of showing unrelated products.

## Social: friends, challenges and streaks (optional)

The **Social** tab replaces Profile in the bottom bar; Profile, rewards and settings now live in the
avatar button at the top right. Social is opt-in: nothing is shared until you set up a profile, and
everything is off by default (totals, streaks, milestones). *Leave Social* removes it again.

- **Friends:** nickname + avatar + exact username. Add by exact username search (no browsing or prefix
  search; non-discoverable people return the same "not found"), by invite link (`#/social?add=username`)
  or QR code. Friend requests with accept/decline, cancel, remove, block/unblock, and report. Reactions
  are presets only (“Nice work!”, 🌿, 🎉, “Keep going!”). No messaging.
- **Challenges:** weekly or monthly, “this” or “next”, with Europe/Zurich boundaries, invited friends
  must accept (the join screen explains what participants will and won’t see). Ranked by **eligible items
  logged during the challenge** (never lifetime totals or points). Only activity after the start *and*
  after you joined counts, each log once. A challenge is either **Self-reported** (every eligible item
  counts, verified ones are marked) or **Verified only** (receipt-code items), so everyone is compared the
  same way. Household rubbish is not a recyclable material, so it never counts. When a challenge ends the
  result is frozen; finishing with at least one eligible item earns a digital badge (no points).
- **Streaks:** a week (Mon–Sun, Zurich) counts if it has at least one eligible logged activity. Shows current
  and longest streak, this week’s status, and recent weeks. A streak ends only after a full week passes,
  with supportive wording (“A fresh week, a fresh start.”). Optional in-app reminders can be turned off.
  Copy avoids pushing purchases or extra trips.
- **Privacy:** friends see only what you allow (totals this week, streaks, milestones). Never places, visit
  times or movement history. Milestones carry no times beyond “days ago”. Leaderboard nicknames remain a
  separate opt-in.
- **Time:** weeks, months and challenge boundaries (and daily log limits) now use Europe/Zurich, DST-aware.

### What is simulated
Friends, their activity, their replies to requests and challenge invitations (after ~15–40 seconds), and
their challenge progress are **generated** by `js/services/social.js` + `js/data/social-demo.js` and
labelled “Simulated”. Your own activity is real. Try usernames `minty_marta`, `glass_gabi`, `alu_andri`,
`lavender_lea`, `peachy_pia`; `quiet_quinn` is deliberately not discoverable.
Profile › Developer has a **demo clock** (+1 week) to watch challenges end and streaks rest, and a reset.

### Needed for real accounts and syncing
Accounts with unique usernames and authentication; a friends/blocks/reports database and moderation queue;
server-side activity records (so counts can’t be edited), deduplication, challenge scoring and finalisation;
invitations/reminders via push or email with consent; invite links/QR codes that resolve to profiles;
rate limits and abuse controls; a privacy notice covering friend data. `js/logic/social.js` holds the rules so
a server can reuse them; `js/services/live.js` documents the expected API.

## Design system

`css/styles.css` holds layout and component structure; `css/theme.css` owns the look. Tokens are at the top of `theme.css`.

- **Palette:** a warm paper background (`--paper`), solid surfaces, warm ink, and one green accent (`--accent`). Amber (`--warn-tint`) is used
  only for warnings and demo labels; red (`--error`) only for errors.
- **Type:** Fraunces (soft serif) for headings, Source Sans 3 for text.
- **Shapes (kept consistent):** cards and sheets 8px, buttons and inputs 6px, pills only for filter chips and status tags, circles only for avatars,
  map markers, progress rings and the switch knob.
- **Surfaces:** flat and bordered, no shadows. Glass (a light blur) is a small accent on the floating bottom navigation and the map's search field only,
  and falls back to a solid surface when blur is unsupported or reduced transparency / more contrast is requested.
- **Layout patterns:** screens use open sections (`.section`) and divided lists (`.list`, `.list-row`) rather than a card around everything:
  Home actions, station lists, product rows, rewards, leaderboard, friends, challenges and activity are all lists.
- **Images:** no decorative illustration. Product rows show a photo only if the product data has a `photo` URL; otherwise a plain “No photo” tile.
  Stations show a photo only if a contributor added one. A retailer feed would supply product photos; station photos should come from real contributors.
- **Avatars:** initials on one of six warm colours (no emoji).
- **Copy:** short and literal (“You logged 8 items this week”), no slogans, no emoji in labels, no environmental claims. Errors say what happened and
  what to do next.
- **Usability:** 44–48px tap targets, a dark 3px focus outline, selected/disabled/error states that don’t rely on colour alone, and animations stop
  under `prefers-reduced-motion`.

## Bigger database, Bottledex, own barcodes and quests

**More items.** The demo barcode database grew from 8 to 62 products (drinks in PET, glass, cans and cartons, food packaging, household
bottles, batteries) and Discover from 26 to 62 products, with new Juice and Breakfast types. Barcodes use the GS1 internal prefix `200…`, so they can’t
clash with real products; names are generic, prices and labels are illustrative. Barcode list: `js/data/barcodes.js`; products: `js/data/products.js`.

**Bottledex** (Collection, from Home or Profile). A numbered field guide of 48 container types (wine and beer bottles, jars, PET bottles, cans, tins,
cartons, HDPE bottles, batteries…). Scan a product that comes in a container to find it; silhouettes are generic drawings (no photos are invented, and it
uses no Pokémon names or art, only the “numbered collection” idea). Each entry shows what to do with that container for your municipality. The page
says plainly that it’s not a shopping list: you collect by scanning things you already own.

**Add a barcode.** Scan › *Add a barcode* (or *Add this barcode* when a product is unknown): barcode (check digit validated), name, main container from the
Bottledex, and other parts. It’s saved on the device, gives recycling guidance on the next scan and unlocks the container in the Bottledex (marked
“added by you”). Self-added barcodes don’t count towards scan or Bottledex quests, so quests can’t be farmed by inventing barcodes. A real launch would
send submissions to a shared, reviewed product database.

**Monthly quests** (Home › Monthly quests). Seven optional goals that reset each calendar month in Europe/Zurich time, each with a one-off bonus you claim
yourself: recycle 25 items, try 4 materials, log 5 verified items, recycle in 3 different weeks, check 5 products by scanning, add 3 Bottledex
entries, help the map twice. They read only validated activity (duplicates are already blocked), and the bonus is spendable points only: it never
becomes recycling activity, so it can’t move anyone on the leaderboard. Nothing asks for purchases or extra trips. Quest rules: `js/logic/quests.js`.
