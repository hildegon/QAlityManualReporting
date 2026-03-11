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
  useVersionIssues,
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
  useIterationStepResults,
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
  useUpdateIterationStatus,
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
  useExecutionRunSummary,
  useAddDefectsToTestRun,
  type ExecSummary,
  type TestSetInfo,
  type TestRunHistory,
  type RunStats,
} from "./xray";
