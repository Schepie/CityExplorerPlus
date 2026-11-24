import { useEffect, useRef } from 'react';

/** Keeps the mobile screen awake during active turn-by-turn navigation (Android Chrome & iOS Safari 16.4+) */
export function useWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) {
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const requestLock = async () => {
      try {
        if (!cancelled && document.visibilityState === 'visible') {
          sentinelRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock can fail if battery saver is active or tab isn't visible
      }
    };

    requestLock();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, [enabled]);
}
