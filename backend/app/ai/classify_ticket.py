import torch
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification
import json
from pathlib import Path
from backend.app.ai.redact_pii import redact_pii

BASE_DIR = Path(__file__).parent / "models"

dept_tokenizer = DistilBertTokenizerFast.from_pretrained(BASE_DIR / "department")
dept_model = DistilBertForSequenceClassification.from_pretrained(BASE_DIR / "department")
dept_model.eval()
print(f"[DEBUG] Department model num_labels: {dept_model.config.num_labels}")
print(f"[DEBUG] Loaded from: {BASE_DIR / 'department'}")


priority_tokenizer = DistilBertTokenizerFast.from_pretrained(BASE_DIR / "priority")
priority_model = DistilBertForSequenceClassification.from_pretrained(BASE_DIR / "priority")
priority_model.eval()

sentiment_tokenizer = DistilBertTokenizerFast.from_pretrained(BASE_DIR / "sentiment")
sentiment_model = DistilBertForSequenceClassification.from_pretrained(BASE_DIR / "sentiment")
sentiment_model.eval()
print(f"[DEBUG] Sentiment model num_labels: {sentiment_model.config.num_labels}")
print(f"[DEBUG] Loaded from: {BASE_DIR / 'sentiment'}")

with open(BASE_DIR.parent / "label_mappings.json") as f:
    mappings = json.load(f)
id_to_dept = {v: k for k, v in mappings["department"].items()}
id_to_priority = {v: k for k, v in mappings["priority"].items()}
id_to_sentiment = {v: k for k, v in mappings["sentiment"].items()}
print(f"[DEBUG] Labels: {id_to_dept if 'id_to_dept' in dir() else 'not yet loaded'}")
print(f"[DEBUG] Model config num_labels: {dept_model.config.num_labels}")

CONFIDENCE_THRESHOLD = 0.5

def _predict(text: str, tokenizer, model, id_to_label: dict) -> dict:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=128)
    with torch.no_grad():
        logits = model(**inputs).logits
    probs = torch.softmax(logits, dim=1)[0]
    predicted_id = torch.argmax(probs).item()
    confidence = probs[predicted_id].item()
    return {
        "label": id_to_label[predicted_id],
        "confidence": round(confidence, 3),
        "needs_human_review": confidence < CONFIDENCE_THRESHOLD,
    }

def classify_ticket(subject: str, body: str) -> dict:
    raw_text = f"{subject}. {body}" if subject else body
    redacted = redact_pii(raw_text)

    category_result = _predict(redacted.text, dept_tokenizer, dept_model, id_to_dept)
    priority_result = _predict(redacted.text, priority_tokenizer, priority_model, id_to_priority)
    sentiment_result = _predict(redacted.text, sentiment_tokenizer, sentiment_model, id_to_sentiment)

    return {
        "body_redacted": redacted.text,
        "category": category_result,
        "priority": priority_result,
        "sentiment": sentiment_result,
    }
