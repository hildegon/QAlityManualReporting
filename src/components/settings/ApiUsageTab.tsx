import { useEffect, useState } from "react";

import { useApiUsage } from "@/services/queries";
import type { ServiceUsageSnapshot } from "@/types";
import { Spinner } from "@/components/ui/spinner";

// ── Known rate-limit information ─────────────────────────────────────────────

interface ServiceInfo {
  title: string;
  description: string;
  knownLimits: string[];
}

const SERVICE_INFO: Record<"jira" | "xray" | "confluence", ServiceInfo> = {
  jira: {
    title: "Jira Cloud",
    description:
      "Basic auth (API token). QAlity uses personal API tokens which are exempt from the " +
      "points-based quota (65k pts/hr) that affects OAuth/Connect apps.",
    knownLimits: [
      "Burst: ~100 req/s for GET/POST, ~50 req/s for PUT/DELETE (per tenant)",
      "Concurrent: max 10 long-running requests at a time",
      "API token auth is exempt from the points-based hourly quota",
    ],
  },
  xray: {
    title: "Xray Cloud",
    description:
      "OAuth2 Bearer token (client credentials). Xray rate limits are undocumented " +
      "— limits are only visible via 429 responses. Headers appear only during throttling.",
    knownLimits: [
      "Rate limits are undocumented (no official published numbers)",
      "Rate-limit headers only sent on 429 responses",
      "Auto-retry with backoff (max 10 retries on 429)",
    ],
  },
  confluence: {
    title: "Confluence Cloud",
    description: "Shares Jira's authentication credentials and burst limits.",
    knownLimits: [
      "Same burst limits as Jira (~100 req/s GET/POST)",
      "Same API token exemption from points-based quota",
    ],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function usagePercent(usage: ServiceUsageSnapshot): number | null {
  if (usage.last_limit != null && usage.last_remaining != null) {
    const used = usage.last_limit - usage.last_remaining;
    return Math.min(100, Math.round((used / usage.last_limit) * 100));
  }
  return null;
}

function gaugeColor(pct: number): string {
  if (pct >= 85) return "text-red-500";
  if (pct >= 60) return "text-amber-500";
  return "text-emerald-500";
}

function gaugeTrackColor(pct: number): string {
  if (pct >= 85) return "stroke-red-100 dark:stroke-red-950";
  if (pct >= 60) return "stroke-amber-100 dark:stroke-amber-950";
  return "stroke-emerald-100 dark:stroke-emerald-950";
}

function gaugeArcColor(pct: number): string {
  if (pct >= 85) return "stroke-red-500";
  if (pct >= 60) return "stroke-amber-500";
  return "stroke-emerald-500";
}

function formatResetTimer(resetMs: number | null): string {
  if (resetMs == null) return "—";
  const remaining = Math.max(0, resetMs - Date.now());
  if (remaining === 0) return "Expired";
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1_000);
  return `${mins}m ${secs}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatTimeAgo(ms: number | null): string {
  if (ms == null) return "Never";
  const ago = Date.now() - ms;
  if (ago < 60_000) return "Just now";
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)}m ago`;
  return `${Math.floor(ago / 3_600_000)}h ago`;
}

/** Return ms until the next UTC hour boundary. */
function msUntilNextHour(): number {
  const now = Date.now();
  const msPerHour = 3_600_000;
  const nextHour = Math.ceil(now / msPerHour) * msPerHour;
  return Math.max(0, nextHour - now);
}

// ── Countdown Timer ──────────────────────────────────────────────────────────

function useCountdown() {
  const [remaining, setRemaining] = useState(msUntilNextHour());

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilNextHour()), 1_000);
    return () => clearInterval(id);
  }, []);

  return remaining;
}

function ResetCountdown() {
  const remaining = useCountdown();

  const totalMs = 3_600_000;
  const elapsed = totalMs - remaining;
  const pct = Math.min(100, (elapsed / totalMs) * 100);

  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1_000);

  const r = 44;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 100 100" className="h-24 w-24">
        {/* background track */}
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="6"
          className="stroke-slate-100 dark:stroke-slate-800"
        />
        {/* elapsed arc */}
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ * 0.25}
          className="stroke-indigo-500 dark:stroke-indigo-400"
          style={{ transition: "stroke-dasharray 1s linear" }}
        />
        {/* time text */}
        <text
          x="50"
          y="46"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-current text-slate-700 dark:text-slate-200"
          fontSize="16"
          fontWeight="bold"
        >
          {mins}:{secs.toString().padStart(2, "0")}
        </text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-current text-slate-400 dark:text-slate-500"
          fontSize="8"
        >
          until reset
        </text>
      </svg>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">Window resets each UTC hour</p>
    </div>
  );
}

// ── Gauge SVG ────────────────────────────────────────────────────────────────

function Gauge({ pct }: { pct: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;

  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28">
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="10"
        className={gaugeTrackColor(pct)}
      />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25}
        className={gaugeArcColor(pct)}
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
      <text
        x="60"
        y="60"
        textAnchor="middle"
        dominantBaseline="central"
        className={`fill-current text-lg font-bold ${gaugeColor(pct)}`}
        fontSize="22"
      >
        {pct}%
      </text>
    </svg>
  );
}

// ── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({
  info,
  usage,
}: {
  info: ServiceInfo;
  usage: ServiceUsageSnapshot;
}) {
  const pct = usagePercent(usage);
  const hasHeaders = usage.last_limit != null;
  const hasThrottled = usage.rate_limit_hits > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {info.title}
        </h3>
        {hasThrottled && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            ⚠ {usage.rate_limit_hits} throttled
          </span>
        )}
      </div>

      <div className="flex items-start gap-6">
        {/* Gauge or call count circle */}
        <div className="shrink-0">
          {pct != null ? (
            <Gauge pct={pct} />
          ) : (
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border-4 border-dashed border-slate-200 dark:border-slate-700">
              <span className="text-2xl font-bold text-slate-600 dark:text-slate-300">
                {formatNumber(usage.calls_this_hour)}
              </span>
              <span className="text-[10px] text-slate-400">this hour</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* Session stats */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Session
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <Stat label="This hour" value={formatNumber(usage.calls_this_hour)} />
              <Stat label="This session" value={formatNumber(usage.calls_total)} />
              {hasHeaders && (
                <>
                  <Stat
                    label="Remaining"
                    value={formatNumber(usage.last_remaining!)}
                    {...(pct != null ? { className: gaugeColor(pct) } : {})}
                  />
                  <Stat label="Limit" value={formatNumber(usage.last_limit!)} />
                  <Stat label="Resets in" value={formatResetTimer(usage.last_reset_ms)} />
                </>
              )}
              {hasThrottled && (
                <Stat
                  label="Last throttled"
                  value={formatTimeAgo(usage.last_rate_limited_at)}
                  className="text-amber-600 dark:text-amber-400"
                />
              )}
            </div>
          </div>

          {/* Per-window stats (persisted, resets each hour) */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              This window (persisted)
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <Stat label="Total calls" value={formatNumber(usage.calls_all_time)} />
              <Stat
                label="Times throttled"
                value={formatNumber(usage.rate_limit_hits_all_time)}
                {...(usage.rate_limit_hits_all_time > 0
                  ? { className: "text-amber-600 dark:text-amber-400" }
                  : {})}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Known limits */}
      <details className="mt-3 text-[11px]">
        <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
          Known limits & notes
        </summary>
        <div className="mt-1.5 space-y-1 pl-3">
          <p className="leading-relaxed text-slate-400 dark:text-slate-500">{info.description}</p>
          <ul className="list-disc space-y-0.5 pl-3 text-slate-400 dark:text-slate-500">
            {info.knownLimits.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>
      <span className={`font-semibold ${className ?? "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ApiUsageTab() {
  const { data, isLoading } = useApiUsage();

  if (isLoading || !data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Countdown timer + description */}
      <div className="flex items-start gap-5">
        <ResetCountdown />
        <p className="flex-1 pt-1 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          Tracks API calls in real time. All counters reset at the top of each UTC hour.
          Session counters also reset on app restart. Window counters persist across restarts
          within the same hour. The gauge reflects live rate-limit headers when the API provides
          them.
        </p>
      </div>

      <ServiceCard info={SERVICE_INFO.jira} usage={data.jira} />
      <ServiceCard info={SERVICE_INFO.xray} usage={data.xray} />
      <ServiceCard info={SERVICE_INFO.confluence} usage={data.confluence} />
    </div>
  );
}
