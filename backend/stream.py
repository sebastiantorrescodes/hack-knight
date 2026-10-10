"""Live camera relay.

The Pi POSTs JPEG frames to /frames; only the newest frame per plant is kept, in memory. Browsers watch
/stream, an MJPEG response (multipart/x-mixed-replace) that a plain <img> tag plays as live video.
The /frames response tells the Pi how many people are watching so it can slow down when nobody is.
"""
import asyncio
import time

BOUNDARY = "frame"


class Channel:
    def __init__(self):
        self.frame = None        # newest JPEG bytes
        self.frame_time = 0.0
        self.seq = 0             # bumps on every new frame
        self.viewers = 0
        self._new_frame = asyncio.Condition()

    async def publish(self, frame):
        async with self._new_frame:
            self.frame, self.frame_time = frame, time.time()
            self.seq += 1
            self._new_frame.notify_all()

    async def next_frame(self, last_seq, timeout):
        """Wait for a frame newer than last_seq. Raises asyncio.TimeoutError if none arrives in time."""
        async with self._new_frame:
            await asyncio.wait_for(self._new_frame.wait_for(lambda: self.seq != last_seq), timeout)
            return self.seq, self.frame

    def status(self):
        return {
            "viewers": self.viewers,
            "last_frame_seconds_ago": round(time.time() - self.frame_time, 1) if self.frame else None,
        }


_channels = {}


def channel(plant_id):
    if plant_id not in _channels:
        _channels[plant_id] = Channel()
    return _channels[plant_id]


def _part(frame):
    head = f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(frame)}\r\n\r\n".encode()
    return head + frame + b"\r\n"


async def mjpeg(plant_id):
    """Async generator for StreamingResponse. Runs until the browser disconnects."""
    ch = channel(plant_id)
    ch.viewers += 1
    try:
        seq = ch.seq
        if ch.frame:
            yield _part(ch.frame)  # show the last frame right away instead of a blank image
        while True:
            try:
                seq, frame = await ch.next_frame(seq, timeout=10)
            except asyncio.TimeoutError:
                if ch.frame:
                    yield _part(ch.frame)  # keep idle connections from being dropped
                continue
            yield _part(frame)
    finally:
        ch.viewers -= 1
