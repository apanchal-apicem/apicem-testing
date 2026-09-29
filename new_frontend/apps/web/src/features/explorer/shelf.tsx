import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldRef } from "./field-chip";

export function Shelf({
  label,
  accepts,
  field,
  onDropField,
  onClear,
  placeholder,
}: {
  label: string;
  accepts: FieldRef["kind"];
  field: FieldRef | null;
  onDropField: (field: FieldRef) => void;
  onClear: () => void;
  placeholder: string;
}) {
  const [over, setOver] = useState(false);

  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const raw = e.dataTransfer.getData("application/x-apicem-field");
          if (!raw) return;
          const parsed: FieldRef = JSON.parse(raw);
          if (parsed.kind !== accepts) return;
          onDropField(parsed);
        }}
        className={cn(
          "flex h-11 items-center rounded-(--radius-sm) border border-dashed px-3 text-[13px] transition-colors",
          over ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-2/50",
          !field && "text-ink-faint",
        )}
      >
        {field ? (
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate font-medium text-ink">{field.label}</span>
            <button
              onClick={onClear}
              aria-label={`Clear ${label.toLowerCase()}`}
              className="shrink-0 rounded-full p-0.5 text-ink-faint hover:bg-surface hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          placeholder
        )}
      </div>
    </div>
  );
}

export function ShelfGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
