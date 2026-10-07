import os
from uuid import uuid4
from sqlalchemy import select
from .db import User, Source, ThreatRecord, Config, SessionLocal
from .entities import normalize
from .security import hash_password

def seed(db):
    if not db.get(Config,"thresholds"): db.add(Config(key="thresholds",value={"medium":40.0,"high":70.0}))
    if os.getenv("APP_ENV","development")=="production":
        db.commit(); return
    if os.getenv("ENABLE_DEMO_SEED","true").lower()!="true":
        db.commit(); return
    for email,name,password,role in (("admin@scamgraph.demo","Demo Admin","DemoAdmin!2026","admin"),("demo@scamgraph.demo","Demo User","DemoUser!2026","user")):
        if not db.scalar(select(User).where(User.email==email)):
            db.add(User(id=str(uuid4()),email=email,name=name,password_hash=hash_password(password),role=role))
    if not db.scalar(select(Source).where(Source.name=="SAMPLE · Fictional hackathon graph")):
        source=Source(id=str(uuid4()),name="SAMPLE · Fictional hackathon graph",description="All entities are fictional reserved domains or non-person placeholders; no real accusation.",url="https://scamgraph.example/sample-evidence",is_sample=True)
        db.add(source); db.flush()
        related=[{"type":"domain","value":"reward-support.example"},{"type":"wallet","value":"DEMO-WALLET-001"},{"type":"phone","value":"DEMO-PHONE-001"},{"type":"account","value":"DEMO-ACCOUNT-001"},{"type":"line","value":"demo.support"}]
        for kind,value in (("url","https://reward-support.example/claim"),("domain","reward-support.example"),("wallet","DEMO-WALLET-001")):
            db.add(ThreatRecord(id=str(uuid4()),source_id=source.id,entity_type=kind,value=normalize(kind,value),status="reported",evidence="SAMPLE: fictional campaign entities appear in the same invented demonstration record.",related_entities=related))
    db.commit()

if __name__=="__main__":
    with SessionLocal() as db: seed(db)
    print("Seed complete; demo data is explicitly marked SAMPLE and disabled in production.")
