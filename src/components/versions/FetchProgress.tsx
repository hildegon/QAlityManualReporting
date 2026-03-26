import { Loader2 } from "lucide-react";

export function FetchProgress({ loaded, expected }: { loaded: number; expected: number }) {
  if (expected === 0 || loaded >= expected) return null;
  const pct = expected > 0 ? (loaded / expected) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>
        Loading test results… {loaded}/{expected} pages
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-slate-300 transition-all duration-300 dark:bg-slate-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
