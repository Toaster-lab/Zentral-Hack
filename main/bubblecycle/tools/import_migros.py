"""Turns a permitted, official Migros export into js/data/migros-import.js.

    python tools/import_migros.py export.json [--out js/data/migros-import.js] [--drop-invalid] [--today YYYY-MM-DD]

This is the only way Migros data enters the app, and it is deliberately small:

- It reads ONE LOCAL FILE. It makes no network requests, logs in nowhere, scrapes nothing and needs no credentials.
  Someone with permission obtains the export (see docs/MIGROS-IMPORT.md); this tool checks it and converts it.
- Only the three approved pilot barcodes are accepted, and only the fields in FIELDS. Anything else (including any
  stock or availability information) is refused.
- The export must name Migros as its source, give an https migros.ch address it came from, the date it was retrieved
  and the permission it was obtained under. That is what the app later shows as "Source: Migros".
- A problem anywhere stops the run and writes nothing, unless --drop-invalid is given (then only the valid part is written).

The rules are the same as validateMigrosImport() in js/data/catalogue.js; tests/fixtures/migros_import_cases.json is shared.
"""
import argparse
import datetime
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / 'js' / 'data' / 'migros-import.js'
DIETS = ('vegan', 'vegetarian', 'neither')
ALLERGENS = ('gluten', 'milk', 'nuts', 'peanuts', 'soy', 'eggs', 'sesame')
FIELDS = ('priceChf', 'diet', 'allergens', 'mayContain', 'ingredients', 'photo')
ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def approved_barcodes() -> list:
    """The pilot's barcodes, read from the app's own catalogue so there is one list."""
    js = (ROOT / 'js' / 'data' / 'catalogue.js').read_text(encoding='utf-8')
    block = js[js.index('const SUPPLIED = ['):]
    block = block[:block.index('];')]
    return re.findall(r"barcode: '(\d+)'", block)


def is_migros_url(value) -> bool:
    if not isinstance(value, str):
        return False
    try:
        u = urlparse(value)
        host = u.hostname or ''
    except ValueError:
        return False
    return u.scheme == 'https' and not u.username and not u.password and (host == 'migros.ch' or host.endswith('.migros.ch'))


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float('inf')


def field_problem(name, v):
    if name == 'priceChf':
        return None if _is_number(v) and 0 < v < 1000 else 'priceChf must be a number of CHF between 0 and 1000'
    if name == 'diet':
        return None if v in DIETS else f"diet must be one of {', '.join(DIETS)}"
    if name in ('allergens', 'mayContain'):
        return None if isinstance(v, list) and all(x in ALLERGENS for x in v) else f"{name} must be a list of {', '.join(ALLERGENS)}"
    if name == 'ingredients':
        return None if isinstance(v, str) and v.strip() and len(v) <= 1500 else 'ingredients must be non-empty text of at most 1500 characters'
    if name == 'photo':
        return None if is_migros_url(v) else 'photo must be an https address on migros.ch'
    return f'field "{name}" is not accepted'


def validate(imp, approved, today=None):
    """Returns (records, problems). `records` = {barcode: {'fields', 'url', 'retrievedAt'}} holding only what passed."""
    today = today or datetime.date.today().isoformat()
    problems = []
    if not isinstance(imp, dict) or not isinstance(imp.get('records'), dict) or not imp['records']:
        return {}, problems
    s = imp.get('source')
    s = s if isinstance(s, dict) else {}
    if s.get('name') != 'Migros':
        problems.append('source.name must be "Migros"')
    if not is_migros_url(s.get('url')):
        problems.append('source.url must be an https address on migros.ch')
    ra = s.get('retrievedAt')
    if not (isinstance(ra, str) and ISO_DATE.match(ra) and ra <= today):
        problems.append('source.retrievedAt must be a past or present YYYY-MM-DD date')
    if not (isinstance(s.get('permission'), str) and s['permission'].strip()):
        problems.append('source.permission must say why this export may be used')
    if problems:
        return {}, problems
    records = {}
    for barcode, rec in imp['records'].items():
        if barcode not in approved:
            problems.append(f'{barcode}: not one of the approved pilot products')
            continue
        fields = {}
        for name, v in ((rec or {}).get('fields') or {}).items():
            why = field_problem(name, v) if name in FIELDS else f'field "{name}" is not accepted'
            if why:
                problems.append(f'{barcode}: {why}')
            else:
                fields[name] = v
        if fields:
            url = rec.get('url') if is_migros_url(rec.get('url')) else s['url']
            when = rec.get('retrievedAt') if isinstance(rec.get('retrievedAt'), str) and ISO_DATE.match(rec['retrievedAt']) and rec['retrievedAt'] <= today else ra
            records[barcode] = {'fields': fields, 'url': url, 'retrievedAt': when}
    return records, problems


def render(source, records) -> str:
    body = json.dumps({'schema': 1, 'source': source, 'records': records}, indent=2, ensure_ascii=False)
    return ('// Written by tools/import_migros.py from a permitted official Migros export. DO NOT EDIT BY HAND.\n'
            f'// Imported {datetime.date.today().isoformat()}. Fields listed here are the only ones the app shows as "Source: Migros".\n'
            f'export const MIGROS_IMPORT = {body};\n')


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('export', type=Path, help='the local JSON export (schema in docs/MIGROS-IMPORT.md)')
    ap.add_argument('--out', type=Path, default=DEFAULT_OUT)
    ap.add_argument('--drop-invalid', action='store_true', help='write the valid part even if some of it was refused')
    ap.add_argument('--today', help='override today (YYYY-MM-DD), for tests')
    args = ap.parse_args(argv)
    try:
        imp = json.loads(args.export.read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:
        print(f'Cannot read {args.export}: {e}', file=sys.stderr)
        return 2
    records, problems = validate(imp, approved_barcodes(), args.today)
    for p in problems:
        print(f'refused: {p}', file=sys.stderr)
    if not records:
        print('Nothing to import: no valid records. The app keeps showing team-supplied details only.', file=sys.stderr)
        return 1
    if problems and not args.drop_invalid:
        print('Nothing written. Fix the export, or pass --drop-invalid to keep only the valid part.', file=sys.stderr)
        return 1
    args.out.write_text(render(imp['source'], records), encoding='utf-8', newline='\n')
    print(f'{sum(len(r["fields"]) for r in records.values())} fields for {len(records)} product(s) -> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
