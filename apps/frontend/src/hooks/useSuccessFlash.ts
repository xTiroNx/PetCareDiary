import { useCallback, useEffect, useRef, useState } from "react";

export function useSuccessFlash(duration = 1800) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const show = useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setVisible(true);
    timeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      timeoutRef.current = null;
    }, duration);
  }, [duration]);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  return { visible, show };
}
