/**
 * Shared status-based chart components used by VersionsPage and CoveragePage.
 *
 * Exports:
 *  - StatusSlice / Slice          — types
 *  - STATUS_PALETTE               — canonical colour/icon mapping
 *  - findSlice / buildSlicesFromCounts / buildSlicesFromTests — helpers
 *  - DonutChart                   — SVG ring chart
 *  - StatCard                     — coloured stat tile
 *  - StackedBar                   — horizontal percentage bar + legend
 *  - MiniStackedBar               — compact inline bar (no legend)
 */
import { CheckCircle2, XCircle, MinusCircle, Clock, Circle } from "lucide-react";
import { cn } from "@/components/ui/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatusSlice {
  key: string;
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  lightBg: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface Slice extends StatusSlice {
  count: number;
  pct: number;
}

// ── Palette ───────────────────────────────────────────────────────────────────

const STATUS_PALETTE: StatusSlice[] = [
  {
    key: "PASS",
    label: "Passed",
    color: "#10b981",
    bgClass: "bg-emerald-500",
    textClass: "text-emerald-600",
    borderClass: "border-emerald-200",
    lightBg: "bg-emerald-50",
    icon: CheckCircle2,
  },
  {
    key: "FAIL",
    label: "Failed",
    color: "#ef4444",
    bgClass: "bg-red-500",
    textClass: "text-red-600",
    borderClass: "border-red-200",
    lightBg: "bg-red-50",
    icon: XCircle,
  },
  {
    key: "BLOCKED",
    label: "Blocked",
    color: "#3b82f6",
    bgClass: "bg-blue-500",
    textClass: "text-blue-600",
    borderClass: "border-blue-200",
    lightBg: "bg-blue-50",
    icon: MinusCircle,
  },
  {
    key: "EXECUTING",
    label: "Executing",
    color: "#eab308",
    bgClass: "bg-yellow-400",
    textClass: "text-yellow-600",
    borderClass: "border-yellow-200",
    lightBg: "bg-yellow-50",
    icon: Clock,
  },
  {
    key: "TODO",
    label: "To Do",
    color: "#94a3b8",
    bgClass: "bg-slate-300",
    textClass: "text-slate-500",
    borderClass: "border-slate-200",
    lightBg: "bg-slate-50",
    icon: Circle,
  },
  {
    key: "N/A",
    label: "N/A",
    color: "#f97316",
    bgClass: "bg-orange-500",
    textClass: "text-orange-600",
    borderClass: "border-orange-200",
    lightBg: "bg-orange-50",
    icon: Circle,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve a raw status name to the nearest palette entry (with fallback). */
export function findSlice(rawName: string): StatusSlice {
  const upper = rawName.toUpperCase();
  const exact = STATUS_PALETTE.find((s) => s.key === upper);
  if (exact) return exact;
  if (upper === "NOT RUN" || upper === "TODO") return STATUS_PALETTE.find((s) => s.key === "TODO")!;
  if (upper === "N/A" || upper === "NA") return STATUS_PALETTE.find((s) => s.key === "N/A")!;
  if (upper.startsWith("PASS")) return STATUS_PALETTE[0]!;
  if (upper.startsWith("FAIL")) return STATUS_PALETTE[1]!;
  return {
    key: upper,
    label: rawName,
    color: "#64748b",
    bgClass: "bg-slate-400",
    textClass: "text-slate-600",
    borderClass: "border-slate-200",
    lightBg: "bg-slate-50",
    icon: Circle,
  };
}

/**
 * Build slices from a `{ STATUS: count }` map (used by VersionsPage).
 * Merges aliases (e.g. PASSED → PASS) before computing percentages.
 */
export function buildSlicesFromCounts(counts: Record<string, number>, total: number): Slice[] {
  if (total === 0) return [];

  const merged: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    const slice = findSlice(k);
    merged[slice.key] = (merged[slice.key] ?? 0) + v;
  }

  const knownOrder = STATUS_PALETTE.map((s) => s.key);
  const allKeys = [
    ...knownOrder.filter((k) => merged[k]),
    ...Object.keys(merged)
      .filter((k) => !knownOrder.includes(k) && merged[k])
      .sort(),
  ];

  return allKeys.map((k) => {
    const count = merged[k] ?? 0;
    return { ...findSlice(k), count, pct: total > 0 ? count / total : 0 };
  });
}

/**
 * Build slices directly from an array of items that each have a `latest_status`
 * field (used by CoveragePage). Items with no status are counted as "TODO".
 */
export function buildSlicesFromTests(
  tests: Array<{ latest_status?: { name: string } | null }>,
): Slice[] {
  if (tests.length === 0) return [];

  const merged: Record<string, number> = {};
  for (const t of tests) {
    const name = t.latest_status?.name ?? "TODO";
    const sl = findSlice(name);
    merged[sl.key] = (merged[sl.key] ?? 0) + 1;
  }

  const total = tests.length;
  const knownOrder = STATUS_PALETTE.map((s) => s.key);
  const allKeys = [
    ...knownOrder.filter((k) => merged[k]),
    ...Object.keys(merged)
      .filter((k) => !knownOrder.includes(k) && merged[k])
      .sort(),
  ];

  return allKeys.map((k) => {
    const count = merged[k] ?? 0;
    return { ...findSlice(k), count, pct: total > 0 ? count / total : 0 };
  });
}

// ── SVG Donut chart ───────────────────────────────────────────────────────────

const DONUT_SIZE = 148;
const R = 54;
const HOLE_R = 36;
const CX = DONUT_SIZE / 2;
const CY = DONUT_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 1.5;

interface DonutChartProps {
  slices: Slice[];
  total: number;
  /** Text shown inside the hole below the count. Defaults to "test runs". */
  label?: string;
  /** When true, shows a small spinner instead of the count (data still loading). */
  isLoading?: boolean;
}

export function DonutChart({
  slices,
  total,
  label = "test runs",
  isLoading = false,
}: DonutChartProps) {
  let cumPct = 0;
  return (
    <div className="shrink-0">
      <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-700"
          strokeWidth={R - HOLE_R}
        />
        {slices.map((sl) => {
          const dashLen = Math.max(0, sl.pct * CIRCUMFERENCE - GAP);
          const offset = -cumPct * CIRCUMFERENCE;
          cumPct += sl.pct;
          return (
            <circle
              key={sl.key}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={sl.color}
              strokeWidth={R - HOLE_R}
              strokeDasharray={`${dashLen} ${CIRCUMFERENCE}`}
              strokeDashoffset={offset}
              style={{ transform: "rotate(-90deg)", transformOrigin: `${CX}px ${CY}px` }}
            >
              <title>{`${sl.label}: ${sl.count} (${Math.round(sl.pct * 100)}%)`}</title>
            </circle>
          );
        })}
        {isLoading ? (
          <circle
            cx={CX}
            cy={CY - 2}
            r={10}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={2}
            strokeDasharray="32 10"
            style={{
              transformOrigin: `${CX}px ${CY - 2}px`,
              animation: "spin 1s linear infinite",
            }}
          />
        ) : (
          <>
            <text
              x={CX}
              y={CY - 7}
              textAnchor="middle"
              className="fill-slate-900 dark:fill-slate-100"
              style={{ fontSize: 24, fontWeight: 700 }}
            >
              {total}
            </text>
            <text
              x={CX}
              y={CY + 12}
              textAnchor="middle"
              style={{ fontSize: 10, fill: "#94a3b8", fontWeight: 500 }}
            >
              {label}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

export function StatCard({ sl }: { sl: Slice }) {
  const Icon = sl.icon;
  return (
    <div className={cn("rounded-xl border p-3", sl.lightBg, sl.borderClass)}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{sl.label}</span>
        <Icon className={cn("h-3.5 w-3.5", sl.textClass)} />
      </div>
      <p className={cn("text-2xl font-bold", sl.textClass)}>{sl.count}</p>
      <p className="mt-0.5 text-xs text-slate-400">{Math.round(sl.pct * 100)}%</p>
    </div>
  );
}

// ── Stacked bar ───────────────────────────────────────────────────────────────

export function StackedBar({ slices }: { slices: Slice[] }) {
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        {slices.map((sl) => (
          <div
            key={sl.key}
            className={cn("transition-all duration-500", sl.bgClass)}
            style={{ width: `${sl.pct * 100}%` }}
            title={`${sl.label}: ${sl.count} (${Math.round(sl.pct * 100)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {slices.map((sl) => (
          <div
            key={sl.key}
            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", sl.bgClass)} />
            {sl.label} — {sl.count} ({Math.round(sl.pct * 100)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini stacked bar (no legend) ──────────────────────────────────────────────

export function MiniStackedBar({ slices, className }: { slices: Slice[]; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700",
        className,
      )}
    >
      {slices.map((sl) => (
        <div
          key={sl.key}
          className={cn("transition-all duration-500", sl.bgClass)}
          style={{ width: `${sl.pct * 100}%` }}
          title={`${sl.label}: ${sl.count} (${Math.round(sl.pct * 100)}%)`}
        />
      ))}
    </div>
  );
}
