import { describe, it, expect } from "vitest";
import {
  normalizeStatusKey,
  PASS_STATUSES,
  FAIL_STATUSES,
  TODO_STATUSES,
  EXECUTING_STATUSES,
  CRITICAL_PRIORITIES,
} from "./statuses";

// ── normalizeStatusKey ────────────────────────────────────────────────────────

describe("normalizeStatusKey", () => {
  it("returns canonical PASS for PASS and PASSED", () => {
    expect(normalizeStatusKey("PASS")).toBe("PASS");
    expect(normalizeStatusKey("PASSED")).toBe("PASS");
    expect(normalizeStatusKey("passed")).toBe("PASS");
  });

  it("returns canonical FAIL for FAIL, FAILED, and BLOCKED", () => {
    expect(normalizeStatusKey("FAIL")).toBe("FAIL");
    expect(normalizeStatusKey("FAILED")).toBe("FAIL");
    expect(normalizeStatusKey("BLOCKED")).toBe("FAIL");
    expect(normalizeStatusKey("blocked")).toBe("FAIL");
  });

  it("returns canonical EXECUTING for EXECUTING and IN PROGRESS", () => {
    expect(normalizeStatusKey("EXECUTING")).toBe("EXECUTING");
    expect(normalizeStatusKey("IN PROGRESS")).toBe("EXECUTING");
    expect(normalizeStatusKey("in progress")).toBe("EXECUTING");
  });

  it("returns canonical TODO for TODO, NOT RUN, and TO DO", () => {
    expect(normalizeStatusKey("TODO")).toBe("TODO");
    expect(normalizeStatusKey("NOT RUN")).toBe("TODO");
    expect(normalizeStatusKey("TO DO")).toBe("TODO");
    expect(normalizeStatusKey("not run")).toBe("TODO");
  });

  it("returns N/A for the NA alias", () => {
    expect(normalizeStatusKey("NA")).toBe("N/A");
    expect(normalizeStatusKey("na")).toBe("N/A");
  });

  it("returns uppercased unknown statuses unchanged", () => {
    expect(normalizeStatusKey("CUSTOM")).toBe("CUSTOM");
    expect(normalizeStatusKey("custom")).toBe("CUSTOM");
    expect(normalizeStatusKey("My Status")).toBe("MY STATUS");
  });
});

// ── Status sets ───────────────────────────────────────────────────────────────

describe("status sets", () => {
  it("PASS_STATUSES contains PASS and PASSED", () => {
    expect(PASS_STATUSES.has("PASS")).toBe(true);
    expect(PASS_STATUSES.has("PASSED")).toBe(true);
  });

  it("FAIL_STATUSES contains FAIL, FAILED, and BLOCKED", () => {
    expect(FAIL_STATUSES.has("FAIL")).toBe(true);
    expect(FAIL_STATUSES.has("FAILED")).toBe(true);
    expect(FAIL_STATUSES.has("BLOCKED")).toBe(true);
  });

  it("TODO_STATUSES contains TODO, NOT RUN, and TO DO", () => {
    expect(TODO_STATUSES.has("TODO")).toBe(true);
    expect(TODO_STATUSES.has("NOT RUN")).toBe(true);
    expect(TODO_STATUSES.has("TO DO")).toBe(true);
  });

  it("EXECUTING_STATUSES contains EXECUTING and IN PROGRESS", () => {
    expect(EXECUTING_STATUSES.has("EXECUTING")).toBe(true);
    expect(EXECUTING_STATUSES.has("IN PROGRESS")).toBe(true);
  });

  it("CRITICAL_PRIORITIES contains expected values", () => {
    expect(CRITICAL_PRIORITIES.has("highest")).toBe(true);
    expect(CRITICAL_PRIORITIES.has("critical")).toBe(true);
    expect(CRITICAL_PRIORITIES.has("blocker")).toBe(true);
    expect(CRITICAL_PRIORITIES.has("p1")).toBe(true);
    expect(CRITICAL_PRIORITIES.has("normal")).toBe(false);
  });
});
