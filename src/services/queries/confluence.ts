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

/** Update an existing Confluence page's title and/or body. */
export const useUpdateConfluencePage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      pageId: string;
      versionNumber: number;
      title: string;
      body: string;
    }) =>
      updateConfluencePage(vars.pageId, vars.versionNumber, vars.title, vars.body),
    onSuccess: (_data, vars) => {
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
