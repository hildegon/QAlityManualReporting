/**
 * Generates a self-contained HTML report for a single version (or version group).
 *
 * The output is a print-ready HTML document that the user opens in a browser and
 * saves as PDF via the browser's "Print → Save as PDF" function — the same
 * pattern used by the Coverage page export.
 */
import type { JiraBug, JiraVersion, TestExecution } from "@/types";
import type { RunStats, TestRunHistory } from "@/services/queries";
import { CRITICAL_PRIORITIES } from "@/constants/statuses";

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_COLORS: Record<string, string> = {
  PASS: "#10b981",
  PASSED: "#10b981",
  FAIL: "#ef4444",
  FAILED: "#ef4444",
  BLOCKED: "#3b82f6",
  EXECUTING: "#eab308",
  TODO: "#94a3b8",
  "NOT RUN": "#94a3b8",
  "N/A": "#f97316",
};

function statusColor(name: string): string {
  const upper = name.toUpperCase();
  return STATUS_COLORS[upper] ?? "#94a3b8";
}

function priorityColor(name: string | undefined): string {
  switch ((name ?? "").toLowerCase()) {
    case "highest":
    case "critical":
    case "blocker":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "medium":
      return "#eab308";
    case "low":
      return "#22c55e";
    case "lowest":
      return "#94a3b8";
    default:
      return "#94a3b8";
  }
}

function statusCategoryBg(categoryKey: string | undefined): string {
  switch (categoryKey) {
    case "done":
      return "#dcfce7";
    case "indeterminate":
      return "#dbeafe";
    default:
      return "#f1f5f9";
  }
}
function statusCategoryFg(categoryKey: string | undefined): string {
  switch (categoryKey) {
    case "done":
      return "#166534";
    case "indeterminate":
      return "#1d4ed8";
    default:
      return "#475569";
  }
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

interface ChartSlice {
  label: string;
  count: number;
  pct: number;
  color: string;
}

function buildSlices(counts: Record<string, number>, total: number): ChartSlice[] {
  if (total === 0) return [];
  const ORDER = ["PASS", "FAIL", "BLOCKED", "EXECUTING", "TODO", "N/A"];
  const merged: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    const upper = k.toUpperCase();
    const canonical =
      upper === "PASSED"
        ? "PASS"
        : upper === "FAILED"
          ? "FAIL"
          : upper === "NOT RUN"
            ? "TODO"
            : upper;
    merged[canonical] = (merged[canonical] ?? 0) + v;
  }
  const keys = ORDER.filter((k) => merged[k]).concat(
    Object.keys(merged)
      .filter((k) => !ORDER.includes(k))
      .sort(),
  );
  return keys.map((k) => ({
    label: k,
    count: merged[k]!,
    pct: (merged[k]! / total),
    color: statusColor(k),
  }));
}

function buildSvgDonut(slices: ChartSlice[], size = 130): string {
  const R = size * 0.37;
  const holeR = size * 0.24;
  const CX = size / 2;
  const CY = size / 2;
  const CIRCUM = 2 * Math.PI * R;
  const GAP = 1.5;
  const sw = R - holeR;
  const total = slices.reduce((a, s) => a + s.count, 0);

  let cumPct = 0;
  const circles = slices
    .map((d) => {
      const dashLen = Math.max(0, d.pct * CIRCUM - GAP);
      const dashOffset = -(cumPct * CIRCUM);
      cumPct += d.pct;
      return `<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${R.toFixed(1)}" fill="none" stroke="${d.color}" stroke-width="${sw.toFixed(1)}" stroke-dasharray="${dashLen.toFixed(2)} ${CIRCUM.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" transform="rotate(-90 ${CX.toFixed(1)} ${CY.toFixed(1)})"/>`;
    })
    .join("");
  const bg = `<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${R.toFixed(1)}" fill="none" stroke="#e2e8f0" stroke-width="${sw.toFixed(1)}"/>`;
  const fs = (size * 0.155).toFixed(1);
  const sfs = (size * 0.082).toFixed(1);
  const center = `<text x="${CX}" y="${CY - 3}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fs}" font-weight="700" fill="#0f172a">${total}</text><text x="${CX}" y="${CY + parseFloat(sfs) + 5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${sfs}" fill="#94a3b8">tests</text>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${circles}${center}</svg>`;
}

function buildSvgBar(slices: ChartSlice[], width = 300, height = 12): string {
  let x = 0;
  const rects = slices
    .map((d) => {
      const w = Math.max(0, d.pct * width);
      const r = `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="${d.color}"/>`;
      x += w;
      return r;
    })
    .join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="border-radius:6px;overflow:hidden;display:block"><rect x="0" y="0" width="${width}" height="${height}" fill="#e2e8f0"/>${rects}</svg>`;
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildKpiRow(
  stats: RunStats,
  bugs: JiraBug[],
  versionIssues: JiraBug[],
  executions: TestExecution[],
): string {
  const passCount = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
  const failCount =
    (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
  const passRate = stats.total > 0 ? Math.round((passCount / stats.total) * 100) : null;

  const criticalBugs = bugs.filter(
    (b) =>
      b.fields.status?.category?.key !== "done" &&
      CRITICAL_PRIORITIES.has((b.fields.priority?.name ?? "").toLowerCase()),
  ).length;

  const storiesTotal = versionIssues.length;
  const storiesDone = versionIssues.filter(
    (i) =>
      i.fields.status?.category?.key === "done" ||
      /acceptance/i.test(i.fields.status?.name ?? ""),
  ).length;

  function kpi(
    label: string,
    value: string,
    sub: string,
    accent: string,
    bg: string,
  ): string {
    return `<div style="flex:1;min-width:130px;border:1px solid ${accent}30;border-radius:12px;background:${bg};padding:14px 16px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${accent};margin-bottom:6px">${esc(label)}</div>
      <div style="font-size:26px;font-weight:800;color:#0f172a;line-height:1">${esc(value)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">${esc(sub)}</div>
    </div>`;
  }

  const passAccent = passRate === null ? "#94a3b8" : passRate === 100 ? "#10b981" : passRate >= 80 ? "#3b82f6" : "#f59e0b";
  const passBg    = passRate === null ? "#f8fafc" : passRate === 100 ? "#f0fdf4" : passRate >= 80 ? "#eff6ff" : "#fffbeb";
  const failAccent = failCount === 0 ? "#10b981" : "#ef4444";
  const failBg     = failCount === 0 ? "#f0fdf4" : "#fef2f2";
  const bugAccent  = criticalBugs === 0 ? "#10b981" : "#ef4444";
  const bugBg      = criticalBugs === 0 ? "#f0fdf4" : "#fef2f2";

  return `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px">
    ${kpi("Pass rate", passRate === null ? "—" : `${passRate}%`, `${passCount} / ${stats.total} tests`, passAccent, passBg)}
    ${kpi("Failures & blocked", String(failCount), failCount === 0 ? "All clear" : "Test runs failing", failAccent, failBg)}
    ${kpi("Critical bugs", String(criticalBugs), criticalBugs === 0 ? "No open blockers" : "Unresolved critical/blocker", bugAccent, bugBg)}
    ${kpi("Stories progress", storiesTotal === 0 ? "—" : `${storiesDone} / ${storiesTotal}`, storiesTotal === 0 ? "No issues linked" : "Done or in acceptance", "#6366f1", "#eef2ff")}
    ${kpi("Executions", String(executions.length), executions.length === 0 ? "None linked" : "Linked to this version", "#64748b", "#f8fafc")}
  </div>`;
}

function buildChecklistSection(
  stats: RunStats,
  bugs: JiraBug[],
  versionIssues: JiraBug[],
  executions: TestExecution[],
  version: JiraVersion,
): string {
  const todoCount =
    (stats.counts["TODO"] ?? stats.counts["NOT RUN"] ?? 0) + (stats.counts["EXECUTING"] ?? 0);
  const failCount =
    (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
  const criticalBugCount = bugs.filter(
    (b) =>
      b.fields.status?.category?.key !== "done" &&
      CRITICAL_PRIORITIES.has((b.fields.priority?.name ?? "").toLowerCase()),
  ).length;
  const storiesTotal = versionIssues.length;
  const storiesDone = versionIssues.filter(
    (i) =>
      i.fields.status?.category?.key === "done" ||
      /acceptance/i.test(i.fields.status?.name ?? ""),
  ).length;

  const items = [
    {
      pass: executions.length > 0,
      label: "Has at least one execution",
      detail: executions.length === 0
        ? "No test executions linked to this version"
        : `${executions.length} execution${executions.length !== 1 ? "s" : ""} linked`,
    },
    {
      pass: todoCount === 0 && stats.total > 0,
      label: "All tests executed",
      detail: todoCount === 0 ? "No pending or in-progress tests" : `${todoCount} test${todoCount !== 1 ? "s" : ""} not yet executed`,
    },
    {
      pass: failCount === 0 && stats.total > 0,
      label: "No failures or blockers",
      detail: failCount === 0 ? "All executed tests passed" : `${failCount} failure${failCount !== 1 ? "s" : ""} or blocked test${failCount !== 1 ? "s" : ""}`,
    },
    {
      pass: criticalBugCount === 0,
      label: "No open critical bugs",
      detail: criticalBugCount === 0 ? "No unresolved critical or blocker bugs" : `${criticalBugCount} unresolved critical/blocker bug${criticalBugCount !== 1 ? "s" : ""}`,
    },
    {
      pass: storiesTotal > 0 && storiesDone === storiesTotal,
      label: "Stories in acceptance or done",
      detail: storiesTotal === 0 ? "No issues linked to this version" : storiesDone === storiesTotal ? `All ${storiesTotal} issues done or in acceptance` : `${storiesDone} / ${storiesTotal} issues done or in acceptance`,
    },
  ];

  const allPass = items.every((i) => i.pass);
  const passCount = items.filter((i) => i.pass).length;

  const rows = items
    .map(
      (item) => `<tr>
      <td style="padding:10px 14px;width:24px;text-align:center">${item.pass ? "✅" : "❌"}</td>
      <td style="padding:10px 14px;font-weight:500;color:#1e293b">${esc(item.label)}</td>
      <td style="padding:10px 14px;color:${item.pass ? "#16a34a" : "#dc2626"};font-size:12px">${esc(item.detail)}</td>
    </tr>`,
    )
    .join("");

  const badge = allPass
    ? `<span style="border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:3px 10px;font-size:11px;font-weight:700">Ready to release</span>`
    : `<span style="border-radius:999px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;padding:3px 10px;font-size:11px;font-weight:700">${passCount} / ${items.length} criteria met</span>`;

  const releasedBadge = version.released
    ? `<span style="border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:3px 10px;font-size:11px;font-weight:700;margin-right:8px">Released</span>`
    : "";

  return `<div style="margin-bottom:28px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0">Release Readiness</h2>
      <div>${releasedBadge}${badge}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildTestResultsSection(stats: RunStats): string {
  if (stats.total === 0) return "";
  const slices = buildSlices(stats.counts, stats.total);
  const donut = buildSvgDonut(slices, 120);
  const bar = buildSvgBar(slices, 340, 12);

  const legend = slices
    .map(
      (s) =>
        `<div style="display:flex;align-items:center;gap:6px;font-size:12px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${s.color}"></span>
          <span style="color:#475569">${esc(s.label)}</span>
          <strong style="color:#0f172a">${s.count}</strong>
          <span style="color:#94a3b8">(${Math.round(s.pct * 100)}%)</span>
        </div>`,
    )
    .join("");

  return `<div style="margin-bottom:28px">
    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Test Results</h2>
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px">
      <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap">
        ${donut}
        <div style="flex:1;min-width:200px">
          <div style="margin-bottom:10px">${bar}</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px 20px">${legend}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function buildFailedTestsSection(failedTests: TestRunHistory[]): string {
  if (failedTests.length === 0) return "";

  const classLabel: Record<TestRunHistory["classification"], string> = {
    failing: "Failing",
    flaky: "Flaky",
    "never-passed": "Never passed",
    fixed: "Fixed",
  };
  const classBg: Record<TestRunHistory["classification"], string> = {
    failing: "#fef2f2",
    flaky: "#fffbeb",
    "never-passed": "#fef2f2",
    fixed: "#f0fdf4",
  };
  const classFg: Record<TestRunHistory["classification"], string> = {
    failing: "#dc2626",
    flaky: "#d97706",
    "never-passed": "#dc2626",
    fixed: "#16a34a",
  };

  const rows = failedTests
    .map((t) => {
      const bg = classBg[t.classification];
      const fg = classFg[t.classification];
      const label = classLabel[t.classification];
      const linkedBugs = t.linkedBugKeys.length
        ? t.linkedBugKeys
            .map((k) => `<code style="background:#f1f5f9;border-radius:4px;padding:1px 5px;font-size:10px;color:#475569">${esc(k)}</code>`)
            .join(" ")
        : "";
      return `<tr>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;white-space:nowrap">${esc(t.testKey)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;max-width:280px">${esc(t.testSummary)}</td>
        <td style="padding:8px 12px;text-align:center">
          <span style="border-radius:999px;background:${bg};color:${fg};padding:2px 8px;font-size:10px;font-weight:700">${label}</span>
        </td>
        <td style="padding:8px 12px;font-size:11px">${linkedBugs}</td>
      </tr>`;
    })
    .join("");

  return `<div style="margin-bottom:28px">
    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Failed &amp; Problematic Tests <span style="font-size:13px;font-weight:400;color:#64748b">(${failedTests.length})</span></h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Key</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Summary</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Linked Bugs</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildBugsSection(bugs: JiraBug[], failedTests: TestRunHistory[]): string {
  if (bugs.length === 0) {
    return `<div style="margin-bottom:28px">
      <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Bugs <span style="font-size:13px;font-weight:400;color:#64748b">(0)</span></h2>
      <p style="color:#94a3b8;font-size:13px;font-style:italic">No bugs found for this version.</p>
    </div>`;
  }

  const bugToTests = new Map<string, string[]>();
  for (const test of failedTests) {
    for (const bugKey of test.linkedBugKeys) {
      const existing = bugToTests.get(bugKey) ?? [];
      existing.push(test.testKey);
      bugToTests.set(bugKey, existing);
    }
  }

  const sorted = [...bugs].sort((a, b) => {
    const ORDER = ["Highest", "High", "Medium", "Low", "Lowest"];
    const ai = ORDER.indexOf(a.fields.priority?.name ?? "");
    const bi = ORDER.indexOf(b.fields.priority?.name ?? "");
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const rows = sorted
    .map((bug) => {
      const priorityDot = `<span style="color:${priorityColor(bug.fields.priority?.name)};font-size:16px;line-height:1">●</span>`;
      const statusBg = statusCategoryBg(bug.fields.status?.category?.key);
      const statusFg = statusCategoryFg(bug.fields.status?.category?.key);
      const statusBadge = bug.fields.status
        ? `<span style="border-radius:4px;background:${statusBg};color:${statusFg};padding:2px 6px;font-size:10px;font-weight:600;white-space:nowrap">${esc(bug.fields.status.name)}</span>`
        : "";
      const detectingTests = (bugToTests.get(bug.key) ?? [])
        .map((k) => `<code style="background:#f1f5f9;border-radius:4px;padding:1px 5px;font-size:10px;color:#475569">${esc(k)}</code>`)
        .join(" ");
      return `<tr>
        <td style="padding:8px 12px;text-align:center;width:28px">${priorityDot}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;white-space:nowrap">${esc(bug.key)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b">${esc(bug.fields.summary)}</td>
        <td style="padding:8px 12px;text-align:center">${statusBadge}</td>
        <td style="padding:8px 12px;font-size:11px;color:#64748b">${esc(bug.fields.assignee?.display_name ?? "—")}</td>
        <td style="padding:8px 12px;font-size:11px">${detectingTests}</td>
      </tr>`;
    })
    .join("");

  return `<div style="margin-bottom:28px">
    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Bugs <span style="font-size:13px;font-weight:400;color:#64748b">(${bugs.length})</span></h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #fecaca;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#fef2f2">
          <th style="padding:8px 12px;width:28px"></th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#ef4444;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Key</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#ef4444;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Summary</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#ef4444;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#ef4444;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Assignee</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#ef4444;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Detected by</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildIssuesSection(versionIssues: JiraBug[]): string {
  if (versionIssues.length === 0) {
    return `<div style="margin-bottom:28px">
      <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Version Issues <span style="font-size:13px;font-weight:400;color:#64748b">(0)</span></h2>
      <p style="color:#94a3b8;font-size:13px;font-style:italic">No issues linked to this version.</p>
    </div>`;
  }

  const rows = versionIssues
    .map((issue) => {
      const statusBg = statusCategoryBg(issue.fields.status?.category?.key);
      const statusFg = statusCategoryFg(issue.fields.status?.category?.key);
      const typeName = issue.fields.issue_type?.name ?? "";
      const typeColor =
        typeName === "Bug" ? "#ef4444" : typeName === "Story" ? "#6366f1" : "#64748b";
      return `<tr>
        <td style="padding:8px 12px;white-space:nowrap">
          <span style="border-radius:4px;background:${typeColor}18;color:${typeColor};padding:2px 6px;font-size:10px;font-weight:600">${esc(typeName || "Issue")}</span>
        </td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;white-space:nowrap">${esc(issue.key)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b">${esc(issue.fields.summary)}</td>
        <td style="padding:8px 12px;text-align:center">
          ${issue.fields.status ? `<span style="border-radius:4px;background:${statusBg};color:${statusFg};padding:2px 6px;font-size:10px;font-weight:600">${esc(issue.fields.status.name)}</span>` : ""}
        </td>
        <td style="padding:8px 12px;font-size:11px;color:#64748b">${esc(issue.fields.assignee?.display_name ?? "—")}</td>
      </tr>`;
    })
    .join("");

  return `<div style="margin-bottom:28px">
    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Version Issues <span style="font-size:13px;font-weight:400;color:#64748b">(${versionIssues.length})</span></h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Type</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Key</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Summary</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Assignee</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildExecutionsSection(executions: TestExecution[]): string {
  if (executions.length === 0) return "";

  const rows = executions
    .map((exec) => {
      const status = exec.jira.status?.name ?? "";
      const statusStyle = status.toLowerCase().includes("done") || status.toLowerCase().includes("closed")
        ? `background:#dcfce7;color:#166534`
        : status.toLowerCase().includes("progress") || status.toLowerCase().includes("executing")
          ? `background:#dbeafe;color:#1d4ed8`
          : `background:#f1f5f9;color:#475569`;
      return `<tr>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;white-space:nowrap">${esc(exec.jira.key)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b">${esc(exec.jira.summary)}</td>
        <td style="padding:8px 12px;text-align:center">
          ${status ? `<span style="border-radius:4px;${statusStyle};padding:2px 6px;font-size:10px;font-weight:600">${esc(status)}</span>` : ""}
        </td>
        <td style="padding:8px 12px;font-size:11px;color:#64748b">${esc(exec.jira.assignee?.display_name ?? "—")}</td>
      </tr>`;
    })
    .join("");

  return `<div style="margin-bottom:28px">
    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Test Executions <span style="font-size:13px;font-weight:400;color:#64748b">(${executions.length})</span></h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Key</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Summary</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Assignee</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface VersionReportParams {
  version: JiraVersion;
  projectKey: string;
  stats: RunStats;
  bugs: JiraBug[];
  versionIssues: JiraBug[];
  executions: TestExecution[];
}

/**
 * Build a self-contained, print-ready HTML string for a version release report.
 * Open the file in a browser and use "Print → Save as PDF" to produce a PDF.
 */
export function buildVersionReportHTML(params: VersionReportParams): string {
  const { version, projectKey, stats, bugs, versionIssues, executions } = params;
  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const kpis = buildKpiRow(stats, bugs, versionIssues, executions);
  const checklist = buildChecklistSection(stats, bugs, versionIssues, executions, version);
  const testResults = buildTestResultsSection(stats);
  const failedTests = buildFailedTestsSection(stats.failedTests);
  const bugsSection = buildBugsSection(bugs, stats.failedTests);
  const issuesSection = buildIssuesSection(versionIssues);
  const executionsSection = buildExecutionsSection(executions);

  const releasedBadge = version.released
    ? `<span style="margin-left:12px;border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:3px 10px;font-size:11px;font-weight:700;vertical-align:middle">Released</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Version Report — ${esc(version.name)} (${esc(projectKey)})</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#1e293b;padding:32px;max-width:960px;margin:0 auto}
    table tr:nth-child(even){background:#fafafa}
    @media print{
      body{padding:0}
      @page{margin:20mm 16mm;size:A4}
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="border-bottom:2px solid #e2e8f0;padding-bottom:20px;margin-bottom:28px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6366f1;margin-bottom:4px">Version Report · ${esc(projectKey)}</p>
        <h1 style="font-size:26px;font-weight:800;color:#0f172a">${esc(version.name)}${releasedBadge}</h1>
        ${version.description ? `<p style="margin-top:6px;font-size:13px;color:#64748b">${esc(version.description)}</p>` : ""}
      </div>
      <p style="font-size:11px;color:#94a3b8;white-space:nowrap;padding-top:4px">Generated ${esc(date)}</p>
    </div>
  </div>

  ${kpis}
  ${checklist}
  ${testResults}
  ${failedTests}
  ${bugsSection}
  ${issuesSection}
  ${executionsSection}

  <p style="margin-top:32px;text-align:center;font-size:11px;color:#cbd5e1">Generated by QAlity Manual Reporting · ${esc(date)}</p>
</body>
</html>`;
}
