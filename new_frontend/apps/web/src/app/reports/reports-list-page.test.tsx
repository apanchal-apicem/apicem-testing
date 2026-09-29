import { describe, expect, it, vi } from "vitest";
import { screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@apicem/api-contract";
import { renderPage } from "@/test/render";
import { ReportsListPage } from "./reports-list-page";

const mockUseCurrentUser = vi.fn();

// Every other hook (useReports, useCreateReport, useDeleteReport, ...) stays
// the real implementation, running against the actual mock adapter — only
// the current user's role is swapped, so a role-gating test still exercises
// the real create/list/delete path end to end rather than a hand-mocked one.
vi.mock("@/api/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/api/hooks")>("@/api/hooks");
  return { ...actual, useCurrentUser: () => mockUseCurrentUser() };
});

function userWithRole(role: User["role"]): User {
  return { id: "usr_1", name: "Jordan Ellis", email: "jordan@apicemengine.com", role, avatarColor: "#000000" };
}

describe("ReportsListPage", () => {
  it("lists the workspace's seeded reports", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    renderPage(<ReportsListPage />);
    expect(await screen.findByText("Board Deck (Q3)")).toBeInTheDocument();
    expect(await screen.findByText("Weekly Ops Snapshot")).toBeInTheDocument();
  });

  it("lets an owner delete a report after confirming, removing it from the list", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    const user = userEvent.setup();
    renderPage(<ReportsListPage />);
    await screen.findByText("Weekly Ops Snapshot");

    await user.click(screen.getByRole("button", { name: "More actions for Weekly Ops Snapshot" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText('Delete "Weekly Ops Snapshot"?')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitForElementToBeRemoved(() => screen.queryByText("Weekly Ops Snapshot"));
  });

  it("hides every card's actions menu for a viewer", async () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("viewer") });
    renderPage(<ReportsListPage />);
    await screen.findByText("Board Deck (Q3)");
    expect(screen.queryByRole("button", { name: /More actions for/ })).not.toBeInTheDocument();
  });
});
