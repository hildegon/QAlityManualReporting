/**
 * TanStack Query hooks for all data-fetching operations.
 * Mutations use optimistic updates for instant UI feedback.
 *
 * Barrel re-export — all consumers importing from "@/services/queries" continue
 * to work without modification.
 */
export * from "./queryKeys";
export * from "./config";
export * from "./jira";
export * from "./xray-queries";
export * from "./xray-mutations";
export * from "./version-stats";
