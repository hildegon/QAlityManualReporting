import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { AppConfig } from "@/types";
import * as api from "../tauri";
import { queryKeys } from "./queryKeys";

// ── Config ────────────────────────────────────────────────────────────────────

export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: queryKeys.config,
    queryFn: api.getConfig,
    staleTime: Infinity, // config only changes when the user saves it
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
