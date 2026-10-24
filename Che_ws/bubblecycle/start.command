#!/usr/bin/env sh
# Start RECYCL IT! on macOS or Linux. Needs Python 3.
#   ./start.sh            (first time: chmod +x start.sh)
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py "$@"
elif command -v python >/dev/null 2>&1; then
  exec python serve.py "$@"
else
  echo "Python 3 was not found. Install it from https://www.python.org/downloads/ and try again."
  exit 1
fi
