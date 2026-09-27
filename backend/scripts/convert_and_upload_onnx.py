"""
One-time script to:
1. Download your 3 fine-tuned DistilBERT models.
2. Export and quantize them to INT8 ONNX (shrinking from 268 MB to ~64 MB each).
3. Upload `model_quantized.onnx` directly into your existing Hugging Face model repositories.
"""
import os
import warnings
from pathlib import Path

# Suppress harmless tracer warnings during export
warnings.filterwarnings("ignore")
os.environ["PYTHONIOENCODING"] = "utf-8"

import torch
from dotenv import load_dotenv
from huggingface_hub import HfApi
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModelForSequenceClassification, AutoTokenizer

load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError("HF_TOKEN not found in .env. Please provide a write-enabled HF token.")

api = HfApi(token=HF_TOKEN)

MODELS = [
    "pratik14212/deskwise-departments",
    "pratik14212/deskwise-priorities",
    "pratik14212/deskwise-sentiments",
]

output_dir = Path("./onnx_exports")
output_dir.mkdir(exist_ok=True)

for repo_id in MODELS:
    model_name = repo_id.split("/")[-1]
    print(f"\n==========================================")
    print(f"Processing: {repo_id}")
    print(f"==========================================")

    # 1. Load PyTorch model & tokenizer
    print("1. Loading PyTorch model from Hugging Face...")
    tokenizer = AutoTokenizer.from_pretrained(repo_id, token=HF_TOKEN)
    model = AutoModelForSequenceClassification.from_pretrained(repo_id, token=HF_TOKEN)
    model.eval()

    raw_onnx_path = output_dir / f"{model_name}.onnx"
    quantized_onnx_path = output_dir / f"{model_name}_quantized.onnx"

    # 2. Export to standard ONNX (using stable TorchScript engine)
    print("2. Exporting to ONNX...")
    dummy_input = tokenizer("Sample ticket text for tracing", return_tensors="pt")

    torch.onnx.export(
        model,
        (dummy_input["input_ids"], dummy_input["attention_mask"]),
        str(raw_onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch"},
        },
        opset_version=14,
        do_constant_folding=True,
        dynamo=False,
    )

    # 3. Quantize to INT8 (Shrinks from 268 MB -> ~64 MB)
    print("3. Quantizing to INT8 (reducing memory footprint by 75%)...")
    quantize_dynamic(
        model_input=str(raw_onnx_path),
        model_output=str(quantized_onnx_path),
        weight_type=QuantType.QInt8,
        extra_options={"DisableShapeInference": True},
    )
    size_mb = quantized_onnx_path.stat().st_size / (1024 * 1024)
    print(f"   -> Quantized file size: {size_mb:.2f} MB")

    # 4. Upload directly to your Hugging Face repository
    print(f"4. Uploading 'model_quantized.onnx' to {repo_id}...")
    api.upload_file(
        path_or_fileobj=str(quantized_onnx_path),
        path_in_repo="model_quantized.onnx",
        repo_id=repo_id,
        commit_message="Add INT8 quantized ONNX model for low-memory CPU inference",
    )
    print(f"   -> Successfully uploaded to Hugging Face: {repo_id}!")

    # Clean up local temporary files
    if raw_onnx_path.exists():
        raw_onnx_path.unlink()
    if quantized_onnx_path.exists():
        quantized_onnx_path.unlink()

# Remove temporary directory
if output_dir.exists():
    try:
        output_dir.rmdir()
    except Exception:
        pass

print("\nAll 3 models have been successfully converted and uploaded to your Hugging Face repositories!")
