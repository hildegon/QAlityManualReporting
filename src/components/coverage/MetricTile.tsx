import { cn } from "@/components/ui/utils";

type TileColor = "slate" | "red" | "emerald" | "amber" | "blue";

const tileColors: Record<TileColor, { value: string; sub: string; bg: string; border: string }> = {
  slate: {
    value: "text-slate-700 dark:text-slate-200",
    sub: "text-slate-400 dark:text-slate-500",
    bg: "bg-slate-50 dark:bg-slate-700",
    border: "border-slate-200 dark:border-slate-600",
  },
  red: {
    value: "text-red-600 dark:text-red-400",
    sub: "text-red-400 dark:text-red-500",
    bg: "bg-red-50 dark:bg-red-950",
    border: "border-red-200 dark:border-red-900",
  },
  emerald: {
    value: "text-emerald-600 dark:text-emerald-400",
    sub: "text-emerald-500 dark:text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950",
    border: "border-emerald-200 dark:border-emerald-900",
  },
  amber: {
    value: "text-amber-600 dark:text-amber-400",
    sub: "text-amber-500 dark:text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950",
    border: "border-amber-200 dark:border-amber-900",
  },
  blue: {
    value: "text-blue-600 dark:text-blue-400",
    sub: "text-blue-500 dark:text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950",
    border: "border-blue-200 dark:border-blue-900",
  },
};

export function MetricTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: TileColor;
}) {
  const c = tileColors[color];
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", c.bg, c.border)}>
      <p className="mb-1 text-[10px] font-medium text-slate-400">{label}</p>
      <p className={cn("text-xl font-bold leading-none", c.value)}>{value}</p>
      <p className={cn("mt-1 text-[10px]", c.sub)}>{sub}</p>
    </div>
  );
}

export function CoverageTile({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: TileColor;
}) {
  const c = tileColors[color];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={cn("rounded-lg border px-3 py-2", c.bg, c.border)}>
      <p className="mb-0.5 text-[10px] text-slate-400">{label}</p>
      <p className={cn("text-lg font-bold leading-none", c.value)}>{value}</p>
      <p className={cn("mt-0.5 text-[10px]", c.sub)}>{pct}%</p>
    </div>
  );
}
