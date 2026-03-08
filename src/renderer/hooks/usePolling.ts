import { useEffect, useRef, useState } from 'react';
import { POLL_INTERVAL_FOCUSED_MS, POLL_INTERVAL_BLURRED_MS } from '../constants';

function useWindowFocused() {
  const [focused, setFocused] = useState(!document.hidden);

  useEffect(() => {
    const onVisibility = () => setFocused(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return focused;
}

export function usePolling(callback: () => void, enabled = true) {
  const savedCallback = useRef(callback);
  const focused = useWindowFocused();
  const intervalMs = focused ? POLL_INTERVAL_FOCUSED_MS : POLL_INTERVAL_BLURRED_MS;

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    // Run immediately on enable or interval change
    savedCallback.current();

    const id = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
