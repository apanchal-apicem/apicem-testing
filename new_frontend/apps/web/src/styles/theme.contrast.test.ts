import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "@/lib/color";

/**
 * Regression test for the color-contrast audit: reads the real
 * theme.css tokens (not a copy hardcoded here, which could drift) and
 * checks every meaningful text/background and UI-boundary pairing against
 * its real WCAG 2.x minimum. This is the test that would have caught the
 * original bug (ink-faint and border-strong both failed their thresholds
 * in both themes; white text failed against success/danger fills in dark
 * mode) before it shipped, and stops a future token edit from silently
 * reintroducing it.
 *
 * Read directly off disk with `node:fs` rather than a Vite `?raw` import:
 * this project's Tailwind plugin processes every .css file it sees
 * (including ones with a `?raw` query), so a raw import here isn't
 * guaranteed to return the file's actual on-disk text.
 */

const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "theme.css");
const css = readFileSync(cssPath, "utf8");

function extractBlock(css: string, selectorLiteral: string): string {
  const start = css.indexOf(selectorLiteral);
  if (start === -1) throw new Error(`selector not found in theme.css: ${selectorLiteral}`);
  const braceStart = css.indexOf("{", start);
  const braceEnd = css.indexOf("}", braceStart);
  return css.slice(braceStart, braceEnd);
}

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const lightTokens = tokens(extractBlock(css, ":root {"));
const darkTokens = tokens(extractBlock(css, ':root[data-theme="dark"]'));

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function parseRgbaOrHex(value: string): [number, number, number, number] {
  if (value.startsWith("#")) return [...hexToRgb(value), 1];
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(value)!;
  return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
}
/** Alpha-composites a possibly-translucent token color over an opaque hex backdrop. */
function flatten(fg: string, backdropHex: string): [number, number, number] {
  const [fr, fg_, fb, fa] = parseRgbaOrHex(fg);
  const [br, bg, bb] = hexToRgb(backdropHex);
  return fa === 1 ? [fr, fg_, fb] : [fr * fa + br * (1 - fa), fg_ * fa + bg * (1 - fa), fb * fa + bb * (1 - fa)];
}
function luminanceOf(rgb: [number, number, number]): number {
  return relativeLuminance(rgb[0], rgb[1], rgb[2]);
}

// [label, foreground resolver, background resolver, minimum ratio]
type ThemeTokens = typeof lightTokens;
const checks: [string, (t: ThemeTokens) => [number, number, number], (t: ThemeTokens) => [number, number, number], number][] = [
  ["ink on bg", (t) => hexToRgb(t.ink), (t) => hexToRgb(t.bg), 4.5],
  ["ink on surface", (t) => hexToRgb(t.ink), (t) => hexToRgb(t.surface), 4.5],
  ["ink-soft on bg", (t) => hexToRgb(t["ink-soft"]), (t) => hexToRgb(t.bg), 4.5],
  ["ink-soft on surface", (t) => hexToRgb(t["ink-soft"]), (t) => hexToRgb(t.surface), 4.5],
  ["ink-faint on bg", (t) => hexToRgb(t["ink-faint"]), (t) => hexToRgb(t.bg), 4.5],
  ["ink-faint on surface", (t) => hexToRgb(t["ink-faint"]), (t) => hexToRgb(t.surface), 4.5],
  ["ink-faint on surface-2", (t) => hexToRgb(t["ink-faint"]), (t) => hexToRgb(t["surface-2"]), 4.5],
  ["primary-ink on primary", (t) => hexToRgb(t["primary-ink"]), (t) => hexToRgb(t.primary), 4.5],
  ["primary-ink on success (icon/button fills)", (t) => hexToRgb(t["primary-ink"]), (t) => hexToRgb(t.success), 4.5],
  ["primary-ink on danger (icon/button fills)", (t) => hexToRgb(t["primary-ink"]), (t) => hexToRgb(t.danger), 4.5],
  ["accent-ink on accent-soft badge (over surface)", (t) => hexToRgb(t["accent-ink"]), (t) => flatten(t["accent-soft"], t.surface), 4.5],
  ["success text on success-soft badge (over surface)", (t) => hexToRgb(t.success), (t) => flatten(t["success-soft"], t.surface), 4.5],
  ["danger text on danger-soft badge (over surface)", (t) => hexToRgb(t.danger), (t) => flatten(t["danger-soft"], t.surface), 4.5],
  ["info text on info-soft badge (over surface)", (t) => hexToRgb(t.info), (t) => flatten(t["info-soft"], t.surface), 4.5],
  ["border-strong on surface (input/UI boundary)", (t) => hexToRgb(t["border-strong"]), (t) => hexToRgb(t.surface), 3],
  ["accent focus ring on surface", (t) => hexToRgb(t.accent), (t) => hexToRgb(t.surface), 3],
];

describe.each([
  ["light", lightTokens],
  ["dark", darkTokens],
])("%s theme tokens meet WCAG AA", (_themeName, themeTokens) => {
  it.each(checks)("%s", (_label, fg, bg, min) => {
    const ratio = contrastRatio(luminanceOf(fg(themeTokens)), luminanceOf(bg(themeTokens)));
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});
