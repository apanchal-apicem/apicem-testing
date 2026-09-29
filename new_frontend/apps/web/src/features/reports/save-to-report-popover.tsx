import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderPlus, LayoutDashboard } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppendReportBlock, useCreateReport, useReports } from "@/api/hooks";
import type { ChartType } from "@apicem/api-contract";

export function SaveToReportPopover({
  title,
  source,
  fieldKey,
  chartType,
}: {
  title: string;
  source: "metric" | "preset";
  fieldKey: string;
  chartType: ChartType;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const { data: reports = [] } = useReports();
  const createReport = useCreateReport();
  const appendBlock = useAppendReportBlock();
  const navigate = useNavigate();

  async function addTo(reportId: string) {
    const block = {
      id: `blk_${Math.random().toString(36).slice(2, 8)}`,
      type: "chart" as const,
      config: { source, key: fieldKey, chartType, title },
    };
    await appendBlock.mutateAsync({ reportId, block });
    setOpen(false);
    // Land in the editor, not the read-only view — the point of this flow
    // is to arrange the block that was just added.
    navigate(`/reports/${reportId}/edit`);
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    const report = await createReport.mutateAsync({ name: newName.trim() });
    await addTo(report.id);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutDashboard className="size-3.5" />
          <span className="hidden sm:inline">Add to report</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Add to existing</p>
        <div className="scrollbar-thin mb-3 max-h-40 space-y-0.5 overflow-y-auto">
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => addTo(r.id)}
              className="flex w-full items-center justify-between rounded-(--radius-sm) px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
            >
              {r.name}
            </button>
          ))}
          {reports.length === 0 && <p className="px-2 py-1 text-[12.5px] text-ink-faint">No reports yet.</p>}
        </div>
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Or create new</p>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Report name"
              aria-label="New report name"
              className="h-8 text-[13px]"
            />
            <Button
              size="sm"
              onClick={createAndAdd}
              loading={createReport.isPending || appendBlock.isPending}
              aria-label="Create report and add"
            >
              <FolderPlus className="size-3.5" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
