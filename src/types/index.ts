// ── Config ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  jira_url: string;
  jira_email: string;
  jira_api_token: string;
  xray_client_id: string;
  xray_client_secret: string;
}

/** A Jira issue link type as returned by GET /rest/api/3/issueLinkType. */
export interface JiraIssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
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

/** A single issue link as returned by Jira's `issuelinks` field. */
export interface JiraIssueLink {
  id: string;
  link_type: {
    outward?: string;
    inward?: string;
  };
  outward_issue?: {
    id: string;
    key: string;
    fields: { summary: string; issue_type?: { name: string } };
  };
  inward_issue?: {
    id: string;
    key: string;
    fields: { summary: string; issue_type?: { name: string } };
  };
}

/** A Bug / Story / Task issue returned by `get_bugs_by_version` or `get_version_issues`. */
export interface JiraBug {
  id: string;
  key: string;
  fields: {
    summary: string;
    status?: { name: string; category?: { key: string; name: string } };
    priority?: { name: string };
    assignee?: { account_id: string; display_name: string };
    /** Present when fetched via `get_version_issues`. */
    issue_type?: { name: string };
    /** Issue links — used to find which tests detected this bug. */
    issue_links?: JiraIssueLink[];
  };
}

/** Result returned by `create_bug`. */
export interface CreateBugResult {
  id: string;
  key: string;
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
    fix_versions?: Array<{ id: string; name: string }>;
  };
}

/** The type of an Xray test (Manual, Cucumber, Generic). */
export interface TestType {
  name: string;
  kind?: string;
}

/** A single step within a Cucumber scenario result. */
export interface CucumberResultsStep {
  /** Gherkin keyword (Given, When, Then, And, But) — absent for hooks. */
  keyword?: string;
  /** The step text. */
  name?: string;
  status?: StepStatus;
  /** Error/failure message from the test runner. */
  error?: string;
}

/** A single Cucumber scenario result (one per scenario / outline row). */
export interface CucumberResult {
  status?: StepStatus;
  steps?: CucumberResultsStep[];
}

export interface TestRun {
  id: string;
  status: TestRunStatus;
  /** Test type for this run (Manual, Cucumber, Generic). */
  test_type?: TestType;
  /** Raw Gherkin feature definition string (present for Cucumber tests). */
  gherkin?: string;
  test: {
    issue_id: string;
    jira: { key: string; summary: string };
  };
  comment?: string;
  steps?: TestRunStep[];
  /** Cucumber scenario results (one entry per scenario / outline row). */
  results?: CucumberResult[];
  started_on?: string;
  finished_on?: string;
  assignee_id?: string;
  executed_by_id?: string;
  /** Jira issue keys of defects (bugs) linked to this test run via Xray. */
  defects?: string[];
  /** Parameter names used when a dataset is attached (e.g. [{name:"env"},{name:"user"}]). */
  parameters?: TestRunParameter[];
  /** Iteration results for parametrized manual tests (one entry per dataset row). */
  iterations?: {
    total?: number;
    results: TestRunIteration[];
  };
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

// ── Dataset / Iterations (parametrized manual tests) ─────────────────────────

/** A single parameter name/value pair on a test run or iteration. */
export interface TestRunParameter {
  name?: string;
  value?: string;
}

/** Per-step result inside a single iteration. */
export interface TestRunIterationStepResult {
  /** ID matching the corresponding TestRunStep.id */
  id?: string;
  status?: StepStatus;
  comment?: string;
  actual_result?: string;
  defects?: string[];
}

/** One row of a parametrized manual test run (one dataset row). */
export interface TestRunIteration {
  /** 1-based rank ("1", "2", …) */
  rank?: string;
  parameters: TestRunParameter[];
  status?: StepStatus;
  step_results?: {
    results: TestRunIterationStepResult[];
  };
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
    status?: { name: string };
  };
}

/** The most recent test run for a single test, returned by `get_tests_health_data`. */
export interface TestLastRunEntry {
  test_issue_id: string;
  finished_on?: string;
  started_on?: string;
  status?: LatestTestStatus;
}

/** The latest execution status of a test, as returned by Xray's latestStatus field. */
export interface LatestTestStatus {
  name: string;
  color?: string;
  description?: string;
  is_final?: boolean;
}

/** An Xray test enriched with its latest execution status (for the Coverage page). */
export interface XrayTestWithStatus {
  issue_id: string;
  jira: {
    key: string;
    summary: string;
    /** Jira workflow status (Active, Deprecated, Won't Do, etc.). */
    status?: { name: string };
  };
  /** undefined if the test has never been executed. */
  latest_status?: LatestTestStatus;
}

/** A single Xray test set returned by `get_test_sets`. */
export interface XrayTestSet {
  issue_id: string;
  jira: {
    key: string;
    summary: string;
    status?: { name: string };
  };
}

/** Lightweight info about a test set, used in membership maps. */
export interface TestSetMemberInfo {
  issue_id: string;
  key: string;
  summary: string;
}

/** Response from `get_all_test_set_memberships` — maps test issue IDs to their test sets. */
export interface TestSetMembershipsResponse {
  memberships: Record<string, TestSetMemberInfo[]>;
  test_sets: XrayTestSet[];
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

// ── Create Test Plan ──────────────────────────────────────────────────────────

/** The test plan object returned inside `CreateTestPlanResult`. */
export interface CreatedTestPlan {
  issue_id: string;
  jira: { key: string; summary: string; status?: { name: string } };
}

/** Full response from the `create_test_plan` Tauri command. */
export interface CreateTestPlanResult {
  test_plan?: CreatedTestPlan;
  warnings?: string[];
}

/**
 * Returned by `get_tests` / `get_test_sets` Tauri commands.
 * Contains the first page so the UI can render immediately.
 * When `done` is `false`, remaining items arrive via background Tauri events.
 */
