/**
 * Typed wrappers around Tauri's `invoke` function.
 * All backend communication flows through this module.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  ConfluenceAttachment,
  ConfluenceChild,
  ConfluencePage,
  ConfluenceSpace,
  CreateBugResult,
  ExecSummaryResult,
  JiraIssueDetail,
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
  TestLastRunEntry,
  TestRun,
  TestRunIteration,
  TestPlan,
  TestRunsPage,
  TestRunStatsPage,
  TestRunStatusesPage,
  TestSetMembershipsResponse,
  VersionRelatedWork,
  XrayStepStatus,
  XrayTest,
  XrayTestDetail,
  XrayTestExportData,
  XrayTestStep,
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

/** Fetch a Jira user's display name by account ID. */
export const getUserDisplayName = (accountId: string): Promise<string> =>
  invoke("get_user_display_name", { accountId });

/** Fetch all versions for a Jira project. */
export const getProjectVersions = (projectKey: string): Promise<JiraVersion[]> =>
  invoke("get_project_versions", { projectKey });

/** Create a new project version in Jira. */
export const createVersion = (
  projectId: string,
  name: string,
  description?: string,
  startDate?: string,
  releaseDate?: string,
): Promise<JiraVersion> =>
  invoke("create_version", { projectId, name, description, startDate, releaseDate });

/** Update an existing Jira project version. */
export const updateVersion = (
  versionId: string,
  name?: string,
  description?: string,
  released?: boolean,
  archived?: boolean,
  startDate?: string,
  releaseDate?: string,
): Promise<JiraVersion> =>
  invoke("update_version", { versionId, name, description, released, archived, startDate, releaseDate });

/** Fetch a custom property stored on a Jira version. Returns null if not set. */
export const getVersionProperty = (versionId: string, propertyKey: string): Promise<string | null> =>
  invoke("get_version_property", { versionId, propertyKey });

/** Create or update a custom property on a Jira version. Value must be valid JSON string. */
export const setVersionProperty = (versionId: string, propertyKey: string, value: string): Promise<void> =>
  invoke("set_version_property", { versionId, propertyKey, value });

/** Delete a custom property from a Jira version. */
export const deleteVersionProperty = (versionId: string, propertyKey: string): Promise<void> =>
  invoke("delete_version_property", { versionId, propertyKey });

/** Fetch all "Related Work" entries for a Jira version. */
export const getVersionRelatedWork = (versionId: string): Promise<VersionRelatedWork[]> =>
  invoke("get_version_related_work", { versionId });

/** Create a "Related Work" entry on a Jira version. */
export const createVersionRelatedWork = (
  versionId: string,
  category: string,
  title: string,
  url: string,
): Promise<VersionRelatedWork> =>
  invoke("create_version_related_work", { versionId, category, title, url });

/** Delete a "Related Work" entry from a Jira version. */
export const deleteVersionRelatedWork = (versionId: string, relatedWorkId: string): Promise<void> =>
  invoke("delete_version_related_work", { versionId, relatedWorkId });

/** Fetch Bug issues with the given affectedVersion in the project. */
export const getBugsByVersion = (projectKey: string, versionName: string): Promise<JiraBug[]> =>
  invoke("get_bugs_by_version", { projectKey, versionName });

/** Fetch Story, Task, and Bug issues with the given fixVersion in the project. */
export const getVersionIssues = (projectKey: string, versionName: string): Promise<JiraBug[]> =>
  invoke("get_version_issues", { projectKey, versionName });

/** Fetch all issue link types configured in the Jira instance. */
export const getIssueLinkTypes = (): Promise<JiraIssueLinkType[]> => invoke("get_issue_link_types");

/** Fetch a single Jira issue with description converted from ADF to plain text. */
export const getIssueDetail = (issueKey: string): Promise<JiraIssueDetail> =>
  invoke("get_issue_detail", { issueKey });

/**
 * Fetch a Jira attachment by its authenticated URL and return it as a base64 data URI.
 * The result can be used directly in `<img src>` or `<video src>`.
 */
export const fetchAttachmentToTemp = (contentUrl: string, mimeType: string): Promise<string> =>
  invoke("fetch_attachment_to_temp", { contentUrl, mimeType });

/**
 * Fetch an Xray evidence/attachment file by its download URL and return it as a base64 data URI.
 * Used to proxy authenticated downloads for images/files attached to test runs.
 */
export const fetchXrayEvidence = (downloadUrl: string, mimeType: string): Promise<string> =>
  invoke("fetch_xray_evidence", { downloadUrl, mimeType });

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

/** Lightweight version of getTestRuns — fetches only fields needed for the list
 *  view (id, status, testType, comment, defects, test identity).
 *  Steps, iterations, Gherkin, evidence, and Cucumber results are omitted. */
export const getTestRunsLightweight = (
  testExecutionIssueId: string,
  limit?: number,
  start?: number,
): Promise<TestRunsPage> =>
  invoke("get_test_runs_lightweight", { testExecutionIssueId, limit, start });

/** Fetch full details for a single test run (steps, iterations, evidence, etc.).
 *  Used for on-demand lazy loading when user expands a row. */
export const getSingleTestRun = (
  testIssueId: string,
  testExecIssueId: string,
): Promise<TestRun | null> =>
  invoke("get_single_test_run", { testIssueId, testExecIssueId });

/** Fetch the latest test runs for a specific test across all executions. */
export const getTestRunsByTestId = (
  testIssueId: string,
  limit?: number,
): Promise<TestRunsPage> => invoke("get_test_runs_by_test_id", { testIssueId, limit });

/** Lightweight alternative to getTestRuns — fetches only status names for the summary bar. */
export const getTestRunStatuses = (
  testExecutionIssueId: string,
  limit?: number,
  start?: number,
): Promise<TestRunStatusesPage> =>
  invoke("get_test_run_statuses", { testExecutionIssueId, limit, start });

/** Batch-fetch status counts for multiple executions in parallel. */
export const getExecutionSummariesBatch = (
  executionIssueIds: string[],
): Promise<Record<string, ExecSummaryResult>> =>
  invoke("get_execution_summaries_batch", { executionIssueIds });

export const getTestRunStats = (
  testExecutionIssueId: string,
  limit?: number,
  start?: number,
): Promise<TestRunStatsPage> =>
  invoke("get_test_run_stats", { testExecutionIssueId, limit, start });

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

/** Fetch steps, gherkin, and unstructured content for the given test issue IDs. */
export const getTestsExportData = (testIssueIds: string[]): Promise<XrayTestExportData[]> =>
  invoke("get_tests_export_data", { testIssueIds });

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
  testType?: string,
): Promise<CreateTestResult> =>
  invoke("create_test", { projectKey, summary, steps, component, testType });

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

/** Fetch tests-with-status for multiple test sets in a single backend call.
 *  Returns a map of set_issue_id → XrayTestWithStatus[]. */
export const getCoverageBatch = (
  setIssueIds: string[],
): Promise<Record<string, XrayTestWithStatus[]>> =>
  invoke("get_coverage_batch", { setIssueIds });

/**
 * Link one or more Jira bug keys to a test run as Xray defects.
 * Returns the list of issue keys that were actually added to the run.
 */
export const addDefectsToTestRun = (runId: string, issueKeys: string[]): Promise<string[]> =>
  invoke("add_defects_to_test_run", { runId, issueKeys });

/** Fetch full Xray test detail (testType, manual steps, gherkin) for a single test by its Jira key. */
export const getTestDetail = (testKey: string): Promise<XrayTestDetail | null> =>
  invoke("get_test_detail", { testKey });

/** Update the content of an existing step on a manual test definition. */
export const updateTestStep = (
  issueId: string,
  stepId: string,
  action?: string,
  data?: string,
  result?: string,
): Promise<XrayTestStep> => invoke("update_test_step", { issueId, stepId, action, data, result });

/** Append a new step to an existing manual test definition. */
export const addTestStep = (
  issueId: string,
  action?: string,
  data?: string,
  result?: string,
): Promise<XrayTestStep> => invoke("add_test_step", { issueId, action, data, result });

/** Remove a step from a manual test definition. */
export const removeTestStep = (issueId: string, stepId: string): Promise<void> =>
  invoke("remove_test_step", { issueId, stepId });

/** Change the test type of an existing Xray test ("Manual", "Generic", or "Cucumber"). */
export const updateTestType = (issueId: string, newType: string): Promise<void> =>
  invoke("update_test_type", { issueId, newType });

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

// ── Health Cache ─────────────────────────────────────────────────────────────

export const loadHealthCache = (projectKey: string): Promise<TestLastRunEntry[]> =>
  invoke("load_health_cache", { projectKey });

export const saveHealthCache = (
  projectKey: string,
  entries: TestLastRunEntry[],
): Promise<void> => invoke("save_health_cache", { projectKey, entries });

// ── Confluence ────────────────────────────────────────────────────────────────

export const listConfluenceSpaces = (): Promise<ConfluenceSpace[]> =>
  invoke("list_confluence_spaces");

export const listConfluencePages = (
  spaceId: string,
  parentId?: string,
): Promise<ConfluencePage[]> =>
  invoke("list_confluence_pages", { spaceId, parentId: parentId ?? null });

export const listConfluenceChildren = (
  parentId: string,
  parentType: string,
): Promise<ConfluenceChild[]> =>
  invoke("list_confluence_children", { parentId, parentType });

export const getConfluencePage = (pageId: string): Promise<ConfluencePage> =>
  invoke("get_confluence_page", { pageId });

export const createConfluencePage = (
  spaceId: string,
  parentId: string | null,
  title: string,
  body: string,
): Promise<ConfluencePage> =>
  invoke("create_confluence_page", { spaceId, parentId, title, body });

export const updateConfluencePage = (
  pageId: string,
  versionNumber: number,
  title: string,
  body: string,
): Promise<ConfluencePage> =>
  invoke("update_confluence_page", { pageId, versionNumber, title, body });

export const uploadConfluenceAttachment = (
  pageId: string,
  filePath: string,
): Promise<ConfluenceAttachment> =>
  invoke("upload_confluence_attachment", { pageId, filePath });

/** Upload raw bytes as a Confluence attachment (used for clipboard-pasted content). */
export const uploadConfluenceAttachmentBytes = (
  pageId: string,
  fileName: string,
  bytes: number[],
  mimeType: string,
): Promise<ConfluenceAttachment> =>
  invoke("upload_confluence_attachment_bytes", { pageId, fileName, bytes, mimeType });

export const listConfluenceAttachments = (
  pageId: string,
): Promise<ConfluenceAttachment[]> =>
  invoke("list_confluence_attachments", { pageId });

export const fetchConfluenceAttachment = (
  downloadUrl: string,
  mimeType: string,
): Promise<string> =>
  invoke("fetch_confluence_attachment", { downloadUrl, mimeType });

export const copyConfluenceAttachments = (
  sourcePageId: string,
  targetPageId: string,
  filenames: string[],
): Promise<number> =>
  invoke("copy_confluence_attachments", {
    sourcePageId,
    targetPageId,
    filenames,
  });

// ── API Usage ─────────────────────────────────────────────────────────────────

export const getApiUsage = (): Promise<import("@/types").ApiUsageSnapshot> =>
  invoke("get_api_usage");
