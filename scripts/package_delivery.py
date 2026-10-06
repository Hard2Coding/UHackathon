"""Package source + real lightweight trained models, excluding runtime data/secrets."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import argparse
import os

ROOT = Path(__file__).resolve().parents[1]
target = ROOT.parent / "scamgraph-ai.zip"
excluded = {".venv", ".runtime", "node_modules", "__pycache__", ".pytest_cache", ".expo", ".git", "embedding-model", "dist", "work", ".gradle", "Pods", "DerivedData"}
count = 0
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--dry-run", action="store_true", help="Check deliverable file selection without writing an archive")
args = parser.parse_args()
files = []
for folder, directories, filenames in os.walk(ROOT):
    directories[:] = sorted(name for name in directories if name not in excluded)
    for name in sorted(filenames):
        file = Path(folder) / name
        if (file.name.startswith(".env") and file.name != ".env.example") or file.name.startswith("client_secret") or file.suffix in {".db", ".pyc", ".log", ".pem", ".key", ".jks", ".keystore", ".mobileprovision"}:
            continue
        files.append(file)
if args.dry_run:
    print(f"Ready to package {len(files)} files; source size {sum(file.stat().st_size for file in files):,} bytes. Runtime/dependencies/weights/secrets are excluded.")
    raise SystemExit(0)
with ZipFile(target, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
    for file in files:
        rel = file.relative_to(ROOT)
        archive.write(file, Path(ROOT.name) / rel)
        count += 1
print(f"Packaged {count} source/artifact files: {target} ({target.stat().st_size:,} bytes)")
