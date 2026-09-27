FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODEL_DIR=/app/backend/app/ai/model_artifacts

WORKDIR /app

# 1. Install curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# 2. Copy root requirements and install CPU-only PyTorch first (saves ~2 GB Docker image size)
# 2. Copy root requirements and install dependencies
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt


# 3. Copy application code
COPY backend ./backend

EXPOSE 8000

# 4. Correct healthcheck endpoint matching backend/app/main.py (/health)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://127.0.0.1:${PORT:-8000}/health || exit 1

# 5. Bind to Render's dynamic $PORT (defaults to 8000 locally)
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log"]
