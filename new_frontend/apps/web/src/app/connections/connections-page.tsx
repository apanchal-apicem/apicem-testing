import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, History, MoreHorizontal, Plug, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getSourceMeta } from "@/features/sources/source-meta";
import { SchemaTablesList } from "@/features/sources/schema-tables-list";
import { SyncHistoryList } from "@/features/sources/sync-history-list";
import { useDataSourceSchema, useDataSources, useRemoveDataSource, useRetrySync, useSyncRuns } from "@/api/hooks";
import { formatRelativeTime } from "@/lib/format";
import type { DataSource } from "@apicem/api-contract";

function SourceRow({
  source,
  onView,
  onViewHistory,
}: {
  source: DataSource;
  onView: (s: DataSource) => void;
  onViewHistory: (s: DataSource) => void;
}) {
  const meta = getSourceMeta(source.type);
  const removeSource = useRemoveDataSource();
  const retrySync = useRetrySync(source.id);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-nowrap sm:gap-4 sm:px-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-sm) bg-surface-2 text-ink-soft">
        <meta.icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-medium text-ink">{source.name}</p>
          {source.status === "error" && <Badge tone="danger">Needs attention</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-faint">
          <StatusDot status={source.status} />
          <span>{source.tableCount} tables</span>
          <span>{source.rowCount.toLocaleString()} rows</span>
          <span>{source.lastSyncedAt ? `Synced ${formatRelativeTime(source.lastSyncedAt)}` : "Never synced"}</span>
        </div>
        {source.errorMessage && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {source.errorMessage}
          </p>
        )}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
        {/* Only one of these ever renders per row, in the same slot — without
            a shared min-width, "Retry sync" (fewer characters) renders
            visibly narrower than "Sync history" purely from text length,
            making an error-state row look inconsistent next to a healthy one. */}
        {source.status === "error" ? (
          <Button size="sm" loading={retrySync.isPending} onClick={() => retrySync.mutate()} className="min-w-[130px]">
            <RefreshCw className="size-3.5" />
            Retry sync
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewHistory(source)}
            disabled={source.status === "pending"}
            className="min-w-[130px]"
          >
            <History className="size-3.5" />
            Sync history
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onView(source)} disabled={source.status === "pending"}>
          View schema
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label={`More actions for ${source.name}`} className="rounded-full p-2 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => retrySync.mutate()}>
              <RefreshCw className="size-3.5 text-ink-soft" />
              Sync now
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => removeSource.mutate(source.id)} className="text-danger">
              <Trash2 className="size-3.5" />
              Remove connection
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SyncHistoryDialog({ source, onClose }: { source: DataSource | null; onClose: () => void }) {
  const { data: runs = [] } = useSyncRuns(source?.id);
  const retrySync = useRetrySync(source?.id ?? "");
  const latestFailed = runs[0]?.status === "failed";

  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{source?.name}: sync history</DialogTitle>
          <DialogDescription>
            Every run carries an idempotency key. Retrying a failed run re-upserts on each row's natural key, so the
            total lands on the source's true row count, never on top of what the failed attempt already wrote.
          </DialogDescription>
        </DialogHeader>
        <SyncHistoryList runs={runs} />
        {latestFailed && (
          <DialogFooter>
            <Button loading={retrySync.isPending} onClick={() => retrySync.mutate()}>
              <RefreshCw className="size-3.5" />
              Retry sync
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ConnectionsPage() {
  const navigate = useNavigate();
  const { data: sources = [], isLoading } = useDataSources();
  const [viewing, setViewing] = useState<DataSource | null>(null);
  const [history, setHistory] = useState<DataSource | null>(null);
  const { data: schema } = useDataSourceSchema(viewing?.id);

  return (
    <div>
      <PageHeader
        eyebrow="Data"
        title="Connections"
        description="Every warehouse, storefront, and ledger Apicem Engine reads from for this workspace."
        actions={
          <Button withArrow onClick={() => navigate("/connections/new")}>
            <Plug className="size-4" />
            Connect a source
          </Button>
        }
      />

      {!isLoading && sources.length === 0 && (
        <EmptyState
          icon={Plug}
          title="No sources connected yet"
          description="Connect a warehouse, storefront, or spreadsheet to start building metrics."
          action={
            <Button withArrow onClick={() => navigate("/connections/new")}>
              Connect a source
            </Button>
          }
        />
      )}

      {sources.length > 0 && (
        <div className="rounded-(--radius-lg) border border-border bg-surface">
          {sources.map((source) => (
            <SourceRow key={source.id} source={source} onView={setViewing} onViewHistory={setHistory} />
          ))}
        </div>
      )}

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>
              {schema ? `${schema.tables.length} tables discovered.` : "Loading schema…"}
            </DialogDescription>
          </DialogHeader>
          {schema && <SchemaTablesList tables={schema.tables} />}
        </DialogContent>
      </Dialog>

      <SyncHistoryDialog source={history} onClose={() => setHistory(null)} />
    </div>
  );
}
