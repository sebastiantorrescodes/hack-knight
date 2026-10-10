import { useEffect, useState } from "react";
import { CameraOff, Video } from "lucide-react";
import { usePlant } from "../PlantContext";
import usePoll from "../usePoll";

const LIVE_WITHIN_S = 30;

/** Live MJPEG feed from the backend. Shows a placeholder while the Pi isn't sending frames. */
export default function PlantCam({ name }) {
  const { api } = usePlant();
  const { data } = usePoll(api.getStreamStatus, 5000);
  const live = data?.last_frame_seconds_ago != null && data.last_frame_seconds_ago < LIVE_WITHIN_S;
  // A fresh signed URL each time the feed comes back reconnects the <img>,
  // since a broken MJPEG connection doesn't retry by itself
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!live) {
      setSrc(null);
      return;
    }
    let alive = true;
    api.streamUrl().then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [live, api]);

  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-3">
      <div className="flex items-center justify-between px-2 pt-1">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-ios-red text-white shadow-sm">
            <Video className="size-[18px]" />
          </span>
          {name} Cam
        </span>
        {live && (
          <span className="flex items-center gap-1.5 rounded-full bg-ios-red px-2.5 py-0.5 text-xs font-bold tracking-wider text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </span>
        )}
      </div>
      <div className="relative flex min-h-60 flex-1 items-center justify-center overflow-hidden rounded-[22px] bg-neutral-900">
        {live && src ? (
          <img src={src} alt={`Live camera of ${name}`} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-neutral-400">
            <span className="flex size-14 items-center justify-center rounded-full bg-white/10">
              <CameraOff className="size-6" />
            </span>
            <span className="font-rounded text-lg font-semibold">The camera is napping…</span>
          </div>
        )}
      </div>
    </section>
  );
}
