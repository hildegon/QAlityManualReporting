/**
 * Shared status-based chart components used by VersionsPage and CoveragePage.
 *
 * Exports:
 *  - Slice                        — type (re-exported from status-utils)
 *  - DonutChart                   — SVG ring chart
 *  - StatCard                     — coloured stat tile
 *  - StackedBar                   — horizontal percentage bar + legend
 *  - MiniStackedBar               — compact inline bar (no legend)
 *
 * Helper functions (findSlice, buildSlicesFromCounts, buildSlicesFromTests) and
 * STATUS_PALETTE live in ./status-utils.
 */
import { cn } from "@/components/ui/utils";
import type { Slice } from "./status-utils";

export type { Slice } from "./status-utils";

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
            className="animate-spin"
            style={{ transformOrigin: `${CX}px ${CY - 2}px` }}
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
    <div className={cn("rounded-xl border p-3", sl.lightBg, sl.darkLightBg, sl.borderClass)}>
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
