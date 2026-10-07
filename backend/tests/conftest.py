import os
import tempfile
from pathlib import Path
import pytest

os.environ["DATABASE_URL"]="sqlite:///"+str(Path(tempfile.mkdtemp(prefix="scamgraph-tests-"))/"api.db")
os.environ["APP_ENV"]="test"
os.environ["AUTO_CREATE_SCHEMA"]="true"
os.environ["MODEL_EMBEDDINGS_ENABLED"]="false"
os.environ["ENABLE_DEMO_SEED"]="true"
os.environ["MODEL_ARTIFACT_DIR"]=str(Path(__file__).resolve().parents[2]/"ml"/"artifacts"/"default")
os.environ.pop("LLM_API_KEY",None)

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.security import limiter

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c: yield c

@pytest.fixture(autouse=True)
def reset_limits():
    limiter.hits.clear()

@pytest.fixture
def auth(client):
    from uuid import uuid4
    email=f"user-{uuid4().hex}@example.com"
    response=client.post("/api/auth/register",json={"email":email,"password":"TestsPassword!2026","name":"Test user"})
    assert response.status_code==200,response.text
    return {"Authorization":"Bearer "+response.json()["token"]}

@pytest.fixture
def admin(client):
    response=client.post("/api/auth/login",json={"email":"admin@scamgraph.demo","password":"DemoAdmin!2026"})
    assert response.status_code==200,response.text
    return {"Authorization":"Bearer "+response.json()["token"]}
