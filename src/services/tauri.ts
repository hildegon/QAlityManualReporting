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
  TestRun,
  XrayStepStatus,
  XrayTestRunStatus,
} from "@/types";

// ── Config ────────────────────────────────────────────────────────────────────

export const getConfig = (): Promise<AppConfig> => invoke("get_config");

export const saveConfig = (config: AppConfig): Promise<void> =>
  invoke("save_config_cmd", { config });

export const clearConfig = (): Promise<void> => invoke("clear_config");

// ── Jira ──────────────────────────────────────────────────────────────────────

export const getJiraProjects = (): Promise<JiraProject[]> => invoke("get_jira_projects");

export const validateJiraCredentials = (): Promise<string> =>
  invoke("validate_jira_credentials");

// ── Xray ──────────────────────────────────────────────────────────────────────

export const authenticateXray = (): Promise<void> => invoke("authenticate_xray");

export const getTestPlans = (projectKey: string, limit?: number): Promise<TestPlan[]> =>
  invoke("get_test_plans", { projectKey, limit });

export const getTestExecutions = (
  projectKey: string,
  limit?: number,
): Promise<TestExecution[]> => invoke("get_test_executions", { projectKey, limit });

export const getTestRuns = (
  testExecutionIssueId: string,
  limit?: number,
): Promise<TestRun[]> => invoke("get_test_runs", { testExecutionIssueId, limit });

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

export const createTestExecution = (
  projectId: string,
  summary: string,
  testPlanId?: string,
  description?: string,
): Promise<CreateTestExecutionResult> =>
  invoke("create_test_execution", { projectId, summary, testPlanId, description });
