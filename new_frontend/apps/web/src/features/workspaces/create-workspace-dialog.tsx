import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useCreateWorkspace } from "@/api/hooks";

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const createWorkspace = useCreateWorkspace();

  async function handleCreate() {
    if (!name.trim()) return;
    await createWorkspace.mutateAsync({ name: name.trim() });
    setName("");
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            Starts completely empty, with no sources or metrics, and stays fully isolated from every other workspace you're in.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="ws-create-name">Workspace name</Label>
        <Input
          id="ws-create-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. a client's name"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={createWorkspace.isPending} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
