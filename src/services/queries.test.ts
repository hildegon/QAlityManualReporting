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
      project_key: "PROJ",
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
});
