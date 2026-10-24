"""Recycling rules enforced by the server. Mirrors js/logic/activity.js, evidence.js and quests.js.

The browser runs the same rules to give quick feedback, but only these decide what counts.
tests/fixtures/rules.json is run against both implementations.
"""
import math

from . import zurich

COUNTABLE = {'glass', 'pet', 'plastic_bottle', 'aluminium', 'tin', 'paper', 'cardboard', 'battery', 'textile', 'electronics'}
LABELS = {
    'glass': 'Glass', 'pet': 'PET drink bottles', 'plastic_bottle': 'Plastic bottles', 'aluminium': 'Aluminium',
    'tin': 'Tin / steel cans', 'paper': 'Paper', 'cardboard': 'Cardboard', 'battery': 'Batteries',
    'textile': 'Textiles & shoes', 'electronics': 'Small electronics',
}

LIMITS = {'max_items_per_log': 50, 'max_logs_per_day': 20, 'max_items_per_day': 150, 'duplicate_window_min': 10}
POINTS = {'per_item': 5, 'verified_bonus_per_item': 2}
CHECKIN = {'near_m': 75, 'max_accuracy_m': 100, 'large_trip_items': 40, 'rapid_count': 3, 'rapid_window_min': 60,
           'max_speed_kmh': 100, 'dupe_hamming': 4}
MAX_QUEUE_AGE_MS = 72 * 3_600_000  # an offline submission older than this has expired and must be redone


def points_for(accepted: int, verified: bool) -> int:
    return accepted * POINTS['per_item'] + (accepted * POINTS['verified_bonus_per_item'] if verified else 0)


def _is_int(n) -> bool:
    return isinstance(n, int) and not isinstance(n, bool)


def evaluate_log(history: list, entries: list, now: int) -> dict:
    """Validate a batch of {material, count}. `history` rows: {ts, material, count, accepted, batch_id}
    covering everything that already counts or is waiting for review."""
    clean = [e for e in entries if isinstance(e, dict) and isinstance(e.get('material'), str) and e.get('material') and isinstance(e.get('count'), (int, float))
             and not isinstance(e.get('count'), bool) and e['count'] > 0]
    if not clean:
        return {'ok': False, 'code': 'no_items', 'error': 'Add at least one item to log.'}
    for e in clean:
        if e['material'] not in COUNTABLE:
            return {'ok': False, 'code': 'not_countable', 'error': 'That material isn’t counted as an accepted recyclable item yet.'}
        if not _is_int(e.get('count')) or e['count'] < 1:
            return {'ok': False, 'code': 'not_integer', 'error': 'Item counts must be whole numbers.'}
        if e['count'] > LIMITS['max_items_per_log']:
            return {'ok': False, 'code': 'too_many_per_log', 'error': f"You can log up to {LIMITS['max_items_per_log']} items per material at once. Split larger amounts into separate logs."}
    seen = set()
    for e in clean:
        if e['material'] in seen:
            return {'ok': False, 'code': 'duplicate_material', 'error': f"{LABELS[e['material']]} appears twice — combine them into one line."}
        seen.add(e['material'])

    day_start = zurich.start_of_day(now)
    today = [a for a in history if a['ts'] >= day_start]
    if len({a['batch_id'] for a in today}) >= LIMITS['max_logs_per_day']:
        return {'ok': False, 'code': 'daily_logs', 'error': f"You’ve reached today’s limit of {LIMITS['max_logs_per_day']} logs. You can log again tomorrow."}

    window_start = now - LIMITS['duplicate_window_min'] * 60_000
    for e in clean:
        dup = next((a for a in history if a['ts'] >= window_start and a['material'] == e['material'] and a['count'] == e['count']), None)
        if dup:
            return {'ok': False, 'code': 'duplicate', 'error': f"This looks like a duplicate: you logged {e['count']} × {LABELS[e['material']].lower()} a few minutes ago. If it’s really new, wait a few minutes or change the count."}

    remaining = LIMITS['max_items_per_day'] - sum(a['accepted'] for a in today)
    if remaining <= 0:
        return {'ok': False, 'code': 'daily_items', 'error': f"You’ve hit the daily cap of {LIMITS['max_items_per_day']} items. Anything more can be logged tomorrow."}
    capped = False
    out = []
    for e in clean:
        accepted = min(e['count'], max(0, remaining))
        capped = capped or accepted < e['count']
        remaining -= accepted
        out.append({'material': e['material'], 'count': e['count'], 'accepted': accepted})
    return {'ok': True, 'entries': out, 'accepted': sum(e['accepted'] for e in out), 'capped': capped}


# ---- Check-in evidence ---------------------------------------------------------------

def haversine_km(a: dict, b: dict) -> float:
    r = 6371
    rad = math.radians
    d_lat, d_lng = rad(b['lat'] - a['lat']), rad(b['lng'] - a['lng'])
    h = math.sin(d_lat / 2) ** 2 + math.cos(rad(a['lat'])) * math.cos(rad(b['lat'])) * math.sin(d_lng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def hamming(a, b) -> int:
    if not a or not b or len(a) != len(b):
        return 64
    try:
        return sum(bin(int(x, 16) ^ int(y, 16)).count('1') for x, y in zip(a, b))
    except ValueError:
        return 64


def review_flags(history: list, c: dict) -> list:
    """`history`: earlier check-ins [{status, ts, started_at, station_id, at, fp}] newest first.
    `c`: {ts, started_at, station_id, at, entries, fp, location_result}."""
    k = CHECKIN
    prior = [h for h in history if h['status'] not in ('declined', 'withdrawn')]
    out = []
    recent = [h for h in prior if c['ts'] - h['ts'] <= k['rapid_window_min'] * 60_000]
    if len(recent) >= k['rapid_count'] - 1:
        out.append('rapid')
    if any(h['station_id'] != c['station_id'] and h['started_at'] < c['ts'] and c['started_at'] < h['ts'] for h in prior):
        out.append('overlap')
    if sum(e['count'] for e in c['entries']) >= k['large_trip_items']:
        out.append('large')
    if c.get('fp') and any(h.get('fp') and hamming(h['fp'], c['fp']) <= k['dupe_hamming'] for h in prior):
        out.append('dupe_photo')
    prev = prior[0] if prior else None
    if prev and prev['station_id'] != c['station_id'] and prev.get('at') and c.get('at'):
        hours = max((c['ts'] - prev['ts']) / 3_600_000, 1 / 3600)
        km = haversine_km(prev['at'], c['at'])
        if km > 0.3 and km / hours > k['max_speed_kmh']:
            out.append('travel')
    if c.get('location_result') == 'far':
        out.append('far')
    return out


# ---- Monthly quests the server can verify ---------------------------------------------
# Scans, Bottledex entries and map help live only on the device, so the server can't vouch for them.

QUESTS = {
    'items': {'title': 'Recycle 25 items', 'target': 25, 'points': 30},
    'mix': {'title': 'Try 4 different materials', 'target': 4, 'points': 20},
    'verified': {'title': 'Log 5 verified items', 'target': 5, 'points': 25},
    'weeks': {'title': 'Recycle in 3 different weeks', 'target': 3, 'points': 25},
}


def quest_progress(items: list, now: int) -> dict:
    """`items`: counted activity rows [{id, ts, material, accepted, verification}] for this user."""
    rng = zurich.period_range('month', 0, now)
    seen, materials, weeks = set(), set(), set()
    total = verified = 0
    for a in items:
        if a['id'] in seen:
            continue
        seen.add(a['id'])
        if not (rng['start'] <= a['ts'] < rng['end']) or a['material'] not in COUNTABLE or not a['accepted'] > 0:
            continue
        total += a['accepted']
        materials.add(a['material'])
        weeks.add(zurich.week_start(a['ts']))
        if a['verification'] == 'verified':
            verified += a['accepted']
    return {'range': rng, 'items': total, 'mix': len(materials), 'verified': verified, 'weeks': len(weeks)}
