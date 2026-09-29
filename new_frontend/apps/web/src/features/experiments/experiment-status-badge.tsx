import type { ExperimentStatus } from "@apicem/api-contract";
import { Badge } from "@/components/ui/badge";

const statusMeta: Record<ExperimentStatus, { label: string; tone: "neutral" | "info" | "success" }> = {
  draft: { label: "Draft", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "success" },
};

export function ExperimentStatusBadge({ status }: { status: ExperimentStatus }) {
  const meta = statusMeta[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
