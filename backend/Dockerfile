FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Photos, the SQLite file and the voice cache live in /app/data; mount a volume there to keep them
# (on Railway: add a Volume in the dashboard, since Railway rejects the VOLUME instruction)

EXPOSE 8000

# Hosts like Railway and Fly set $PORT; one worker, because the live stream and agent loop live in memory
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips="*"
