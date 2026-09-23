import json
import logging
from pathlib import Path
from backend.app.ai.redact_pii import redact_pii

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent / "models"
CONFIDENCE_THRESHOLD = 0.5

# Lazy-loaded model holders
_models_loaded = False
dept_tokenizer = None
dept_model = None
priority_tokenizer = None
priority_model = None
sentiment_tokenizer = None
sentiment_model = None
id_to_dept: dict = {}
id_to_priority: dict = {}
id_to_sentiment: dict = {}

def _load_models() -> bool:
    global _models_loaded, dept_tokenizer, dept_model, priority_tokenizer, priority_model
    global sentiment_tokenizer, sentiment_model, id_to_dept, id_to_priority, id_to_sentiment

    if _models_loaded:
        return True

    try:
        import torch
        from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification  # type: ignore[import-not-found]

        label_map_file = BASE_DIR.parent / "label_mappings.json"
        if label_map_file.exists():
            with open(label_map_file, encoding="utf-8") as f:
                mappings = json.load(f)
            id_to_dept = {v: k for k, v in mappings.get("department", {}).items()}
            id_to_priority = {v: k for k, v in mappings.get("priority", {}).items()}
            id_to_sentiment = {v: k for k, v in mappings.get("sentiment", {}).items()}

        dept_path = BASE_DIR / "department"
        if dept_path.exists():
            dept_tokenizer = DistilBertTokenizerFast.from_pretrained(dept_path)
            dept_model = DistilBertForSequenceClassification.from_pretrained(dept_path)
            dept_model.eval()

        priority_path = BASE_DIR / "priority"
        if priority_path.exists():
            priority_tokenizer = DistilBertTokenizerFast.from_pretrained(priority_path)
            priority_model = DistilBertForSequenceClassification.from_pretrained(priority_path)
            priority_model.eval()

        sentiment_path = BASE_DIR / "sentiment"
        if sentiment_path.exists():
            sentiment_tokenizer = DistilBertTokenizerFast.from_pretrained(sentiment_path)
            sentiment_model = DistilBertForSequenceClassification.from_pretrained(sentiment_path)
            sentiment_model.eval()

        _models_loaded = True
        logger.info("AI classification models loaded successfully")
        return True
    except Exception as exc:
        logger.warning("AI classification models could not be loaded: %s", exc)
        return False

def _predict(text: str, tokenizer, model, id_to_label: dict) -> dict:
    try:
        import torch
        if tokenizer is None or model is None:
            return {"label": "general", "confidence": 0.5, "needs_human_review": True}
        inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=128)
        with torch.no_grad():
            logits = model(**inputs).logits
        probs = torch.softmax(logits, dim=1)[0]
        predicted_idx: int = int(torch.argmax(probs).item())
        confidence = float(probs[predicted_idx].item())  # type: ignore[bad-index]
        return {
            "label": id_to_label.get(predicted_idx, "general"),
            "confidence": round(confidence, 3),
            "needs_human_review": confidence < CONFIDENCE_THRESHOLD,
        }
    except Exception as exc:
        logger.warning("Prediction error: %s", exc)
        return {"label": "general", "confidence": 0.5, "needs_human_review": True}

def classify_ticket(subject: str, body: str) -> dict:
    raw_text = f"{subject}. {body}" if subject else body
    redacted = redact_pii(raw_text)

    if not _load_models():
        return {
            "body_redacted": redacted.text,
            "category": {"label": "general", "confidence": 0.5, "needs_human_review": True},
            "priority": {"label": "medium", "confidence": 0.5, "needs_human_review": True},
            "sentiment": {"label": "neutral", "confidence": 0.5, "needs_human_review": True},
        }

    category_result = _predict(redacted.text, dept_tokenizer, dept_model, id_to_dept)
    priority_result = _predict(redacted.text, priority_tokenizer, priority_model, id_to_priority)
    sentiment_result = _predict(redacted.text, sentiment_tokenizer, sentiment_model, id_to_sentiment)

    return {
        "body_redacted": redacted.text,
        "category": category_result,
        "priority": priority_result,
        "sentiment": sentiment_result,
    }
