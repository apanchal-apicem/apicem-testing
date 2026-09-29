import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FlaskConical, Loader2, MoreHorizontal, Pencil, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { ExperimentStatusBadge } from "@/features/experiments/experiment-status-badge";
import { LiftChart } from "@/features/experiments/lift-chart";
import { EditExperimentDialog } from "@/features/experiments/edit-experiment-dialog";
import { ConfidenceBadge } from "@/components/charts/confidence-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser, useDeleteExperiment, useExperiment, useMetrics } from "@/api/hooks";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canManageContent } from "@/lib/permissions";

function ResultTile({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-(--radius-lg) border border-border bg-surface p-4">
      <p className="text-[12.5px] font-medium text-ink-soft">{label}</p>
      <p className={cn("tabular mt-1.5 font-display text-[22px] font-bold", tone === "success" && "text-success", tone === "danger" && "text-danger", !tone && "text-ink")}>
        {value}
      </p>
    </div>
  );
}

export function ExperimentDetailPage() {
  const { experimentId } = useParams<{ experimentId: string }>();
  const navigate = useNavigate();
  const { data: experiment, isLoading } = useExperiment(experimentId);
  const { data: metrics = [] } = useMetrics();
  const { data: user } = useCurrentUser();
  const deleteExperiment = useDeleteExperiment();
  const canManage = canManageContent(user?.role);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading || !experiment) {
    return (
      <output className="flex h-[60vh] items-center justify-center text-ink-faint">
        <Loader2 className="size-5 animate-spin" />
        <span className="sr-only">Loading experiment…</span>
      </output>
    );
  }

  const metric = metrics.find((m) => m.id === experiment.metricId);
  const result = experiment.result;
  const lift = result?.liftPct ?? 0;
  const isPositive = lift >= 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start gap-3">
        <button
          onClick={() => navigate("/experiments")}
          aria-label="Back to experiments"
          className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[22px] font-bold tracking-tight text-ink text-balance">{experiment.name}</h1>
            <ExperimentStatusBadge status={experiment.status} />
          </div>
          <p className="mt-1.5 max-w-2xl text-[14px] text-ink-soft">{experiment.hypothesis}</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`More actions for ${experiment.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setConfirmOpen(true)} className="text-danger">
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${experiment.name}"?`}
        description="This permanently deletes this experiment. This can't be undone."
        loading={deleteExperiment.isPending}
        onConfirm={() => deleteExperiment.mutate(experiment.id, { onSuccess: () => navigate("/experiments") })}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-(--radius-lg) border border-border bg-surface p-4">
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-accent-ink">Treatment</p>
          <div className="flex flex-wrap gap-1.5">
            {experiment.treatment.units.map((u) => (
              <span key={u} className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent-ink">
                {u}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-(--radius-lg) border border-border bg-surface p-4">
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Holdout (control)</p>
          <div className="flex flex-wrap gap-1.5">
            {experiment.holdout.units.map((u) => (
              <span key={u} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-soft">
                {u}
              </span>
            ))}
          </div>
        </div>
      </div>

      {!result && (
        <EmptyState
          icon={FlaskConical}
          title="No results yet"
          description={
            experiment.status === "draft"
              ? `Scheduled to run ${experiment.startDate} through ${experiment.endDate}. Results appear once it starts.`
              : "Results will appear here once enough data has accumulated."
          }
        />
      )}

      {result && (
        <div className="space-y-5">
          {experiment.status === "running" && (
            <div className="rounded-(--radius-md) border border-info/30 bg-info-soft px-4 py-2.5 text-[12.5px] text-info">
              Interim read: this experiment is still running. The lift estimate will keep updating until {experiment.endDate}.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ResultTile
              label="Causal lift"
              value={`${isPositive ? "+" : ""}${(lift * 100).toFixed(1)}%`}
              tone={isPositive ? "success" : "danger"}
            />
            <ResultTile
              label="Incremental value"
              value={formatCurrency(result.incrementalValue)}
              tone={isPositive ? "success" : "danger"}
            />
            {result.iroas !== undefined && <ResultTile label="Incremental ROAS" value={`${result.iroas.toFixed(2)}x`} />}
            <div className="rounded-(--radius-lg) border border-border bg-surface p-4">
              <p className="text-[12.5px] font-medium text-ink-soft">Confidence</p>
              <div className="mt-2">
                <ConfidenceBadge confidence={result.significance} />
              </div>
            </div>
          </div>

          <div className="rounded-(--radius-lg) border border-border bg-surface p-4">
            <div className="mb-2 flex flex-col gap-1 sm:mb-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 font-display text-[14px] font-semibold text-ink">
                {metric?.name ?? "Metric"}: treatment vs. holdout
              </p>
              <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-faint">
                {isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                90% CI: {(result.confidenceInterval[0] * 100).toFixed(1)}% to {(result.confidenceInterval[1] * 100).toFixed(1)}%
              </span>
            </div>
            <LiftChart treatmentSeries={result.treatmentSeries} holdoutSeries={result.holdoutSeries} />
          </div>

          <p className="text-[12px] text-ink-faint">
            Lift is the treatment group's outcome relative to what the holdout group's trend implies it would have been
            without the change, not a before/after comparison, which conflates seasonality and market trend with impact.
          </p>
        </div>
      )}

      <EditExperimentDialog experiment={experiment} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
