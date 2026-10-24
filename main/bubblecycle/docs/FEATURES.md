# Features in detail

What each feature does, what it stores, and what it does not prove. The overview is in the [README](../README.md).

- [Confirm it's you](#confirm-its-you)
- [Check-in: evidence and review](#check-in-evidence-and-review)
- [Pilot catalogue](#pilot-catalogue)
- [Community map](#community-map)
- [Discover search](#discover-search)
- [Social: friends, challenges and streaks](#social-friends-challenges-and-streaks)
- [Bottledex and quests](#bottledex-and-quests)
- [Collection calendar](#collection-calendar)

## Confirm it's you

Before points are added or spent, the device asks the person holding it to unlock it, as the **last step** of logging, checking in or
redeeming (`services/deviceauth.js`, `screens/authgate.js`). The form is filled in first; if the prompt is cancelled or fails, everything
stays as typed and the same button says "Try again". Pressing it twice doesn't send twice. The first time, a short explanation appears.
The sheet starts unconfirmed each time it opens, so the check is needed once per submission.

- **How:** WebAuthn / passkeys with user verification required. The operating system shows its own prompt: Face ID or face unlock,
  fingerprint, or the device passcode, whichever the device offers (a security key also works). A web page can't require face recognition
  specifically and never receives a face image, template or any biometric data. It receives a signed yes or no. The app never collects selfies.
  The first use creates a device-bound passkey (its id is kept in local state and deleted with *Delete all my data*; the passkey itself
  can be removed in device settings).
- **With the server** the check is real: the server creates the challenge, verifies the passkey's signature, origin and
  user-verification flag, ties the result to one account, one purpose (log or redeem) and the exact submission, and accepts it for two
  minutes, once (`server/webauthn.py`, `server/auth.py`). The browser cannot say "I authenticated" on its own.
- **In the on-device demo** there is no server to verify anything, so the challenge is created on the device and the signature isn't
  verified; the check only guards against someone using an unlocked phone. If the device can't do it (no screen lock, or plain `http`
  instead of `https`/localhost), a clearly labelled **simulated** step is offered (switch it off with `config.deviceAuth.allowSimulation`,
  and do so for launch). A demo-server account without a passkey gets the same labelled step. A live server never accepts it, and results
  that used it say "Simulated".
- **What it means:** whoever holds the device or account just satisfied its screen lock. It does **not** show that the person recycled, that
  they were at a station, or that they have only one account. The screens say so.

## Check-in: evidence and review

Home › *Check in at a station*, or a station on the Map › *Check in here*. Four steps: station and materials, location, optional photo,
summary to confirm. Every step can be skipped; skipping just keeps the check-in **Self-reported**.

**What the labels mean**

- **Self-reported:** you said so; nothing was checked.
- **Location checked:** the device was within 75 m of the station *plus* its reported GPS accuracy, and the fix was better than ±100 m.
  It does not show what was put in the container.
- **Confirmed by a collection partner:** reserved for a real deposit-confirmation integration. Nothing in this demo can reach it.

A photo can support a claim but doesn't prove a deposit. A product barcode identifies a product, not one physical item.

**Review, not accusation.** Warning signals (`js/logic/evidence.js`): several check-ins within an hour, overlapping check-ins at two
stations, 40+ items in one go, a photo that looks like an earlier one, stations too far apart for the time between, and a device away
from the station. Any signal holds the credit as *pending*: nothing is counted and no points are added until it is settled. Poor GPS
(an inaccurate fix) is **not** a signal. Nobody is banned for one signal. Signals are shown only to the person who made the check-in
(Activity › Check-ins), where they can add a note (appeal) or withdraw. In the on-device demo a *Demo reviewer* can approve or decline;
with the server, held items wait for staff (`python -m server review`).

**Data.** Stays on the device: the exact position (used once, never stored) and the photo (deleted after the check-in unless you keep
it; up to 5 can be kept and deleted in Profile). Sent to the server: station, materials and counts, time, the location *result* and GPS
accuracy, a 64-bit photo fingerprint (not the photo), a random device ID, the review status. Shared by choice: nickname and totals
(leaderboard), and what friends may see. In the on-device demo the "server" is simulated (`submitCheckin` in `services/demo.js`), so
nothing is sent. Checks that run on a device can be altered by a determined person; catching repeats across accounts needs shared data.

**Offline.** Without a connection (or if the service call fails) a check-in is saved as *Waiting to send* and sent when the browser goes
online again. Credit stays pending until then.

**Not built yet:** evidence requirements for higher-value rewards beyond "verified items" (vouchers need 5), groups, team challenges, the
community feed and Community Events, partner deposit confirmation, and a reviewer web screen (review is a command and an API for now).

## Pilot catalogue

The active catalogue is fixed to what the team supplied, and `js/data/catalogue.js` is the only place it is defined. Scan, Discover, the map,
the check-in selector and the Bottledex examples all read from it, and the server's `server/data/stations.json` carries the same station id,
position and materials (a test compares them).

| Barcode | Product | Size | Main packaging |
|---|---|---|---|
| `90162909` (8 digits) | Red Bull | 250 ml | Aluminium can |
| `7610097135078` | Focus Water Reload | 500 ml | PET bottle |
| `7640127851166` | Limonade Minze Bio | 500 ml | PET bottle |

- **Barcodes are strings.** Spaces and dashes are removed before lookup and the check digit is validated; all three supplied barcodes pass. A
  barcode that fails is reported, never corrected. Anything else is "Not in this pilot catalogue", with no lookup anywhere else (Open Food Facts
  and every other fallback are removed).
- **Example products.** 13 more products (sodas, waters, juices, chocolate, snacks, muesli, yoghurt, jam) are invented to make the range feel real.
  They are shown as "Migros (example)" with "Example data, not from Migros", use the internal `200…` barcode prefix and never receive an official
  import. The three team drinks also show a price, diet and allergens, but those are example values too and say so.
- **Unknown stays unknown.** Ingredients, allergens, nutrition, certifications, prices, photos and availability were not supplied, so screens say
  "not available" and filters never treat unknown as a match (a product with no allergen information is not "nut-free"). Ingredients, nutrition, photos and availability are still unknown.
- **Provenance.** Everything shows "Product details supplied by the team". "Source: Migros" appears only for fields that come from an identifiable
  official Migros export through the import boundary ([MIGROS-IMPORT.md](MIGROS-IMPORT.md)). None is connected, so it never appears today.
- **Closed to additions.** `config.pilot.lockCatalogue` pauses adding barcodes and places, and approving or applying anything that would change
  the map. Reports of a full or damaged bin and "still here" confirmations still work. Submissions made earlier stay on the device, unpublished.
- **Old data.** A versioned migration keeps everything personal (activity, points, check-ins, scans, Bottledex, own barcodes) and only drops
  the sample submissions and switches off the retired sources. Old records that name a retired place keep their own text. The server accepts a log
  that mentions a retired station (without the station) and refuses a check-in at one with the code `retired_station`.
- **Server check.** A check-in may only list materials its station accepts.

## Community map

The app is limited to **Rotkreuz (Risch, Canton Zug)**: the map is centred there, the supported area is drawn as a dashed circle with the
outside dimmed, and searching elsewhere answers "We're starting in Rotkreuz. More places are coming!".

**Adding another town:** add an entry to `js/data/areas.js` (id, centre, radius), load its locations, and add places/postcodes to
`js/data/places.js`. Every location has an `areaId`, and the map only loads locations for one area and the current view
(`loadLocations({ areaId, bbox })`).

**Location data.** Exactly one location is active: the "PET and aluminium recycling point" at 47.143376, 8.432881, accepting PET drink bottles and
aluminium. The team supplied the position and the materials; nothing else is known, so no official name, address, opening hours, accessibility
information or operator is shown, and it is not labelled officially verified. The earlier OpenStreetMap snapshot and the made-up demo points are retired.

**The flow below is paused in the pilot** (`config.pilot.lockCatalogue`): nobody can add or change places. It is kept for when the pilot ends.

**Community flow** (all on-device in this demo, in `js/services/community.js`)

1. Map › **Add a place**: drop/drag the pin (or use location; arrow buttons nudge it), choose station or bin, materials, optional photo
   (resized and stripped of metadata on-device), optional hours/access/description. Nearby existing places are suggested first so people
   update instead of duplicating.
2. The submission is **Pending review**: only its author sees it on the map. Status messages appear under Profile › **My contributions**.
3. Profile › **Admin review (demo)**: approve, edit, merge into a duplicate, or reject with a reason. Approved places become normal public
   map locations.
4. Each place has **Still here ✓**, **Suggest a correction** and **Report an issue** (wrong location, bin full, damaged/inaccessible,
   incorrect info, removed). *Temporary* issues (full, damaged) show as a ⚠ on the place and expire by themselves (24 h / 7 days) without
   changing the record. *Permanent* ones (wrong location, wrong info, removed) wait for review. The place shows when it was last confirmed.

**Rewards for helping the map:** approved place +25 (+5 with photo), merged +10, accepted fix +5, confirming a place +2 (max 3/day, once
per place per week). Temporary reports earn nothing (anti-farming). These are spendable points in the points ledger only. They never
create recycling activity, so recycling counts and the leaderboard are unaffected. Points arrive after review, never on submit.

**Privacy:** public pages show only the place, never who added it. Contributions are tied to a random ID on the device. Users are
reminded not to photograph people, faces or number plates, and the admin view reminds reviewers to check photos.

**Before accepting real public submissions you need:** a backend and database (PostGIS/area-bbox queries), authentication or
abuse-resistant identities, server-side rate limits, object storage with image scanning and moderation for photos, authenticated
reviewers with an audit log, server-side reward payout, a privacy notice and terms for contributions, and agreed data licensing (OSM data
must stay credited/ODbL; decide the licence for community submissions). Replace the demo admin view, which has no login.

## Discover search

Typing a product type returns that type: "soda" gives sodas, "chocolate" chocolates. Mood words like "something sweet" only act as flavour
hints. If you ask for something the demo can't match (e.g. "pizza") it says so instead of showing unrelated products.

## Social: friends, challenges and streaks

The **Social** tab is in the bottom bar; Profile, rewards and settings are behind the avatar button at the top right. Social is opt-in:
nothing is shared until you set up a profile, and sharing is off by default (one "Share my progress" switch). *Leave Social* removes it
again.

- **Friends:** nickname + avatar + exact username. Add by exact username search (no browsing or prefix search; non-discoverable people
  return the same "not found"), or invite link (`#/social?add=username`). Friend requests with accept/decline, cancel, remove,
  block/unblock, and report. No messaging or reactions.
- **Challenges:** weekly or monthly, "this" or "next", with Europe/Zurich boundaries; invited friends must accept (the join screen explains
  what participants will and won't see). Ranked by **eligible items logged during the challenge** (never lifetime totals or points). Only
  activity after the start *and* after you joined counts, each log once. A challenge is either **Self-reported** (every eligible item
  counts, verified ones are marked) or **Verified only** (receipt-code items), so everyone is compared the same way. Household rubbish is
  not a recyclable material, so it never counts. When a challenge ends the result is frozen; finishing with at least one eligible item
  earns a digital badge (no points).
- **Streaks:** shown as a card at the top of Friends. A week (Mon–Sun, Zurich) counts if it has at least one eligible logged activity. Shows current and longest streak, this
  week's status, and recent weeks. A streak ends only after a full week passes, with supportive wording ("A fresh week, a fresh start.").
  Optional in-app reminders can be turned off. Copy avoids pushing purchases or extra trips.
- **Privacy:** friends see only what you allow (one switch: totals this week and streak). Never places, visit times or movement history.
  Milestones carry no times beyond "days ago". Leaderboard nicknames remain a separate opt-in.
- **Time:** weeks, months, challenge boundaries and daily log limits all use Europe/Zurich, DST-aware.

**What is simulated.** Friends, their activity, their replies to requests and challenge invitations (after ~15–40 seconds), and their
challenge progress are **generated** by `js/services/social.js` + `js/data/social-demo.js` and labelled "Simulated". Your own activity is
real. Try the usernames `minty_marta`, `glass_gabi`, `alu_andri`, `lavender_lea`, `peachy_pia`; `quiet_quinn` is deliberately not
discoverable. Profile › Developer has a **demo clock** (+1 week) to watch challenges end and streaks rest, and a reset.

**Needed for real accounts and syncing.** Accounts with unique usernames and authentication; a friends/blocks/reports database and
moderation queue; server-side activity records (so counts can't be edited), deduplication, challenge scoring and finalisation;
invitations/reminders via push or email with consent; invite links/QR codes that resolve to profiles; rate limits and abuse controls; a
privacy notice covering friend data. `js/logic/social.js` holds the rules so a server can reuse them; `js/services/live.js` documents the
expected API.

## Bottledex and quests

**Bottledex** (Collection, from Home or Profile). A numbered field guide of 48 container types (wine and beer bottles, jars, PET bottles,
cans, tins, cartons, HDPE bottles, batteries…). Scan a drink that comes in a container to find it (the pilot's three drinks unlock three entries: a slim can and two 50 cl PET bottles); silhouettes are generic drawings (no
photos are invented, and it uses no Pokémon names or art, only the "numbered collection" idea). Each entry shows what to do with that
container for your municipality. The page says plainly that it's not a shopping list: you collect by scanning things you already own.

**Monthly quests** (Home › Monthly quests). Seven optional goals that reset each calendar month in Europe/Zurich time, each with a one-off
bonus you claim yourself: recycle 25 items, try 4 materials, log 5 verified items, recycle in 3 different weeks, check up to 5 products by
scanning (never more than the catalogue holds: 3 in the pilot), add 3 Bottledex entries, help the map twice. They read only validated activity (duplicates are already blocked), and the bonus
is spendable points only: it never becomes recycling activity, so it can't move anyone on the leaderboard. Nothing asks for purchases or
extra trips. Quest rules: `js/logic/quests.js`.

## Collection calendar

Profile › Collection calendar (or `#/calendar`). The dates are **sample dates** and labelled as such: nobody has loaded the municipality's
official schedule into this app. To use real dates, replace `COLLECTIONS` in `js/data/collection-calendar.js` and set `CALENDAR_SOURCE`
(kind `official`, the page the dates came from, and the date they were last checked); the screen then shows that source and date instead
of the sample warning. You can filter by material, switch on an **in-app** reminder (a note on Home the day before, shown only when you
open the app), and download an `.ics` file for your phone's calendar, with an optional 18:00 reminder the evening before.

**Reminders when the app is closed** need either your calendar app (use the `.ics`) or web push, which needs a push service, stored
subscriptions and a scheduler on the server. None of that exists here, so the app doesn't offer it and doesn't promise it.
