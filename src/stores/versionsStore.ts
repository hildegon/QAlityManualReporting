import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Persists per-project favourite version IDs.
 * Key is the project key (e.g. "MYPROJ"); value is a Set of version IDs.
 * Stored as a plain Record<string, string[]> in localStorage.
 */
interface VersionsState {
  /** projectKey → array of favourite version ids */
  favourites: Record<string, string[]>;
  isFavourite: (projectKey: string, versionId: string) => boolean;
  toggleFavourite: (projectKey: string, versionId: string) => void;
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
    }),
    {
      name: "qality-version-favourites",
    },
  ),
);
