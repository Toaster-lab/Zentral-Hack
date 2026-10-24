# Running the server and an HTTPS staging site

Nothing in this folder publishes anything by itself. These are the steps you run.

## 1. The server on your own computer

```
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt   # just "cryptography", used to check passkey signatures
python -m server                  # demo mode on http://localhost:5174
```

Open http://localhost:5174. The server serves the app and the API from one address. Without `cryptography` it still runs, but
only the clearly labelled demo account works (no passkeys).

Settings are environment variables (copy `.env.example`):

| Variable | Meaning |
|---|---|
| `BC_MODE` | `demo` (default) or `live`. Each mode has its **own database file**; a database made in one mode is refused in the other, so demo and live balances can never mix. |
| `BC_ORIGIN` | The exact address people open, for example `https://staging.example.com`. Passkeys are checked against it. |
| `BC_RP_ID` | The site's domain, for example `staging.example.com` (defaults to the host of `BC_ORIGIN`). |
| `BC_DB` | Database file. Back this file up; it holds all accounts, activity and points. |
| `BC_ADMIN_TOKEN` | At least 24 random characters. Enables the staff review API. Without it, review from the server machine with the command below. |
| `BC_RECEIPT_SECRET` | Shared secret with whoever issues station receipts. Without it, live mode accepts **no** receipt codes and every log stays self-reported. |
| `BC_TRUST_PROXY` | `1` when a proxy such as Caddy sits in front (so rate limits use the real client address). |
| `BC_HOST`, `BC_PORT` | Where to listen (defaults `127.0.0.1`, `5174`). |

Live mode refuses to start on a non-HTTPS `BC_ORIGIN` (other than `localhost`).

### Reviewing held check-ins

```
python -m server review                      # list what is waiting
python -m server review approve <id>
python -m server review decline <id> a short reason
```

or call `GET /api/admin/queue` and `POST /api/admin/decide` with `Authorization: Bearer <BC_ADMIN_TOKEN>`. Approval re-checks the daily
limits before anything is credited. The app has no reviewer screens for real activity; the on-device demo reviewer exists only in the
local demo and is not shown when the server is used.

### Receipts from a trusted source

A verified log needs a code signed by the system that issues receipts (a station machine or retailer backend). The format and a
reference signer are in `server/receipts.py`: `BCR.<payload>.<signature>`, an HMAC with `BC_RECEIPT_SECRET`. Each code works once.
Until you have such an issuer, leave the secret unset. The fictional demo codes (`BC-1001-ZH` …) are accepted in demo mode only.

## 2. HTTPS staging for phones

Camera, location and passkeys need HTTPS (or `localhost`). Two ways to get a phone-reachable HTTPS address:

**A. A quick tunnel (minutes, nothing to buy).** Start a tunnel first so you know the address, then start the server with it.

```
cloudflared tunnel --url http://localhost:5174       # prints https://something.trycloudflare.com
# in another terminal, with that address:
set BC_ORIGIN=https://something.trycloudflare.com    # macOS/Linux: export ...
set BC_RP_ID=something.trycloudflare.com
set BC_TRUST_PROXY=1
python -m server
```

(`ngrok http 5174` works the same way.) A new tunnel means a new address, so passkeys made on the old one stop working.

**B. A small server with a domain name** (stable address, good for real testing). With Docker installed:

```
cp .env.example .env            # set STAGING_DOMAIN, BC_ORIGIN, BC_RP_ID, BC_ADMIN_TOKEN (and BC_MODE)
docker compose -f deploy/docker-compose.staging.yml --env-file .env up -d --build
```

Caddy gets and renews the certificate itself. `deploy/render.yaml` is an example for a hosted service (auto-deploy is off).
Use `BC_MODE=demo` for staging unless you really want live accounts; the demo server shows demo labels and offers the simulated
account for phones that can't do passkeys.

**Static hosting only (no server).** Everything except accounts, server-checked points and rewards also works as plain files on any
static host: run `python tools/build_precache.py` once before uploading (it writes `sw-manifest.js`, the offline file list), then
upload the folder without `server/`, `tests/`, `tools/`, `deploy/` and `docs/`. That is the on-device demo.

## 3. Updating

Deploy the new files and restart the server. Open phones keep running the old version until their owner taps **Update now** in the
banner (the app asks them to finish any open form first). A new version never replaces the old one under someone's hands.

## What is not included

Real receipt issuing, real reward partners, an email or push service, and a production database. See the demo-versus-live table in
the README.
