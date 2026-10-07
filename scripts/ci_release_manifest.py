"""Stamp each CI export with the same commit and shared app source fingerprint.

This only records build evidence. It never deploys, signs or publishes an app.
"""
from __future__ import annotations

import hashlib
import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_TYPES = {
    "web": "web-static",
    "android": "android-js-bundle-not-apk",
    "ios": "ios-js-bundle-not-ipa",
}


def shared_source_digest(root: Path) -> str:
    """Hash common source/assets/config, excluding generated native/build outputs."""
    files = [root / "app" / "App.tsx", root / "app" / "index.ts",
             root / "app" / "app.json", root / "app" / "package.json",
             root / "app" / "package-lock.json", root / "app" / "tsconfig.json"]
    for folder in ("app/src", "app/assets", "app/modules", "app/plugins", "shared"):
        files.extend(path for path in (root / folder).rglob("*")
                     if path.is_file() and "node_modules" not in path.parts and
                     "__pycache__" not in path.parts and path.suffix != ".pyc")
    digest = hashlib.sha256()
    for path in sorted(set(files), key=lambda value: value.relative_to(root).as_posix()):
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def validate_public_api_url(value: str, platform: str) -> bool:
    if value == "/api" and platform == "web":
        return False  # host must route /api to the deployed backend
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or
            parsed.password or parsed.query or parsed.fragment):
        raise ValueError("CI API URL must be public HTTPS with no credentials, query or fragment")
    return not parsed.hostname.endswith(".invalid")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-config", action="store_true")
    arguments = parser.parse_args()
    platform = os.environ.get("BUILD_PLATFORM", "")
    if platform not in ARTIFACT_TYPES:
        raise ValueError("BUILD_PLATFORM must be web, android or ios")
    sha = os.environ.get("BUILD_GIT_SHA", "")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("BUILD_GIT_SHA must be the full 40-character Git commit SHA")
    api_url = os.environ.get("WEB_API_URL" if platform == "web" else "NATIVE_API_URL", "")
    api_configured = validate_public_api_url(api_url, platform)
    if arguments.validate_config:
        print(f"Validated public API configuration for {platform}; configured: {api_configured}.")
        return
    directory = (ROOT / os.environ.get("BUILD_DIRECTORY", "")).resolve()
    if not directory.is_relative_to(ROOT) or directory == ROOT or not directory.is_dir():
        raise ValueError("BUILD_DIRECTORY must be an existing output directory within the repo")
    marker = "index.html" if platform == "web" else "metadata.json"
    if not (directory / marker).is_file():
        raise ValueError("The requested platform export is missing its build marker")
    manifest = {
        "git_sha": sha,
        "shared_source_sha256": shared_source_digest(ROOT),
        "platform": platform,
        "artifact_type": ARTIFACT_TYPES[platform],
        "installable_mobile_binary": False,
        "published": False,
        "api_url": api_url,
        "api_url_configured": api_configured,
        "note": ("Web static export; configure Vercel HTTPS backend routing before deployment."
                 if platform == "web" else
                 "JavaScript/Hermes export only. Native build/signing and Expo Updates setup are separate."),
    }
    (directory / "release-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Recorded {platform} source commit {sha}; artifact {ARTIFACT_TYPES[platform]}; not published.")


if __name__ == "__main__":
    main()
