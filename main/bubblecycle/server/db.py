"""SQLite storage. Every write that touches credit or balances runs inside one BEGIN IMMEDIATE
transaction, which takes SQLite's write lock up front. Two requests can therefore never both
read the same balance and both spend it."""
import sqlite3
import threading
import unicodedata
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL,
  nickname TEXT, leaderboard_opt_in INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS users_nickname ON users(lower(nickname)) WHERE nickname IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_cf ON users(casefold(nickname)) WHERE nickname IS NOT NULL;
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), public_key_pem TEXT NOT NULL,
  alg INTEGER NOT NULL, sign_count INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT, challenge TEXT NOT NULL, purpose TEXT,
  keys_json TEXT NOT NULL DEFAULT '[]', used_keys_json TEXT NOT NULL DEFAULT '[]', nickname TEXT,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, verified_at INTEGER, method TEXT
);
-- One row per log or check-in. Credit (activity_items + ledger) only exists once status = 'counted'.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), idem_key TEXT NOT NULL,
  kind TEXT NOT NULL, created_at INTEGER NOT NULL, station_id TEXT, source TEXT NOT NULL,
  entries_json TEXT NOT NULL, receipt_code TEXT, verification TEXT NOT NULL, evidence TEXT NOT NULL,
  location_result TEXT, fp TEXT, started_at INTEGER, flags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', auth_method TEXT, decided_at INTEGER, decided_by TEXT,
  points INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, idem_key)
);
CREATE INDEX IF NOT EXISTS submissions_user ON submissions(user_id, created_at);
CREATE TABLE IF NOT EXISTS activity_items (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), user_id TEXT NOT NULL,
  ts INTEGER NOT NULL, material TEXT NOT NULL, count INTEGER NOT NULL, accepted INTEGER NOT NULL,
  verification TEXT NOT NULL, station_id TEXT, source TEXT NOT NULL, evidence TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_ts ON activity_items(ts);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ts INTEGER NOT NULL, points INTEGER NOT NULL,
  label TEXT NOT NULL, type TEXT NOT NULL, ref TEXT, verification TEXT, evidence TEXT,
  UNIQUE (user_id, type, ref)
);
CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, idem_key TEXT NOT NULL, reward_id TEXT NOT NULL,
  cost INTEGER NOT NULL, code TEXT, ts INTEGER NOT NULL, auth_method TEXT,
  UNIQUE (user_id, idem_key)
);
CREATE TABLE IF NOT EXISTS receipts_used (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quest_claims (user_id TEXT NOT NULL, claim_id TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (user_id, claim_id));
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, ref TEXT, detail TEXT);
"""


def casefold(s):
    """Unicode-aware, case-insensitive nickname key (SQLite's own lower() only handles ASCII)."""
    return unicodedata.normalize('NFKC', s).casefold() if isinstance(s, str) else None


class Database:
    def __init__(self, path: str, mode: str):
        self.path = path
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._memory = None
        if path == ':memory:':  # shared connection for tests; serialised with a lock
            self._memory = self._open()
            self._lock = threading.RLock()
        conn = self.conn()
        conn.executescript(SCHEMA)
        row = conn.execute("SELECT value FROM meta WHERE key='mode'").fetchone()
        if row is None:
            conn.execute("INSERT INTO meta VALUES ('mode', ?)", (mode,))
        elif row[0] != mode:
            raise SystemExit(f'{path} is a {row[0]} database. Refusing to open it in {mode} mode: demo and live data must stay apart.')

    def _open(self):
        c = sqlite3.connect(self.path, isolation_level=None, check_same_thread=False, timeout=15)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        c.create_function('casefold', 1, casefold, deterministic=True)
        if self.path != ':memory:':
            c.execute('PRAGMA journal_mode=WAL')
            c.execute('PRAGMA synchronous=NORMAL')
        return c

    def conn(self):
        if self._memory is not None:
            return self._memory
        c = getattr(self._local, 'c', None)
        if c is None:
            c = self._local.c = self._open()
        return c

    @contextmanager
    def tx(self):
        """Serialised write transaction: BEGIN IMMEDIATE ... COMMIT, or ROLLBACK on any error."""
        lock = self._lock if self._memory is not None else None
        if lock:
            lock.acquire()
        c = self.conn()
        try:
            c.execute('BEGIN IMMEDIATE')
            try:
                yield c
            except BaseException:
                c.execute('ROLLBACK')
                raise
            else:
                c.execute('COMMIT')
        finally:
            if lock:
                lock.release()
