import type { XrayTestSet, XrayTestWithStatus } from "@/types";
import { normalizeStatusKey } from "@/constants/statuses";

function buildSvgDonut(
  slices: Array<{ pct: number; color: string; label: string; count: number }>,
  size = 140,
): string {
  const R = size * 0.37;
  const holeR = size * 0.25;
  const CX = size / 2;
  const CY = size / 2;
  const CIRCUM = 2 * Math.PI * R;
  const GAP = 1.5;
  const sw = R - holeR;

  let cumPct = 0;
  const circles = slices
    .map((d) => {
      const dashLen = Math.max(0, d.pct * CIRCUM - GAP);
      const dashOffset = -(cumPct * CIRCUM);
      cumPct += d.pct;
      return `<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${R.toFixed(1)}" fill="none" stroke="${d.color}" stroke-width="${sw.toFixed(1)}" stroke-dasharray="${dashLen.toFixed(2)} ${CIRCUM.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" transform="rotate(-90 ${CX.toFixed(1)} ${CY.toFixed(1)})"><title>${esc(d.label)}: ${d.count} (${Math.round(d.pct * 100)}%)</title></circle>`;
    })
    .join("");

  const total = slices.reduce((acc, s) => acc + s.count, 0);
  const bg = `<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${R.toFixed(1)}" fill="none" stroke="#e2e8f0" stroke-width="${sw.toFixed(1)}"/>`;
  const fs = (size * 0.15).toFixed(1);
  const sfs = (size * 0.08).toFixed(1);
  const center = `<text x="${CX}" y="${CY - 3}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fs}" font-weight="700" fill="#0f172a">${total}</text><text x="${CX}" y="${CY + parseFloat(sfs) + 5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${sfs}" fill="#94a3b8">tests</text>`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${circles}${center}</svg>`;
}

function buildSvgMiniBar(
  slices: Array<{ pct: number; color: string; label: string; count: number }>,
  width = 200,
  height = 10,
): string {
  let x = 0;
  const rects = slices
    .map((d) => {
      const w = Math.max(0, d.pct * width);
      const rect = `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="${d.color}"><title>${esc(d.label)}: ${d.count} (${Math.round(d.pct * 100)}%)</title></rect>`;
      x += w;
      return rect;
    })
    .join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="border-radius:5px;overflow:hidden;display:block"><rect x="0" y="0" width="${width}" height="${height}" fill="#e2e8f0"/>${rects}</svg>`;
}

function buildSvgGauge(pct: number, size = 110): string {
  const R = size * 0.38;
  const CX = size / 2;
  const CY = size * 0.6;
  const startAngle = (-Math.PI * 4) / 5;
  const endAngle = (Math.PI * 4) / 5;
  const totalAngle = endAngle - startAngle;
  const fillAngle = startAngle + totalAngle * (pct / 100);
  const sw = size * 0.085;

  const toXY = (a: number) => ({
    x: (CX + R * Math.cos(a)).toFixed(2),
    y: (CY + R * Math.sin(a)).toFixed(2),
  });

  const sBg = toXY(startAngle);
  const eBg = toXY(endAngle);
  const pathBg = `M ${sBg.x} ${sBg.y} A ${R.toFixed(1)} ${R.toFixed(1)} 0 1 1 ${eBg.x} ${eBg.y}`;

  let pathFg = "";
  const gaugeColor = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  if (pct > 1) {
    const sFg = toXY(startAngle);
    const eFg = toXY(fillAngle);
    const largeArc = fillAngle - startAngle > Math.PI ? 1 : 0;
    pathFg = `<path d="M ${sFg.x} ${sFg.y} A ${R.toFixed(1)} ${R.toFixed(1)} 0 ${largeArc} 1 ${eFg.x} ${eFg.y}" fill="none" stroke="${gaugeColor}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>`;
  }

  const textColor = pct >= 80 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626";
  const fs = (size * 0.2).toFixed(1);
  const sfs = (size * 0.1).toFixed(1);
  const centerText = `<text x="${CX}" y="${CY + 5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fs}" font-weight="700" fill="${textColor}">${pct}%</text><text x="${CX}" y="${(CY + parseFloat(sfs) * 2 + 4).toFixed(1)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${sfs}" fill="#94a3b8">coverage</text>`;

  const svgHeight = (CY + R * 0.85).toFixed(0);
  return `<svg width="${size}" height="${svgHeight}" viewBox="0 0 ${size} ${svgHeight}"><path d="${pathBg}" fill="none" stroke="#e2e8f0" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>${pathFg}${centerText}</svg>`;
}

function statusPillClass(status: string | undefined): string {
  const s = (status ?? "").toUpperCase();
  if (s === "PASS" || s === "PASSED") return "pass";
  if (s === "FAIL" || s === "FAILED") return "fail";
  if (s === "ABORTED" || s === "BLOCKED") return "aborted";
  if (!status) return "todo";
  return "other";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Palette colours matching STATUS_PALETTE in StatusCharts.tsx */
export const REPORT_STATUS_COLORS: Record<string, string> = {
  PASS: "#10b981",
  FAIL: "#ef4444",
  BLOCKED: "#3b82f6",
  EXECUTING: "#eab308",
  TODO: "#94a3b8",
  "N/A": "#f97316",
};

export interface ReportSlice {
  key: string;
  label: string;
  color: string;
  count: number;
  pct: number;
}

export function buildReportSlices(tests: XrayTestWithStatus[]): ReportSlice[] {
  const counts: Record<string, number> = {};
  for (const t of tests) {
    const key = normalizeStatusKey(t.latest_status?.name ?? "TODO");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const total = tests.length;
  const order = ["PASS", "FAIL", "BLOCKED", "EXECUTING", "N/A", "TODO"];
  const labels: Record<string, string> = {
    PASS: "Passed",
    FAIL: "Failed",
    BLOCKED: "Blocked",
    EXECUTING: "Executing",
    "N/A": "N/A",
    TODO: "Not Run",
  };
  return order
    .filter((k) => counts[k])
    .map((k) => ({
      key: k,
      label: labels[k] ?? k,
      color: REPORT_STATUS_COLORS[k] ?? "#94a3b8",
      count: counts[k] ?? 0,
      pct: total > 0 ? (counts[k] ?? 0) / total : 0,
    }));
}

export function buildCoverageHTML(
  sets: XrayTestSet[],
  queryBySetId: Map<string, { tests: XrayTestWithStatus[] | undefined }>,
  projectKey: string,
): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const allTests = [...queryBySetId.values()].flatMap((q) => q.tests ?? []);
  const total = allTests.length;
  const overallSlices = buildReportSlices(allTests);
  const passed = overallSlices.find((s) => s.key === "PASS")?.count ?? 0;
  const failed = overallSlices.find((s) => s.key === "FAIL")?.count ?? 0;
  const blocked = overallSlices.find((s) => s.key === "BLOCKED")?.count ?? 0;
  const notRun = overallSlices.find((s) => s.key === "TODO")?.count ?? 0;
  const ran = total - notRun;
  const coveragePct = total > 0 ? Math.round((ran / total) * 100) : 0;
  const passRatePct = total > 0 ? Math.round((passed / total) * 100) : 0;

  // ── Charts ──────────────────────────────────────────────────────────────────
  const donutSvg = buildSvgDonut(overallSlices, 140);
  const gaugeSvg = buildSvgGauge(coveragePct, 110);
  const overallBarSvg = buildSvgMiniBar(overallSlices, 300, 14);

  const legendHtml = overallSlices
    .map(
      (s) =>
        `<div style="display:flex;align-items:center;gap:7px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
          <span style="color:#475569;font-size:12px;">${esc(s.label)}</span>
          <span style="margin-left:auto;font-weight:600;color:#1e293b;font-size:12px;font-variant-numeric:tabular-nums;">${s.count}</span>
          <span style="color:#94a3b8;font-size:11px;width:32px;text-align:right;">${Math.round(s.pct * 100)}%</span>
        </div>`,
    )
    .join("");

  // ── Per-set data computation ────────────────────────────────────────────────
  interface SetData {
    ts: XrayTestSet;
    tests: XrayTestWithStatus[];
    slices: ReportSlice[];
    passed: number;
    failed: number;
    blocked: number;
    notRun: number;
    coveragePct: number;
    passRatePct: number;
  }

  const setDataArr: SetData[] = sets.map((ts) => {
    const tests = queryBySetId.get(ts.issue_id)?.tests ?? [];
    const slices = buildReportSlices(tests);
    const setPassed = slices.find((s) => s.key === "PASS")?.count ?? 0;
    const setFailed = slices.find((s) => s.key === "FAIL")?.count ?? 0;
    const setBlocked = slices.find((s) => s.key === "BLOCKED")?.count ?? 0;
    const setNotRun = slices.find((s) => s.key === "TODO")?.count ?? 0;
    const setCovPct =
      tests.length > 0 ? Math.round(((tests.length - setNotRun) / tests.length) * 100) : 0;
    const setPassPct = tests.length > 0 ? Math.round((setPassed / tests.length) * 100) : 0;
    return {
      ts,
      tests,
      slices,
      passed: setPassed,
      failed: setFailed,
      blocked: setBlocked,
      notRun: setNotRun,
      coveragePct: setCovPct,
      passRatePct: setPassPct,
    };
  });

  // ── Summary table rows ──────────────────────────────────────────────────────
  const setsSummaryRows = setDataArr
    .map((sd) => {
      const miniBar = buildSvgMiniBar(sd.slices, 120, 8);
      const covColor =
        sd.coveragePct >= 80 ? "#059669" : sd.coveragePct >= 50 ? "#d97706" : "#dc2626";
      const passColor =
        sd.passRatePct >= 80 ? "#059669" : sd.passRatePct >= 50 ? "#d97706" : "#dc2626";
      const hasFail = sd.failed > 0;
      const healthTag = hasFail
        ? "fail"
        : sd.notRun > 0
          ? "partial"
          : "pass";
      return `<tr class="set-summary-row" data-health="${healthTag}" style="${hasFail ? "background:#fff5f5;" : ""}">
        <td style="white-space:nowrap;font-family:monospace;font-size:11px;color:#475569;">
          <a href="#set-${esc(sd.ts.issue_id)}" style="color:#475569;text-decoration:none">${esc(sd.ts.jira.key)}</a>
        </td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(sd.ts.jira.summary)}</td>
        <td style="text-align:center;font-weight:600;">${sd.tests.length}</td>
        <td>${miniBar}</td>
        <td style="text-align:center;font-weight:700;color:${covColor}">${sd.coveragePct}%</td>
        <td style="text-align:center;font-weight:700;color:${passColor}">${sd.passRatePct}%</td>
        <td style="text-align:center;font-weight:600;color:#059669">${sd.passed}</td>
        <td style="text-align:center;font-weight:600;color:${sd.failed > 0 ? "#dc2626" : "#94a3b8"}">${sd.failed}</td>
        <td style="text-align:center;font-weight:600;color:#94a3b8">${sd.notRun}</td>
      </tr>`;
    })
    .join("");

  // Health filter chips for summary table
  const healthCounts = {
    all: setDataArr.length,
    pass: setDataArr.filter((sd) => sd.failed === 0 && sd.notRun === 0).length,
    partial: setDataArr.filter((sd) => sd.failed === 0 && sd.notRun > 0).length,
    fail: setDataArr.filter((sd) => sd.failed > 0).length,
  };

  const healthChips = [
    { label: "All", value: "all", color: "#475569", count: healthCounts.all },
    { label: "✓ Passing", value: "pass", color: "#059669", count: healthCounts.pass },
    { label: "⏳ Partial", value: "partial", color: "#d97706", count: healthCounts.partial },
    { label: "✗ Failing", value: "fail", color: "#dc2626", count: healthCounts.fail },
  ]
    .filter((c) => c.value === "all" || c.count > 0)
    .map(
      (c) =>
        `<button class="health-chip${c.value === "all" ? " active" : ""}" data-health="${c.value}" onclick="filterSummary(this)" style="border-radius:999px;padding:2px 8px;font-size:10px;font-weight:600;border:1px solid ${c.value === "all" ? c.color : "#e2e8f0"};background:${c.value === "all" ? c.color + "12" : "#fff"};color:${c.color};cursor:pointer;transition:all .15s">${c.label} <span style="font-weight:400">(${c.count})</span></button>`,
    )
    .join(" ");

  // ── Per-set detail sections ─────────────────────────────────────────────────
  const setsHtml = setDataArr
    .map((sd, setIdx) => {
      const setDonut = sd.tests.length > 0 ? buildSvgDonut(sd.slices, 80) : "";
      const setBar = sd.tests.length > 0 ? buildSvgMiniBar(sd.slices, 180, 8) : "";
      const setLegend = sd.slices
        .map(
          (s) =>
            `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:11px;color:#64748b">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color}"></span>
            ${esc(s.label)} <strong style="color:#1e293b">${s.count}</strong>
          </span>`,
        )
        .join("");

      // Status filter chips for test rows
      const setStatuses = [...new Set(sd.tests.map((t) => normalizeStatusKey(t.latest_status?.name ?? "TODO")))].sort();
      const statusFilterChips = setStatuses.length > 1
        ? `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;padding:6px 20px;border-bottom:1px solid #f1f5f9">
            <span style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-right:4px">Filter:</span>
            <button class="test-status-chip active" data-set="${setIdx}" data-status="ALL" onclick="filterTests(this)" style="border-radius:999px;padding:1px 7px;font-size:10px;font-weight:600;border:1px solid #475569;background:#47556912;color:#475569;cursor:pointer">All</button>
            ${setStatuses
              .map(
                (s) =>
                  `<button class="test-status-chip" data-set="${setIdx}" data-status="${s}" onclick="filterTests(this)" style="border-radius:999px;padding:1px 7px;font-size:10px;font-weight:600;border:1px solid #e2e8f0;background:#fff;color:${REPORT_STATUS_COLORS[s] ?? "#94a3b8"};cursor:pointer">${s}</button>`,
              )
              .join(" ")}
          </div>`
        : "";

      const rowsHtml =
        sd.tests.length === 0
          ? `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:20px;">No tests in this set.</td></tr>`
          : sd.tests
              .map((t) => {
                const statusName = t.latest_status?.name ?? "NOT RUN";
                const statusKey = normalizeStatusKey(statusName);
                const pillClass = statusPillClass(t.latest_status?.name);
                const rowBg =
                  pillClass === "fail" || pillClass === "aborted" ? "background:#fff5f5;" : "";
                return `<tr class="test-row" data-set="${setIdx}" data-status="${statusKey}" style="${rowBg}">
              <td class="key-cell">${esc(t.jira.key)}</td>
              <td>${esc(t.jira.summary)}</td>
              <td><span class="status-pill ${pillClass}">${esc(statusName)}</span></td>
            </tr>`;
              })
              .join("");

      // Health badge for section header
      const healthLabel = sd.failed > 0
        ? `<span class="badge fail">✗ ${sd.failed} failed</span>`
        : sd.notRun > 0
          ? `<span class="badge todo">⏳ ${sd.notRun} not run</span>`
          : `<span class="badge pass">✓ All passing</span>`;

      return `
      <div class="section" id="set-${esc(sd.ts.issue_id)}">
        <details${sd.tests.length <= 30 ? " open" : ""}>
          <summary class="section-header" style="cursor:pointer;user-select:none">
            <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
              <span style="font-size:12px;color:#94a3b8;transition:transform .15s">▸</span>
              <span class="key">${esc(sd.ts.jira.key)}</span>
              <h2 style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(sd.ts.jira.summary)}</h2>
            </div>
            <div class="badges">
              <span class="badge total">${sd.tests.length} tests</span>
              ${healthLabel}
              <span style="font-size:10px;font-weight:700;color:${sd.coveragePct >= 80 ? "#059669" : sd.coveragePct >= 50 ? "#d97706" : "#dc2626"}">${sd.coveragePct}% cov</span>
            </div>
          </summary>
          ${
            sd.tests.length > 0
              ? `<div style="display:flex;align-items:center;gap:20px;padding:14px 20px;background:#fafafa;border-bottom:1px solid #f1f5f9">
              <div style="flex-shrink:0">${setDonut}</div>
              <div style="flex:1">
                <div style="margin-bottom:8px">${setLegend}</div>
                ${setBar}
                <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:#64748b">
                  <span>Coverage: <strong style="color:${sd.coveragePct >= 80 ? "#059669" : sd.coveragePct >= 50 ? "#d97706" : "#dc2626"}">${sd.coveragePct}%</strong></span>
                  <span>Pass rate: <strong style="color:${sd.passRatePct >= 80 ? "#059669" : "#d97706"}">${sd.passRatePct}%</strong></span>
                </div>
              </div>
            </div>`
              : ""
          }
          ${statusFilterChips}
          <table>
            <thead>
              <tr>
                <th style="width:110px;cursor:pointer" onclick="sortSetTable(${setIdx},'key')">Key <span class="sort-arrow" id="sort-${setIdx}-key"></span></th>
                <th style="cursor:pointer" onclick="sortSetTable(${setIdx},'name')">Summary <span class="sort-arrow" id="sort-${setIdx}-name"></span></th>
                <th style="width:120px;cursor:pointer" onclick="sortSetTable(${setIdx},'status')">Status <span class="sort-arrow" id="sort-${setIdx}-status"></span></th>
              </tr>
            </thead>
            <tbody class="set-tbody" data-set="${setIdx}">${rowsHtml}</tbody>
          </table>
        </details>
      </div>`;
    })
    .join("");

  // ── Analysis section ────────────────────────────────────────────────────────
  const analysisHtml = buildAnalysisSection(setDataArr, total, passed, failed, blocked, notRun, coveragePct, passRatePct);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navItems = [
    { label: "Overview", href: "#sec-overview" },
    { label: "Summary", href: "#sec-summary" },
    { label: `Sets (${sets.length})`, href: "#sec-sets" },
    { label: "Analysis", href: "#sec-analysis" },
  ];
  const navLinks = navItems
    .map(
      (n) =>
        `<a href="${n.href}" style="padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#e2e8f0;text-decoration:none;white-space:nowrap;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,.15)'" onmouseout="this.style.background='transparent'">${esc(n.label)}</a>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Coverage Report – ${esc(projectKey)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#fff;font-size:13px;padding-top:38px}
    .sticky-nav{position:fixed;top:0;left:0;right:0;z-index:100;background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:8px 24px;display:flex;align-items:center;gap:2px;flex-wrap:wrap}
    .sticky-nav .nav-title{font-size:12px;font-weight:700;color:#6366f1;margin-right:12px;letter-spacing:.5px}
    .header{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:28px 48px;display:flex;justify-content:space-between;align-items:flex-end}
    .header-left h1{font-size:22px;font-weight:700;letter-spacing:-0.5px}
    .header-left .sub{font-size:12px;color:#94a3b8;margin-top:3px}
    .header-right{text-align:right;font-size:12px;color:#94a3b8;line-height:1.6}
    .header-right .project{font-size:16px;font-weight:600;color:#e2e8f0;font-family:monospace}
    .charts-row{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e2e8f0}
    .chart-cell{padding:24px 32px;display:flex;align-items:center;gap:20px}
    .chart-cell:first-child{border-right:1px solid #e2e8f0;background:#fafafa}
    .chart-cell:last-child{background:#fff}
    .chart-cell-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:12px}
    .chart-cell-content{flex:1}
    .legend{display:flex;flex-direction:column;gap:6px;min-width:140px}
    .gauge-stats{display:flex;flex-direction:column;gap:8px;flex:1}
    .gauge-stat-row{display:flex;align-items:center;justify-content:space-between;font-size:12px}
    .gauge-stat-label{color:#64748b}
    .gauge-stat-value{font-weight:700;color:#1e293b}
    .gauge-stat-value.green{color:#059669}
    .gauge-stat-value.red{color:#dc2626}
    .gauge-stat-value.amber{color:#d97706}
    .bar-label-row{display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-bottom:6px}
    .summary-section{padding:20px 48px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
    .summary-section h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:12px}
    .summary-table{width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0}
    .summary-table th{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;padding:8px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0}
    .summary-table td{font-size:12px;padding:9px 12px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
    .summary-table tr:last-child td{border-bottom:none}
    .content{padding:20px 48px 32px}
    .section{margin-bottom:20px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;page-break-inside:avoid}
    .section-header{background:#f8fafc;padding:12px 18px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    .section-header h2{font-size:13px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .key{font-size:11px;font-family:monospace;color:#475569;background:#e2e8f0;padding:2px 7px;border-radius:4px;white-space:nowrap;flex-shrink:0}
    .badges{display:flex;gap:6px;align-items:center;flex-shrink:0}
    .badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:100px;white-space:nowrap}
    .badge.pass{background:#d1fae5;color:#065f46}
    .badge.fail{background:#fee2e2;color:#991b1b}
    .badge.todo{background:#fef3c7;color:#92400e}
    .badge.total{background:#e2e8f0;color:#475569}
    table{width:100%;border-collapse:collapse}
    th{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;padding:9px 16px;text-align:left;border-bottom:1px solid #e2e8f0;background:#f8fafc}
    td{font-size:12px;padding:9px 16px;border-bottom:1px solid #f1f5f9;color:#374151;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .key-cell{font-family:monospace;font-size:11px;color:#64748b;white-space:nowrap}
    .status-pill{display:inline-flex;align-items:center;font-size:10px;font-weight:700;padding:2px 9px;border-radius:100px;letter-spacing:.3px;text-transform:uppercase}
    .status-pill.pass{background:#d1fae5;color:#065f46}
    .status-pill.fail{background:#fee2e2;color:#991b1b}
    .status-pill.aborted{background:#fce7f3;color:#9d174d}
    .status-pill.todo{background:#f1f5f9;color:#64748b}
    .status-pill.other{background:#e2e8f0;color:#475569}
    .sort-arrow{font-size:9px;color:#94a3b8}
    .health-chip.active,.test-status-chip.active{border-color:currentColor!important;box-shadow:0 0 0 1px currentColor}
    details>summary{list-style:none}
    details>summary::-webkit-details-marker{display:none}
    details[open]>summary span:first-child{transform:rotate(90deg);display:inline-block}
    .finding-card{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-radius:8px;margin-bottom:6px;font-size:12px}
    .finding-card.critical{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
    .finding-card.warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
    .finding-card.ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}
    .finding-card.info{background:#f8fafc;border:1px solid #e2e8f0;color:#475569}
    .footer{padding:16px 48px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#94a3b8;font-size:11px}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding-top:0}
      .sticky-nav{display:none!important}
      .section{page-break-inside:avoid}
      .charts-row,.summary-section{page-break-inside:avoid}
      details[open]>summary~*{display:block!important}
      @page{margin:0.6in 0.5in}
    }
  </style>
</head>
<body>
  <!-- Sticky Nav -->
  <nav class="sticky-nav">
    <span class="nav-title">QAlity Coverage</span>
    ${navLinks}
  </nav>

  <div class="header">
    <div class="header-left">
      <h1>QAlity · Coverage Report</h1>
      <div class="sub">Test execution coverage across selected test sets</div>
    </div>
    <div class="header-right">
      <div class="project">${esc(projectKey)}</div>
      <div>${esc(date)} · ${esc(time)}</div>
      <div>${sets.length} test set${sets.length !== 1 ? "s" : ""} · ${total} tests</div>
    </div>
  </div>

  <div class="charts-row" id="sec-overview">
    <!-- Left: Donut + legend -->
    <div class="chart-cell">
      ${donutSvg}
      <div class="legend">${legendHtml}</div>
    </div>
    <!-- Right: Gauge + bar + stats -->
    <div class="chart-cell">
      ${gaugeSvg}
      <div class="gauge-stats">
        <div>
          <div class="bar-label-row">
            <span>Status distribution</span>
          </div>
          ${overallBarSvg}
        </div>
        <div style="margin-top:4px;display:flex;flex-direction:column;gap:5px">
          <div class="gauge-stat-row">
            <span class="gauge-stat-label">Total tests</span>
            <span class="gauge-stat-value">${total}</span>
          </div>
          <div class="gauge-stat-row">
            <span class="gauge-stat-label">Passed</span>
            <span class="gauge-stat-value green">${passed}</span>
          </div>
          <div class="gauge-stat-row">
            <span class="gauge-stat-label">Failed</span>
            <span class="gauge-stat-value ${failed > 0 ? "red" : ""}">${failed}</span>
          </div>
          <div class="gauge-stat-row">
            <span class="gauge-stat-label">Not yet run</span>
            <span class="gauge-stat-value ${notRun > 0 ? "amber" : ""}">${notRun}</span>
          </div>
          <div class="gauge-stat-row">
            <span class="gauge-stat-label">Pass rate</span>
            <span class="gauge-stat-value ${passRatePct >= 80 ? "green" : passRatePct >= 50 ? "amber" : "red"}">${passRatePct}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="summary-section" id="sec-summary">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h3 style="margin-bottom:0">Test Sets Summary</h3>
      <div style="display:flex;gap:4px;align-items:center">${healthChips}</div>
    </div>
    <table class="summary-table" id="summary-table">
      <thead>
        <tr>
          <th style="width:90px">Key</th>
          <th>Test Set Name</th>
          <th style="width:56px;text-align:center">Tests</th>
          <th style="width:130px">Distribution</th>
          <th style="width:72px;text-align:center">Coverage</th>
          <th style="width:72px;text-align:center">Pass Rate</th>
          <th style="width:52px;text-align:center">✓</th>
          <th style="width:52px;text-align:center">✗</th>
          <th style="width:52px;text-align:center">⏳</th>
        </tr>
      </thead>
      <tbody>${setsSummaryRows}</tbody>
    </table>
  </div>

  <div class="content" id="sec-sets">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="font-size:13px;font-weight:700;color:#0f172a">Test Set Details</h3>
      <div style="display:flex;gap:6px">
        <button onclick="toggleAllDetails(true)" style="font-size:10px;color:#6366f1;background:none;border:1px solid #e2e8f0;border-radius:6px;padding:3px 10px;cursor:pointer">Expand All</button>
        <button onclick="toggleAllDetails(false)" style="font-size:10px;color:#6366f1;background:none;border:1px solid #e2e8f0;border-radius:6px;padding:3px 10px;cursor:pointer">Collapse All</button>
      </div>
    </div>
    ${setsHtml}
  </div>

  <div class="summary-section" id="sec-analysis" style="page-break-before:always">
    ${analysisHtml}
  </div>

  <div class="footer">
    <span>Generated by QAlity Manual Reporting</span>
    <span>${esc(date)} at ${esc(time)}</span>
  </div>

  <script>
    // Health filter for summary table
    function filterSummary(chip) {
      var value = chip.getAttribute('data-health');
      document.querySelectorAll('.health-chip').forEach(function(c) { c.classList.remove('active'); c.style.borderColor = '#e2e8f0'; c.style.background = '#fff'; });
      chip.classList.add('active');
      chip.style.borderColor = 'currentColor';
      chip.style.background = chip.style.color + '12';
      document.querySelectorAll('.set-summary-row').forEach(function(row) {
        if (value === 'all' || row.getAttribute('data-health') === value) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    }

    // Per-set test status filter
    function filterTests(chip) {
      var setIdx = chip.getAttribute('data-set');
      var status = chip.getAttribute('data-status');
      document.querySelectorAll('.test-status-chip[data-set="' + setIdx + '"]').forEach(function(c) {
        c.classList.remove('active');
        c.style.borderColor = '#e2e8f0';
        c.style.background = '#fff';
      });
      chip.classList.add('active');
      chip.style.borderColor = 'currentColor';
      chip.style.background = chip.style.color + '12';
      document.querySelectorAll('.test-row[data-set="' + setIdx + '"]').forEach(function(row) {
        if (status === 'ALL' || row.getAttribute('data-status') === status) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    }

    // Sorting for set tables
    var sortState = {};
    function sortSetTable(setIdx, col) {
      var key = setIdx + '-' + col;
      var asc = sortState[key] !== 'asc';
      sortState[key] = asc ? 'asc' : 'desc';
      // Reset arrows
      ['key','name','status'].forEach(function(c) {
        var el = document.getElementById('sort-' + setIdx + '-' + c);
        if (el) el.textContent = '';
      });
      var arrow = document.getElementById('sort-' + setIdx + '-' + col);
      if (arrow) arrow.textContent = asc ? '▲' : '▼';
      var tbody = document.querySelector('.set-tbody[data-set="' + setIdx + '"]');
      if (!tbody) return;
      var rows = Array.from(tbody.querySelectorAll('.test-row'));
      rows.sort(function(a, b) {
        var va, vb;
        if (col === 'key') { va = a.children[0].textContent; vb = b.children[0].textContent; }
        else if (col === 'name') { va = a.children[1].textContent; vb = b.children[1].textContent; }
        else { va = a.getAttribute('data-status'); vb = b.getAttribute('data-status'); }
        var cmp = (va || '').localeCompare(vb || '');
        return asc ? cmp : -cmp;
      });
      rows.forEach(function(r) { tbody.appendChild(r); });
    }

    // Expand/Collapse all details
    function toggleAllDetails(open) {
      document.querySelectorAll('.section details').forEach(function(d) {
        d.open = open;
      });
    }
  </script>
</body>
</html>`;
}

// ── Analysis section builder ────────────────────────────────────────────────

function buildAnalysisSection(
  setDataArr: Array<{
    ts: XrayTestSet;
    tests: XrayTestWithStatus[];
    slices: ReportSlice[];
    passed: number;
    failed: number;
    blocked: number;
    notRun: number;
    coveragePct: number;
    passRatePct: number;
  }>,
  total: number,
  passed: number,
  failed: number,
  blocked: number,
  notRun: number,
  coveragePct: number,
  passRatePct: number,
): string {
  // ── Algorithmic findings ──────────────────────────────────────────────────
  const findings: string[] = [];

  // Critical findings
  const highFailSets = setDataArr.filter(
    (sd) => sd.tests.length > 0 && sd.failed / sd.tests.length >= 0.5,
  );
  const zeroCoverageSets = setDataArr.filter(
    (sd) => sd.tests.length > 0 && sd.coveragePct === 0,
  );
  if (highFailSets.length > 0) {
    findings.push(
      `<div class="finding-card critical"><span style="font-size:14px">🔴</span><span>${highFailSets.length} set${highFailSets.length !== 1 ? "s have" : " has"} &gt;50% failure rate: ${highFailSets.map((sd) => `<strong>${esc(sd.ts.jira.key)}</strong>`).join(", ")}</span></div>`,
    );
  }
  if (zeroCoverageSets.length > 0) {
    findings.push(
      `<div class="finding-card critical"><span style="font-size:14px">🔴</span><span>${zeroCoverageSets.length} set${zeroCoverageSets.length !== 1 ? "s have" : " has"} 0% coverage: ${zeroCoverageSets.map((sd) => `<strong>${esc(sd.ts.jira.key)}</strong>`).join(", ")}</span></div>`,
    );
  }

  // Warnings
  if (failed > 0) {
    const failRatePct = total > 0 ? Math.round((failed / total) * 100) : 0;
    findings.push(
      `<div class="finding-card warn"><span style="font-size:14px">⚠️</span><span>${failed} test${failed !== 1 ? "s" : ""} failing (${failRatePct}% of total)</span></div>`,
    );
  }
  if (blocked > 0) {
    findings.push(
      `<div class="finding-card warn"><span style="font-size:14px">⚠️</span><span>${blocked} test${blocked !== 1 ? "s" : ""} blocked — dependencies or environment issues may exist</span></div>`,
    );
  }
  const mostFailSet = setDataArr.filter((sd) => sd.failed > 0).sort((a, b) => b.failed - a.failed)[0];
  if (mostFailSet && mostFailSet.failed > 1) {
    findings.push(
      `<div class="finding-card warn"><span style="font-size:14px">⚠️</span><span>Most failures concentrated in <strong>${esc(mostFailSet.ts.jira.key)}</strong> (${mostFailSet.failed} failures)</span></div>`,
    );
  }

  // Positive findings
  const fullyPassingSets = setDataArr.filter(
    (sd) => sd.tests.length > 0 && sd.failed === 0 && sd.notRun === 0,
  );
  if (fullyPassingSets.length > 0) {
    findings.push(
      `<div class="finding-card ok"><span style="font-size:14px">✅</span><span>${fullyPassingSets.length} of ${setDataArr.length} set${fullyPassingSets.length !== 1 ? "s" : ""} fully passing</span></div>`,
    );
  }
  if (coveragePct === 100) {
    findings.push(
      `<div class="finding-card ok"><span style="font-size:14px">✅</span><span>Full coverage achieved — all tests have been executed at least once</span></div>`,
    );
  }

  // Info
  if (notRun > 0) {
    const gapPct = total > 0 ? Math.round((notRun / total) * 100) : 0;
    findings.push(
      `<div class="finding-card info"><span style="font-size:14px">ℹ️</span><span>${notRun} test${notRun !== 1 ? "s" : ""} never executed (${gapPct}% coverage gap)</span></div>`,
    );
  }

  // ── KPI tiles ─────────────────────────────────────────────────────────────
  const kpiTile = (label: string, value: string, sub: string, color: string, bg: string) =>
    `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;background:${bg};min-width:130px;flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:6px">${esc(label)}</div>
      <div style="font-size:24px;font-weight:800;color:${color};line-height:1.1">${value}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">${esc(sub)}</div>
    </div>`;

  const covColor = coveragePct >= 80 ? "#059669" : coveragePct >= 50 ? "#d97706" : "#dc2626";
  const passColor = passRatePct >= 80 ? "#059669" : passRatePct >= 50 ? "#d97706" : "#dc2626";

  const kpis = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
    ${kpiTile("Coverage", `${coveragePct}%`, `${total - notRun} of ${total} run`, covColor, coveragePct >= 80 ? "#f0fdf4" : coveragePct >= 50 ? "#fffbeb" : "#fef2f2")}
    ${kpiTile("Pass Rate", `${passRatePct}%`, `${passed} passed`, passColor, passRatePct >= 80 ? "#f0fdf4" : passRatePct >= 50 ? "#fffbeb" : "#fef2f2")}
    ${kpiTile("Failures", String(failed), failed === 0 ? "All clear" : `${Math.round((failed / total) * 100)}% of total`, failed === 0 ? "#059669" : "#dc2626", failed === 0 ? "#f0fdf4" : "#fef2f2")}
    ${kpiTile("Not Run", String(notRun), notRun === 0 ? "Full coverage" : `${100 - coveragePct}% gap`, notRun === 0 ? "#059669" : "#d97706", notRun === 0 ? "#f0fdf4" : "#fffbeb")}
  </div>`;

  // ── Failure concentration table ───────────────────────────────────────────
  const withFails = setDataArr
    .filter((sd) => sd.failed > 0)
    .sort((a, b) => b.failed - a.failed);
  const maxF = withFails.length > 0 ? withFails[0]!.failed : 0;

  let failConcentration = "";
  if (withFails.length > 0) {
    const failRows = withFails
      .map((sd) => {
        const pct = sd.tests.length > 0 ? Math.round((sd.failed / sd.tests.length) * 100) : 0;
        const barW = maxF > 0 ? Math.round((sd.failed / maxF) * 100) : 0;
        return `<tr>
          <td style="white-space:nowrap;font-family:monospace;font-size:11px;color:#475569">${esc(sd.ts.jira.key)}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sd.ts.jira.summary)}</td>
          <td style="text-align:center;font-weight:700;color:#dc2626">${sd.failed}</td>
          <td style="text-align:center;color:#dc2626">${pct}%</td>
          <td style="width:120px">
            <div style="background:#fee2e2;border-radius:4px;height:8px;overflow:hidden">
              <div style="background:#dc2626;height:100%;width:${barW}%;border-radius:4px"></div>
            </div>
          </td>
        </tr>`;
      })
      .join("");
    failConcentration = `<details open style="margin-bottom:20px">
      <summary style="cursor:pointer;user-select:none;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#dc2626;margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;color:#94a3b8">▸</span> Failure Concentration <span style="font-weight:400;color:#64748b">(${withFails.length} set${withFails.length !== 1 ? "s" : ""})</span>
      </summary>
      <table class="summary-table">
        <thead><tr><th style="width:90px">Key</th><th>Set Name</th><th style="width:70px;text-align:center">Failures</th><th style="width:60px;text-align:center">Rate</th><th style="width:130px">Bar</th></tr></thead>
        <tbody>${failRows}</tbody>
      </table>
    </details>`;
  }

  // ── Never-run table ───────────────────────────────────────────────────────
  const withNeverRun = setDataArr
    .filter((sd) => sd.notRun > 0)
    .sort((a, b) => b.notRun - a.notRun);
  const maxNR = withNeverRun.length > 0 ? withNeverRun[0]!.notRun : 0;

  let neverRunSection = "";
  if (withNeverRun.length > 0) {
    const nrRows = withNeverRun
      .map((sd) => {
        const pct = sd.tests.length > 0 ? Math.round((sd.notRun / sd.tests.length) * 100) : 0;
        const barW = maxNR > 0 ? Math.round((sd.notRun / maxNR) * 100) : 0;
        return `<tr>
          <td style="white-space:nowrap;font-family:monospace;font-size:11px;color:#475569">${esc(sd.ts.jira.key)}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sd.ts.jira.summary)}</td>
          <td style="text-align:center;font-weight:700;color:#d97706">${sd.notRun}</td>
          <td style="text-align:center;color:#d97706">${pct}%</td>
          <td style="width:120px">
            <div style="background:#fef3c7;border-radius:4px;height:8px;overflow:hidden">
              <div style="background:#f59e0b;height:100%;width:${barW}%;border-radius:4px"></div>
            </div>
          </td>
        </tr>`;
      })
      .join("");
    neverRunSection = `<details open style="margin-bottom:20px">
      <summary style="cursor:pointer;user-select:none;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#d97706;margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;color:#94a3b8">▸</span> Never-Run Tests by Set <span style="font-weight:400;color:#64748b">(${withNeverRun.length} set${withNeverRun.length !== 1 ? "s" : ""})</span>
      </summary>
      <table class="summary-table">
        <thead><tr><th style="width:90px">Key</th><th>Set Name</th><th style="width:80px;text-align:center">Never Run</th><th style="width:60px;text-align:center">Rate</th><th style="width:130px">Bar</th></tr></thead>
        <tbody>${nrRows}</tbody>
      </table>
    </details>`;
  }

  return `<h3>Analysis</h3>
    ${kpis}
    <div style="margin-bottom:20px">
      <h4 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:10px">Key Findings</h4>
      ${findings.length > 0 ? findings.join("") : `<div class="finding-card ok"><span style="font-size:14px">✅</span><span>No issues detected</span></div>`}
    </div>
    ${failConcentration}
    ${neverRunSection}`;
}
