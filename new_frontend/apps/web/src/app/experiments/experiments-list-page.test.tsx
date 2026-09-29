import { describe, expect, it, vi } from "vitest";
import { screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@apicem/api-contract";
import { renderPage } from "@/test/render";
import { ExperimentsListPage } from "./experiments-list-page";

const mockUseCurrentUser = vi.fn();

// Every other hook (useExperiments, useDeleteExperiment, ...) stays the real
// implementation, running against the actual mock adapter — only the current
// user's role is swapped, so a role-gating test still exercises the real
// list/delete path end to end rather than a hand-mocked one.
vi.mock("@/api/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/api/hooks")>("@/api/hooks");
  return { ...actual, useCurrentUser: () => mockUseCurrentUser() };
});

function userWithRole(role: User["role"]): User {
  return { id: "usr_1", name: "Jordan Ellis", email: "jordan@apicemengine.com", role, avatarColor: "#000000" };
}

describe("ExperimentsListPage", () => {
  it("lists the workspace's seeded experiments with their status", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    renderPage(<ExperimentsListPage />);
    expect(await screen.findByText("Meta Ads Geo Holdout (West Region)")).toBeInTheDocument();
    expect(screen.getByText("Email Send Frequency (VIP Segment)")).toBeInTheDocument();
  });

  it("lets an owner delete an experiment after confirming, removing it from the list", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    const user = userEvent.setup();
    renderPage(<ExperimentsListPage />);
    await screen.findByText("Meta Ads Geo Holdout (West Region)");

    await user.click(screen.getByRole("button", { name: "More actions for Meta Ads Geo Holdout (West Region)" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText('Delete "Meta Ads Geo Holdout (West Region)"?')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitForElementToBeRemoved(() => screen.queryByText("Meta Ads Geo Holdout (West Region)"));
  });

  it("hides every card's actions menu for a viewer", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("viewer") });
    renderPage(<ExperimentsListPage />);
    await screen.findByText("Email Send Frequency (VIP Segment)");
    expect(screen.queryByRole("button", { name: /More actions for/ })).not.toBeInTheDocument();
  });
});
