import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENT = 10;

interface CommentTemplatesState {
  recentByProject: Record<string, string[]>;
  addRecent: (projectKey: string, comment: string) => void;
}

export const useCommentTemplatesStore = create<CommentTemplatesState>()(
  persist(
    (set) => ({
      recentByProject: {},
      addRecent: (projectKey, comment) => {
        const trimmed = comment.trim();
        if (!trimmed) return;
        set((state) => {
          const existing = state.recentByProject[projectKey] ?? [];
          const deduped = [trimmed, ...existing.filter((c) => c !== trimmed)].slice(0, MAX_RECENT);
          return { recentByProject: { ...state.recentByProject, [projectKey]: deduped } };
        });
      },
    }),
    { name: "qality-comment-templates" },
  ),
);
