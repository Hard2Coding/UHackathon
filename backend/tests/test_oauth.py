"""No third-party requests: real Google RSA verification with mocked JWKS/HTTP."""
import base64
import hashlib
import hmac
import json
import time
from datetime import timedelta
from urllib.parse import parse_qs,urlsplit
from uuid import uuid4
import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select
from backend.app import oauth,notifications
from backend.app.db import History,LineFriendship,LineSubscription,OAuthExchange,OAuthState,ProviderIdentity,Report,SessionLocal,Source,ThreatRecord,User,utcnow
from backend.app.entities import entity
from backend.app.security import token_digest

@pytest.fixture
def oauth_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID","test-google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET","fake-google-secret")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI","https://backend.example/api/auth/oauth/google/callback")
    monkeypatch.setenv("LINE_LOGIN_CHANNEL_ID","test-line-client")
    monkeypatch.setenv("LINE_LOGIN_CHANNEL_SECRET","fake-line-login-secret")
    monkeypatch.setenv("LINE_REDIRECT_URI","https://backend.example/api/auth/oauth/line/callback")
    monkeypatch.setenv("OAUTH_REDIRECT_ALLOWLIST","http://localhost:8081/,scamgraph://oauth")

@pytest.fixture(scope="module")
def signing_key():
    private=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    public=jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key(),as_dict=True)
    public.update(kid="test-key",alg="RS256")
    return private,public

def begin(client,provider="google",headers=None,intent="login",redirect="http://localhost:8081/"):
    verifier="test-client-verifier-"+uuid4().hex+uuid4().hex
    response=client.post(f"/api/auth/oauth/{provider}/start",json={"redirect_uri":redirect,"code_challenge":oauth.pkce_challenge(verifier),"intent":intent},headers=headers)
    assert response.status_code==200,response.text
    params={key:value[0] for key,value in parse_qs(urlsplit(response.json()["authorization_url"]).query).items()}
    return verifier,params

def provider_mock(monkeypatch,provider,params,signing_key,email="new-provider@example.com",overrides=None):
    private,public=signing_key
    claims={"iss":"https://accounts.google.com" if provider=="google" else "https://access.line.me","aud":"test-google-client" if provider=="google" else "test-line-client","sub":uuid4().hex if provider=="google" else "U"+uuid4().hex,"iat":int(time.time()),"exp":int(time.time())+300,"nonce":params["nonce"],"name":"Verified test user","email":email,"email_verified":True}
    claims.update(overrides or {})
    token=jwt.encode(claims,private,algorithm="RS256",headers={"kid":"test-key"})
    calls=[]
    def post(url,data):
        calls.append((url,data.copy()))
        if url.endswith("/verify"):
            assert data["nonce"]==params["nonce"]
            return claims
        assert data["code_verifier"] and oauth.pkce_challenge(data["code_verifier"])==params["code_challenge"]
        return {"id_token":token,"access_token":"not-retained"}
    monkeypatch.setattr(oauth,"http_post_json",post)
    monkeypatch.setattr(oauth,"google_keys",lambda force=False:[public])
    return claims,calls

def callback(client,provider,params):
    return client.get(f"/api/auth/oauth/{provider}/callback",params={"state":params["state"],"code":"one-use-provider-code"},follow_redirects=False)

def exchange_code(response):
    assert response.status_code==303,response.text
    return parse_qs(urlsplit(response.headers["location"]).query)["exchange_code"][0]

def test_availability_missing_credentials_and_redirect_restrictions(client,monkeypatch,oauth_env):
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET")
    status=client.get("/api/auth/providers").json()
    assert status["google"]["enabled"] is False
    assert "GOOGLE_CLIENT_SECRET" in status["google"]["missing_config"]
    assert "fake-line-login-secret" not in json.dumps(status)
    assert client.post("/api/auth/oauth/google/start",json={"redirect_uri":"http://localhost:8081/","code_challenge":"x"*43}).status_code==503
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET","fake-secret")
    assert client.post("/api/auth/oauth/google/start",json={"redirect_uri":"https://attacker.example/","code_challenge":"x"*43}).status_code==422
    assert client.post("/api/auth/oauth/google/start",json={"redirect_uri":"http://localhost:8081/","code_challenge":"short"}).status_code==422
    assert client.post("/api/auth/oauth/line/start",json={"redirect_uri":"scamgraph://oauth","code_challenge":"x"*43,"intent":"link"}).status_code==401
    monkeypatch.setenv("APP_ENV","production")
    assert client.post("/api/auth/oauth/google/start",json={"redirect_uri":"http://localhost:8081/","code_challenge":"x"*43}).status_code==422

def test_google_real_signed_token_pkce_state_and_one_use_handoff(client,oauth_env,monkeypatch,signing_key):
    verifier,params=begin(client)
    claims,calls=provider_mock(monkeypatch,"google",params,signing_key,email=uuid4().hex+"@example.com")
    assert params["code_challenge_method"]=="S256"
    response=callback(client,"google",params)
    code=exchange_code(response)
    assert "token=" not in response.headers["location"]
    assert claims["email"] not in response.headers["location"]
    assert client.post("/api/auth/oauth/exchange",json={"code":code,"code_verifier":"wrong-"+"x"*64}).status_code==400
    logged=client.post("/api/auth/oauth/exchange",json={"code":code,"code_verifier":verifier})
    assert logged.status_code==200,logged.text
    assert logged.json()["linked"] is False
    assert logged.json()["user"]["email"]==claims["email"]
    auth={"Authorization":"Bearer "+logged.json()["token"]}
    assert client.get("/api/auth/me",headers=auth).status_code==200
    assert client.get("/api/auth/identities",headers=auth).json()["providers"]==["google"]
    assert client.post("/api/auth/oauth/exchange",json={"code":code,"code_verifier":verifier}).status_code==400
    assert callback(client,"google",params).status_code==400
    with SessionLocal() as db:
        state=db.get(OAuthState,token_digest(params["state"]))
        assert state.used_at and state.provider_code_verifier=="" and state.nonce==""

@pytest.mark.parametrize("bad_claim",[{"aud":"wrong-client"},{"iss":"https://attacker.example"},{"nonce":"wrong-nonce"},{"exp":1},{"iat":4102444800},{"azp":"wrong-client"}])
def test_invalid_google_claims_cannot_create_session(client,oauth_env,monkeypatch,signing_key,bad_claim):
    _,params=begin(client)
    provider_mock(monkeypatch,"google",params,signing_key,overrides=bad_claim)
    response=callback(client,"google",params)
    assert response.status_code==303,response.text
    assert "oauth_error=provider_login_failed" in response.headers["location"]
    assert "exchange_code" not in response.headers["location"]

def test_google_invalid_signature_and_expired_state_handoff(client,oauth_env,monkeypatch,signing_key):
    _,params=begin(client)
    provider_mock(monkeypatch,"google",params,signing_key)
    foreign=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    key=jwt.algorithms.RSAAlgorithm.to_jwk(foreign.public_key(),as_dict=True);key.update(kid="test-key",alg="RS256")
    monkeypatch.setattr(oauth,"google_keys",lambda force=False:[key])
    assert "oauth_error=provider_login_failed" in callback(client,"google",params).headers["location"]
    verifier,params=begin(client)
    with SessionLocal() as db:
        row=db.get(OAuthState,token_digest(params["state"]));row.expires_at=utcnow()-timedelta(seconds=1);db.commit()
    assert callback(client,"google",params).status_code==400
    verifier,params=begin(client)
    provider_mock(monkeypatch,"google",params,signing_key,email=uuid4().hex+"@example.com")
    code=exchange_code(callback(client,"google",params))
    with SessionLocal() as db:
        row=db.get(OAuthExchange,token_digest(code));row.expires_at=utcnow()-timedelta(seconds=1);db.commit()
    assert client.post("/api/auth/oauth/exchange",json={"code":code,"code_verifier":verifier}).status_code==400

def test_existing_email_never_auto_links_and_explicit_link_no_session_switch(client,auth,oauth_env,monkeypatch,signing_key):
    original=client.get("/api/auth/me",headers=auth).json()
    _,params=begin(client)
    claims,_=provider_mock(monkeypatch,"google",params,signing_key,email=original["email"])
    denied=callback(client,"google",params)
    assert "oauth_error=account_link_required" in denied.headers["location"]
    assert client.get("/api/auth/identities",headers=auth).json()["providers"]==[]
    verifier,params=begin(client,headers=auth,intent="link")
    provider_mock(monkeypatch,"google",params,signing_key,email=original["email"],overrides={"sub":claims["sub"]})
    code=exchange_code(callback(client,"google",params))
    assert client.get("/api/auth/identities",headers=auth).json()["providers"]==[]
    assert client.post("/api/auth/oauth/exchange",json={"code":code,"code_verifier":"wrong-"+"x"*64}).status_code==400
    assert client.get("/api/auth/identities",headers=auth).json()["providers"]==[]
    linked=client.post("/api/auth/oauth/exchange",json={"code":code,"code_verifier":verifier})
    assert linked.status_code==200,linked.text
    assert linked.json()["linked"] is True and "token" not in linked.json()
    assert linked.json()["user"]["id"]==original["id"]
    assert client.get("/api/auth/me",headers=auth).status_code==200
    assert client.get("/api/auth/identities",headers=auth).json()["providers"]==["google"]

def test_line_verified_endpoint_and_unverified_email_does_not_link(client,oauth_env,monkeypatch,signing_key):
    verifier,params=begin(client,"line",redirect="scamgraph://oauth")
    _,calls=provider_mock(monkeypatch,"line",params,signing_key,overrides={"email_verified":False})
    code=exchange_code(callback(client,"line",params))
    logged=client.post("/api/auth/oauth/exchange",json={"code":code,"code_verifier":verifier}).json()
    assert logged["user"]["email_is_placeholder"] is True
    assert logged["user"]["role"]=="user"
    assert any(url=="https://api.line.me/oauth2/v2.1/verify" for url,_ in calls)
    assert client.get("/api/auth/identities",headers={"Authorization":"Bearer "+logged["token"]}).json()["providers"]==["line"]

def test_identity_cannot_be_linked_to_second_account(client,auth,oauth_env,monkeypatch,signing_key):
    verifier,params=begin(client)
    claims,_=provider_mock(monkeypatch,"google",params,signing_key,email=uuid4().hex+"@example.com")
    code=exchange_code(callback(client,"google",params))
    logged=client.post("/api/auth/oauth/exchange",json={"code":code,"code_verifier":verifier}).json()
    original_auth={"Authorization":"Bearer "+logged["token"]}
    _,params=begin(client,headers=auth,intent="link")
    provider_mock(monkeypatch,"google",params,signing_key,overrides={"sub":claims["sub"]})
    blocked=callback(client,"google",params)
    assert "oauth_error=provider_already_linked" in blocked.headers["location"]
    assert client.get("/api/auth/identities",headers=auth).json()["providers"]==[]
    assert client.get("/api/auth/identities",headers=original_auth).json()["providers"]==["google"]

def test_provider_timeout_and_denial_honest_fallback(client,oauth_env,monkeypatch):
    _,params=begin(client)
    def timeout(*args,**kwargs): raise httpx.ReadTimeout("No provider response")
    monkeypatch.setattr(oauth,"exchange_provider",timeout)
    assert "oauth_error=provider_timeout" in callback(client,"google",params).headers["location"]
    _,params=begin(client)
    response=client.get("/api/auth/oauth/google/callback",params={"state":params["state"],"error":"access_denied"},follow_redirects=False)
    assert "oauth_error=provider_denied" in response.headers["location"]

def linked_line(client,auth):
    user=client.get("/api/auth/me",headers=auth).json()
    subject="U"+uuid4().hex
    with SessionLocal() as db:
        db.add(ProviderIdentity(id=str(uuid4()),user_id=user["id"],provider="line",subject=subject,email_verified=False));db.commit()
    return user,subject

def messaging_env(monkeypatch):
    monkeypatch.setenv("LINE_CHANNEL_SECRET","mock-webhook-secret")
    monkeypatch.setenv("LINE_CHANNEL_ACCESS_TOKEN","mock-token-never-logged")
    monkeypatch.setenv("LINE_MESSAGING_SAME_PROVIDER","true")

def follow_webhook(client,subject,event="follow",eid=None,timestamp=None):
    body=json.dumps({"events":[{"type":event,"webhookEventId":eid or uuid4().hex,"timestamp":timestamp or int(time.time()*1000),"source":{"type":"user","userId":subject}}]},separators=(",",":")).encode()
    signature=base64.b64encode(hmac.new(b"mock-webhook-secret",body,hashlib.sha256).digest()).decode()
    return client.post("/api/notifications/line/webhook",content=body,headers={"Content-Type":"application/json","x-line-signature":signature})

def test_line_signed_follow_consent_masked_send_idempotency_and_unfollow(client,auth,monkeypatch):
    messaging_env(monkeypatch);user,subject=linked_line(client,auth)
    assert client.get("/api/notifications/line",headers=auth).json()["friendship_status"]=="awaiting_webhook"
    assert client.put("/api/notifications/line",json={"enabled":True},headers=auth).status_code==409
    assert client.post("/api/notifications/line/webhook",content=b'{"events":[]}',headers={"x-line-signature":"invalid"}).status_code==401
    assert follow_webhook(client,subject).status_code==200
    enabled=client.put("/api/notifications/line",json={"enabled":True},headers=auth)
    assert enabled.status_code==200 and enabled.json()["can_enable"] is True
    posted=[];original_post=httpx.Client.post
    def mock_post(self,url,*args,**kwargs):
        if str(url)!="https://api.line.me/v2/bot/message/push": return original_post(self,url,*args,**kwargs)
        posted.append(kwargs);return httpx.Response(200,json={})
    monkeypatch.setattr(httpx.Client,"post",mock_post)
    row=client.post("/api/history",json={"text":"Send OTP 0900000000 to wallet ABCSECRET123 now"},headers=auth).json()
    response=client.post("/api/notifications/line/send",json={"history_id":row["id"]},headers=auth)
    assert response.status_code==200 and response.json()["status"]=="sent",response.text
    assert posted and posted[0]["json"]["to"]==subject
    message=posted[0]["json"]["messages"][0]["text"]
    assert "0900000000" not in message and "ABCSECRET123" not in message and "OTP" not in message
    assert "sample data" in message and "not fraud probability" in message
    assert client.post("/api/notifications/line/send",json={"history_id":row["id"]},headers=auth).json()["status"]=="sent"
    assert len(posted)==1
    assert follow_webhook(client,subject,"unfollow",timestamp=int(time.time()*1000)+1000).status_code==200
    assert client.get("/api/notifications/line",headers=auth).json()["enabled"] is False
    assert client.post("/api/notifications/line/send",json={"history_id":row["id"]},headers=auth).json()["status"]=="consent_required"

def test_webhook_replay_order_and_notification_timeout(client,auth,monkeypatch):
    messaging_env(monkeypatch);_,subject=linked_line(client,auth)
    now=int(time.time()*1000);eid=uuid4().hex
    assert follow_webhook(client,subject,eid=eid,timestamp=now).json()["processed"]==1
    assert follow_webhook(client,subject,eid=eid,timestamp=now).json()["processed"]==0
    client.put("/api/notifications/line",json={"enabled":True},headers=auth)
    original_post=httpx.Client.post
    def timeout(self,url,*args,**kwargs):
        if str(url)!="https://api.line.me/v2/bot/message/push": return original_post(self,url,*args,**kwargs)
        raise httpx.ReadTimeout("Provider did not answer")
    monkeypatch.setattr(httpx.Client,"post",timeout)
    row=client.post("/api/history",json={"text":"Meeting tomorrow at ten"},headers=auth).json()
    result=client.post("/api/notifications/line/send",json={"history_id":row["id"]},headers=auth).json()
    assert result["status"]=="timeout" and result["masked"] is True
    assert follow_webhook(client,subject,"unfollow",timestamp=now+1000).status_code==200
    assert follow_webhook(client,subject,"follow",timestamp=now-1000).status_code==200
    assert client.get("/api/notifications/line",headers=auth).json()["friendship_status"]=="not_following"

def test_caller_directory_excludes_samples_pending_unconfirmed_expired(client):
    with SessionLocal() as db:
        real=Source(id=str(uuid4()),name="Unit tests only — fictional record",is_sample=False)
        sample=Source(id=str(uuid4()),name="Sample source",is_sample=True)
        db.add_all([real,sample]);db.flush()
        for source,phone,status,date in ((real,"0900000000","confirmed",utcnow()),(real,"0900000001","reported",utcnow()),(sample,"0900000002","confirmed",utcnow()),(real,"0900000003","confirmed",utcnow()-timedelta(days=100))):
            db.add(ThreatRecord(id=str(uuid4()),source_id=source.id,entity_type="phone",value=phone,status=status,evidence="Fictional test fixture, not an actual threat",related_entities=[],retrieved_at=date))
        user_id=db.scalar(select(User.id))
        for status,phone in (("pending","0900000004"),("verified","0900000005"),("rejected","0900000006")):
            db.add(Report(id=str(uuid4()),user_id=user_id,text="Fictional test report",detail="Unit test only",evidence=[],entities=[entity("phone",phone)],dedup_hash=uuid4().hex,status=status,reviewed_at=utcnow() if status=="verified" else None))
        db.commit()
    response=client.get("/api/caller-id/directory")
    assert response.status_code==200,response.text
    result=response.json();phones={e["phone"] for e in result["entries"]}
    assert "+66900000000" in phones and "+66900000005" in phones
    assert not phones.intersection({"+66900000001","+66900000002","+66900000003","+66900000004","+66900000006"})
    assert all(e["is_sample"] is False and e["provenance"] for e in result["entries"])
    assert "not a scam verdict" in result["note"]
