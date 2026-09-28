"""
One-time developer script to:
1. Download 3 fine-tuned DistilBERT models from Hugging Face.
2. Export them to ONNX graphs with dynamic batch & sequence axes.
3. Quantize the exported ONNX models to INT8 (shrinking weights from ~268 MB to ~64 MB).
4. Upload `model_quantized.onnx` directly back into the Hugging Face repositories for fast,
   low-memory CPU inference in production.
"""
import os
import warnings
from pathlib import Path

# Suppress harmless tracer warnings during TorchScript/ONNX export
warnings.filterwarnings("ignore")
os.environ["PYTHONIOENCODING"] = "utf-8"

import torch
from dotenv import load_dotenv
from huggingface_hub import HfApi
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# Load local environment variables (.env) to retrieve Hugging Face credentials
load_dotenv()

# Write-enabled Hugging Face access token required for uploading assets
HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError("HF_TOKEN not found in .env. Please provide a write-enabled HF token.")

api = HfApi(token=HF_TOKEN)

# List of Hugging Face repositories for the classification tasks
MODELS = [
    "pratik14212/deskwise-departments",
    "pratik14212/deskwise-priorities",
    "pratik14212/deskwise-sentiments",
]

# Staging directory for local conversion artifacts
output_dir = Path("./onnx_exports")
output_dir.mkdir(exist_ok=True)

for repo_id in MODELS:
    model_name = repo_id.split("/")[-1]
    print(f"\n==========================================")
    print(f"Processing: {repo_id}")
    print(f"==========================================")

    # ---------------------------------------------------------
    # 1. Load PyTorch model & tokenizer
    # ---------------------------------------------------------
    print("1. Loading PyTorch model from Hugging Face...")
    tokenizer = AutoTokenizer.from_pretrained(repo_id, token=HF_TOKEN)
    model = AutoModelForSequenceClassification.from_pretrained(repo_id, token=HF_TOKEN)
    model.eval()

    raw_onnx_path = output_dir / f"{model_name}.onnx"
    quantized_onnx_path = output_dir / f"{model_name}_quantized.onnx"

    # ---------------------------------------------------------
    # 2. Export to standard ONNX (using stable TorchScript engine)
    # ---------------------------------------------------------
    print("2. Exporting to ONNX...")
    # Generate a dummy input tensor for graph tracing
    dummy_input = tokenizer("Sample ticket text for tracing", return_tensors="pt")

    torch.onnx.export(
        model,
        (dummy_input["input_ids"], dummy_input["attention_mask"]),
        str(raw_onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        # Enable dynamic dimensions so inference can process variable batch sizes and text lengths
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch"},
        },
        opset_version=14,
        do_constant_folding=True,
        dynamo=False,
    )

    # ---------------------------------------------------------
    # 3. Quantize to INT8 (Shrinks model from 268 MB -> ~64 MB)
    # ---------------------------------------------------------
    print("3. Quantizing to INT8 (reducing memory footprint by 75%)...")
    quantize_dynamic(
        model_input=str(raw_onnx_path),
        model_output=str(quantized_onnx_path),
        weight_type=QuantType.QInt8,
        extra_options={"DisableShapeInference": True},
    )
    size_mb = quantized_onnx_path.stat().st_size / (1024 * 1024)
    print(f"   -> Quantized file size: {size_mb:.2f} MB")

    # ---------------------------------------------------------
    # 4. Upload directly to Hugging Face repository
    # ---------------------------------------------------------
    print(f"4. Uploading 'model_quantized.onnx' to {repo_id}...")
    api.upload_file(
        path_or_fileobj=str(quantized_onnx_path),
        path_in_repo="model_quantized.onnx",
        repo_id=repo_id,
        commit_message="Add INT8 quantized ONNX model for low-memory CPU inference",
    )
    print(f"   -> Successfully uploaded to Hugging Face: {repo_id}!")

    # Clean up intermediate files on disk to free up workspace space
    if raw_onnx_path.exists():
        raw_onnx_path.unlink()
    if quantized_onnx_path.exists():
        quantized_onnx_path.unlink()

# Clean up empty staging folder
if output_dir.exists():
    try:
        output_dir.rmdir()
    except Exception:
        pass

print("\nAll 3 models have been successfully converted and uploaded to your Hugging Face repositories!")
