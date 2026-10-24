"""python -m server               run the app and API (settings come from BC_* environment variables)
python -m server review          list check-ins waiting for review
python -m server review approve <id> | decline <id> [reason]
"""
import sys

from . import config
from .http_server import make_server
from .service import Service


def review_cli(svc, args):
    if not args:
        items = svc.review_queue()
        for i in items:
            print(f"{i['id']}  {i['status']:9}  user …{i['userRef']}  {i['stationName']}  {i['entries']}  flags={i['flags']}  note={i['note']!r}")
        print(f'{len(items)} waiting.')
        return
    action, sid = args[0], args[1] if len(args) > 1 else ''
    if action not in ('approve', 'decline') or not sid:
        raise SystemExit(__doc__)
    out = svc.decide(sid, action == 'approve', 'cli', ' '.join(args[2:]))
    print(f"{sid}: {out['status']}")


def main():
    settings = config.from_env()
    svc = Service(settings)
    if sys.argv[1:2] == ['review']:
        return review_cli(svc, sys.argv[2:])
    httpd = make_server(svc)
    print(f'\n  RECYCL IT! server ({settings.mode} mode) on http://{settings.host}:{settings.port}')
    print(f'  Origin {settings.origin} · database {settings.db_path}')
    if not settings.admin_token:
        print('  Admin API disabled (set BC_ADMIN_TOKEN to enable). Review from this machine with: python -m server review')
    if settings.mode == 'live' and not settings.receipt_secret:
        print('  No BC_RECEIPT_SECRET: receipt codes cannot be verified, so every log stays self-reported.')
    print('  Press Ctrl+C to stop.\n')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n  Stopped.')


if __name__ == '__main__':
    main()
