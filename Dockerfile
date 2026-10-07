FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=1 TOKENIZERS_PARALLELISM=false HF_HOME=/srv/.runtime/huggingface
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-tha libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.lock ./
# Use CPU wheels; the app does not require CUDA.
RUN python -m pip install 'torch==2.7.0+cpu' --index-url https://download.pytorch.org/whl/cpu \
    && python -m pip install -r requirements.lock
COPY backend ./backend
COPY ml ./ml
COPY shared ./shared
COPY scripts ./scripts
RUN mkdir -p .runtime && chmod +x scripts/docker_backend.sh
EXPOSE 8000
CMD ["bash", "scripts/docker_backend.sh"]
