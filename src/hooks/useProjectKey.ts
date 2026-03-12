import { useProjectStore } from "@/stores/projectStore";

/**
 * Returns the effective project key for content pages:
 * Test Plans, Test Sets, Tests, Coverage, Create Test.
 */
export function useContentProjectKey(): string | null {
  const { activeContentProject } = useProjectStore();
  return activeContentProject?.key ?? null;
}

/**
 * Returns the effective project key for execution pages:
 * Test Executions and Versions.
 */
export function useExecutionProjectKey(): string | null {
  const { activeExecutionProject } = useProjectStore();
  return activeExecutionProject?.key ?? null;
}
