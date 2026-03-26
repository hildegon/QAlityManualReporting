import { describe, it, expect } from "vitest";
import { newDraftStep } from "./types";

// ── newDraftStep ──────────────────────────────────────────────────────────────

describe("newDraftStep", () => {
  it("returns a step with empty action, data, and result", () => {
    const step = newDraftStep();
    expect(step.action).toBe("");
    expect(step.data).toBe("");
    expect(step.result).toBe("");
  });

  it("assigns a non-empty string _id", () => {
    const step = newDraftStep();
    expect(typeof step._id).toBe("string");
    expect(step._id.length).toBeGreaterThan(0);
  });

  it("each call produces a unique _id", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newDraftStep()._id));
    expect(ids.size).toBe(50);
  });

  it("_id values are monotonically increasing numeric strings", () => {
    const a = newDraftStep();
    const b = newDraftStep();
    expect(Number(b._id)).toBeGreaterThan(Number(a._id));
  });
});
