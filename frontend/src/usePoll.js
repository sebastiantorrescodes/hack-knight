import { useEffect, useState } from "react";

/**
 * Calls `fn` now and every `ms` milliseconds; restarts when `fn` or `ms` changes.
 * Returns { data, error, loading }. Keeps the last good data while refetching or on errors,
 * so charts dim instead of flashing empty.
 */
export default function usePoll(fn, ms) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      setLoading(true);
      fn()
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e) => alive && setError(e))
        .finally(() => alive && setLoading(false));
    };
    tick();
    const id = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fn, ms]);

  return { data, error, loading };
}
