import { CheckCircle2, XCircle, MinusCircle, Clock, Circle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatusSlice {
  key: string;
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  lightBg: string;
  /** Dark-mode equivalent of lightBg (Tailwind dark: class). */
  darkLightBg: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface Slice extends StatusSlice {
  count: number;
  pct: number;
}

// ── Palette ───────────────────────────────────────────────────────────────────

export const STATUS_PALETTE: StatusSlice[] = [
  {
    key: "PASS",
    label: "Passed",
    color: "#10b981",
    bgClass: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
    borderClass: "border-emerald-200 dark:border-emerald-900",
    lightBg: "bg-emerald-50",
    darkLightBg: "dark:bg-emerald-950",
    icon: CheckCircle2,
  },
  {
    key: "FAIL",
    label: "Failed",
    color: "#ef4444",
    bgClass: "bg-red-500",
    textClass: "text-red-600 dark:text-red-400",
    borderClass: "border-red-200 dark:border-red-900",
    lightBg: "bg-red-50",
    darkLightBg: "dark:bg-red-950",
    icon: XCircle,
  },
  {
    key: "BLOCKED",
    label: "Blocked",
    color: "#3b82f6",
    bgClass: "bg-blue-500",
    textClass: "text-blue-600 dark:text-blue-400",
    borderClass: "border-blue-200 dark:border-blue-900",
    lightBg: "bg-blue-50",
    darkLightBg: "dark:bg-blue-950",
    icon: MinusCircle,
  },
  {
    key: "EXECUTING",
    label: "Executing",
    color: "#eab308",
    bgClass: "bg-yellow-400",
    textClass: "text-yellow-600 dark:text-yellow-400",
    borderClass: "border-yellow-200 dark:border-yellow-900",
    lightBg: "bg-yellow-50",
    darkLightBg: "dark:bg-yellow-950",
    icon: Clock,
  },
  {
    key: "TODO",
    label: "To Do",
    color: "#94a3b8",
    bgClass: "bg-slate-300",
    textClass: "text-slate-500 dark:text-slate-400",
    borderClass: "border-slate-200 dark:border-slate-600",
    lightBg: "bg-slate-50",
    darkLightBg: "dark:bg-slate-700",
    icon: Circle,
  },
  {
    key: "N/A",
    label: "N/A",
    color: "#f97316",
    bgClass: "bg-orange-500",
    textClass: "text-orange-600 dark:text-orange-400",
    borderClass: "border-orange-200 dark:border-orange-900",
    lightBg: "bg-orange-50",
    darkLightBg: "dark:bg-orange-950",
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
    textClass: "text-slate-600 dark:text-slate-400",
    borderClass: "border-slate-200 dark:border-slate-600",
    lightBg: "bg-slate-50",
    darkLightBg: "dark:bg-slate-700",
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
