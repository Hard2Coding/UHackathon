"""Use the already-installed PyTorch OpenMP runtime on macOS, if available."""
from __future__ import annotations

import ctypes
import site
import sys
from pathlib import Path

_library = None


def prepare_native_runtime():
    global _library
    if sys.platform != "darwin" or _library is not None:
        return
    # XGBoost's wheel refers to @rpath/libomp.dylib. Preloading the matching
    # bundled library avoids requiring a system/Homebrew install for this demo.
    for root in site.getsitepackages():
        path = Path(root) / "torch" / "lib" / "libomp.dylib"
        if path.is_file():
            try:
                _library = ctypes.CDLL(str(path), mode=ctypes.RTLD_GLOBAL)
                return
            except OSError:
                continue
