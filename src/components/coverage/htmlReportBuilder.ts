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
  const notRun = overallSlices.find((s) => s.key === "TODO")?.count ?? 0;
  const ran = total - notRun;
  const coveragePct = total > 0 ? Math.round((ran / total) * 100) : 0;
  const passRatePct = total > 0 ? Math.round((passed / total) * 100) : 0;

  // ── Charts row ──────────────────────────────────────────────────────────────
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

  // ── Sets summary table ──────────────────────────────────────────────────────
  const setsSummaryRows = sets
    .map((ts) => {
      const tests = queryBySetId.get(ts.issue_id)?.tests ?? [];
      const slices = buildReportSlices(tests);
      const setPassed = slices.find((s) => s.key === "PASS")?.count ?? 0;
      const setFailed = slices.find((s) => s.key === "FAIL")?.count ?? 0;
      const setNotRun = slices.find((s) => s.key === "TODO")?.count ?? 0;
      const setCovPct =
        tests.length > 0 ? Math.round(((tests.length - setNotRun) / tests.length) * 100) : 0;
      const setPassPct = tests.length > 0 ? Math.round((setPassed / tests.length) * 100) : 0;
      const miniBar = buildSvgMiniBar(slices, 120, 8);
      const covColor =
        setCovPct >= 80 ? "#059669" : setCovPct >= 50 ? "#d97706" : "#dc2626";
      const passColor =
        setPassPct >= 80 ? "#059669" : setPassPct >= 50 ? "#d97706" : "#dc2626";
      const hasFail = setFailed > 0;
      return `<tr style="${hasFail ? "background:#fff5f5;" : ""}">
        <td style="white-space:nowrap;font-family:monospace;font-size:11px;color:#475569;">${esc(ts.jira.key)}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ts.jira.summary)}</td>
        <td style="text-align:center;font-weight:600;">${tests.length}</td>
        <td>${miniBar}</td>
        <td style="text-align:center;font-weight:700;color:${covColor}">${setCovPct}%</td>
        <td style="text-align:center;font-weight:700;color:${passColor}">${setPassPct}%</td>
        <td style="text-align:center;font-weight:600;color:#059669">${setPassed}</td>
        <td style="text-align:center;font-weight:600;color:${setFailed > 0 ? "#dc2626" : "#94a3b8"}">${setFailed}</td>
        <td style="text-align:center;font-weight:600;color:#94a3b8">${setNotRun}</td>
      </tr>`;
    })
    .join("");

  // ── Per-set detail sections ─────────────────────────────────────────────────
  const setsHtml = sets
    .map((ts) => {
      const tests = queryBySetId.get(ts.issue_id)?.tests ?? [];
      const slices = buildReportSlices(tests);
      const setNotRun = slices.find((s) => s.key === "TODO")?.count ?? 0;
      const setCovPct =
        tests.length > 0 ? Math.round(((tests.length - setNotRun) / tests.length) * 100) : 0;
      const setPassed = slices.find((s) => s.key === "PASS")?.count ?? 0;
      const setFailed = slices.find((s) => s.key === "FAIL")?.count ?? 0;

      const setDonut = tests.length > 0 ? buildSvgDonut(slices, 80) : "";
      const setBar = tests.length > 0 ? buildSvgMiniBar(slices, 180, 8) : "";
      const setLegend = slices
        .map(
          (s) =>
            `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:11px;color:#64748b">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color}"></span>
            ${esc(s.label)} <strong style="color:#1e293b">${s.count}</strong>
          </span>`,
        )
        .join("");

      const rowsHtml =
        tests.length === 0
          ? `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:20px;">No tests in this set.</td></tr>`
          : tests
              .map((t) => {
                const statusName = t.latest_status?.name ?? "NOT RUN";
                const pillClass = statusPillClass(t.latest_status?.name);
                const rowBg =
                  pillClass === "fail" || pillClass === "aborted" ? "background:#fff5f5;" : "";
                return `<tr style="${rowBg}">
              <td class="key-cell">${esc(t.jira.key)}</td>
              <td>${esc(t.jira.summary)}</td>
              <td><span class="status-pill ${pillClass}">${esc(statusName)}</span></td>
            </tr>`;
              })
              .join("");

      return `
      <div class="section">
        <div class="section-header">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
            <span class="key">${esc(ts.jira.key)}</span>
            <h2 style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ts.jira.summary)}</h2>
          </div>
          <div class="badges">
            <span class="badge total">${tests.length} tests</span>
            ${setPassed > 0 ? `<span class="badge pass">✓ ${setPassed} passed</span>` : ""}
            ${setFailed > 0 ? `<span class="badge fail">✗ ${setFailed} failed</span>` : ""}
            ${setNotRun > 0 ? `<span class="badge todo">⏳ ${setNotRun} not run</span>` : ""}
          </div>
        </div>
        ${
          tests.length > 0
            ? `<div style="display:flex;align-items:center;gap:20px;padding:14px 20px;background:#fafafa;border-bottom:1px solid #f1f5f9">
            <div style="flex-shrink:0">${setDonut}</div>
            <div style="flex:1">
              <div style="margin-bottom:8px">${setLegend}</div>
              ${setBar}
              <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:#64748b">
                <span>Coverage: <strong style="color:${setCovPct >= 80 ? "#059669" : setCovPct >= 50 ? "#d97706" : "#dc2626"}">${setCovPct}%</strong></span>
                <span>Pass rate: <strong style="color:${setPassed / (tests.length || 1) >= 0.8 ? "#059669" : "#d97706"}">${Math.round((setPassed / (tests.length || 1)) * 100)}%</strong></span>
              </div>
            </div>
          </div>`
            : ""
        }
        <table>
          <thead><tr><th style="width:110px;">Key</th><th>Summary</th><th style="width:120px;">Status</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Coverage Report – ${esc(projectKey)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#fff;font-size:13px}
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
    .footer{padding:16px 48px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#94a3b8;font-size:11px}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .section{page-break-inside:avoid}
      .charts-row,.summary-section{page-break-inside:avoid}
      @page{margin:0.6in 0.5in}
    }
  </style>
</head>
<body>
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

  <div class="charts-row">
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

  <div class="summary-section">
    <h3>Test Sets Summary</h3>
    <table class="summary-table">
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

  <div class="content">
    ${setsHtml}
  </div>

  <div class="summary-section" style="page-break-before:always">
    <h3>Analysis</h3>

    <!-- Insights -->
    <div style="margin-bottom:20px">
      <h4 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:10px">Key Findings</h4>
      <ul style="list-style:none;display:flex;flex-direction:column;gap:7px">
        ${(() => {
          const neverRun = allTests.filter((t) => t.latest_status?.is_final !== true);
          const runAtLeastOnce = total - neverRun.length;
          const coveragePct2 = total > 0 ? Math.round((runAtLeastOnce / total) * 100) : 0;
          const passRatePct2 = total > 0 ? Math.round((passed / total) * 100) : 0;
          const failRatePct2 = total > 0 ? Math.round((failed / total) * 100) : 0;

          const highFailSets = sets.filter((ts) => {
            const t = queryBySetId.get(ts.issue_id)?.tests ?? [];
            if (t.length === 0) return false;
            const f = t.filter((x) => {
              const sl = buildReportSlices([x]);
              return sl.find((s) => s.key === "FAIL")?.count ?? 0 > 0;
            }).length;
            return f / t.length >= 0.5;
          });

          const findings: string[] = [
            `<li style="display:flex;align-items:flex-start;gap:8px;font-size:12px"><span style="color:#3b82f6;font-size:10px;margin-top:2px">●</span><span style="color:#475569">${coveragePct2}% coverage — ${runAtLeastOnce} of ${total} tests run at least once</span></li>`,
            `<li style="display:flex;align-items:flex-start;gap:8px;font-size:12px"><span style="color:${passRatePct2 >= 80 ? "#059669" : passRatePct2 >= 50 ? "#d97706" : "#dc2626"};font-size:10px;margin-top:2px">●</span><span style="color:#475569">${passRatePct2}% overall pass rate — ${passed} passed, ${failed} failed</span></li>`,
          ];
          if (failed > 0) findings.push(`<li style="display:flex;align-items:flex-start;gap:8px;font-size:12px"><span style="color:#f59e0b;font-size:10px;margin-top:2px">▲</span><span style="color:#92400e">${failed} test${failed !== 1 ? "s" : ""} failing (${failRatePct2}% of total)</span></li>`);
          if (highFailSets.length > 0) findings.push(`<li style="display:flex;align-items:flex-start;gap:8px;font-size:12px"><span style="color:#dc2626;font-size:10px;margin-top:2px">▲</span><span style="color:#991b1b">${highFailSets.length} set${highFailSets.length !== 1 ? "s have" : " has"} &gt;50% failure rate: ${highFailSets.map((ts) => esc(ts.jira.key)).join(", ")}</span></li>`);
          if (neverRun.length > 0) findings.push(`<li style="display:flex;align-items:flex-start;gap:8px;font-size:12px"><span style="color:#94a3b8;font-size:10px;margin-top:2px">●</span><span style="color:#475569">${neverRun.length} test${neverRun.length !== 1 ? "s" : ""} never executed (${100 - coveragePct2}% gap)</span></li>`);
          return findings.join("");
        })()}
      </ul>
    </div>

    <!-- Failure concentration -->
    ${(() => {
      const withFails = sets
        .map((ts) => {
          const t = queryBySetId.get(ts.issue_id)?.tests ?? [];
          const slices = buildReportSlices(t);
          const f = slices.find((s) => s.key === "FAIL")?.count ?? 0;
          return { ts, failCount: f, total: t.length };
        })
        .filter((r) => r.failCount > 0)
        .sort((a, b) => b.failCount - a.failCount);
      if (withFails.length === 0) return "";
      const maxF = withFails[0]!.failCount;
      const rows = withFails
        .map(({ ts, failCount, total: t }) => {
          const pct = t > 0 ? Math.round((failCount / t) * 100) : 0;
          const barW = maxF > 0 ? Math.round((failCount / maxF) * 100) : 0;
          return `<tr>
            <td style="white-space:nowrap;font-family:monospace;font-size:11px;color:#475569">${esc(ts.jira.key)}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ts.jira.summary)}</td>
            <td style="text-align:center;font-weight:700;color:#dc2626">${failCount}</td>
            <td style="text-align:center;color:#dc2626">${pct}%</td>
            <td style="width:120px">
              <div style="background:#fee2e2;border-radius:4px;height:8px;overflow:hidden">
                <div style="background:#dc2626;height:100%;width:${barW}%;border-radius:4px"></div>
              </div>
            </td>
          </tr>`;
        })
        .join("");
      return `<div style="margin-bottom:20px">
        <h4 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:10px">Failure Concentration</h4>
        <table class="summary-table">
          <thead><tr><th style="width:90px">Key</th><th>Set Name</th><th style="width:70px;text-align:center">Failures</th><th style="width:60px;text-align:center">Rate</th><th style="width:130px">Bar</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })()}

    <!-- Never-run tests -->
    ${(() => {
      const withNeverRun = sets
        .map((ts) => {
          const t = queryBySetId.get(ts.issue_id)?.tests ?? [];
          const nr = t.filter((x) => x.latest_status?.is_final !== true).length;
          return { ts, neverRun: nr, total: t.length };
        })
        .filter((r) => r.neverRun > 0)
        .sort((a, b) => b.neverRun - a.neverRun);
      if (withNeverRun.length === 0) return "";
      const maxNR = withNeverRun[0]!.neverRun;
      const rows = withNeverRun
        .map(({ ts, neverRun: nr, total: t }) => {
          const pct = t > 0 ? Math.round((nr / t) * 100) : 0;
          const barW = maxNR > 0 ? Math.round((nr / maxNR) * 100) : 0;
          return `<tr>
            <td style="white-space:nowrap;font-family:monospace;font-size:11px;color:#475569">${esc(ts.jira.key)}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ts.jira.summary)}</td>
            <td style="text-align:center;font-weight:700;color:#d97706">${nr}</td>
            <td style="text-align:center;color:#d97706">${pct}%</td>
            <td style="width:120px">
              <div style="background:#fef3c7;border-radius:4px;height:8px;overflow:hidden">
                <div style="background:#f59e0b;height:100%;width:${barW}%;border-radius:4px"></div>
              </div>
            </td>
          </tr>`;
        })
        .join("");
      return `<div>
        <h4 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:10px">Never-Run Tests by Set</h4>
        <table class="summary-table">
          <thead><tr><th style="width:90px">Key</th><th>Set Name</th><th style="width:80px;text-align:center">Never Run</th><th style="width:60px;text-align:center">Rate</th><th style="width:130px">Bar</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })()}
  </div>

  <div class="footer">
    <span>Generated by QAlity Manual Reporting</span>
    <span>${esc(date)} at ${esc(time)}</span>
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;
}
