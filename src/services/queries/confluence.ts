/**
 * TanStack Query hooks for Confluence Cloud operations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listConfluenceSpaces,
  listConfluencePages,
  listConfluenceChildren,
  getConfluencePage,
  createConfluencePage,
  updateConfluencePage,
  uploadConfluenceAttachment,
  uploadConfluenceAttachmentBytes,
  listConfluenceAttachments,
  fetchConfluenceAttachment,
} from "@/services/tauri";
import { queryKeys } from "./queryKeys";

// ── Queries ───────────────────────────────────────────────────────────────────

/** Fetch all Confluence spaces visible to the user. */
export const useConfluenceSpaces = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.confluenceSpaces,
    queryFn: listConfluenceSpaces,
    staleTime: 5 * 60_000,
    enabled,
  });

/** Fetch pages in a Confluence space (root pages or children of a parent). */
export const useConfluencePages = (
  spaceId: string | undefined,
  parentId?: string,
) =>
  useQuery({
    queryKey: queryKeys.confluencePages(spaceId ?? "", parentId),
    queryFn: () => listConfluencePages(spaceId!, parentId),
    enabled: !!spaceId,
    staleTime: 2 * 60_000,
  });

/** Fetch direct children (pages + folders) of a page or folder. */
export const useConfluenceChildren = (
  parentId: string | undefined,
  parentType: string,
) =>
  useQuery({
    queryKey: queryKeys.confluenceChildren(parentId ?? "", parentType),
    queryFn: () => listConfluenceChildren(parentId!, parentType),
    enabled: !!parentId,
    staleTime: 2 * 60_000,
  });

/** Fetch a single Confluence page with body content. */
export const useConfluencePage = (pageId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.confluencePage(pageId ?? ""),
    queryFn: () => getConfluencePage(pageId!),
    enabled: !!pageId,
    // Approval data is written infrequently; after any save the mutation
    // explicitly calls invalidateQueries, so 30 s gives a fast UX on repeated
    // version switches while still picking up external Confluence edits after a
    // short grace period.
    staleTime: 30_000,
  });

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Create a new Confluence page. */
export const useCreateConfluencePage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      spaceId: string;
      parentId: string | null;
      parentType?: string;
      title: string;
      body: string;
    }) => createConfluencePage(vars.spaceId, vars.parentId, vars.title, vars.body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.confluencePages(vars.spaceId, vars.parentId ?? undefined),
      });
      if (vars.parentId) {
        void qc.invalidateQueries({
          queryKey: queryKeys.confluenceChildren(
            vars.parentId,
            vars.parentType ?? "page",
          ),
        });
      }
    },
  });
};

/**
 * Update an existing Confluence page's title and/or body.
 *
 * Accepts either a pre-computed `body` string or a `transform` function that
 * receives the current page body and returns the new body. When a `transform`
 * is provided the mutation always fetches the latest page first to get the
 * correct version number, making it resilient to 409 Conflict errors caused
 * by stale cached version numbers.
 *
 * If a plain `body` is provided and Confluence returns 409, the mutation
 * automatically re-fetches the page and retries once with the fresh version.
 */
export const useUpdateConfluencePage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      pageId: string;
      title: string;
      /** Pre-computed body. Ignored when `transform` is provided. */
      body?: string;
      /**
       * A function that receives the current page body and returns the new
       * body to write. When provided, the mutation fetches the latest page to
       * guarantee the version number is correct before writing.
       */
      transform?: (currentBody: string) => string;
      /** Hint for the initial attempt when using plain `body`. */
      versionNumber?: number;
    }) => {
      if (vars.transform) {
        // Always fetch latest to get the correct version + body.
        // Note: the Rust layer already adds +1, so we pass the current version as-is.
        const page = await getConfluencePage(vars.pageId);
        const newBody = vars.transform(page.body_storage ?? "");
        const version = page.version_number ?? 0;
        return updateConfluencePage(vars.pageId, version, page.title, newBody);
      }

      // Plain body path — attempt once, then retry on 409.
      const body = vars.body ?? "";
      const tryUpdate = async (versionNumber: number) =>
        updateConfluencePage(vars.pageId, versionNumber, vars.title, body);

      if (vars.versionNumber != null) {
        try {
          return await tryUpdate(vars.versionNumber);
        } catch (err) {
          if (!String(err).includes("409")) throw err;
          // Stale version — re-fetch and retry once.
        }
      }
      // Re-fetch and pass current version (Rust adds +1 internally).
      const fresh = await getConfluencePage(vars.pageId);
      return tryUpdate(fresh.version_number ?? 1);
    },
    onSuccess: (updatedPage, vars) => {
      // Immediately populate the cache with the page returned by the update so
      // all consumers (banner, checklist, report) reflect the new state without
      // waiting for a background refetch.
      qc.setQueryData(queryKeys.confluencePage(vars.pageId), updatedPage);
      // Also invalidate to ensure a background refresh picks up any server-side
      // changes we didn't apply locally (e.g. metadata fields).
      void qc.invalidateQueries({
        queryKey: queryKeys.confluencePage(vars.pageId),
      });
    },
  });
};

/** Fetch all attachments on a Confluence page. */
export const useConfluenceAttachments = (pageId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.confluenceAttachments(pageId ?? ""),
    queryFn: () => listConfluenceAttachments(pageId!),
    enabled: !!pageId,
    staleTime: 60_000,
  });

/** Fetch a single Confluence attachment as a base64 data URI for inline display. */
export function useConfluenceAttachmentFile(
  downloadUrl: string | null,
  mimeType: string,
) {
  return useQuery<string>({
    queryKey: queryKeys.confluenceAttachmentFile(downloadUrl ?? ""),
    queryFn: () => fetchConfluenceAttachment(downloadUrl!, mimeType),
    enabled: !!downloadUrl,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Upload a file as an attachment to a Confluence page. */
export const useUploadConfluenceAttachment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { pageId: string; filePath: string }) =>
      uploadConfluenceAttachment(vars.pageId, vars.filePath),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.confluenceAttachments(vars.pageId),
      });
    },
  });
};

export const useUploadConfluenceAttachmentBytes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      pageId: string;
      fileName: string;
      bytes: number[];
      mimeType: string;
    }) => uploadConfluenceAttachmentBytes(vars.pageId, vars.fileName, vars.bytes, vars.mimeType),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.confluenceAttachments(vars.pageId),
      });
    },
  });
};

