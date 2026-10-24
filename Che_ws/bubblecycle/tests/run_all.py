"""Runs every automated check in order: server tests, browser unit tests, end-to-end tests. Stops at the first failing group.

    python tests/run_all.py

Needs: pip install -r requirements-dev.txt, and Chrome or Edge for the browser parts."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

STEPS = [
    ('server tests', [sys.executable, '-m', 'pytest', 'tests/py', '-q']), 
    ('browser unit tests', [sys.executable, 'tests/run_js.py']),
    ('end-to-end tests', [sys.executable, '-m', 'pytest', 'tests/e2e', '-q']),
]


if __name__ == '__main__':
    for name, cmd in STEPS:
        print(f'\n== {name} ==', flush=True)
        if subprocess.call(cmd, cwd=ROOT) != 0:
            print(f'\n{name} FAILED')
            sys.exit(1)
    print('\nAll automated checks passed. (Real-phone checks are separate: docs/PHONE-TESTING.md)')
