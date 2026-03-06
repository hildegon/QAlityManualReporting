import { useProjectStore } from "@/stores/projectStore";
import { useConfig } from "@/services/queries";

/**
 * Returns the effective project key for Test Plans, Test Sets, and Tests.
 * Priority: Zustand activeProject.key > config.content_project_key > null
 */
export function useContentProjectKey(): string | null {
  const { activeProject } = useProjectStore();
  const { data: config } = useConfig();

  return activeProject?.key || config?.content_project_key || null;
}

/**
 * Returns the effective project key for Test Executions.
 * Falls back to content_project_key if execution_project_key is not set.
 * Priority: config.execution_project_key > Zustand activeProject.key > config.content_project_key > null
 */
export function useExecutionProjectKey(): string | null {
  const { activeProject } = useProjectStore();
  const { data: config } = useConfig();

  return (
    config?.execution_project_key ||
    activeProject?.key ||
    config?.content_project_key ||
    null
  );
}

/**
 * @deprecated Use useContentProjectKey() or useExecutionProjectKey() instead.
 */
export function useProjectKey(): string | null {
  return useContentProjectKey();
}
