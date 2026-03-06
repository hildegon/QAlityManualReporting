import { useProjectStore } from "@/stores/projectStore";
import { useConfig } from "@/services/queries";

/**
 * Returns the effective project key to use for Xray queries.
 * Priority: Zustand activeProject.key > config.project_key > null
 */
export function useProjectKey(): string | null {
  const { activeProject } = useProjectStore();
  const { data: config } = useConfig();

  return activeProject?.key || config?.project_key || null;
}
