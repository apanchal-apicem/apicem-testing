import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateExperiment, useMetrics } from "@/api/hooks";
import type { ExperimentUnitType } from "@apicem/api-contract";

function parseUnits(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CreateExperimentDialog({
  open,
  onOpenChange,
  onCreated,
  initialMetricId,
  initialName,
  initialHypothesis,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (experimentId: string) => void;
  /** Pre-fills the dialog when it's opened from a specific result (e.g. Explore's "Design an experiment"), rather than from a blank "New experiment" action. */
  initialMetricId?: string;
  initialName?: string;
  initialHypothesis?: string;
}) {
  const { data: metrics = [] } = useMetrics();
  const createExperiment = useCreateExperiment();

  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [metricId, setMetricId] = useState("");
  const [unitType, setUnitType] = useState<ExperimentUnitType>("geo");
  const [treatmentUnits, setTreatmentUnits] = useState("");
  const [holdoutUnits, setHoldoutUnits] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setHypothesis(initialHypothesis ?? "");
    setMetricId(initialMetricId ?? "");
    setUnitType("geo");
    setTreatmentUnits("");
    setHoldoutUnits("");
    // Only the moment the dialog opens should reseed these fields — not
    // every keystroke thereafter, which is why `open` is the only dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = name.trim() && hypothesis.trim() && metricId && treatmentUnits.trim() && holdoutUnits.trim();

  async function handleCreate() {
    if (!canSubmit) return;
    const today = new Date();
    const in4Weeks = new Date(today.getTime() + 28 * 24 * 60 * 60 * 1000);
    const experiment = await createExperiment.mutateAsync({
      name: name.trim(),
      hypothesis: hypothesis.trim(),
      metricId,
      unitType,
      treatment: { units: parseUnits(treatmentUnits) },
      holdout: { units: parseUnits(holdoutUnits) },
      startDate: today.toISOString().slice(0, 10),
      endDate: in4Weeks.toISOString().slice(0, 10),
    });
    // Closing sets `open` to false; the reset effect above reseeds every
    // field the next time this dialog opens, so there's nothing to clear here.
    onOpenChange(false);
    onCreated(experiment.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New incrementality experiment</DialogTitle>
          <DialogDescription>
            Split your audience into a treatment and a holdout group so you can measure real causal lift, not just
            correlation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="exp-name">Experiment name</Label>
            <Input id="exp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Meta Ads Geo Holdout (Midwest)" />
          </div>
          <div>
            <Label htmlFor="exp-hypothesis">Hypothesis</Label>
            <Textarea
              id="exp-hypothesis"
              rows={2}
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="Raising spend in test geos drives incremental revenue beyond organic trend."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp-metric">Metric to measure</Label>
              <Select value={metricId} onValueChange={setMetricId}>
                <SelectTrigger id="exp-metric">
                  <SelectValue placeholder="Choose a metric" />
                </SelectTrigger>
                <SelectContent>
                  {metrics.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exp-unit-type">Split by</Label>
              <Select value={unitType} onValueChange={(v) => setUnitType(v as ExperimentUnitType)}>
                <SelectTrigger id="exp-unit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geo">Geography</SelectItem>
                  <SelectItem value="customer_segment">Customer segment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp-treatment">Treatment group</Label>
              <Input
                id="exp-treatment"
                value={treatmentUnits}
                onChange={(e) => setTreatmentUnits(e.target.value)}
                placeholder={unitType === "geo" ? "Texas, Colorado" : "VIP customers"}
              />
            </div>
            <div>
              <Label htmlFor="exp-holdout">Holdout group</Label>
              <Input
                id="exp-holdout"
                value={holdoutUnits}
                onChange={(e) => setHoldoutUnits(e.target.value)}
                placeholder={unitType === "geo" ? "Georgia, North Carolina" : "Control group"}
              />
            </div>
          </div>
          <p className="text-[12px] text-ink-faint">Comma-separated. The holdout group sees no change; it's what treatment gets compared against.</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={createExperiment.isPending} disabled={!canSubmit}>
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
