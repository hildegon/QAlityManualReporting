/**
 * Typed wrappers around Tauri's `invoke` function.
 * All backend communication flows through this module.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  CreateBugResult,
  CreateTestExecutionResult,
  CreateTestPlanResult,
  CreateTestResult,
  CreateTestSetResult,
  CreateTestStepInput,
  JiraBug,
  JiraComponent,
  JiraIssueLinkType,
  JiraProject,
  JiraTransition,
  JiraUser,
  JiraVersion,
  TestExecution,
  TestRunIteration,
  TestPlan,
  TestRunsPage,
  TestSetMembershipsResponse,
  XrayStepStatus,
  XrayTest,
  XrayTestRunStatus,
  XrayTestSet,
  XrayTestWithStatus,
} from "@/types";

// ── Config ────────────────────────────────────────────────────────────────────

export const getConfig = (): Promise<AppConfig> => invoke("get_config");

export const saveConfig = (config: AppConfig): Promise<void> =>
  invoke("save_config_cmd", { config });

// ── Jira ──────────────────────────────────────────────────────────────────────

export const getJiraProjects = (): Promise<JiraProject[]> => invoke("get_jira_projects");

export const validateJiraCredentials = (): Promise<string> => invoke("validate_jira_credentials");

export const getProjectComponents = (projectKey: string): Promise<JiraComponent[]> =>
  invoke("get_project_components", { projectKey });

/** Fetch available workflow transitions for a Jira issue. */
export const getIssueTransitions = (issueKey: string): Promise<JiraTransition[]> =>
  invoke("get_issue_transitions", { issueKey });

/** Apply a workflow transition to a Jira issue. */
export const transitionIssue = (issueKey: string, transitionId: string): Promise<void> =>
  invoke("transition_issue", { issueKey, transitionId });

/** Update the assignee of a Jira issue. Pass `undefined` to unassign. */
export const updateAssignee = (issueKey: string, accountId?: string): Promise<void> =>
  invoke("update_assignee", { issueKey, ...(accountId !== undefined ? { accountId } : {}) });

/** Search Jira users by display name or email. */
export const searchUsers = (query: string): Promise<JiraUser[]> =>
  invoke("search_users", { query });

/** Fetch all versions for a Jira project. */
export const getProjectVersions = (projectKey: string): Promise<JiraVersion[]> =>
  invoke("get_project_versions", { projectKey });

/** Fetch Bug issues with the given affectedVersion in the project. */
export const getBugsByVersion = (projectKey: string, versionName: string): Promise<JiraBug[]> =>
  invoke("get_bugs_by_version", { projectKey, versionName });

/** Fetch Story, Task, and Bug issues with the given fixVersion in the project. */
export const getVersionIssues = (projectKey: string, versionName: string): Promise<JiraBug[]> =>
  invoke("get_version_issues", { projectKey, versionName });

/** Fetch all issue link types configured in the Jira instance. */
export const getIssueLinkTypes = (): Promise<JiraIssueLinkType[]> => invoke("get_issue_link_types");

/**
 * Create an issue link between two Jira issues.
 * `linkTypeName` is the Jira link type name, e.g. "is detected by".
 * The bug is the inward issue; the test is the outward issue.
 */
export const createIssueLink = (
  inwardIssueKey: string,
  outwardIssueKey: string,
  linkTypeName: string,
): Promise<void> => invoke("create_issue_link", { inwardIssueKey, outwardIssueKey, linkTypeName });

/** Update the summary (name) of any Jira issue — Test Plan, Test Set, Test Execution, etc. */
export const updateIssueSummary = (issueKey: string, summary: string): Promise<void> =>
  invoke("update_issue_summary", { issueKey, summary });

/** Update the fix version of any Jira issue. Pass an empty string to clear. */
export const updateIssueFixVersion = (issueKey: string, versionId: string): Promise<void> =>
  invoke("update_issue_fix_version", { issueKey, versionId });

// ── Xray ──────────────────────────────────────────────────────────────────────

export const authenticateXray = (): Promise<void> => invoke("authenticate_xray");

export const getTestPlans = (projectKey: string, limit?: number): Promise<TestPlan[]> =>
  invoke("get_test_plans", { projectKey, limit });

export const getTestExecutions = (projectKey: string, limit?: number): Promise<TestExecution[]> =>
  invoke("get_test_executions", { projectKey, limit });

/** Fetch test executions filtered by a Jira fix version name. */
export const getTestExecutionsByVersion = (
  projectKey: string,
  versionName: string,
  limit?: number,
): Promise<TestExecution[]> =>
  invoke("get_test_executions_by_version", { projectKey, versionName, limit });

export const getTestRuns = (
  testExecutionIssueId: string,
  limit?: number,
  start?: number,
): Promise<TestRunsPage> => invoke("get_test_runs", { testExecutionIssueId, limit, start });

export const getIterationStepResults = (testRunId: string): Promise<TestRunIteration[]> =>
  invoke("get_iteration_step_results", { testRunId });

export const updateTestRunStatus = (testRunId: string, status: string): Promise<void> =>
  invoke("update_test_run_status", { testRunId, status });

/** Set the overall status of a single dataset iteration within a test run. */
export const updateIterationStatus = (
  testRunId: string,
  iterationRank: string,
  status: string,
): Promise<void> => invoke("update_iteration_status", { testRunId, iterationRank, status });

export const updateTestRunComment = (testRunId: string, comment: string): Promise<void> =>
  invoke("update_test_run_comment", { testRunId, comment });

export const getXrayStatuses = (projectId: string): Promise<XrayTestRunStatus[]> =>
  invoke("get_xray_statuses", { projectId });

export const getStepStatuses = (projectId: string): Promise<XrayStepStatus[]> =>
  invoke("get_step_statuses", { projectId });

export const updateTestRunStepStatus = (
  testRunId: string,
  stepId: string,
  status: string,
): Promise<void> => invoke("update_test_run_step_status", { testRunId, stepId, status });

export const updateTestRunStep = (
  testRunId: string,
  stepId: string,
  comment?: string,
  actualResult?: string,
  status?: string,
): Promise<void> =>
  invoke("update_test_run_step", { testRunId, stepId, comment, actualResult, status });

export const createTestExecution = (
  projectKey: string,
  summary: string,
  testPlanId?: string,
  testIssueIds?: string[],
  description?: string,
): Promise<CreateTestExecutionResult> =>
  invoke("create_test_execution", { projectKey, summary, testPlanId, testIssueIds, description });

export const getTests = (projectKey: string): Promise<XrayTest[]> =>
  invoke("get_tests", { projectKey });

/**
 * Kick off background fetching of the most-recent test run per test.
 * Results stream in via `tests:health:batch` Tauri events.
 * Call `listen("tests:health:batch", ...)` before invoking this.
 */
export const getTestsHealthData = (testIssueIds: string[]): Promise<void> =>
  invoke("get_tests_health_data", { testIssueIds });

export const getTestSets = (projectKey: string): Promise<XrayTestSet[]> =>
  invoke("get_test_sets", { projectKey });

export const getTestSetTests = (issueId: string): Promise<XrayTest[]> =>
  invoke("get_test_set_tests", { issueId });

/** Fetch all test sets and their member tests in a single backend call. */
export const getAllTestSetMemberships = (projectKey: string): Promise<TestSetMembershipsResponse> =>
  invoke("get_all_test_set_memberships", { projectKey });

export const getTestPlanTests = (issueId: string): Promise<XrayTest[]> =>
  invoke("get_test_plan_tests", { issueId });

export const createTest = (
  projectKey: string,
  summary: string,
  steps: CreateTestStepInput[],
  component?: string,
): Promise<CreateTestResult> => invoke("create_test", { projectKey, summary, steps, component });

export const addTestsToTestSet = (testSetIssueId: string, testIssueIds: string[]): Promise<void> =>
  invoke("add_tests_to_test_set", { testSetIssueId, testIssueIds });

export const createTestSet = (
  projectKey: string,
  summary: string,
  component?: string,
): Promise<CreateTestSetResult> =>
  invoke("create_test_set", { projectKey, summary, component: component ?? null });

/** Create a new Test Plan in Xray. */
export const createTestPlan = (
  projectKey: string,
  summary: string,
  description?: string,
  component?: string,
  fixVersion?: string,
): Promise<CreateTestPlanResult> =>
  invoke("create_test_plan", { projectKey, summary, description, component, fixVersion });

/** Add test issues directly to a test plan's test scope. */
export const addTestsToTestPlan = (
  testPlanIssueId: string,
  testIssueIds: string[],
): Promise<void> => invoke("add_tests_to_test_plan", { testPlanIssueId, testIssueIds });

/** Add test issues to an existing test execution. */
export const addTestsToTestExecution = (
  testExecIssueId: string,
  testIssueIds: string[],
): Promise<void> => invoke("add_tests_to_test_execution", { testExecIssueId, testIssueIds });

/** Remove test issues from a test set. */
export const removeTestsFromTestSet = (
  testSetIssueId: string,
  testIssueIds: string[],
): Promise<void> => invoke("remove_tests_from_test_set", { testSetIssueId, testIssueIds });

/** Remove test issues from a test plan. */
export const removeTestsFromTestPlan = (
  testPlanIssueId: string,
  testIssueIds: string[],
): Promise<void> => invoke("remove_tests_from_test_plan", { testPlanIssueId, testIssueIds });

/** Fetch all tests in a test set including each test's latest execution status. */
export const getTestSetTestsWithStatus = (issueId: string): Promise<XrayTestWithStatus[]> =>
  invoke("get_test_set_tests_with_status", { issueId });

/**
 * Link one or more Jira bug keys to a test run as Xray defects.
 * Returns the list of issue keys that were actually added to the run.
 */
export const addDefectsToTestRun = (runId: string, issueKeys: string[]): Promise<string[]> =>
  invoke("add_defects_to_test_run", { runId, issueKeys });

/** Create a new Bug issue in a Jira project with an affected version pre-set. */
export const createBug = (
  projectKey: string,
  summary: string,
  affectedVersionId: string,
  description?: string,
  componentId?: string,
  assigneeAccountId?: string,
): Promise<CreateBugResult> =>
  invoke("create_bug", {
    projectKey,
    summary,
    affectedVersionId,
    description,
    componentId,
    assigneeAccountId,
  });

/** Attach a local file to an existing Jira issue. */
export const addAttachment = (issueKey: string, filePath: string): Promise<void> =>
  invoke("add_attachment", { issueKey, filePath });

/** Add a plain-text comment to an existing Jira issue. */
export const addJiraComment = (issueKey: string, body: string): Promise<void> =>
  invoke("add_jira_comment", { issueKey, body });

/**
 * Write a UTF-8 text file to an absolute path chosen by the user via the
 * dialog plugin on the frontend.
 */
export const writeTextFile = (path: string, content: string): Promise<void> =>
  invoke("write_text_file", { path, content });
