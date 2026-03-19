import { memo, useState, useMemo, useRef, useEffect } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { useGetTestSets, queryKeys } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { useCoveragePresetsStore } from "@/stores/coveragePresetsStore";
import type { CoveragePreset } from "@/stores/coveragePresetsStore";
import { useCoverageHistoryStore, buildViewKey } from "@/stores/coverageHistoryStore";
import type { CoverageSnapshot } from "@/stores/coverageHistoryStore";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookmarkCheck,
  BookmarkPlus,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Clock,
  Download,
  FileText,
  Layers,
  Pencil,
  RefreshCw,
  Search,
  Square,
  Trash2,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { EmptyState } from "@/components/common/EmptyState";
import type { XrayTestSet, XrayTestWithStatus } from "@/types";
import * as api from "@/services/tauri";
import {
  DonutChart,
  StatCard,
  StackedBar,
  MiniStackedBar,
  buildSlicesFromTests,
  findSlice,
} from "@/components/charts/StatusCharts";
import type { Slice } from "@/components/charts/StatusCharts";

// ── SVG chart helpers for HTML report ────────────────────────────────────────

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

// ── HTML report builder ───────────────────────────────────────────────────────

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
const REPORT_STATUS_COLORS: Record<string, string> = {
  PASS: "#10b981",
  FAIL: "#ef4444",
  BLOCKED: "#3b82f6",
  EXECUTING: "#eab308",
  TODO: "#94a3b8",
  "N/A": "#f97316",
};


interface ReportSlice {
  key: string;
  label: string;
  color: string;
  count: number;
  pct: number;
}

function buildReportSlices(tests: XrayTestWithStatus[]): ReportSlice[] {
  const counts: Record<string, number> = {};
  for (const t of tests) {
    const name = t.latest_status?.name ?? "TODO";
    const upper = name.toUpperCase();
    const key = upper.startsWith("PASS")
      ? "PASS"
      : upper.startsWith("FAIL")
        ? "FAIL"
        : upper === "BLOCKED"
          ? "BLOCKED"
          : upper === "EXECUTING"
            ? "EXECUTING"
            : upper === "N/A" || upper === "NA"
              ? "N/A"
              : "TODO";
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

function buildCoverageHTML(
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

  <div class="footer">
    <span>Generated by QAlity Manual Reporting</span>
    <span>${esc(date)} at ${esc(time)}</span>
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function passRate(tests: XrayTestWithStatus[]): number | null {
  if (tests.length === 0) return null;
  const passed = tests.filter((t) => {
    const name = t.latest_status?.name ?? "TODO";
    return findSlice(name).key === "PASS";
  }).length;
  return passed / tests.length;
}

function hasFail(tests: XrayTestWithStatus[]): boolean {
  return tests.some((t) => {
    const name = t.latest_status?.name ?? "TODO";
    return findSlice(name).key === "FAIL";
  });
}

// ── Coverage history sparkline panel ─────────────────────────────────────────

interface CoverageHistoryPanelProps {
  history: CoverageSnapshot[];
  onClear: () => void;
}

function CoverageHistoryPanel({ history, onClear }: CoverageHistoryPanelProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (history.length === 0) return null;

  // ── Chart dimensions ────────────────────────────────────────────────────────
  const W = 560;
  const H = 140;
  const PAD_L = 32; // room for Y-axis labels
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 24; // room for X-axis labels

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xOf = (i: number) =>
    history.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (history.length - 1)) * innerW;

  const yOf = (pct: number) => PAD_T + innerH - (pct / 100) * innerH;

  const polylinePoints = (values: number[]) =>
    values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");

  const areaPoints = (values: number[]) => {
    const line = values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
    const baseline = `${xOf(values.length - 1)},${yOf(0)} ${xOf(0)},${yOf(0)}`;
    return `${line} ${baseline}`;
  };

  const coverageVals = history.map((s) => s.coveragePct);
  const passVals = history.map((s) =>
    s.total > 0 ? Math.round((s.passCount / s.total) * 100) : 0,
  );
  const failVals = history.map((s) =>
    s.total > 0 ? Math.round((s.failCount / s.total) * 100) : 0,
  );

  const hovered = hoveredIdx !== null ? history[hoveredIdx] : null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const formatDateTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // X-axis date labels: show first, last, and up to 3 evenly-spaced middle ones
  const labelIndices = (() => {
    if (history.length <= 2) return history.map((_, i) => i);
    const indices = new Set([0, history.length - 1]);
    const steps = Math.min(3, history.length - 2);
    for (let s = 1; s <= steps; s++) {
      indices.add(Math.round((s / (steps + 1)) * (history.length - 1)));
    }
    return [...indices].sort((a, b) => a - b);
  })();

  // Y-axis tick values
  const yTicks = [0, 25, 50, 75, 100];

  // Latest snapshot change indicators
  const latest = history[history.length - 1]!;
  const prev = history.length >= 2 ? history[history.length - 2]! : null;
  const covDelta = prev ? latest.coveragePct - prev.coveragePct : 0;
  const passDelta =
    prev && prev.total > 0 && latest.total > 0
      ? Math.round((latest.passCount / latest.total) * 100) -
        Math.round((prev.passCount / prev.total) * 100)
      : 0;

  const series = [
    { label: "Coverage", color: "#3b82f6", vals: coverageVals, delta: covDelta },
    { label: "Passed", color: "#10b981", vals: passVals, delta: passDelta },
    { label: "Failed", color: "#ef4444", vals: failVals, delta: 0 },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-900/30">
            <Activity className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Coverage trend
            </p>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {history.length} snapshot{history.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <button
          onClick={onClear}
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
          title="Clear history for this selection"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {history.length < 2 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-200 py-5 dark:border-slate-700">
          <Clock className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          <p className="text-xs text-slate-400">
            More snapshots will be recorded as you revisit this selection.
          </p>
        </div>
      ) : (
        <>
          {/* Legend + delta badges */}
          <div className="mb-3 flex items-center gap-4">
            {series.map(({ label, color, vals, delta }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  {label}
                </span>
                <span className="tabular-nums text-[10px] font-semibold" style={{ color }}>
                  {vals[vals.length - 1]}%
                </span>
                {delta !== 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold tabular-nums",
                      delta > 0
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* SVG chart */}
          <div className="relative" onMouseLeave={() => setHoveredIdx(null)}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ height: H }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const mx = ((e.clientX - rect.left) / rect.width) * W;
                let best = 0;
                let bestDist = Infinity;
                history.forEach((_, i) => {
                  const d = Math.abs(xOf(i) - mx);
                  if (d < bestDist) {
                    bestDist = d;
                    best = i;
                  }
                });
                setHoveredIdx(best);
              }}
            >
              {/* Y-axis gridlines and labels */}
              {yTicks.map((pct) => (
                <g key={pct}>
                  <line
                    x1={PAD_L}
                    y1={yOf(pct)}
                    x2={W - PAD_R}
                    y2={yOf(pct)}
                    stroke="currentColor"
                    strokeWidth="0.5"
                    className="text-slate-200 dark:text-slate-700"
                    strokeDasharray={pct === 0 ? "none" : "3,3"}
                  />
                  <text
                    x={PAD_L - 6}
                    y={yOf(pct) + 3}
                    textAnchor="end"
                    fontSize="8"
                    className="fill-slate-400 dark:fill-slate-500"
                  >
                    {pct}%
                  </text>
                </g>
              ))}

              {/* Area fills */}
              <polygon points={areaPoints(coverageVals)} fill="#3b82f6" fillOpacity={0.06} />
              <polygon points={areaPoints(passVals)} fill="#10b981" fillOpacity={0.06} />

              {/* Lines */}
              {series.map(({ color, vals }) => (
                <polyline
                  key={color}
                  points={polylinePoints(vals)}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}

              {/* Data point markers (small circles on each data point) */}
              {history.length <= 20 &&
                series.map(({ color, vals }) =>
                  vals.map((v, i) => (
                    <circle
                      key={`${color}-${i}`}
                      cx={xOf(i)}
                      cy={yOf(v)}
                      r={history.length <= 8 ? 2.5 : 1.5}
                      fill={hoveredIdx === i ? color : "white"}
                      stroke={color}
                      strokeWidth={hoveredIdx === i ? 2 : 1}
                    />
                  )),
                )}

              {/* Hovered vertical line */}
              {hoveredIdx !== null && (
                <line
                  x1={xOf(hoveredIdx)}
                  y1={PAD_T}
                  x2={xOf(hoveredIdx)}
                  y2={PAD_T + innerH}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-slate-300 dark:text-slate-500"
                  strokeDasharray="3,2"
                />
              )}

              {/* Hovered dots (larger) */}
              {hoveredIdx !== null &&
                series.map(({ vals, color }) => (
                  <circle
                    key={color}
                    cx={xOf(hoveredIdx)}
                    cy={yOf(vals[hoveredIdx]!)}
                    r={4}
                    fill={color}
                    stroke="white"
                    strokeWidth="2"
                  />
                ))}

              {/* X-axis date labels */}
              {labelIndices.map((i) => (
                <text
                  key={i}
                  x={xOf(i)}
                  y={H - 4}
                  textAnchor={i === 0 ? "start" : i === history.length - 1 ? "end" : "middle"}
                  fontSize="8"
                  className="fill-slate-400 dark:fill-slate-500"
                >
                  {formatDate(history[i]!.timestamp)}
                </text>
              ))}
            </svg>

            {/* Tooltip */}
            {hovered && hoveredIdx !== null && (
              <div
                className="pointer-events-none absolute z-10 min-w-[140px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/95"
                style={{
                  top: 4,
                  left:
                    hoveredIdx < history.length / 2
                      ? `calc(${(xOf(hoveredIdx) / W) * 100}% + 12px)`
                      : undefined,
                  right:
                    hoveredIdx >= history.length / 2
                      ? `calc(${((W - xOf(hoveredIdx)) / W) * 100}% + 12px)`
                      : undefined,
                }}
              >
                <p className="mb-2 border-b border-slate-100 pb-1.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700">
                  {formatDateTime(hovered.timestamp)}
                </p>
                <div className="space-y-1">
                  {[
                    {
                      label: "Coverage",
                      value: `${hovered.coveragePct}%`,
                      color: "#3b82f6",
                    },
                    {
                      label: "Passed",
                      value: `${hovered.total > 0 ? Math.round((hovered.passCount / hovered.total) * 100) : 0}%`,
                      color: "#10b981",
                    },
                    {
                      label: "Failed",
                      value: `${hovered.total > 0 ? Math.round((hovered.failCount / hovered.total) * 100) : 0}%`,
                      color: "#ef4444",
                    },
                    {
                      label: "Not yet run",
                      value: `${hovered.todoCount} / ${hovered.total}`,
                      color: "#94a3b8",
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-2 text-[11px]">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-slate-500 dark:text-slate-400">{label}</span>
                      <span className="ml-auto tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Overall dashboard card ────────────────────────────────────────────────────

interface OverallDashboardProps {
  allTests: XrayTestWithStatus[];
  selectedCount: number;
  queryBySetId: Map<
    string,
    { tests: XrayTestWithStatus[] | undefined; isLoading: boolean; isError: boolean }
  >;
  history: CoverageSnapshot[];
  onClearHistory: () => void;
}

function OverallDashboard({
  allTests,
  selectedCount,
  queryBySetId,
  history,
  onClearHistory,
}: OverallDashboardProps) {
  const slices = useMemo(() => buildSlicesFromTests(allTests), [allTests]);
  const total = allTests.length;

  // Derived metrics
  const passedSlice = slices.find((s) => s.key === "PASS");
  const failedSlice = slices.find((s) => s.key === "FAIL");
  const overallPassRate = total > 0 && passedSlice ? passedSlice.pct : null;

  const setsWithFailures = useMemo(() => {
    let count = 0;
    for (const { tests } of queryBySetId.values()) {
      if (tests && hasFail(tests)) count++;
    }
    return count;
  }, [queryBySetId]);

  const setsFullyPassing = useMemo(() => {
    let count = 0;
    for (const { tests } of queryBySetId.values()) {
      if (tests && tests.length > 0 && passRate(tests) === 1) count++;
    }
    return count;
  }, [queryBySetId]);

  // "Not run" = status absent or not a final status (is_final !== true).
  // Using is_final is more robust than name-matching custom Xray statuses.
  const neverRunCount = useMemo(
    () => allTests.filter((t) => t.latest_status?.is_final !== true).length,
    [allTests],
  );

  const runAtLeastOnce = total - neverRunCount;
  const coveragePct = total > 0 ? Math.round((runAtLeastOnce / total) * 100) : 0;

  const healthLabel =
    total === 0
      ? "No data"
      : overallPassRate === 1
        ? "All passing"
        : overallPassRate !== null
          ? `${Math.round(overallPassRate * 100)}% passing`
          : "—";

  const healthColor =
    total === 0
      ? "text-slate-400 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-600"
      : overallPassRate === 1
        ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/40 dark:border-emerald-800"
        : overallPassRate !== null && overallPassRate >= 0.8
          ? "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/40 dark:border-blue-800"
          : failedSlice && failedSlice.count > 0
            ? "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/40 dark:border-red-800"
            : "text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-600";

  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Overall coverage
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100">
            {selectedCount} set{selectedCount !== 1 ? "s" : ""} selected
          </h2>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
            healthColor,
          )}
        >
          {healthLabel}
        </span>
      </div>

      <div className="space-y-5">
        {total > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-5">
              <DonutChart slices={slices} total={total} label="tests" />
              <div
                className="grid flex-1 gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(slices.length, 3)}, minmax(0, 1fr))`,
                  minWidth: 220,
                }}
              >
                {slices.map((sl) => (
                  <StatCard key={sl.key} sl={sl} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">Status distribution</p>
              <StackedBar slices={slices} />
            </div>
          </>
        )}

        {/* ── Smarter metrics grid ── */}
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-700 sm:grid-cols-4">
          <MetricTile
            label="Test sets"
            value={String(selectedCount)}
            sub="selected"
            color="slate"
          />
          <MetricTile
            label="Total tests"
            value={String(total)}
            sub="across all sets"
            color="slate"
          />
          <MetricTile
            label="Sets with failures"
            value={String(setsWithFailures)}
            sub={`of ${selectedCount} set${selectedCount !== 1 ? "s" : ""}`}
            color={setsWithFailures > 0 ? "red" : "slate"}
          />
          <MetricTile
            label="Sets fully passing"
            value={String(setsFullyPassing)}
            sub={`of ${selectedCount} set${selectedCount !== 1 ? "s" : ""}`}
            color={setsFullyPassing === selectedCount && selectedCount > 0 ? "emerald" : "slate"}
          />
        </div>

        {/* ── Coverage completeness (trend/history) ── */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Coverage completeness
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <CoverageTile
              label="Run at least once"
              value={runAtLeastOnce}
              total={total}
              color="emerald"
            />
            <CoverageTile
              label="Not yet run"
              value={neverRunCount}
              total={total}
              color={neverRunCount > 0 ? "amber" : "slate"}
            />
            <CoverageTile
              label="Currently failing"
              value={failedSlice?.count ?? 0}
              total={total}
              color={(failedSlice?.count ?? 0) > 0 ? "red" : "slate"}
            />
          </div>
          {/* Coverage progress bar */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>Coverage</span>
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {coveragePct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  coveragePct === 100
                    ? "bg-emerald-500"
                    : coveragePct >= 80
                      ? "bg-blue-500"
                      : coveragePct >= 50
                        ? "bg-amber-400"
                        : "bg-slate-400",
                )}
                style={{ width: `${coveragePct}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Coverage history sparkline ── */}
        <CoverageHistoryPanel history={history} onClear={onClearHistory} />
      </div>
    </div>
  );
}

// ── Small metric tile used in OverallDashboard grid ───────────────────────────

type TileColor = "slate" | "red" | "emerald" | "amber" | "blue";

const tileColors: Record<TileColor, { value: string; sub: string; bg: string; border: string }> = {
  slate: {
    value: "text-slate-700 dark:text-slate-200",
    sub: "text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-800/40",
    border: "border-slate-200 dark:border-slate-700",
  },
  red: {
    value: "text-red-600 dark:text-red-400",
    sub: "text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
  },
  emerald: {
    value: "text-emerald-600 dark:text-emerald-400",
    sub: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  amber: {
    value: "text-amber-600 dark:text-amber-400",
    sub: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
  },
  blue: {
    value: "text-blue-600 dark:text-blue-400",
    sub: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
  },
};

function MetricTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: TileColor;
}) {
  const c = tileColors[color];
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", c.bg, c.border)}>
      <p className="mb-1 text-[10px] font-medium text-slate-400">{label}</p>
      <p className={cn("text-xl font-bold leading-none", c.value)}>{value}</p>
      <p className={cn("mt-1 text-[10px]", c.sub)}>{sub}</p>
    </div>
  );
}

function CoverageTile({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: TileColor;
}) {
  const c = tileColors[color];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={cn("rounded-lg border px-3 py-2", c.bg, c.border)}>
      <p className="mb-0.5 text-[10px] text-slate-400">{label}</p>
      <p className={cn("text-lg font-bold leading-none", c.value)}>{value}</p>
      <p className={cn("mt-0.5 text-[10px]", c.sub)}>{pct}%</p>
    </div>
  );
}

// ── Sort icon helper ──────────────────────────────────────────────────────────

type SortBy = "key" | "name" | "status";
type SortDir = "asc" | "desc";

interface SortIconProps {
  col: SortBy;
  sortBy: SortBy;
  sortDir: SortDir;
}

function SortIcon({ col, sortBy, sortDir }: SortIconProps) {
  if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 text-slate-300" />;
  return sortDir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-slate-500" />
  ) : (
    <ArrowDown className="h-3 w-3 text-slate-500" />
  );
}

// ── Single test set section ───────────────────────────────────────────────────

interface TestSetSectionProps {
  testSet: XrayTestSet;
  tests: XrayTestWithStatus[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  testSearch: string;
  statusFilter: string | null;
  expandSignal: number;
  collapseSignal: number;
}

const TestSetSection = memo(function TestSetSection({
  testSet,
  tests,
  isLoading,
  isError,
  error,
  onRetry,
  testSearch,
  statusFilter,
  expandSignal,
  collapseSignal,
}: TestSetSectionProps) {
  const [collapsed, setCollapsed] = useState(true);
  const lastExpandSignal = useRef(0);
  const lastCollapseSignal = useRef(0);
  useEffect(() => {
    if (expandSignal !== lastExpandSignal.current) {
      lastExpandSignal.current = expandSignal;
      setCollapsed(false);
    }
  }, [expandSignal]);
  useEffect(() => {
    if (collapseSignal !== lastCollapseSignal.current) {
      lastCollapseSignal.current = collapseSignal;
      setCollapsed(true);
    }
  }, [collapseSignal]);
  const [sortBy, setSortBy] = useState<SortBy>("key");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rateLimitUntil = isError ? parseRateLimitError(error) : null;
  const errorMessage = isError ? (error instanceof Error ? error.message : String(error)) : null;

  const slices = useMemo(() => buildSlicesFromTests(tests ?? []), [tests]);

  const rate = tests ? passRate(tests) : null;
  const rateLabel = rate === null ? null : `${Math.round(rate * 100)}%`;
  const rateColor =
    rate === null
      ? ""
      : rate === 1
        ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/40 dark:border-emerald-800"
        : rate >= 0.8
          ? "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/40 dark:border-blue-800"
          : hasFail(tests ?? [])
            ? "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/40 dark:border-red-800"
            : "text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-600";

  // Coverage = tests that have been run at least once.
  // A test is "not yet run" when its status is absent or not a final status.
  // Using is_final is more robust than name-matching, as it handles custom Xray status names.
  const notRunCount = tests ? tests.filter((t) => t.latest_status?.is_final !== true).length : null;
  const covPct =
    tests && tests.length > 0
      ? Math.round(((tests.length - (notRunCount ?? 0)) / tests.length) * 100)
      : null;
  const covLabel = covPct !== null ? `${covPct}% run` : null;
  const covColor =
    covPct === null
      ? ""
      : covPct === 100
        ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/40 dark:border-emerald-800"
        : covPct >= 80
          ? "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/40 dark:border-blue-800"
          : covPct >= 40
            ? "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/40 dark:border-amber-800"
            : "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/40 dark:border-red-800";

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!tests) return [];
    let result = tests;

    // Text search
    const q = testSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) => t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((t) => {
        const name = t.latest_status?.name ?? "TODO";
        return findSlice(name).key === statusFilter;
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "key") {
        cmp = a.jira.key.localeCompare(b.jira.key, undefined, { numeric: true });
      } else if (sortBy === "name") {
        cmp = a.jira.summary.localeCompare(b.jira.summary);
      } else {
        // status: sort by palette order
        const aKey = findSlice(a.latest_status?.name ?? "TODO").key;
        const bKey = findSlice(b.latest_status?.name ?? "TODO").key;
        cmp = aKey.localeCompare(bKey);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [tests, testSearch, statusFilter, sortBy, sortDir]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Section header */}
      <button
        className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 dark:bg-slate-700/50 dark:hover:bg-slate-700"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <Layers className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="w-24 shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">
          {testSet.jira.key}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
          {testSet.jira.summary}
        </span>

        {/* Right-side summary — only show when data is loaded */}
        {isLoading && <Spinner size="sm" />}
        {!isLoading && !isError && tests && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Stacked colour bar */}
            {slices.length > 0 && <MiniStackedBar slices={slices} className="w-28" />}

            {/* Test count */}
            <span className="w-14 text-right text-xs text-slate-400">
              {tests.length} test{tests.length !== 1 ? "s" : ""}
            </span>

            {/* Coverage pill */}
            {covLabel && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  covColor,
                )}
              >
                {covLabel}
              </span>
            )}

            {/* Pass-rate pill */}
            {rateLabel && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  rateColor,
                )}
              >
                {rateLabel} pass
              </span>
            )}
          </div>
        )}
      </button>

      {/* Dashboard + test rows */}
      {!collapsed && (
        <div>
          {/* Per-set dashboard strip */}
          {!isLoading && !isError && tests && tests.length > 0 && (
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-5">
                <DonutChart slices={slices} total={tests.length} label="tests" />
                <div className="flex-1 space-y-3" style={{ minWidth: 200 }}>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(slices.length, 3)}, minmax(0, 1fr))`,
                    }}
                  >
                    {slices.map((sl) => (
                      <StatCard key={sl.key} sl={sl} />
                    ))}
                  </div>
                  <StackedBar slices={slices} />
                  {/* Coverage completeness row */}
                  {notRunCount !== null && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-500 dark:text-slate-400">
                          Coverage
                        </span>
                        <span
                          className={cn(
                            "font-semibold",
                            covPct === 100
                              ? "text-emerald-600 dark:text-emerald-400"
                              : notRunCount > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-slate-500 dark:text-slate-400",
                          )}
                        >
                          {tests.length - notRunCount} / {tests.length} run ({covPct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            covPct === 100
                              ? "bg-emerald-500"
                              : notRunCount > 0
                                ? "bg-amber-400"
                                : "bg-slate-400",
                          )}
                          style={{ width: `${covPct}%` }}
                        />
                      </div>
                      {notRunCount > 0 && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                          {notRunCount} test{notRunCount !== 1 ? "s" : ""} not yet run
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sort controls */}
          {!isLoading && !isError && tests && tests.length > 0 && (
            <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/50 px-4 py-1.5 dark:border-slate-700 dark:bg-slate-700/20">
              <span className="mr-1 text-[10px] text-slate-400">Sort:</span>
              {(["key", "name", "status"] as SortBy[]).map((col) => (
                <button
                  key={col}
                  onClick={() => handleSort(col)}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                    sortBy === col
                      ? "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700",
                  )}
                >
                  {col.charAt(0).toUpperCase() + col.slice(1)}
                  <SortIcon col={col} sortBy={sortBy} sortDir={sortDir} />
                </button>
              ))}
              {statusFilter && (
                <span className="ml-2 text-[10px] italic text-slate-400">Filtered by status</span>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
                <Spinner size="sm" />
                Loading tests…
              </div>
            )}
            {isError && (
              <div className="flex items-start gap-2 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {rateLimitUntil !== null ? (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="flex-1">
                  {rateLimitUntil !== null ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      Rate limited — please wait before retrying.
                    </span>
                  ) : (
                    <span>{errorMessage ?? "Failed to load tests for this set."}</span>
                  )}
                </div>
                <button
                  className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                  onClick={onRetry}
                >
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <p className="px-4 py-3 text-sm italic text-slate-400">
                {testSearch.trim() || statusFilter
                  ? "No tests match the current filter."
                  : "This test set has no tests."}
              </p>
            )}
            {!isLoading &&
              !isError &&
              filtered.map((test) => (
                <div
                  key={test.issue_id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <span className="w-28 shrink-0 font-mono text-xs text-slate-400">
                    {test.jira.key}
                  </span>
                  <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                    {test.jira.summary}
                  </span>
                  <StatusBadge
                    name={test.latest_status?.name ?? "NOT RUN"}
                    {...(test.latest_status?.color !== undefined
                      ? { color: test.latest_status.color }
                      : {})}
                  />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
});

// ── Status badge ──────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  name: string;
  color?: string;
}

function StatusBadge({ name, color }: StatusBadgeProps) {
  const sl = findSlice(name);
  if (color && color.startsWith("#")) {
    return (
      <span
        className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: color + "26", color }}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block rounded px-2 py-0.5 text-xs font-semibold",
        sl.lightBg,
        sl.textClass,
      )}
    >
      {name}
    </span>
  );
}

// ── Status filter chips ───────────────────────────────────────────────────────

interface StatusFilterChipsProps {
  slices: Slice[];
  activeFilter: string | null;
  onToggle: (key: string) => void;
}

function StatusFilterChips({ slices, activeFilter, onToggle }: StatusFilterChipsProps) {
  if (slices.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium text-slate-400">Filter:</span>
      {slices.map((sl) => {
        const isActive = activeFilter === sl.key;
        return (
          <button
            key={sl.key}
            onClick={() => onToggle(sl.key)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
              isActive
                ? "border-transparent text-white"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-700",
            )}
            style={isActive ? { backgroundColor: sl.color, borderColor: sl.color } : {}}
            title={`Show only ${sl.label} tests (${sl.count})`}
          >
            {isActive && <XCircle className="h-3 w-3 opacity-80" />}
            {sl.label}
            <span
              className={cn(
                "ml-0.5 rounded-full px-1 text-[10px]",
                isActive ? "bg-white/20" : "bg-slate-100 dark:bg-slate-700",
              )}
            >
              {sl.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Presets bar ───────────────────────────────────────────────────────────────

interface PresetsBarProps {
  selectedSetIds: Set<string>;
  onLoad: (preset: CoveragePreset) => void;
  activePresetId: string | null;
  isModified: boolean;
  onSave: (name: string) => void;
  onUpdate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function PresetsBar({
  selectedSetIds,
  onLoad,
  activePresetId,
  isModified,
  onSave,
  onUpdate,
  onDelete,
  onRename,
}: PresetsBarProps) {
  const presets = useCoveragePresetsStore((s) => s.presets);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the save-name input when it appears.
  useEffect(() => {
    if (saving) nameInputRef.current?.focus();
  }, [saving]);

  // Focus the rename input when it appears.
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const handleSaveConfirm = () => {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName("");
    setSaving(false);
  };

  const handleRenameConfirm = (id: string) => {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
    setRenameValue("");
  };

  const startRename = (preset: CoveragePreset) => {
    setRenamingId(preset.id);
    setRenameValue(preset.name);
    setSaving(false);
  };

  const canSave = selectedSetIds.size > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookmarkCheck className="h-3.5 w-3.5 text-slate-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Presets</p>
        </div>

        {/* Save / Update buttons */}
        <div className="flex items-center gap-1.5">
          {activePresetId && isModified && (
            <button
              onClick={onUpdate}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/40"
              title="Update current preset with the current selection"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              Update
            </button>
          )}
          {canSave && !saving && (
            <button
              onClick={() => {
                setSaving(true);
                setRenamingId(null);
              }}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
              title="Save current selection as a new preset"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save
            </button>
          )}
        </div>
      </div>

      {/* Inline name input for new preset */}
      {saving && (
        <div className="flex items-center gap-1.5">
          <Input
            ref={nameInputRef}
            className="h-7 flex-1 text-xs"
            placeholder="Preset name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveConfirm();
              if (e.key === "Escape") {
                setSaving(false);
                setNewName("");
              }
            }}
          />
          <button
            onClick={handleSaveConfirm}
            disabled={!newName.trim()}
            className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => {
              setSaving(false);
              setNewName("");
            }}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Preset chips */}
      {presets.length === 0 && !saving && (
        <p className="text-xs italic text-slate-400 dark:text-slate-500">
          {canSave ? 'Click "Save" to create your first preset.' : "No presets yet."}
        </p>
      )}

      {presets.length > 0 && (
        <div className="space-y-1">
          {presets.map((preset) => {
            const isActive = preset.id === activePresetId;

            if (renamingId === preset.id) {
              return (
                <div key={preset.id} className="flex items-center gap-1.5">
                  <Input
                    ref={renameInputRef}
                    className="h-7 flex-1 text-xs"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameConfirm(preset.id);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                  />
                  <button
                    onClick={() => handleRenameConfirm(preset.id)}
                    disabled={!renameValue.trim()}
                    className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => {
                      setRenamingId(null);
                      setRenameValue("");
                    }}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>
              );
            }

            return (
              <div key={preset.id} className="group flex items-center gap-1">
                <button
                  onClick={() => onLoad(preset)}
                  className={cn(
                    "flex flex-1 items-center gap-1.5 truncate rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                    isActive && !isModified
                      ? "border-slate-700 bg-slate-700 font-semibold text-white"
                      : isActive && isModified
                        ? "border-amber-400 bg-amber-50 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                  )}
                  title={`${preset.setIds.length} set${preset.setIds.length !== 1 ? "s" : ""}`}
                >
                  <span className="truncate">{preset.name}</span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      isActive && !isModified
                        ? "bg-white/20 text-white"
                        : isActive && isModified
                          ? "bg-amber-200 text-amber-700 dark:bg-amber-800 dark:text-amber-300"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400",
                    )}
                  >
                    {preset.setIds.length}
                  </span>
                  {isActive && isModified && (
                    <span className="shrink-0 text-[10px] font-normal text-amber-600">
                      modified
                    </span>
                  )}
                </button>

                {/* Action icons (shown on hover) */}
                <button
                  onClick={() => startRename(preset)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100 dark:hover:bg-slate-700 dark:text-slate-400"
                  title="Rename preset"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDelete(preset.id)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30 dark:text-slate-400"
                  title="Delete preset"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CoveragePage() {
  const projectKey = useContentProjectKey();
  const queryClient = useQueryClient();
  const { savePreset, updatePreset, deletePreset, renamePreset } = useCoveragePresetsStore();
  const {
    data: testSets,
    isLoading: setsLoading,
    isError: setsError,
    refetch: refetchSets,
    isFetching: setsFetching,
  } = useGetTestSets(projectKey ?? undefined);

  const [setSearch, setSetSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [loadedPresetSetIds, setLoadedPresetSetIds] = useState<string[]>([]);
  const [expandSignal, setExpandSignal] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);

  // Dirty detection: preset is "modified" when selection drifts from what was loaded.
  const isModified = useMemo(() => {
    if (!activePresetId) return false;
    const current = [...selectedSetIds].sort().join(",");
    const original = [...loadedPresetSetIds].sort().join(",");
    return current !== original;
  }, [activePresetId, selectedSetIds, loadedPresetSetIds]);

  // Filtered list of test sets for the selector panel.
  const filteredSets = useMemo(() => {
    const q = setSearch.trim().toLowerCase();
    return (testSets ?? []).filter(
      (ts) =>
        !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
    );
  }, [testSets, setSearch]);

  // The ordered list of selected test set objects (preserving display order).
  const selectedSets = useMemo(
    () => (testSets ?? []).filter((ts) => selectedSetIds.has(ts.issue_id)),
    [testSets, selectedSetIds],
  );

  // Fetch tests-with-status for every selected set, windowed to avoid 429s.
  const MAX_CONCURRENT_COVERAGE = 4;
  const coverageSettledRef = useRef(0);

  const testQueries = useQueries({
    queries: selectedSets.map((ts, i) => ({
      queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
      queryFn: () => api.getTestSetTestsWithStatus(ts.issue_id),
      enabled: i < coverageSettledRef.current + MAX_CONCURRENT_COVERAGE,
      staleTime: 2 * 60 * 1_000,
      gcTime: Infinity,
    })),
  });

  // Advance the concurrency window as queries settle.
  coverageSettledRef.current = testQueries.filter((q) => q.isSuccess || q.isError).length;

  const queryBySetId = useMemo(() => {
    const map = new Map<
      string,
      {
        tests: XrayTestWithStatus[] | undefined;
        isLoading: boolean;
        isError: boolean;
        error: unknown;
      }
    >();
    selectedSets.forEach((ts, i) => {
      const q = testQueries[i];
      map.set(ts.issue_id, {
        tests: q?.data,
        isLoading: q?.isLoading ?? false,
        isError: q?.isError ?? false,
        error: q?.error,
      });
    });
    return map;
  }, [selectedSets, testQueries]);

  // Grand total across all loaded sets.
  const allTests = useMemo(
    () => [...queryBySetId.values()].flatMap((q) => q.tests ?? []),
    [queryBySetId],
  );

  // Slices for the status filter chips (derived from all loaded tests).
  const allSlices = useMemo(() => buildSlicesFromTests(allTests), [allTests]);

  // ── Coverage history ─────────────────────────────────────────────────────────
  const recordSnapshot = useCoverageHistoryStore((s) => s.recordSnapshot);
  const clearHistory = useCoverageHistoryStore((s) => s.clearHistory);
  const historyByView = useCoverageHistoryStore((s) => s.history);

  // Stable view key for the current project + set selection.
  const viewKey = useMemo(
    () =>
      projectKey && selectedSetIds.size > 0 ? buildViewKey(projectKey, [...selectedSetIds]) : null,
    [projectKey, selectedSetIds],
  );

  // All queries are "settled" when none are still loading/fetching.
  const allQueriesSettled = useMemo(
    () =>
      testQueries.length > 0 &&
      testQueries.every((q) => !q.isLoading && !q.isFetching && !q.isError),
    [testQueries],
  );

  // Auto-record a snapshot whenever the selection settles with fresh data.
  useEffect(() => {
    if (!viewKey || !allQueriesSettled || allTests.length === 0) return;

    const passCount = allSlices.find((s) => s.key === "PASS")?.count ?? 0;
    const failCount = allSlices.find((s) => s.key === "FAIL")?.count ?? 0;
    const todoCount = allTests.filter((t) => t.latest_status?.is_final !== true).length;
    const runCount = allTests.length - todoCount;
    const coveragePct = allTests.length > 0 ? Math.round((runCount / allTests.length) * 100) : 0;

    recordSnapshot(viewKey, {
      total: allTests.length,
      runCount,
      passCount,
      failCount,
      todoCount,
      coveragePct,
    });
  }, [viewKey, allQueriesSettled, allTests, allSlices, recordSnapshot]);

  // Snapshots for the current view key, oldest-first.
  const currentHistory = useMemo(
    () => (viewKey ? (historyByView[viewKey] ?? []) : []),
    [viewKey, historyByView],
  );

  const handleToggleStatusFilter = (key: string) => {
    setStatusFilter((prev) => (prev === key ? null : key));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchSets();
    setIsRefreshing(false);
  };

  const handleExportPDF = async () => {
    if (selectedSets.length === 0) return;
    const path = await saveDialog({
      title: "Save coverage report",
      defaultPath: `coverage-${projectKey}-${new Date().toISOString().slice(0, 10)}.html`,
      filters: [{ name: "HTML Report", extensions: ["html"] }],
    });
    if (!path) return;
    setIsExporting(true);
    try {
      const html = buildCoverageHTML(selectedSets, queryBySetId, projectKey!);
      await api.writeTextFile(path, html);
      await openPath(path);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleSet = (id: string) => {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedSetIds(new Set(filteredSets.map((ts) => ts.issue_id)));
  const clearAll = () => setSelectedSetIds(new Set());

  // ── Preset handlers ──────────────────────────────────────────────────────────

  const handleLoadPreset = (preset: CoveragePreset) => {
    setSelectedSetIds(new Set(preset.setIds));
    setActivePresetId(preset.id);
    setLoadedPresetSetIds(preset.setIds);
  };

  const handleSavePreset = (name: string) => {
    const ids = [...selectedSetIds];
    const preset = savePreset(name, ids);
    setActivePresetId(preset.id);
    setLoadedPresetSetIds(ids);
  };

  const handleUpdatePreset = () => {
    if (!activePresetId) return;
    const ids = [...selectedSetIds];
    const existing = useCoveragePresetsStore
      .getState()
      .presets.find((p) => p.id === activePresetId);
    if (!existing) return;
    updatePreset(activePresetId, existing.name, ids);
    setLoadedPresetSetIds(ids);
  };

  const handleDeletePreset = (id: string) => {
    deletePreset(id);
    if (activePresetId === id) {
      setActivePresetId(null);
      setLoadedPresetSetIds([]);
    }
  };

  if (!projectKey) {
    return (
      <EmptyState icon={Activity} message="Set a Project Key in Settings to view test coverage." />
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* ── Left panel: presets + set selector ── */}
      <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {/* Presets section */}
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-700/60">
          <PresetsBar
            selectedSetIds={selectedSetIds}
            onLoad={handleLoadPreset}
            activePresetId={activePresetId}
            isModified={isModified}
            onSave={handleSavePreset}
            onUpdate={handleUpdatePreset}
            onDelete={handleDeletePreset}
            onRename={(id, name) => renamePreset(id, name)}
          />
        </div>

        {/* Test sets section */}
        <div className="flex min-h-0 flex-1 flex-col gap-0">
          {/* Section header */}
          <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 dark:bg-slate-800/50">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Test Sets
              </p>
              {(testSets?.length ?? 0) > 0 && (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  {testSets!.length}
                </span>
              )}
            </div>
            <button
              onClick={() => void handleRefresh()}
              disabled={setsFetching || isRefreshing}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
              title="Reload test sets"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", (setsFetching || isRefreshing) && "animate-spin")}
              />
            </button>
          </div>

          {/* Search + controls */}
          <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-700/60">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-8 text-xs"
                placeholder="Filter sets…"
                value={setSearch}
                onChange={(e) => setSetSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {selectedSetIds.size > 0 ? (
                  <>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {selectedSetIds.size}
                    </span>{" "}
                    / {filteredSets.length} selected
                  </>
                ) : (
                  <>
                    {filteredSets.length} set{filteredSets.length !== 1 ? "s" : ""}
                  </>
                )}
              </span>
              <div className="flex gap-1">
                <button
                  className="rounded-md px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  onClick={selectAll}
                >
                  All
                </button>
                {selectedSetIds.size > 0 && (
                  <button
                    className="rounded-md px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    onClick={clearAll}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {setsLoading && (
              <div className="space-y-2 px-1">
                <div className="flex items-center gap-2 py-1 text-sm text-slate-500">
                  <Spinner size="sm" />
                  <span>Loading…</span>
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-lg" />
                ))}
              </div>
            )}
            {setsError && (
              <div className="m-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                Failed to load test sets.{" "}
                <button className="underline dark:text-red-400" onClick={() => void refetchSets()}>
                  Retry
                </button>
              </div>
            )}
            {!setsLoading && !setsError && filteredSets.length === 0 && (
              <p className="py-4 text-center text-xs italic text-slate-400">
                {setSearch.trim()
                  ? "No test sets match the filter."
                  : `No test sets found in ${projectKey}.`}
              </p>
            )}
            <div className="space-y-0.5">
              {filteredSets.map((ts) => {
                const selected = selectedSetIds.has(ts.issue_id);
                return (
                  <button
                    key={ts.issue_id}
                    onClick={() => toggleSet(ts.issue_id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      selected
                        ? "bg-slate-800 text-white dark:bg-slate-700"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                    )}
                  >
                    <span className="shrink-0">
                      {selected ? (
                        <CheckSquare2 className="h-4 w-4 text-slate-300" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium leading-tight">
                        {ts.jira.summary}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] leading-tight text-slate-400">
                        {ts.jira.key}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: coverage dashboard ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-400" />
            <h1 className="text-xl font-semibold dark:text-slate-100">
              Coverage
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                {projectKey}
              </span>
            </h1>
          </div>
          {/* Status filter chips — shown when tests are loaded */}
          {allSlices.length > 0 && (
            <StatusFilterChips
              slices={allSlices}
              activeFilter={statusFilter}
              onToggle={handleToggleStatusFilter}
            />
          )}
          <div className="relative ml-auto w-48 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8 text-xs"
              placeholder="Filter tests…"
              value={testSearch}
              onChange={(e) => setTestSearch(e.target.value)}
            />
          </div>
          {selectedSets.length > 1 && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setExpandSignal((n) => n + 1)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title="Expand all test sets"
              >
                <ChevronsDown className="h-3.5 w-3.5" />
                Expand all
              </button>
              <button
                onClick={() => setCollapseSignal((n) => n + 1)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title="Collapse all test sets"
              >
                <ChevronsUp className="h-3.5 w-3.5" />
                Collapse all
              </button>
            </div>
          )}
          {/* PDF Export */}
          {selectedSets.length > 0 && (
            <button
              onClick={() => void handleExportPDF()}
              disabled={isExporting || !allQueriesSettled}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              title={
                !allQueriesSettled
                  ? "Wait for all tests to finish loading"
                  : "Export coverage report — opens in browser for printing to PDF"
              }
            >
              {isExporting ? (
                <Spinner size="sm" />
              ) : !allQueriesSettled ? (
                <Download className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              Export PDF
            </button>
          )}
        </div>

        {selectedSets.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <Layers className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select test sets on the left to view coverage.</p>
          </div>
        )}

        {selectedSets.length > 0 && (
          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            {/* Overall dashboard with smarter metrics + coverage completeness */}
            <OverallDashboard
              allTests={allTests}
              selectedCount={selectedSets.length}
              queryBySetId={queryBySetId}
              history={currentHistory}
              onClearHistory={() => {
                if (viewKey) clearHistory(viewKey);
              }}
            />

            {/* Per-set sections */}
            {selectedSets.map((ts) => {
              const q = queryBySetId.get(ts.issue_id);
              return (
                <TestSetSection
                  key={ts.issue_id}
                  testSet={ts}
                  tests={q?.tests}
                  isLoading={q?.isLoading ?? false}
                  isError={q?.isError ?? false}
                  error={q?.error}
                  onRetry={() =>
                    void queryClient.refetchQueries({
                      queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
                    })
                  }
                  testSearch={testSearch}
                  statusFilter={statusFilter}
                  expandSignal={expandSignal}
                  collapseSignal={collapseSignal}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
