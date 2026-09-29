import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, MoreHorizontal, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { Experiment } from "@apicem/api-contract";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ExperimentStatusBadge } from "@/features/experiments/experiment-status-badge";
import { CreateExperimentDialog } from "@/features/experiments/create-experiment-dialog";
import { useCurrentUser, useDeleteExperiment, useExperiments, queryKeys } from "@/api/hooks";
import { apiClient } from "@/api/client";
import { queryClient } from "@/api/query-client";
import { preloadExperimentDetailPage } from "@/route-preload";
import { cn } from "@/lib/utils";
import { canManageContent } from "@/lib/permissions";

function ExperimentCard({ experiment, canManage }: { experiment: Experiment; canManage: boolean }) {
  const navigate = useNavigate();
  const deleteExperiment = useDeleteExperiment();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const lift = experiment.result?.liftPct;
  const isPositive = (lift ?? 0) >= 0;

  return (
    <div className="group relative flex flex-col gap-4 rounded-(--radius-lg) border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/60">
      {/* Stretched hit target: covers the whole card so clicking anywhere on
          it navigates, while the menu button (stacked above via z-10) stays
          independently clickable — see the same pattern in WorkbookCard. */}
      <button
        onClick={() => navigate(`/experiments/${experiment.id}`)}
        onMouseEnter={() => {
          preloadExperimentDetailPage();
          queryClient.prefetchQuery({ queryKey: queryKeys.experiment(experiment.id), queryFn: () => apiClient.getExperiment(experiment.id) });
        }}
        aria-label={experiment.name}
        className="absolute inset-0 rounded-(--radius-lg)"
      />

      <div className="flex items-start justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-(--radius-sm) bg-surface-2 text-ink-soft">
          <FlaskConical className="size-4.5" strokeWidth={1.75} />
        </span>
        <div className="flex items-center gap-2">
          <ExperimentStatusBadge status={experiment.status} />
          {canManage && (
            <div className="relative z-10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`More actions for ${experiment.name}`}
                    className="rounded-full p-1 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
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
      </div>
      <div>
        <p className="font-display text-[14.5px] font-semibold text-ink">{experiment.name}</p>
        <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-soft">{experiment.hypothesis}</p>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3 text-[12px] text-ink-faint">
        <span>
          {experiment.treatment.units.length} vs {experiment.holdout.units.length}{" "}
          {experiment.unitType === "geo" ? "geos" : "segments"}
        </span>
        {lift !== undefined && (
          <span className={cn("flex items-center gap-1 font-medium", isPositive ? "text-success" : "text-danger")}>
            {isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {Math.abs(lift * 100).toFixed(1)}% lift
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${experiment.name}"?`}
        description="This permanently deletes this experiment. This can't be undone."
        loading={deleteExperiment.isPending}
        onConfirm={() => deleteExperiment.mutate(experiment.id, { onSuccess: () => setConfirmOpen(false) })}
      />
    </div>
  );
}

export function ExperimentsListPage() {
  const navigate = useNavigate();
  const { data: experiments = [], isLoading } = useExperiments();
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const canManage = canManageContent(user?.role);

  return (
    <div>
      <PageHeader
        eyebrow="Measure"
        title="Experiments"
        description="Geo and segment holdout tests: causal lift, not just correlated dashboards."
        actions={
          <Button withArrow onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            New experiment
          </Button>
        }
      />

      {!isLoading && experiments.length === 0 && (
        <EmptyState
          icon={FlaskConical}
          title="No experiments yet"
          description="Split test units into a treatment and a holdout group to measure real incremental impact."
          action={<Button withArrow onClick={() => setOpen(true)}>New experiment</Button>}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {experiments.map((exp) => (
          <ExperimentCard key={exp.id} experiment={exp} canManage={canManage} />
        ))}
      </div>

      <CreateExperimentDialog open={open} onOpenChange={setOpen} onCreated={(id) => navigate(`/experiments/${id}`)} />
    </div>
  );
}
