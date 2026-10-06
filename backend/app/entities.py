import hashlib
import ipaddress
import re
from urllib.parse import urlsplit
from fastapi import HTTPException

URL_RE = re.compile(r"https?://[^\s<>\"']+|\b(?:[a-zA-Z0-9][a-zA-Z0-9-]*\.)+(?:com|net|org|io|co|th|example|test|invalid)(?:/[^\s<>\"']*)?", re.I)
PHONE_RE = re.compile(r"(?<!\d)(?:\+66[ -]?[689]\d(?:[ -]?\d){7}|0[689]\d(?:[ -]?\d){7}|\+66[ -]?[2-7](?:[ -]?\d){7}|0[2-7](?:[ -]?\d){7}|\+\d(?:[ -]?\d){7,14})(?!\d)")
ACCOUNT_RE = re.compile(r"(?:บัญชี|account|พร้อมเพย์|promptpay)\s*[:#]?\s*([0-9][0-9 -]{7,20}[0-9])", re.I)
WALLET_RE = re.compile(r"(?:wallet|วอลเล็ต)\s*[:#]?\s*([A-Za-z0-9_-]{5,80})|\b(0x[a-fA-F0-9]{40})\b", re.I)
LINE_RE = re.compile(r"(?:line|ไลน์)\s*(?:id|ไอดี)?\s*[:=@]?\s*([a-zA-Z0-9_.-]{3,40})", re.I)

def normalize(kind, value):
    value = value.strip().rstrip(".,;!?)ๆ")
    if kind in ("phone", "account"):
        value = re.sub(r"[\s-]", "", value)
        if kind == "phone" and value.startswith("+66"): value = "0" + value[3:]
    if kind in ("domain", "url"):
        parsed = urlsplit(value if "://" in value else "https://" + value)
        host = (parsed.hostname or "").lower().rstrip(".")
        if kind == "domain": return host
        display_host="["+host+"]" if ":" in host else host
        # Fragment omitted because it does not identify a remote resource.
        return f"{parsed.scheme.lower()}://{display_host}{':' + str(parsed.port) if parsed.port else ''}{parsed.path or '/'}{'?' + parsed.query if parsed.query else ''}"
    return value.lower() if kind in ("line", "wallet") else value

def mask_value(value, kind=None):
    if kind == "domain": return value
    if kind == "organization": return value
    if kind == "url":
        parsed = urlsplit(value)
        return f"{parsed.scheme}://{parsed.hostname}/…"
    if len(value) <= 4: return "••••"
    return value[:2] + "•" * min(8, len(value)-4) + value[-2:]

def entity(kind, value):
    normalized = normalize(kind, value)
    return {"id": hashlib.sha256(f"{kind}:{normalized}".encode()).hexdigest()[:20], "type": kind, "value": normalized, "masked_value": mask_value(normalized, kind)}

def extract_entities(text, kind="text"):
    entities = {}
    def add(k,v):
        try:
            item = entity(k,v)
            if item["value"]: entities[item["id"]] = item
        except (ValueError, UnicodeError): pass
    if kind == "url": add("url", text); add("domain", text)
    elif kind in ("phone", "account", "wallet"): add(kind, text)
    for value in URL_RE.findall(text): add("url", value); add("domain", value)
    for value in PHONE_RE.findall(text): add("phone", value)
    for value in ACCOUNT_RE.findall(text): add("account", value)
    for values in WALLET_RE.findall(text): add("wallet", next(v for v in values if v))
    for value in LINE_RE.findall(text):
        if value.lower() not in ("id", "is", "and", "the"): add("line", value)
    for organization in ("ธนาคาร", "ไปรษณีย์ไทย", "กรมสรรพากร", "SCB", "KBank", "PayPal", "Microsoft", "Apple"):
        if re.search(re.escape(organization), text, re.I): add("organization", organization)
    return list(entities.values())

def validate_input(text, kind):
    if kind == "url":
        try:
            parsed = urlsplit(text if "://" in text else "https://"+text)
            if parsed.scheme not in ("http", "https") or not parsed.hostname or " " in parsed.hostname or parsed.username:
                raise ValueError()
            _ = parsed.port
            if "." not in parsed.hostname:
                ipaddress.ip_address(parsed.hostname)
        except ValueError: raise HTTPException(422, "URL must have a valid http/https host")
    if kind == "phone" and not re.fullmatch(r"(?:\+?\d[\d -]{6,18}\d)", text):
        raise HTTPException(422, "Invalid phone format")
    if kind == "account" and not re.fullmatch(r"\d[\d -]{6,22}\d", text):
        raise HTTPException(422, "Invalid account or PromptPay format")
    if kind == "wallet" and not re.fullmatch(r"[A-Za-z0-9_.:@+-]{5,100}", text):
        raise HTTPException(422, "Invalid wallet identifier")

def redact_text(text):
    text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[email masked]", text)
    text = re.sub(r"\b\d(?:[ -]?\d){6,}\b", "[number masked]", text)
    text = re.sub(r"(?:line|ไลน์)\s*(?:id)?\s*[:=@]?\s*[a-zA-Z0-9_.-]{3,40}", "[LINE ID masked]", text, flags=re.I)
    text = WALLET_RE.sub("[wallet masked]", text)
    text = URL_RE.sub(lambda m: mask_value(normalize("url",m.group()), "url"), text)
    return text
