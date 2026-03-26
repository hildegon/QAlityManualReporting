/**
 * Canonical Xray test-run status names and helper utilities.
 *
 * Xray Cloud may return alias names for some statuses (e.g. "PASSED" instead
 * of "PASS").  All status-comparison logic should use the sets and helpers
 * here rather than comparing raw strings, so alias handling stays in one place.
 */

// ── Canonical status key strings ──────────────────────────────────────────────

/** Canonical key for a passing test run. */
export const STATUS_PASS = "PASS";
/** Canonical key for a failing test run. */
export const STATUS_FAIL = "FAIL";
/** Canonical key for a blocked test run. */
export const STATUS_BLOCKED = "BLOCKED";
/** Canonical key for an in-progress / executing test run. */
export const STATUS_EXECUTING = "EXECUTING";
/** Canonical key for a not-yet-run test. */
export const STATUS_TODO = "TODO";
/** Canonical key for an aborted test run. */
export const STATUS_ABORTED = "ABORTED";
/** Canonical key for a not-applicable test run. */
export const STATUS_NA = "N/A";

// ── Alias membership sets ─────────────────────────────────────────────────────

/** All raw status strings that represent a passing result. */
export const PASS_STATUSES = new Set([STATUS_PASS, "PASSED"]);

/** All raw status strings that represent a failing or blocked result. */
export const FAIL_STATUSES = new Set([STATUS_FAIL, "FAILED", STATUS_BLOCKED]);

/** All raw status strings that represent a not-yet-run result. */
export const TODO_STATUSES = new Set([STATUS_TODO, "NOT RUN", "TO DO"]);

/** All raw status strings that represent an in-progress result. */
export const EXECUTING_STATUSES = new Set([STATUS_EXECUTING, "IN PROGRESS"]);

// ── Normalization helper ───────────────────────────────────────────────────────

/**
 * Normalize a raw Xray status name to its canonical key (uppercased).
 * Unknown statuses are returned uppercased as-is.
 *
 * @example
 * normalizeStatusKey("PASSED")   // → "PASS"
 * normalizeStatusKey("FAILED")   // → "FAIL"
 * normalizeStatusKey("NOT RUN")  // → "TODO"
 * normalizeStatusKey("IN PROGRESS") // → "EXECUTING"
 */
export function normalizeStatusKey(name: string): string {
  const upper = name.toUpperCase();
  if (PASS_STATUSES.has(upper)) return STATUS_PASS;
  if (FAIL_STATUSES.has(upper)) return STATUS_FAIL;
  if (EXECUTING_STATUSES.has(upper)) return STATUS_EXECUTING;
  if (TODO_STATUSES.has(upper)) return STATUS_TODO;
  if (upper === "NA") return STATUS_NA;
  return upper;
}

// ── Priority constants ─────────────────────────────────────────────────────────

/**
 * Jira priority names considered critical (compared lowercase).
 * Used by the release readiness checklist and bug-panel filters.
 */
export const CRITICAL_PRIORITIES = new Set(["highest", "critical", "blocker", "p1"]);
