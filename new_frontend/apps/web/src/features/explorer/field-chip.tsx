import { Hash, Tags } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FieldRef {
  kind: "metric" | "dimension";
  id: string;
  label: string;
}

export function FieldChip({
  field,
  onSelect,
  className,
}: {
  field: FieldRef;
  onSelect?: (field: FieldRef) => void;
  className?: string;
}) {
  const Icon = field.kind === "metric" ? Hash : Tags;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-apicem-field", JSON.stringify(field));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => onSelect?.(field)}
      className={cn(
        "flex w-full cursor-grab items-center gap-2 rounded-(--radius-sm) border border-border bg-surface px-2.5 py-2 text-[12.5px] font-medium text-ink transition-colors active:cursor-grabbing hover:border-border-strong hover:bg-surface-2",
        field.kind === "metric" ? "text-info" : "text-accent-ink",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{field.label}</span>
    </button>
  );
}
