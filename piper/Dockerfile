# Local Piper TTS sidecar for Mena AI VTuber
# Python 3.11: tltk (Thai phonemizer) pins scikit-learn~=1.2 which only has
# wheels for <=3.11 (would otherwise compile from source on 3.12+).
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Pre-bake the Thai voice so runtime needs no network.
# -f fails the build on a 404/502/rate-limit page instead of baking garbage.
RUN mkdir -p /models && \
    curl -fsSL -o /models/th_TH-tsync2-medium.onnx \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx" && \
    curl -fsSL -o /models/th_TH-tsync2-medium.onnx.json \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx.json"

COPY serve.py /app/serve.py

EXPOSE 8888

CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8888", "--workers", "1"]