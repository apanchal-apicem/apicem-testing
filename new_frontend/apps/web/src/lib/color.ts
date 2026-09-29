/** WCAG relative luminance and contrast ratio — the same math the accessibility guidelines use. */

export function relativeLuminance(r: number, g: number, b: number): number {
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r / 255) + 0.7152 * f(g / 255) + 0.0722 * f(b / 255);
}

export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Parses a `#rrggbb` string; returns null for anything else (e.g. a CSS custom property reference). */
export function hexLuminance(color: string): number | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex) return null;
  return relativeLuminance(
    parseInt(hex[1].slice(0, 2), 16),
    parseInt(hex[1].slice(2, 4), 16),
    parseInt(hex[1].slice(4, 6), 16),
  );
}

const WHITE_LUMINANCE = 1;
const DARK_INK_LUMINANCE = relativeLuminance(0x15, 0x14, 0x0f); // this app's --ink, light-theme value

/**
 * Avatar background colors are arbitrary per-person values (or the theme's
 * --accent token for the current user), chosen to give each person a
 * distinct identity — some read better with white initials, some with
 * dark, and no single fixed text color passes contrast against all of
 * them. Picking whichever of white/dark actually contrasts better against
 * *this* background, by the same luminance math WCAG contrast ratios use,
 * gets it right per color instead of guessing one default.
 */
export function initialsTextClass(color: string): string {
  const bgLuminance = hexLuminance(color);
  // A CSS custom property (var(--accent)) can't be resolved to a luminance
  // without a DOM read — every such value in this palette is a light
  // gold/tan in both themes, so dark text is always the right call for it.
  if (bgLuminance === null) return "text-ink";
  const whiteWins = contrastRatio(bgLuminance, WHITE_LUMINANCE) >= contrastRatio(bgLuminance, DARK_INK_LUMINANCE);
  return whiteWins ? "text-white" : "text-ink";
}
