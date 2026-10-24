# Security audit: RECYCL IT!

Framework: OWASP Top 10:2025. Scope: `main/bubblecycle` (Python `server/`, Preact/HTM frontend, SQLite, WebAuthn, deploy files).
Method: full read of the backend and the security-relevant frontend, then 59 new automated probes in `tests/py/test_security_audit.py`
(temp SQLite files, loopback server only, no external systems). All confirmed findings were fixed afterwards (section 6); the probes now run as regression tests.

## 1. Executive summary

The core is better than typical for a hackathon: every state-changing query is user-scoped (no IDOR found), all SQL is parameterised,
credit and spending run in `BEGIN IMMEDIATE` transactions (no double-award, overspend or double-redeem under concurrency),
passkey confirmations are server-verified, single-purpose, single-use and expire after 2 minutes, demo features are server-gated
by mode, and the database refuses to open in the wrong mode.

No Critical issue was confirmed. 12 issues were confirmed by test (1 High for a live launch, 3 Medium, 8 Low).
The most important: **self-reported (unreviewed) points can be spent on real-world vouchers** once a user has any 5 verified items (F-03),
and **a forgotten `BC_MODE` silently starts the server in demo mode** (F-05).

Verdict: reasonably secure for a hackathon demo. Not ready for a public launch with real rewards (see section 7).

## 2. OWASP Top 10:2025 assessment

| # | Category | Result |
|---|----------|--------|
| A01 | Broken Access Control | **Pass with note.** All 11 protected endpoints return 401 anonymously; user B cannot appeal/withdraw/read A's submissions, reuse A's confirmation or idempotency key; client-sent `points`, `balance`, `verification`, `is_demo` are ignored; admin API needs the bearer token (a user session is not enough). Weakness: F-02 (admin token parsing). |
| A02 | Security Misconfiguration | **Fail (Low/Med).** F-05 fail-open default mode, F-11 version banner, F-12 no script CSP. Static path traversal (`..%5c`, encoded, null byte) tested: blocked. Dockerfile runs non-root; secrets only via env; `.dockerignore` excludes `.env` and DBs. |
| A03 | Software Supply Chain Failures | **Potential risk.** `cryptography>=42` unpinned, no lockfile; vendored minified JS (`leaflet`, `zxing`, `qrcode`, `preact-htm`) has no recorded version/hash; map tiles load from third-party OSM. |
| A04 | Cryptographic Failures | **Pass.** 256-bit random session tokens stored as SHA-256; HttpOnly + SameSite=Strict + Secure on https; live mode refuses non-https origins; receipts HMAC-SHA256 with constant-time compare. Note F-04 (short redemption codes). |
| A05 | Injection | **Pass.** All SQL parameterised (`delete_account` interpolates a hard-coded table list only). Nickname regex blocks markup; React-style rendering via htm escapes text; the only `dangerouslySetInnerHTML` uses static icon constants. Injection strings tested against profile/appeal/IDs: no effect. |
| A06 | Insecure Design | **Fail (one finding).** F-03: points are fungible regardless of how they were earned. Rate/size/daily caps, duplicate window, idempotency keys and review flags are well designed. Multi-account farming is a residual risk (section 4). |
| A07 | Authentication Failures | **Pass with notes.** Challenges single-use, origin/RP/UV/signature/counter checked, assertion replay and cross-ceremony reuse rejected, logout/delete/expiry invalidate sessions server-side, auth endpoints rate-limited. Demo sign-in and simulated confirmation are refused in live (tested). Notes: F-09, F-10. |
| A08 | Software/Data Integrity Failures | **Pass.** Server never trusts client-reported verification/time/balance; ledger is append-only with `UNIQUE(user_id,type,ref)`. Service worker never caches `/api/`. |
| A09 | Logging & Alerting Failures | **Weak (potential).** Only admin decisions and account deletions are written to `audit`. Failed logins, rate-limit hits, redemptions and admin auth failures are not recorded; no alerting. |
| A10 | Mishandling of Exceptional Conditions | **Fail (Low).** F-07 (500s on malformed types), F-06 (no socket timeout), F-08 (chunked bodies). Errors never leak stack traces to the client; failed transactions roll back cleanly. |

## 3. Confirmed vulnerabilities (each reproduced by a test)

All tests are in `tests/py/test_security_audit.py`. Every finding below was reproduced first (as a strict expected failure),
then fixed; the tests now pass as regression tests. Status: **all 12 fixed**.

| ID | Sev | OWASP | Location | Finding | Test |
|----|-----|-------|----------|---------|------|
| F-03 | **High** (live) | A06 | `service.py:251-258`, `rules.py:17`, `rewards.json` | Vouchers/discounts only check a *lifetime* count of 5 verified items, then are paid from the whole balance. Self-reported logs (no review, 150 items/day, 5 pts each) therefore buy CHF vouchers: demo test earns 5 verified items then 3 days x 150 self-reported items and redeems `voucher-bottle` (500 pts). Combined with free account creation this is the main fraud path. | `test_self_reported_points_cannot_buy_real_world_vouchers` |
| F-05 | Medium | A02 | `config.py:33` | `BC_MODE` defaults to `demo`. A production deploy that omits it exposes anonymous demo sign-in, simulated confirmations and the public receipt codes `BC-1001-ZH`... | `test_mode_defaults_to_live_when_unset` |
| F-06 | Medium | A10/A02 | `http_server.py:50` | `Handler.timeout` is `None`: idle or half-open connections hold a thread forever (slowloris). ThreadingHTTPServer has no thread cap. | `test_connections_have_a_read_timeout` |
| F-02 | Low | A07/A10 | `http_server.py:211-213` | `removeprefix('Bearer ')` is a no-op when the prefix is missing, so the bare token (no scheme) is accepted; a non-ASCII `Authorization` value makes `hmac.compare_digest` raise `TypeError` -> HTTP 500. No bypass found. | `test_admin_rejects_everything_but_the_exact_token[...]` |
| F-04 | Low | A04/A06 | `service.py:260` | Live-mode redemption codes are `DEMO-XXXX-XXXX` (32 bits, no signature, not issued by a partner). A partner that validates by pattern would accept guessed codes. | `test_redeem_code_is_not_a_guessable_demo_pattern_in_live` |
| F-07 | Low | A10 | `service.py:239`, `service.py:323` (`auth.py:35`), `service.py:131` | Type confusion gives HTTP 500: `PUT /api/profile {"nickname": 1}` (regex on non-str), `rewardId` as list/dict (unhashable dict lookup), idempotent replay with mixed-type `material` (`sorted` TypeError). Authenticated only; no data impact, noisy tracebacks. | `test_malformed_input_never_causes_a_server_error`, `test_idempotent_replay_with_odd_entries_is_not_a_server_error` |
| F-08 | Low | A10/A02 | `http_server.py:107-117` | `Transfer-Encoding: chunked` is ignored: the chunk data is parsed as a new pipelined request (verified: 2 responses to 1 request). Directly harmless; request smuggling only if a proxy forwards chunked bodies unmodified (Caddy normalises them). | `test_chunked_request_cannot_smuggle_a_second_request` |
| F-09 | Low | A07/A06 | `auth.py:20,34-39`, `db.py:15` | Nicknames of only spaces (`"   "`) are accepted; uniqueness uses SQLite `lower()` (ASCII only) so `Älex` and `älex` coexist, enabling leaderboard impersonation. | `test_nicknames_cannot_impersonate_or_be_blank` |
| F-10 | Low | A02/A10 | `auth.py:72-77,135-140`, `db.py` | Expired `challenges` and `sessions` rows are never deleted. Unauthenticated `auth/login/options` inserts a row per call (20/min/IP), so storage grows unbounded. | `test_expired_challenges_and_sessions_are_purged` |
| F-11 | Low | A02 | `http_server.py:51` | `Server: RecyclIt Python/3.14.7` discloses the runtime version. | `test_server_banner_does_not_disclose_versions` |
| F-12 | Low | A02 | `http_server.py:65`, `index.html:29,56` | CSP has no `script-src`/`connect-src`; any future XSS would run unrestricted. (No XSS found today.) Inline scripts in `index.html` must be moved or hashed to add one. | `test_csp_restricts_scripts` |

## 4. Potential risks requiring manual review (not confirmed)

- **Multi-account farming:** passkey registration is free (limited 20/min/IP); each account has its own caps and can buy `once` badges. Needs a policy decision (device attestation, invite, reward-per-person limits).
- **`BC_TRUST_PROXY=1` in `.env.example`:** if the app port is reachable without the proxy, `X-Forwarded-For` is attacker-controlled and rate limits can be evaded. Bind the container to the proxy network only.
- **Rate limiter memory:** `RateLimiter.hits` keys are never evicted (per-IP/user), slow memory growth.
- **Admin token** has no dedicated brute-force limit beyond 240 req/min/IP; token length is only enforced in live mode.
- **Account deletion** removes redemptions/ledger, so issued vouchers cannot be reconciled afterwards.
- **No HSTS / extra headers** at the proxy (`deploy/Caddyfile`); add `Strict-Transport-Security`.
- **Demo receipts:** only 8 global codes; one user can burn them all (demo availability only).
- **Self-reported check-ins** rely on device-reported GPS (`evidence='location'`), which is spoofable; they are only flagged, not proven.
- **Local (non-server) demo mode** keeps points in `localStorage` by design; never deploy that build as the live app.
- **Third-party exposure:** OSM tile requests leak user IPs/viewport to a third party.
- Not tested: real browsers/phones, TLS configuration, Caddy/Render behaviour, camera barcode input, WebAuthn on real authenticators.

## 5. Tests executed and results

| Suite | Result |
|-------|--------|
| Existing `tests/py` | 154 passed (one voucher test updated for the F-03 rule) |
| New `tests/py/test_security_audit.py` | 60 passed (after fixes; 13 probes failed before) |
| Combined `python -m pytest tests/py -q` | **214 passed** |
| JS unit tests `tests/run_js.py` | 83 passed |
| Playwright e2e `tests/e2e` (runs with the new CSP) | 30 passed |

Passing probes (evidence for the "Pass" ratings): anonymous access to 11 endpoints; cross-user appeal/withdraw/confirmation/idempotency-key use;
client-supplied points/verification ignored; 12 concurrent identical submissions -> one credit; 5 concurrent redemptions never overspend or duplicate a `once` badge;
two users racing one receipt -> exactly one wins; 30 concurrent logs respect the 150-item daily cap; concurrent admin approvals -> one credit;
demo sign-in / simulated confirmation / demo receipt codes refused in live; demo<->live DB cross-open refused; non-https live origin refused;
logout, account deletion and expiry kill sessions; confirmation wrong purpose/other key/expired/replayed rejected; login and confirm assertion replay and cross-ceremony reuse rejected;
signature-counter regression rejected; auth endpoints rate-limited; admin rejects missing/wrong/Basic/lowercase-scheme tokens and a user session;
a user cannot approve their own submission; admin queue hides full user ids; 8 static traversal variants blocked; leaderboard exposes only opted-in nicknames.

## 6. Fixes applied

| ID | Change |
|----|--------|
| F-03 | `service.py` `redeem`: vouchers/discounts are paid only from points of `verified` logs minus earlier real-reward spend (`verified_spendable`); error `insufficient_verified_points`. Badges still use the total balance. |
| F-05 | `config.py`: `BC_MODE` is required; the server will not start without it. |
| F-06 | `http_server.py`: `Handler.timeout = 15`. |
| F-02 | Admin: exact `Bearer ` prefix required, token compared as bytes. |
| F-04 | Live redemption codes are `RC-` + 96 random bits; `DEMO-` codes only in demo. |
| F-07 | Type checks for nickname, rewardId and material; replay comparison uses strings. |
| F-08 | Any `Transfer-Encoding` header is rejected (501) and the connection closed. |
| F-09 | Nicknames: no leading/trailing space, need a letter or digit; uniqueness via Unicode NFKC+casefold (`casefold()` SQLite function, new unique index `users_nickname_cf`). Note: a pre-existing database with case-colliding nicknames would fail to create that index. |
| F-10 | Expired challenges (10 min margin) and sessions are deleted whenever a new challenge is created. |
| F-11 | `Server: RecyclIt` only. |
| F-12 | Inline scripts moved to `js/boot.js`; CSP now `default-src 'self'; script-src 'self'; connect-src 'self'; img-src` limited to self/data/blob/OSM tiles, etc. If you re-enable Open Food Facts or another third-party API, add it to `connect-src` in `http_server.py`. |

## 7. Remaining limitations before production

1. A per-person abuse strategy for rewards with real value (F-03 limits what self-reported points can buy, but multi-account farming of badges and leaderboard rank remains).
2. Integrate a real receipt issuer and a real reward partner (codes currently not issued by anyone).
3. Add security logging/alerting (failed auth, redemptions, admin actions, rate-limit hits) and a retention policy.
4. Pin and scan dependencies; record provenance of vendored JS; self-host map tiles.
5. HTTPS-only deployment with HSTS, proxy-only network exposure, backups and restore test for SQLite, secret rotation.
6. Independent penetration test, real-device WebAuthn testing, privacy review (GDPR/nFADP) of location and photo evidence.
7. Run the browser/e2e suites and a load test (SQLite single writer).
