"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const DEFAULT_INTERVAL_MS = 30_000;

export function ScreenFleetRefresh({ intervalMs = DEFAULT_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const intervalSeconds = Math.max(1, Math.round(intervalMs / 1_000));
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(intervalSeconds);

  const refresh = useCallback(() => {
    setSecondsUntilRefresh(intervalSeconds);
    startTransition(() => router.refresh());
  }, [intervalSeconds, router]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    const countdownTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setSecondsUntilRefresh((seconds) => seconds <= 1 ? intervalSeconds : seconds - 1);
    }, 1_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(countdownTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, intervalSeconds, refresh]);

  return (
    <div className="fleet-refresh">
      <span aria-live="polite">{isPending ? "Updating fleet…" : "Live monitoring"}</span>
      {!isPending ? <span aria-hidden="true">· refreshes in {secondsUntilRefresh}s</span> : null}
      <button className="button button-secondary button-small" type="button" onClick={refresh} disabled={isPending}>
        <RefreshCw size={14} className={isPending ? "is-spinning" : undefined} />
        Refresh now
      </button>
    </div>
  );
}
