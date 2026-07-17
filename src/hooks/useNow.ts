import { useEffect, useState } from "react";

// Re-render on an interval so live countdowns stay current.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      intervalMs
    );
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
