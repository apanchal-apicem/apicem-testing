import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent-ink">{eyebrow}</p>
        )}
        <h1 className="font-display text-[22px] font-bold tracking-tight text-ink text-balance sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-xl text-[13.5px] text-ink-soft sm:text-[14px]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
