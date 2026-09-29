import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldRef } from "./field-chip";

/**
 * Like Shelf, but holds several fields instead of one — Value (metrics) and
 * Group by (dimensions) both need more than a single slot; Filter still
 * doesn't, so it keeps using the original single-field Shelf.
 */
export function MultiShelf({
  label,
  accepts,
  fields,
  onAdd,
  onRemove,
  max,
  placeholder,
}: {
  label: string;
  accepts: FieldRef["kind"];
  fields: FieldRef[];
  onAdd: (field: FieldRef) => void;
  onRemove: (id: string) => void;
  max?: number;
  placeholder: string;
}) {
  const [over, setOver] = useState(false);
  const full = max !== undefined && fields.length >= max;

  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
        {max !== undefined && max > 1 && <span className="normal-case text-ink-faint/70"> (up to {max})</span>}
      </p>
      <div
        onDragOver={(e) => {
          if (full) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (full) return;
          const raw = e.dataTransfer.getData("application/x-apicem-field");
          if (!raw) return;
          const parsed: FieldRef = JSON.parse(raw);
          if (parsed.kind !== accepts || fields.some((f) => f.id === parsed.id)) return;
          onAdd(parsed);
        }}
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-(--radius-sm) border border-dashed px-3 py-2 text-[13px] transition-colors",
          over && !full ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-2/50",
          fields.length === 0 && "text-ink-faint",
        )}
      >
        {fields.length === 0 && placeholder}
        {fields.map((f) => (
          <span
            key={f.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-2.5 pr-1.5 text-[12px] font-medium text-ink"
          >
            <span className="truncate">{f.label}</span>
            <button
              onClick={() => onRemove(f.id)}
              aria-label={`Remove ${f.label}`}
              className="shrink-0 rounded-full p-0.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
