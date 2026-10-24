# Offline and updates

- After one completed visit the app opens offline. The service worker (`sw.js`) stores every local HTML, CSS, JS, icon, font and library
  file named in `sw-manifest.js`, which `serve.py` and the server generate from the files on disk (static hosts run
  `python tools/build_precache.py`). The cache name carries a hash of those files, so each release gets a new cache and the old one is
  deleted when the new worker activates.
- **Updates never swap under your hands.** A new version downloads in the background and a banner offers "Update now"; it is disabled
  while a form is open ("Finish what you're doing, then update"), so nothing typed is lost.
- **Never cached:** `/api/` responses, other origins (map tiles), non-GET requests, anything outside the shell.
  Accounts, balances and evidence therefore never enter a general cache. Check-in photos live in the page's own storage, not in the cache.
- **Offline submissions with the server** are stored on the device as "Saved on this device, not counted" and listed under Activity. When
  you're back online you confirm once and the server re-checks each one (limits, duplicates, receipts, age: items older than 72 hours
  expire). Each can be accepted, held for review or refused with a reason, and a retry of something the server already received is
  recognised, not counted again. Offline items are never shown as accepted.
- **Maps are not available offline.** Tiles come from OpenStreetMap's servers and aren't stored, and the app says so. The station list
  and the rest of the app work.
