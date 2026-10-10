import { useEffect, useState } from "react";
import { getStreamStatus, streamUrl } from "../api";
import usePoll from "../usePoll";

const LIVE_WITHIN_S = 30;

/** Live MJPEG feed from the backend. Shows a placeholder while the Pi isn't sending frames. */
export default function PlantCam({ name }) {
  const { data } = usePoll(getStreamStatus, 5000);
  const live = data?.last_frame_seconds_ago != null && data.last_frame_seconds_ago < LIVE_WITHIN_S;
  // Reconnect the <img> when the feed comes back, since a broken MJPEG connection doesn't retry by itself
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (live) setAttempt((a) => a + 1);
  }, [live]);

  return (
    <section className="card cam">
      <div className="cam-header">
        <span>📺 {name} Cam</span>
        {live && <span className="live-dot">LIVE</span>}
      </div>
      <div className="cam-screen">
        {live ? (
          <img key={attempt} src={streamUrl()} alt={`Live camera of ${name}`} />
        ) : (
          <div className="cam-off">
            <span className="cam-off-emoji">📷💤</span>
            <span>The camera is napping…</span>
          </div>
        )}
      </div>
    </section>
  );
}
