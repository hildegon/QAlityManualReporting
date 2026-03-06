/**
 * Typed wrappers around Tauri's `invoke` function.
 * All backend communication flows through this module.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  CreateTestExecutionResult,
  JiraProject,
  TestExecution,
  TestPlan,
  TestRunsPage,
  XrayStepStatus,
  XrayTest,
  XrayTestRunStatus,
  XrayTestSet,
} from "@/types";

// ── Config ────────────────────────────────────────────────────────────────────

export const getConfig = (): Promise<AppConfig> => invoke("get_config");

export const saveConfig = (config: AppConfig): Promise<void> =>
  invoke("save_config_cmd", { config });

export const clearConfig = (): Promise<void> => invoke("clear_config");

// ── Jira ──────────────────────────────────────────────────────────────────────

export const getJiraProjects = (): Promise<JiraProject[]> => invoke("get_jira_projects");

export const validateJiraCredentials = (): Promise<string> => invoke("validate_jira_credentials");

// ── Xray ──────────────────────────────────────────────────────────────────────

export const authenticateXray = (): Promise<void> => invoke("authenticate_xray");

export const getTestPlans = (projectKey: string, limit?: number): Promise<TestPlan[]> =>
  invoke("get_test_plans", { projectKey, limit });

export const getTestExecutions = (projectKey: string, limit?: number): Promise<TestExecution[]> =>
  invoke("get_test_executions", { projectKey, limit });

export const getTestRuns = (
  testExecutionIssueId: string,
  limit?: number,
  start?: number,
): Promise<TestRunsPage> => invoke("get_test_runs", { testExecutionIssueId, limit, start });

export const updateTestRunStatus = (testRunId: string, status: string): Promise<void> =>
  invoke("update_test_run_status", { testRunId, status });

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

export const getTests = (projectKey: string, limit?: number): Promise<XrayTest[]> =>
  invoke("get_tests", { projectKey, limit });

export const getTestSets = (projectKey: string, limit?: number): Promise<XrayTestSet[]> =>
  invoke("get_test_sets", { projectKey, limit });

export const getTestSetTests = (issueId: string): Promise<XrayTest[]> =>
  invoke("get_test_set_tests", { issueId });

export const getTestPlanTests = (issueId: string): Promise<XrayTest[]> =>
  invoke("get_test_plan_tests", { issueId });
