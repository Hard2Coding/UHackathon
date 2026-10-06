#!/usr/bin/env bash
set -euo pipefail
cd /srv
exec python scripts/start_api.py
