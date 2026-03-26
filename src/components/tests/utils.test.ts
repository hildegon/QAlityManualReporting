import { describe, it, expect, beforeEach, vi } from "vitest";
import { isDeprecatingStatus, categoryColor, loadHiddenKeys, saveHiddenKeys } from "./utils";

// ── localStorage mock ─────────────────────────────────────────────────────────

function makeLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
}

// ── isDeprecatingStatus ───────────────────────────────────────────────────────

describe("isDeprecatingStatus", () => {
  it("returns true for exact deprecating keywords", () => {
    expect(isDeprecatingStatus("deprecated")).toBe(true);
    expect(isDeprecatingStatus("obsolete")).toBe(true);
    expect(isDeprecatingStatus("cancelled")).toBe(true);
    expect(isDeprecatingStatus("canceled")).toBe(true);
    expect(isDeprecatingStatus("rejected")).toBe(true);
    expect(isDeprecatingStatus("inactive")).toBe(true);
    expect(isDeprecatingStatus("withdrawn")).toBe(true);
    expect(isDeprecatingStatus("closed")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isDeprecatingStatus("DEPRECATED")).toBe(true);
    expect(isDeprecatingStatus("Obsolete")).toBe(true);
    expect(isDeprecatingStatus("CLOSED")).toBe(true);
  });

  it("matches when keyword is a substring of the status", () => {
    expect(isDeprecatingStatus("mark-deprecated")).toBe(true);
    expect(isDeprecatingStatus("auto-closed")).toBe(true);
  });

  it("returns false for active statuses", () => {
    expect(isDeprecatingStatus("PASS")).toBe(false);
    expect(isDeprecatingStatus("FAIL")).toBe(false);
    expect(isDeprecatingStatus("TODO")).toBe(false);
    expect(isDeprecatingStatus("EXECUTING")).toBe(false);
    expect(isDeprecatingStatus("BLOCKED")).toBe(false);
  });

  it('matches "won\'t do" and "wont do"', () => {
    expect(isDeprecatingStatus("won't do")).toBe(true);
    expect(isDeprecatingStatus("wont do")).toBe(true);
  });
});

// ── categoryColor ─────────────────────────────────────────────────────────────

describe("categoryColor", () => {
  it("returns emerald classes for 'done'", () => {
    const color = categoryColor("done");
    expect(color).toContain("emerald");
  });

  it("returns amber classes for 'indeterminate'", () => {
    const color = categoryColor("indeterminate");
    expect(color).toContain("amber");
  });

  it("returns slate classes for unknown keys", () => {
    const color = categoryColor("other");
    expect(color).toContain("slate");
  });

  it("returns slate classes when key is undefined", () => {
    const color = categoryColor(undefined);
    expect(color).toContain("slate");
  });
});

// ── loadHiddenKeys / saveHiddenKeys ───────────────────────────────────────────

describe("loadHiddenKeys", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageMock());
  });

  it("returns an empty set when key is not in storage", () => {
    const keys = loadHiddenKeys("test-key");
    expect(keys.size).toBe(0);
  });

  it("returns the stored set when valid JSON array is present", () => {
    localStorage.setItem("test-key", JSON.stringify(["a", "b", "c"]));
    const keys = loadHiddenKeys("test-key");
    expect(keys.size).toBe(3);
    expect(keys.has("a")).toBe(true);
    expect(keys.has("c")).toBe(true);
  });

  it("returns empty set when stored value is invalid JSON", () => {
    localStorage.setItem("test-key", "not-json{{");
    const keys = loadHiddenKeys("test-key");
    expect(keys.size).toBe(0);
  });
});

describe("saveHiddenKeys", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageMock());
  });

  it("persists a set so loadHiddenKeys can read it back", () => {
    const original = new Set(["x", "y", "z"]);
    saveHiddenKeys("test-key", original);
    const loaded = loadHiddenKeys("test-key");
    expect(loaded).toEqual(original);
  });

  it("does not throw when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => { throw new Error("storage full"); },
      removeItem: () => {},
      clear: () => {},
    });
    expect(() => saveHiddenKeys("test-key", new Set(["a"]))).not.toThrow();
  });
});
