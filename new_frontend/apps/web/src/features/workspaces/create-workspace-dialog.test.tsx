import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";

const mutateAsync = vi
  .fn()
  .mockResolvedValue({ id: "wksp_new", name: "Acme Co", slug: "acme-co", plan: "starter", memberCount: 1 });

vi.mock("@/api/hooks", () => ({
  useCreateWorkspace: () => ({ mutateAsync, isPending: false }),
}));

describe("CreateWorkspaceDialog", () => {
  it("disables Create until a name is entered, and submits the trimmed name", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<CreateWorkspaceDialog open onOpenChange={() => {}} onCreated={onCreated} />);

    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText("Workspace name"), "  Acme Co  ");
    expect(createButton).toBeEnabled();

    await user.click(createButton);

    expect(mutateAsync).toHaveBeenCalledWith({ name: "Acme Co" });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});
