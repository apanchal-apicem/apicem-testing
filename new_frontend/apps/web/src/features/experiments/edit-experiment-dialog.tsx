import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMetrics, useUpdateExperiment } from "@/api/hooks";
import type { Experiment, ExperimentUnitType } from "@apicem/api-contract";

function parseUnits(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Edits an experiment's design regardless of its current status. Editing a
 * `running` or `completed` test changes what its parameters say happened,
 * not just what's planned — the dialog surfaces a warning for those two
 * statuses so that's a deliberate choice, not an accidental overwrite.
 */
export function EditExperimentDialog({
  experiment,
  open,
  onOpenChange,
}: {
  experiment: Experiment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: metrics = [] } = useMetrics();
  const updateExperiment = useUpdateExperiment(experiment.id);

  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [metricId, setMetricId] = useState("");
  const [unitType, setUnitType] = useState<ExperimentUnitType>("geo");
  const [treatmentUnits, setTreatmentUnits] = useState("");
  const [holdoutUnits, setHoldoutUnits] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Re-seeds from the experiment's actual current values each time the
  // dialog opens, rather than carrying over a previous open-edit-cancel
  // cycle's draft.
  useEffect(() => {
    if (!open) return;
    setName(experiment.name);
    setHypothesis(experiment.hypothesis);
    setMetricId(experiment.metricId);
    setUnitType(experiment.unitType);
    setTreatmentUnits(experiment.treatment.units.join(", "));
    setHoldoutUnits(experiment.holdout.units.join(", "));
    setStartDate(experiment.startDate);
    setEndDate(experiment.endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, experiment]);

  const canSubmit = name.trim() && hypothesis.trim() && metricId && treatmentUnits.trim() && holdoutUnits.trim() && startDate && endDate;

  async function handleSave() {
    if (!canSubmit) return;
    await updateExperiment.mutateAsync({
      name: name.trim(),
      hypothesis: hypothesis.trim(),
      metricId,
      unitType,
      treatment: { units: parseUnits(treatmentUnits) },
      holdout: { units: parseUnits(holdoutUnits) },
      startDate,
      endDate,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit experiment</DialogTitle>
          <DialogDescription>
            {experiment.status === "draft"
              ? "Still a draft, so every part of the design can change before it starts."
              : `This experiment is ${experiment.status}. Changing its design here rewrites what it's set up to measure, not just what's planned.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="exp-edit-name">Experiment name</Label>
            <Input id="exp-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="exp-edit-hypothesis">Hypothesis</Label>
            <Textarea id="exp-edit-hypothesis" rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp-edit-metric">Metric to measure</Label>
              <Select value={metricId} onValueChange={setMetricId}>
                <SelectTrigger id="exp-edit-metric">
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
              <Label htmlFor="exp-edit-unit-type">Split by</Label>
              <Select value={unitType} onValueChange={(v) => setUnitType(v as ExperimentUnitType)}>
                <SelectTrigger id="exp-edit-unit-type">
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
              <Label htmlFor="exp-edit-treatment">Treatment group</Label>
              <Input id="exp-edit-treatment" value={treatmentUnits} onChange={(e) => setTreatmentUnits(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="exp-edit-holdout">Holdout group</Label>
              <Input id="exp-edit-holdout" value={holdoutUnits} onChange={(e) => setHoldoutUnits(e.target.value)} />
            </div>
          </div>
          <p className="text-[12px] text-ink-faint">Comma-separated. The holdout group sees no change; it's what treatment gets compared against.</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp-edit-start">Start date</Label>
              <Input id="exp-edit-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="exp-edit-end">End date</Label>
              <Input id="exp-edit-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={updateExperiment.isPending} disabled={!canSubmit}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
