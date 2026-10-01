import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { User, Workspace } from "@apicem/api-contract";
import { SettingsPage } from "./settings-page";

const workspace: Workspace = {
  id: "workspace_1",
  name: "Workspace",
  slug: "workspace-stable",
  plan: "starter",
  memberCount: 2,
};

const editor: User = {
  id: "user_1",
  name: "Editor",
  email: "editor@example.com",
  role: "editor",
  avatarColor: "#000000",
};

vi.mock("@/api/hooks", () => ({
  useCurrentUser: () => ({ data: editor }),
  useCurrentWorkspace: () => ({ data: workspace }),
  useDataSources: () => ({ data: [{ id: "source_1" }] }),
  useTeamMembers: () => ({ data: [] }),
  useUpdateWorkspace: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMemberRole: () => ({ mutate: vi.fn(), isError: false }),
}));

vi.mock("@/api/client", () => ({ isMockMode: false }));
vi.mock("@/api/mock/adapter", () => ({ resetMockData: vi.fn() }));

describe("Settings access and usage states", () => {
  it("keeps workspace rename read-only for an editor and explains the stable URL", () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);

    expect(screen.getByLabelText("Workspace name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByText("Only workspace owners and admins can change workspace details.")).toBeInTheDocument();
    expect(screen.getByText("This stable workspace URL does not change when you rename the workspace.")).toBeInTheDocument();
  });

  it("does not present unavailable plan limits as enforceable quotas", () => {
    render(<MemoryRouter initialEntries={["/settings?tab=usage"]}><SettingsPage /></MemoryRouter>);

    expect(screen.getAllByText("Current workspace count. Plan limits are not configured yet.")).toHaveLength(2);
    expect(screen.queryByText(/\/ 10/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/ 15/)).not.toBeInTheDocument();
  });
});
