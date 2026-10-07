#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
mkdir -p .runtime
export DATABASE_URL="sqlite:///$(pwd)/.runtime/checks.db"
.venv/bin/python -m pip check
.venv/bin/python scripts/check_install.py
.venv/bin/python -m pytest backend/tests ml/tests -q
.venv/bin/python -m ml validate ml/datasets/sample.jsonl
.venv/bin/python -m ml evaluate ml/datasets/sample.jsonl --artifacts ml/artifacts/default
.venv/bin/python scripts/export_openapi.py
cd app
npm run typecheck
npm run test:flows
npm run test:webapp
npm run build
