import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { User, Workspace } from "@apicem/api-contract";
import { SettingsPage } from "./settings-page";

const workspace: Workspace = {
  id: "wksp_1",
  name: "Test Workspace",
  slug: "test-workspace",
  plan: "growth",
  memberCount: 3,
};

function userWithRole(role: User["role"]): User {
  return {
    id: "usr_1",
    name: "Jordan Ellis",
    email: "jordan@apicemengine.com",
    role,
    avatarColor: "#000000",
  };
}

const mockUseCurrentUser = vi.fn();
const mockUseTeamMembers = vi.fn();
const mockUpdateMemberRole = vi.fn();

vi.mock("@/api/hooks", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
  useCurrentWorkspace: () => ({ data: workspace }),
  useDataSources: () => ({ data: [] }),
  useTeamMembers: () => mockUseTeamMembers(),
  useUpdateWorkspace: () => ({
    mutateAsync: async (name: string) => ({ ...workspace, name }),
    isPending: false,
  }),
  useUpdateProfile: () => ({
    mutateAsync: async (name: string) => ({ ...userWithRole("owner"), name }),
    isPending: false,
  }),
  useChangePassword: () => ({
    mutateAsync: async () => undefined,
    isPending: false,
  }),
  useUpdateMemberRole: () => ({ mutate: mockUpdateMemberRole, isError: false }),
  useAddTeamMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveTeamMember: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
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
      expect(
        screen.queryByRole("tab", { name: "Demo data" }),
      ).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("Email")).toHaveValue(
      "jordan@apicemengine.com",
    );

    await user.type(screen.getByLabelText("Current password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "new-password-1");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new-password-2",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("New passwords don't match.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new-password-1",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Password updated.")).toBeInTheDocument();
    expect(
      screen.queryByText("New passwords don't match."),
    ).not.toBeInTheDocument();
  });

  it("persists a profile name through the update mutation", async () => {
    const user = userEvent.setup();
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    renderSettings();

    await user.click(screen.getByRole("tab", { name: "Account" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Jordan Updated");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
  });
});

describe("SettingsPage — General tab", () => {
  it("saves a workspace name through the update mutation", async () => {
    const user = userEvent.setup();
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    renderSettings();

    await user.clear(screen.getByLabelText("Workspace name"));
    await user.type(
      screen.getByLabelText("Workspace name"),
      "Renamed Workspace",
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Workspace name saved."),
    ).toBeInTheDocument();
  });
});

describe("SettingsPage — Members tab", () => {
  it("sends role changes through the API mutation", async () => {
    const user = userEvent.setup();
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    mockUseTeamMembers.mockReturnValue({
      data: [
        userWithRole("owner"),
        { ...userWithRole("viewer"), id: "usr_2", name: "Sam" },
      ],
    });
    mockUpdateMemberRole.mockReset();
    renderSettings();

    await user.click(screen.getByRole("tab", { name: "Members" }));
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Editor" }));

    expect(mockUpdateMemberRole).toHaveBeenCalledWith({
      userId: "usr_2",
      role: "editor",
    });
  });
});
