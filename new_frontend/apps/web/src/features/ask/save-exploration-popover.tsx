import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookmarkPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useCreateWorkbook } from "@/api/hooks";

export function SaveExplorationPopover({
  title,
  source,
  fieldKey,
  question,
}: {
  title: string;
  source: "metric" | "preset";
  fieldKey: string;
  /** The literal question this result answers, when there is one — omit for a manually-built result so the reopened view doesn't put words in the user's mouth. */
  question?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const createWorkbook = useCreateWorkbook();
  const navigate = useNavigate();

  async function save() {
    if (!name.trim()) return;
    const workbook = await createWorkbook.mutateAsync({ name: name.trim(), query: { source, key: fieldKey, question } });
    setOpen(false);
    navigate(`/explore/${workbook.id}`);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(title);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <BookmarkPlus className="size-3.5" />
          <span className="hidden sm:inline">Save exploration</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Save exploration</p>
        <Label htmlFor="exploration-name">Name</Label>
        <Input
          id="exploration-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <Button size="sm" className="mt-3 w-full" onClick={save} loading={createWorkbook.isPending}>
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}
