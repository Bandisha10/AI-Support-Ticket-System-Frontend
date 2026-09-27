import json
import logging
import os
from pathlib import Path
import httpx
from dotenv import load_dotenv

from backend.app.ai.redact_pii import redact_pii

load_dotenv()
logger = logging.getLogger(__name__)

LOCAL_AI_URL = os.getenv("LOCAL_AI_URL")

# Load mappings
MAPPINGS_FILE = Path(__file__).parent / "label_mappings.json"
id_to_dept: dict[str, str] = {}
id_to_priority: dict[str, str] = {}
id_to_sentiment: dict[str, str] = {}

if MAPPINGS_FILE.exists():
    try:
        with open(MAPPINGS_FILE, encoding="utf-8") as f:
            mappings = json.load(f)
        id_to_dept = {f"LABEL_{v}": k for k, v in mappings.get("department", {}).items()}
        id_to_dept.update({str(v): k for k, v in mappings.get("department", {}).items()})

        id_to_priority = {f"LABEL_{v}": k for k, v in mappings.get("priority", {}).items()}
        id_to_priority.update({str(v): k for k, v in mappings.get("priority", {}).items()})

        id_to_sentiment = {f"LABEL_{v}": k for k, v in mappings.get("sentiment", {}).items()}
        id_to_sentiment.update({str(v): k for k, v in mappings.get("sentiment", {}).items()})
    except Exception as exc:
        logger.warning("Could not load label mappings: %s", exc)


def preload_models() -> None:
    logger.info("AI Service target endpoint: %s", LOCAL_AI_URL or "Default Fallback")


def classify_ticket(subject: str, body: str) -> dict:
    raw_text = f"{subject}. {body}" if subject else body
    redacted = redact_pii(raw_text)

    # 1. Forward request to local machine via tunnel
    if LOCAL_AI_URL:
        try:
            headers = {"bypass-tunnel-reminder": "true"}
            with httpx.Client(timeout=10.0) as client:
                res = client.post(
                    f"{LOCAL_AI_URL.rstrip('/')}/classify",
                    json={"text": redacted.text},
                    headers=headers,
                )
                if res.status_code == 200:
                    data = res.json()
                    cat_raw = data["category"]["raw_label"]
                    prio_raw = data["priority"]["raw_label"]
                    sent_raw = data["sentiment"]["raw_label"]

                    return {
                        "body_redacted": redacted.text,
                        "category": {
                            "label": id_to_dept.get(cat_raw, "Customer Experience"),
                            "confidence": data["category"]["score"],
                            "needs_human_review": data["category"]["score"] < 0.5,
                        },
                        "priority": {
                            "label": id_to_priority.get(prio_raw, "medium"),
                            "confidence": data["priority"]["score"],
                            "needs_human_review": data["priority"]["score"] < 0.5,
                        },
                        "sentiment": {
                            "label": id_to_sentiment.get(sent_raw, "neutral"),
                            "confidence": data["sentiment"]["score"],
                            "needs_human_review": data["sentiment"]["score"] < 0.5,
                        },
                    }
        except Exception as exc:
            logger.warning("Local AI Tunnel unreachable (%s). Using fallback.", exc)

    # 2. Render Fallback (if your PC is asleep/tunnel closed)
    return {
        "body_redacted": redacted.text,
        "category": {"label": "Customer Experience", "confidence": 0.5, "needs_human_review": True},
        "priority": {"label": "medium", "confidence": 0.5, "needs_human_review": True},
        "sentiment": {"label": "neutral", "confidence": 0.5, "needs_human_review": True},
    }


if __name__ == "__main__":
    result = classify_ticket("Billing issue", "My credit card was charged twice for the monthly plan.")
    print("\nClassification Result:\n", json.dumps(result, indent=2))