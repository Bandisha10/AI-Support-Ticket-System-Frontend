import gc
import json
import logging
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
from dotenv import load_dotenv
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

from backend.app.ai.redact_pii import redact_pii

load_dotenv()
logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.5

DEPT_REPO = "pratik14212/deskwise-departments"
PRIORITY_REPO = "pratik14212/deskwise-priorities"
SENTIMENT_REPO = "pratik14212/deskwise-sentiments"

# Load label mappings
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
_shared_tokenizer: Tokenizer | None = None


def _get_tokenizer() -> Tokenizer:
    """Load a single shared Rust Tokenizer (~30 MB RAM vs 400 MB in transformers)."""
    global _shared_tokenizer
    if _shared_tokenizer is None:
        _shared_tokenizer = Tokenizer.from_pretrained(DEPT_REPO)
        _shared_tokenizer.enable_truncation(max_length=128)
        _shared_tokenizer.enable_padding(length=128)
    return _shared_tokenizer


def _get_onnx_model(repo_id: str) -> ort.InferenceSession:
    """Download quantized ONNX model from Hugging Face Hub (cached) and create low-memory session."""
    if repo_id not in _sessions:
        token = os.getenv("HF_TOKEN") or None
        model_path = hf_hub_download(
            repo_id=repo_id,
            filename="model_quantized.onnx",
            token=token,
        )
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 1
        sess_options.enable_mem_pattern = False
        # Disabling CPU memory arena stops ONNX Runtime from hoarding 150MB+ RAM blocks
        sess_options.enable_cpu_mem_arena = False
        _sessions[repo_id] = ort.InferenceSession(
            model_path, sess_options, providers=["CPUExecutionProvider"]
        )
        gc.collect()
    return _sessions[repo_id]


def preload_models() -> None:
    """No-op on startup: load models on-demand to guarantee instant port binding on Render."""
    logger.info("ONNX models configured for low-memory on-demand loading.")


def _softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=0)


def _predict_onnx(
    ort_inputs: dict[str, np.ndarray],
    repo_id: str,
    label_map: dict[str, str],
    default_label: str,
) -> dict:
    try:
        session = _get_onnx_model(repo_id)
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
    text_for_ai = redact_pii(raw_text).text
    body_redacted = redact_pii(body).text if body else ""

    # Tokenize once for all 3 models
    tokenizer = _get_tokenizer()
    encoded = tokenizer.encode(text_for_ai)
    ort_inputs = {
        "input_ids": np.array([encoded.ids], dtype=np.int64),
        "attention_mask": np.array([encoded.attention_mask], dtype=np.int64),
    }

    category_result = _predict_onnx(
        ort_inputs, DEPT_REPO, id_to_dept, default_label="Customer Experience"
    )
    priority_result = _predict_onnx(
        ort_inputs, PRIORITY_REPO, id_to_priority, default_label="medium"
    )
    sentiment_result = _predict_onnx(
        ort_inputs, SENTIMENT_REPO, id_to_sentiment, default_label="neutral"
    )

    gc.collect()

    return {
        "body_redacted": body_redacted,
        "category": category_result,
        "priority": priority_result,
        "sentiment": sentiment_result,
    }


if __name__ == "__main__":
    result = classify_ticket(
        "Billing issue", "My credit card was charged twice for the monthly plan."
    )
    print("\nClassification Result:\n", json.dumps(result, indent=2))
