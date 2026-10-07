"""Server-side OIDC. Provider and app handoffs each have independent PKCE."""
import base64
import hashlib
import hmac
import os
import math
import re
import secrets
import time
from datetime import timedelta
from urllib.parse import urlencode,urlsplit,urlunsplit,parse_qsl
from uuid import uuid4
import httpx
from fastapi import APIRouter,Depends,HTTPException,Request,Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel,Field
from sqlalchemy import delete,select,update
from sqlalchemy.exc import IntegrityError
from .db import OAuthState,OAuthExchange,ProviderIdentity,User,get_db,utcnow,utc_datetime,utc_isoformat
from .security import client_limit,current_user,issue_token,optional_user,token_digest,user_dict
from .schemas import UserResponse

router=APIRouter(prefix="/api/auth",tags=["OIDC authentication"])
PROVIDERS={"google":{"authorize":"https://accounts.google.com/o/oauth2/v2/auth","token":"https://oauth2.googleapis.com/token","env":("GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REDIRECT_URI"),"scope":"openid email profile"},"line":{"authorize":"https://access.line.me/oauth2/v2.1/authorize","token":"https://api.line.me/oauth2/v2.1/token","env":("LINE_LOGIN_CHANNEL_ID","LINE_LOGIN_CHANNEL_SECRET","LINE_REDIRECT_URI"),"scope":"openid profile"}}

def aware(value):
    return utc_datetime(value)

def timeout_seconds():
    try: return min(15,max(1,float(os.getenv("OAUTH_HTTP_TIMEOUT_SECONDS","5"))))
    except ValueError: return 5

def pkce_challenge(verifier):
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")

def allowed_redirects():
    return {uri.strip() for uri in os.getenv("OAUTH_REDIRECT_ALLOWLIST","http://localhost:8081/,scamgraph://oauth").split(",") if uri.strip()}

def validate_app_redirect(uri):
    try:
        parsed=urlsplit(uri)
        valid_scheme=parsed.scheme=="https" or parsed.scheme=="scamgraph" or (os.getenv("APP_ENV","development")!="production" and parsed.scheme=="http" and parsed.hostname in ("localhost","127.0.0.1","::1"))
        if uri not in allowed_redirects() or not valid_scheme or not parsed.netloc or parsed.username or parsed.password or parsed.fragment or parsed.query: raise ValueError()
    except ValueError: raise HTTPException(422,"App redirect URI is not an exact allowed callback")

def provider_config(provider):
    if provider not in PROVIDERS: raise HTTPException(404,"Unsupported login provider")
    entry=PROVIDERS[provider];names=entry["env"]
    values=[os.getenv(name,"").strip() for name in names]
    missing=[name for name,value in zip(names,values) if not value]
    valid_redirect=False
    if values[2]:
        try:
            parsed=urlsplit(values[2])
            valid_redirect=(parsed.scheme=="https" or (os.getenv("APP_ENV","development")!="production" and parsed.scheme=="http" and parsed.hostname in ("localhost","127.0.0.1","::1"))) and bool(parsed.hostname) and not parsed.username and not parsed.query and not parsed.fragment and parsed.path.endswith(f"/api/auth/oauth/{provider}/callback")
        except ValueError: pass
    return {**entry,"client_id":values[0],"client_secret":values[1],"redirect_uri":values[2],"enabled":not missing and valid_redirect,"status":"configured" if not missing and valid_redirect else "not_configured" if missing else "invalid_callback_configuration","missing_config":missing}

@router.get("/providers",response_model=dict)
def availability():
    from .notifications import messaging_config
    output={provider:{key:provider_config(provider)[key] for key in ("enabled","status","missing_config")} for provider in PROVIDERS}
    output["line_messaging"]=messaging_config(public=True)
    return output

class OAuthStart(BaseModel):
    redirect_uri:str=Field(min_length=1,max_length=2000)
    code_challenge:str=Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    intent:str=Field(default="login",pattern=r"^(login|link)$")

class OAuthStartResponse(BaseModel):
    authorization_url:str
    expires_in:int
    provider:str

@router.post("/oauth/{provider}/start",response_model=OAuthStartResponse)
def start(provider:str,body:OAuthStart,request:Request,user=Depends(optional_user),db=Depends(get_db)):
    client_limit(request,"oauth",10)
    cfg=provider_config(provider)
    if not cfg["enabled"]: raise HTTPException(503,"Login provider is not configured")
    validate_app_redirect(body.redirect_uri)
    if body.intent=="link" and not user: raise HTTPException(401,"Sign in before explicitly linking a provider")
    state=secrets.token_urlsafe(32);nonce=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48)
    # Expired flow secrets and handoff codes are pruned without storing tokens.
    db.execute(delete(OAuthState).where(OAuthState.expires_at<utcnow()))
    db.execute(delete(OAuthExchange).where(OAuthExchange.expires_at<utcnow()))
    db.add(OAuthState(state_hash=token_digest(state),provider=provider,client_id=cfg["client_id"],app_redirect_uri=body.redirect_uri,provider_redirect_uri=cfg["redirect_uri"],client_code_challenge=body.code_challenge,provider_code_verifier=verifier,nonce=nonce,intent=body.intent,user_id=user.id if body.intent=="link" else None,expires_at=utcnow()+timedelta(minutes=10)))
    db.commit()
    params={"response_type":"code","client_id":cfg["client_id"],"redirect_uri":cfg["redirect_uri"],"scope":cfg["scope"],"state":state,"nonce":nonce,"code_challenge":pkce_challenge(verifier),"code_challenge_method":"S256"}
    if provider=="google": params["prompt"]="select_account"
    return {"authorization_url":cfg["authorize"]+"?"+urlencode(params),"expires_in":600,"provider":provider}

def http_post_json(url,data):
    with httpx.Client(timeout=timeout_seconds(),follow_redirects=False) as client:
        response=client.post(url,data=data)
        response.raise_for_status()
        value=response.json()
        if not isinstance(value,dict): raise ValueError("Invalid provider response")
        return value

_google_keys={"expires":0,"keys":[]}
def google_keys(force=False):
    if not force and _google_keys["expires"]>time.monotonic(): return _google_keys["keys"]
    with httpx.Client(timeout=timeout_seconds(),follow_redirects=False) as client:
        response=client.get("https://www.googleapis.com/oauth2/v3/certs")
        response.raise_for_status();keys=response.json()["keys"]
    if not isinstance(keys,list) or not keys: raise ValueError("Invalid Google key set")
    _google_keys.update(expires=time.monotonic()+3600,keys=keys)
    return keys

def verify_claims(claims,provider,client_id,nonce):
    issuers=("https://accounts.google.com","accounts.google.com") if provider=="google" else ("https://access.line.me",)
    now=time.time()
    if not isinstance(claims,dict) or claims.get("iss") not in issuers or claims.get("aud")!=client_id: raise ValueError("Invalid token issuer/audience")
    if claims.get("azp") is not None and claims["azp"]!=client_id: raise ValueError("Invalid authorized party")
    if not isinstance(claims.get("exp"),(int,float)) or isinstance(claims.get("exp"),bool) or not math.isfinite(claims["exp"]) or claims["exp"]<=now: raise ValueError("Expired token")
    if not isinstance(claims.get("iat"),(int,float)) or isinstance(claims.get("iat"),bool) or not math.isfinite(claims["iat"]) or claims["iat"]>now+30: raise ValueError("Invalid token issue time")
    subject=claims.get("sub")
    if not isinstance(subject,str) or not 1<=len(subject)<=255: raise ValueError("Missing token subject")
    if provider=="line" and not re.fullmatch(r"U[0-9a-f]{32}",subject): raise ValueError("Invalid LINE user ID")
    if not isinstance(claims.get("nonce"),str) or not hmac.compare_digest(claims["nonce"],nonce): raise ValueError("Invalid token nonce")
    return claims

def verify_google(id_token,client_id,nonce):
    import jwt
    header=jwt.get_unverified_header(id_token)
    if header.get("alg")!="RS256" or not isinstance(header.get("kid"),str): raise ValueError("Unsupported Google token signature")
    selected=None
    for force in (False,True):
        selected=next((key for key in google_keys(force) if key.get("kid")==header["kid"] and key.get("kty")=="RSA" and key.get("alg","RS256")=="RS256" and key.get("use","sig")=="sig"),None)
        if selected: break
    if not selected: raise ValueError("Unknown Google signing key")
    key=jwt.PyJWK.from_dict(selected).key
    claims=jwt.decode(id_token,key,algorithms=["RS256"],audience=client_id,issuer=["https://accounts.google.com","accounts.google.com"],options={"require":["iss","aud","sub","exp","iat","nonce"]},leeway=30)
    return verify_claims(claims,"google",client_id,nonce)

def exchange_provider(provider,code,cfg,verifier,nonce):
    tokens=http_post_json(cfg["token"],{"grant_type":"authorization_code","code":code,"redirect_uri":cfg["redirect_uri"],"client_id":cfg["client_id"],"client_secret":cfg["client_secret"],"code_verifier":verifier})
    id_token=tokens.get("id_token")
    if not isinstance(id_token,str) or not 1<=len(id_token)<=16000: raise ValueError("Missing ID token")
    if provider=="google": return verify_google(id_token,cfg["client_id"],nonce)
    verified=http_post_json("https://api.line.me/oauth2/v2.1/verify",{"id_token":id_token,"client_id":cfg["client_id"],"nonce":nonce})
    return verify_claims(verified,provider,cfg["client_id"],nonce)

def provider_user(db,provider,claims,intent,user_id,create_identity=True):
    identity=db.scalar(select(ProviderIdentity).where(ProviderIdentity.provider==provider,ProviderIdentity.subject==claims["sub"]))
    if intent=="link":
        user=db.get(User,user_id)
        if not user: raise HTTPException(401,"Original account no longer exists")
        if identity and identity.user_id!=user.id: raise HTTPException(409,"provider_already_linked")
        existing=db.scalar(select(ProviderIdentity).where(ProviderIdentity.user_id==user.id,ProviderIdentity.provider==provider))
        if existing and existing.subject!=claims["sub"]: raise HTTPException(409,"account_already_has_provider")
    elif identity:
        return db.get(User,identity.user_id)
    else:
        # Provider identity is the durable key, never a merely claimed email.
        verified_email=claims.get("email") if provider=="google" and claims.get("email_verified") is True else None
        if verified_email:
            from pydantic import TypeAdapter,EmailStr
            try: verified_email=str(TypeAdapter(EmailStr).validate_python(verified_email)).lower()
            except ValueError: verified_email=None
        if verified_email and db.scalar(select(User).where(User.email==verified_email)): raise HTTPException(409,"account_link_required")
        email=verified_email or f"oauth-{provider}-{hashlib.sha256(claims['sub'].encode()).hexdigest()[:32]}@identity.scamgraph.invalid"
        user=User(id=str(uuid4()),email=email,name=str(claims.get("name") or f"{provider.title()} user")[:100],password_hash="!oauth-only:"+secrets.token_hex(32),role="user")
        db.add(user);db.flush()
    if not identity and create_identity:
        db.add(ProviderIdentity(id=str(uuid4()),user_id=user.id,provider=provider,subject=claims["sub"],email_verified=provider=="google" and claims.get("email_verified") is True))
        db.flush()
    return user

def app_redirect(uri,params):
    validate_app_redirect(uri)
    parsed=urlsplit(uri)
    return RedirectResponse(urlunsplit((parsed.scheme,parsed.netloc,parsed.path,urlencode(params),"")),status_code=303,headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"})

@router.get("/oauth/{provider}/callback")
def callback(provider:str,request:Request,state:str=Query(default="",max_length=200),code:str|None=Query(default=None,max_length=4000),error:str|None=Query(default=None,max_length=200),db=Depends(get_db)):
    client_limit(request,"oauth-callback",20)
    if provider not in PROVIDERS or len(state)>200 or (code and len(code)>4000): raise HTTPException(400,"Invalid OAuth callback")
    row=db.get(OAuthState,token_digest(state))
    if not row or row.provider!=provider or row.used_at is not None or aware(row.expires_at)<=utcnow(): raise HTTPException(400,"Invalid or expired OAuth state")
    validate_app_redirect(row.app_redirect_uri)
    redirect_uri=row.app_redirect_uri;verifier=row.provider_code_verifier;nonce=row.nonce;client_challenge=row.client_code_challenge;intent=row.intent;user_id=row.user_id
    claimed=db.execute(update(OAuthState).where(OAuthState.state_hash==row.state_hash,OAuthState.used_at.is_(None),OAuthState.expires_at>utcnow()).values(used_at=utcnow(),provider_code_verifier="",nonce="").execution_options(synchronize_session=False))
    if claimed.rowcount!=1: raise HTTPException(400,"OAuth state has already been used")
    db.commit()
    if error or not code: return app_redirect(redirect_uri,{"oauth_error":"provider_denied"})
    try:
        cfg=provider_config(provider)
        if not cfg["enabled"] or cfg["client_id"]!=row.client_id or cfg["redirect_uri"]!=row.provider_redirect_uri: raise HTTPException(503,"provider_not_configured")
        claims=exchange_provider(provider,code,cfg,verifier,nonce)
        user=provider_user(db,provider,claims,intent,user_id,create_identity=intent!="link")
        exchange_code=secrets.token_urlsafe(32)
        db.add(OAuthExchange(code_hash=token_digest(exchange_code),user_id=user.id,client_code_challenge=client_challenge,provider=provider,intent=intent,provider_subject=claims["sub"],email_verified=provider=="google" and claims.get("email_verified") is True,expires_at=utcnow()+timedelta(seconds=60)))
        db.commit()
        return app_redirect(redirect_uri,{"exchange_code":exchange_code})
    except httpx.TimeoutException:
        db.rollback();return app_redirect(redirect_uri,{"oauth_error":"provider_timeout"})
    except HTTPException as exc:
        db.rollback();allowed_errors={"account_link_required","provider_already_linked","account_already_has_provider","provider_not_configured"}
        return app_redirect(redirect_uri,{"oauth_error":exc.detail if exc.detail in allowed_errors else "provider_login_failed"})
    except Exception:
        db.rollback();return app_redirect(redirect_uri,{"oauth_error":"provider_login_failed"})

class OAuthExchangeRequest(BaseModel):
    code:str=Field(min_length=30,max_length=200)
    code_verifier:str=Field(pattern=r"^[A-Za-z0-9._~-]{43,128}$")

class OAuthExchangeResponse(BaseModel):
    token:str|None=None
    user:UserResponse
    linked:bool=False
    provider:str

@router.post("/oauth/exchange",response_model=OAuthExchangeResponse,response_model_exclude_none=True)
def redeem(body:OAuthExchangeRequest,request:Request,db=Depends(get_db)):
    client_limit(request,"oauth-exchange",10)
    row=db.get(OAuthExchange,token_digest(body.code))
    if not row or row.used_at is not None or aware(row.expires_at)<=utcnow() or not hmac.compare_digest(pkce_challenge(body.code_verifier),row.client_code_challenge): raise HTTPException(400,"Invalid or expired OAuth handoff")
    claimed=db.execute(update(OAuthExchange).where(OAuthExchange.code_hash==row.code_hash,OAuthExchange.used_at.is_(None),OAuthExchange.expires_at>utcnow()).values(used_at=utcnow()).execution_options(synchronize_session=False))
    if claimed.rowcount!=1: raise HTTPException(400,"OAuth handoff has already been used")
    user=db.get(User,row.user_id)
    if not user: raise HTTPException(400,"Original account no longer exists")
    if row.intent=="link":
        # The client must prove ownership of its original verifier before any
        # linked-identity mutation, even after a verified provider callback.
        try: user=provider_user(db,row.provider,{"sub":row.provider_subject,"email_verified":row.email_verified},"link",row.user_id)
        except IntegrityError:
            db.rollback();raise HTTPException(409,"Provider linking changed; restart the explicit link flow")
        db.commit();return {"linked":True,"user":user_dict(user),"provider":row.provider}
    return {"token":issue_token(db,user),"user":user_dict(user),"linked":False,"provider":row.provider}

@router.get("/identities",response_model=dict)
def identities(user=Depends(current_user),db=Depends(get_db)):
    rows=db.scalars(select(ProviderIdentity).where(ProviderIdentity.user_id==user.id)).all()
    return {"providers":[row.provider for row in rows],"items":[{"provider":row.provider,"email_verified":row.email_verified,"created_at":utc_isoformat(row.created_at)} for row in rows]}
