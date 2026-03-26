/** Shared pure helpers for the Versions feature components. */

/** Colour class for a Jira priority name. */
export function priorityClass(priority?: string): string {
  const p = priority?.toLowerCase() ?? "";
  if (p === "highest" || p === "critical") return "text-red-600";
  if (p === "high") return "text-orange-500";
  if (p === "medium") return "text-amber-500";
  if (p === "low") return "text-blue-400";
  return "text-slate-400";
}

/** Colour class for a Jira status category key. */
export function statusCategoryClass(categoryKey?: string): string {
  if (categoryKey === "done") return "bg-emerald-100 text-emerald-700";
  if (categoryKey === "indeterminate") return "bg-blue-100 text-blue-700";
  if (categoryKey === "new") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-500";
}

// ── Local-file attachment helpers (used in VersionIssueRow comment panel) ─────

export const ATTACH_IMG_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
export const ATTACH_VID_EXTS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
export const attachExt = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
export const attachIsImg = (p: string) => ATTACH_IMG_EXTS.has(attachExt(p));
export const attachIsVid = (p: string) => ATTACH_VID_EXTS.has(attachExt(p));
export const attachName = (p: string) => p.split(/[\\/]/).pop() ?? p;
