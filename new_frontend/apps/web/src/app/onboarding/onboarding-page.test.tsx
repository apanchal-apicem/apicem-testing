import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { OnboardingPage } from "./onboarding-page";

describe("OnboardingPage", () => {
  afterEach(() => {
    window.localStorage.removeItem("apicem.onboardingComplete");
  });

  it("renders all four steps and the skip link", () => {
    renderPage(<OnboardingPage />);
    // The step title and its button share the same text ("Connect a source"),
    // so there are two matches for step 1 specifically.
    expect(
      screen.getAllByText("Connect a source").length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Explore your data")).toBeInTheDocument();
    expect(screen.getByText("Test it for real")).toBeInTheDocument();
    expect(screen.getByText("Build a report")).toBeInTheDocument();
    expect(
      screen.getByText("Skip, take me straight to the workspace"),
    ).toBeInTheDocument();
  });

  it("marks onboarding complete when the user skips to the workspace", async () => {
    const user = userEvent.setup();
    renderPage(<OnboardingPage />);

    await user.click(
      screen.getByRole("button", {
        name: "Skip, take me straight to the workspace",
      }),
    );

    expect(window.localStorage.getItem("apicem.onboardingComplete")).toBe("1");
  });
});
