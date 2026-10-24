# Product data and Migros

**Status: no Migros data source is connected.** The project contains no Migros API, feed, export, key or agreement, so nothing in the app
was obtained from Migros and the app never says "Source: Migros". The three drinks (name, size, main packaging) and the one recycling point were
supplied by the team, and are labelled "Product details supplied by the team".

## What is missing

To show Migros-sourced fields you need, from Migros or an authorised partner:

1. **Permission** to use a product export or API for this app, in writing, with its terms (what may be shown, for how long, with what credit).
2. **A way to get the data** that does not involve scraping, logging in to a customer account or bypassing access controls: an official export
   file, a partner or open-data feed, or an API with credentials issued to this project.
3. **The address it comes from**, on `migros.ch`, and the date it was retrieved.

Until then the three drinks keep working locally and every other detail stays "not available". Stock and availability are never imported.

## The import boundary

```
export.json  --(python tools/import_migros.py)-->  js/data/migros-import.js  -->  js/data/catalogue.js  -->  screens
 (a person, with permission)   validates, local file only        (generated)         validates again
```

`tools/import_migros.py` reads one local JSON file. It makes no network requests and needs no credentials. The file looks like this:

```json
{
  "schema": 1,
  "source": {
    "name": "Migros",
    "url": "https://www.migros.ch/...",
    "retrievedAt": "2026-10-20",
    "permission": "Who allowed this use, and under which agreement"
  },
  "records": {
    "7610097135078": {
      "fields": { "priceChf": 1.2, "diet": "vegan", "allergens": [], "mayContain": ["nuts"], "ingredients": "...", "photo": "https://image.migros.ch/..." },
      "url": "https://www.migros.ch/... (optional: the page of this product)",
      "retrievedAt": "2026-10-20 (optional)"
    }
  }
}
```

Rules (the same in the tool and in `validateMigrosImport()`; `tests/fixtures/migros_import_cases.json` is shared by both test suites):

- Only the three approved barcodes. Any other record is refused.
- Only these fields: `priceChf` (number, CHF), `diet` (`vegan`, `vegetarian`, `neither`), `allergens` and `mayContain` (lists from the app's
  allergen vocabulary), `ingredients` (text, up to 1500 characters), `photo` (https on `migros.ch`). Everything else, including `stock`, `available`
  or a changed `name`, is refused.
- `source.name` must be `Migros`, `source.url` an `https` address on `migros.ch` or a subdomain (no look-alike hosts, no credentials in the address),
  `retrievedAt` a past or present date, and `permission` must be stated.
- Any problem stops the run and writes nothing, unless `--drop-invalid` is given, which keeps only the valid part.

The app shows "Source: Migros", the field names, the retrieval date and a link only for fields that arrived this way. Text is rendered as plain
text. A record or field that fails validation is ignored, so a bad file falls back to the team-supplied details instead of breaking the app.

## If an API is ever connected

Do it behind this same boundary: a server-side job (credentials in environment variables, never in the frontend or in git) fetches from a
configured trusted address with a timeout, validates the response with these rules, and writes the result. The app itself should keep reading the
local file, so it still works when Migros is unavailable.
