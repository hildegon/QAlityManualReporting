/**
 * Zustand store mapping Jira version IDs to Confluence page locations.
 * Persisted to localStorage so mappings survive between sessions.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ConfluencePageMapping {
  pageId: string;
  spaceId: string;
  parentId: string | null;
}

interface ConfluenceStoreState {
  /** Map of Jira `versionId` → Confluence page info. */
  versionPageMap: Record<string, ConfluencePageMapping>;

  /** Link a version to a Confluence page. */
  setVersionPage: (
    versionId: string,
    mapping: ConfluencePageMapping,
  ) => void;

  /** Look up the Confluence page for a version (or `undefined`). */
  getVersionPage: (versionId: string) => ConfluencePageMapping | undefined;

  /** Remove the link (does NOT delete the Confluence page). */
  removeVersionPage: (versionId: string) => void;
}

export const useConfluenceStore = create<ConfluenceStoreState>()(
  persist(
    (set, get) => ({
      versionPageMap: {},

      setVersionPage: (versionId, mapping) =>
        set((s) => ({
          versionPageMap: { ...s.versionPageMap, [versionId]: mapping },
        })),

      getVersionPage: (versionId) => get().versionPageMap[versionId],

      removeVersionPage: (versionId) =>
        set((s) => {
          const { [versionId]: _, ...rest } = s.versionPageMap;
          return { versionPageMap: rest };
        }),
    }),
    { name: "qality-confluence-store" },
  ),
);
