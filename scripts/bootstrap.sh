#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
task_python="${PYTHON_BIN:-python3.12}"
"$task_python" -c 'import sys; assert sys.version_info[:2] == (3, 12), "Use Python 3.12"'
if [ ! -f .venv/bin/python ]; then "$task_python" -m venv .venv; fi
if [ "$(uname -s)" = "Linux" ]; then
  .venv/bin/python -m pip install 'torch==2.7.0+cpu' --index-url https://download.pytorch.org/whl/cpu
fi
.venv/bin/python -m pip install -r requirements.lock
if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ] && [ "${INSTALL_LOCAL_OCR:-1}" = "1" ]; then
  .venv/bin/python scripts/install_local_ocr.py
  source scripts/env.sh
fi
.venv/bin/python scripts/check_install.py
mkdir -p .runtime
if [ "${DOWNLOAD_EMBEDDINGS:-1}" = "1" ]; then
  .venv/bin/python scripts/download_embeddings.py
fi
cd app
npm ci
printf '\nInstalled. See README.md for local demo and Docker commands.\n'
