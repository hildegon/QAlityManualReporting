import { useEffect, useState } from "react";
import { Clock, WifiOff, X } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";

/** Format a remaining millisecond duration as "Xm Ys" or "Xs". */
function formatRemaining(ms: number): string {
  const totalSecs = Math.max(0, Math.ceil(ms / 1_000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}

/** Format an absolute timestamp as a locale time string. */
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** SVG circular countdown ring. radius=20, stroke=4, so viewBox should be 48x48. */
function CountdownRing({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(1, pct / 100));
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0 -rotate-90">
      {/* Track */}
      <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeWidth="4"
        className="text-amber-200 dark:text-amber-800" />
      {/* Progress */}
      <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${dash.toFixed(2)} ${circ.toFixed(2)}`}
        className="text-amber-500 dark:text-amber-400 transition-[stroke-dasharray] duration-300 ease-linear" />
    </svg>
  );
}

/**
 * Prominent slide-in banner that appears when the Xray / Jira API responds with
 * a 429 Too Many Requests. Shows a live countdown ring, exact resume time, and
 * a draining progress bar. Auto-dismisses when the timer reaches zero.
 */
export function RateLimitBanner() {
  const rateLimitUntil = useUiStore((s) => s.rateLimitUntil);
  const rateLimitStart = useUiStore((s) => s.rateLimitStart);
  const setRateLimit = useUiStore((s) => s.setRateLimit);
  const [remaining, setRemaining] = useState<number>(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (rateLimitUntil === null) {
      setVisible(false);
      return;
    }
    // Trigger slide-in on next frame
    requestAnimationFrame(() => setVisible(true));

    const tick = () => {
      const diff = rateLimitUntil - Date.now();
      if (diff <= 0) {
        setRateLimit(null);
        return;
      }
      setRemaining(diff);
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [rateLimitUntil, setRateLimit]);

  if (rateLimitUntil === null) return null;

  const totalWindow = rateLimitStart !== null ? rateLimitUntil - rateLimitStart : remaining;
  const progressPct =
    totalWindow > 0 ? Math.max(0, Math.min(100, (remaining / totalWindow) * 100)) : 0;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="overflow-hidden border-b border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/60"
      style={{
        maxHeight: visible ? "200px" : "0",
        opacity: visible ? 1 : 0,
        transition: "max-height 0.35s ease, opacity 0.3s ease",
      }}
    >
      <div className="flex items-center gap-4 px-5 py-3">
        {/* Pulsing icon */}
        <div className="relative shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-30 dark:bg-amber-500" />
          <WifiOff className="relative h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </div>

        {/* Message */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            API rate limit reached
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            Too many requests to Xray / Jira. All fetches are paused and will resume automatically.
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            {/* Progress bar */}
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-800">
              <div
                className="h-full rounded-full bg-amber-500 dark:bg-amber-400 transition-[width] duration-300 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {/* Resume time */}
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Clock className="h-3 w-3" />
              Resuming at {formatTime(rateLimitUntil)}
            </span>
          </div>
        </div>

        {/* Countdown ring + time */}
        <div className="relative shrink-0">
          <CountdownRing pct={progressPct} />
          <span
            className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300"
            aria-live="off"
          >
            {formatRemaining(remaining)}
          </span>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => setRateLimit(null)}
          className="shrink-0 rounded-lg p-1.5 text-amber-600 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-800/50"
          aria-label="Dismiss rate-limit notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

