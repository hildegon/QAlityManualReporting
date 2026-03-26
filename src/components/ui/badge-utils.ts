import type { BadgeProps } from "./badge";

/** Maps an Xray test status name to a Badge variant. */
export function statusVariant(status: string): BadgeProps["variant"] {
  switch (status.toUpperCase()) {
    case "PASS":
    case "PASSED":
      return "pass";
    case "FAIL":
    case "FAILED":
      return "fail";
    case "EXECUTING":
    case "IN PROGRESS":
      return "executing";
    case "BLOCKED":
      return "blocked";
    case "N/A":
    case "NA":
      return "na";
    case "TODO":
    case "TO DO":
    case "NOT RUN":
      return "todo";
    default:
      return "default";
  }
}
