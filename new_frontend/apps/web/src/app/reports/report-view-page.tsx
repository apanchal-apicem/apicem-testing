import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StaticCanvas } from "@/features/builder/static-canvas";
import { GRID_COLS, GAP } from "@/features/builder/grid-utils";
import { useCurrentUser, useDeleteReport, useReport, useRecordWorkbookViewOnce } from "@/api/hooks";
import { preloadReportBuilderPage } from "@/route-preload";
import { formatRelativeTime } from "@/lib/format";
import { canManageContent } from "@/lib/permissions";

/**
 * The default landing page for an existing report: read-only, so opening a
 * report to glance at it doesn't drop you straight into a drag-and-drop
 * editor. "Edit" is the one door into `ReportBuilderPage`.
 */
export function ReportViewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading } = useReport(reportId);
  useRecordWorkbookViewOnce(reportId);
  const { data: user } = useCurrentUser();
  const deleteReport = useDeleteReport();
  const canManage = canManageContent(user?.role);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [colWidth, setColWidth] = useState(80);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setColWidth((width - GAP * (GRID_COLS - 1)) / GRID_COLS);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [report]);

  if (isLoading || !report) {
    return (
      <output className="flex h-[70vh] items-center justify-center text-ink-faint">
        <Loader2 className="size-5 animate-spin" />
        <span className="sr-only">Loading report…</span>
      </output>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate("/reports")}
            aria-label="Back to reports"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-display text-[14.5px] font-semibold text-ink">{report.name}</p>
            <p className="text-[11.5px] text-ink-faint">Updated {formatRelativeTime(report.updatedAt)}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => navigate(`/reports/${reportId}/edit`)}
              onMouseEnter={() => preloadReportBuilderPage()}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`More actions for ${report.name}`}
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
      </header>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${report.name}"?`}
        description="This permanently deletes this report. This can't be undone."
        loading={deleteReport.isPending}
        onConfirm={() => deleteReport.mutate(report.id, { onSuccess: () => navigate("/reports") })}
      />

      <div className="scrollbar-thin flex-1 overflow-auto px-4 py-6 sm:px-8 sm:py-8">
        <div ref={canvasRef}>
          <StaticCanvas blocks={report.blocks} colWidth={colWidth} />
        </div>
      </div>
    </div>
  );
}
