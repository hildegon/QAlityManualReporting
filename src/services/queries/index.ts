/**
 * Barrel re-export for all TanStack Query hooks.
 *
 * Consumers import from "@/services/queries" as before — this file is the
 * single entry point that delegates to the domain-specific modules.
 */
export { queryKeys } from "./keys";
export { useConfig, useSaveConfig } from "./config";
export {
  useJiraProjects,
  useProjectComponents,
  useProjectVersions,
  useIssueTransitions,
  useSearchUsers,
  useIssueLinkTypes,
  useBugsByVersion,
  useTransitionIssue,
  useUpdateAssignee,
  useRenameIssue,
  useLinkBugToTest,
} from "./jira";
export {
  useTestPlans,
  useTestExecutions,
  useTestExecutionsByVersion,
  useTestRuns,
  useXrayStatuses,
  useStepStatuses,
  useGetTests,
  useGetTestSets,
  useGetTestSetTests,
  useGetTestSetTestsWithStatus,
  useGetTestPlanTests,
  useTestSetMembership,
  useUpdateTestRunStatus,
  useUpdateTestRunComment,
  useUpdateTestRunStepStatus,
  useUpdateTestRunStep,
  useCreateTestExecution,
  useCreateTestSet,
  useAddTestsToTestSet,
  useRemoveTestsFromTestSet,
  useCreateTestPlan,
  useAddTestsToTestPlan,
  useRemoveTestsFromTestPlan,
  useAddTestsToTestExecution,
  useCreateTest,
  useVersionRunStats,
  type TestSetInfo,
  type TestRunHistory,
  type RunStats,
} from "./xray";
