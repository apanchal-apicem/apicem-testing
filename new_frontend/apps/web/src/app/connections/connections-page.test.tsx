import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { ConnectionsPage } from "./connections-page";

describe("ConnectionsPage", () => {
  it("lists the workspace's seeded data sources, including the one in an error state", async () => {
    renderPage(<ConnectionsPage />);
    expect(await screen.findByText("Shopify: Storefront")).toBeInTheDocument();
    expect(screen.getByText("Product Events DB")).toBeInTheDocument();
    // Shown both as a badge and inside the status dot's label.
    expect(screen.getAllByText("Needs attention").length).toBeGreaterThanOrEqual(1);
  });
});
