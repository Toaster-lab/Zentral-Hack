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
- **Map:** the pilot's one recycling point in Rotkreuz (PET drink bottles and aluminium), supplied by the team, with directions; confirm it is
  still there or report that it is full or damaged ([pilot catalogue](docs/FEATURES.md#pilot-catalogue)). Adding places is paused.
- **Scan:** read a barcode with the camera (or type it) and see how the packaging is recycled. Three drinks are known; any other barcode
  says it is not in this pilot catalogue.
- **Discover:** find one of the three drinks by name or type. Details nobody has supplied (price, diet, allergens) are shown as not available.
- **Log recycling:** choose materials and counts, optionally add a station receipt code. You confirm it's you as the last step.
- **Check in at a station:** adds evidence to a log (a one-time "is this device near the station?" check and an optional photo). Anything
  unusual is held for a quick look instead of being counted straight away, and you can add a note or withdraw it.
- **Rewards:** spend points on demo badges and vouchers; spending points never changes your leaderboard rank.
- **Leaderboard:** weekly or monthly, ranked by accepted items (not points), opt-in with a nickname.
- **Activity:** your log, points history, check-ins and anything saved offline that hasn't been sent.
- **Quests, Bottledex, Social:** optional monthly goals, a collection of container types, and friends and challenges with a streak card (simulated people).
- **Collection calendar:** upcoming collections for Rotkreuz with material filters, an optional in-app reminder and an `.ics` export.
- **Profile:** account (server version), nickname, municipality, weekly goal, privacy, install. Developer tools are not part of the app's
  screens: they live at `#/dev` and do nothing on a live server.

## Confirm it's you

Before points are added or spent, the device asks the person holding it to unlock it (a passkey with user verification: Face ID,
fingerprint or passcode, whichever the device offers). With the server the check is verified there; in the on-device demo it only guards
against someone using an unlocked phone, and a labelled **simulated** step is offered if the device can't do it. It does not show that
the person recycled or was at a station. Details: [docs/FEATURES.md](docs/FEATURES.md#confirm-its-you).

## Demo versus live

| | On-device demo | Demo server (`BC_MODE=demo`) | Live server (`BC_MODE=live`) |
|---|---|---|---|
| Where activity, points, redemptions live | Browser storage | Server database (`bubblecycle-demo.db`) | Server database (`bubblecycle-live.db`), kept apart from demo |
| What leaves the device | Nothing (map tiles only) | Log entries, check-in results (location *result* and a coarse photo fingerprint, never the photo or exact position), nickname if you opt in | Same as demo server |
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
| Products and the recycling point | Three drinks and one location supplied by the team | Same | Same: **no retailer feed is connected** |
| Community review, social, rewards catalogue | Sample/simulated | Sample/simulated | **Still sample/simulated** |

**Still simulated everywhere:** friends and challenges (people are generated), community map approvals (an on-device demo admin, paused in the pilot),
municipal rules beyond the general guidance, the reward catalogue (fictional shops; codes start with `DEMO-`),
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
    data/                           stations.json (+ retired_stations.json), rewards.json (the server's copy; tests keep it in step with the app)
  js/
    app.js router.js store.js ui.js
    env.js config.js                where the rules come from; limits, points, providers
    logic/                          pure rules (activity, evidence, quests, social, calendar, zurich)
    services/                       demo/live providers, api, account, activity, deviceauth
    screens/                        home, map, scan, discover, rewards, leaderboard, activity, profile, calendar, dev …
    data/                           catalogue.js (the three drinks and the one location), migros-import.js (empty), other demo data
  tests/                            py (server), js (browser unit), e2e (end to end), fixtures
  tools/                            export_stations, import_migros, build_precache, vendor, make_icons
  deploy/ docs/ Dockerfile          documentation, staging and phone-testing setup (nothing publishes automatically)
```

## Offline

After one visit the app opens offline, and updates never replace a page you are filling in. Maps need a connection. Details:
[docs/OFFLINE.md](docs/OFFLINE.md).

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
tiles. Barcodes are looked up in the app only. **With the server:** an account is a random ID plus the passkey's
public key (never a biometric); activity, points and redemptions are stored there; a nickname is stored only if you add one and is shown only
if you opt in to the leaderboard. Check-ins send the station, materials and counts, whether the device was near (the *result* of a one-time
location check and its accuracy, never your position), and a 64-bit fingerprint of the optional photo for spotting repeats (never the
photo). Camera frames are processed on-device. Profile › **Delete all my data** clears the device; **Delete my account** (server version)
removes the account and its records from the server, keeping only the fact that a receipt code was used. Demo and live databases are separate files.

## More documentation

| | |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Confirm it's you, check-in evidence and review, community map, Discover, Social, Bottledex and quests, collection calendar |
| [docs/DESIGN.md](docs/DESIGN.md) | Design system and accessibility |
| [docs/OFFLINE.md](docs/OFFLINE.md) | Service worker, updates, offline submissions |
| [docs/MIGROS-IMPORT.md](docs/MIGROS-IMPORT.md) | Where product data comes from, what is not connected, how a permitted Migros export would be imported |
| [docs/STAGING.md](docs/STAGING.md) | Server setup, environment variables, review command, HTTPS staging |
| [docs/PHONE-TESTING.md](docs/PHONE-TESTING.md) | Manual checklist for real phones |
