import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { JiraProject } from "@/types";

interface ProjectState {
  activeProject: JiraProject | null;
  setActiveProject: (project: JiraProject | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      activeProject: null,
      setActiveProject: (project) => set({ activeProject: project }),
    }),
    {
      name: "qality-active-project",
    },
  ),
);
