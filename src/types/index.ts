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
  steps?: TestRunStep[];
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

export interface TestRunStep {
  id: string;
  status?: StepStatus;
  action?: string;
  data?: string;
  result?: string;
  actual_result?: string;
  comment?: string;
  defects?: string[];
}

export interface StepStatus {
  name: string;
  description?: string;
  color?: string;
}

/** Full status object returned by Xray's getStatuses API. */
export interface XrayTestRunStatus {
  name: string;
  description?: string;
  is_final?: boolean;
  color?: string;
}

/** Step status returned by Xray's getStepStatuses API. */
export interface XrayStepStatus {
  name: string;
  description?: string;
  color?: string;
}

export interface CreateTestExecutionResult {
  test_execution: {
    issue_id: string;
    jira: { key: string; summary: string };
  };
}

/** A single Xray test returned by `get_tests`. */
export interface XrayTest {
  issue_id: string;
  jira: {
    key: string;
    summary: string;
  };
}

/** A single Xray test set returned by `get_test_sets`. */
export interface XrayTestSet {
  issue_id: string;
  jira: {
    key: string;
    summary: string;
  };
}

/** Paginated response from `get_test_runs` Tauri command. */
export interface TestRunsPage {
  total: number;
  start?: number;
  limit?: number;
  results: TestRun[];
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export type TestStatusName = "PASS" | "FAIL" | "TODO" | "EXECUTING" | "BLOCKED" | string;

export interface SelectOption {
  value: string;
  label: string;
}
