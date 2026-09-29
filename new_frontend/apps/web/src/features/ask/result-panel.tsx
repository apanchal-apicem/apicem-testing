import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, Pencil } from "lucide-react";
import type { ChartType, QueryResult } from "@apicem/api-contract";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ChartRenderer } from "@/components/charts/chart-renderer";
import { QueryDataTable } from "@/components/charts/query-data-table";
import { ConfidenceBadge } from "@/components/charts/confidence-badge";
import { ChartTypeSwitcher } from "@/features/explorer/chart-type-switcher";
import { SaveToReportPopover } from "@/features/reports/save-to-report-popover";
import { SaveExplorationPopover } from "@/features/ask/save-exploration-popover";
import { CreateExperimentDialog } from "@/features/experiments/create-experiment-dialog";
import { Badge } from "@/components/ui/badge";
import { useMetrics } from "@/api/hooks";

export function ResultPanel({
  result,
  title,
  saveConfig,
  isQuestion = true,
  onEditQuestion,
  headerExtra,
  renderChart,
}: {
  result: QueryResult;
  title: string;
  saveConfig?: { source: "metric" | "preset"; key: string };
  /** False when `title` is a manually-built result's label (a metric/field name), not something actually asked — shows a "Built manually" tag instead of treating the label as a question. */
  isQuestion?: boolean;
  /** Only offered on a real question turn — lets the exact text that was asked be revised and rerun in place, rather than only ever appending a new follow-up turn below it. */
  onEditQuestion?: () => void;
  /** Extra controls rendered next to the chart-type switcher — Build tab's metric-filter chips, for a result with 2+ metrics. */
  headerExtra?: ReactNode;
  /** Overrides the Chart tab's content instead of the default `<ChartRenderer>` call, still inside the same Chart/Data/SQL tabs and Save/Add-to-report chrome — Build tab uses this to show a metric total or an explicit "add a dimension" placeholder instead of a fabricated trend when no dimension is selected. */
  renderChart?: (chartType: ChartType) => ReactNode;
}) {
  const navigate = useNavigate();
  const { data: metrics = [] } = useMetrics();
  const [chartType, setChartType] = useState<ChartType>(result.chartSuggestion);
  const [experimentDialogOpen, setExperimentDialogOpen] = useState(false);

  // Each new result (a new question, or a new manual-build config) comes with its own
  // recommended chart type — reset to it rather than keeping whatever the previous result's
  // selector was left on. The user can still override for this result after it lands.
  useEffect(() => {
    setChartType(result.chartSuggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Only a single-metric result (not a grouped/preset breakdown) maps onto
  // "one metric to measure lift on" the way an experiment needs — this is
  // the natural next step from Explore into Experiments, not a bolted-on
  // shortcut: if you just found something worth acting on, testing whether
  // it's actually causal is the next question, not a separate errand.
  const canDesignExperiment = saveConfig?.source === "metric";
  // The result's own `title` is sometimes a full question ("How has net
  // revenue trended...?"), which reads badly appended to "Holdout Test";
  // prefer the metric's actual name for anything the dialog pre-fills.
  const metricName = canDesignExperiment ? metrics.find((m) => m.id === saveConfig!.key)?.name : undefined;
  const experimentSubject = metricName ?? title;

  return (
    <div className="rounded-(--radius-lg) border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[14.5px] font-semibold text-ink">{title}</h3>
            <ConfidenceBadge confidence={result.confidence} />
            {!isQuestion && <Badge>Built manually</Badge>}
            {isQuestion && onEditQuestion && (
              <button
                onClick={onEditQuestion}
                aria-label="Edit question"
                className="shrink-0 rounded-(--radius-sm) p-1 text-ink-faint hover:bg-surface-2 hover:text-ink"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1 max-w-xl text-[13px] text-ink-soft">{result.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerExtra}
          <ChartTypeSwitcher value={chartType} onChange={setChartType} />
          {canDesignExperiment && (
            <Button variant="outline" size="sm" onClick={() => setExperimentDialogOpen(true)}>
              <FlaskConical className="size-3.5" />
              <span className="hidden sm:inline">Design an experiment</span>
            </Button>
          )}
          {saveConfig && (
            <SaveExplorationPopover
              title={title}
              source={saveConfig.source}
              fieldKey={saveConfig.key}
              question={isQuestion ? title : undefined}
            />
          )}
          {saveConfig && (
            <SaveToReportPopover title={title} source={saveConfig.source} fieldKey={saveConfig.key} chartType={chartType} />
          )}
        </div>
      </div>

      <div className="p-4">
        <Tabs defaultValue="chart">
          <TabsList className="mb-4">
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            {result.sql && <TabsTrigger value="sql">SQL</TabsTrigger>}
          </TabsList>
          <TabsContent value="chart">
            {renderChart ? renderChart(chartType) : <ChartRenderer result={result} chartType={chartType} height={300} />}
          </TabsContent>
          <TabsContent value="data">
            <QueryDataTable rows={result.rows} columns={result.columns} />
          </TabsContent>
          {result.sql && (
            <TabsContent value="sql">
              <pre className="scrollbar-thin overflow-x-auto rounded-(--radius-md) bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed text-ink-soft">
                {result.sql}
              </pre>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {canDesignExperiment && saveConfig && (
        <CreateExperimentDialog
          open={experimentDialogOpen}
          onOpenChange={setExperimentDialogOpen}
          onCreated={(id) => navigate(`/experiments/${id}`)}
          initialMetricId={saveConfig.key}
          initialName={`${experimentSubject} Holdout Test`}
          initialHypothesis={`A deliberate change here drives incremental ${experimentSubject.toLowerCase()} beyond what current trends already explain.`}
        />
      )}
    </div>
  );
}
