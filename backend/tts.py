"""Text to speech for the plant's voice, via ElevenLabs.

Audio is streamed to the browser as ElevenLabs produces it, so playback starts before the whole clip
exists. Every finished clip is also saved under TTS_CACHE_DIR, keyed by voice + model + text, so lines
that repeat (mood lines, meter explanations) only cost ElevenLabs credits the first time.
"""
import hashlib
import os

import httpx

import settings

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
OUTPUT_FORMAT = "mp3_44100_128"


class TTSError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def cache_path(text):
    key = f"{settings.ELEVENLABS_VOICE_ID}|{settings.ELEVENLABS_MODEL}|{OUTPUT_FORMAT}|{text}"
    return settings.TTS_CACHE_DIR / f"{hashlib.sha256(key.encode()).hexdigest()}.mp3"


async def open_stream(text):
    """Start an ElevenLabs request. Returns an async iterator of MP3 chunks.

    Upstream errors are raised here, before any audio is sent, so the caller can still return a clean
    HTTP error. The clip is written to the cache only if it streams to the end.
    """
    if not settings.ELEVENLABS_API_KEY or not settings.ELEVENLABS_VOICE_ID:
        raise TTSError(500, "ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set on the server (backend/.env)")

    client = httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10))
    request = client.build_request(
        "POST",
        ELEVENLABS_URL.format(voice_id=settings.ELEVENLABS_VOICE_ID),
        params={"output_format": OUTPUT_FORMAT},
        headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
        json={"text": text, "model_id": settings.ELEVENLABS_MODEL},
    )
    try:
        response = await client.send(request, stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        raise TTSError(502, f"Couldn't reach ElevenLabs: {e}") from e

    if response.status_code != 200:
        body = (await response.aread()).decode(errors="replace")[:300]
        await response.aclose()
        await client.aclose()
        raise TTSError(502, f"ElevenLabs returned {response.status_code}: {body}")

    async def chunks():
        path = cache_path(text)
        tmp = path.with_suffix(f".{os.getpid()}.part")
        complete = False
        try:
            with open(tmp, "wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)
                    yield chunk
            complete = True
        finally:
            await response.aclose()
            await client.aclose()
            if complete:
                os.replace(tmp, path)
            else:
                tmp.unlink(missing_ok=True)  # listener left early or ElevenLabs failed mid-clip

    return chunks()
