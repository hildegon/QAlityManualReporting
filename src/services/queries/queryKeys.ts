// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Page size for the test-runs infinite query inside an open execution.
 * Xray Cloud GraphQL allows up to 100 results per page; using the maximum
 * minimises round-trips when loading a large execution.
 */
export const TEST_RUNS_PAGE_SIZE = 100;

/**
 * Smaller page size used for background stats aggregation (version dashboard)
 * and the execution-list summary bar.  Kept at 10 so the first response arrives
 * quickly; the stats aggregator auto-paginates for the remainder.
 */
export const STATS_PAGE_SIZE = 10;

// ── Query keys ────────────────────────────────────────────────────────────────

export const queryKeys = {
  config: ["config"] as const,
  jiraProjects: ["jira", "projects"] as const,
  projectComponents: (projectKey: string) => ["jira", "components", projectKey] as const,
  projectVersions: (projectKey: string) => ["jira", "versions", projectKey] as const,
  issueTransitions: (issueKey: string) => ["jira", "transitions", issueKey] as const,
  userSearch: (query: string) => ["jira", "user-search", query] as const,
  testPlans: (projectKey: string) => ["xray", "test-plans", projectKey] as const,
  testExecutions: (projectKey: string) => ["xray", "test-executions", projectKey] as const,
  testExecutionsByVersion: (projectKey: string, versionName: string) =>
    ["xray", "test-executions-by-version", projectKey, versionName] as const,
  testRuns: (executionIssueId: string) => ["xray", "test-runs", executionIssueId] as const,
  iterationStepResults: (testRunId: string) =>
    ["xray", "iteration-step-results", testRunId] as const,
  tests: (projectKey: string) => ["xray", "tests", projectKey] as const,
  testSets: (projectKey: string) => ["xray", "test-sets", projectKey] as const,
  testSetTests: (issueId: string) => ["xray", "test-set-tests", issueId] as const,
  testSetTestsWithStatus: (issueId: string) =>
    ["xray", "test-set-tests-with-status", issueId] as const,
  testSetMemberships: (projectKey: string) => ["xray", "test-set-memberships", projectKey] as const,
  testPlanTests: (issueId: string) => ["xray", "test-plan-tests", issueId] as const,
  xrayStatuses: (projectId: string) => ["xray", "statuses", projectId] as const,
  stepStatuses: (projectId: string) => ["xray", "step-statuses", projectId] as const,
  bugsByVersion: (projectKey: string, versionName: string) =>
    ["jira", "bugs-by-version", projectKey, versionName] as const,
  versionIssues: (projectKey: string, versionName: string) =>
    ["jira", "version-issues", projectKey, versionName] as const,
  issueLinkTypes: ["jira", "issue-link-types"] as const,
  issueDetail: (issueKey: string) => ["jira", "issue-detail", issueKey] as const,
  attachment: (contentUrl: string) => ["jira", "attachment", contentUrl] as const,
  execSummary: (executionIssueId: string) => ["xray", "exec-summary", executionIssueId] as const,
};
