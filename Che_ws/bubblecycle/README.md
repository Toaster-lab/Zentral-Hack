# RECYCL IT! 

A friendly, mobile-first recycling and sustainable-shopping app for Rotkreuz (Risch, Switzerland). Find recycling stations, scan packaging
for recycling instructions, log recycling or check in at a station, earn points, redeem demo rewards, climb a fair leaderboard, and see
when waste is collected.

It runs in two ways, and the difference matters:

| | **On-device demo** (`python serve.py`) | **With the server** (`python -m server`) |
|---|---|---|
| Needs | Python 3 only | Python 3 and one package (`cryptography`) |
| Who decides what counts | The app on your phone | The server |
| Accounts | None | A passkey per account (no email, no password) |
| Good for | Trying the app, design work, demos | Real phone testing, staging, and anything that must not be editable by users |

In the on-device demo, anyone can edit their own browser storage and give themselves points. That is fine for a demo and is why every
limit and reward check also exists on the server. Everything marked "Demo" is sample data.

## Run it

**On-device demo.** You need **Python 3** (https://www.python.org/downloads/). Nothing else: no Node, no build step, no packages.
All libraries and fonts are bundled in `vendor/`, so the app runs offline after its first load.

| Platform | How |
|---|---|
| Windows | double-click **`start.bat`** |
| macOS | double-click **`start.command`** (first time: right-click › Open) or run `./start.sh` |
| Linux | `./start.sh` (first time: `chmod +x start.sh`) |
| Any | `python serve.py` (options: a port number, `--no-open`, `--lan`) |

It opens http://localhost:5173. Press Ctrl+C in the console window to stop. Don't double-click `index.html`: browsers block ES modules
on `file://` pages.

**With the server** (accounts, points and rewards kept server-side):

```
pip install -r requirements.txt
python -m server              # http://localhost:5174, demo mode
```

Full setup, environment variables, the review command and HTTPS staging are in [docs/STAGING.md](docs/STAGING.md). Testing on real
phones: [docs/PHONE-TESTING.md](docs/PHONE-TESTING.md).

**Install it like an app.** In Chrome or Edge use the install icon in the address bar (or Profile › Install). On a phone, use "Add to
Home screen". **Camera, location and passkeys** need `http://localhost` or `https`; over plain `http` on your network (`--lan`) the
browser blocks them.

**Your data** lives in your browser's storage for that address. The on-device demo, the demo server and the live server each use a
separate storage key, so their balances never mix.

## What you can do

- **Home:** this week's progress, shortcuts, the next quests, and (if you switch it on) a note the day before a collection.
- **Map:** real OpenStreetMap stations and bins for Rotkreuz plus a few labelled demo stations; hours, accepted materials, directions;
  add a missing place, confirm one is still there, report a problem (see "Community map" below).
- **Scan:** read a barcode with the camera (or type it) and see how each part of the packaging is recycled. Add barcodes the database
  doesn't know.
- **Discover:** find a snack or drink by what you say you want, with diet and allergen filters and honest packaging notes.
- **Log recycling:** choose materials and counts, optionally add a station receipt code. You confirm it's you as the last step.
- **Check in at a station:** adds evidence to a log (a one-time "is this device near the station?" check and an optional photo). Anything
  unusual is held for a quick look instead of being counted straight away, and you can add a note or withdraw it.
- **Rewards:** spend points on demo badges and vouchers; spending points never changes your leaderboard rank.
- **Leaderboard:** weekly or monthly, ranked by accepted items (not points), opt-in with a nickname.
- **Activity:** your log, points history, check-ins and anything saved offline that hasn't been sent.
- **Quests, Bottledex, Social:** optional monthly goals, a collection of container types, and friends/challenges/streaks (simulated people).
- **Collection calendar:** upcoming collections for Rotkreuz with material filters, an optional in-app reminder and an `.ics` export.
- **Profile:** account (server version), nickname, municipality, weekly goal, privacy, install. Developer tools are not part of the app's
  screens: they live at `#/dev` and do nothing on a live server.

## Confirm it's you

Before points are added or spent, the device asks the person holding it to unlock it, as the **last step** of logging, checking in or
redeeming. The form is filled in first; if the prompt is cancelled or fails, everything stays as typed and the same button says "Try
again". Pressing it twice doesn't send twice. The first time, a short explanation appears.

- **How:** WebAuthn / passkeys with user verification required. The operating system shows its own prompt: Face ID or face unlock,
  fingerprint, or the device passcode, whichever the device offers (a security key also works). A web page can't require face recognition
  specifically and never receives a face image, template or any biometric data. It receives a signed yes or no. The app never collects selfies.
- **With the server** the check is real: the server creates the challenge, verifies the passkey's signature, origin and
  user-verification flag, ties the result to one account, one purpose (log or redeem) and the exact submission, and accepts it for two
  minutes, once (`server/webauthn.py`, `server/auth.py`). The browser cannot say "I authenticated" on its own.
- **In the on-device demo** there is no server to verify anything, so the check only guards against someone using an unlocked phone
  (the signature isn't verified). If the device can't do it, a clearly labelled **simulated** step is offered (switch it off with
  `config.deviceAuth.allowSimulation`). A demo-server account without a passkey gets the same labelled step. A live server never accepts it,
  and results that used it say "Simulated".
- **What it means:** whoever holds the device or account just satisfied its screen lock. It does **not** show that the person recycled, that
  they were at a station, or that they have only one account. The screens say so.

## Demo versus live

| | On-device demo | Demo server (`BC_MODE=demo`) | Live server (`BC_MODE=live`) |
|---|---|---|---|
| Where activity, points, redemptions live | Browser storage | Server database (`bubblecycle-demo.db`) | Server database (`bubblecycle-live.db`), kept apart from demo |
| What leaves the device | Nothing (map tiles and optional Open Food Facts lookups only) | Log entries, check-in results (location *result* and a coarse photo fingerprint, never the photo or exact position), nickname if you opt in | Same as demo server |
| Limits, duplicates, daily caps | Enforced on the device | **Server** | **Server** |
| Points, balance, leaderboard counts | Computed on the device | **Server** | **Server** |
| Timestamps, "verified" labels, balances sent by the client | n/a | Ignored: the server uses its own clock and records | Ignored |
| Retry safety | n/a | Submission keys: a retry returns the original result | Same |
| Redemption | Device | **Server**, atomic (one write lock): cannot overspend or double-redeem | Same |
| Receipts → "verified" | Demo codes `BC-1001-ZH` … | Demo codes (demo mode only) | Only codes signed by a trusted issuer (`BC_RECEIPT_SECRET`); none if unset |
| Confirm it's you | Device-only passkey, or labelled simulation | Server-verified passkey; labelled simulation for passkey-less demo accounts | Server-verified passkey only |
| Check-in review | Demo reviewer buttons on your own device | Held items wait for staff (`python -m server review` or the admin API) | Same |
| Quests | All seven, claimed on the device | Four the server can verify (items, materials, verified items, weeks); the rest stay on the device and pay nothing | Same |
| Offline | Works; saved on the device | Saved on the device as **not counted**; the server re-checks when it is sent | Same |
| Map places, community review, products, barcodes, social, rewards catalogue | Sample/simulated | Sample/simulated | **Still sample/simulated** |

**Still simulated everywhere:** friends and challenges (people are generated), community map approvals (an on-device demo admin),
product and retailer data, municipal rules beyond the general guidance, the reward catalogue (fictional shops; codes start with `DEMO-`),
and the collection dates (sample dates, labelled).

**What is needed for real rewards and verified deposits**

- A **receipt/deposit issuer** you trust: a station machine or retailer backend that signs receipt codes (format in `server/receipts.py`) or confirms
  deposits itself. Without it nothing can honestly be called "verified", and the app doesn't call it that. Location and photos are
  evidence a person may find reassuring; they don't show what was put in a container.
- **Reward partners** that issue real vouchers and can verify redemptions, plus fraud rules for that value.
- A production deployment: HTTPS, backups of the database, monitoring, a privacy notice for the data above, a deletion process
  (Profile › Delete my account is built in), moderation, and a real review workflow for held items.
- Municipal open data for stations and the waste calendar.

## How it is built

- **Preact + htm** (bundled in `vendor/`): React-style components, no bundler. **Leaflet** + OpenStreetMap tiles for the map.
  **BarcodeDetector** for scanning with a **ZXing** fallback. Browser storage for the on-device copy.
- **Python server** (`server/`): standard library plus `cryptography`. SQLite with one write lock around anything that touches credit or
  balances. Serves the app and the API from one address, so the session cookie is HttpOnly + SameSite=Strict and passkeys bind to one domain.
- **One boundary:** screens call `services/` only. `services/index.js` routes each domain to a demo or live provider by `config.providers`;
  `services/api.js` / `account.js` / `activity.js` talk to the server; `services/deviceauth.js` does the passkey step. When the server serves
  the app it answers `/js/env.js` with `{ api: true, mode }`, which switches logging, rewards and the leaderboard over.
- **Shared rules:** `js/logic/` holds the pure rules. The server has the same rules in Python (`server/rules.py`, `server/zurich.py`); both
  are tested against the same fixtures (`tests/fixtures`) so they can't drift apart quietly.

```
bubblecycle/
  index.html, sw.js, offline.html   app shell, service worker, offline page
  serve.py                          on-device demo server (static files)
  requirements.txt                  server dependency (cryptography)
  server/                           the RECYCL IT! server (python -m server)
    rules.py zurich.py              limits, duplicates, evidence signals, quests, Zurich time
    service.py                      submissions, review, redemption, leaderboard, quests, account deletion
    auth.py webauthn.py             accounts, sessions, passkey and confirmation checks
    receipts.py                     trusted-receipt boundary
    http_server.py db.py config.py  API + static files, SQLite, settings
    data/                           stations.json, rewards.json (the server's copy; tests keep it in step with the app)
  js/
    app.js router.js store.js ui.js
    env.js config.js                where the rules come from; limits, points, providers
    logic/                          pure rules (activity, evidence, quests, social, calendar, zurich)
    services/                       demo/live providers, api, account, activity, deviceauth
    screens/                        home, map, scan, discover, rewards, leaderboard, activity, profile, calendar, dev …
    data/                           demo data
  tests/                            py (server), js (browser unit), e2e (end to end), fixtures
  tools/                            export_stations, build_precache, vendor, make_icons, fetch_osm
  deploy/ docs/ Dockerfile          staging and phone-testing setup (nothing publishes automatically)
```

## Offline and updates

- After one completed visit the app opens offline. The service worker (`sw.js`) stores every local HTML, CSS, JS, icon, font and library
  file named in `sw-manifest.js`, which `serve.py` and the server generate from the files on disk (static hosts run
  `python tools/build_precache.py`). The cache name carries a hash of those files, so each release gets a new cache and the old one is
  deleted when the new worker activates.
- **Updates never swap under your hands.** A new version downloads in the background and a banner offers "Update now"; it is disabled
  while a form is open ("Finish what you're doing, then update"), so nothing typed is lost.
- **Never cached:** `/api/` responses, other origins (map tiles, Open Food Facts), non-GET requests, anything outside the shell. Accounts,
  balances and evidence therefore never enter a general cache. Check-in photos live in the page's own storage, not in the cache.
- **Offline submissions with the server** are stored on the device as "Saved on this device, not counted" and listed under Activity. When
  you're back online you confirm once and the server re-checks each one (limits, duplicates, receipts, age: items older than 72 hours expire).
  Each can be accepted, held for review or refused with a reason, and a retry of something the server already received is recognised, not
  counted again. Offline items are never shown as accepted.
- **Maps are not available offline.** Tiles come from OpenStreetMap's servers and aren't stored, and the app says so. The station list and
  the rest of the app work.

## Testing

```
pip install -r requirements-dev.txt
python -m pytest tests/py                 # server: rules, limits, duplicates, idempotency, points, redemption races, review, passkeys, HTTP
python tests/run_js.py                    # browser unit tests: Zurich time, rankings, streaks, challenges, quests, store, calendar
python -m pytest tests/e2e                # end to end in Chrome, against real servers
```

(`python tests/run_all.py` runs the three in order.) The end-to-end tests need Chrome or Edge installed.

**What the tests establish.** The rules above hold for the cases tested, and the browser and server agree with each other and with an
independent time-zone database across clock changes. **What they don't.** They use Chrome's *virtual* authenticator, a *mocked* GPS
position and a *fake* camera, on a desktop engine. They say nothing about Face ID or fingerprint hardware, real GPS accuracy, Safari on
iOS, mobile keyboards, or other browsers. Those need a person with a phone: [docs/PHONE-TESTING.md](docs/PHONE-TESTING.md).

## Collection calendar

Profile › Collection calendar (or `#/calendar`). The dates are **sample dates** and labelled as such: nobody has loaded the municipality's
official schedule into this app. To use real dates, replace `COLLECTIONS` in `js/data/collection-calendar.js` and set `CALENDAR_SOURCE`
(kind `official`, the page the dates came from, and the date they were last checked); the screen then shows that source and date
instead of the sample warning. You can filter by material, switch on an **in-app** reminder (a note on Home the day before, shown only
when you open the app), and download an `.ics` file for your phone's calendar, with an optional 18:00 reminder the evening before.

**Reminders when the app is closed** need either your calendar app (use the `.ics`) or web push, which needs a push service, stored
subscriptions and a scheduler on the server. None of that exists here, so the app doesn't offer it and doesn't promise it.

## Honesty and fairness rules built in

- Every sample station, demo product, demo reward and demo player is visibly tagged.
- No environmental claims: products aren't ranked by "greenness"; certifications in demo data
  are shown as *Example label, not verified*; trade-offs (e.g. glass is heavier, PET trays aren't
  accepted by PET collection) are spelled out.
- Allergy filters hide products that contain **or may contain** the allergen.
- Leaderboard ranks by **accepted recyclable items** in the selected period only. Points are a
  separate ledger, so redeeming never changes rank.
- Safeguards: max 50 items per material per log, 150 items and 20 logs per day, duplicate logs (same material and count within 10 minutes)
  blocked, receipt codes single-use, and verified items shown separately with a "verified only" ranking toggle. With the server these are
  enforced there (and re-checked when a held check-in is approved); in the on-device demo they run on the device, which a determined
  person can change.

## Privacy

No email, no phone number, no analytics. **On-device demo:** everything is stored in your browser and nothing is sent anywhere, except map
tiles and the optional, opt-in Open Food Facts lookup (just the barcode). **With the server:** an account is a random ID plus the passkey's
public key (never a biometric); activity, points and redemptions are stored there; a nickname is stored only if you add one and is shown only
if you opt in to the leaderboard. Check-ins send the station, materials and counts, whether the device was near (the *result* of a one-time
location check and its accuracy, never your position), and a 64-bit fingerprint of the optional photo for spotting repeats (never the
photo). Camera frames are processed on-device. Profile › **Delete all my data** clears the device; **Delete my account** (server version)
removes the account and its records from the server, keeping only the fact that a receipt code was used. Demo and live databases are separate files.

## Accessibility

Large tap targets (44–48 px+), strong text contrast, visible focus rings, labelled controls, live-region toasts, and every animation disabled
under `prefers-reduced-motion`. Every dialog is one component (`Sheet` in `js/ui.js`) and is a real dialog: it has an accessible name, moves
focus into itself, keeps Tab inside, closes on Escape (topmost first; not while a submission is in progress), makes the page behind it
inert so nothing there can be reached or read, returns focus to the control that opened it, and follows the visual viewport so the form
stays above an on-screen keyboard. Tests cover the keyboard and focus behaviour; keyboards and screen readers on real phones are on the
manual checklist.

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
- **Brand:** the logo is `icons/logo.png` (dark artwork on white, always shown on a white disc). The brand orange `#F2A33A` (`--brand-orange`)
  is the app bar and the icon background; the logo's dark green is `--brand-deep`. Contrast: the dark ink on the orange is 7.6:1, white on the
  orange only 2.1:1, so **white text is never used on the orange** (white text stays on the green buttons, 6.7:1). The app icons are made
  by `python tools/make_icons.py` (needs `pip install pillow`; the generated PNGs are committed). The artwork itself reads "RECYCL IT" without the "!".
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

## Recycling check-in (evidence, review, privacy)

Home › *Check in at a station*, or a station on the Map › *Check in here*. Four steps: station and materials, location,
optional photo, summary to confirm. Every step can be skipped; skipping just keeps the check-in **Self-reported**.

**What the labels mean**
- **Self-reported:** you said so; nothing was checked.
- **Location checked:** the device was within 75 m of the station *plus* its reported GPS accuracy, and the fix was better than ±100 m.
  It does not show what was put in the container.
- **Confirmed by a collection partner:** reserved for a real deposit-confirmation integration. Nothing in this demo can reach it.

A photo can support a claim but doesn't prove a deposit. A product barcode identifies a product, not one physical item.

**Review, not accusation.** Warning signals (`js/logic/evidence.js`): several check-ins within an hour, overlapping check-ins at two
stations, 40+ items in one go, a photo that looks like an earlier one, stations too far apart for the time between, and a device
away from the station. Any signal holds the credit as *pending*: nothing is counted and no points are added until it is settled.
Poor GPS (inaccurate fix) is **not** a signal. Nobody is banned for one signal. Signals are shown only to the person who made the
check-in (Activity › Check-ins), where they can add a note (appeal) or withdraw. In the demo a *Demo reviewer* can approve or decline.

**Data.** Stays on the device: exact position (used once, never stored), the photo (deleted after the check-in unless you keep it;
up to 5 can be kept and deleted in Profile). Would be synced for rewards and challenges: station, materials and counts, time, the location
*result* and GPS accuracy, a 64-bit photo fingerprint (not the photo), a random device ID, the review status. Shared by choice: nickname and
totals (leaderboard), what friends may see. In this demo the "server" is simulated (`submitCheckin` in `services/demo.js`), so nothing is
actually sent. Checks that run on a device can be altered by a determined person; catching repeats across accounts needs some shared data.

**Offline.** Without a connection (or if the service call fails) a check-in is saved as *Waiting to send* and sent when the browser
goes online again. Credit stays pending until then.

**Device confirmation ("Confirm it's you").** Opening *Log recycling* or *Check in* first asks the device to confirm the person
holding it (`services/deviceauth.js`, `screens/authgate.js`). It uses WebAuthn with user verification required, so the OS shows its own
prompt: Face ID or face unlock, fingerprint, or the device passcode, whichever the device and its settings offer. A web page can't force
face recognition specifically, and never sees any biometric data; the app only gets pass/fail. It is needed once per submission (the sheet
starts unconfirmed each time it opens), and a failed or cancelled attempt keeps the draft and offers *Try again*. The first use creates a
device-bound passkey (id kept in local state, deleted with *Delete all my data*; the passkey itself can be removed in device settings).
What it means: someone else can't log activity on an unlocked device. What it doesn't: that you recycled, that you're at a station, or
that you have one account. If the device or connection can't do it (no screen lock, or http instead of https/localhost), the prototype
offers a clearly labelled **simulated** step (`config.deviceAuth.allowSimulation`, switch off for launch) that is never shown as a real check.
Prototype limit: with no server, the challenge is created on the device and the signature isn't verified; a backend must do both.

**Confirming it's you** happens when the check-in is submitted; see "Confirm it's you" above. With the server, a flagged check-in
waits for staff review (`python -m server review`) and can be appealed with a note or withdrawn from Activity.

**Not built yet:** evidence requirements for higher-value rewards beyond "verified items" (vouchers need 5), groups, team challenges, the
community feed and Community Events, partner deposit confirmation, and a reviewer web screen (review is a command and an API for now).
