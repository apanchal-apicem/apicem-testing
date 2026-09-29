import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BrandMark } from "./brand-mark";
import { SidebarContent } from "./sidebar";

/**
 * Below the `lg` breakpoint the always-visible 240px rail (`Sidebar`) would
 * just break the layout instead of degrading — so it's hidden entirely and
 * replaced by this: a slim top bar plus the same `SidebarContent` in a
 * slide-over drawer, opened by the menu button. Closes itself on navigation
 * rather than requiring every nav link to know it's inside a drawer.
 */
export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // "Adjusting state when a prop changes," React's own recommended pattern
  // for this rather than an effect: detected and applied during render, so
  // there's no extra post-commit render pass or a frame where a stale
  // pathname and an still-open drawer are both true at once.
  const [lastPathname, setLastPathname] = useState(location.pathname);
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2"
      >
        <Menu className="size-5" />
      </button>
      <BrandMark className="h-6" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="sm"
          className="inset-y-0 left-0 top-0 h-full w-72 max-w-[80vw] translate-x-0 translate-y-0 rounded-none border-r border-l-0 border-t-0 border-b-0 p-0 shadow-2xl"
        >
          <SidebarContent />
        </DialogContent>
      </Dialog>
    </div>
  );
}
