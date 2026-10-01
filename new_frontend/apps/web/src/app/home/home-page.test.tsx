import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { mockClient } from "@/api/mock/adapter";
import { HomePage } from "./home-page";

describe("HomePage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the signed-in user's greeting and the seeded workbooks/reports/experiments/sources", async () => {
    renderPage(<HomePage />);

    expect(
      await screen.findByText("Good to see you, Jordan"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Revenue Overview")).toBeInTheDocument();
    expect(await screen.findByText("Board Deck (Q3)")).toBeInTheDocument();
    expect(
      await screen.findByText("Meta Ads Geo Holdout (West Region)"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Shopify: Storefront")).toBeInTheDocument();
  });

  it("shows an API error instead of treating a failed workbooks request as an empty workspace", async () => {
    vi.spyOn(mockClient, "listWorkbooks").mockRejectedValueOnce(
      new Error("service unavailable"),
    );
    renderPage(<HomePage />);

    expect(
      await screen.findByText("Saved work couldn't load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No saved work yet")).not.toBeInTheDocument();
  });
});
