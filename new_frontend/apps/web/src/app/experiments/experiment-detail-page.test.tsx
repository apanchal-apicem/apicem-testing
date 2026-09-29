import { describe, expect, it, vi } from "vitest";
import { screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@apicem/api-contract";
import { renderPage } from "@/test/render";
import { ExperimentDetailPage } from "./experiment-detail-page";

const mockUseCurrentUser = vi.fn();

// Every other hook stays the real implementation, running against the actual
// mock adapter — only the current user's role is swapped, so a role-gating
// test still exercises the real delete path end to end.
vi.mock("@/api/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/api/hooks")>("@/api/hooks");
  return { ...actual, useCurrentUser: () => mockUseCurrentUser() };
});

function userWithRole(role: User["role"]): User {
  return { id: "usr_1", name: "Jordan Ellis", email: "jordan@apicemengine.com", role, avatarColor: "#000000" };
}

describe("ExperimentDetailPage", () => {
  it("renders a completed experiment's result, including the metric name in the chart caption", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    renderPage(<ExperimentDetailPage />, {
      path: "/experiments/:experimentId",
      route: "/experiments/exp_meta_geo_holdout",
    });

    expect(await screen.findByText("Meta Ads Geo Holdout (West Region)")).toBeInTheDocument();
    expect(screen.getByText("+8.4%")).toBeInTheDocument();
    // The metric name and ": treatment vs. holdout" render as separate text
    // nodes from the same JSX expression, so check the caption's full text
    // via its containing element rather than a single getByText regex.
    expect(await screen.findByText("Net Revenue", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/treatment vs\. holdout/)).toBeInTheDocument();
  });

  it("shows a 'no results yet' empty state for a draft experiment with no result", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    renderPage(<ExperimentDetailPage />, {
      path: "/experiments/:experimentId",
      route: "/experiments/exp_google_pause",
    });

    expect(await screen.findByText("No results yet")).toBeInTheDocument();
  });

  it("offers an Edit action for both a draft and a completed experiment", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    const draft = renderPage(<ExperimentDetailPage />, {
      path: "/experiments/:experimentId",
      route: "/experiments/exp_google_pause",
    });
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    draft.unmount();

    renderPage(<ExperimentDetailPage />, {
      path: "/experiments/:experimentId",
      route: "/experiments/exp_meta_geo_holdout",
    });
    await screen.findByText("Meta Ads Geo Holdout (West Region)");
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("lets an owner delete an experiment after confirming, navigating back to the list", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    const user = userEvent.setup();
    renderPage(<ExperimentDetailPage />, {
      path: "/experiments/:experimentId",
      route: "/experiments/exp_email_frequency",
    });
    await screen.findByText("Email Send Frequency (VIP Segment)");

    await user.click(screen.getByRole("button", { name: "More actions for Email Send Frequency (VIP Segment)" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText('Delete "Email Send Frequency (VIP Segment)"?')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitForElementToBeRemoved(() => screen.queryByText("Email Send Frequency (VIP Segment)"));
  });

  it("hides Edit and the actions menu for a viewer", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("viewer") });
    renderPage(<ExperimentDetailPage />, {
      path: "/experiments/:experimentId",
      route: "/experiments/exp_meta_geo_holdout",
    });
    await screen.findByText("Meta Ads Geo Holdout (West Region)");

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More actions for/ })).not.toBeInTheDocument();
  });

  it("edits a draft experiment's name and saves it, updating the page in place", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    const user = userEvent.setup();
    renderPage(<ExperimentDetailPage />, {
      path: "/experiments/:experimentId",
      route: "/experiments/exp_google_pause",
    });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const nameInput = await screen.findByLabelText("Experiment name");
    expect(nameInput).toHaveValue("Google Ads Pause Test (Brand Terms)");
    await user.clear(nameInput);
    await user.type(nameInput, "Google Ads Pause Test (Extended)");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("heading", { name: "Google Ads Pause Test (Extended)" })).toBeInTheDocument();
  });

  it("edits a completed experiment's name too, with a warning that it changes what already happened", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    const user = userEvent.setup();
    renderPage(<ExperimentDetailPage />, {
      path: "/experiments/:experimentId",
      route: "/experiments/exp_meta_geo_holdout",
    });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByText(/rewrites what it's set up to measure/)).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Experiment name");
    await user.clear(nameInput);
    await user.type(nameInput, "Meta Ads Geo Holdout (Renamed)");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("heading", { name: "Meta Ads Geo Holdout (Renamed)" })).toBeInTheDocument();
  });
});
