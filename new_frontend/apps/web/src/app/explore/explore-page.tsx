import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResultPanel } from "@/features/ask/result-panel";
import { StarterQuestionsList } from "@/features/ask/starter-questions-list";
import { FieldChip, type FieldRef } from "@/features/explorer/field-chip";
import { STANDARD_DIMENSIONS } from "@/features/explorer/standard-dimensions";
import { MultiShelf } from "@/features/explorer/multi-shelf";
import { MetricFilterChips } from "@/features/explorer/metric-filter-chips";
import { PivotTableView } from "@/features/explorer/pivot-table-view";
import { Shelf, ShelfGroup } from "@/features/explorer/shelf";
import { ChartRenderer } from "@/components/charts/chart-renderer";
import { KpiTile } from "@/components/charts/kpi-tile";
import { filterResultToMetrics, valueColumns } from "@/components/charts/chart-types";
import { cn } from "@/lib/utils";
import {
  useBlockData,
  useMetrics,
  useRecordWorkbookViewOnce,
  useRunPivotQuery,
  useRunQuery,
  useStarterQuestions,
  useWorkbook,
} from "@/api/hooks";
import type { ChartType, Metric, PivotResult, QueryResult, Workbook } from "@apicem/api-contract";

/**
 * A result's `resolvedKey` is either one of this workspace's own metric ids
 * or a preset key — which of those it is decides how "Add to report"/
 * "Design an experiment" should re-resolve it later. Classifying by checking
 * membership in the already-fetched, workspace-scoped `metrics` list (rather
 * than reaching into mock internals, which no longer even has one flat
 * answer now that every workspace has its own metric catalog) keeps this
 * correct automatically for whichever workspace is active.
 */
function classifySaveConfig(result: QueryResult, metrics: Metric[]): { source: "metric" | "preset"; key: string } | undefined {
  if (!result.resolvedKey) return undefined;
  const source = metrics.some((m) => m.id === result.resolvedKey) ? "metric" : "preset";
  return { source, key: result.resolvedKey };
}

interface AskTurn {
  id: string;
  question: string;
  result: QueryResult;
  /** False for a turn seeded from a manually-built result (no real question was ever typed) — see ResultPanel's isQuestion prop. Turns created by actually asking are always true. */
  isQuestion?: boolean;
}

/**
 * A running thread, not a single-answer form: each question its own turn,
 * stacked below the ones before it, so a follow-up question doesn't throw
 * away the answer you were just looking at — the same expectation any chat
 * interface sets. `initialTurns` seeds the thread when reopening a saved
 * exploration, so a follow-up can continue it — built-manually or not.
 */
function AskTab({ initialTurns = [] }: { initialTurns?: AskTurn[] }) {
  const [searchParams] = useSearchParams();
  const [draft, setDraft] = useState(searchParams.get("q") ?? "");
  const [turns, setTurns] = useState<AskTurn[]>(initialTurns);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const { data: starterQuestions = [] } = useStarterQuestions();
  const { data: metrics = [] } = useMetrics();
  const runQuery = useRunQuery();
  const latestTurnRef = useRef<HTMLDivElement | null>(null);

  async function ask(q: string) {
    if (!q.trim() || runQuery.isPending) return;
    setDraft("");
    const res = await runQuery.mutateAsync({ question: q });
    setTurns((prev) => [
      ...prev,
      { id: `turn_${Math.random().toString(36).slice(2, 9)}`, question: q, result: res, isQuestion: true },
    ]);
  }

  // Revises the exact text a turn was asked with and re-resolves it in
  // place, rather than only ever letting a follow-up pile a new turn on
  // top — this is what lets a reopened exploration's original question
  // actually be edited, not just continued.
  async function saveEdit(turnId: string) {
    const q = editDraft.trim();
    if (!q || runQuery.isPending) return;
    const res = await runQuery.mutateAsync({ question: q });
    setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, question: q, result: res } : t)));
    setEditingTurnId(null);
  }

  useEffect(() => {
    const initial = searchParams.get("q");
    if (initial) ask(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the most recent answer in view as the thread grows, the same way
  // a chat scrolls to the newest message rather than leaving it below the fold.
  useEffect(() => {
    latestTurnRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [turns.length]);

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="flex items-center gap-3 rounded-(--radius-lg) border border-border bg-surface p-1.5 pl-4"
      >
        <Sparkles className="size-4 shrink-0 text-accent-ink" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={turns.length === 0 ? "Ask anything about your business…" : "Ask a follow-up…"}
          className="h-8 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={runQuery.isPending}
          className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-ink disabled:opacity-50"
        >
          <Search className="size-3.5" />
          Ask
        </button>
      </form>

      {turns.length === 0 && !runQuery.isPending && (
        <div className="rounded-(--radius-lg) border border-border bg-surface p-1">
          <p className="px-3 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Try asking</p>
          <StarterQuestionsList questions={starterQuestions} onSelect={ask} />
        </div>
      )}

      {/* aria-live announces each new turn as it arrives — a screen reader
          user asking a follow-up otherwise gets no signal that a new answer
          landed, since nothing here naturally takes focus. */}
      <div aria-live="polite" className="space-y-6">
        {turns.map((turn, i) => (
          <div key={turn.id} ref={i === turns.length - 1 ? latestTurnRef : undefined}>
            {editingTurnId === turn.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveEdit(turn.id);
                }}
                className="flex items-center gap-2 rounded-(--radius-lg) border border-accent bg-surface p-2 pl-4"
              >
                <input
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  ref={(el) => el?.focus()}
                  className="h-9 flex-1 bg-transparent text-[14px] text-ink outline-none"
                />
                <button
                  type="submit"
                  disabled={runQuery.isPending}
                  className="h-9 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-ink disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTurnId(null)}
                  className="h-9 rounded-full px-3 text-[13px] font-medium text-ink-soft hover:bg-surface-2"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <ResultPanel
                result={turn.result}
                title={turn.question}
                saveConfig={classifySaveConfig(turn.result, metrics)}
                isQuestion={turn.isQuestion ?? true}
                onEditQuestion={
                  (turn.isQuestion ?? true)
                    ? () => {
                        setEditingTurnId(turn.id);
                        setEditDraft(turn.question);
                      }
                    : undefined
                }
              />
            )}
          </div>
        ))}

        {runQuery.isPending && (
          <output className="block h-64 animate-pulse rounded-(--radius-lg) bg-surface-2">
            <span className="sr-only">Loading results…</span>
          </output>
        )}
      </div>
    </div>
  );
}

/**
 * `initialValueFields`/`initialGroupFields` seed the shelves when reopening
 * a saved exploration that was built manually — a fresh Explore visit omits
 * them and starts from empty shelves as before. Neither Value nor Group by
 * has a cap: the engine's own crossTabResult handles any number of
 * dimensions, and a chart with more series than theme.css's chart-color
 * tokens (--chart-1..6) just cycles colors rather than breaking — the Data
 * tab and this table view stay exact regardless of how many are selected.
 */
function BuildTab({
  initialValueFields = [],
  initialGroupFields = [],
}: {
  initialValueFields?: FieldRef[];
  initialGroupFields?: FieldRef[];
}) {
  const { data: metrics = [] } = useMetrics();
  const [valueFields, setValueFields] = useState<FieldRef[]>(initialValueFields);
  const [groupFields, setGroupFields] = useState<FieldRef[]>(initialGroupFields);
  const [filterField, setFilterField] = useState<FieldRef | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [metricFilter, setMetricFilter] = useState<string | "all">("all");
  const runQuery = useRunQuery();

  const metricFields: FieldRef[] = metrics.map((m) => ({ kind: "metric", id: m.id, label: m.name }));
  const noDimension = groupFields.length === 0;
  const valueFieldIds = valueFields.map((f) => f.id).join(",");

  useEffect(() => {
    // With no metric, even a single dimension would resolve to a real
    // result (see dimensionPresetKeys in mock/fixtures.ts) — but it's still
    // one specific metric (e.g. Channel's own preset happens to be CAC)
    // that the user never actually picked. Requiring a metric before
    // running anything, for any dimension count, means the only metric
    // ever shown is one the user chose.
    if (valueFields.length === 0) {
      setResult(null);
      return;
    }
    const filters =
      filterField && filterValue.trim() ? [{ column: filterField.id, operator: "eq" as const, value: filterValue.trim() }] : undefined;
    runQuery
      .mutateAsync({
        metricIds: valueFields.map((f) => f.id),
        dimensions: groupFields.length > 0 ? groupFields.map((f) => f.id) : undefined,
        filters,
      })
      .then(setResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueFields, groupFields, filterField, filterValue]);

  // A metric picked out of a previous selection (e.g. "Gross Margin" alone)
  // shouldn't silently stick around isolating a metric that's no longer on
  // the Value shelf, or that used to be the only one there.
  useEffect(() => {
    setMetricFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueFieldIds]);

  const activeMetricIds = metricFilter === "all" ? valueFields.map((f) => f.id) : [metricFilter];
  const activeMetricFields = valueFields.filter((f) => activeMetricIds.includes(f.id));
  const metricsById = new Map(metrics.map((m) => [m.id, m]));

  // A single selected metric's result keys its one value column "value",
  // not that metric's own id (see metricResult's doc comment in
  // mock/fixtures.ts) — only a 2+-metric result (multiMetricResult /
  // crossTabResult) keys each value column by the metric's real id.
  function columnKeyFor(field: FieldRef): string {
    return valueFields.length > 1 ? field.id : "value";
  }

  /**
   * Sums a metric's values across whatever rows the result has — its 12
   * weeks with no dimension chosen, or every dimension-broken-down row
   * otherwise. A percent-formatted metric (Gross Margin, Repeat Purchase
   * Rate) is averaged instead: summing 12 weekly percentages produces a
   * number with no meaning, where their average is still a real rate.
   */
  function totalFor(field: FieldRef): number {
    const values = (result?.rows ?? []).map((r) => {
      const v = r[columnKeyFor(field)];
      return typeof v === "number" ? v : 0;
    });
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return metricsById.get(field.id)?.format === "percent" ? sum / values.length : sum;
  }

  /**
   * With no dimension chosen, a metric's only underlying data is its own
   * 12-week history (see metricResult's doc comment in mock/fixtures.ts) —
   * useful as a KPI tile's total and sparkline, or a table's one summary
   * row, but not a real breakdown a line or bar chart can honestly plot.
   * Chartwise: Single value sums it into a total (one tile per active
   * metric, so "All" with 2+ metrics tiles them rather than picking one
   * arbitrarily); Table collapses to one Total row; Line/Bar show an
   * explicit prompt instead of a trend the user never asked to see.
   */
  function renderChart(chartType: ChartType) {
    if (!result) return null;

    if (chartType === "kpi") {
      return (
        <div className={cn("grid gap-3", activeMetricFields.length > 1 && "sm:grid-cols-2 lg:grid-cols-3")}>
          {activeMetricFields.map((field) => {
            const colKey = columnKeyFor(field);
            const metric = metricsById.get(field.id);
            const series = result.rows.map((r) => (typeof r[colKey] === "number" ? (r[colKey] as number) : 0));
            const value = noDimension ? totalFor(field) : (series[series.length - 1] ?? 0);
            return (
              <KpiTile key={field.id} label={field.label} value={value} format={metric?.format ?? "number"} series={series} />
            );
          })}
        </div>
      );
    }

    if (noDimension && (chartType === "line" || chartType === "bar")) {
      return (
        <div className="flex h-48 items-center justify-center rounded-(--radius-lg) border border-dashed border-border-strong text-[13px] text-ink-faint">
          Add a dimension to Group by to chart this — or switch to Single value to see the total.
        </div>
      );
    }

    if (noDimension && chartType === "table") {
      const xCol = result.columns[0];
      const totals: Record<string, string | number> = { [xCol?.key ?? "total"]: "Total" };
      const columns = [
        { key: xCol?.key ?? "total", label: xCol?.label ?? "", type: "string" as const },
        ...activeMetricFields.map((field) => {
          const metric = metricsById.get(field.id);
          totals[columnKeyFor(field)] = totalFor(field);
          const colType: "currency" | "number" = metric?.format === "currency" ? "currency" : "number";
          return { key: columnKeyFor(field), label: field.label, type: colType };
        }),
      ];
      return <ChartRenderer result={{ ...result, columns, rows: [totals] }} chartType={chartType} height={300} />;
    }

    const filtered = valueColumns(result.columns).length > 1 ? filterResultToMetrics(result, activeMetricIds) : result;
    return <ChartRenderer result={filtered} chartType={chartType} height={300} />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Metrics</p>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-2 scrollbar-thin">
            {metricFields.map((f) => (
              <FieldChip
                key={f.id}
                field={f}
                onSelect={(field) => setValueFields((prev) => (prev.some((v) => v.id === field.id) ? prev : [...prev, field]))}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Dimensions</p>
          <div className="space-y-1.5">
            {STANDARD_DIMENSIONS.map((f) => (
              <FieldChip
                key={f.id}
                field={f}
                onSelect={(field) => setGroupFields((prev) => (prev.some((v) => v.id === field.id) ? prev : [...prev, field]))}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-(--radius-lg) border border-border bg-surface p-4">
          <ShelfGroup>
            <MultiShelf
              label="Value"
              accepts="metric"
              fields={valueFields}
              onAdd={(field) => setValueFields((prev) => [...prev, field])}
              onRemove={(id) => setValueFields((prev) => prev.filter((f) => f.id !== id))}
              placeholder="Drag one or more metrics here"
            />
            <MultiShelf
              label="Group by"
              accepts="dimension"
              fields={groupFields}
              onAdd={(field) => setGroupFields((prev) => [...prev, field])}
              onRemove={(id) => setGroupFields((prev) => prev.filter((f) => f.id !== id))}
              placeholder="Drag dimensions here (optional)"
            />
            <div>
              <Shelf
                label="Filter"
                accepts="dimension"
                field={filterField}
                onDropField={setFilterField}
                onClear={() => {
                  setFilterField(null);
                  setFilterValue("");
                }}
                placeholder="Drag a dimension to filter"
              />
              {filterField && (
                <input
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder={`Value for ${filterField.label}…`}
                  aria-label={`Filter value for ${filterField.label}`}
                  className="mt-1.5 h-9 w-full rounded-(--radius-sm) border border-border-strong bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                />
              )}
            </div>
          </ShelfGroup>
        </div>

        {result && (
          <ResultPanel
            result={result}
            title={valueFields.map((f) => f.label).join(", ") || "Result"}
            saveConfig={classifySaveConfig(result, metrics)}
            isQuestion={false}
            headerExtra={<MetricFilterChips metrics={valueFields} value={metricFilter} onChange={setMetricFilter} />}
            renderChart={renderChart}
          />
        )}
        {!result && (
          <div className="flex h-48 items-center justify-center rounded-(--radius-lg) border border-dashed border-border-strong text-[13px] text-ink-faint">
            {valueFields.length === 0 && groupFields.length > 0
              ? `Pick a metric to see it broken down by ${groupFields.map((f) => f.label).join(", ")}`
              : "Drag a metric into Value to see results"}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A real pivot table: Rows, Columns, and Values are independent shelves
 * (unlike Build tab's single Group-by list, where dimension count alone
 * decides breakdown vs. cross-tab) — no cap on any of them. Clicking a
 * dimension chip adds it to Rows by default; dragging it onto Columns
 * pivots it into the header instead, the same click-defaults/drag-targets
 * split Build tab's own shelves already use.
 */
function PivotTab() {
  const { data: metrics = [] } = useMetrics();
  const [valueFields, setValueFields] = useState<FieldRef[]>([]);
  const [rowFields, setRowFields] = useState<FieldRef[]>([]);
  const [columnFields, setColumnFields] = useState<FieldRef[]>([]);
  const [result, setResult] = useState<PivotResult | null>(null);
  const runPivotQuery = useRunPivotQuery();

  const metricFields: FieldRef[] = metrics.map((m) => ({ kind: "metric", id: m.id, label: m.name }));

  useEffect(() => {
    // Unlike Build tab's single-dimension case, pivotResult's no-metric
    // fallback (the workspace's first metric) fires for any row/column
    // dimension count, not just 2+ — a pivot table's whole point is
    // showing metric values broken down by rows/columns, so requiring a
    // metric before running anything avoids ever silently picking one.
    if (valueFields.length === 0) {
      setResult(null);
      return;
    }
    runPivotQuery
      .mutateAsync({
        metricIds: valueFields.map((f) => f.id),
        rowDimensions: rowFields.map((f) => f.id),
        columnDimensions: columnFields.map((f) => f.id),
      })
      .then(setResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueFields, rowFields, columnFields]);

  function addUnique(setter: Dispatch<SetStateAction<FieldRef[]>>, field: FieldRef) {
    setter((prev) => (prev.some((f) => f.id === field.id) ? prev : [...prev, field]));
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Metrics</p>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-2 scrollbar-thin">
            {metricFields.map((f) => (
              <FieldChip key={f.id} field={f} onSelect={(field) => addUnique(setValueFields, field)} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Dimensions</p>
          <div className="space-y-1.5">
            {STANDARD_DIMENSIONS.map((f) => (
              <FieldChip key={f.id} field={f} onSelect={(field) => addUnique(setRowFields, field)} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-faint">Clicking adds to Rows — drag a dimension onto Columns to pivot it there instead.</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-(--radius-lg) border border-border bg-surface p-4">
          <ShelfGroup>
            <MultiShelf
              label="Values"
              accepts="metric"
              fields={valueFields}
              onAdd={(field) => addUnique(setValueFields, field)}
              onRemove={(id) => setValueFields((prev) => prev.filter((f) => f.id !== id))}
              placeholder="Drag one or more metrics here"
            />
            <MultiShelf
              label="Rows"
              accepts="dimension"
              fields={rowFields}
              onAdd={(field) => addUnique(setRowFields, field)}
              onRemove={(id) => setRowFields((prev) => prev.filter((f) => f.id !== id))}
              placeholder="Drag dimensions here to group rows"
            />
            <MultiShelf
              label="Columns"
              accepts="dimension"
              fields={columnFields}
              onAdd={(field) => addUnique(setColumnFields, field)}
              onRemove={(id) => setColumnFields((prev) => prev.filter((f) => f.id !== id))}
              placeholder="Drag dimensions here to pivot into columns"
            />
          </ShelfGroup>
        </div>

        {result && <PivotTableView result={result} />}
        {!result && (
          <div className="flex h-48 items-center justify-center rounded-(--radius-lg) border border-dashed border-border-strong text-[13px] text-ink-faint">
            {valueFields.length === 0 && (rowFields.length > 0 || columnFields.length > 0)
              ? "Pick a metric to see the pivot"
              : "Drag a metric, row, or column dimension to see the pivot"}
          </div>
        )}
      </div>
    </div>
  );
}

function ExploreTabs({
  defaultTab = "ask",
  initialTurns,
  initialValueFields,
  initialGroupFields,
}: {
  defaultTab?: "ask" | "build";
  initialTurns?: AskTurn[];
  initialValueFields?: FieldRef[];
  initialGroupFields?: FieldRef[];
}) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="mb-6">
        <TabsTrigger value="ask">Ask</TabsTrigger>
        <TabsTrigger value="build">Build manually</TabsTrigger>
        <TabsTrigger value="pivot">Pivot table</TabsTrigger>
      </TabsList>
      <TabsContent value="ask">
        <AskTab initialTurns={initialTurns} />
      </TabsContent>
      <TabsContent value="build">
        <BuildTab initialValueFields={initialValueFields} initialGroupFields={initialGroupFields} />
      </TabsContent>
      <TabsContent value="pivot">
        <PivotTab />
      </TabsContent>
    </Tabs>
  );
}

function fieldForMetric(id: string, metrics: Metric[]): FieldRef {
  return { kind: "metric", id, label: metrics.find((m) => m.id === id)?.name ?? id };
}

function fieldForDimension(id: string): FieldRef {
  return STANDARD_DIMENSIONS.find((d) => d.id === id) ?? { kind: "dimension", id, label: id };
}

/**
 * Reopening an exploration built manually should drop back into the Build
 * tab with the original metric(s)/dimension(s) still sitting on the
 * shelves, not just a read-only chat turn — this reverses the composite-key
 * encoding `resolveQuery` produces (see mock/fixtures.ts) back into the
 * FieldRef arrays Build tab's shelves expect. A single-metric result and
 * the new multi-metric/cross-tab keys are all self-describing and decode
 * cleanly; a *single*-dimension breakdown (e.g. "cac_channel") is an opaque
 * preset key with no way to recover which dimension produced it without the
 * mock engine's own internal mapping, so that one case is left undecoded —
 * the same limitation the edit-block popover's "Currently: <summary>" hint
 * already lives with for the same reason.
 */
function decodeBuildState(
  query: Workbook["query"],
  metrics: Metric[],
): { valueFields: FieldRef[]; groupFields: FieldRef[] } | undefined {
  if (!query) return undefined;
  if (query.source === "metric") return { valueFields: [fieldForMetric(query.key, metrics)], groupFields: [] };
  if (query.key.startsWith("multi:")) {
    return { valueFields: query.key.slice(6).split(",").map((id) => fieldForMetric(id, metrics)), groupFields: [] };
  }
  if (query.key.startsWith("bydim:")) {
    const [idsPart, dim] = query.key.slice(6).split(":");
    return { valueFields: idsPart.split(",").map((id) => fieldForMetric(id, metrics)), groupFields: [fieldForDimension(dim)] };
  }
  if (query.key.startsWith("crosstab:")) {
    const [idsPart, dimsPart] = query.key.slice(9).split(":");
    return { valueFields: idsPart.split(",").map((id) => fieldForMetric(id, metrics)), groupFields: dimsPart.split(",").map(fieldForDimension) };
  }
  return undefined;
}

/**
 * Reopens a saved exploration from the Home/Reports lists — a workbook
 * carries no editable state of its own (see Workbook.query's doc comment),
 * so this just re-resolves the same metric or preset its card represents,
 * through the exact path a report's chart block already uses. Reopening
 * offers both tabs, not just a static read-only panel: Ask seeds a real
 * thread whose question can be edited and rerun in place, and Build
 * manually seeds the original shelves (where decodable) so measures,
 * dimensions, and filters can be changed and rerun the same way a fresh
 * manual build works.
 */
export function ExplorePage() {
  const { workbookId } = useParams<{ workbookId: string }>();
  const { data: workbook, isLoading: workbookLoading } = useWorkbook(workbookId);
  const { data: result, isLoading: resultLoading } = useBlockData(workbook?.query?.source, workbook?.query?.key);
  const { data: metrics = [] } = useMetrics();
  // Only once workbook is confirmed to exist, same reasoning as the
  // identical call on the report view/builder pages.
  useRecordWorkbookViewOnce(workbook ? workbookId : undefined);

  if (workbookId && (workbookLoading || (workbook?.query && resultLoading))) {
    return (
      <div>
        <PageHeader eyebrow="Explore" title="Loading exploration…" />
        <output className="flex h-64 items-center justify-center gap-2 text-ink-faint">
          <Loader2 className="size-4 animate-spin" />
          <span className="sr-only">Loading exploration…</span>
        </output>
      </div>
    );
  }

  if (workbookId && workbook?.query && result) {
    const initialTurns: AskTurn[] = [
      {
        id: "reopened",
        question: workbook.query.question ?? workbook.name,
        result,
        isQuestion: Boolean(workbook.query.question),
      },
    ];
    const buildState = decodeBuildState(workbook.query, metrics);
    return (
      <div>
        <PageHeader eyebrow="Explore" title={workbook.name} />
        {/* Keyed on workbookId: reopening a different exploration without a
            full page reload (e.g. Home -> another card) must reset the
            thread and shelves rather than keep showing the previous one's
            state. Always lands on Ask (continuing the conversation is the
            more common next step either way); Build manually is still
            right there, pre-seeded, for editing the underlying measures,
            dimensions, and filters of a manually-built exploration. */}
        <ExploreTabs
          key={workbookId}
          initialTurns={initialTurns}
          initialValueFields={buildState?.valueFields}
          initialGroupFields={buildState?.groupFields}
        />
      </div>
    );
  }

  // No workbookId, or a workbookId with no usable saved state (a not-found
  // id, or a workbook without a query) — land on a blank Explore rather
  // than a dead end.
  return (
    <div>
      <PageHeader
        eyebrow="Explore"
        title="Ask your data anything"
        description="Ask in plain language, or build a view manually by dragging fields onto the shelves."
      />
      <ExploreTabs />
    </div>
  );
}
