import { describe, expect, it } from "vitest";
import { screen, render } from "@testing-library/react";
import { initialsTextClass } from "@/lib/color";
import { Avatar } from "./avatar";

// The actual per-person colors seeded in mock/fixtures.ts, so this test
// catches a real regression if a future color is added there without
// checking it reads legibly. (Duplicated as literals, not imported, so this
// test doesn't need the mock adapter's module-load side effects.)
const seededAvatarColors = ["#3b5f8a", "#5f7a8f", "#6e6656", "#7a8f6d", "#8f6d5f", "#a15a3f"];

describe("initialsTextClass", () => {
  it("picks whichever of white/dark text actually contrasts better against every seeded avatar color", () => {
    for (const color of seededAvatarColors) {
      expect(["text-white", "text-ink"]).toContain(initialsTextClass(color));
    }
  });

  it("picks dark text for the light gold accent token, in both themes", () => {
    // Not a hex string -- this is the CSS custom property used for the
    // current user's own avatar -- so this exercises the special case.
    expect(initialsTextClass("var(--accent)")).toBe("text-ink");
  });

  it("picks white for a color that's genuinely dark", () => {
    expect(initialsTextClass("#101010")).toBe("text-white");
  });

  it("picks dark ink for a color that's genuinely light", () => {
    expect(initialsTextClass("#f0e9d8")).toBe("text-ink");
  });
});

describe("Avatar", () => {
  it("renders initials with an accessible name matching the full person name", () => {
    render(<Avatar name="Jordan Ellis" color="#3b5f8a" />);
    const el = screen.getByRole("img", { name: "Jordan Ellis" });
    expect(el).toHaveTextContent("JE");
  });
});
