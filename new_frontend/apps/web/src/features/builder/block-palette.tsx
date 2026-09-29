import { useDraggable } from "@dnd-kit/core";
import { Gauge, ImageIcon, LayoutGrid, LineChart, Minus, Table2, Type } from "lucide-react";
import type { ReportBlockType } from "@apicem/api-contract";

export const paletteItems: { type: ReportBlockType; label: string; icon: typeof Gauge }[] = [
  { type: "kpi", label: "KPI", icon: Gauge },
  { type: "chart", label: "Chart", icon: LineChart },
  { type: "table", label: "Table", icon: Table2 },
  { type: "pivot", label: "Pivot", icon: LayoutGrid },
  { type: "text", label: "Text", icon: Type },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "image", label: "Image", icon: ImageIcon },
];

function PaletteItem({ item, onClick }: { item: (typeof paletteItems)[number]; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${item.type}`,
    data: { kind: "palette", blockType: item.type },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className="flex w-14 shrink-0 flex-col items-center gap-1 rounded-(--radius-sm) px-2 py-2 text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink sm:w-16"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <item.icon className="size-4.5" strokeWidth={1.75} />
      <span className="text-[11px] font-medium">{item.label}</span>
    </button>
  );
}

export function BlockPalette({ onAdd }: { onAdd: (type: ReportBlockType) => void }) {
  return (
    <div className="sticky bottom-6 z-30 mx-auto w-fit max-w-[calc(100vw-2rem)] overflow-x-auto rounded-full border border-border bg-surface px-2 py-1.5 shadow-xl">
      <div className="flex items-center gap-1">
        {paletteItems.map((item) => (
          <PaletteItem key={item.type} item={item} onClick={() => onAdd(item.type)} />
        ))}
      </div>
    </div>
  );
}
