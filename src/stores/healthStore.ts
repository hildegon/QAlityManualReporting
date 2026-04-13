import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";

import type { TestLastRunEntry } from "@/types";
import * as api from "@/services/tauri";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HealthProgress {
  processed: number;
  total: number;
}

interface ProjectHealthData {
  healthMap: Map<string, TestLastRunEntry>;
  loading: boolean;
  progress: HealthProgress;
  /** True once at least one full fetch has completed for this project. */
  fetched: boolean;
}

type ToastFn = (msg: string, variant: "success" | "error") => void;

interface HealthState {
  /** Per-project health data. */
  data: Record<string, ProjectHealthData>;
  /** Keys of currently in-flight fetches (prevents duplicate launches). */
  activeFetches: Set<string>;

  /** Get health data for a project (returns defaults if not yet loaded). */
  getProjectHealth: (projectKey: string) => ProjectHealthData;

  /**
   * Start fetching health data for a project. No-ops if a fetch is already
   * running for this key. Callers pass the test issue IDs to check.
   * The `toastFn` is optional and used to surface backend errors.
   */
  startHealthFetch: (projectKey: string, testIssueIds: string[], toastFn?: ToastFn) => void;

  /**
   * Force-reset and re-fetch health data for a project.
   * Clears the cached data and active fetch guard, then starts a fresh fetch.
   */
  resetAndRefetch: (projectKey: string, testIssueIds: string[], toastFn?: ToastFn) => void;

  /**
   * Clear the project's health data so the next `startHealthFetch` call
   * will trigger a fresh fetch. Does NOT start a fetch itself.
   */
  resetProject: (projectKey: string) => void;
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_HEALTH: ProjectHealthData = {
  healthMap: new Map(),
  loading: false,
  progress: { processed: 0, total: 0 },
  fetched: false,
};

// ── Store ──────────────────────────────────────────────────────────────────────

/** Tracks the unlisten functions for any in-flight fetch, keyed by project key. */
const activeListeners = new Map<string, () => void>();

export const useHealthStore = create<HealthState>()((set, get) => {
  /** Internal helper: update a single project's health data. */
  function updateProject(
    projectKey: string,
    updater: (prev: ProjectHealthData) => Partial<ProjectHealthData>,
  ) {
    set((state) => {
      const prev = state.data[projectKey] ?? { ...DEFAULT_HEALTH, healthMap: new Map() };
      const patch = updater(prev);
      return {
        data: {
          ...state.data,
          [projectKey]: { ...prev, ...patch },
        },
      };
    });
  }

  /** Internal helper: run the actual fetch pipeline. */
  async function runFetch(projectKey: string, testIssueIds: string[], toastFn?: ToastFn) {
    // Terminate any in-flight listeners for this project before starting a new fetch.
    activeListeners.get(projectKey)?.();
    activeListeners.delete(projectKey);

    // Mark loading
    updateProject(projectKey, () => ({
      loading: true,
      progress: { processed: 0, total: 0 },
    }));

    // Accumulator lives outside React — survives across any re-renders.
    const acc = new Map<string, TestLastRunEntry>();

    // 1) Seed from backend cache
    try {
      const cached = await api.loadHealthCache(projectKey);
      if (cached.length > 0) {
        for (const e of cached) acc.set(e.test_issue_id, e);
        updateProject(projectKey, () => ({ healthMap: new Map(acc) }));
      }
    } catch {
      // No cache — fine, start empty.
    }

    function cleanup() {
      unlistenError();
      unlisten();
      activeListeners.delete(projectKey);
      set((state) => {
        const next = new Set(state.activeFetches);
        next.delete(projectKey);
        return { activeFetches: next };
      });
    }

    // 2) Listen for batch events
    const unlistenError = await listen<string>("tests:health:error", (event) => {
      if (import.meta.env.DEV) console.error("[health] error from backend:", event.payload);
      toastFn?.(`Health check failed: ${event.payload}`, "error");
      updateProject(projectKey, () => ({ loading: false }));
      cleanup();
    });

    const unlisten = await listen<{
      entries: TestLastRunEntry[];
      done: boolean;
      total: number;
      processed: number;
    }>("tests:health:batch", (event) => {
      const { entries, done, total, processed } = event.payload;
      // Merge healthMap + progress + done state in a single set() call to avoid
      // triggering two separate React re-renders per batch event.
      if (entries.length > 0) {
        for (const e of entries) acc.set(e.test_issue_id, e);
      }
      if (done) {
        updateProject(projectKey, () => ({
          healthMap: new Map(acc),
          progress: { processed, total },
          loading: false,
          fetched: true,
        }));
        // Persist to backend cache before cleaning up listeners.
        void api.saveHealthCache(projectKey, [...acc.values()]);
        cleanup();
      } else {
        updateProject(projectKey, () => ({
          ...(entries.length > 0 ? { healthMap: new Map(acc) } : {}),
          progress: { processed, total },
        }));
      }
    });

    // Register the combined cleanup so resetAndRefetch can call it if needed.
    activeListeners.set(projectKey, cleanup);

    // 3) Invoke the Rust command
    try {
      await api.getTestsHealthData(testIssueIds);
    } catch (e) {
      if (import.meta.env.DEV) console.error("[health] invoke error:", e);
      updateProject(projectKey, () => ({ loading: false }));
      cleanup();
    }
  }

  return {
    data: {},
    activeFetches: new Set(),

    getProjectHealth: (projectKey) => {
      const d = get().data[projectKey];
      return d ?? { ...DEFAULT_HEALTH, healthMap: new Map() };
    },

    startHealthFetch: (projectKey, testIssueIds, toastFn) => {
      const state = get();
      // Already fetching for this project — no-op.
      if (state.activeFetches.has(projectKey)) return;
      // Already fetched and data present — no-op.
      if (state.data[projectKey]?.fetched) return;

      set((s) => {
        const next = new Set(s.activeFetches);
        next.add(projectKey);
        return { activeFetches: next };
      });

      void runFetch(projectKey, testIssueIds, toastFn);
    },

    resetAndRefetch: (projectKey, testIssueIds, toastFn) => {
      // Clear existing data and re-trigger. Any in-flight listeners are terminated
      // at the start of runFetch via activeListeners.
      set((state) => {
        const nextData = { ...state.data };
        delete nextData[projectKey];
        const nextActive = new Set(state.activeFetches);
        nextActive.delete(projectKey);
        return { data: nextData, activeFetches: nextActive };
      });

      set((s) => {
        const next = new Set(s.activeFetches);
        next.add(projectKey);
        return { activeFetches: next };
      });

      void runFetch(projectKey, testIssueIds, toastFn);
    },

    resetProject: (projectKey) => {
      set((state) => {
        const nextData = { ...state.data };
        delete nextData[projectKey];
        const nextActive = new Set(state.activeFetches);
        nextActive.delete(projectKey);
        return { data: nextData, activeFetches: nextActive };
      });
    },
  };
});
