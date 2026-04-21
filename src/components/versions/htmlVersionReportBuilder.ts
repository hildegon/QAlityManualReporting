/**
 * Generates a self-contained, interactive HTML report for a single version.
 *
 * The output is a print-ready HTML document with collapsible sections,
 * filterable tables, test-history timelines, and a sticky navigation bar.
 * Open in a browser and use "Print → Save as PDF" for a static copy.
 */
import type { JiraBug, JiraVersion, TestExecution, QaApproval } from "@/types";
import type { RunStats, TestRunHistory } from "@/services/queries";
import type { IssueRow } from "./FeedbackPanel";
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
  feedbackRows: IssueRow[],
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

  const feedbackTotal = feedbackRows.length;
  const feedbackOpen = feedbackRows.filter((r) => !r.isDone && !r.isInProgress).length;
  const feedbackInProgress = feedbackRows.filter((r) => r.isInProgress).length;
  const feedbackDone = feedbackRows.filter((r) => r.isDone).length;
  const feedbackPending = feedbackOpen + feedbackInProgress;

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
  const fbAccent = feedbackTotal === 0 ? "#94a3b8" : feedbackPending === 0 ? "#10b981" : feedbackOpen > 0 ? "#f59e0b" : "#3b82f6";
  const fbBg     = feedbackTotal === 0 ? "#f8fafc" : feedbackPending === 0 ? "#f0fdf4" : feedbackOpen > 0 ? "#fffbeb" : "#eff6ff";

  return `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px" id="sec-kpis">
    ${kpi("Pass rate", passRate === null ? "—" : `${passRate}%`, `${passCount} / ${stats.total} tests`, passAccent, passBg)}
    ${kpi("Feedback", feedbackTotal === 0 ? "—" : feedbackPending === 0 ? "All done" : `${feedbackPending} open`, feedbackTotal === 0 ? "No feedback page" : feedbackPending === 0 ? `${feedbackDone} resolved` : `${feedbackInProgress} in progress · ${feedbackDone} done`, fbAccent, fbBg)}
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
  feedbackRows: IssueRow[],
  qaApproval?: QaApproval | null,
): string {
  const todoCount =
    (stats.counts["TODO"] ?? stats.counts["NOT RUN"] ?? 0) + (stats.counts["EXECUTING"] ?? 0);
  const failCount =
    (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);

  const executionRate = stats.total > 0
    ? Math.round(((stats.total - todoCount) / stats.total) * 100)
    : null;
  const executionSeverity: "green" | "amber" | "red" | undefined =
    executionRate === null
      ? undefined
      : executionRate >= 90
        ? "green"
        : executionRate >= 60
          ? "amber"
          : "red";

  const criticalBugCount = bugs.filter(
    (b) =>
      b.fields.status?.category?.key !== "done" &&
      CRITICAL_PRIORITIES.has((b.fields.priority?.name ?? "").toLowerCase()),
  ).length;
  const blockedCount = versionIssues.filter((i) =>
    /block/i.test(i.fields.status?.name ?? ""),
  ).length;
  const storiesTotal = versionIssues.length;
  const storiesDone = versionIssues.filter(
    (i) =>
      i.fields.status?.category?.key === "done" ||
      /acceptance/i.test(i.fields.status?.name ?? ""),
  ).length;

  const feedbackOpen = feedbackRows.filter((r) => !r.isDone && !r.isInProgress).length;
  const feedbackInProgress = feedbackRows.filter((r) => r.isInProgress).length;
  const feedbackPending = feedbackOpen + feedbackInProgress;
  const feedbackHasCritical = feedbackRows.some(
    (r) => !r.isDone && CRITICAL_PRIORITIES.has(r.priority?.toLowerCase() ?? ""),
  );
  const feedbackTotal = feedbackRows.length;

  const items = [
    {
      pass: executions.length > 0,
      label: "Test executions",
      detail: executions.length === 0
        ? "No test executions linked to this version"
        : `${executions.length} execution${executions.length !== 1 ? "s" : ""} linked`,
      metric: executions.length === 0 ? "0" : String(executions.length),
    },
    {
      pass: todoCount === 0 && stats.total > 0,
      label: "All tests executed",
      detail: stats.total === 0
        ? "No test runs yet"
        : todoCount === 0
          ? "No pending tests"
          : `${todoCount} test${todoCount !== 1 ? "s" : ""} not yet run`,
      metric: executionRate === null ? "—" : `${executionRate}%`,
      severity: executionSeverity,
    },
    {
      pass: failCount === 0 && stats.total > 0,
      label: "No test failures",
      detail: stats.total === 0
        ? "No test runs yet"
        : failCount === 0
          ? "All executed tests passed"
          : `${failCount} failure${failCount !== 1 ? "s" : ""} or blocked`,
      metric: stats.total === 0 ? "—" : String(failCount),
    },
    {
      pass: criticalBugCount === 0,
      label: "No critical bugs",
      detail: criticalBugCount === 0
        ? "No unresolved critical or blocker bugs"
        : `${criticalBugCount} unresolved critical/blocker`,
      metric: String(criticalBugCount),
    },
    {
      pass: blockedCount === 0,
      label: "No blocked stories",
      detail: blockedCount === 0
        ? "No developer work blocked"
        : `${blockedCount} issue${blockedCount !== 1 ? "s" : ""} blocked`,
      metric: blockedCount === 0 ? "✓" : String(blockedCount),
    },
    {
      pass: storiesTotal > 0 && storiesDone === storiesTotal,
      label: "Stories in acceptance",
      detail: storiesTotal === 0
        ? "No issues linked to this version"
        : storiesDone === storiesTotal
          ? `All ${storiesTotal} done or in acceptance`
          : `${storiesDone} / ${storiesTotal} done or in acceptance`,
      metric: storiesTotal === 0 ? "—" : `${storiesDone}/${storiesTotal}`,
    },
    {
      pass: feedbackTotal > 0 && feedbackPending === 0,
      label: "Feedback resolved",
      detail: feedbackTotal === 0
        ? "No feedback page linked"
        : feedbackPending === 0
          ? `All ${feedbackTotal} items resolved`
          : feedbackHasCritical
            ? `${feedbackPending} pending — includes critical`
            : `${feedbackPending} still open or in progress`,
      metric: feedbackTotal === 0
        ? "—"
        : feedbackPending === 0
          ? "✓"
          : String(feedbackPending),
    },
    {
      pass: !!qaApproval,
      label: "QA Approved",
      detail: qaApproval
        ? `Approved by ${qaApproval.display_name} on ${new Date(qaApproval.approved_at).toLocaleDateString()}`
        : "Not yet approved by QA",
      metric: qaApproval ? "✓" : "—",
    },
  ];

  const allPass = items.every((i) => i.pass);
  const passCount = items.filter((i) => i.pass).length;

  const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#dcfce7", fg: "#166534" },
    amber: { bg: "#fef9c3", fg: "#854d0e" },
    red:   { bg: "#fef2f2", fg: "#dc2626" },
  };

  const rows = items
    .map(
      (item) => {
        const metricStyle = "severity" in item && item.severity
          ? `background:${SEVERITY_COLORS[item.severity]?.bg ?? "transparent"};color:${SEVERITY_COLORS[item.severity]?.fg ?? "#1e293b"};padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px`
          : "";
        return `<tr>
      <td style="padding:10px 14px;width:24px;text-align:center">${item.pass ? "✅" : "❌"}</td>
      <td style="padding:10px 14px;font-weight:500;color:#1e293b">${esc(item.label)}</td>
      <td style="padding:10px 14px;color:${item.pass ? "#16a34a" : "#dc2626"};font-size:12px">${esc(item.detail)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px">${"metric" in item ? `<span style="${metricStyle}">${esc(item.metric)}</span>` : ""}</td>
    </tr>`;
      },
    )
    .join("");

  const badge = allPass
    ? `<span style="border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:3px 10px;font-size:11px;font-weight:700">Ready to release</span>`
    : `<span style="border-radius:999px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;padding:3px 10px;font-size:11px;font-weight:700">${passCount} / ${items.length} criteria met</span>`;

  const releasedBadge = version.released
    ? `<span style="border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:3px 10px;font-size:11px;font-weight:700;margin-right:8px">Released</span>`
    : "";

  return `<div style="margin-bottom:28px" id="sec-checklist">
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

  return `<div style="margin-bottom:28px" id="sec-results">
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

  // Classification summary chips
  const classGroups: Record<string, number> = {};
  for (const t of failedTests) {
    classGroups[t.classification] = (classGroups[t.classification] ?? 0) + 1;
  }
  const summaryChips = (["failing", "flaky", "never-passed", "fixed"] as const)
    .filter((c) => classGroups[c])
    .map(
      (c) =>
        `<span style="border-radius:999px;background:${classBg[c]};color:${classFg[c]};padding:2px 8px;font-size:10px;font-weight:700;margin-right:4px">${classLabel[c]}: ${classGroups[c]}</span>`,
    )
    .join("");

  const rows = failedTests
    .map((t, i) => {
      const bg = classBg[t.classification];
      const fg = classFg[t.classification];
      const label = classLabel[t.classification];
      const linkedBugs = t.linkedBugKeys.length
        ? t.linkedBugKeys
            .map((k) => `<code style="background:#f1f5f9;border-radius:4px;padding:1px 5px;font-size:10px;color:#475569">${esc(k)}</code>`)
            .join(" ")
        : "";

      // History timeline: dots for each execution
      const timeline = t.history
        .map((h) => {
          const c = statusColor(h.statusName);
          return `<span title="${esc(h.executionKey)}: ${esc(h.statusName)}" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:2px;cursor:help"></span>`;
        })
        .join("");

      const hasHistory = t.history.length > 0;
      const historyDetail = hasHistory
        ? `<tr class="detail-row" id="ft-detail-${i}" style="display:none">
            <td colspan="5" style="padding:6px 12px 10px 12px;background:#f8fafc;border-top:none">
              <div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;margin-bottom:4px">Execution History</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                ${t.history.map((h) => {
                  const c = statusColor(h.statusName);
                  return `<span style="display:inline-flex;align-items:center;gap:3px;border-radius:4px;padding:2px 6px;font-size:10px;background:${c}18;color:${c};font-weight:600;border:1px solid ${c}40">
                    <span style="width:6px;height:6px;border-radius:50%;background:${c}"></span>
                    ${esc(h.executionKey)}: ${esc(h.statusName)}
                  </span>`;
                }).join("")}
              </div>
            </td>
          </tr>`
        : "";

      return `<tr style="cursor:${hasHistory ? "pointer" : "default"}" ${hasHistory ? `onclick="toggleDetail('ft-detail-${i}', this)"` : ""}>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;white-space:nowrap">${esc(t.testKey)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;max-width:240px">${esc(t.testSummary)}</td>
        <td style="padding:8px 12px;text-align:center">
          <span style="border-radius:999px;background:${bg};color:${fg};padding:2px 8px;font-size:10px;font-weight:700">${label}</span>
        </td>
        <td style="padding:8px 12px;white-space:nowrap">${timeline}</td>
        <td style="padding:8px 12px;font-size:11px">${linkedBugs}</td>
      </tr>${historyDetail}`;
    })
    .join("");

  return `<div style="margin-bottom:28px" id="sec-failures">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0">Failed &amp; Problematic Tests <span style="font-size:13px;font-weight:400;color:#64748b">(${failedTests.length})</span></h2>
      <div>${summaryChips}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Key</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Summary</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Status</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">History</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Linked Bugs</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildBugsSection(bugs: JiraBug[], failedTests: TestRunHistory[]): string {
  if (bugs.length === 0) {
    return `<div style="margin-bottom:28px" id="sec-bugs">
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

  // Collect unique priorities and statuses for filter chips
  const uniquePriorities = [...new Set(bugs.map((b) => b.fields.priority?.name ?? "Unknown"))].sort();
  const uniqueStatuses = [...new Set(bugs.map((b) => b.fields.status?.name ?? "Unknown"))].sort();

  const filterChips = (items: string[], dataAttr: string, colorFn: (v: string) => string) =>
    items
      .map(
        (v) =>
          `<button class="filter-chip" data-filter="${dataAttr}" data-value="${esc(v)}" onclick="toggleBugFilter(this)" style="border-radius:999px;padding:2px 8px;font-size:10px;font-weight:600;border:1px solid #e2e8f0;background:#fff;color:${colorFn(v)};cursor:pointer;transition:all .15s">${esc(v)}</button>`,
      )
      .join("");

  const priorityChips = filterChips(uniquePriorities, "priority", (v) => priorityColor(v));
  const statusChips = filterChips(uniqueStatuses, "status", () => "#475569");

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
      return `<tr class="bug-row" data-priority="${esc(bug.fields.priority?.name ?? "Unknown")}" data-status="${esc(bug.fields.status?.name ?? "Unknown")}">
        <td style="padding:8px 12px;text-align:center;width:28px">${priorityDot}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;white-space:nowrap">${esc(bug.key)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b">${esc(bug.fields.summary)}</td>
        <td style="padding:8px 12px;text-align:center">${statusBadge}</td>
        <td style="padding:8px 12px;font-size:11px;color:#64748b">${esc(bug.fields.assignee?.display_name ?? "—")}</td>
        <td style="padding:8px 12px;font-size:11px">${detectingTests}</td>
      </tr>`;
    })
    .join("");

  // Priority summary bar
  const prioCounts: Record<string, number> = {};
  for (const b of bugs) {
    const p = b.fields.priority?.name ?? "Unknown";
    prioCounts[p] = (prioCounts[p] ?? 0) + 1;
  }
  const prioSummary = uniquePriorities
    .filter((p) => prioCounts[p])
    .map((p) => `<span style="color:${priorityColor(p)};font-size:11px;font-weight:600">${esc(p)}: ${prioCounts[p]}</span>`)
    .join(`<span style="color:#e2e8f0;margin:0 4px">·</span>`);

  return `<div style="margin-bottom:28px" id="sec-bugs">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:10px">
      <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0">Bugs <span style="font-size:13px;font-weight:400;color:#64748b">(${bugs.length})</span></h2>
      <div>${prioSummary}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;align-items:center">
      <span style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-right:4px">Priority:</span>
      ${priorityChips}
      <span style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-left:12px;margin-right:4px">Status:</span>
      ${statusChips}
      <button onclick="clearBugFilters()" style="font-size:10px;color:#6366f1;background:none;border:none;cursor:pointer;margin-left:8px;text-decoration:underline">Clear</button>
    </div>
    <table id="bugs-table" style="width:100%;border-collapse:collapse;border:1px solid #fecaca;border-radius:10px;overflow:hidden">
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
    return `<div style="margin-bottom:28px" id="sec-issues">
      <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Version Issues <span style="font-size:13px;font-weight:400;color:#64748b">(0)</span></h2>
      <p style="color:#94a3b8;font-size:13px;font-style:italic">No issues linked to this version.</p>
    </div>`;
  }

  // Group by status
  const acceptance = versionIssues.filter((i) => /acceptance/i.test(i.fields.status?.name ?? ""));
  const done = versionIssues.filter(
    (i) =>
      i.fields.status?.category?.key === "done" &&
      !/acceptance/i.test(i.fields.status?.name ?? ""),
  );
  const other = versionIssues.filter(
    (i) =>
      i.fields.status?.category?.key !== "done" &&
      !/acceptance/i.test(i.fields.status?.name ?? ""),
  );

  function issueRow(issue: JiraBug): string {
    const statusBg = statusCategoryBg(issue.fields.status?.category?.key);
    const statusFg = statusCategoryFg(issue.fields.status?.category?.key);
    const typeName = issue.fields.issue_type?.name ?? "";
    const typeColor =
      typeName === "Bug" ? "#ef4444" : typeName === "Story" ? "#6366f1" : "#64748b";
    const priDot = issue.fields.priority
      ? `<span style="color:${priorityColor(issue.fields.priority.name)};font-size:12px;margin-right:4px">●</span>`
      : "";
    return `<tr>
      <td style="padding:8px 12px;white-space:nowrap">
        <span style="border-radius:4px;background:${typeColor}18;color:${typeColor};padding:2px 6px;font-size:10px;font-weight:600">${esc(typeName || "Issue")}</span>
      </td>
      <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;white-space:nowrap">${esc(issue.key)}</td>
      <td style="padding:8px 12px;font-size:12px;color:#1e293b">${priDot}${esc(issue.fields.summary)}</td>
      <td style="padding:8px 12px;text-align:center">
        ${issue.fields.status ? `<span style="border-radius:4px;background:${statusBg};color:${statusFg};padding:2px 6px;font-size:10px;font-weight:600">${esc(issue.fields.status.name)}</span>` : ""}
      </td>
      <td style="padding:8px 12px;font-size:11px;color:#64748b">${esc(issue.fields.assignee?.display_name ?? "—")}</td>
    </tr>`;
  }

  function issueGroup(label: string, icon: string, issues: JiraBug[], accentBg: string, accentFg: string): string {
    if (issues.length === 0) return "";
    return `<details open style="margin-bottom:12px">
      <summary style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:${accentBg};font-size:12px;font-weight:600;color:${accentFg}">
        <span>${icon}</span> ${esc(label)} <span style="font-weight:400;color:#64748b">(${issues.length})</span>
      </summary>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:0 0 10px 10px;overflow:hidden;margin-top:0">
        <tbody>${issues.map(issueRow).join("")}</tbody>
      </table>
    </details>`;
  }

  return `<div style="margin-bottom:28px" id="sec-issues">
    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px">Version Issues <span style="font-size:13px;font-weight:400;color:#64748b">(${versionIssues.length})</span></h2>
    ${issueGroup("In Acceptance Testing", "⏳", acceptance, "#fffbeb", "#a16207")}
    ${issueGroup("Done", "✅", done, "#f0fdf4", "#166534")}
    ${issueGroup("Other", "📋", other, "#f8fafc", "#475569")}
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

  return `<div style="margin-bottom:28px" id="sec-executions">
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

// ── Feedback section ──────────────────────────────────────────────────────────

const FEEDBACK_PRIORITY_COLORS: Record<string, { dot: string; bg: string; fg: string }> = {
  Blocker:  { dot: "#ef4444", bg: "#fef2f2", fg: "#dc2626" },
  Critical: { dot: "#ef4444", bg: "#fef2f2", fg: "#dc2626" },
  High:     { dot: "#f97316", bg: "#fff7ed", fg: "#c2410c" },
  Medium:   { dot: "#eab308", bg: "#fefce8", fg: "#a16207" },
  Low:      { dot: "#3b82f6", bg: "#eff6ff", fg: "#1d4ed8" },
  Trivial:  { dot: "#3b82f6", bg: "#eff6ff", fg: "#1d4ed8" },
};

function feedbackPriorityStyle(priority: string): { dot: string; bg: string; fg: string } {
  return FEEDBACK_PRIORITY_COLORS[priority] ?? { dot: "#94a3b8", bg: "#f8fafc", fg: "#475569" };
}

function buildFeedbackSection(feedback: FeedbackReportData | undefined): string {
  if (!feedback || feedback.rows.length === 0) return "";

  const { rows, confluenceUrl } = feedback;
  const total = rows.length;
  const unresolvedItems = rows.filter((r) => !r.isDone);
  const openItems = rows.filter((r) => !r.isDone && !r.isInProgress);
  const inProgressItems = rows.filter((r) => r.isInProgress);
  const doneItems = rows.filter((r) => r.isDone);
  const donePercent = total > 0 ? Math.round((doneItems.length / total) * 100) : 0;
  const carryOverOpenItems = unresolvedItems.filter((r) => !!r.carryOverFrom);

  const priorityCounts: Record<string, number> = {};
  for (const r of unresolvedItems) {
    const key = r.priority || "Unset";
    priorityCounts[key] = (priorityCounts[key] ?? 0) + 1;
  }

  const PRIO_ORDER = ["Blocker", "Critical", "High", "Medium", "Low", "Trivial", "Unset"];
  const sortedPriorities = Object.entries(priorityCounts).sort(([a], [b]) => {
    const ai = PRIO_ORDER.indexOf(a);
    const bi = PRIO_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const allDone = openItems.length === 0 && inProgressItems.length === 0;
  const blockerCount = priorityCounts.Blocker ?? 0;
  const criticalCount = priorityCounts.Critical ?? 0;
  const highCount = priorityCounts.High ?? 0;
  const criticalAttentionCount = blockerCount + criticalCount;

  const headlineAccent = allDone
    ? "#166534"
    : criticalAttentionCount > 0
      ? "#b91c1c"
      : openItems.length > 0
        ? "#b45309"
        : "#1d4ed8";
  const headlineBg = allDone
    ? "#f0fdf4"
    : criticalAttentionCount > 0
      ? "#fef2f2"
      : openItems.length > 0
        ? "#fffbeb"
        : "#eff6ff";
  const headlineMessage = allDone
    ? `All ${total} feedback item${total !== 1 ? "s are" : " is"} resolved.`
    : criticalAttentionCount > 0
      ? `${criticalAttentionCount} blocker/critical feedback item${criticalAttentionCount !== 1 ? "s" : ""} still need attention.`
      : highCount > 0
        ? `${highCount} high-priority feedback item${highCount !== 1 ? "s" : ""} still open.`
        : `${unresolvedItems.length} unresolved feedback item${unresolvedItems.length !== 1 ? "s remain" : " remains"} for this release.`;

  function summaryChip(
    label: string,
    value: string,
    accent: string,
    bg: string,
  ): string {
    return `<span style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 10px;background:${bg};color:${accent};font-size:11px;font-weight:700;border:1px solid ${accent}22">${esc(value)} ${esc(label)}</span>`;
  }

  const severityChips = sortedPriorities.length > 0
    ? sortedPriorities
        .map(([priority, count]) => {
          const style = feedbackPriorityStyle(priority);
          return summaryChip(priority, String(count), style.fg, style.bg);
        })
        .join("")
    : summaryChip("resolved", String(doneItems.length), "#166534", "#f0fdf4");

  const statusSegments = [
    { key: "Open", count: openItems.length, color: "#f59e0b" },
    { key: "In Progress", count: inProgressItems.length, color: "#3b82f6" },
    { key: "Resolved", count: doneItems.length, color: "#10b981" },
  ].filter((segment) => segment.count > 0);

  const statusBarRects = statusSegments.reduce(
    (acc, seg) => {
      const w = Math.max(0, (seg.count / total) * 360);
      acc.svg += `<rect x="${acc.x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="10" fill="${seg.color}"><title>${esc(seg.key)}: ${seg.count}</title></rect>`;
      acc.x += w;
      return acc;
    },
    { svg: "", x: 0 },
  ).svg;
  const statusBar = `<svg width="360" height="10" viewBox="0 0 360 10" style="border-radius:999px;overflow:hidden;display:block;width:100%;max-width:360px">
    <rect x="0" y="0" width="360" height="10" fill="#e2e8f0"/>${statusBarRects}
  </svg>`;

  const statusChips = [
    summaryChip("open", String(openItems.length), "#b45309", "#fffbeb"),
    summaryChip("in progress", String(inProgressItems.length), "#1d4ed8", "#eff6ff"),
    summaryChip("resolved", String(doneItems.length), "#166534", "#f0fdf4"),
    ...(carryOverOpenItems.length > 0
      ? [summaryChip("carry-over", String(carryOverOpenItems.length), "#92400e", "#fef3c7")]
      : []),
  ].join("");

  const priorityRank = new Map(PRIO_ORDER.map((priority, index) => [priority, index]));
  const orderedRows = [...rows].sort((a, b) => {
    const statusRankA = a.isDone ? 2 : a.isInProgress ? 1 : 0;
    const statusRankB = b.isDone ? 2 : b.isInProgress ? 1 : 0;
    if (statusRankA !== statusRankB) return statusRankA - statusRankB;

    const priorityA = priorityRank.get(a.priority || "Unset") ?? 99;
    const priorityB = priorityRank.get(b.priority || "Unset") ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;

    return (a.jiraTicket || "").localeCompare(b.jiraTicket || "");
  });

  // Feedback issues table (inside a details/summary for collapsibility)
  const issueRows = orderedRows
    .map((r, i) => {
      const prioStyle = feedbackPriorityStyle(r.priority);
      const prioBadge = r.priority
        ? `<span style="border-radius:4px;background:${prioStyle.bg};color:${prioStyle.fg};padding:2px 6px;font-size:10px;font-weight:600">${esc(r.priority)}</span>`
        : `<span style="color:#94a3b8;font-size:10px">—</span>`;

      const statusStyle = r.isDone
        ? "background:#f0fdf4;color:#166534;border:1px solid #bbf7d0"
        : r.isInProgress
          ? "background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe"
          : "background:#fffbeb;color:#b45309;border:1px solid #fde68a";
      const statusLabel = r.isDone ? "Done" : r.isInProgress ? "In Progress" : "Open";

      const descTrunc = r.description.length > 80 ? r.description.slice(0, 80) + "…" : r.description;
      const commentTrunc = r.comment.length > 80 ? r.comment.slice(0, 80) + "…" : r.comment;

      // Expandable detail row (description + comment)
      const hasDetail = r.description.length > 80 || r.comment.length > 0;
      const detailRow = hasDetail
        ? `<tr class="detail-row" id="fb-detail-${i}" style="display:none">
            <td colspan="6" style="padding:8px 12px 12px 40px;background:#f8fafc;border-top:none">
              ${r.description ? `<div style="font-size:12px;color:#334155;margin-bottom:6px"><strong style="color:#64748b;font-size:10px;text-transform:uppercase">Description:</strong><br/>${esc(r.description)}</div>` : ""}
              ${r.comment ? `<div style="font-size:12px;color:#334155"><strong style="color:#64748b;font-size:10px;text-transform:uppercase">Comment:</strong><br/>${esc(r.comment)}</div>` : ""}
            </td>
          </tr>`
        : "";

      return `<tr style="cursor:${hasDetail ? "pointer" : "default"}" ${hasDetail ? `onclick="toggleDetail('fb-detail-${i}', this)"` : ""}>
        <td style="padding:8px 12px;text-align:center;white-space:nowrap">
          <span style="border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;${statusStyle}">${esc(statusLabel)}</span>
        </td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;white-space:nowrap">${esc(r.jiraTicket || "—")}</td>
        <td style="padding:8px 12px;text-align:center">${prioBadge}</td>
        <td style="padding:8px 12px;font-size:12px;color:#1e293b;max-width:260px">${esc(descTrunc)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#64748b;max-width:200px">${esc(commentTrunc)}</td>
        <td style="padding:8px 12px;font-size:11px;color:#64748b">${esc(r.assignedDeveloper || "—")}</td>
      </tr>${detailRow}`;
    })
    .join("");

  const confluenceLink = confluenceUrl
    ? `<a href="${esc(confluenceUrl)}" target="_blank" style="font-size:11px;color:#6366f1;text-decoration:none;font-weight:500">Open in Confluence ↗</a>`
    : "";

  return `<div style="margin-bottom:28px" id="sec-feedback">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0">
        Feedback <span style="font-size:13px;font-weight:400;color:#64748b">(${unresolvedItems.length} unresolved · ${donePercent}% resolved)</span>
      </h2>
      ${confluenceLink}
    </div>

    <div style="border-radius:12px;background:${headlineBg};border:1px solid ${headlineAccent}22;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${headlineAccent};margin-bottom:4px">Release signal</div>
      <div style="font-size:16px;font-weight:800;color:#0f172a;line-height:1.35">${esc(headlineMessage)}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px">
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px">Severity snapshot</div>
        <div style="font-size:24px;font-weight:800;color:#0f172a;line-height:1">${unresolvedItems.length}</div>
        <div style="font-size:12px;color:#475569;margin:4px 0 10px">
          ${allDone
            ? "No unresolved feedback remains."
            : criticalAttentionCount > 0
              ? `${criticalAttentionCount} blocker/critical item${criticalAttentionCount !== 1 ? "s" : ""} among the unresolved feedback.`
              : "Priority mix across unresolved feedback items."}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${severityChips}</div>
      </div>

      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px">Open-work status</div>
        <div style="font-size:24px;font-weight:800;color:#0f172a;line-height:1">${openItems.length} open · ${inProgressItems.length} in progress</div>
        <div style="font-size:12px;color:#475569;margin:4px 0 10px">
          ${doneItems.length} resolved${carryOverOpenItems.length > 0 ? ` · ${carryOverOpenItems.length} carried over` : ""}
        </div>
        <div style="margin-bottom:10px">${statusBar}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${statusChips}</div>
      </div>
    </div>

    <details>
      <summary style="cursor:pointer;font-size:13px;font-weight:600;color:#475569;padding:6px 0;user-select:none">
        Show all ${total} feedback items ▾
      </summary>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-top:8px">
        <thead>
          <tr style="background:#f0f9ff">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Status</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Ticket</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Priority</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Description</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Comment</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Assignee</th>
          </tr>
        </thead>
        <tbody>${issueRows}</tbody>
      </table>
    </details>
  </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Feedback data passed from the caller ──────────────────────────────────────

export interface FeedbackReportData {
  rows: IssueRow[];
  confluenceUrl?: string;
}

export interface VersionReportParams {
  version: JiraVersion;
  projectKey: string;
  stats: RunStats;
  bugs: JiraBug[];
  versionIssues: JiraBug[];
  executions: TestExecution[];
  feedback?: FeedbackReportData;
  qaApproval?: QaApproval | null;
}

/**
 * Build a self-contained, print-ready HTML string for a version release report.
 * Open the file in a browser and use "Print → Save as PDF" to produce a PDF.
 */
export function buildVersionReportHTML(params: VersionReportParams): string {
  const { version, projectKey, stats, bugs, versionIssues, executions, feedback, qaApproval } = params;
  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const feedbackRows = feedback?.rows ?? [];
  const kpis = buildKpiRow(stats, bugs, versionIssues, executions, feedbackRows);
  const checklist = buildChecklistSection(stats, bugs, versionIssues, executions, version, feedbackRows, qaApproval);
  const testResults = buildTestResultsSection(stats);
  const failedTests = buildFailedTestsSection(stats.failedTests);
  const bugsSection = buildBugsSection(bugs, stats.failedTests);
  const issuesSection = buildIssuesSection(versionIssues);
  const executionsSection = buildExecutionsSection(executions);
  const feedbackSection = feedback ? buildFeedbackSection(feedback) : "";

  const releasedBadge = version.released
    ? `<span style="margin-left:12px;border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:3px 10px;font-size:11px;font-weight:700;vertical-align:middle">Released</span>`
    : "";

  // Build nav items based on which sections have content
  const navItems: { label: string; href: string }[] = [
    { label: "KPIs", href: "#sec-kpis" },
    { label: "Readiness", href: "#sec-checklist" },
  ];
  if (stats.total > 0) navItems.push({ label: "Results", href: "#sec-results" });
  if (stats.failedTests.length > 0) navItems.push({ label: "Failures", href: "#sec-failures" });
  if (bugs.length > 0) navItems.push({ label: "Bugs", href: "#sec-bugs" });
  if (versionIssues.length > 0) navItems.push({ label: "Issues", href: "#sec-issues" });
  if (executions.length > 0) navItems.push({ label: "Executions", href: "#sec-executions" });
  if (feedback && feedback.rows.length > 0) navItems.push({ label: "Feedback", href: "#sec-feedback" });

  const navLinks = navItems
    .map(
      (n) =>
        `<a href="${n.href}" style="padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#475569;text-decoration:none;white-space:nowrap;transition:background .15s" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">${esc(n.label)}</a>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Version Report — ${esc(version.name)} (${esc(projectKey)})</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#1e293b;padding:32px;max-width:960px;margin:0 auto;padding-top:60px}
    table tr:nth-child(even){background:#fafafa}
    details>summary{list-style:none}
    details>summary::-webkit-details-marker{display:none}
    details>summary::before{content:"▸ ";font-size:13px;color:#94a3b8;transition:transform .15s}
    details[open]>summary::before{content:"▾ "}
    .filter-chip.active{border-color:currentColor!important;box-shadow:0 0 0 1px currentColor}
    .sticky-nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,255,255,.95);backdrop-filter:blur(8px);border-bottom:1px solid #e2e8f0;padding:8px 16px;display:flex;align-items:center;justify-content:center;gap:2px;flex-wrap:wrap}
    @media print{
      body{padding:0;padding-top:0}
      .sticky-nav{display:none!important}
      details{break-inside:avoid}
      details[open]>summary~*{display:block!important}
      @page{margin:20mm 16mm;size:A4}
    }
  </style>
</head>
<body>
  <!-- Sticky Nav -->
  <nav class="sticky-nav">
    <span style="font-size:11px;font-weight:700;color:#6366f1;margin-right:8px">${esc(version.name)}</span>
    ${navLinks}
  </nav>

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
  ${feedbackSection}

  <p style="margin-top:32px;text-align:center;font-size:11px;color:#cbd5e1">Generated by QAlity Manual Reporting · ${esc(date)}</p>

  <script>
    // Toggle detail rows (used by feedback items and execution history)
    function toggleDetail(id, triggerRow) {
      var el = document.getElementById(id);
      if (!el) return;
      var isHidden = el.style.display === 'none' || el.style.display === '';
      el.style.display = isHidden ? 'table-row' : 'none';
      if (triggerRow) triggerRow.style.background = isHidden ? '#f8fafc' : '';
    }

    // Bug filter state
    var bugFilters = { priority: null, status: null };

    function toggleBugFilter(chip) {
      var filterType = chip.getAttribute('data-filter');
      var value = chip.getAttribute('data-value');
      if (bugFilters[filterType] === value) {
        bugFilters[filterType] = null;
        chip.classList.remove('active');
      } else {
        // Deactivate sibling chips
        document.querySelectorAll('.filter-chip[data-filter="' + filterType + '"]').forEach(function(c) {
          c.classList.remove('active');
        });
        bugFilters[filterType] = value;
        chip.classList.add('active');
      }
      applyBugFilters();
    }

    function clearBugFilters() {
      bugFilters = { priority: null, status: null };
      document.querySelectorAll('.filter-chip').forEach(function(c) { c.classList.remove('active'); });
      applyBugFilters();
    }

    function applyBugFilters() {
      var rows = document.querySelectorAll('#bugs-table .bug-row');
      rows.forEach(function(row) {
        var matchP = !bugFilters.priority || row.getAttribute('data-priority') === bugFilters.priority;
        var matchS = !bugFilters.status || row.getAttribute('data-status') === bugFilters.status;
        row.style.display = (matchP && matchS) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;
}
