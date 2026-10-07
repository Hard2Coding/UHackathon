"""Export the real FastAPI schema without making network requests."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.main import app

output = ROOT / "shared" / "openapi.json"
output.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {output} ({len(app.openapi()['paths'])} paths)")
