"""Start migrations/seed/inference with .env loaded and explicit demo DB choice."""
import argparse
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env", override=False)
parser = argparse.ArgumentParser()
parser.add_argument("--sqlite-demo", action="store_true")
parser.add_argument("--reload", action="store_true", help="Reload local API code in backend/ and ml/ during development")
args = parser.parse_args()
(ROOT / ".runtime").mkdir(exist_ok=True)
if args.sqlite_demo:
    os.environ["DATABASE_URL"] = f"sqlite:///{ROOT / '.runtime' / 'scamgraph-demo.db'}"
os.environ.setdefault("MODEL_ARTIFACT_DIR", str(ROOT / "ml/artifacts/default"))
os.environ.setdefault("MODEL_EMBEDDINGS_ENABLED", "true")
os.environ.setdefault("MODEL_EMBEDDINGS_PATH", str(ROOT / "ml/artifacts/embedding-model"))


def run(*parts):
    subprocess.run([sys.executable, *parts], cwd=ROOT, check=True)


run("-m", "alembic", "-c", "backend/alembic.ini", "upgrade", "head")
run("-m", "backend.app.seed")
artifact_dir = Path(os.environ["MODEL_ARTIFACT_DIR"])
if not (artifact_dir / "models.joblib").exists():
    run("-m", "ml", "sample", "--output", "ml/datasets/sample.jsonl")
    run("-m", "ml", "train", "ml/datasets/sample.jsonl", "--artifacts", str(artifact_dir))
    run("-m", "ml", "evaluate", "ml/datasets/sample.jsonl", "--artifacts", str(artifact_dir))
port = os.environ.get("API_PORT", "8000")
print(f"ScamGraph API: {'SQLite local demo' if args.sqlite_demo else 'configured database'}; http://localhost:{port}/docs", flush=True)
command = [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", port, "--no-access-log"]
if args.reload:
    command += ["--reload", "--reload-dir", str(ROOT / "backend"), "--reload-dir", str(ROOT / "ml")]
    # watchfiles may be optional; Uvicorn's standard Python watcher still works.
    # Never watch model weights, uploads, or runtime databases.
    command += ["--reload-exclude", "artifacts/*", "--reload-exclude", "datasets/*", "--reload-exclude", "__pycache__/*"]
os.execv(sys.executable, command)
