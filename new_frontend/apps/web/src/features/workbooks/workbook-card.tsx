import { useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Eye, FileText, MoreHorizontal, Trash2 } from "lucide-react";
import type { User, Workbook } from "@apicem/api-contract";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/format";
import { canManageContent } from "@/lib/permissions";
import { apiClient } from "@/api/client";
import { queryKeys, useCurrentUser, useDeleteReport, useDeleteWorkbook } from "@/api/hooks";
import { queryClient } from "@/api/query-client";
import { preloadExplorePage, preloadReportViewPage } from "@/route-preload";

export function WorkbookCard({ workbook, owner }: { workbook: Workbook; owner?: User }) {
  const { data: user } = useCurrentUser();
  const deleteWorkbook = useDeleteWorkbook();
  const deleteReport = useDeleteReport();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const Icon = workbook.kind === "report" ? FileText : Compass;
  const href = workbook.kind === "report" ? `/reports/${workbook.id}` : `/explore/${workbook.id}`;
  // A report's Home-page card has no stored row of its own to delete (see
  // Workbook.kind's doc comment) — deleteReport is the one that actually
  // removes it, deleteWorkbook only ever applies to a real exploration.
  const deleteAction = workbook.kind === "report" ? deleteReport : deleteWorkbook;
  const canManage = canManageContent(user?.role);

  function prefetch() {
    if (workbook.kind === "report") {
      preloadReportViewPage();
      queryClient.prefetchQuery({ queryKey: queryKeys.report(workbook.id), queryFn: () => apiClient.getReport(workbook.id) });
    } else {
      preloadExplorePage();
      queryClient.prefetchQuery({ queryKey: queryKeys.workbook(workbook.id), queryFn: () => apiClient.getWorkbook(workbook.id) });
    }
  }

  return (
    <div className="group relative flex flex-col justify-between gap-4 rounded-(--radius-lg) border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/60">
      {/* A "stretched link" — invisible, covers the whole card so clicking
          anywhere on it navigates, while still leaving the menu button (see
          below, stacked above this via z-10) independently clickable. */}
      <Link
        to={href}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        aria-label={workbook.name}
        className="absolute inset-0 rounded-(--radius-lg)"
      />

      <div className="flex items-start justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-(--radius-sm) bg-surface-2 text-ink-soft group-hover:bg-accent-soft group-hover:text-accent-ink">
          <Icon className="size-4.5" strokeWidth={1.75} />
        </span>
        <div className="flex items-center gap-1.5">
          {workbook.folder && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-faint">
              {workbook.folder}
            </span>
          )}
          {canManage && (
            <div className="relative z-10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`More actions for ${workbook.name}`}
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
        <p className="font-display text-[14.5px] font-semibold text-ink">{workbook.name}</p>
        <p className="mt-0.5 text-[12px] text-ink-faint">
          {workbook.kind === "report" ? "Report" : "Exploration"} · Updated {formatRelativeTime(workbook.updatedAt)}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        {owner && <Avatar name={owner.name} color={owner.avatarColor} size={22} />}
        <span className="flex items-center gap-1 text-[12px] text-ink-faint">
          <Eye className="size-3.5" />
          {workbook.views}
        </span>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${workbook.name}"?`}
        description={`This permanently deletes this ${workbook.kind === "report" ? "report" : "exploration"}. This can't be undone.`}
        loading={deleteAction.isPending}
        onConfirm={() => deleteAction.mutate(workbook.id, { onSuccess: () => setConfirmOpen(false) })}
      />
    </div>
  );
}
