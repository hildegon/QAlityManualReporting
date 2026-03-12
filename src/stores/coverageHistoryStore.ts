import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A single point-in-time coverage snapshot for a specific project + set selection. */
export interface CoverageSnapshot {
  /** Unix ms timestamp when the snapshot was recorded. */
  timestamp: number;
  /** Total number of tests across all selected sets. */
  total: number;
  /** Number of tests that have been run at least once (non-TODO, non-null). */
  runCount: number;
  /** Number of tests with a PASS result. */
  passCount: number;
  /** Number of tests with a FAIL result. */
  failCount: number;
  /** Number of tests not yet run (null status or TODO). */
  todoCount: number;
  /** Coverage percentage (0–100). */
  coveragePct: number;
}

/** Stable string key that identifies a unique project + set selection. */
type ViewKey = string;

/** Builds the canonical view key for a project + set combination. */
export function buildViewKey(projectKey: string, setIds: string[]): ViewKey {
  return `${projectKey}::${[...setIds].sort().join(",")}`;
}

const MAX_SNAPSHOTS_PER_VIEW = 90;
/** Minimum gap between auto-saved snapshots (1 hour in ms). */
const MIN_SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;

interface CoverageHistoryState {
  /** Map from ViewKey to ordered (oldest-first) list of snapshots. */
  history: Record<ViewKey, CoverageSnapshot[]>;
  /**
   * Record a new snapshot for the given view key.
   * Skipped if a snapshot was already recorded within MIN_SNAPSHOT_INTERVAL_MS.
   */
  recordSnapshot: (viewKey: ViewKey, snapshot: Omit<CoverageSnapshot, "timestamp">) => void;
  /** Remove all history for a view key. */
  clearHistory: (viewKey: ViewKey) => void;
}

export const useCoverageHistoryStore = create<CoverageHistoryState>()(
  persist(
    (set, get) => ({
      history: {},

      recordSnapshot: (viewKey, snapshot) => {
        const now = Date.now();
        const existing = get().history[viewKey] ?? [];

        // Throttle: skip if last snapshot is too recent.
        const last = existing[existing.length - 1];
        if (last && now - last.timestamp < MIN_SNAPSHOT_INTERVAL_MS) return;

        const entry: CoverageSnapshot = { ...snapshot, timestamp: now };
        const updated = [...existing, entry];
        // Keep only the most recent MAX_SNAPSHOTS_PER_VIEW entries.
        const trimmed =
          updated.length > MAX_SNAPSHOTS_PER_VIEW
            ? updated.slice(updated.length - MAX_SNAPSHOTS_PER_VIEW)
            : updated;

        set((state) => ({
          history: { ...state.history, [viewKey]: trimmed },
        }));
      },

      clearHistory: (viewKey) => {
        set((state) => {
          const next = { ...state.history };
          delete next[viewKey];
          return { history: next };
        });
      },
    }),
    {
      name: "qality-coverage-history",
    },
  ),
);
