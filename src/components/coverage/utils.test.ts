import { describe, it, expect } from "vitest";
import { passRate, hasFail } from "./utils";
import type { XrayTestWithStatus } from "@/types";

function makeTest(statusName?: string): XrayTestWithStatus {
  return {
    issue_id: "1",
    jira: { key: "T-1", summary: "test" },
    latest_status: statusName ? { name: statusName } : undefined,
  } as XrayTestWithStatus;
}

// ── passRate ──────────────────────────────────────────────────────────────────

describe("passRate", () => {
  it("returns null for empty array", () => {
    expect(passRate([])).toBeNull();
  });

  it("returns 1 when all tests pass", () => {
    expect(passRate([makeTest("PASS"), makeTest("PASSED")])).toBe(1);
  });

  it("returns 0 when no tests pass", () => {
    expect(passRate([makeTest("FAIL"), makeTest("TODO")])).toBe(0);
  });

  it("calculates fractional pass rate correctly", () => {
    const tests = [makeTest("PASS"), makeTest("PASS"), makeTest("FAIL")];
    expect(passRate(tests)).toBeCloseTo(2 / 3);
  });

  it("treats missing status as non-passing (TODO)", () => {
    const tests = [makeTest("PASS"), makeTest(undefined)];
    expect(passRate(tests)).toBeCloseTo(0.5);
  });
});

// ── hasFail ───────────────────────────────────────────────────────────────────

describe("hasFail", () => {
  it("returns false for empty array", () => {
    expect(hasFail([])).toBe(false);
  });

  it("returns true when at least one test has FAIL status", () => {
    expect(hasFail([makeTest("PASS"), makeTest("FAIL")])).toBe(true);
  });

  it("returns true for FAILED alias", () => {
    expect(hasFail([makeTest("PASSED"), makeTest("FAILED")])).toBe(true);
  });

  it("returns false for BLOCKED (resolves to its own key, not FAIL)", () => {
    // BLOCKED has its own palette entry — hasFail only checks for the FAIL key.
    expect(hasFail([makeTest("BLOCKED")])).toBe(false);
  });

  it("returns false when all tests pass or are unrun", () => {
    expect(hasFail([makeTest("PASS"), makeTest("TODO"), makeTest(undefined)])).toBe(false);
  });
});
