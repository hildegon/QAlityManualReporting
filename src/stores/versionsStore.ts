import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Persists per-project favourite IDs for both versions and test executions,
 * the last-selected version ID per project, and health dot colours per version.
 * Keys are project keys (e.g. "MYPROJ"); values are arrays of IDs or nested maps.
 * Stored as plain objects in localStorage.
 */

/** A named group that combines multiple Jira versions into one aggregated report. */
export interface VersionGroup {
  id: string;
  name: string;
  /** IDs of the Jira versions included in this group. */
  versionIds: string[];
}

interface VersionsState {
  /** projectKey → array of favourite version ids */
  favourites: Record<string, string[]>;
  isFavourite: (projectKey: string, versionId: string) => boolean;
  toggleFavourite: (projectKey: string, versionId: string) => void;

  /** projectKey → array of favourite test execution issue ids */
  executionFavourites: Record<string, string[]>;
  isExecutionFavourite: (projectKey: string, issueId: string) => boolean;
  toggleExecutionFavourite: (projectKey: string, issueId: string) => void;

  /** projectKey → last-selected version id (null = nothing selected) */
  selectedVersionId: Record<string, string | null>;
  setSelectedVersionId: (projectKey: string, versionId: string | null) => void;

  /** projectKey → versionId → health dot colour */
  healthDots: Record<string, Record<string, "green" | "amber" | "red">>;
  setHealthDot: (projectKey: string, versionId: string, dot: "green" | "amber" | "red") => void;

  /** projectKey → version groups defined for that project */
  versionGroups: Record<string, VersionGroup[]>;
  addVersionGroup: (projectKey: string, group: VersionGroup) => void;
  updateVersionGroup: (projectKey: string, group: VersionGroup) => void;
  removeVersionGroup: (projectKey: string, groupId: string) => void;
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

      selectedVersionId: {},

      setSelectedVersionId: (projectKey, versionId) => {
        set((state) => ({
          selectedVersionId: {
            ...state.selectedVersionId,
            [projectKey]: versionId,
          },
        }));
      },

      healthDots: {},

      setHealthDot: (projectKey, versionId, dot) => {
        set((state) => {
          const existing = state.healthDots[projectKey]?.[versionId];
          if (existing === dot) return state; // avoid unnecessary re-renders
          return {
            healthDots: {
              ...state.healthDots,
              [projectKey]: {
                ...(state.healthDots[projectKey] ?? {}),
                [versionId]: dot,
              },
            },
          };
        });
      },

      versionGroups: {},

      addVersionGroup: (projectKey, group) => {
        set((state) => ({
          versionGroups: {
            ...state.versionGroups,
            [projectKey]: [...(state.versionGroups[projectKey] ?? []), group],
          },
        }));
      },

      updateVersionGroup: (projectKey, group) => {
        set((state) => ({
          versionGroups: {
            ...state.versionGroups,
            [projectKey]: (state.versionGroups[projectKey] ?? []).map((g) =>
              g.id === group.id ? group : g,
            ),
          },
        }));
      },

      removeVersionGroup: (projectKey, groupId) => {
        set((state) => ({
          versionGroups: {
            ...state.versionGroups,
            [projectKey]: (state.versionGroups[projectKey] ?? []).filter((g) => g.id !== groupId),
          },
        }));
      },
    }),
    {
      name: "qality-version-favourites",
    },
  ),
);
