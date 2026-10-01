import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { ConnectSourcePage } from "./connect-source-page";

describe("ConnectSourcePage", () => {
  it("walks from picking a type to a connection name that defaults sensibly", async () => {
    const user = userEvent.setup();
    renderPage(<ConnectSourcePage />);

    expect(screen.getByText("Connect a source")).toBeInTheDocument();
    await user.click(screen.getByText("Shopify"));

    expect(await screen.findByText("Connect Shopify")).toBeInTheDocument();
    // The default connection-name placeholder should read naturally, not
    // carry a leftover separator from the connection-name generator.
    expect(
      screen.getByPlaceholderText("Shopify (production)"),
    ).toBeInTheDocument();
  });

  it("creates the source and loads its schema for the confirmation step", async () => {
    const user = userEvent.setup();
    renderPage(<ConnectSourcePage />);

    await user.click(screen.getByText("Shopify"));
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByText(/We scanned 2 tables/)).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
    expect(screen.getByText("products")).toBeInTheDocument();
  });
});
