/** Shared pure helpers for the Tests page and its sub-components. */

export type ToastFn = (msg: string, variant: "success" | "error") => void;

export const DEPRECATING_KEYWORDS = [
  "deprecated",
  "won't do",
  "wont do",
  "obsolete",
  "cancelled",
  "canceled",
  "rejected",
  "inactive",
  "withdrawn",
  "closed",
];

export function isDeprecatingStatus(statusName: string): boolean {
  const lower = statusName.toLowerCase();
  return DEPRECATING_KEYWORDS.some((kw) => lower.includes(kw));
}

export function loadHiddenKeys(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function saveHiddenKeys(storageKey: string, keys: Set<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...keys]));
  } catch {
    /* ignore */
  }
}

export function categoryColor(key?: string): string {
  if (key === "done")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300";
  if (key === "indeterminate")
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
}
