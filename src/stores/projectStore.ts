import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { JiraProject } from "@/types";

interface ProjectState {
  /** Active project for content pages: Test Plans, Tests, Test Sets, Coverage, Create Test. */
  activeContentProject: JiraProject | null;
  /** Active project for execution pages: Executions, Versions. */
  activeExecutionProject: JiraProject | null;
  setActiveContentProject: (project: JiraProject | null) => void;
  setActiveExecutionProject: (project: JiraProject | null) => void;

  /**
   * @deprecated Use activeContentProject instead.
   * Kept for backwards-compat with any code that still reads `activeProject`.
   */
  activeProject: JiraProject | null;
  /** @deprecated Use setActiveContentProject or setActiveExecutionProject. */
  setActiveProject: (project: JiraProject | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      activeContentProject: null,
      activeExecutionProject: null,
      setActiveContentProject: (project) =>
        set({ activeContentProject: project, activeProject: project }),
      setActiveExecutionProject: (project) => set({ activeExecutionProject: project }),

      // Legacy shim — sets both to the same project so old code keeps working.
      activeProject: null,
      setActiveProject: (project) =>
        set({
          activeProject: project,
          activeContentProject: project,
          activeExecutionProject: project,
        }),
    }),
    {
      name: "qality-active-project",
      // Migrate old persisted shape that only had `activeProject`.
      migrate: (persisted, version) => {
        const state = persisted as Partial<ProjectState>;
        if (version === 0 && state.activeProject && !state.activeContentProject) {
          return {
            ...state,
            activeContentProject: state.activeProject,
            activeExecutionProject: state.activeProject,
          };
        }
        return state;
      },
      version: 1,
    },
  ),
);
