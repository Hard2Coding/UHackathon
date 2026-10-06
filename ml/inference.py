"""Inference from persisted real models, with honest availability and explanation units."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from .features import FEATURE_NAMES, extract_features, feature_vector

DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts" / "default"
URL_PATTERN = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)

FEATURE_LABELS = {
    "url_length": "ความยาวลิงก์ / URL length", "host_length": "ความยาวชื่อเว็บไซต์ / Host length",
    "path_length": "ความยาวเส้นทาง / Path length", "dot_count": "จำนวนจุด / Dot count",
    "hyphen_count": "จำนวนขีด / Hyphen count", "digit_count": "จำนวนตัวเลข / Digit count",
    "subdomain_count": "โดเมนย่อย / Subdomains", "ip_host": "ใช้ IP เป็นชื่อเว็บไซต์ / IP hostname",
    "punycode": "ชื่อเว็บไซต์แบบ punycode", "https": "การใช้ HTTPS (ไม่ยืนยันความปลอดภัย)",
    "suspicious_keyword_count": "คำเกี่ยวกับล็อกอิน ยืนยัน หรือรับรางวัล / Verification keywords",
    "host_entropy": "ความซับซ้อนชื่อเว็บไซต์ / Host entropy", "url_entropy": "ความซับซ้อนลิงก์ / URL entropy",
    "query_length": "ความยาวพารามิเตอร์ / Query length", "at_sign": "เครื่องหมาย @ ในลิงก์",
    "percent_encoding_count": "อักขระเข้ารหัสในลิงก์ / Encoded characters", "explicit_port": "กำหนดพอร์ตในลิงก์ / Explicit port",
    "brand_in_host": "ชื่อแบรนด์ในชื่อเว็บไซต์ (ไม่ยืนยันว่าเป็นเจ้าของ) / Brand token",
    "brand_edit_similarity": "ความคล้ายตัวอักษรกับชื่อแบรนด์ / Brand spelling similarity", "path_depth": "จำนวนชั้นเส้นทาง / Path depth",
}


class ModelService:
    def __init__(self, artifact_dir: str | Path | None = None):
        self.artifact_dir = Path(artifact_dir or DEFAULT_ARTIFACT_DIR)
        self.metadata: dict = {}
        self.bundle = None
        self.load_error = None
        self._shap_explainer = None
        self._shap_error = None
        self._sentence_model = None
        self._sentence_vectors = None
        self._embedding_state = "disabled"
        self._embedding_detail = "Sentence embeddings are disabled; lexical TF-IDF similarity is available."
        self._embedding_metadata = None
        try:
            self.metadata = json.loads((self.artifact_dir / "metadata.json").read_text(encoding="utf-8"))
            self.bundle = joblib.load(self.artifact_dir / "models.joblib")
            if self.bundle.get("version", self.metadata["version"]) != self.metadata["version"]:
                self.bundle = None
                raise ValueError("Artifact files are from different versions; training may still be publishing")
        except Exception as error:
            self.load_error = f"{type(error).__name__}: {error}"
        if self.bundle is not None:
            self._load_sentence_model()

    def _load_sentence_model(self):
        if os.getenv("MODEL_EMBEDDINGS_ENABLED", "false").lower() not in {"true", "1", "yes"}:
            return
        path = Path(os.getenv("MODEL_EMBEDDINGS_PATH", str(self.artifact_dir.parent / "embedding-model")))
        self._embedding_state = "unavailable"
        if not path.is_dir():
            self._embedding_detail = "Configured local SentenceTransformer model is missing. No remote model is downloaded during inference."
            return
        try:
            from sentence_transformers import SentenceTransformer
            self._sentence_model = SentenceTransformer(str(path), local_files_only=True, device="cpu")
            reference = [row["text"] for row in self.bundle["reference_examples"]]
            self._sentence_vectors = self._sentence_model.encode(reference, normalize_embeddings=True, show_progress_bar=False)
            self._embedding_state = "ready"
            source_file = path / "scamgraph_source.json"
            if source_file.is_file():
                self._embedding_metadata = json.loads(source_file.read_text(encoding="utf-8"))
            self._embedding_detail = "Local multilingual SentenceTransformer cosine similarities; similarity is not proof of fraud."
        except Exception as error:
            self._sentence_model = None
            self._sentence_vectors = None
            self._embedding_detail = f"Local embedding model unavailable: {type(error).__name__}. Lexical fallback is explicitly labeled."

    def _status(self) -> dict:
        bundle = self.bundle or {}
        ready = self.bundle is not None
        return {"text_model": "ready" if bundle.get("text_model") is not None and bundle.get("vectorizer") is not None else "unavailable", "url_model": "ready" if bundle.get("url_model") is not None else "unavailable", "anomaly_model": "ready" if bundle.get("anomaly_model") is not None else "unavailable", "sentence_embeddings": self._embedding_state, "sentence_embeddings_detail": self._embedding_detail, "sentence_embeddings_model": self._embedding_metadata, "similarity_method": "sentence_transformer_cosine" if self._sentence_model is not None else "tfidf_lexical_cosine" if ready and bundle.get("vectorizer") is not None else "unavailable", "shap": "unavailable" if self._shap_error or bundle.get("url_model") is None else "ready" if self._shap_explainer is not None else "lazy", "calibrated": False, "load_error": self.load_error}

    def _similar(self, text: str) -> list[dict]:
        if not text.strip() or not self.bundle.get("reference_examples"):
            return []
        if self._sentence_model is not None:
            try:
                vector = self._sentence_model.encode([text], normalize_embeddings=True, show_progress_bar=False)[0]
                scores = np.dot(self._sentence_vectors, vector)
                method = "sentence_transformer_cosine"
            except Exception as error:
                self._sentence_model = None
                self._sentence_vectors = None
                self._embedding_state = "unavailable"
                self._embedding_detail = f"Local embedding inference failed: {type(error).__name__}. Lexical fallback is explicitly labeled."
        if self._sentence_model is None:
            if self.bundle.get("vectorizer") is None or self.bundle.get("reference_vectors") is None:
                return []
            vector = self.bundle["vectorizer"].transform([text])
            scores = cosine_similarity(vector, self.bundle["reference_vectors"])[0]
            method = "tfidf_lexical_cosine"
        indices = np.argsort(scores)[-3:][::-1]
        return [{**self.bundle["reference_examples"][int(index)], "similarity": float(scores[index]), "method": method} for index in indices if float(scores[index]) > 0]

    def _text_contributions(self, text: str) -> tuple[list[dict], dict]:
        vector = self.bundle["vectorizer"].transform([text])
        model = self.bundle["text_model"]
        nonzero = vector.indices
        values = vector.data * model.coef_[0, nonzero]
        indices = np.argsort(np.abs(values))[-8:][::-1]
        names = self.bundle["vectorizer"].get_feature_names_out()
        contributions = [{"feature": str(names[nonzero[index]]), "value": float(values[index]), "unit": "log_odds", "model": "text_logistic_regression", "explanation_type": "linear_coefficient_times_tfidf"} for index in indices]
        return contributions, {"model": "text_logistic_regression", "unit": "log_odds", "base_value": float(model.intercept_[0]), "all_contributions_sum": float(values.sum()), "raw_margin": float(model.decision_function(vector)[0]), "shown_contributions": len(contributions), "explanation_type": "exact linear decomposition (not SHAP)"}

    def _url_contributions(self, vector: np.ndarray) -> tuple[list[dict], dict | None]:
        try:
            if self._shap_explainer is None:
                import shap
                self._shap_explainer = shap.TreeExplainer(self.bundle["url_model"], model_output="raw")
            values = np.asarray(self._shap_explainer.shap_values(vector))[0]
            base = float(np.asarray(self._shap_explainer.expected_value).reshape(-1)[0])
            margin = float(self.bundle["url_model"].get_booster().inplace_predict(vector, predict_type="margin")[0])
            if not np.isclose(base + values.sum(), margin, rtol=1e-4, atol=1e-4):
                raise ValueError("SHAP additivity check did not match XGBoost raw margin")
            self._shap_error = None
            selected = np.argsort(np.abs(values))[-8:][::-1]
            result = [{"feature": FEATURE_NAMES[int(index)], "title": FEATURE_LABELS[FEATURE_NAMES[int(index)]], "value": float(values[index]), "feature_value": float(vector[0, index]), "unit": "log_odds", "model": "url_xgboost", "explanation_type": "SHAP TreeExplainer"} for index in selected]
            return result, {"model": "url_xgboost", "unit": "log_odds", "base_value": base, "all_contributions_sum": float(values.sum()), "raw_margin": margin, "shown_contributions": len(result), "additivity_verified": True, "explanation_type": "SHAP TreeExplainer"}
        except Exception as error:
            self._shap_error = f"{type(error).__name__}: {error}"
            return [], None

    def analyze(self, text: str, urls: list[str] | None = None) -> dict:
        text = str(text or "").strip()
        urls = list(dict.fromkeys(urls if urls is not None else [match.rstrip(".,;)]}") for match in URL_PATTERN.findall(text)]))
        result = {"version": self.metadata.get("version", "unavailable"), "text_score": None, "url_score": None, "anomaly": {"status": "not_applicable", "raw_score": None, "decision_function": None, "unusual": None, "unit": "isolation_forest_score", "explanation": "Anomaly measures deviation from normal reference URLs; it is not scam probability."}, "reasons": [], "similar_examples": [], "contributions": [], "model_explanations": [], "status": self._status(), "missing_data": ["domain_age", "external_reputation", "independent_calibration"], "dataset_is_sample": bool(self.metadata.get("dataset_is_sample", False)), "thresholds": self.metadata.get("risk_thresholds", {"high": 70, "medium": 40}), "classification_thresholds": self.metadata.get("classification_thresholds", {}), "calibrated": False}
        if self.bundle is None:
            result["missing_data"].append("trained_models")
            result["anomaly"]["status"] = "unavailable"
            return result
        # Remove URL tokens from text to help backend avoid counting URL evidence twice.
        text_without_urls = URL_PATTERN.sub(" ", text).strip()
        if sum(character.isalnum() for character in text_without_urls) >= 3:
            result["similar_examples"] = self._similar(text_without_urls)
            has_text_model = self.bundle.get("text_model") is not None and self.bundle.get("vectorizer") is not None
            vector = self.bundle["vectorizer"].transform([text_without_urls]) if has_text_model else None
            if vector is not None and vector.nnz:
                result["text_score"] = float(self.bundle["text_model"].predict_proba(vector)[0, 1])
                text_contributions, explanation = self._text_contributions(text_without_urls)
                result["contributions"].extend(text_contributions)
                result["model_explanations"].append(explanation)
                if result["text_score"] >= self.metadata.get("classification_thresholds", {}).get("text", 0.5):
                    result["reasons"].append({"code": "TEXT_MODEL_PATTERN", "title": "รูปแบบข้อความคล้ายตัวอย่างที่โมเดลเรียนรู้", "detail": "ผลจากโมเดลข้อความที่ฝึกจริงบนข้อมูลตัวอย่าง เป็นสัญญาณให้ตรวจเพิ่มและไม่ยืนยันการโกง", "source": f"text model {result['version']}"})
            else:
                result["missing_data"].append("text_features_not_in_training_vocabulary" if has_text_model else "text_model_unavailable")
        else:
            result["missing_data"].append("substantive_text")
        valid_urls, vectors = [], []
        for url in urls:
            try:
                vectors.append(feature_vector(url))
                valid_urls.append(url)
            except ValueError:
                result["missing_data"].append(f"invalid_url:{url[:100]}")
        if vectors:
            matrix = np.asarray(vectors, dtype=float)
            url_model = self.bundle.get("url_model")
            contribution, explanation = [], None
            if url_model is not None:
                scores = url_model.predict_proba(matrix)[:, 1]
                highest = int(np.argmax(scores))
                result["url_score"] = float(scores[highest])
                contribution, explanation = self._url_contributions(matrix[highest:highest + 1])
            else:
                result["missing_data"].append("url_model_unavailable")
            result["contributions"].extend(contribution)
            if explanation:
                explanation["url_index"] = highest
                result["model_explanations"].append(explanation)
            anomaly = self.bundle.get("anomaly_model")
            if anomaly is not None:
                decisions = anomaly.decision_function(matrix)
                raw_scores = anomaly.score_samples(matrix)
                most_unusual = int(np.argmin(decisions))
                result["anomaly"].update({"status": "ready", "raw_score": float(raw_scores[most_unusual]), "decision_function": float(decisions[most_unusual]), "unusual": bool(decisions[most_unusual] < 0), "url_index": most_unusual, "reference_is_sample": bool(self.metadata.get("dataset_is_sample")), "reference_count": self.metadata.get("anomaly", {}).get("reference_count")})
            else:
                result["anomaly"]["status"] = "unavailable"
                result["missing_data"].append("anomaly_model_unavailable")
            if result["url_score"] is not None and result["url_score"] >= self.metadata.get("classification_thresholds", {}).get("url", 0.5):
                positive = sorted((row for row in contribution if row["value"] > 0), key=lambda row: row["value"], reverse=True)
                result["reasons"].append({"code": "URL_MODEL_PATTERN", "title": "โครงสร้างลิงก์มีสัญญาณให้ตรวจเพิ่ม", "detail": "โมเดลลิงก์พบรูปแบบจากข้อมูลตัวอย่าง" + (f": {positive[0]['title']}" if positive else "") + " โดยยังไม่มีข้อมูลอายุโดเมนหรือชื่อเสียงภายนอก", "source": f"URL model {result['version']}"})
            if result["anomaly"]["unusual"]:
                result["reasons"].append({"code": "URL_ANOMALY", "title": "ลิงก์ต่างจากกลุ่มอ้างอิงทั่วไป", "detail": "ความผิดปกติเทียบกับลิงก์ปกติในข้อมูลตัวอย่าง แสดงแยกจากผลจำแนกและไม่ใช่โอกาสโกง", "source": f"normal-reference IsolationForest {result['version']}"})
        else:
            result["missing_data"].append("url_input")
        if self._sentence_model is None:
            result["missing_data"].append("semantic_embeddings" if self._embedding_state == "unavailable" else "semantic_embeddings_disabled")
        if self._shap_error:
            result["missing_data"].append("url_shap_explanation")
        result["status"] = self._status()
        return result
