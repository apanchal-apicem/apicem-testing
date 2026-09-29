import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Renders the trailing circular arrow chip used on primary CTAs across the brand site. */
  withArrow?: boolean;
  loading?: boolean;
  asChild?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover",
  outline: "bg-transparent text-ink border border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink hover:bg-surface-2",
  destructive: "bg-danger text-primary-ink hover:opacity-90",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px] gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2.5",
};

const arrowSizeClasses: Record<Size, string> = {
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", withArrow, loading, asChild, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
        {withArrow && !loading && (
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full -mr-1",
              arrowSizeClasses[size],
              variant === "primary" ? "bg-primary-ink/15" : "bg-ink/8",
            )}
          >
            <ArrowRight className="size-3.5" strokeWidth={2.25} />
          </span>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
