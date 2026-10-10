import { useEffect, useState } from "react";

/** Calls `fn` now and every `ms` milliseconds. Returns { data, error }; keeps the last good data on errors. */
export default function usePoll(fn, ms) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fn()
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e) => alive && setError(e));
    tick();
    const id = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fn, ms]);

  return { data, error };
}
