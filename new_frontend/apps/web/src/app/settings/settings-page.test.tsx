import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { User, Workspace } from "@apicem/api-contract";
import { SettingsPage } from "./settings-page";

const workspace: Workspace = { id: "wksp_1", name: "Test Workspace", slug: "test-workspace", plan: "growth", memberCount: 3 };

function userWithRole(role: User["role"]): User {
  return { id: "usr_1", name: "Jordan Ellis", email: "jordan@apicemengine.com", role, avatarColor: "#000000" };
}

const mockUseCurrentUser = vi.fn();

vi.mock("@/api/hooks", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
  useCurrentWorkspace: () => ({ data: workspace }),
  useDataSources: () => ({ data: [] }),
  useTeamMembers: () => ({ data: [] }),
}));

vi.mock("@/api/client", () => ({ isMockMode: true }));
vi.mock("@/api/mock/adapter", () => ({ resetMockData: vi.fn() }));

function renderSettings() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

/**
 * Regression test for the fix in the previous session: the "Demo data" tab
 * (a one-click wipe of every workspace's data) was originally visible to
 * every role. A workspace that models per-membership roles everywhere else
 * shouldn't hand its single most destructive control to a viewer or editor
 * the same as an owner — this only stays true if something keeps testing it
 * after the next refactor touches Settings.
 */
describe("SettingsPage — Demo data tab visibility", () => {
  it("shows Demo data for the owner role", () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    renderSettings();
    expect(screen.getByRole("tab", { name: "Demo data" })).toBeInTheDocument();
  });

  it("hides Demo data for an admin, editor, or viewer", () => {
    for (const role of ["admin", "editor", "viewer"] as const) {
      mockUseCurrentUser.mockReturnValue({ data: userWithRole(role) });
      const { unmount } = render(
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>,
      );
      expect(screen.queryByRole("tab", { name: "Demo data" })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("SettingsPage — Account tab", () => {
  it("lets a logged-in user change their password, catching a mismatched confirmation first", async () => {
    const user = userEvent.setup();
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("editor") });
    renderSettings();

    await user.click(screen.getByRole("tab", { name: "Account" }));
    expect(screen.getByLabelText("Email")).toHaveValue("jordan@apicemengine.com");

    await user.type(screen.getByLabelText("Current password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "new-password-1");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-2");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("New passwords don't match.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Password updated.")).toBeInTheDocument();
    expect(screen.queryByText("New passwords don't match.")).not.toBeInTheDocument();
  });
});
