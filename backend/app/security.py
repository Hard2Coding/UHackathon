import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta, timezone
from uuid import uuid4
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from .db import SessionToken, User, get_db, utcnow, utc_isoformat

auth_scheme = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000).hex()
    return f"pbkdf2_sha256$260000${salt}${digest}"

def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt, digest = stored.split("$")
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds)).hex()
        return hmac.compare_digest(actual, digest)
    except ValueError:
        return False

def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def issue_token(db, user):
    token = secrets.token_urlsafe(40)
    db.add(SessionToken(token_hash=token_digest(token), user_id=user.id, expires_at=utcnow() + timedelta(days=7)))
    db.commit()
    return token

def optional_user(credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme), db=Depends(get_db)):
    if not credentials: return None
    session = db.get(SessionToken, token_digest(credentials.credentials))
    expiry=(session.expires_at.replace(tzinfo=timezone.utc) if session and session.expires_at.tzinfo is None else session.expires_at.astimezone(timezone.utc) if session else None)
    if not session or expiry <= utcnow():
        raise HTTPException(401, "Session expired or invalid")
    user = db.get(User, session.user_id)
    if not user: raise HTTPException(401, "Session expired or invalid")
    return user

def current_user(user=Depends(optional_user)):
    if user is None: raise HTTPException(401, "Please sign in")
    return user

def admin_user(user=Depends(current_user)):
    if user.role != "admin": raise HTTPException(403, "Administrator access required")
    return user

class RateLimiter:
    """Per-process request limits; reports also have durable per-user limits in DB."""
    def __init__(self): self.hits = defaultdict(deque)
    def check(self, key: str, limit: int = 30, window: int = 60):
        now = time.monotonic()
        queue = self.hits[key]
        while queue and queue[0] < now-window: queue.popleft()
        if len(queue) >= limit: raise HTTPException(429, "Too many requests; please retry later", headers={"Retry-After": str(window)})
        queue.append(now)
        if len(self.hits) > 10000:
            self.hits = defaultdict(deque, {k:v for k,v in self.hits.items() if v and v[-1] > now-window})

limiter = RateLimiter()

def client_limit(request: Request, category="analysis", limit=30):
    # IP is used transiently, never logged or persisted; forwarded headers are ignored.
    limiter.check(f"{category}:{request.client.host if request.client else 'local'}", limit)

def user_dict(user):
    return {"id": user.id, "email": user.email, "email_is_placeholder":user.email.endswith("@identity.scamgraph.invalid"), "name": user.name, "role": user.role, "created_at": utc_isoformat(user.created_at)}
