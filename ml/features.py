"""Pure lexical URL features. These functions never fetch or open a URL."""
from __future__ import annotations

import ipaddress
import math
import re
from collections import Counter
from difflib import SequenceMatcher
from urllib.parse import urlsplit

FEATURE_NAMES = [
    "url_length", "host_length", "path_length", "dot_count", "hyphen_count",
    "digit_count", "subdomain_count", "ip_host", "punycode", "https",
    "suspicious_keyword_count", "host_entropy", "url_entropy", "query_length",
    "at_sign", "percent_encoding_count", "explicit_port", "brand_in_host",
    "brand_edit_similarity", "path_depth",
]
BRANDS = ("kasikorn", "kbank", "scb", "krungthai", "paypal", "google", "microsoft", "apple", "amazon", "shopee", "lazada", "facebook")
KEYWORDS = ("verify", "secure", "login", "account", "confirm", "reward", "bonus", "wallet", "update", "claim", "urgent", "suspend", "kyc")


def parse_url(value: str):
    value = value.strip()
    return urlsplit(value if "://" in value else "https://" + value)


def domain_key(value: str) -> str:
    """Conservative registrable-domain grouping for common suffixes and reserved test data.

    An unknown public suffix is intentionally over-grouped rather than split across sets.
    This is not a live public-suffix lookup or reputation service.
    """
    try:
        host = (parse_url(value).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        pass
    labels = host.split(".")
    if len(labels) < 2:
        return host
    if ".".join(labels[-2:]) in {"co.th", "or.th", "ac.th", "go.th", "co.uk", "com.au", "co.jp", "com.sg"}:
        return ".".join(labels[-3:])
    # Reserved .test/.example/.invalid and familiar single-label suffixes are unambiguous.
    if labels[-1] in {"test", "example", "invalid", "localhost", "com", "net", "org", "io", "dev", "app", "edu", "gov", "info", "biz", "co", "th"}:
        return ".".join(labels[-2:])
    return labels[-1]  # Over-group unfamiliar suffixes for leakage prevention.


def entropy(value: str) -> float:
    if not value:
        return 0.0
    return -sum((count / len(value)) * math.log2(count / len(value)) for count in Counter(value).values())


def extract_features(value: str) -> dict[str, float]:
    parsed = parse_url(value)
    if parsed.scheme.lower() not in {"http", "https"}:
        raise ValueError("Only HTTP and HTTPS URL features are supported")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError("URL has no hostname")
    try:
        ipaddress.ip_address(host)
        is_ip = True
    except ValueError:
        is_ip = False
    labels = host.split(".")
    registered = domain_key(value)
    subdomains = max(0, len(labels) - len(registered.split("."))) if not is_ip else 0
    lower = value.lower()
    host_words = re.split(r"[^a-z0-9]+", host)
    similarities = [SequenceMatcher(None, word, brand).ratio() for word in host_words for brand in BRANDS if len(word) >= 3]
    try:
        port_present = parsed.port is not None
    except ValueError as error:
        raise ValueError("URL contains an invalid port") from error
    return dict(zip(FEATURE_NAMES, [
        float(len(value)), float(len(host)), float(len(parsed.path)), float(value.count(".")),
        float(value.count("-")), float(sum(c.isdigit() for c in value)), float(subdomains),
        float(is_ip), float("xn--" in host), float(parsed.scheme.lower() == "https"),
        float(sum(keyword in lower for keyword in KEYWORDS)), entropy(host), entropy(value),
        float(len(parsed.query)), float("@" in value), float(len(re.findall(r"%[0-9a-fA-F]{2}", value))),
        float(port_present), float(any(brand in host for brand in BRANDS)),
        float(max(similarities, default=0.0)), float(sum(bool(part) for part in parsed.path.split("/"))),
    ]))


def feature_vector(value: str) -> list[float]:
    result = extract_features(value)
    return [result[name] for name in FEATURE_NAMES]
