import type { XrayTestWithStatus } from "@/types";
import { findSlice } from "@/components/charts/status-utils";

export type SetQueryMap = Map<
  string,
  { tests: XrayTestWithStatus[] | undefined; isLoading: boolean; isError: boolean; error: unknown }
>;

export function passRate(tests: XrayTestWithStatus[]): number | null {
  if (tests.length === 0) return null;
  const passed = tests.filter((t) => {
    const name = t.latest_status?.name ?? "TODO";
    return findSlice(name).key === "PASS";
  }).length;
  return passed / tests.length;
}

export function hasFail(tests: XrayTestWithStatus[]): boolean {
  return tests.some((t) => {
    const name = t.latest_status?.name ?? "TODO";
    return findSlice(name).key === "FAIL";
  });
}


