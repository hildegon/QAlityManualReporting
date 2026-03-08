import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Persists per-project favourite IDs for both versions and test executions.
 * Keys are project keys (e.g. "MYPROJ"); values are arrays of IDs.
 * Stored as plain objects in localStorage.
 */
interface VersionsState {
  /** projectKey → array of favourite version ids */
  favourites: Record<string, string[]>;
  isFavourite: (projectKey: string, versionId: string) => boolean;
  toggleFavourite: (projectKey: string, versionId: string) => void;

  /** projectKey → array of favourite test execution issue ids */
  executionFavourites: Record<string, string[]>;
  isExecutionFavourite: (projectKey: string, issueId: string) => boolean;
  toggleExecutionFavourite: (projectKey: string, issueId: string) => void;
}

export const useVersionsStore = create<VersionsState>()(
  persist(
    (set, get) => ({
      favourites: {},

      isFavourite: (projectKey, versionId) => {
        return (get().favourites[projectKey] ?? []).includes(versionId);
      },

      toggleFavourite: (projectKey, versionId) => {
        set((state) => {
          const current = state.favourites[projectKey] ?? [];
          const next = current.includes(versionId)
            ? current.filter((id) => id !== versionId)
            : [...current, versionId];
          return {
            favourites: {
              ...state.favourites,
              [projectKey]: next,
            },
          };
        });
      },

      executionFavourites: {},

      isExecutionFavourite: (projectKey, issueId) => {
        return (get().executionFavourites[projectKey] ?? []).includes(issueId);
      },

      toggleExecutionFavourite: (projectKey, issueId) => {
        set((state) => {
          const current = state.executionFavourites[projectKey] ?? [];
          const next = current.includes(issueId)
            ? current.filter((id) => id !== issueId)
            : [...current, issueId];
          return {
            executionFavourites: {
              ...state.executionFavourites,
              [projectKey]: next,
            },
          };
        });
      },
    }),
    {
      name: "qality-version-favourites",
    },
  ),
);
