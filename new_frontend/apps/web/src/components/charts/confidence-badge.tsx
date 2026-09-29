import { Badge } from "@/components/ui/badge";

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.85) return <Badge tone="success">{pct}% confident</Badge>;
  if (confidence >= 0.6) return <Badge tone="accent">{pct}% confident</Badge>;
  return <Badge tone="danger">{pct}% confident, verify before acting</Badge>;
}
