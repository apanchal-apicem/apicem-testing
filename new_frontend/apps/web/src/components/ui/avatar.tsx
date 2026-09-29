import { cn } from "@/lib/utils";
import { initialsTextClass } from "@/lib/color";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  color,
  size = 32,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const bg = color ?? "var(--ink-faint)";
  return (
    // There's no image source here, only styled initials standing in for
    // one, so role="img" is the correct WAI-ARIA pattern for exposing a
    // single accessible name for content like this, not something a real
    // <img> could do instead (there's nothing to put in its src).
    <span
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={name}
      title={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", initialsTextClass(bg), className)}
      style={{ width: size, height: size, fontSize: size * 0.38, backgroundColor: bg }}
    >
      {initials(name)}
    </span>
  );
}
