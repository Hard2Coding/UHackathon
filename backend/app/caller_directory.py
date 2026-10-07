"""Only real, reviewed/source-confirmed phone records for offline caller lookup."""
import hashlib
import json
import os
import re
from datetime import datetime,timedelta
from fastapi import APIRouter,Depends
from pydantic import BaseModel
from sqlalchemy import select
from .db import Report,Source,ThreatRecord,get_db,utcnow
from .entities import redact_text
from .oauth import aware

router=APIRouter(prefix="/api/caller-id",tags=["Verified offline caller directory"])

def e164(value):
    value=re.sub(r"[\s()-]","",value)
    if re.fullmatch(r"0[689]\d{8}|0[2-7]\d{7}",value): return "+66"+value[1:]
    if re.fullmatch(r"\+[1-9]\d{7,14}",value): return value
    return None

class CallerEntry(BaseModel):
    phone:str
    label:str
    source:str
    evidence_status:str
    retrieved_at:str
    expires_at:str
    is_sample:bool=False
    evidence:str
    provenance:list[dict]

class DirectoryResponse(BaseModel):
    entries:list[CallerEntry]
    generated_at:str
    expires_at:str
    version:str
    status:str
    note:str

def positive_env_int(name,default,maximum):
    try: return min(maximum,max(1,int(os.getenv(name,str(default)))))
    except ValueError: return default

@router.get("/directory",response_model=DirectoryResponse)
def directory(db=Depends(get_db)):
    generated=utcnow();expires=generated+timedelta(hours=positive_env_int("CALLER_DIRECTORY_TTL_HOURS",6,24))
    max_age=timedelta(days=positive_env_int("CALLER_DIRECTORY_MAX_AGE_DAYS",90,365))
    sources={source.id:source for source in db.scalars(select(Source).where(Source.enabled.is_(True),Source.is_sample.is_(False)))}
    entries={}
    def add(value,status,source,date,evidence,source_url=None):
        phone=e164(value);date=aware(date)
        if not phone or date<generated-max_age or date>generated+timedelta(minutes=1): return
        item={"source":source,"source_url":source_url,"evidence_status":status,"retrieved_at":date.isoformat(),"evidence":redact_text(evidence)}
        if phone not in entries:
            entries[phone]={"phone":phone,"label":"Source-confirmed record" if status=="confirmed_source" else "Reviewed report found","source":source,"evidence_status":status,"retrieved_at":date.isoformat(),"expires_at":min(expires,date+max_age).isoformat(),"is_sample":False,"evidence":item["evidence"],"provenance":[]}
        entry=entries[phone]
        entry["provenance"].append(item)
        if status=="confirmed_source" and entry["evidence_status"]!="confirmed_source" or status==entry["evidence_status"] and date>aware(datetime.fromisoformat(entry["retrieved_at"])):
            entry.update(label="Source-confirmed record" if status=="confirmed_source" else "Reviewed report found",source=source,evidence_status=status,retrieved_at=date.isoformat(),expires_at=min(expires,date+max_age).isoformat(),evidence=item["evidence"])
    for record in db.scalars(select(ThreatRecord).where(ThreatRecord.entity_type=="phone",ThreatRecord.status=="confirmed")):
        source=sources.get(record.source_id)
        if source: add(record.value,"confirmed_source",source.name,record.retrieved_at,record.evidence,source.url)
    for report in db.scalars(select(Report).where(Report.status=="verified")):
        for entity in report.entities:
            if entity.get("type")=="phone": add(entity["value"],"community_reviewed","Reviewed community report",report.reviewed_at or report.created_at,"A moderator reviewed this report. Co-occurrence does not establish common ownership or fraud.")
    result=sorted(entries.values(),key=lambda entry:entry["phone"])
    canonical=json.dumps([{key:value for key,value in entry.items() if key!="expires_at"} for entry in result],sort_keys=True,ensure_ascii=False,separators=(",",":"))
    return {"entries":result,"generated_at":generated.isoformat(),"expires_at":expires.isoformat(),"version":hashlib.sha256(canonical.encode()).hexdigest()[:24],"status":"ready" if result else "no_verified_entries","note":"Samples, pending/rejected reports, unconfirmed source records and expired entries are excluded. A matched record is provenance, not a scam verdict. Unknown or expired lookup: insufficient data, not safe. No incoming-call audio, network inference, or automatic blocking is provided by this endpoint."}
