import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ApiUsageSnapshot, AppConfig } from "@/types";
import * as api from "../tauri";
import { queryKeys } from "./queryKeys";

// ── Config ────────────────────────────────────────────────────────────────────

export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: queryKeys.config,
    queryFn: api.getConfig,
    staleTime: Infinity, // config only changes when the user saves it
    gcTime: Infinity, // keep in memory for the session; NOT persisted (contains credentials)
  });
}

export function useSaveConfig(): UseMutationResult<void, Error, AppConfig> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, AppConfig>({
    mutationFn: api.saveConfig,
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(queryKeys.config, variables);
    },
  });
}

// ── API Usage ─────────────────────────────────────────────────────────────────

export function useApiUsage() {
  const queryClient = useQueryClient();

  // Listen for real-time `api-usage-updated` events from the Rust backend.
  useEffect(() => {
    const unlisten = listen("api-usage-updated", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiUsage });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);

  return useQuery<ApiUsageSnapshot>({
    queryKey: queryKeys.apiUsage,
    queryFn: api.getApiUsage,
    refetchInterval: 30_000, // fallback poll — events handle real-time updates
    staleTime: 5_000,
  });
}
