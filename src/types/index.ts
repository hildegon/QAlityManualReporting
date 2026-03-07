// ── Config ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  jira_url: string;
  jira_email: string;
  jira_api_token: string;
  xray_client_id: string;
  xray_client_secret: string;
  /** Project key for Test Plans, Test Sets, and Tests */
  content_project_key: string;
  /** Human-readable name for the content project */
  content_project_name: string;
  /** Project key for Test Executions (may differ from content_project_key) */
  execution_project_key: string;
  /** Human-readable name for the execution project */
  execution_project_name: string;
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

/** A Jira project component returned by `get_project_components`. */
export interface JiraComponent {
  id: string;
  name: string;
}

/** The target status of a Jira workflow transition. */
export interface JiraTransitionTo {
  name: string;
  category?: { key: string; name: string };
}

/** A single workflow transition available on a Jira issue. */
export interface JiraTransition {
  id: string;
  name: string;
  to: JiraTransitionTo;
}

/** A Jira user returned by `search_users`. */
export interface JiraUser {
  account_id: string;
  display_name: string;
  avatar_urls?: {
    "48x48"?: string;
    "16x16"?: string;
  };
}

/** A Jira project version returned by `get_project_versions`. */
export interface JiraVersion {
  id: string;
  name: string;
  description?: string;
  archived?: boolean;
  released?: boolean;
  release_date?: string;
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

// ── Create Test Set ───────────────────────────────────────────────────────────

/** Full response from the `create_test_set` Tauri command. */
export interface CreateTestSetResult {
  test_set?: {
    issue_id: string;
    jira: { key: string; summary: string };
  };
  warnings?: string[];
}

// ── Create Test ───────────────────────────────────────────────────────────────

/** One manual step sent to `create_test`. */
export interface CreateTestStepInput {
  action: string;
  data?: string;
  result?: string;
}

/** A step as returned inside the created test object. */
export interface CreatedTestStep {
  id?: string;
  action?: string;
  data?: string;
  result?: string;
}

/** The test object returned by the `create_test` command. */
export interface CreatedTest {
  issue_id: string;
  jira: { key: string; summary: string };
  steps?: CreatedTestStep[];
}

/** Full response from the `create_test` Tauri command. */
export interface CreateTestResult {
  test?: CreatedTest;
  warnings?: string[];
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export type TestStatusName = "PASS" | "FAIL" | "TODO" | "EXECUTING" | "BLOCKED" | string;

export interface SelectOption {
  value: string;
  label: string;
}
