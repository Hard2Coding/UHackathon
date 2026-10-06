#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ]; then
  printf 'Run bash scripts/bootstrap.sh first with Python 3.12.\n' >&2
  exit 1
fi
source scripts/env.sh
exec .venv/bin/python scripts/start_api.py --sqlite-demo
