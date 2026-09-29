import { describe, expect, it } from "vitest";
import { contrastRatio, hexLuminance, relativeLuminance } from "./color";

describe("relativeLuminance / contrastRatio", () => {
  it("gives white the maximum luminance and black the minimum", () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 5);
  });

  it("computes the textbook white-on-black ratio of 21:1", () => {
    expect(contrastRatio(relativeLuminance(255, 255, 255), relativeLuminance(0, 0, 0))).toBeCloseTo(21, 1);
  });

  it("is symmetric regardless of which color is passed first", () => {
    const a = relativeLuminance(80, 120, 200);
    const b = relativeLuminance(240, 240, 230);
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe("hexLuminance", () => {
  it("parses a #rrggbb string", () => {
    expect(hexLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("is case-insensitive", () => {
    expect(hexLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("returns null for anything that isn't a plain hex color, e.g. a CSS custom property", () => {
    expect(hexLuminance("var(--accent)")).toBeNull();
    expect(hexLuminance("rgba(0,0,0,0.5)")).toBeNull();
  });
});
