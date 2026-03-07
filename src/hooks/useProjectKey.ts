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
 * Returns the effective project key for Test Executions and Versions.
 * When a project is explicitly selected via the ProjectSelector, it takes
 * priority — consistent with useContentProjectKey behaviour.
 * Falls back to config.execution_project_key, then content_project_key.
 * Priority: Zustand activeProject.key > config.execution_project_key > config.content_project_key > null
 */
export function useExecutionProjectKey(): string | null {
  const { activeProject } = useProjectStore();
  const { data: config } = useConfig();

  return activeProject?.key || config?.execution_project_key || config?.content_project_key || null;
}

/**
 * @deprecated Use useContentProjectKey() or useExecutionProjectKey() instead.
 */
export function useProjectKey(): string | null {
  return useContentProjectKey();
}
