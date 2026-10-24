## Thorben Notes

# How RECYCL IT! works

## 1. Two parts

- **App** (`js/`, `css/`): what you see on the phone. A website that acts like an app and works offline.
- **Server** (`server/`): a Python program that keeps the real record of points and accounts in one database file.

## 2. Two ways to run it

| | Command | Who decides what counts |
|---|---|---|
| Demo | `python serve.py` → localhost:5173 | The phone (easy to cheat, fine for demos) |
| With server | `python -m server` → localhost:5174 | The server (safe) |

## 3. Login

No passwords. The phone asks for Face ID, a fingerprint or a PIN, and the server checks the result.
This only works on `https://` addresses or on `localhost`.

## 4. Settings

Settings go in the `.env` file (copy it from `.env.example`). The main ones: `BC_MODE` (demo/live) and `BC_ORIGIN` (the web address).
Secrets stay in this file and never go into the code.

## 5. Putting it online

- **Quick:** `cloudflared tunnel --url http://localhost:5174` gives a temporary https address for phone testing.
- **Proper:** Docker + Caddy (`deploy/`). Caddy handles https, Docker runs the server.

## 6. Tests

`python tests/run_all.py`

## 7. Still fake

Friends, products, rewards, calendar dates and "verified" receipts are all sample data.
