"""ScamGraph AI API: no endpoint fetches a submitted URL or performs payments."""
import csv
import asyncio
import hashlib
import io
import json
import os
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text as sql_text
from . import services
from .db import AnalysisEvent, Audit, Base, Config, EvidenceFile, Feedback, History, Job, Report, SessionLocal, SessionToken, Source, ThreatRecord, User, ProviderIdentity, OAuthState, OAuthExchange, LineDelivery, LineFriendship, LineSubscription, engine, get_db, utcnow, utc_datetime, utc_isoformat
from .entities import extract_entities, normalize, redact_text, validate_input
from .graph import build_graph
from .jobs import job_dict, parse_rows, recover_jobs, run_job
from .limits import RequestBodyTooLarge, StreamingBodyLimit
from .media import MAX_FILE_BYTES, decode_payload, decode_qr_image, ocr_image, open_image, read_upload
from .schemas import *
from .security import admin_user, auth_scheme, client_limit, current_user, hash_password, issue_token, optional_user, token_digest, user_dict, verify_password
from .seed import seed
from .oauth import router as oauth_router,availability as auth_availability
from .notifications import router as notifications_router,send_saved_history
from .caller_directory import router as caller_router

@asynccontextmanager
async def lifespan(app):
    if os.getenv("AUTO_CREATE_SCHEMA","true").lower()=="true" and os.getenv("APP_ENV","development")!="production":
        Base.metadata.create_all(engine)
    with SessionLocal() as db: seed(db)
    services.reload_model()
    recover_jobs()
    yield

app=FastAPI(title="ScamGraph AI",version="1.0.0",description="Evidence-led risk scores. Demonstration ML and fictional intelligence are labeled. No suspicious URL is fetched.",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=[s.strip() for s in os.getenv("CORS_ORIGINS","http://localhost:8081,http://localhost:19006,http://localhost:8082").split(",") if s.strip()],allow_credentials=False,allow_methods=["GET","POST","PUT","PATCH","DELETE"],allow_headers=["Authorization","Content-Type"])
app.add_middleware(StreamingBodyLimit,max_bytes=MAX_FILE_BYTES+1024*1024)
app.include_router(oauth_router)
app.include_router(notifications_router)
app.include_router(caller_router)

@app.exception_handler(RequestBodyTooLarge)
async def oversized_stream(request,exc):
    return JSONResponse(status_code=413,content={"detail":"Request exceeds body size limit"})

@app.middleware("http")
async def body_limit(request,call_next):
    try:
        length=int(request.headers.get("content-length","0"))
        if length>MAX_FILE_BYTES+1024*1024: return JSONResponse(status_code=413,content={"detail":"Request exceeds file size limit"})
    except ValueError: return JSONResponse(status_code=400,content={"detail":"Invalid Content-Length"})
    return await call_next(request)

def audit(db,user,action,target,detail=None):
    db.add(Audit(id=str(uuid4()),user_id=user.id,action=action,target=target,detail=detail or {}))

def health_data(db):
    db.execute(sql_text("SELECT 1"))
    metadata=getattr(services.model_service,"metadata",{}) or {}
    return {"status":"ok","database":"ready","inference":{"status":"ready" if services.model_service and getattr(services.model_service,"bundle",None) is not None else "unavailable","version":metadata.get("version","unknown"),"dataset_is_sample":metadata.get("dataset_is_sample",True)},"ocr":{"status":"ready" if shutil.which(os.getenv("TESSERACT_CMD","tesseract")) else "optional_apple_vision_or_unavailable","languages":"see OCR response"},"qr":{"status":"ready"},"llm":{"status":"configured" if os.getenv("LLM_API_KEY") and os.getenv("LLM_BASE_URL") else "template","timeout_seconds":float(os.getenv("LLM_TIMEOUT_SECONDS","4"))},"auth_providers":auth_availability(),"external_adapters":{"status":"not_configured","note":"Internal CSV/JSON sources only; no live reputation/domain-age provider"},"file_limit_bytes":MAX_FILE_BYTES}

@app.get("/api/health",response_model=dict)
def health():
    try:
        with SessionLocal() as db: return health_data(db)
    except Exception: return JSONResponse(status_code=503,content={"status":"degraded","database":"unavailable"})

@app.post("/api/analyze",response_model=AnalysisResponse)
def analyze_text(body:AnalyzeRequest,request:Request,db=Depends(get_db)):
    client_limit(request)
    return services.analyze(db,body.text,body.kind)

@app.post("/api/image",response_model=ImageResponse)
async def analyze_image(request:Request,file:UploadFile=File(...)):
    client_limit(request,"media",10)
    data=await read_upload(file,{"image/png","image/jpeg","image/webp"})
    try: return await asyncio.wait_for(asyncio.to_thread(ocr_image,data),timeout=15)
    except asyncio.TimeoutError: return {"extracted_text":"","editable":True,"status":"timeout","message":"OCR timed out; crop the image or paste text"}

@app.post("/api/qr",response_model=QRResponse)
async def decode_qr(request:Request,file:UploadFile=File(...)):
    client_limit(request,"media",10)
    data=await read_upload(file,{"image/png","image/jpeg","image/webp"})
    try: return await asyncio.wait_for(asyncio.to_thread(decode_qr_image,data),timeout=10)
    except asyncio.TimeoutError: return {"payload":None,"status":"timeout","payload_type":None,"entities":[],"payment":None,"requires_confirmation":True,"message":"QR decoding timed out; crop the image"}

class PayloadRequest(BaseModel):
    payload:str=Field(min_length=1,max_length=20000)

@app.post("/api/qr/decode",response_model=QRResponse)
def qr_payload(body:PayloadRequest,request:Request):
    client_limit(request)
    return decode_payload(body.payload)

@app.get("/api/graph",response_model=GraphResponse)
def graph(include_sample:bool=False,entity_value:str|None=Query(default=None,max_length=2000),entity_type:str="domain",db=Depends(get_db)):
    from .entities import entity
    if entity_type not in ("domain","url","phone","account","wallet","line","organization"): raise HTTPException(422,"Unsupported entity type")
    return build_graph(db,[entity(entity_type,entity_value)] if entity_value else None,include_sample=include_sample,masked=True)

@app.post("/api/auth/register",response_model=AuthResponse)
def register(body:RegisterRequest,request:Request,db=Depends(get_db)):
    client_limit(request,"auth",10)
    email=str(body.email).lower()
    if db.scalar(select(User).where(User.email==email)): raise HTTPException(409,"Email is already registered")
    user=User(id=str(uuid4()),email=email,name=body.name.strip(),password_hash=hash_password(body.password),role="user")
    if not user.name: raise HTTPException(422,"Name cannot be blank")
    db.add(user); db.commit()
    return {"token":issue_token(db,user),"user":user_dict(user)}

@app.post("/api/auth/login",response_model=AuthResponse)
def login(body:LoginRequest,request:Request,db=Depends(get_db)):
    client_limit(request,"auth",10)
    user=db.scalar(select(User).where(User.email==str(body.email).lower()))
    if not user or not verify_password(body.password,user.password_hash): raise HTTPException(401,"Email or password is incorrect")
    return {"token":issue_token(db,user),"user":user_dict(user)}

@app.post("/api/auth/logout",response_model=GenericResponse)
def logout(credentials=Depends(auth_scheme),user=Depends(current_user),db=Depends(get_db)):
    db.execute(delete(SessionToken).where(SessionToken.token_hash==token_digest(credentials.credentials)));db.commit()
    return {"status":"ok"}

@app.get("/api/auth/me",response_model=UserResponse)
def me(user=Depends(current_user)): return user_dict(user)

@app.patch("/api/auth/me",response_model=UserResponse)
def update_profile(body:ProfileUpdate,user=Depends(current_user),db=Depends(get_db)):
    if not body.name.strip(): raise HTTPException(422,"Name cannot be blank")
    stored=db.get(User,user.id);stored.name=body.name.strip();db.commit();return user_dict(stored)

def history_dict(row,masked=False):
    return {"id":row.id,"text":"[Original input hidden for privacy]" if masked else row.text,"kind":row.kind,"level":row.level,"result":services.masked_result(row.result) if masked else row.result,"created_at":utc_isoformat(row.created_at)}

def report_dict(row,masked=False):
    return {"id":row.id,"text":"[Original input hidden for privacy]" if masked else row.text,"detail":"[Private report detail hidden]" if masked else row.detail,"evidence":[] if masked else row.evidence,"entities":[{"type":e["type"],"value":e["masked_value"]} for e in row.entities] if masked else row.entities,"status":row.status,"moderation_reason":"[Private review detail hidden]" if masked and row.moderation_reason else row.moderation_reason,"created_at":utc_isoformat(row.created_at),"reviewed_at":utc_isoformat(row.reviewed_at)}

@app.get("/api/auth/export",response_model=dict)
def export_account(masked:bool=True,user=Depends(current_user),db=Depends(get_db)):
    jobs=[job_dict(j) for j in db.scalars(select(Job).where(Job.user_id==user.id))]
    if masked:
        for job in jobs:
            if job["kind"]=="batch" and job["result"]:
                for item in job["result"].get("items",[]):
                    item["result"]=services.masked_result(item["result"])
                    if "text" in item: item["text"]="[Original input hidden for privacy]"
    return {"profile":{**user_dict(user),"name":"[Name hidden]" if masked else user.name,"email":"[email masked]" if masked else user.email},"history":[history_dict(r,masked) for r in db.scalars(select(History).where(History.user_id==user.id))],"reports":[report_dict(r,masked) for r in db.scalars(select(Report).where(Report.user_id==user.id))],"jobs":jobs,"masked":masked}

@app.delete("/api/auth/me",response_model=GenericResponse)
def delete_account(user=Depends(current_user),db=Depends(get_db)):
    # Explicit deletes also make SQLite demo ownership erasure deterministic.
    line_identity=db.scalar(select(ProviderIdentity).where(ProviderIdentity.user_id==user.id,ProviderIdentity.provider=="line"))
    if line_identity:
        proof=db.get(LineFriendship,line_identity.subject)
        if proof: db.delete(proof)
    for model in (LineDelivery,LineSubscription,OAuthState,OAuthExchange,ProviderIdentity,SessionToken,History,Report,Job,EvidenceFile,Feedback):
        db.execute(delete(model).where(model.user_id==user.id))
    db.delete(db.get(User,user.id));db.commit()
    return {"status":"deleted","message":"Account, private history, reports and uploaded evidence deleted"}

@app.post("/api/history",response_model=HistoryResponse)
def save_history(body:HistorySave,background:BackgroundTasks,user=Depends(current_user),db=Depends(get_db)):
    result=services.analyze(db,body.text,body.kind,track=False)
    row=History(id=str(uuid4()),user_id=user.id,text=body.text,kind=body.kind,level=result["level"],result=result)
    db.add(row);db.commit()
    consent=db.get(LineSubscription,user.id)
    if result["level"]=="HIGH" and consent and consent.enabled: background.add_task(send_saved_history,user.id,row.id)
    return history_dict(row)

@app.get("/api/history",response_model=HistoryList)
def list_history(q:str="",kind:str|None=None,level:str|None=None,from_date:str|None=None,to_date:str|None=None,user=Depends(current_user),db=Depends(get_db)):
    query=select(History).where(History.user_id==user.id)
    if q: query=query.where(History.text.ilike("%"+q[:200]+"%"))
    if kind: query=query.where(History.kind==kind)
    if level: query=query.where(History.level==level)
    try:
        if from_date: query=query.where(History.created_at>=datetime.fromisoformat(from_date))
        if to_date: query=query.where(History.created_at<datetime.fromisoformat(to_date)+timedelta(days=1))
    except ValueError: raise HTTPException(422,"Dates must use ISO YYYY-MM-DD")
    return {"items":[history_dict(r) for r in db.scalars(query.order_by(History.created_at.desc()).limit(300))]}

def own_history(db,user,row_id):
    row=db.scalar(select(History).where(History.id==row_id,History.user_id==user.id))
    if not row: raise HTTPException(404,"History not found")
    return row

@app.get("/api/history/{row_id}",response_model=HistoryResponse)
def read_history(row_id:str,user=Depends(current_user),db=Depends(get_db)): return history_dict(own_history(db,user,row_id))

@app.delete("/api/history/{row_id}",response_model=GenericResponse)
def delete_history(row_id:str,user=Depends(current_user),db=Depends(get_db)):
    row=own_history(db,user,row_id)
    db.execute(delete(LineDelivery).where(LineDelivery.history_id==row.id,LineDelivery.user_id==user.id))
    db.delete(row);db.commit();return {"status":"deleted"}

@app.get("/api/history/{row_id}/share",response_model=dict)
def share_history(row_id:str,user=Depends(current_user),db=Depends(get_db)):
    row=own_history(db,user,row_id)
    return {"title":"ScamGraph AI · Risk review","masked":True,"result":services.masked_result(row.result),"note":"Risk score is not a probability or fraud verdict"}

@app.get("/api/history/{row_id}/export")
def export_history(row_id:str,format:str="json",masked:bool=True,user=Depends(current_user),db=Depends(get_db)):
    row=own_history(db,user,row_id); data=history_dict(row,masked)
    if format=="json": return Response(json.dumps(data,ensure_ascii=False),media_type="application/json",headers={"Content-Disposition":"attachment; filename=scamgraph-report.json"})
    if format=="csv":
        values={"id":row.id,"text":data["text"],"kind":row.kind,"level":row.level,"score":row.result.get("score"),"model_version":row.result["model"]["version"],"checked_at":row.result["checked_at"]}
        values={k:("'"+v if isinstance(v,str) and (v.lstrip().startswith(("=","+","-","@")) or v.startswith(("\t","\r"))) else v) for k,v in values.items()}
        output=io.StringIO();writer=csv.DictWriter(output,fieldnames=list(values));writer.writeheader();writer.writerow(values)
        return Response("\ufeff"+output.getvalue(),media_type="text/csv",headers={"Content-Disposition":"attachment; filename=scamgraph-report.csv"})
    raise HTTPException(422,"Format must be json or csv")

@app.post("/api/export",response_model=dict)
def guest_export(body:AnalyzeRequest,request:Request,db=Depends(get_db)):
    client_limit(request)
    return {"title":"ScamGraph AI · Risk review","masked":True,"result":services.masked_result(services.analyze(db,body.text,body.kind,track=False))}

@app.post("/api/reports/evidence",response_model=dict)
async def upload_evidence(file:UploadFile=File(...),user=Depends(current_user),db=Depends(get_db)):
    count=db.scalar(select(func.count()).select_from(EvidenceFile).where(EvidenceFile.user_id==user.id))
    if count>=30: raise HTTPException(429,"Maximum 30 evidence uploads per account")
    data=await read_upload(file,{"image/png","image/jpeg","image/webp"});open_image(data)
    # Re-encode images to strip EXIF/GPS metadata before retention.
    image=open_image(data);buffer=io.BytesIO();image.save(buffer,format="PNG")
    if buffer.tell()>MAX_FILE_BYTES: raise HTTPException(413,"Sanitized evidence exceeds file size limit; resize the image")
    row=EvidenceFile(id=str(uuid4()),user_id=user.id,filename="evidence.png",content_type="image/png",data=buffer.getvalue())
    db.add(row);db.commit();return {"id":row.id,"filename":row.filename,"privacy":"EXIF/GPS removed; reviewers and owner only"}

@app.get("/api/reports/evidence/{file_id}")
def read_evidence(file_id:str,user=Depends(current_user),db=Depends(get_db)):
    row=db.get(EvidenceFile,file_id)
    if not row or (row.user_id!=user.id and user.role!="admin"): raise HTTPException(404,"File not found")
    return Response(row.data,media_type=row.content_type,headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"})

@app.delete("/api/reports/evidence/{file_id}",response_model=GenericResponse)
def delete_evidence(file_id:str,user=Depends(current_user),db=Depends(get_db)):
    row=db.scalar(select(EvidenceFile).where(EvidenceFile.id==file_id,EvidenceFile.user_id==user.id))
    if not row: raise HTTPException(404,"File not found")
    db.delete(row);db.commit();return {"status":"deleted"}

@app.post("/api/reports",response_model=ReportResponse)
def create_report(body:ReportRequest,user=Depends(current_user),db=Depends(get_db)):
    validate_input(body.text,body.kind)
    # PostgreSQL serializes per-user submissions so durable count/dedup checks
    # remain effective with concurrent requests or multiple API workers.
    db.scalar(select(User).where(User.id==user.id).with_for_update())
    recent=db.scalar(select(func.count()).select_from(Report).where(Report.user_id==user.id,Report.created_at>=utcnow()-timedelta(days=1)))
    if recent>=5: raise HTTPException(429,"At most 5 reports per account per day")
    digest=hashlib.sha256((body.kind+"|"+" ".join(body.text.lower().split())).encode()).hexdigest()
    if db.scalar(select(Report).where(Report.user_id==user.id,Report.dedup_hash==digest)): raise HTTPException(409,"Duplicate report already exists")
    for eid in body.evidence:
        if len(eid)!=36: raise HTTPException(422,"Evidence must be an uploaded evidence file ID")
        if not db.scalar(select(EvidenceFile).where(EvidenceFile.id==eid,EvidenceFile.user_id==user.id)): raise HTTPException(404,"Evidence file not found")
    row=Report(id=str(uuid4()),user_id=user.id,text=body.text,detail=body.detail,evidence=body.evidence,entities=extract_entities(body.text,body.kind),dedup_hash=digest,status="pending")
    db.add(row);db.commit();return report_dict(row)

@app.get("/api/reports",response_model=ReportList)
def own_reports(user=Depends(current_user),db=Depends(get_db)):
    return {"items":[report_dict(r) for r in db.scalars(select(Report).where(Report.user_id==user.id).order_by(Report.created_at.desc()))]}

@app.post("/api/feedback",response_model=GenericResponse)
def feedback(body:FeedbackRequest,request:Request,user=Depends(optional_user),db=Depends(get_db)):
    client_limit(request,"feedback",10)
    row=Feedback(id=str(uuid4()),user_id=user.id if user else None,analysis_id=body.analysis_id,verdict=body.verdict,detail=redact_text(body.detail))
    db.add(row);db.commit();return {"status":"received","message":"Feedback is reviewed; it never automatically changes training labels"}

@app.post("/api/batch",response_model=JobResponse)
async def batch(request:Request,background:BackgroundTasks,file:UploadFile=File(...),user=Depends(current_user),db=Depends(get_db)):
    client_limit(request,"batch",5)
    active=db.scalar(select(func.count()).select_from(Job).where(Job.user_id==user.id,Job.status.in_(["queued","running"])))
    if active>=2: raise HTTPException(429,"At most two active jobs per account")
    data=await read_upload(file,{"text/csv","application/csv","application/octet-stream","application/vnd.ms-excel"})
    try: rows=parse_rows(data,"upload.csv")
    except Exception: raise HTTPException(422,"CSV must be UTF-8 with a text column and optional kind column")
    if not rows or len(rows)>200: raise HTTPException(422,"Batch must contain 1–200 rows")
    validated=[]
    for index,row in enumerate(rows):
        try:
            parsed=AnalyzeRequest(text=row.get("text",""),kind=row.get("kind") or "text")
            validate_input(parsed.text,parsed.kind)
            validated.append(parsed.model_dump())
        except Exception: raise HTTPException(422,f"Invalid input in CSV row {index+2}")
    row=Job(id=str(uuid4()),user_id=user.id,kind="batch",status="queued",payload={"rows":validated})
    db.add(row);db.commit();background.add_task(run_job,row.id);return job_dict(row)

@app.get("/api/jobs/{job_id}",response_model=JobResponse)
def job_status(job_id:str,user=Depends(current_user),db=Depends(get_db)):
    row=db.get(Job,job_id)
    if not row or (row.user_id!=user.id and not (user.role=="admin" and row.kind=="training")): raise HTTPException(404,"Job not found")
    return job_dict(row)

@app.get("/api/jobs/{job_id}/export",response_model=dict)
def export_job(job_id:str,user=Depends(current_user),db=Depends(get_db)):
    row=db.scalar(select(Job).where(Job.id==job_id,Job.user_id==user.id))
    if not row: raise HTTPException(404,"Job not found")
    if row.kind!="batch" or row.status!="completed" or not row.result: raise HTTPException(409,"Only completed batch jobs can be exported")
    return {"items":[{"row":item["row"],"result":services.masked_result(item["result"])} for item in row.result["items"]],"count":row.result["count"],"masked":True}

@app.delete("/api/jobs/{job_id}",response_model=GenericResponse)
def delete_job(job_id:str,user=Depends(current_user),db=Depends(get_db)):
    row=db.scalar(select(Job).where(Job.id==job_id,Job.user_id==user.id))
    if not row: raise HTTPException(404,"Job not found")
    if row.status in ("queued","running"): raise HTTPException(409,"Wait for job completion before deletion")
    db.delete(row);db.commit();return {"status":"deleted"}

@app.get("/api/admin/stats",response_model=dict)
def admin_stats(user=Depends(admin_user),db=Depends(get_db)):
    metadata=getattr(services.model_service,"metadata",{}) or {}
    artifact=Path(os.getenv("MODEL_ARTIFACT_DIR",str(services.ROOT/"ml"/"artifacts"/"default")))
    metrics={}
    for name in ("metrics.json","evaluation.json"):
        if (artifact/name).exists():
            try: metrics=json.loads((artifact/name).read_text());break
            except Exception: pass
    return {"analyses_total":db.scalar(select(func.count()).select_from(AnalysisEvent)),"users_total":db.scalar(select(func.count()).select_from(User)),"reports_pending":db.scalar(select(func.count()).select_from(Report).where(Report.status=="pending")),"levels":dict(db.execute(select(AnalysisEvent.level,func.count()).group_by(AnalysisEvent.level)).all()),"model":metadata,"metrics":metrics,"jobs":[job_dict(j) for j in db.scalars(select(Job).where(Job.kind=="training").order_by(Job.created_at.desc()).limit(20))]}

@app.get("/api/admin/reports",response_model=ReportList)
def admin_reports(status:str|None=None,user=Depends(admin_user),db=Depends(get_db)):
    query=select(Report)
    if status: query=query.where(Report.status==status)
    return {"items":[report_dict(r) for r in db.scalars(query.order_by(Report.created_at.desc()).limit(300))]}

@app.patch("/api/admin/reports/{report_id}",response_model=ReportResponse)
def moderate_report(report_id:str,body:ModerationRequest,user=Depends(admin_user),db=Depends(get_db)):
    row=db.get(Report,report_id)
    if not row: raise HTTPException(404,"Report not found")
    before=row.status;row.status=body.status;row.moderation_reason=body.reason;row.reviewed_at=utcnow()
    audit(db,user,"report.moderate",row.id,{"before":before,"after":body.status,"reason":redact_text(body.reason)})
    db.commit();return report_dict(row)

def source_dict(source):
    return {"id":source.id,"name":source.name,"description":source.description,"url":source.url,"is_sample":source.is_sample,"enabled":source.enabled,"created_at":utc_isoformat(source.created_at)}

@app.get("/api/admin/sources",response_model=SourceList)
def sources(user=Depends(admin_user),db=Depends(get_db)): return {"items":[source_dict(s) for s in db.scalars(select(Source))]}

@app.post("/api/admin/sources",response_model=SourceResponse)
def create_source(body:SourceRequest,user=Depends(admin_user),db=Depends(get_db)):
    if body.url and not body.url.startswith(("https://","http://")): raise HTTPException(422,"Source URL must use HTTP(S)")
    row=Source(id=str(uuid4()),**body.model_dump());db.add(row);audit(db,user,"source.create",row.id,{"is_sample":row.is_sample});db.commit();return source_dict(row)

class SourceState(BaseModel):
    enabled:bool

@app.patch("/api/admin/sources/{source_id}",response_model=SourceResponse)
def source_state(source_id:str,body:SourceState,user=Depends(admin_user),db=Depends(get_db)):
    row=db.get(Source,source_id)
    if not row: raise HTTPException(404,"Source not found")
    row.enabled=body.enabled;audit(db,user,"source.enable",row.id,{"enabled":body.enabled});db.commit();return source_dict(row)

@app.post("/api/admin/sources/{source_id}/import",response_model=dict)
async def import_source(source_id:str,file:UploadFile=File(...),user=Depends(admin_user),db=Depends(get_db)):
    source=db.get(Source,source_id)
    if not source: raise HTTPException(404,"Source not found")
    data=await read_upload(file,{"application/json","text/csv","application/octet-stream","application/vnd.ms-excel"})
    try:
        rows=parse_rows(data,file.filename or "data.json")
        if not rows or len(rows)>10000: raise ValueError("Record count")
        records=[]
        for row in rows:
            kind=row["entity_type"];value=normalize(kind,str(row["value"]));status=row.get("status","reported")
            if kind not in ("url","domain","phone","account","wallet","line") or status not in ("reported","confirmed") or not row.get("evidence"): raise ValueError("Missing evidence or invalid entity/status")
            related=row.get("related_entities",[])
            if isinstance(related,str): related=json.loads(related or "[]")
            if not isinstance(related,list) or len(related)>50: raise ValueError("Invalid related entities")
            for e in related:
                if e.get("type") not in ("url","domain","phone","account","wallet","line") or not e.get("value"): raise ValueError("Invalid relation")
            date=datetime.fromisoformat(row["retrieved_at"].replace("Z","+00:00")) if row.get("retrieved_at") else utcnow()
            records.append(ThreatRecord(id=str(uuid4()),source_id=source_id,entity_type=kind,value=value,status=status,evidence=str(row["evidence"])[:10000],related_entities=related,retrieved_at=utc_datetime(date)))
    except Exception: raise HTTPException(422,"Import needs entity_type,value,status(reported/confirmed),evidence,retrieved_at(optional),related_entities(optional JSON array)")
    added=0
    for record in records:
        if not db.scalar(select(ThreatRecord).where(ThreatRecord.source_id==source_id,ThreatRecord.entity_type==record.entity_type,ThreatRecord.value==record.value)):
            db.add(record);added+=1
    audit(db,user,"source.import",source_id,{"rows":len(rows),"added":added});db.commit();return {"status":"imported","count":added,"duplicates_skipped":len(rows)-added}

async def dataset_records(file):
    data=await read_upload(file,{"application/json","text/csv","application/octet-stream","application/vnd.ms-excel"})
    try:
        records=parse_rows(data,file.filename or "data.json")
        if not records or len(records)>50000: raise ValueError("Invalid record count")
        from ml.pipeline import validate_records
        report=validate_records(records)
        return records,report
    except Exception as exc:
        # Validation errors are intentionally generic; raw text is not reflected.
        raise HTTPException(422,f"Dataset validation failed ({type(exc).__name__}); use text,label(normal/scam),campaign_id,source,is_sample metadata")

@app.post("/api/admin/datasets/validate",response_model=dict)
async def validate_dataset(file:UploadFile=File(...),user=Depends(admin_user)):
    _,report=await dataset_records(file);return {"status":"valid","validation":report}

@app.post("/api/admin/datasets/import",response_model=JobResponse)
async def import_dataset(file:UploadFile=File(...),user=Depends(admin_user),db=Depends(get_db)):
    records,report=await dataset_records(file)
    row=Job(id=str(uuid4()),user_id=user.id,kind="dataset",status="completed",progress=100,payload={"records":records},result={"validation":report,"records":len(records)},finished_at=utcnow())
    db.add(row);audit(db,user,"dataset.import",row.id,{"records":len(records)});db.commit();return job_dict(row)

class TrainingRequest(BaseModel):
    dataset_job_id:str

@app.post("/api/admin/train",response_model=JobResponse)
def train(body:TrainingRequest,background:BackgroundTasks,user=Depends(admin_user),db=Depends(get_db)):
    source=db.get(Job,body.dataset_job_id)
    if not source or source.kind!="dataset" or source.status!="completed": raise HTTPException(404,"Validated dataset import not found")
    if db.scalar(select(Job).where(Job.kind=="training",Job.status.in_(["queued","running"]))): raise HTTPException(409,"A training job is already active")
    row=Job(id=str(uuid4()),user_id=user.id,kind="training",status="queued",payload={"records":source.payload["records"]})
    db.add(row);audit(db,user,"training.start",row.id,{"dataset_job_id":source.id});db.commit();background.add_task(run_job,row.id);return job_dict(row)

@app.get("/api/admin/jobs",response_model=dict)
def training_jobs(user=Depends(admin_user),db=Depends(get_db)):
    return {"items":[job_dict(j) for j in db.scalars(select(Job).where(Job.kind.in_(["training","dataset"])).order_by(Job.created_at.desc()).limit(100))]}

@app.get("/api/admin/thresholds",response_model=dict)
def get_thresholds(user=Depends(admin_user),db=Depends(get_db)): return services.thresholds(db)

@app.put("/api/admin/thresholds",response_model=dict)
def put_thresholds(body:ThresholdRequest,user=Depends(admin_user),db=Depends(get_db)):
    row=db.get(Config,"thresholds");before=row.value if row else None
    if row: row.value=body.model_dump()
    else: db.add(Config(key="thresholds",value=body.model_dump()))
    audit(db,user,"thresholds.update","thresholds",{"before":before,"after":body.model_dump()});db.commit();return body.model_dump()

@app.get("/api/admin/audit",response_model=dict)
def audit_log(user=Depends(admin_user),db=Depends(get_db)):
    return {"items":[{"id":a.id,"user_id":a.user_id,"action":a.action,"target":a.target,"detail":a.detail,"created_at":utc_isoformat(a.created_at)} for a in db.scalars(select(Audit).order_by(Audit.created_at.desc()).limit(300))]}

@app.get("/api/admin/health",response_model=dict)
def admin_health(user=Depends(admin_user),db=Depends(get_db)): return health_data(db)
