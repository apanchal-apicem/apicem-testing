import type { DashboardOut, DashboardWidget } from "../api/client";
import { TABLE_COLUMNS_CONFIG, TREND_SERIES_CONFIG } from "../dashboardWidgetConfig";

// Product/campaign names can contain commas -- quote any field with a comma, quote, or
// newline, doubling embedded quotes, same rule every spreadsheet app expects.
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(values: (string | number | null | undefined)[]): string {
  return values.map(csvEscape).join(",");
}

function trendSection(w: DashboardWidget): string[] {
  const seriesConfig = TREND_SERIES_CONFIG[w.metric] || [];
  const points = (w.series || []) as Record<string, any>[];
  const lines = [w.label, row(["Date", ...seriesConfig.map((s) => s.label)])];
  for (const point of points) {
    lines.push(row([point.date_key, ...seriesConfig.map((s) => point[s.key] ?? "")]));
  }
  return lines;
}

function tableSection(w: DashboardWidget): string[] {
  const columns = TABLE_COLUMNS_CONFIG[w.metric] || [];
  const lines = [w.label, row(columns.map((c) => c.label))];
  for (const r of w.rows || []) {
    lines.push(row(columns.map((c) => r[c.key])));
  }
  return lines;
}

/** One CSV for the whole dashboard, sectioned by widget (a blank line between sections) --
 * Excel/Sheets both open a multi-section CSV as a single sheet fine. Individual chart/table
 * cards also get their own single-widget export via widgetToCsv, for "just this one." */
export function dashboardToCsv(dashboard: DashboardOut, rangeLabel: string): string {
  const lines: string[] = [`${dashboard.title} - ${rangeLabel}`, ""];

  const kpiWidgets = dashboard.widgets.filter((w) => w.type === "kpi");
  if (kpiWidgets.length) {
    lines.push("Summary");
    lines.push(row(["Metric", "Value", "Previous period", "Change %"]));
    for (const w of kpiWidgets) {
      lines.push(
        row([
          w.label,
          w.value ?? "",
          w.previous_value ?? "",
          w.delta_pct != null ? (w.delta_pct * 100).toFixed(1) : "",
        ])
      );
    }
    lines.push("");
  }

  for (const w of dashboard.widgets.filter((x) => x.type === "trend")) {
    lines.push(...trendSection(w), "");
  }

  for (const w of dashboard.widgets.filter((x) => x.type === "table")) {
    lines.push(...tableSection(w), "");
  }

  return lines.join("\n");
}

/** One chart/table's own data only -- the per-card "download this" button, as opposed to
 * dashboardToCsv's "download everything on this page." */
export function widgetToCsv(widget: DashboardWidget, dashboardTitle: string, rangeLabel: string): string {
  const section = widget.type === "trend" ? trendSection(widget) : tableSection(widget);
  return [`${dashboardTitle} - ${widget.label} (${rangeLabel})`, "", ...section].join("\n");
}

export function downloadCsv(filename: string, content: string) {
  // A leading BOM makes Excel on Windows detect UTF-8 correctly (otherwise it guesses the
  // system codepage and mangles anything non-ASCII in a product/campaign name).
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
