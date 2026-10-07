#!/usr/bin/env bash
# Source before local Python or Expo commands. Keep tool caches in this project.
if [ -n "${BASH_VERSION:-}" ]; then
  task_env_source="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
  task_env_source="${(%):-%N}"
else
  printf 'Source scripts/env.sh from Bash or Zsh.\n' >&2
  return 1
fi
task_project_root="$(cd "$(dirname "$task_env_source")/.." && pwd)"
export PYTHONPATH="$task_project_root${PYTHONPATH:+:$PYTHONPATH}"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-1}"
export TOKENIZERS_PARALLELISM=false
export HF_HOME="${HF_HOME:-$task_project_root/.runtime/huggingface}"
export PIP_CACHE_DIR="${PIP_CACHE_DIR:-$task_project_root/.runtime/pip-cache}"
export NPM_CONFIG_CACHE="$task_project_root/.runtime/npm-cache"
export __UNSAFE_EXPO_HOME_DIRECTORY="$task_project_root/.runtime/expo"
export EXPO_NO_TELEMETRY=1
mkdir -p "$task_project_root/.runtime"
if [ "$(uname -s)" = "Darwin" ]; then
  # PyTorch ships the same OpenMP runtime needed by the XGBoost macOS wheel.
  task_torch_lib="$task_project_root/.venv/lib/python3.12/site-packages/torch/lib"
  export DYLD_LIBRARY_PATH="$task_torch_lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
  if [ -x "$task_project_root/.runtime/ocr/bin/tesseract" ]; then
    export TESSERACT_CMD="$task_project_root/scripts/tesseract_wrapper.sh"
    export TESSDATA_PREFIX="$task_project_root/.runtime/ocr/share/tessdata"
  fi
fi
