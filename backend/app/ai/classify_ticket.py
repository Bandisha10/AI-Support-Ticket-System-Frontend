import json
import logging
import os
from pathlib import Path
import numpy as np
import onnxruntime as ort
from dotenv import load_dotenv
from huggingface_hub import hf_hub_download
from transformers import AutoTokenizer

from backend.app.ai.redact_pii import redact_pii

load_dotenv()
logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.5

DEPT_REPO = "pratik14212/deskwise-departments"
PRIORITY_REPO = "pratik14212/deskwise-priorities"
SENTIMENT_REPO = "pratik14212/deskwise-sentiments"

# Load mappings
MAPPINGS_FILE = Path(__file__).parent / "label_mappings.json"
id_to_dept: dict[str, str] = {}
id_to_priority: dict[str, str] = {}
id_to_sentiment: dict[str, str] = {}

if MAPPINGS_FILE.exists():
    try:
        with open(MAPPINGS_FILE, encoding="utf-8") as f:
            mappings = json.load(f)
        for k, v in mappings.get("department", {}).items():
            id_to_dept[f"LABEL_{v}"] = k
            id_to_dept[str(v)] = k
            id_to_dept[k] = k

        for k, v in mappings.get("priority", {}).items():
            id_to_priority[f"LABEL_{v}"] = k
            id_to_priority[str(v)] = k
            id_to_priority[k] = k

        for k, v in mappings.get("sentiment", {}).items():
            id_to_sentiment[f"LABEL_{v}"] = k
            id_to_sentiment[str(v)] = k
            id_to_sentiment[k] = k
    except Exception as exc:
        logger.warning("Could not load label mappings: %s", exc)

_sessions: dict[str, ort.InferenceSession] = {}
_tokenizers: dict[str, AutoTokenizer] = {}


def _get_onnx_model(repo_id: str):
    """Download quantized ONNX model from Hugging Face Hub (cached) and create low-memory session."""
    if repo_id not in _sessions:
        token = os.getenv("HF_TOKEN") or None
        _tokenizers[repo_id] = AutoTokenizer.from_pretrained(repo_id, token=token)

        model_path = hf_hub_download(
            repo_id=repo_id,
            filename="model_quantized.onnx",
            token=token,
        )
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 1  # Minimal CPU usage on Render free tier
        _sessions[repo_id] = ort.InferenceSession(model_path, sess_options, providers=["CPUExecutionProvider"])

    return _sessions[repo_id], _tokenizers[repo_id]


def preload_models() -> None:
    """Preload all 3 ONNX models on server startup. Total RAM is under 150 MB."""
    logger.info("Preloading ONNX classification models...")
    for repo in (DEPT_REPO, PRIORITY_REPO, SENTIMENT_REPO):
        try:
            _get_onnx_model(repo)
            logger.info("Successfully loaded ONNX model: %s", repo)
        except Exception as exc:
            logger.error("Failed to preload ONNX model %s: %s", repo, exc)
    logger.info("All ONNX classification models ready in memory.")


def _softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=0)


def _predict_onnx(text: str, repo_id: str, label_map: dict[str, str], default_label: str) -> dict:
    try:
        session, tokenizer = _get_onnx_model(repo_id)
        inputs = tokenizer(text, truncation=True, max_length=512, return_tensors="np")

        ort_inputs = {
            "input_ids": inputs["input_ids"].astype(np.int64),
            "attention_mask": inputs["attention_mask"].astype(np.int64),
        }

        logits = session.run(["logits"], ort_inputs)[0][0]
        probs = _softmax(logits)

        top_idx = int(np.argmax(probs))
        score = float(probs[top_idx])

        raw_label = f"LABEL_{top_idx}"
        label = label_map.get(raw_label, label_map.get(str(top_idx), default_label))
        confidence = round(score, 3)

        return {
            "label": label if label else default_label,
            "confidence": confidence,
            "needs_human_review": confidence < CONFIDENCE_THRESHOLD,
        }
    except Exception as exc:
        logger.warning("ONNX inference failed for %s: %s", repo_id, exc)
        return {"label": default_label, "confidence": 0.5, "needs_human_review": True}


def classify_ticket(subject: str, body: str) -> dict:
    raw_text = f"{subject}. {body}" if subject else body
    redacted = redact_pii(raw_text)

    category_result = _predict_onnx(redacted.text, DEPT_REPO, id_to_dept, default_label="Customer Experience")
    priority_result = _predict_onnx(redacted.text, PRIORITY_REPO, id_to_priority, default_label="medium")
    sentiment_result = _predict_onnx(redacted.text, SENTIMENT_REPO, id_to_sentiment, default_label="neutral")

    return {
        "body_redacted": redacted.text,
        "category": category_result,
        "priority": priority_result,
        "sentiment": sentiment_result,
    }


if __name__ == "__main__":
    result = classify_ticket("Billing issue", "My credit card was charged twice for the monthly plan.")
    print("\nClassification Result:\n", json.dumps(result, indent=2))
