import { useEffect, useRef } from 'react';

interface UsePollingOptions {
  callback: () => Promise<void> | void;
  intervalMs: number;
  enabled: boolean;
}

/**
 * Polling hook that:
 * - Runs callback at specified interval when enabled
 * - Runs immediately once when enabled toggles to true
 * - Pauses when document is hidden
 * - Clears interval on unmount/disable
 * - Silently handles errors (logs once with backoff)
 */
export function usePolling({ callback, intervalMs, enabled }: UsePollingOptions): void {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const errorLoggedRef = useRef(false);
  const lastErrorTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Run immediately when enabled
    const runCallback = async () => {
      // Skip if document is hidden
      if (document.visibilityState === 'hidden') {
        return;
      }

      try {
        await callback();
        // Reset error tracking on success
        errorLoggedRef.current = false;
        lastErrorTimeRef.current = 0;
      } catch (error) {
        // Log error only once, or after backoff (30s)
        const now = Date.now();
        const timeSinceLastError = now - lastErrorTimeRef.current;
        
        if (!errorLoggedRef.current || timeSinceLastError > 30000) {
          console.warn('[Polling] Error during poll:', error);
          errorLoggedRef.current = true;
          lastErrorTimeRef.current = now;
        }
      }
    };

    // Run immediately
    runCallback();

    // Set up interval
    intervalRef.current = setInterval(() => {
      runCallback();
    }, intervalMs);

    // Listen to visibility changes to pause/resume
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        // Resume: run immediately when becoming visible
        runCallback();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [callback, intervalMs, enabled]);
}
