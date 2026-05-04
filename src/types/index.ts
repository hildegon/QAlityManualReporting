/**
 * @file src/types/index.ts — Single source of truth for all shared TypeScript interfaces.
 *
 * ## Table of contents
 *
 * ### Config
 *   `AppConfig`                                         Jira + Xray credentials
 *
 * ### Jira
 *   `JiraIssueLinkType`                                 Issue link type catalog entry
 *   `JiraProject`                                       Project metadata
 *   `JiraComponent`, `JiraTransition`, `JiraUser`       Project sub-entities
 *   `JiraVersion`                                       Fix / affected version
 *   `JiraIssueLink`, `JiraBug`, `JiraIssueDetail`       Issue data
 *   `JiraAttachment`, `JiraCommentFlat`, `DescriptionBlock`  Attachment & comment helpers
 *   `CreateBugResult`                                   Bug creation result
 *
 * ### Xray — Core Entities
 *   `TestPlan`, `TestExecution`                         Plan / execution issues
 *   `TestType`                                          Manual | Cucumber | Generic
 *   `TestRun`, `TestRunStatus`, `TestRunStep`           Run + step shapes
 *   `StepStatus`                                        Step-level status
 *   `CucumberResult`, `CucumberResultsStep`             Cucumber scenario results
 *
 * ### Xray — Dataset / Iterations (parametrized manual tests)
 *   `TestRunParameter`                                  Name/value parameter pair
 *   `TestRunIteration`, `TestRunIterationStepResult`    Dataset row results
 *
 * ### Xray — Status Enums
 *   `XrayTestRunStatus`                                 Xray run status enum entry
 *   `XrayStepStatus`                                    Xray step status enum entry
 *   `CreateTestExecutionResult`                         Execution creation result
 *
 * ### Xray — Test Entities
 *   `XrayTest`, `XrayTestStep`, `XrayTestExportData`    Test + step definitions
 *   `XrayTestWithStatus`                                Test enriched with latest status
 *   `LatestTestStatus`, `TestLastRunEntry`              Latest status shapes
 *   `XrayTestSet`, `TestSetMemberInfo`, `TestSetMembershipsResponse`  Test set membership
 *   `TestRunsPage`                                      Paginated test-runs response
 *
 * ### Create Result Types
 *   `CreateTestSetResult`                               Test set creation result
 *   `CreateTestStepInput`, `CreatedTestStep`, `CreatedTest`, `CreateTestResult`  Test creation
 *   `CreatedTestPlan`, `CreateTestPlanResult`           Test plan creation result
 */

// ── Config ────────────────────────────────────────────────────────────────────

/** Credentials for Jira and Xray Cloud, stored encrypted on disk. */
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

/** A Jira project as returned by `get_jira_projects`. */
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
  start_date?: string;
}

/** A "Related Work" entry attached to a Jira version (release). */
export interface VersionRelatedWork {
  category: string;
  relatedWorkId?: string;
  title?: string;
  url?: string;
}

/**
 * QA approval record stored as a Jira version property under the key `"qa-approval"`.
 * Written by the app when a user explicitly approves a release via the QA Approval banner.
 */
export interface QaApproval {
  approved: boolean;
  display_name: string;
  account_id: string;
  approved_at: string;
  note?: string;
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

/** A file attachment returned as part of a Jira issue's fields. */
export interface JiraAttachment {
  id: string;
  filename: string;
  mime_type: string;
  /** Authenticated download URL for the full content. */
  content: string;
  /** Thumbnail URL — only present for image attachments. */
  thumbnail: string | null;
}

/** A Jira comment with its body pre-converted from ADF to plain text. */
export interface JiraCommentFlat {
  id: string;
  author: string | null;
  body: string | null;
  created: string | null;
  updated: string | null;
}

/** A block in a rendered description — either plain text or an embedded media attachment. */
export type DescriptionBlock =
  | { type: "text"; content: string }
  | { type: "media"; filename: string };

/** Flattened issue detail returned by `get_issue_detail`. */
export interface JiraIssueDetail {
  key: string;
  summary: string;
  /** Structured description: interleaved text and inline media blocks. */
  description_blocks: DescriptionBlock[];
  assignee: string | null;
  status: string | null;
  issue_type: string | null;
  priority: string | null;
  attachments: JiraAttachment[];
  comments: JiraCommentFlat[];
}

// ── Xray ──────────────────────────────────────────────────────────────────────

/** An Xray test plan issue. */
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

/** An Xray test execution issue. */
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
  /** Execution duration in seconds. */
  duration?: number;
  /** Robot Framework log output. */
  log?: string;
  /** Inline embeddings (screenshots, files) attached to this step. */
  embeddings?: ResultsEmbedding[];
}

/** Inline embedding on a Cucumber step (usually a screenshot). */
export interface ResultsEmbedding {
  filename?: string;
  /** MIME type (e.g. "image/png"). */
  mime_type?: string;
  /** Base64-encoded file content — may be absent for large files. */
  data?: string;
  /** Fallback download URL when inline data is not provided. */
  download_link?: string;
}

/** A single Cucumber scenario result (one per scenario / outline row). */
export interface CucumberResult {
  status?: StepStatus;
  /** Scenario name. */
  name?: string;
  /** Error/failure log output (JUnit, xUnit, NUnit, TestNG). */
  log?: string;
  /** Execution duration in seconds. */
  duration?: number;
  /** Background steps (run before each scenario). */
  backgrounds?: CucumberResultsStep[];
  /** Hook steps (before/after each scenario). */
  hooks?: CucumberResultsStep[];
  steps?: CucumberResultsStep[];
}

/** Evidence file attached to a test run or step. */
export interface Evidence {
  id?: string;
  filename?: string;
  /** Whether the file is stored in Jira (vs Xray storage). */
  stored_in_jira?: boolean;
  /** Direct download URL. */
  download_link?: string;
  /** File size in bytes. */
  size?: number;
  /** ISO-8601 creation timestamp. */
  created_on?: string;
}

/** A single test run within a test execution. */
export interface TestRun {
  id: string;
  status: TestRunStatus;
  /** Test type for this run (Manual, Cucumber, Generic). */
  test_type?: TestType;
  /** Raw Gherkin feature definition string (present for Cucumber tests). */
  gherkin?: string;
  /** "Scenario" or "Scenario Outline" — present for Cucumber tests. */
  scenario_type?: string;
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
  /** Parent execution (populated by queries that select `testExecution`). */
  test_execution?: {
    issue_id: string;
    jira: { key: string; summary: string };
  };
  /** Evidence files (screenshots, logs, etc.) attached to this run. */
  evidence?: Evidence[];
}

/** The overall status of a test run (e.g. PASS, FAIL, TODO). */
export interface TestRunStatus {
  name: string;
  color?: string;
  description?: string;
  is_final?: boolean;
}

/** A manual test step with its execution result (actual result, comment, defects). */
export interface TestRunStep {
  id: string;
  status?: StepStatus;
  action?: string;
  data?: string;
  result?: string;
  actual_result?: string;
  comment?: string;
  defects?: string[];
  /** Evidence files (screenshots, logs, etc.) attached to this step. */
  evidence?: Evidence[];
}

/** The status of a manual test step (PASS, FAIL, TODO, etc.). */
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

/** Result returned by the `create_test_execution` Tauri command. */
export interface CreateTestExecutionResult {
  test_execution: {
    issue_id: string;
    jira: { key: string; summary: string };
  };
}

/** A single Xray test returned by `get_tests`. */
export interface XrayTest {
  issue_id: string;
  test_type?: { name: string };
  jira: {
    key: string;
    summary: string;
    status?: { name: string };
    priority?: { name: string };
    components?: { name: string }[];
    labels?: string[];
    created?: string;
    assignee?: { display_name?: string };
  };
}

/** A step in a Manual test definition, returned by `get_tests_export_data`. */
export interface XrayTestStep {
  id?: string;
  action?: string;
  data?: string;
  result?: string;
}

/** Per-test content returned by `get_tests_export_data` (steps, gherkin, unstructured). */
export interface XrayTestExportData {
  issue_id: string;
  steps?: XrayTestStep[];
  gherkin?: string;
  unstructured?: string;
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
  latest_status?: LatestTestStatus | null;
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
  set_to_tests: Record<string, string[]>;
  test_sets: XrayTestSet[];
}

/** Paginated response from `get_test_runs` Tauri command. */
export interface TestRunsPage {
  total: number;
  start?: number;
  limit?: number;
  results: TestRun[];
}

/** Minimal test-run page returned by `get_test_run_statuses` — status only. */
export interface TestRunStatusEntry {
  status: TestRunStatus;
}

export interface TestRunStatusesPage {
  total: number;
  start?: number;
  limit?: number;
  results: TestRunStatusEntry[];
}

/** Aggregated status counts for a single execution — returned by batch summary. */
export interface ExecSummaryResult {
  counts: Record<string, number>;
  total: number;
}

/** Lightweight test-run entry for version-stats aggregation (status + test identity). */
export interface TestRunStatEntry {
  status: TestRunStatus;
  /** Snapshot of the test type at execution-creation time — may be stale. Prefer test.test_type. */
  test_type?: TestType;
  test: {
    issue_id: string;
    /** Current live test type from the test entity — overrides the snapshot on the test run. */
    test_type?: TestType;
    jira: { key: string; summary: string };
  };
}

export interface TestRunStatsPage {
  total: number;
  start?: number;
  limit?: number;
  results: TestRunStatEntry[];
}

// ── Xray Test Detail ──────────────────────────────────────────────────────────

export interface XrayTestStepDefinition {
  id?: string;
  action?: string;
  data?: string;
  result?: string;
}

export interface XrayTestDetail {
  issue_id: string;
  test_type?: { name: string; kind?: string };
  steps?: XrayTestStepDefinition[];
  gherkin?: string;
  unstructured?: string;
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

// ── Confluence ────────────────────────────────────────────────────────────────

/** A Confluence Cloud space. */
export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  /** `"global"` or `"personal"`. */
  spaceType: string;
  /** ID of the space's homepage (root page). */
  homepageId: string | null;
}

/** A Confluence Cloud page. */
export interface ConfluencePage {
  id: string;
  title: string;
  space_id: string;
  parent_id: string | null;
  body_storage: string | null;
  version_number: number | null;
  web_url: string | null;
}

/** A child item in the Confluence content tree (page or folder). */
export interface ConfluenceChild {
  id: string;
  title: string;
  /** `"page"` or `"folder"`. */
  contentType: string;
  spaceId: string;
}

/** An attachment on a Confluence page. */
export interface ConfluenceAttachment {
  id: string;
  title: string;
  /** Absolute download URL. */
  downloadUrl: string;
  /** MIME type (e.g. `"image/png"`). */
  mediaType: string;
}

// ── API Usage ──────────────────────────────────────────────────────────────────

/** Per-service API usage snapshot returned by the `get_api_usage` command. */
export interface ServiceUsageSnapshot {
  calls_this_hour: number;
  hour_start_ms: number;
  last_remaining: number | null;
  last_limit: number | null;
  last_reset_ms: number | null;
  calls_total: number;
  rate_limit_hits: number;
  last_rate_limited_at: number | null;
  calls_all_time: number;
  rate_limit_hits_all_time: number;
}

/** Combined Jira + Xray API usage snapshot. */
export interface ApiUsageSnapshot {
  jira: ServiceUsageSnapshot;
  xray: ServiceUsageSnapshot;
  confluence: ServiceUsageSnapshot;
}
