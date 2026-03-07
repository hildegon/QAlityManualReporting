import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";

/** Format a remaining millisecond duration as "Xm Ys" or "Xs". */
function formatRemaining(ms: number): string {
  const totalSecs = Math.max(0, Math.ceil(ms / 1_000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}

/**
 * Sticky top-of-page banner that appears when the Xray / Jira API responds with
 * a 429 Too Many Requests. Shows a live countdown until the rate-limit lifts and
 * auto-dismisses when the timer reaches zero.
 */
export function RateLimitBanner() {
  const rateLimitUntil = useUiStore((s) => s.rateLimitUntil);
  const setRateLimit = useUiStore((s) => s.setRateLimit);
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (rateLimitUntil === null) return;

    const tick = () => {
      const diff = rateLimitUntil - Date.now();
      if (diff <= 0) {
        setRateLimit(null);
        return;
      }
      setRemaining(diff);
    };

    tick(); // run immediately to avoid a one-second blank flash
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [rateLimitUntil, setRateLimit]);

  if (rateLimitUntil === null) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
      <span className="flex-1">
        API rate limit reached. Requests will resume automatically in{" "}
        <span className="font-semibold">{formatRemaining(remaining)}</span>
      </span>
      <button
        onClick={() => setRateLimit(null)}
        className="rounded px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
        aria-label="Dismiss rate-limit notice"
      >
        Dismiss
      </button>
    </div>
  );
}
