import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

// The Tauri invoke mock is set up in src/test/setup.ts
const mockInvoke = vi.mocked(invoke);

describe("tauri service wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getConfig calls the correct command", async () => {
    const { getConfig } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce({
      jira_url: "https://test.atlassian.net",
      jira_email: "test@test.com",
      jira_api_token: "tok",
      xray_client_id: "cid",
      xray_client_secret: "sec",
    });

    const result = await getConfig();
    expect(mockInvoke).toHaveBeenCalledWith("get_config");
    expect(result.jira_url).toBe("https://test.atlassian.net");
  });

  it("saveConfig calls the correct command with config payload", async () => {
    const { saveConfig } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce(undefined);

    const config = {
      jira_url: "https://myorg.atlassian.net",
      jira_email: "user@org.com",
      jira_api_token: "token",
      xray_client_id: "id",
      xray_client_secret: "secret",
    };

    await saveConfig(config);
    expect(mockInvoke).toHaveBeenCalledWith("save_config_cmd", { config });
  });

  it("updateTestRunStatus passes id and status only", async () => {
    const { updateTestRunStatus } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce(undefined);

    await updateTestRunStatus("run-123", "PASS");
    expect(mockInvoke).toHaveBeenCalledWith("update_test_run_status", {
      testRunId: "run-123",
      status: "PASS",
    });
  });

  it("updateTestRunComment passes id and comment", async () => {
    const { updateTestRunComment } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce(undefined);

    await updateTestRunComment("run-123", "Looks good");
    expect(mockInvoke).toHaveBeenCalledWith("update_test_run_comment", {
      testRunId: "run-123",
      comment: "Looks good",
    });
  });

  it("getTestExecutions passes projectKey and optional limit", async () => {
    const { getTestExecutions } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce([]);

    await getTestExecutions("PROJ");
    expect(mockInvoke).toHaveBeenCalledWith("get_test_executions", {
      projectKey: "PROJ",
      limit: undefined,
    });
  });

  it("getTestRuns passes testExecutionIssueId, limit, and start", async () => {
    const { getTestRuns } = await import("./tauri");
    const mockPage = {
      total: 120,
      start: 50,
      limit: 50,
      results: [],
    };
    mockInvoke.mockResolvedValueOnce(mockPage);

    const result = await getTestRuns("exec-123", 50, 50);
    expect(mockInvoke).toHaveBeenCalledWith("get_test_runs", {
      testExecutionIssueId: "exec-123",
      limit: 50,
      start: 50,
    });
    expect(result.total).toBe(120);
    expect(result.start).toBe(50);
    expect(result.results).toEqual([]);
  });

  it("getTestRuns defaults start to undefined when omitted", async () => {
    const { getTestRuns } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce({ total: 5, results: [] });

    await getTestRuns("exec-456");
    expect(mockInvoke).toHaveBeenCalledWith("get_test_runs", {
      testExecutionIssueId: "exec-456",
      limit: undefined,
      start: undefined,
    });
  });

  it("updateTestRunStepStatus passes testRunId, stepId, and status", async () => {
    const { updateTestRunStepStatus } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce(undefined);

    await updateTestRunStepStatus("run-123", "step-456", "FAILED");
    expect(mockInvoke).toHaveBeenCalledWith("update_test_run_step_status", {
      testRunId: "run-123",
      stepId: "step-456",
      status: "FAILED",
    });
  });

  it("updateTestRunStep passes all optional fields", async () => {
    const { updateTestRunStep } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce(undefined);

    await updateTestRunStep("run-123", "step-456", "a comment", "actual result", "PASS");
    expect(mockInvoke).toHaveBeenCalledWith("update_test_run_step", {
      testRunId: "run-123",
      stepId: "step-456",
      comment: "a comment",
      actualResult: "actual result",
      status: "PASS",
    });
  });

  it("updateTestRunStep passes undefined for omitted fields", async () => {
    const { updateTestRunStep } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce(undefined);

    await updateTestRunStep("run-123", "step-456", "only comment");
    expect(mockInvoke).toHaveBeenCalledWith("update_test_run_step", {
      testRunId: "run-123",
      stepId: "step-456",
      comment: "only comment",
      actualResult: undefined,
      status: undefined,
    });
  });

  it("createTestExecution passes projectKey and summary", async () => {
    const { createTestExecution } = await import("./tauri");
    mockInvoke.mockResolvedValueOnce({
      test_execution: { issue_id: "12345", jira: { key: "PROJ-1", summary: "Test" } },
    });

    const result = await createTestExecution("PROJ", "My Test Execution");
    expect(mockInvoke).toHaveBeenCalledWith("create_test_execution", {
      projectKey: "PROJ",
      summary: "My Test Execution",
      testPlanId: undefined,
      testIssueIds: undefined,
      description: undefined,
    });
    expect(result.test_execution.jira.key).toBe("PROJ-1");
  });
});
