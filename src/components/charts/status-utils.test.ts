import { describe, it, expect } from "vitest";
import { findSlice, buildSlicesFromCounts, buildSlicesFromTests } from "./status-utils";

// ── findSlice ─────────────────────────────────────────────────────────────────

describe("findSlice", () => {
  it("returns the exact palette entry for known keys", () => {
    expect(findSlice("PASS").key).toBe("PASS");
    expect(findSlice("FAIL").key).toBe("FAIL");
    expect(findSlice("BLOCKED").key).toBe("BLOCKED");
    expect(findSlice("EXECUTING").key).toBe("EXECUTING");
    expect(findSlice("TODO").key).toBe("TODO");
  });

  it("is case-insensitive for exact palette keys", () => {
    expect(findSlice("pass").key).toBe("PASS");
    expect(findSlice("Fail").key).toBe("FAIL");
    expect(findSlice("blocked").key).toBe("BLOCKED");
  });

  it("maps NOT RUN alias to TODO", () => {
    expect(findSlice("NOT RUN").key).toBe("TODO");
    expect(findSlice("not run").key).toBe("TODO");
  });

  it("maps N/A and NA aliases to N/A", () => {
    expect(findSlice("N/A").key).toBe("N/A");
    expect(findSlice("NA").key).toBe("N/A");
    expect(findSlice("na").key).toBe("N/A");
  });

  it("maps PASSED prefix to PASS", () => {
    expect(findSlice("PASSED").key).toBe("PASS");
    expect(findSlice("passed").key).toBe("PASS");
  });

  it("maps FAILED prefix to FAIL", () => {
    expect(findSlice("FAILED").key).toBe("FAIL");
    expect(findSlice("failed").key).toBe("FAIL");
  });

  it("returns a fallback entry for unknown statuses", () => {
    const result = findSlice("CUSTOM_STATUS");
    expect(result.key).toBe("CUSTOM_STATUS");
    expect(result.label).toBe("CUSTOM_STATUS");
    expect(result.color).toBe("#64748b");
  });
});

// ── buildSlicesFromCounts ─────────────────────────────────────────────────────

describe("buildSlicesFromCounts", () => {
  it("returns empty array when total is 0", () => {
    expect(buildSlicesFromCounts({ PASS: 5 }, 0)).toEqual([]);
  });

  it("builds a single slice with correct count and percentage", () => {
    const slices = buildSlicesFromCounts({ PASS: 3 }, 3);
    expect(slices).toHaveLength(1);
    expect(slices[0]!.key).toBe("PASS");
    expect(slices[0]!.count).toBe(3);
    expect(slices[0]!.pct).toBeCloseTo(1);
  });

  it("merges alias statuses into canonical keys", () => {
    const slices = buildSlicesFromCounts({ PASS: 2, PASSED: 3 }, 5);
    expect(slices).toHaveLength(1);
    expect(slices[0]!.key).toBe("PASS");
    expect(slices[0]!.count).toBe(5);
  });

  it("respects palette order (PASS before FAIL before TODO)", () => {
    const slices = buildSlicesFromCounts({ TODO: 1, FAIL: 1, PASS: 1 }, 3);
    expect(slices[0]!.key).toBe("PASS");
    expect(slices[1]!.key).toBe("FAIL");
    expect(slices[2]!.key).toBe("TODO");
  });

  it("computes fractional percentages correctly", () => {
    const slices = buildSlicesFromCounts({ PASS: 1, FAIL: 1 }, 2);
    expect(slices.find((s) => s.key === "PASS")!.pct).toBeCloseTo(0.5);
    expect(slices.find((s) => s.key === "FAIL")!.pct).toBeCloseTo(0.5);
  });

  it("puts unknown statuses after palette keys, sorted alphabetically", () => {
    const slices = buildSlicesFromCounts({ PASS: 1, ZEBRA: 1, ALPHA: 1 }, 3);
    const keys = slices.map((s) => s.key);
    expect(keys[0]).toBe("PASS");
    expect(keys.indexOf("ALPHA")).toBeLessThan(keys.indexOf("ZEBRA"));
  });
});

// ── buildSlicesFromTests ──────────────────────────────────────────────────────

describe("buildSlicesFromTests", () => {
  it("returns empty array for empty input", () => {
    expect(buildSlicesFromTests([])).toEqual([]);
  });

  it("treats missing latest_status as TODO", () => {
    const slices = buildSlicesFromTests([{ latest_status: null }, {}]);
    expect(slices).toHaveLength(1);
    expect(slices[0]!.key).toBe("TODO");
    expect(slices[0]!.count).toBe(2);
  });

  it("counts tests by their resolved status key", () => {
    const tests = [
      { latest_status: { name: "PASS" } },
      { latest_status: { name: "PASSED" } },
      { latest_status: { name: "FAIL" } },
    ];
    const slices = buildSlicesFromTests(tests);
    expect(slices.find((s) => s.key === "PASS")!.count).toBe(2);
    expect(slices.find((s) => s.key === "FAIL")!.count).toBe(1);
  });

  it("calculates percentage relative to total test count", () => {
    const tests = [{ latest_status: { name: "PASS" } }, { latest_status: { name: "FAIL" } }];
    const slices = buildSlicesFromTests(tests);
    expect(slices.find((s) => s.key === "PASS")!.pct).toBeCloseTo(0.5);
    expect(slices.find((s) => s.key === "FAIL")!.pct).toBeCloseTo(0.5);
  });
});
