import csv
import copy
import io
import json
import os
import shutil
import threading
from pathlib import Path
from sqlalchemy import select
from .db import Job, SessionLocal, utcnow
from . import services

training_lock=threading.Lock()

def job_dict(job):
    return {"id":job.id,"kind":job.kind,"status":job.status,"progress":job.progress,"result":copy.deepcopy(job.result),"error":job.error,"created_at":job.created_at.isoformat(),"finished_at":job.finished_at.isoformat() if job.finished_at else None}

def parse_rows(data, filename):
    text=data.decode("utf-8-sig")
    if filename.lower().endswith(".csv"):
        return list(csv.DictReader(io.StringIO(text)))
    parsed=json.loads(text)
    if not isinstance(parsed,list): raise ValueError("JSON must be an array of records")
    if not all(isinstance(r,dict) for r in parsed): raise ValueError("Each record must be an object")
    return parsed

def run_job(job_id):
    with SessionLocal() as db:
        job=db.get(Job,job_id)
        if not job or job.status not in ("queued","running"): return
        job.status="running"; job.progress=1; db.commit()
        workspace=None
        try:
            if job.kind=="batch":
                results=[]; rows=job.payload["rows"]
                for index,row in enumerate(rows):
                    result=services.analyze(db,row["text"],row.get("kind","text"))
                    results.append({"row":index+1,"text":row["text"],"kind":row.get("kind","text"),"result":result})
                    job.progress=int((index+1)/len(rows)*100); db.commit()
                job.result={"items":results,"count":len(results)}
                job.payload={}
            elif job.kind=="training":
                from ml.pipeline import train_pipeline
                workspace=Path(os.getenv("JOB_WORK_DIR",str(services.ROOT/"backend"/"var"/"jobs")))/job.id
                workspace.mkdir(parents=True,exist_ok=True)
                path=workspace/"dataset.json"
                path.write_text(json.dumps(job.payload["records"],ensure_ascii=False),encoding="utf-8")
                job.progress=10; db.commit()
                with training_lock:
                    metrics=train_pipeline(path,artifact_dir=os.getenv("MODEL_ARTIFACT_DIR",str(services.ROOT/"ml"/"artifacts"/"default")))
                    services.reload_model()
                job.result={"metrics":metrics,"model_reloaded":services.model_service is not None}
                job.payload={}
            else: raise ValueError("Unsupported job type")
            job.status="completed"; job.progress=100; job.finished_at=utcnow(); db.commit()
        except Exception as exc:
            # Never expose dataset text, credentials or raw provider exceptions.
            db.rollback();db.expire_all();job=db.get(Job,job_id)
            if job is None: return  # Owner deleted the account/job during processing.
            job.status="failed"; job.error=f"{type(exc).__name__}: job could not complete; inspect dataset validation and server setup"; job.finished_at=utcnow(); db.commit()
        finally:
            if workspace: shutil.rmtree(workspace,ignore_errors=True)

def recover_jobs():
    with SessionLocal() as db:
        jobs=db.scalars(select(Job).where(Job.status.in_(["queued","running"]))).all()
        for job in jobs:
            job.status="queued"
            threading.Thread(target=run_job,args=(job.id,),daemon=True).start()
        db.commit()
