"""Inspect configuration without printing secrets; network checks are opt-in.

Read-only: does not enable providers, send LINE messages or validate credentials
against a provider. A configured value is not proof of successful integration.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def real_https(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        return parsed.scheme == "https" and bool(host) and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment and not host.endswith((".example", ".invalid", ".test")) and host not in {"example", "invalid", "test", "localhost", "127.0.0.1", "::1"}
    except ValueError:
        return False


def callback_valid(value: str, provider: str, production: bool) -> bool:
    try:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").lower()
        transport = parsed.scheme == "https" or (not production and parsed.scheme == "http" and host in {"localhost", "127.0.0.1", "::1"})
        reserved = any(host == suffix or host.endswith("." + suffix) for suffix in ("example", "invalid", "test"))
        return bool(transport and host and not reserved and not parsed.username and not parsed.password
                    and not parsed.query and not parsed.fragment
                    and parsed.path.endswith(f"/api/auth/oauth/{provider}/callback"))
    except ValueError:
        return False


def executable_ready(command: list[str]) -> bool:
    try:
        return subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              timeout=10, check=False).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def check(web_origin: str | None = None) -> dict:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env", override=False)
    from backend.app.oauth import provider_config
    from backend.app.notifications import messaging_config

    configured = {}
    production = os.getenv("APP_ENV", "development") == "production"
    for name in ("google", "line"):
        cfg = provider_config(name)
        configured[name] = {
            "configured": cfg["enabled"],
            "status": cfg["status"],
            "missing_config": cfg["missing_config"],
            "public_https_callback": real_https(cfg["redirect_uri"]),
            "callback_valid": callback_valid(cfg["redirect_uri"], name, production),
            "login_performed_by_this_check": False,
        }
    line = messaging_config(public=True)
    configured["line_messaging"] = {
        "configured": line["configured"],
        "missing_config": line["missing_config"],
        "official_account_link_present": bool(line["official_account_url"]),
        "delivery_performed_by_this_check": False,
        "requires": ["same_LINE_Provider", "verified_LINE_link", "signed_follow_webhook", "user_opt_in"],
    }
    allowlist = [item.strip() for item in os.getenv("OAUTH_REDIRECT_ALLOWLIST", "").split(",") if item.strip()]
    cors = [item.strip() for item in os.getenv("CORS_ORIGINS", "").split(",") if item.strip()]
    default_allowlist = [item.strip() for item in os.getenv("OAUTH_REDIRECT_ALLOWLIST", "http://localhost:8081/,scamgraph://oauth").split(",") if item.strip()]
    sdk_dir = Path(os.getenv("ANDROID_HOME") or os.getenv("ANDROID_SDK_ROOT") or str(Path.home() / "Library/Android/sdk"))
    native = {
        "android_toolchain": {"jdk_ready": executable_ready(["java", "-version"]),
            "sdk_ready": (sdk_dir / "platform-tools/adb").is_file() and (sdk_dir / "platforms").is_dir(),
            "device_calls_performed_by_this_check": False},
        "ios_toolchain": {"xcode_present": bool(shutil.which("xcodebuild")), "cocoapods_present": bool(shutil.which("pod")),
            "device_build_performed_by_this_check": False},
    }
    native["android_toolchain"]["ready"] = native["android_toolchain"]["jdk_ready"] and native["android_toolchain"]["sdk_ready"]
    native["ios_toolchain"]["ready"] = native["ios_toolchain"]["xcode_present"] and native["ios_toolchain"]["cocoapods_present"]
    return {
        "env_file_present": (ROOT / ".env").is_file(),
        "secrets_printed": False,
        "providers": configured,
        "native_prerequisites": native,
        "public_secret_variable_names": sorted(key for key, value in os.environ.items()
            if value and key.startswith("EXPO_PUBLIC_") and any(part in key for part in ("SECRET", "TOKEN", "API_KEY"))),
        "webapp": {
            "export_present": (ROOT / "app/dist/index.html").is_file(),
            "worker_present": (ROOT / "app/dist/service-worker.js").is_file(),
            "public_https_api": real_https(os.getenv("EXPO_PUBLIC_API_URL", "")),
            "native_call_screening_supported_in_web": False,
            "offline_analysis_available": False,
            "return_in_allowlist": None if not web_origin else web_origin.rstrip("/") + "/" in default_allowlist,
        },
        "production": {
            "production_mode": os.getenv("APP_ENV", "development") == "production",
            "demo_seed_disabled": os.getenv("ENABLE_DEMO_SEED", "true").lower() == "false",
            "postgres_configured": os.getenv("DATABASE_URL", "").startswith(("postgresql://", "postgresql+psycopg://")),
            "cors_https_only": bool(cors) and all(real_https(item) for item in cors),
            "client_redirects_present": bool(allowlist),
            "client_redirects_public_https_or_native": bool(allowlist) and all(real_https(item) or item == "scamgraph://oauth" for item in allowlist),
        },
        "note": "Local syntax/config presence only. Credentials, provider console settings, HTTPS routing, signed webhooks, databases and real device calls still require actual integration tests. No tokens or environment values are included.",
    }


def public_api_report(api_url: str) -> dict:
    """Only three public GET requests; discard identifiers/evidence/response prose."""
    import httpx
    parsed = urlsplit(api_url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or not parsed.hostname:
        raise ValueError("Invalid API URL")
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise ValueError("HTTPS or HTTP loopback required")
    base = api_url.rstrip("/")
    if not base.endswith("/api"):
        base += "/api"
    output = {}
    with httpx.Client(timeout=8, follow_redirects=False) as client:
        for name, path in (("health", "/health"), ("providers", "/auth/providers"), ("caller_directory", "/caller-id/directory")):
            try:
                response = client.get(base + path)
                if response.status_code != 200:
                    output[name] = {"status": "unavailable", "http_status": response.status_code}
                    continue
                data = response.json()
                if name == "health":
                    output[name] = {"status": data.get("status"), "database": data.get("database"),
                        "inference_status": data.get("inference", {}).get("status"),
                        "dataset_is_sample": data.get("inference", {}).get("dataset_is_sample"),
                        "ocr_status": data.get("ocr", {}).get("status"), "qr_status": data.get("qr", {}).get("status"),
                        "llm_status": data.get("llm", {}).get("status")}
                elif name == "providers":
                    output[name] = {key: {field: data.get(key, {}).get(field) for field in
                        (("configured", "status", "missing_config") if key == "line_messaging" else ("enabled", "status", "missing_config"))}
                        for key in ("google", "line", "line_messaging")}
                else:
                    output[name] = {"status": data.get("status"), "entry_count": len(data.get("entries", [])),
                        "generated_at": data.get("generated_at"), "expires_at": data.get("expires_at")}
            except (httpx.HTTPError, ValueError, TypeError, AttributeError):
                output[name] = {"status": "unavailable"}
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production", action="store_true", help="Exit nonzero when production configuration is incomplete")
    parser.add_argument("--api-url", help="Opt-in read-only public health/providers/directory checks")
    parser.add_argument("--web-origin", help="Check exact web return URL membership without printing it")
    parser.add_argument("--require", action="append", default=[], choices=["google", "line", "line_login", "line_messaging", "android_toolchain", "ios_toolchain"],
                        help="Exit nonzero when the named integration has missing local prerequisites")
    args = parser.parse_args()
    try:
        result = check(args.web_origin)
    except Exception as exc:
        # Exception text may contain a database URI; expose only its type.
        print(json.dumps({"status": "check_failed", "error_type": type(exc).__name__, "secrets_printed": False}))
        return 2
    if args.api_url:
        try:
            result["public_api"] = public_api_report(args.api_url)
        except ValueError:
            parser.error("Invalid API URL: use HTTPS or HTTP loopback, without credentials/query/fragment")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["public_secret_variable_names"]:
        return 1
    if args.production:
        ready = all(result["production"].values()) and result["webapp"]["public_https_api"] and all(result["providers"][name]["configured"] and result["providers"][name]["public_https_callback"] for name in ("google", "line")) and result["providers"]["line_messaging"]["configured"] and result["providers"]["line_messaging"]["official_account_link_present"]
        if not ready:
            return 1
    for name in args.require:
        if name in result["native_prerequisites"]:
            if not result["native_prerequisites"][name]["ready"]:
                return 1
        else:
            name = "line" if name == "line_login" else name
            item = result["providers"][name]
            if not item["configured"] or name != "line_messaging" and not item["callback_valid"]:
                return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
