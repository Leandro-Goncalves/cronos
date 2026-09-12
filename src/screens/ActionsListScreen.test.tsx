// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionsListScreen, type ActionSummary } from "./ActionsListScreen";

function makeAction(overrides: Partial<ActionSummary> = {}): ActionSummary {
  return {
    id: "a1",
    name: "Preencher relatório",
    targetApp: { name: "Notepad", iconPath: "C:\\notepad.exe" },
    steps: [{ type: "click" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

type IpcHandlers = Record<string, (...args: unknown[]) => unknown>;

function mockIpc(handlers: IpcHandlers) {
  const invoke = vi.fn((channel: string, ...args: unknown[]) => {
    const handler = handlers[channel];
    return Promise.resolve(handler ? handler(...args) : undefined);
  });
  Object.assign(window, {
    ipcRenderer: { invoke, on: vi.fn(), off: vi.fn(), send: vi.fn() },
  });
  return invoke;
}

describe("ActionsListScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("test_list_rendersNameAppAndStepCountPerRow", async () => {
    mockIpc({
      "actions:list": () => [
        makeAction({ id: "a1", name: "Ação 1", steps: [{ type: "click" }] }),
        makeAction({
          id: "a2",
          name: "Ação 2",
          steps: [{ type: "click" }, { type: "wait" }],
        }),
      ],
      "apps:icon": () => null,
    });

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );

    expect(await screen.findByText("Ação 1")).toBeInTheDocument();
    expect(screen.getByText("Ação 2")).toBeInTheDocument();
    expect(screen.getByText("Notepad · 1 passo")).toBeInTheDocument();
    expect(screen.getByText("Notepad · 2 passos")).toBeInTheDocument();
  });

  it("test_list_sortsByCreatedAtDescending", async () => {
    mockIpc({
      "actions:list": () => [
        makeAction({ id: "a1", name: "Mais antiga", createdAt: "2026-01-01T00:00:00.000Z" }),
        makeAction({ id: "a2", name: "Mais recente", createdAt: "2026-03-01T00:00:00.000Z" }),
        makeAction({ id: "a3", name: "Do meio", createdAt: "2026-02-01T00:00:00.000Z" }),
      ],
    });

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );

    await screen.findByText("Mais recente");
    const names = screen
      .getAllByTestId("action-row-name")
      .map((el) => el.textContent);
    expect(names).toEqual(["Mais recente", "Do meio", "Mais antiga"]);
  });

  it("test_list_emptyState_showsMessageAndHighlightedCta", async () => {
    mockIpc({ "actions:list": () => [] });

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );

    expect(await screen.findByText("Nenhuma ação criada ainda.")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Adicionar ação" })
    ).toHaveLength(2);
  });

  it("test_search_filtersByNameCaseInsensitiveSubstring", async () => {
    mockIpc({
      "actions:list": () => [
        makeAction({ id: "a1", name: "Preencher relatório" }),
        makeAction({ id: "a2", name: "Exportar planilha" }),
      ],
    });

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );

    await screen.findByText("Preencher relatório");
    fireEvent.change(screen.getByPlaceholderText("Buscar ação..."), {
      target: { value: "RELAT" },
    });

    expect(screen.getByText("Preencher relatório")).toBeInTheDocument();
    expect(screen.queryByText("Exportar planilha")).not.toBeInTheDocument();
  });

  it("test_rowClick_onNonIconArea_invokesOnExecuteWithId", async () => {
    mockIpc({ "actions:list": () => [makeAction({ id: "a1", name: "Ação alvo" })] });
    const onExecute = vi.fn();

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={onExecute} />
    );

    fireEvent.click(await screen.findByText("Ação alvo"));

    expect(onExecute).toHaveBeenCalledWith("a1");
  });

  it("test_editIcon_fetchesFullRecordAndInvokesOnEditWithIt", async () => {
    const fullRecord = { id: "a1", name: "Ação alvo", monitorId: 1 };
    const invoke = mockIpc({
      "actions:list": () => [makeAction({ id: "a1", name: "Ação alvo" })],
      "actions:get": (id) => (id === "a1" ? fullRecord : null),
    });
    const onEdit = vi.fn();

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={onEdit} onExecute={vi.fn()} />
    );

    await screen.findByText("Ação alvo");
    fireEvent.click(screen.getByLabelText("Editar Ação alvo"));

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith("a1", fullRecord);
    });
    expect(invoke).toHaveBeenCalledWith("actions:get", "a1");
  });

  it("test_deleteIcon_opensPlaceholderConfirmationNamingTheAction", async () => {
    const invoke = mockIpc({
      "actions:list": () => [makeAction({ id: "a1", name: "Ação para excluir" })],
    });

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );

    await screen.findByText("Ação para excluir");
    fireEvent.click(screen.getByLabelText("Excluir Ação para excluir"));

    const confirmation = screen.getByTestId("delete-confirmation");
    expect(confirmation).toHaveTextContent("Ação para excluir");
    expect(invoke).not.toHaveBeenCalledWith("actions:delete", expect.anything());
  });

  it("test_addButton_alwaysVisible_invokesOnCreate", async () => {
    mockIpc({ "actions:list": () => [makeAction()] });
    const onCreate = vi.fn();

    render(
      <ActionsListScreen onCreate={onCreate} onEdit={vi.fn()} onExecute={vi.fn()} />
    );

    await screen.findByText("Preencher relatório");
    const topButton = screen.getAllByRole("button", { name: "Adicionar ação" })[0];
    fireEvent.click(topButton);

    expect(onCreate).toHaveBeenCalled();
  });

  it("test_initialToast_rendersOnceThenClears", async () => {
    vi.useFakeTimers();
    mockIpc({ "actions:list": () => [] });
    const message = "Ação 'Preencher relatório' criada com sucesso.";

    const { rerender } = render(
      <ActionsListScreen
        initialToast={message}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onExecute={vi.fn()}
      />
    );

    expect(screen.getByText(message)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByText(message)).not.toBeInTheDocument();

    rerender(
      <ActionsListScreen
        initialToast={message}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onExecute={vi.fn()}
      />
    );

    expect(screen.queryByText(message)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("test_iconLoadFailure_fallsBackToGenericAppIcon", async () => {
    mockIpc({
      "actions:list": () => [makeAction({ id: "a1", name: "Ação sem ícone" })],
      "apps:icon": () => null,
    });

    const { container } = render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );

    await screen.findByText("Ação sem ícone");

    await waitFor(() => {
      expect(container.querySelector(".lucide-app-window")).not.toBeNull();
    });
    expect(container.querySelector("img")).toBeNull();
  });

  it("test_integration_actionPersistedByF01AppearsInListWithCorrectFields", async () => {
    mockIpc({
      "actions:list": () => [
        {
          id: "3f2e1a70-9b34-4c3e-8f10-2f6b0e1a9c21",
          name: "Preencher relatório",
          targetApp: { name: "Notepad", iconPath: "C:\\Windows\\System32\\notepad.exe" },
          steps: [{ type: "click" }, { type: "wait" }],
          createdAt: "2026-09-12T14:32:00.000Z",
        },
      ],
    });

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );

    expect(await screen.findByText("Preencher relatório")).toBeInTheDocument();
    expect(screen.getByText("Notepad · 2 passos")).toBeInTheDocument();
  });

  it("test_integration_editForwardsExactStoredRecordForF03Prefill", async () => {
    const storedRecord = {
      id: "a1",
      name: "Preencher relatório",
      monitorId: 1,
      monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      targetApp: { name: "Notepad", path: "C:\\Notepad.lnk", iconPath: "C:\\notepad.exe" },
    };
    mockIpc({
      "actions:list": () => [makeAction({ id: "a1", name: "Preencher relatório" })],
      "actions:get": () => storedRecord,
    });
    const onEdit = vi.fn();

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={onEdit} onExecute={vi.fn()} />
    );

    await screen.findByText("Preencher relatório");
    fireEvent.click(screen.getByLabelText("Editar Preencher relatório"));

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith("a1", storedRecord);
    });
  });

  it("test_integration_listRefreshesAfterReturnSoDeletedActionIsGone", async () => {
    let call = 0;
    mockIpc({
      "actions:list": () => {
        call += 1;
        return call === 1
          ? [
              makeAction({ id: "a1", name: "Ação 1" }),
              makeAction({ id: "a2", name: "Ação 2" }),
            ]
          : [makeAction({ id: "a1", name: "Ação 1" })];
      },
    });

    const { unmount } = render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );
    await screen.findByText("Ação 2");
    unmount();

    render(
      <ActionsListScreen onCreate={vi.fn()} onEdit={vi.fn()} onExecute={vi.fn()} />
    );
    await screen.findByText("Ação 1");
    expect(screen.queryByText("Ação 2")).not.toBeInTheDocument();
  });
});
