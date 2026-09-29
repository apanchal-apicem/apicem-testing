import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { useCreateReport, useCurrentUser, useDeleteReport, useReports, useTeamMembers, queryKeys } from "@/api/hooks";
import { apiClient } from "@/api/client";
import { queryClient } from "@/api/query-client";
import { preloadReportViewPage } from "@/route-preload";
import { formatRelativeTime } from "@/lib/format";
import { canManageContent } from "@/lib/permissions";
import type { Report, User } from "@apicem/api-contract";

function ReportCard({ report, owner, canManage }: { report: Report; owner?: User; canManage: boolean }) {
  const navigate = useNavigate();
  const deleteReport = useDeleteReport();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="group relative flex flex-col gap-4 rounded-(--radius-lg) border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/60">
      {/* Stretched hit target: covers the whole card so clicking anywhere on
          it navigates, while the menu button (stacked above via z-10) stays
          independently clickable — see the same pattern in WorkbookCard. */}
      <button
        onClick={() => navigate(`/reports/${report.id}`)}
        onMouseEnter={() => {
          preloadReportViewPage();
          queryClient.prefetchQuery({ queryKey: queryKeys.report(report.id), queryFn: () => apiClient.getReport(report.id) });
        }}
        aria-label={report.name}
        className="absolute inset-0 rounded-(--radius-lg)"
      />

      <div className="flex items-start justify-between">
        <span className="flex size-9 items-center justify-center rounded-(--radius-sm) bg-surface-2 text-ink-soft">
          <FileText className="size-4.5" strokeWidth={1.75} />
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-faint">{report.blocks.length} blocks</span>
          {canManage && (
            <div className="relative z-10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`More actions for ${report.name}`}
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
        <p className="font-display text-[14.5px] font-semibold text-ink">{report.name}</p>
        {report.description && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-soft">{report.description}</p>}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        {owner && <Avatar name={owner.name} color={owner.avatarColor} size={22} />}
        <span className="text-[12px] text-ink-faint">Updated {formatRelativeTime(report.updatedAt)}</span>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${report.name}"?`}
        description="This permanently deletes this report. This can't be undone."
        loading={deleteReport.isPending}
        onConfirm={() => deleteReport.mutate(report.id, { onSuccess: () => setConfirmOpen(false) })}
      />
    </div>
  );
}

export function ReportsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: reports = [], isLoading } = useReports();
  const { data: members = [] } = useTeamMembers();
  const { data: user } = useCurrentUser();
  const createReport = useCreateReport();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const canManage = canManageContent(user?.role);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    const report = await createReport.mutateAsync({ name: name.trim() });
    setOpen(false);
    setName("");
    // A brand-new report has nothing to look at yet — go straight to
    // editing it rather than landing on an empty read-only view.
    navigate(`/reports/${report.id}/edit`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Build"
        title="Reports"
        description="Pixel-perfect, drag-and-drop layouts you can schedule and share."
        actions={
          <Button withArrow onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            New report
          </Button>
        }
      />

      {!isLoading && reports.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="Build your first drag-and-drop report from KPIs, charts, and tables."
          action={<Button withArrow onClick={() => setOpen(true)}>New report</Button>}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <ReportCard key={r.id} report={r} owner={members.find((m) => m.id === r.ownerId)} canManage={canManage} />
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>New report</DialogTitle>
          </DialogHeader>
          <Label htmlFor="report-name">Name</Label>
          <Input
            id="report-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Weekly Ops Snapshot"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={createReport.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
