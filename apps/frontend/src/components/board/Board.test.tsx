import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Board } from "./Board";

// Mock all external dependencies
vi.mock("@/hooks/queries", () => ({
  useTickets: () => ({ data: [], isLoading: false, error: null }),
  useProjectPhases: () => ({ data: ["Ideas", "Build", "Done"] }),
  useTemplate: () => ({ data: { phases: [] } }),
  useProjects: () => ({
    data: [{ id: "test-project", template: { name: "product-development" } }],
  }),
  useUpdateTicket: () => ({ mutate: vi.fn() }),
  useToggleDisabledPhase: () => ({ mutate: vi.fn() }),
  useToggleAutomatedPhase: () => ({ mutate: vi.fn() }),
  useUpdateProject: () => ({ mutate: vi.fn() }),
  useProjectBranch: () => ({ data: null }),
}));

vi.mock("@/stores/appStore", () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      boardViewMode: "kanban",
      openAddTicketModal: vi.fn(),
      showArchivedTickets: false,
    }),
}));

vi.mock("@/components/TemplateUpgradeBanner", () => ({
  TemplateUpgradeBanner: () => null,
}));

vi.mock("./ArchivedSwimlane", () => ({
  ArchivedSwimlane: () => null,
}));

vi.mock("./BoardColumn", () => ({
  BoardColumn: ({
    phase,
    showAddTicket,
  }: {
    phase: string;
    showAddTicket?: boolean;
  }) => (
    <div
      data-testid={`board-column-${phase}`}
      data-show-add-ticket={String(!!showAddTicket)}
    >
      {phase}
    </div>
  ),
}));

vi.mock("./BrainstormColumn", () => ({
  BrainstormColumn: () => <div data-testid="brainstorm-column">Brainstorm</div>,
}));

vi.mock("./TicketCard", () => ({
  TicketCard: () => null,
}));

vi.mock("./ViewToggle", () => ({
  ViewToggle: () => <div data-testid="view-toggle">ViewToggle</div>,
}));

vi.mock("./TableView", () => ({
  TableView: () => null,
}));

// Mock window.matchMedia (needed for Radix UI components)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("Board - Add Ticket button placement", () => {
  it("does not render an Add Ticket button in the board header", () => {
    render(<Board projectId="test-project" />);

    // The board header should NOT contain an "Add Ticket" button
    const addTicketButton = screen.queryByRole("button", {
      name: /add ticket/i,
    });
    expect(addTicketButton).toBeFalsy();
  });

  it("passes showAddTicket=true to the Ideas (first phase) column", () => {
    render(<Board projectId="test-project" />);

    // Find the Ideas column in the kanban view (the one with data-testid in the flex container)
    const ideasColumns = screen.getAllByTestId("board-column-Ideas");
    // There may be multiple due to different view modes - check the kanban view one
    const kanbanIdeasColumn = ideasColumns.find(
      (col) => col.dataset.showAddTicket !== undefined,
    );

    expect(kanbanIdeasColumn?.dataset.showAddTicket).toBe("true");
  });

  it("passes showAddTicket=false to non-Ideas columns", () => {
    render(<Board projectId="test-project" />);

    // Find columns in kanban view
    const buildColumns = screen.getAllByTestId("board-column-Build");
    const buildColumn = buildColumns.find(
      (col) => col.dataset.showAddTicket !== undefined,
    );
    expect(buildColumn?.dataset.showAddTicket).toBe("false");

    const doneColumns = screen.getAllByTestId("board-column-Done");
    const doneColumn = doneColumns.find(
      (col) => col.dataset.showAddTicket !== undefined,
    );
    expect(doneColumn?.dataset.showAddTicket).toBe("false");
  });

  it("does not render a separate board header row", () => {
    const { container } = render(<Board projectId="test-project" />);

    // Board no longer has a separate header div — content is inline in columns
    const header = container.querySelector(".px-4.py-3");
    expect(header).toBeNull();
  });
});
