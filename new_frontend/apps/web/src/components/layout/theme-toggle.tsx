import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { themeActions, useAppDispatch, useAppSelector } from "@/store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A plain light/dark switch: clicking it applies whichever mode isn't
 * currently active, and the button's own icon and label always name that
 * destination mode (e.g. it reads "Light mode" while the app is dark), not
 * the mode you're already in.
 */
export function ThemeToggle({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  const dispatch = useAppDispatch();
  const preference = useAppSelector((state) => state.theme.preference);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", preference);
    window.localStorage.setItem("apicem.theme", preference);
  }, [preference]);
  const next = preference === "dark" ? "light" : "dark";
  const Icon = next === "dark" ? Moon : Sun;
  const label = next === "dark" ? "Dark mode" : "Light mode";

  const button = (
    <button
      onClick={() => dispatch(themeActions.setThemePreference(next))}
      aria-label={`Switch to ${label.toLowerCase()}`}
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-full border border-border-strong bg-surface text-[11.5px] font-medium text-ink-soft transition-colors hover:text-ink",
        iconOnly ? "w-7 p-0" : "px-2",
        className,
      )}
    >
      <Icon className="size-3" />
      {!iconOnly && <span className="lowercase">{label}</span>}
    </button>
  );

  if (!iconOnly) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
