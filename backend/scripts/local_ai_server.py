"""
Local AI Worker - Runs on your PC with full RAM.
Loads the 3 fine-tuned DistilBERT models and serves predictions over HTTP.
"""
import os
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from transformers import pipeline

load_dotenv()

app = FastAPI(title="Deskwise Local AI Worker")

DEPT_REPO = "pratik14212/deskwise-departments"
PRIORITY_REPO = "pratik14212/deskwise-priorities"
SENTIMENT_REPO = "pratik14212/deskwise-sentiments"

token = os.getenv("HF_TOKEN") or None

print("Loading local models into memory...")
dept_pipe = pipeline("text-classification", model=DEPT_REPO, token=token)
priority_pipe = pipeline("text-classification", model=PRIORITY_REPO, token=token)
sentiment_pipe = pipeline("text-classification", model=SENTIMENT_REPO, token=token)
print("All 3 models loaded successfully!")

class ClassificationRequest(BaseModel):
    text: str

@app.post("/classify")
def classify(req: ClassificationRequest):
    dept_res = dept_pipe(req.text, truncation=True)[0]
    prio_res = priority_pipe(req.text, truncation=True)[0]
    sent_res = sentiment_pipe(req.text, truncation=True)[0]

    return {
        "category": {"raw_label": dept_res["label"], "score": round(dept_res["score"], 3)},
        "priority": {"raw_label": prio_res["label"], "score": round(prio_res["score"], 3)},
        "sentiment": {"raw_label": sent_res["label"], "score": round(sent_res["score"], 3)},
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
