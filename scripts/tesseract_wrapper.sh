#!/usr/bin/env bash
set -euo pipefail
task_ocr_root="$(cd "$(dirname "$0")/../.runtime/ocr" && pwd)"
# Keep conda libraries scoped to this OCR child; global libiconv conflicts with cv2.
export DYLD_LIBRARY_PATH="$task_ocr_root/lib"
export TESSDATA_PREFIX="$task_ocr_root/share/tessdata"
exec "$task_ocr_root/bin/tesseract" "$@"
