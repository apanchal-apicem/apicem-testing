import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <ProgressPrimitive.Indicator
        className="h-full rounded-full bg-accent transition-transform duration-500"
        style={{ transform: `translateX(-${100 - value}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
