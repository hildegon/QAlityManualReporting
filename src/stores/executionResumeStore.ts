import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ExecutionResumeState {
  lastRunByExecution: Record<string, string>;
  setLastRun: (executionIssueId: string, runId: string) => void;
}

export const useExecutionResumeStore = create<ExecutionResumeState>()(
  persist(
    (set) => ({
      lastRunByExecution: {},
      setLastRun: (executionIssueId, runId) =>
        set((state) => ({
          lastRunByExecution: { ...state.lastRunByExecution, [executionIssueId]: runId },
        })),
    }),
    { name: "qality-execution-resume" },
  ),
);
