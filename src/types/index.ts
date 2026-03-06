// ── Config ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  jira_url: string;
  jira_email: string;
  jira_api_token: string;
  xray_client_id: string;
  xray_client_secret: string;
  project_key: string;
}

// ── Jira ──────────────────────────────────────────────────────────────────────

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatar_urls?: {
    "48x48"?: string;
    "16x16"?: string;
  };
  project_type_key?: string;
}

// ── Xray ──────────────────────────────────────────────────────────────────────

export interface TestPlan {
  issue_id: string;
  project_id: string;
  jira: {
    key: string;
    summary: string;
    status?: { name: string };
    issue_type?: { name: string };
  };
}

export interface TestExecution {
  issue_id: string;
  project_id: string;
  jira: {
    key: string;
    summary: string;
    status?: { name: string };
    assignee?: { account_id?: string; display_name?: string };
  };
}

export interface TestRun {
  id: string;
  status: TestRunStatus;
  test: {
    issue_id: string;
    jira: { key: string; summary: string };
  };
  comment?: string;
  started_on?: string;
  finished_on?: string;
  assignee_id?: string;
  executed_by_id?: string;
}

export interface TestRunStatus {
  name: string;
  color?: string;
  description?: string;
  is_final?: boolean;
}

/** Full status object returned by Xray's getStatuses API. */
export interface XrayTestRunStatus {
  name: string;
  description?: string;
  is_final?: boolean;
  color?: string;
}

export interface CreateTestExecutionResult {
  test_execution: {
    issue_id: string;
    jira: { key: string; summary: string };
  };
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export type TestStatusName = "PASS" | "FAIL" | "TODO" | "EXECUTING" | "BLOCKED" | string;

export interface SelectOption {
  value: string;
  label: string;
}
