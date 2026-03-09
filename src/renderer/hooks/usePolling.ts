import { useEffect, useRef, useState } from 'react';
import { POLL_INTERVAL_FOCUSED_MS, POLL_INTERVAL_BLURRED_MS } from '../constants';

function useWindowFocused() {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const api = (window as any).electronAPI;
    const offFocus = api.onWindowFocus(() => setFocused(true));
    const offBlur = api.onWindowBlur(() => setFocused(false));
    return () => { offFocus(); offBlur(); };
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
