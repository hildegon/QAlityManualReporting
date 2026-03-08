import { useProjectStore } from "@/stores/projectStore";
import { useConfig } from "@/services/queries";

/**
 * Returns the effective project key for content pages:
 * Test Plans, Test Sets, Tests, Coverage, Create Test.
 *
 * Priority: activeContentProject.key > config.content_project_key > null
 */
export function useContentProjectKey(): string | null {
  const { activeContentProject } = useProjectStore();
  const { data: config } = useConfig();

  return activeContentProject?.key || config?.content_project_key || null;
}

/**
 * Returns the effective project key for execution pages:
 * Test Executions and Versions.
 *
 * Priority: activeExecutionProject.key > config.execution_project_key > config.content_project_key > null
 */
export function useExecutionProjectKey(): string | null {
  const { activeExecutionProject } = useProjectStore();
  const { data: config } = useConfig();

  return (
    activeExecutionProject?.key ||
    config?.execution_project_key ||
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
