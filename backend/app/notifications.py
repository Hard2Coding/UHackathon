"""Opt-in LINE Messaging API. There is no LINE Notify integration or fake send."""
import base64
import hashlib
import hmac
import json
import os
import re
from datetime import datetime,timedelta,timezone
from urllib.parse import quote
from uuid import uuid4
import httpx
from fastapi import APIRouter,Depends,HTTPException,Request
from pydantic import BaseModel
from sqlalchemy import delete,func,select
from sqlalchemy.exc import IntegrityError
from .db import History,LineDelivery,LineFriendship,LineSubscription,ProviderIdentity,SessionLocal,WebhookReceipt,get_db,utcnow,utc_isoformat
from .oauth import aware,timeout_seconds
from .security import client_limit,current_user

router=APIRouter(prefix="/api/notifications/line",tags=["LINE Messaging API"])
LINE_USER_PATTERN=re.compile(r"U[0-9a-f]{32}")

def messaging_config(public=False):
    names=("LINE_CHANNEL_ACCESS_TOKEN","LINE_CHANNEL_SECRET")
    missing=[name for name in names if not os.getenv(name,"").strip()]
    if os.getenv("LINE_MESSAGING_SAME_PROVIDER","false").lower()!="true": missing.append("LINE_MESSAGING_SAME_PROVIDER=true")
    official_id=os.getenv("LINE_OFFICIAL_ACCOUNT_ID","").strip()
    official_url="https://line.me/R/ti/p/"+quote(official_id,safe="") if official_id and re.fullmatch(r"@[A-Za-z0-9_.-]{1,100}",official_id) else None
    result={"configured":not missing,"status":"configured" if not missing else "not_configured","missing_config":missing,"official_account_url":official_url}
    if not public: result.update(token=os.getenv("LINE_CHANNEL_ACCESS_TOKEN",""),secret=os.getenv("LINE_CHANNEL_SECRET",""))
    return result

class LineSettings(BaseModel):
    enabled:bool

class LineSettingsResponse(BaseModel):
    configured:bool
    linked:bool
    enabled:bool
    friendship_status:str
    can_enable:bool
    official_account_url:str|None
    last_delivery_status:str|None
    last_attempt_at:str|None
    consent_scope:str="saved_high_risk_results"
    message:str

def settings(db,user):
    cfg=messaging_config(public=True)
    identity=db.scalar(select(ProviderIdentity).where(ProviderIdentity.user_id==user.id,ProviderIdentity.provider=="line"))
    subscription=db.get(LineSubscription,user.id)
    proof=db.get(LineFriendship,identity.subject) if identity else None
    status="not_linked" if not identity else "awaiting_webhook" if not proof else "verified" if proof.following else "not_following"
    can_enable=cfg["configured"] and bool(identity) and status=="verified"
    delivery=db.scalar(select(LineDelivery).where(LineDelivery.user_id==user.id).order_by(LineDelivery.updated_at.desc()))
    return {"configured":cfg["configured"],"linked":bool(identity),"enabled":bool(subscription and subscription.enabled),"friendship_status":status,"can_enable":can_enable,"official_account_url":cfg["official_account_url"],"last_delivery_status":delivery.status if delivery else None,"last_attempt_at":utc_isoformat(delivery.updated_at) if delivery else None,"consent_scope":"saved_high_risk_results","message":"Only saved HIGH-risk results are sent after explicit consent. Messages contain score/level/time, no original input or personal identifiers." if can_enable else "LINE messaging needs configured credentials, explicit account linking and a signed follow webhook. Nothing has been sent."}

@router.get("",response_model=LineSettingsResponse)
def get_settings(user=Depends(current_user),db=Depends(get_db)): return settings(db,user)

@router.put("",response_model=LineSettingsResponse)
def set_settings(body:LineSettings,user=Depends(current_user),db=Depends(get_db)):
    state=settings(db,user)
    if body.enabled and not state["can_enable"]: raise HTTPException(409,"Link LINE and add the configured Official Account; a signed follow webhook must verify the same user first")
    row=db.get(LineSubscription,user.id)
    if not row: row=LineSubscription(user_id=user.id,enabled=False);db.add(row)
    row.enabled=body.enabled
    row.consented_at=utcnow() if body.enabled else None
    db.commit();return settings(db,user)

class LineSendRequest(BaseModel):
    history_id:str

class LineSendResponse(BaseModel):
    status:str
    masked:bool=True
    message:str

def notification_result(status):
    messages={"sent":"LINE accepted the masked message for delivery.","timeout":"LINE timed out. Result remains available in the app; retry uses the same idempotency key.","unavailable":"LINE could not accept the message; result remains available in the app.","not_configured":"LINE Messaging API is not configured; no message was sent.","consent_required":"Enable notifications explicitly before sending.","unlinked":"Link your own LINE identity first.","not_following":"Add the Official Account and wait for its signed follow webhook.","deleted":"Saved result or account no longer exists.","rate_limited":"Daily delivery limit reached; result remains available in the app."}
    return {"status":status,"masked":True,"message":messages.get(status,"Message status recorded")}

def send_saved_history(user_id,history_id):
    with SessionLocal() as db:
        cfg=messaging_config()
        if not cfg["configured"]: return notification_result("not_configured")
        history=db.scalar(select(History).where(History.id==history_id,History.user_id==user_id))
        if not history: return notification_result("deleted")
        consent=db.get(LineSubscription,user_id)
        if not consent or not consent.enabled or consent.consented_at is None: return notification_result("consent_required")
        identity=db.scalar(select(ProviderIdentity).where(ProviderIdentity.user_id==user_id,ProviderIdentity.provider=="line"))
        if not identity or not LINE_USER_PATTERN.fullmatch(identity.subject): return notification_result("unlinked")
        friendship=db.get(LineFriendship,identity.subject)
        if not friendship or not friendship.following: return notification_result("not_following")
        delivery=db.scalar(select(LineDelivery).where(LineDelivery.user_id==user_id,LineDelivery.history_id==history_id))
        if delivery and delivery.status=="sent": return notification_result("sent")
        if not delivery:
            count=db.scalar(select(func.count()).select_from(LineDelivery).where(LineDelivery.user_id==user_id,LineDelivery.created_at>=utcnow()-timedelta(days=1)))
            if count>=20: return notification_result("rate_limited")
            delivery=LineDelivery(id=str(uuid4()),user_id=user_id,history_id=history_id,status="queued")
            db.add(delivery)
            try: db.commit()
            except IntegrityError:
                db.rollback();delivery=db.scalar(select(LineDelivery).where(LineDelivery.user_id==user_id,LineDelivery.history_id==history_id))
        result=history.result
        # Deliberately omit text, entities, URLs, model feature tokens, reports and
        # provider-generated prose. The destination comes only from verified OIDC.
        score=result.get("score")
        safe_level=result.get("level") if result.get("level") in ("HIGH","MEDIUM","LOW","INSUFFICIENT DATA") else "INSUFFICIENT DATA"
        model_note="Experimental model trained on sample data." if result.get("model",{}).get("dataset_is_sample") else "Review model limitations in the app."
        history_note={"confirmed_source":"Source-confirmed history matched.","reported":"A report was found; it is not a fraud verdict.","no_data":"No history found; this does not mean safe."}.get(result.get("history",{}).get("status"),"History unavailable.")
        text=f"ScamGraph AI\nSaved risk review: {safe_level}\nRisk score: {score if isinstance(score,(int,float)) else 'insufficient data'} / 100\nChecked: {result.get('checked_at','')}\n{model_note}\n{history_note}\nThis is not fraud probability or a verdict. Review evidence in your own ScamGraph app. Original input and identifiers are hidden."
        try:
            with httpx.Client(timeout=timeout_seconds(),follow_redirects=False) as client:
                response=client.post("https://api.line.me/v2/bot/message/push",headers={"Authorization":"Bearer "+cfg["token"],"X-Line-Retry-Key":delivery.id},json={"to":identity.subject,"messages":[{"type":"text","text":text}]})
                accepted=response.status_code==200 or response.status_code==409 and bool(response.headers.get("x-line-accepted-request-id"))
                delivery.status="sent" if accepted else "unavailable"
        except httpx.TimeoutException: delivery.status="timeout"
        except Exception: delivery.status="unavailable"
        delivery.updated_at=utcnow()
        try: db.commit()
        except Exception: db.rollback();return notification_result("deleted")
        return notification_result(delivery.status)

@router.post("/send",response_model=LineSendResponse)
def send(body:LineSendRequest,request:Request,user=Depends(current_user),db=Depends(get_db)):
    client_limit(request,"line-send",5)
    if not db.scalar(select(History).where(History.id==body.history_id,History.user_id==user.id)): raise HTTPException(404,"Saved result not found")
    return send_saved_history(user.id,body.history_id)

@router.post("/webhook",response_model=dict)
async def webhook(request:Request,db=Depends(get_db)):
    cfg=messaging_config()
    if not cfg["secret"]: raise HTTPException(503,"LINE webhook is not configured")
    raw=await request.body()
    if len(raw)>256*1024: raise HTTPException(413,"Webhook is too large")
    signature=request.headers.get("x-line-signature","")
    expected=base64.b64encode(hmac.new(cfg["secret"].encode(),raw,hashlib.sha256).digest()).decode()
    if not re.fullmatch(r"[A-Za-z0-9+/]{43}=",signature) or not hmac.compare_digest(signature,expected): raise HTTPException(401,"Invalid LINE webhook signature")
    try:
        data=json.loads(raw);events=data.get("events")
        if not isinstance(events,list) or len(events)>100: raise ValueError()
    except (ValueError,AttributeError): raise HTTPException(400,"Invalid LINE webhook body")
    processed=0
    for event in events:
        if not isinstance(event,dict) or event.get("type") not in ("follow","unfollow"): continue
        source=event.get("source",{});subject=source.get("userId") if isinstance(source,dict) and source.get("type")=="user" else None
        eid=event.get("webhookEventId");timestamp=event.get("timestamp")
        if not isinstance(subject,str) or not LINE_USER_PATTERN.fullmatch(subject) or not isinstance(eid,str) or not 1<=len(eid)<=100 or not isinstance(timestamp,(int,float)): continue
        try: date=datetime.fromtimestamp(timestamp/1000,tz=timezone.utc)
        except (ValueError,OverflowError,OSError): continue
        if date>utcnow()+timedelta(minutes=1) or date<utcnow()-timedelta(days=1) or db.get(WebhookReceipt,eid): continue
        db.add(WebhookReceipt(event_id=eid))
        proof=db.get(LineFriendship,subject)
        if not proof:
            proof=LineFriendship(subject=subject,following=False,verified_at=date);db.add(proof)
        if date>=aware(proof.verified_at):
            proof.following=event["type"]=="follow";proof.verified_at=date
            if not proof.following:
                identity=db.scalar(select(ProviderIdentity).where(ProviderIdentity.provider=="line",ProviderIdentity.subject==subject))
                subscription=db.get(LineSubscription,identity.user_id) if identity else None
                if subscription: subscription.enabled=False;subscription.consented_at=None
        processed+=1
    # Receipt IDs contain no message body and expire after one month.
    db.execute(delete(WebhookReceipt).where(WebhookReceipt.processed_at<utcnow()-timedelta(days=30)))
    try: db.commit()
    except IntegrityError: db.rollback()  # Concurrent redelivery remains idempotent.
    return {"status":"verified","processed":processed}
