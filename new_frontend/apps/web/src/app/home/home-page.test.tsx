import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { HomePage } from "./home-page";

describe("HomePage", () => {
  it("renders the signed-in user's greeting and the seeded workbooks/reports/experiments/sources", async () => {
    renderPage(<HomePage />);

    expect(await screen.findByText("Good to see you, Jordan")).toBeInTheDocument();
    expect(await screen.findByText("Revenue Overview")).toBeInTheDocument();
    expect(await screen.findByText("Board Deck (Q3)")).toBeInTheDocument();
    expect(await screen.findByText("Meta Ads Geo Holdout (West Region)")).toBeInTheDocument();
    expect(await screen.findByText("Shopify: Storefront")).toBeInTheDocument();
  });
});
