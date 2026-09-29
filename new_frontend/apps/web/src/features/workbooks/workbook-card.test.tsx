import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { User, Workbook } from "@apicem/api-contract";
import { WorkbookCard } from "./workbook-card";

function userWithRole(role: User["role"]): User {
  return { id: "usr_1", name: "Jordan Ellis", email: "jordan@apicemengine.com", role, avatarColor: "#000000" };
}

const mockUseCurrentUser = vi.fn();
const deleteWorkbookMutate = vi.fn();
const deleteReportMutate = vi.fn();

vi.mock("@/api/hooks", () => ({
  queryKeys: { report: (id: string) => ["report", id], workbook: (id: string) => ["workbook", id] },
  useCurrentUser: () => mockUseCurrentUser(),
  useDeleteWorkbook: () => ({ mutate: deleteWorkbookMutate, isPending: false }),
  useDeleteReport: () => ({ mutate: deleteReportMutate, isPending: false }),
}));

vi.mock("@/api/client", () => ({ apiClient: { getReport: vi.fn(), getWorkbook: vi.fn() } }));
vi.mock("@/api/query-client", () => ({ queryClient: { prefetchQuery: vi.fn() } }));
vi.mock("@/route-preload", () => ({ preloadExplorePage: vi.fn(), preloadReportViewPage: vi.fn() }));

const exploration: Workbook = {
  id: "wb_1",
  name: "Cohort Retention",
  kind: "workbook",
  ownerId: "usr_1",
  updatedAt: new Date().toISOString(),
  views: 4,
};

function renderCard(workbook: Workbook) {
  return render(
    <MemoryRouter>
      <WorkbookCard workbook={workbook} />
    </MemoryRouter>,
  );
}

describe("WorkbookCard", () => {
  it("lets an editor delete an exploration after confirming", async () => {
    const user = userEvent.setup();
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("editor") });
    renderCard(exploration);

    await user.click(screen.getByRole("button", { name: `More actions for ${exploration.name}` }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText(`Delete "${exploration.name}"?`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteWorkbookMutate).toHaveBeenCalledWith(exploration.id, expect.anything());
    expect(deleteReportMutate).not.toHaveBeenCalled();
  });

  it("hides the actions menu entirely for a viewer — no way to reach delete at all", () => {
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("viewer") });
    renderCard(exploration);
    expect(screen.queryByRole("button", { name: `More actions for ${exploration.name}` })).not.toBeInTheDocument();
  });

  it("deletes a report card through deleteReport, not deleteWorkbook — a report has no stored workbook row of its own", async () => {
    const user = userEvent.setup();
    mockUseCurrentUser.mockReturnValue({ data: userWithRole("owner") });
    const report: Workbook = { ...exploration, id: "rpt_1", kind: "report", name: "Board Deck" };
    renderCard(report);

    await user.click(screen.getByRole("button", { name: `More actions for ${report.name}` }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteReportMutate).toHaveBeenCalledWith(report.id, expect.anything());
    expect(deleteWorkbookMutate).not.toHaveBeenCalled();
  });
});
