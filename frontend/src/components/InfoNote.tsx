import { useEffect, useRef, useState } from "react";
import { IconInfo } from "./icons";

/** A small click-to-reveal note, following the exact same trigger + absolutely-positioned
 * panel + outside-click-to-close convention as DateRangeSelector -- this app has no separate
 * tooltip/popover primitive, so a second one shouldn't be invented for one use case. */
export function InfoNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="info-note" ref={ref}>
      <button
        type="button"
        className="info-note-trigger"
        aria-label="Which date this dashboard uses"
        onClick={() => setOpen((v) => !v)}
      >
        <IconInfo size={15} />
      </button>
      {open && <div className="info-note-panel">{text}</div>}
    </div>
  );
}
