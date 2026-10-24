"""Business rules. The browser asks; this module decides.

Nothing here reads balances, timestamps, verification labels or "authenticated" flags from the client.
Time is the server's clock, balances are sums over the ledger, and "verified" exists only when a trusted
receipt source said so.
"""
import json
import re
import secrets
import time
from pathlib import Path

from . import auth, receipts, rules, zurich
from .auth import ApiError
from .db import Database

DATA = Path(__file__).resolve().parent / 'data'
KEY_RE = re.compile(r'^[A-Za-z0-9_-]{8,64}$')
SOURCES = {'manual', 'scan', 'station', 'checkin'}
LOCATION_RESULTS = {'near', 'far', 'inaccurate', 'denied', 'unavailable', 'none'}
PENDING = ('review', 'appealed')
MAX_PENDING_PER_USER = 10


def _clean_note(s) -> str:
    return re.sub(r'[\x00-\x1f]', ' ', str(s or '')).strip()[:200]


class Service:
    def __init__(self, settings, db: Database | None = None, clock=None):
        self.settings = settings
        self.db = db or Database(settings.db_path, settings.mode)
        self.now = clock or (lambda: int(time.time() * 1000))
        self.stations = {s['id']: s for s in json.loads((DATA / 'stations.json').read_text(encoding='utf-8'))}
        # Places that existed before the pilot catalogue. Old records and saved submissions may still mention them.
        self.retired_stations = frozenset(json.loads((DATA / 'retired_stations.json').read_text(encoding='utf-8')))
        self.rewards = {r['id']: r for r in json.loads((DATA / 'rewards.json').read_text(encoding='utf-8'))}

    # ---- helpers --------------------------------------------------------------------------

    @staticmethod
    def _key(body: dict) -> str:
        key = body.get('idemKey')
        if not isinstance(key, str) or not KEY_RE.match(key):
            raise ApiError(400, 'bad_key', 'Missing or malformed submission key.')
        return key

    def _history(self, c, user_id: str, since: int, exclude: str | None = None) -> list:
        """Everything that counts, or is waiting for review, since `since`: the input to limit and duplicate checks."""
        rows = [{'ts': r['ts'], 'material': r['material'], 'count': r['count'], 'accepted': r['accepted'], 'batch_id': r['submission_id']}
                for r in c.execute('SELECT * FROM activity_items WHERE user_id = ? AND ts >= ?', (user_id, since)).fetchall()
                if r['submission_id'] != exclude]
        for s in c.execute("SELECT * FROM submissions WHERE user_id = ? AND created_at >= ? AND status IN ('review','appealed')", (user_id, since)).fetchall():
            if s['id'] == exclude:
                continue
            rows += [{'ts': s['created_at'], 'material': e['material'], 'count': e['count'], 'accepted': e['accepted'], 'batch_id': s['id']}
                     for e in json.loads(s['entries_json'])]
        return rows

    def balance(self, c, user_id: str) -> int:
        return c.execute('SELECT COALESCE(SUM(points), 0) FROM ledger WHERE user_id = ?', (user_id,)).fetchone()[0]

    def _credit(self, c, sub) -> dict:
        """Turns an approved submission into counted items and points (one ledger row per submission, ever)."""
        entries = [e for e in json.loads(sub['entries_json']) if e['accepted'] > 0]
        verified = sub['verification'] == 'verified'
        accepted = sum(e['accepted'] for e in entries)
        points = rules.points_for(accepted, verified)
        for e in entries:
            c.execute('INSERT INTO activity_items VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                      (self._rid('a_'), sub['id'], sub['user_id'], sub['created_at'], e['material'], e['count'], e['accepted'],
                       sub['verification'], sub['station_id'], sub['source'], sub['evidence']))
        summary = ', '.join(f"{e['accepted']} × {rules.LABELS[e['material']].lower()}" for e in entries)
        c.execute('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?,?)',
                  (self._rid('l_'), sub['user_id'], self.now(), points, f'Recycled {summary}', 'earn', sub['id'], sub['verification'], sub['evidence']))
        c.execute("UPDATE submissions SET status='counted', points=?, accepted=?, decided_at=? WHERE id=?", (points, accepted, self.now(), sub['id']))
        return {'points': points, 'accepted': accepted}

    @staticmethod
    def _rid(prefix: str) -> str:
        return prefix + secrets.token_urlsafe(9)

    def _view(self, row, replayed=False) -> dict:
        station = self.stations.get(row['station_id'])
        return {
            'id': row['id'], 'kind': row['kind'], 'status': row['status'], 'ts': row['created_at'], 'stationId': row['station_id'],
            'stationName': station['name'] if station else None, 'source': row['source'], 'entries': json.loads(row['entries_json']),
            'verification': row['verification'], 'evidence': row['evidence'], 'flags': json.loads(row['flags_json']), 'note': row['note'],
            'points': row['points'], 'accepted': row['accepted'], 'replayed': replayed,
        }

    # ---- recycling logs and check-ins -------------------------------------------------------

    def submit_activity(self, user: dict, body: dict) -> dict:
        key = self._key(body)
        kind = body.get('kind', 'log')
        if kind not in ('log', 'checkin'):
            raise ApiError(400, 'bad_kind', 'Unknown submission type.')
        entries_in = body.get('entries')
        if not isinstance(entries_in, list) or len(entries_in) > 10:
            raise ApiError(400, 'bad_entries', 'Add at least one item to log.')
        source = body.get('source') if body.get('source') in SOURCES else ('checkin' if kind == 'checkin' else 'manual')
        station_id = body.get('stationId')
        if station_id is not None and not isinstance(station_id, str):
            raise ApiError(400, 'unknown_station', 'We don’t know that station.')
        if station_id is not None and station_id not in self.stations:
            if station_id not in self.retired_stations:
                raise ApiError(400, 'unknown_station', 'We don’t know that station.')
            if kind == 'checkin':
                raise ApiError(400, 'retired_station', 'That station is no longer part of the pilot, so this check-in can’t be counted. Nothing else is affected.')
            station_id = None   # a plain log still counts; only the place it mentioned is gone
        if kind == 'checkin' and not station_id:
            raise ApiError(400, 'unknown_station', 'Choose a station for a check-in.')
        loc = body.get('location') if isinstance(body.get('location'), dict) else {}
        loc_result = loc.get('result') if loc.get('result') in LOCATION_RESULTS else 'none'
        fp = body.get('fp') if isinstance(body.get('fp'), str) and re.fullmatch(r'[0-9a-f]{16}', body['fp']) else None
        receipt_in = body.get('receiptCode')
        if receipt_in is not None and (not isinstance(receipt_in, str) or len(receipt_in) > 300):
            raise ApiError(400, 'receipt_invalid', 'We couldn’t verify that receipt code.')

        now = self.now()
        queued_at = body.get('queuedAt')
        if isinstance(queued_at, int) and not isinstance(queued_at, bool) and now - queued_at > rules.MAX_QUEUE_AGE_MS:
            raise ApiError(410, 'expired', 'This was saved too long ago to send. Please log it again.')

        with self.db.tx() as c:
            same = c.execute('SELECT * FROM submissions WHERE user_id = ? AND idem_key = ?', (user['id'], key)).fetchone()
            if same:  # a retry of something already received: return the original outcome, change nothing
                sent = [(e.get('material'), e.get('count')) for e in entries_in if isinstance(e, dict)]
                stored = [(e['material'], e['count']) for e in json.loads(same['entries_json'])]
                if same['kind'] != kind or same['station_id'] != station_id or sorted(sent) != sorted(stored):
                    raise ApiError(409, 'key_reused', 'That submission key was already used for different items.')
                return self._view(same, replayed=True)

            method = auth.consume_confirmation(self, c, user['id'], body.get('confirmationId'), 'activity', key)

            verified, receipt_key = False, None
            if receipt_in and receipt_in.strip():
                res = receipts.verify(self.settings, receipt_in, now)
                if not res['valid']:
                    msg = {'not_configured': 'Receipt codes can’t be verified yet. You can still log without one (self-reported).',
                           'expired': 'That receipt code has expired.'}.get(res['reason'], 'We couldn’t verify that receipt code. You can still log without it (self-reported).')
                    raise ApiError(422, 'receipt_invalid', msg)
                receipt_key = res['key']
                if c.execute('SELECT 1 FROM receipts_used WHERE code = ?', (receipt_key,)).fetchone():
                    raise ApiError(409, 'receipt_used', 'That receipt code has already been used.')
                verified = True

            pending = c.execute("SELECT COUNT(*) FROM submissions WHERE user_id = ? AND status IN ('review','appealed')", (user['id'],)).fetchone()[0]
            if kind == 'checkin' and pending >= MAX_PENDING_PER_USER:
                raise ApiError(429, 'too_many_pending', 'You have several check-ins waiting for review. Please wait for those first.')

            since = min(zurich.start_of_day(now), now - rules.LIMITS['duplicate_window_min'] * 60_000) - 1
            res = rules.evaluate_log(self._history(c, user['id'], since), entries_in, now)
            if not res['ok']:
                raise ApiError(422, res['code'], res['error'])
            if kind == 'checkin':
                accepted = self.stations[station_id].get('materials')
                if accepted is not None and any(e['material'] not in accepted for e in res['entries']):
                    raise ApiError(422, 'material_not_accepted', 'This station doesn’t list that material. Choose one of the materials it accepts.')

            flags = []
            if kind == 'checkin':
                st = self.stations[station_id]
                started = body.get('startedAt')
                started = started if isinstance(started, int) and now - 3 * 3_600_000 <= started <= now else now
                prior = [{'status': r['status'], 'ts': r['created_at'], 'started_at': r['started_at'] or r['created_at'], 'station_id': r['station_id'],
                          'at': {'lat': self.stations[r['station_id']]['lat'], 'lng': self.stations[r['station_id']]['lng']} if r['station_id'] in self.stations else None,
                          'fp': r['fp']}
                         for r in c.execute("SELECT * FROM submissions WHERE user_id = ? AND kind = 'checkin' ORDER BY created_at DESC LIMIT 50", (user['id'],)).fetchall()]
                flags = rules.review_flags(prior, {'ts': now, 'started_at': started, 'station_id': station_id, 'at': {'lat': st['lat'], 'lng': st['lng']},
                                                   'entries': res['entries'], 'fp': fp, 'location_result': loc_result})
            else:
                started = now
            # Device-reported location can lift a check-in to "Location checked"; it is never "verified".
            evidence = 'location' if kind == 'checkin' and loc_result == 'near' else 'self'
            sid = self._rid('s_')
            c.execute('INSERT INTO submissions (id,user_id,idem_key,kind,created_at,station_id,source,entries_json,receipt_code,verification,evidence,location_result,fp,started_at,flags_json,status,auth_method) '
                      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                      (sid, user['id'], key, kind, now, station_id, source, json.dumps(res['entries']), receipt_key,
                       'verified' if verified else 'self-reported', evidence, loc_result, fp, started, json.dumps(flags),
                       'review' if flags else 'counted', method))
            if receipt_key:
                c.execute('INSERT INTO receipts_used VALUES (?,?,?)', (receipt_key, user['id'], now))
            row = c.execute('SELECT * FROM submissions WHERE id = ?', (sid,)).fetchone()
            if not flags:
                self._credit(c, row)
                row = c.execute('SELECT * FROM submissions WHERE id = ?', (sid,)).fetchone()
            out = self._view(row)
            out['capped'] = res['capped']
            return out

    def appeal(self, user: dict, sub_id: str, note: str) -> dict:
        with self.db.tx() as c:
            row = c.execute('SELECT * FROM submissions WHERE id = ? AND user_id = ?', (sub_id, user['id'])).fetchone()
            if not row or row['status'] not in PENDING:
                raise ApiError(404, 'nothing_to_appeal', 'Nothing to appeal here.')
            c.execute("UPDATE submissions SET status='appealed', note=? WHERE id=?", (_clean_note(note), sub_id))
            return self._view(c.execute('SELECT * FROM submissions WHERE id = ?', (sub_id,)).fetchone())

    def withdraw(self, user: dict, sub_id: str) -> dict:
        with self.db.tx() as c:
            row = c.execute('SELECT * FROM submissions WHERE id = ? AND user_id = ?', (sub_id, user['id'])).fetchone()
            if not row or row['status'] not in PENDING:
                raise ApiError(404, 'nothing_to_withdraw', 'Nothing to withdraw.')
            c.execute("UPDATE submissions SET status='withdrawn' WHERE id=?", (sub_id,))
            return self._view(c.execute('SELECT * FROM submissions WHERE id = ?', (sub_id,)).fetchone())

    # ---- review (staff only: the HTTP layer checks the admin token) -----------------------------

    def review_queue(self) -> list:
        with self.db.tx() as c:
            rows = c.execute("SELECT * FROM submissions WHERE status IN ('review','appealed') ORDER BY created_at").fetchall()
            return [{**self._view(r), 'userRef': r['user_id'][-6:]} for r in rows]

    def decide(self, sub_id: str, approve: bool, actor: str, reason: str = '') -> dict:
        with self.db.tx() as c:
            row = c.execute('SELECT * FROM submissions WHERE id = ?', (sub_id,)).fetchone()
            if not row or row['status'] not in PENDING:
                raise ApiError(404, 'nothing_to_review', 'Nothing to review.')
            if approve:
                # Limits are checked again at approval time, against everything else the person has done.
                history = self._history(c, row['user_id'], min(zurich.start_of_day(row['created_at']), row['created_at'] - rules.LIMITS['duplicate_window_min'] * 60_000) - 1, exclude=sub_id)
                res = rules.evaluate_log(history, [{'material': e['material'], 'count': e['count']} for e in json.loads(row['entries_json'])], row['created_at'])
                if res['ok']:
                    c.execute('UPDATE submissions SET entries_json=?, decided_by=? WHERE id=?', (json.dumps(res['entries']), actor, sub_id))
                    self._credit(c, c.execute('SELECT * FROM submissions WHERE id = ?', (sub_id,)).fetchone())
                else:
                    c.execute("UPDATE submissions SET status='declined', note=?, decided_at=?, decided_by=? WHERE id=?", (res['error'], self.now(), actor, sub_id))
            else:
                c.execute("UPDATE submissions SET status='declined', note=?, decided_at=?, decided_by=? WHERE id=?", (_clean_note(reason) or row['note'], self.now(), actor, sub_id))
            c.execute('INSERT INTO audit (ts, actor, action, ref, detail) VALUES (?,?,?,?,?)', (self.now(), actor, 'approve' if approve else 'decline', sub_id, _clean_note(reason)))
            return self._view(c.execute('SELECT * FROM submissions WHERE id = ?', (sub_id,)).fetchone())

    # ---- rewards ---------------------------------------------------------------------------------

    def redeem(self, user: dict, body: dict) -> dict:
        key = self._key(body)
        reward = self.rewards.get(body.get('rewardId'))
        if not reward:
            raise ApiError(404, 'unknown_reward', 'That reward doesn’t exist.')
        with self.db.tx() as c:
            same = c.execute('SELECT * FROM redemptions WHERE user_id = ? AND idem_key = ?', (user['id'], key)).fetchone()
            if same:
                if same['reward_id'] != reward['id']:
                    raise ApiError(409, 'key_reused', 'That key was already used for a different reward.')
                return self._redemption_view(same, reward, replayed=True)
            method = auth.consume_confirmation(self, c, user['id'], body.get('confirmationId'), 'redeem', key)
            if reward.get('once') and c.execute('SELECT 1 FROM redemptions WHERE user_id = ? AND reward_id = ?', (user['id'], reward['id'])).fetchone():
                raise ApiError(409, 'already_owned', 'You already have this badge.')
            need = reward.get('needsVerifiedItems', 0)
            if need:
                have = c.execute("SELECT COALESCE(SUM(accepted),0) FROM activity_items WHERE user_id = ? AND verification = 'verified'", (user['id'],)).fetchone()[0]
                if have < need:
                    raise ApiError(403, 'not_eligible', f'This reward needs {need} verified items first. You have {have}.')
            balance = self.balance(c, user['id'])
            if balance < reward['cost']:
                raise ApiError(402, 'insufficient_points', 'Not enough points yet.')
            rid, now = self._rid('r_'), self.now()
            code = None if reward['kind'] == 'badge' else f"DEMO-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
            c.execute('INSERT INTO redemptions VALUES (?,?,?,?,?,?,?,?)', (rid, user['id'], key, reward['id'], reward['cost'], code, now, method))
            c.execute('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?,?)', (self._rid('l_'), user['id'], now, -reward['cost'], f"Redeemed: {reward['name']}", 'redeem', rid, None, None))
            return self._redemption_view(c.execute('SELECT * FROM redemptions WHERE id = ?', (rid,)).fetchone(), reward, balance=balance - reward['cost'])

    @staticmethod
    def _redemption_view(row, reward, replayed=False, balance=None) -> dict:
        return {'id': row['id'], 'rewardId': row['reward_id'], 'cost': row['cost'], 'code': row['code'], 'ts': row['ts'],
                'rewardName': reward['name'], 'replayed': replayed, 'balance': balance}

    # ---- quests ----------------------------------------------------------------------------------

    def quests(self, user: dict) -> dict:
        c = self.db.conn()
        items = [dict(r) for r in c.execute('SELECT * FROM activity_items WHERE user_id = ?', (user['id'],)).fetchall()]
        prog = rules.quest_progress(items, self.now())
        claimed = {r[0] for r in c.execute('SELECT claim_id FROM quest_claims WHERE user_id = ?', (user['id'],)).fetchall()}
        out = []
        for qid, q in rules.QUESTS.items():
            claim_id = f"{prog['range']['key']}:{qid}"
            out.append({'id': qid, 'progress': min(q['target'], prog[qid]), 'target': q['target'], 'points': q['points'],
                        'claimId': claim_id, 'claimed': claim_id in claimed})
        return {'rangeKey': prog['range']['key'], 'quests': out}

    def claim_quest(self, user: dict, claim_id: str) -> dict:
        with self.db.tx() as c:
            items = [dict(r) for r in c.execute('SELECT * FROM activity_items WHERE user_id = ?', (user['id'],)).fetchall()]
            prog = rules.quest_progress(items, self.now())
            m = re.fullmatch(r'(m\d{4}-\d{1,2}):(\w+)', str(claim_id))
            if not m or m.group(1) != prog['range']['key'] or m.group(2) not in rules.QUESTS:
                raise ApiError(400, 'bad_claim', 'That quest can’t be claimed.')
            q = rules.QUESTS[m.group(2)]
            if prog[m.group(2)] < q['target']:
                raise ApiError(403, 'not_done', 'This quest isn’t finished yet.')
            if c.execute('SELECT 1 FROM quest_claims WHERE user_id = ? AND claim_id = ?', (user['id'], claim_id)).fetchone():
                raise ApiError(409, 'already_claimed', 'You already claimed this one.')
            now = self.now()
            c.execute('INSERT INTO quest_claims VALUES (?,?,?)', (user['id'], claim_id, now))
            c.execute('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?,?)', (self._rid('l_'), user['id'], now, q['points'], f"Quest: {q['title']}", 'quest', claim_id, None, None))
            return {'points': q['points'], 'balance': self.balance(c, user['id'])}

    # ---- reading --------------------------------------------------------------------------------

    def state(self, user: dict) -> dict:
        c = self.db.conn()
        ledger = [dict(r) for r in c.execute('SELECT id, ts, points, label, type, verification, evidence FROM ledger WHERE user_id = ? ORDER BY ts DESC, rowid DESC LIMIT 200', (user['id'],))]
        activities = [{'id': r['id'], 'batchId': r['submission_id'], 'ts': r['ts'], 'material': r['material'], 'count': r['count'], 'accepted': r['accepted'],
                       'verification': r['verification'], 'stationId': r['station_id'], 'source': r['source'], 'evidence': r['evidence']}
                      for r in c.execute('SELECT * FROM activity_items WHERE user_id = ? ORDER BY ts DESC LIMIT 500', (user['id'],))]
        redemptions = [{'id': r['id'], 'ts': r['ts'], 'rewardId': r['reward_id'], 'cost': r['cost'], 'code': r['code']}
                       for r in c.execute('SELECT * FROM redemptions WHERE user_id = ? ORDER BY ts DESC', (user['id'],))]
        subs = [self._view(r) for r in c.execute("SELECT * FROM submissions WHERE user_id = ? AND kind = 'checkin' AND status != 'withdrawn' ORDER BY created_at DESC LIMIT 50", (user['id'],))]
        claims = [r[0] for r in c.execute('SELECT claim_id FROM quest_claims WHERE user_id = ?', (user['id'],))]
        return {'balance': self.balance(c, user['id']), 'ledger': ledger, 'activities': activities, 'redemptions': redemptions,
                'checkins': subs, 'questClaims': claims, 'serverTime': self.now()}

    def profile(self, user: dict) -> dict:
        return {'id': user['id'], 'nickname': user['nickname'], 'leaderboardOptIn': bool(user['leaderboard_opt_in']), 'isDemo': bool(user['is_demo'])}

    def update_profile(self, user: dict, body: dict) -> dict:
        nick = body.get('nickname')
        opt = bool(body.get('leaderboardOptIn'))
        if nick:
            err = auth.nickname_error(nick)
            if err:
                raise ApiError(400, 'bad_nickname', err)
        if opt and not nick:
            raise ApiError(400, 'bad_nickname', 'Save a nickname first.')
        with self.db.tx() as c:
            if nick and c.execute('SELECT 1 FROM users WHERE lower(nickname) = lower(?) AND id != ?', (nick, user['id'])).fetchone():
                raise ApiError(409, 'nickname_taken', 'That nickname is taken. Try another.')
            c.execute('UPDATE users SET nickname = ?, leaderboard_opt_in = ? WHERE id = ?', (nick or None, int(opt), user['id']))
            return self.profile(dict(c.execute('SELECT * FROM users WHERE id = ?', (user['id'],)).fetchone()))

    def delete_account(self, user: dict) -> dict:
        """Removes everything tied to the account. Used receipt codes stay (without the user) so they can't be redeemed again."""
        uid = user['id']
        with self.db.tx() as c:
            c.execute("UPDATE receipts_used SET user_id = 'deleted' WHERE user_id = ?", (uid,))
            for table in ('sessions', 'challenges', 'quest_claims', 'redemptions', 'ledger', 'activity_items', 'submissions', 'credentials'):
                c.execute(f'DELETE FROM {table} WHERE user_id = ?', (uid,))
            c.execute('DELETE FROM users WHERE id = ?', (uid,))
            c.execute('INSERT INTO audit (ts, actor, action, ref, detail) VALUES (?,?,?,?,?)', (self.now(), 'user', 'delete_account', None, ''))
        return {'ok': True}

    def leaderboard(self, user: dict | None, kind: str, offset: int) -> dict:
        if kind not in ('week', 'month') or offset not in (0, -1):
            raise ApiError(400, 'bad_period', 'Unknown period.')
        rng = zurich.period_range(kind, offset, self.now())
        rows = self.db.conn().execute(
            "SELECT u.id, u.nickname, SUM(i.accepted) AS items, SUM(CASE WHEN i.verification='verified' THEN i.accepted ELSE 0 END) AS verified "
            'FROM activity_items i JOIN users u ON u.id = i.user_id '
            'WHERE u.leaderboard_opt_in = 1 AND u.nickname IS NOT NULL AND i.ts >= ? AND i.ts < ? GROUP BY u.id ORDER BY items DESC, u.nickname LIMIT 100',
            (rng['start'], rng['end'])).fetchall()
        return {'range': rng, 'rows': [{'nickname': r['nickname'], 'items': r['items'], 'verified': r['verified'], 'isMe': bool(user and r['id'] == user['id'])} for r in rows]}
