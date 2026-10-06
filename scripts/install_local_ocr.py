"""Install locked portable macOS ARM64 Tesseract in .runtime, without sudo/Conda."""
from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import tarfile
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import zstandard

ROOT = Path(__file__).resolve().parents[1]
if platform.system() != "Darwin" or platform.machine() != "arm64":
    raise SystemExit("This locked portable runtime is macOS ARM64 only. Docker includes Tesseract for Linux.")
manifest = json.loads((ROOT / "ocr-runtime.lock.json").read_text())
target = ROOT / ".runtime/ocr"
cache = ROOT / ".runtime/ocr-cache"
target.mkdir(parents=True, exist_ok=True)
cache.mkdir(parents=True, exist_ok=True)


def fetch(package):
    url = package["url"]
    if not url.startswith("https://conda.anaconda.org/conda-forge/"):
        raise ValueError("Unexpected runtime source")
    path = cache / url.rsplit("/", 1)[-1]
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == package["sha256"]:
        return package, path
    digest = hashlib.sha256()
    with httpx.stream("GET", url, follow_redirects=True, timeout=120) as response:
        response.raise_for_status()
        with path.open("wb") as file:
            for chunk in response.iter_bytes(1024 * 1024):
                digest.update(chunk)
                file.write(chunk)
    if digest.hexdigest() != package["sha256"]:
        path.unlink(missing_ok=True)
        raise ValueError(f"Checksum mismatch: {package['name']}")
    print(f"Downloaded + verified {package['name']}", flush=True)
    return package, path


def unpack(package, archive):
    with zipfile.ZipFile(archive) as zip_file:
        payload = next(name for name in zip_file.namelist() if name.startswith("pkg-") and name.endswith(".tar.zst"))
        with zip_file.open(payload) as source, zstandard.ZstdDecompressor().stream_reader(source) as reader:
            with tarfile.open(fileobj=reader, mode="r|") as tar:
                for member in tar:
                    # Retain only executable/runtime libraries and needed OCR languages.
                    name = member.name
                    keep = name == "bin/tesseract" or name.startswith("lib/") or name in {
                        "share/tessdata/eng.traineddata", "share/tessdata/tha.traineddata", "share/tessdata/osd.traineddata",
                    }
                    if keep:
                        tar.extract(member, target, filter="data")
    print(f"Installed {package['name']} inside project", flush=True)


with ThreadPoolExecutor(max_workers=4) as pool:
    downloaded = list(pool.map(fetch, manifest["packages"]))
for package, archive in downloaded:
    unpack(package, archive)
env = os.environ.copy()
env["DYLD_LIBRARY_PATH"] = str(target / "lib") + (":" + env["DYLD_LIBRARY_PATH"] if env.get("DYLD_LIBRARY_PATH") else "")
env["TESSDATA_PREFIX"] = str(target / "share/tessdata")
subprocess.run([str(target / "bin/tesseract"), "--version"], env=env, check=True)
subprocess.run([str(target / "bin/tesseract"), "--list-langs"], env=env, check=True)
(ROOT / "scripts/tesseract_wrapper.sh").chmod(0o755)
print("Ready. source scripts/env.sh; bash scripts/local_demo.sh", flush=True)
