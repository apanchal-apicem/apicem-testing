import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-(--radius-sm) border border-border-strong bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-(--radius-sm) border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent resize-none",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  // A generic, unbound primitive: real usages pass their own `htmlFor`
  // (checked directly: every one in this app does except the two this
  // same lint pass just caught and fixed), which the linter can't verify
  // from the definition site alone.
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      className={cn("mb-1.5 block text-[12.5px] font-medium tracking-wide text-ink-soft uppercase", className)}
      {...props}
    />
  );
}
