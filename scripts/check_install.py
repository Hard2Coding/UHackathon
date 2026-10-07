"""Check real runtime imports and record installed versions for delivery QA."""
import importlib
import importlib.metadata
import json
import platform
import shutil
import os

packages = {
    "fastapi": "fastapi", "uvicorn": "uvicorn", "sqlalchemy": "SQLAlchemy", "alembic": "alembic",
    "psycopg": "psycopg", "sklearn": "scikit-learn", "xgboost": "xgboost", "shap": "shap",
    "sentence_transformers": "sentence-transformers", "torch": "torch", "networkx": "networkx",
    "cv2": "opencv-python-headless", "PIL": "Pillow", "pytesseract": "pytesseract",
    "jwt": "PyJWT", "cryptography": "cryptography",
}
versions = {}
for module, distribution in packages.items():
    importlib.import_module(module)
    try:
        versions[distribution] = importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        if distribution != "xgboost":
            raise
        versions["xgboost-cpu"] = importlib.metadata.version("xgboost-cpu")
ocr = "tesseract" if shutil.which(os.getenv("TESSERACT_CMD", "tesseract")) else "unavailable"
if platform.system() == "Darwin" and ocr != "tesseract":
    importlib.import_module("Vision")
    ocr = "macOS Vision"
print(json.dumps({"python": platform.python_version(), "packages": versions, "ocr": ocr}, indent=2))
