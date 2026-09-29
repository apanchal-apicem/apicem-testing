import { cn } from "@/lib/utils";

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return (
    <hr
      aria-orientation={vertical ? "vertical" : undefined}
      className={cn("m-0 border-0", vertical ? "w-px self-stretch bg-border" : "h-px w-full bg-border", className)}
    />
  );
}
