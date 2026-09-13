// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

type IpcListener = (event: unknown, ...args: unknown[]) => void;

const oneMonitor = [
  { id: 1, label: "Monitor 1 (principal)", bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
];

const oneApp = [
  { name: "Notepad", path: "C:\\Notepad.lnk", iconPath: "C:\\notepad.exe" },
];

function mockIpc(
  actionsList: unknown[] = [],
  actionsGet: unknown = null,
  actionsGetById: Record<string, unknown> = {},
  executionResult: unknown = { success: true, actionName: "Ação alvo" },
  actionsSaveResult: unknown = { success: true, action: {} }
) {
  const listeners: Record<string, IpcListener[]> = {};
  const invoke = vi.fn((channel: string, ...args: unknown[]) => {
    if (channel === "actions:list") return Promise.resolve(actionsList);
    if (channel === "actions:get") {
      const id = args[0] as string;
      if (id in actionsGetById) return Promise.resolve(actionsGetById[id]);
      return Promise.resolve(actionsGet);
    }
    if (channel === "displays:list") return Promise.resolve(oneMonitor);
    if (channel === "apps:list") return Promise.resolve(oneApp);
    if (channel === "apps:icon") return Promise.resolve(null);
    if (channel === "execution:run") return Promise.resolve(executionResult);
    if (channel === "actions:save") return Promise.resolve(actionsSaveResult);
    return Promise.resolve(undefined);
  });
  const on = vi.fn((channel: string, listener: IpcListener) => {
    listeners[channel] = listeners[channel] ?? [];
    listeners[channel].push(listener);
  });
  const off = vi.fn();
  Object.assign(window, { ipcRenderer: { invoke, on, off, send: vi.fn() } });
  return {
    invoke,
    emit(channel: string, ...args: unknown[]) {
      for (const listener of listeners[channel] ?? []) {
        listener({}, ...args);
      }
    },
  };
}

function sampleAction(id: string, name: string) {
  return {
    id,
    name,
    targetApp: { name: "Notepad", iconPath: "C:\\notepad.exe" },
    steps: [{ id: "s1", type: "click" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function storedFullRecord(id: string, name: string) {
  return {
    id,
    name,
    monitorId: 1,
    monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    targetApp: { name: "Notepad", path: "C:\\Notepad.lnk", iconPath: "C:\\notepad.exe" },
  };
}

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("test_default_rendersActionsListScreen", async () => {
    mockIpc([]);
    render(<App />);
    expect(
      await screen.findByText("Nenhuma ação criada ainda.")
    ).toBeInTheDocument();
  });

  it("test_onCreate_rendersBasicInfoScreenInCreateMode", async () => {
    mockIpc([]);
    render(<App />);

    await screen.findByText("Nenhuma ação criada ainda.");
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar ação" })[0]);

    expect(await screen.findByLabelText("Nome da ação")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("test_onEdit_rendersBasicInfoScreenPrefilledFromRecord", async () => {
    mockIpc(
      [sampleAction("a1", "Ação alvo")],
      storedFullRecord("a1", "Ação alvo")
    );
    render(<App />);

    await screen.findByText("Ação alvo");
    fireEvent.click(screen.getByLabelText("Editar Ação alvo"));

    expect(await screen.findByLabelText("Nome da ação")).toHaveValue(
      "Ação alvo"
    );
  });

  it("test_basicInfoConfirm_switchesToStepsBuilderScreenWithDraft", async () => {
    mockIpc([]);
    render(<App />);

    await screen.findByText("Nenhuma ação criada ainda.");
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar ação" })[0]);

    fireEvent.change(await screen.findByLabelText("Nome da ação"), {
      target: { value: "Minha ação" },
    });
    fireEvent.click(await screen.findByText("Notepad"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      await screen.findByRole("button", { name: "Adicionar passo" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("test_basicInfoCancel_returnsToActionsListWithoutToast", async () => {
    mockIpc([]);
    render(<App />);

    await screen.findByText("Nenhuma ação criada ainda.");
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar ação" })[0]);

    await screen.findByLabelText("Nome da ação");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      await screen.findByText("Nenhuma ação criada ainda.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/sucesso/)
    ).not.toBeInTheDocument();
  });

  it("test_onExecute_actionWithManualSteps_rendersExecuteActionScreen", async () => {
    mockIpc([sampleAction("a1", "Ação alvo")], null, {
      a1: {
        id: "a1",
        name: "Ação alvo",
        steps: [
          { id: "s1", type: "manual-type", label: "Nome do cliente" },
        ],
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByText("Ação alvo"));

    expect(
      await screen.findByLabelText("Nome do cliente")
    ).toBeInTheDocument();
  });

  it("test_onExecute_actionWithZeroManualSteps_reachesExecutionRunImmediately", async () => {
    const { invoke } = mockIpc(
      [sampleAction("a1", "Ação alvo")],
      null,
      {
        a1: {
          id: "a1",
          name: "Ação alvo",
          steps: [{ id: "s1", type: "click" }],
        },
      },
      new Promise(() => {}) // never resolves, so we can assert the invoke call itself
    );
    render(<App />);

    fireEvent.click(await screen.findByText("Ação alvo"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("execution:run", {
        actionId: "a1",
        manualValues: {},
      })
    );
  });

  it("test_executeScreenConfirm_carriesExecutionRequestToExecutionRun", async () => {
    const { invoke } = mockIpc(
      [sampleAction("a1", "Ação alvo")],
      null,
      {
        a1: {
          id: "a1",
          name: "Ação alvo",
          steps: [{ id: "s1", type: "manual-type", label: "Nome" }],
        },
      },
      new Promise(() => {})
    );
    render(<App />);

    fireEvent.click(await screen.findByText("Ação alvo"));
    fireEvent.change(await screen.findByLabelText("Nome"), {
      target: { value: "João" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Executar" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("execution:run", {
        actionId: "a1",
        manualValues: { s1: "João" },
      })
    );
  });

  it("test_executeScreenCancel_returnsToActionsListWithoutRunning", async () => {
    const { invoke } = mockIpc([sampleAction("a1", "Ação alvo")], null, {
      a1: {
        id: "a1",
        name: "Ação alvo",
        steps: [{ id: "s1", type: "manual-type", label: "Nome" }],
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByText("Ação alvo"));
    await screen.findByLabelText("Nome");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Ação alvo")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "execution:run",
      expect.anything()
    );
  });

  it("test_returnToList_withMessage_showsToastOnce", async () => {
    mockIpc(
      [sampleAction("a1", "Ação alvo")],
      null,
      {
        a1: {
          id: "a1",
          name: "Ação alvo",
          steps: [{ id: "s1", type: "click" }],
        },
      },
      { success: true, actionName: "Ação alvo" }
    );
    render(<App />);

    fireEvent.click(await screen.findByText("Ação alvo"));

    expect(await screen.findByText("Ação alvo")).toBeInTheDocument();
    expect(
      screen.getByText("Ação 'Ação alvo' executada com sucesso.")
    ).toBeInTheDocument();
  });

  it("test_corruptedDataWarning_surfacesAsToastOnList", async () => {
    const { emit } = mockIpc([]);
    render(<App />);

    await screen.findByText("Nenhuma ação criada ainda.");
    emit(
      "actions:data-warning",
      "Não foi possível carregar suas ações salvas. Um novo arquivo será criado ao salvar a próxima ação."
    );

    expect(
      await screen.findByText(
        "Não foi possível carregar suas ações salvas. Um novo arquivo será criado ao salvar a próxima ação."
      )
    ).toBeInTheDocument();
  });

  it("test_integration_editPrefillMatchesF01StoredRecordExactly", async () => {
    const storedRecord = storedFullRecord("a1", "Preencher relatório");
    mockIpc([sampleAction("a1", "Preencher relatório")], storedRecord);
    render(<App />);

    await screen.findByText("Preencher relatório");
    fireEvent.click(screen.getByLabelText("Editar Preencher relatório"));

    expect(await screen.findByLabelText("Nome da ação")).toHaveValue(
      "Preencher relatório"
    );
    expect(await screen.findByTestId("app-picker-row")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  async function reachStepsBuilder() {
    mockIpc([]);
    render(<App />);

    await screen.findByText("Nenhuma ação criada ainda.");
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar ação" })[0]);
    fireEvent.change(await screen.findByLabelText("Nome da ação"), {
      target: { value: "Minha ação" },
    });
    fireEvent.click(await screen.findByText("Notepad"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await screen.findByRole("button", { name: "Adicionar passo" });
  }

  it("test_stepsBuilderScreen_rendersAtStepsBuilderState", async () => {
    await reachStepsBuilder();

    expect(
      screen.getByRole("button", { name: "Adicionar passo" })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Atraso padrão entre passos (segundos)")
    ).toBeInTheDocument();
  });

  it("test_stepsBuilderSave_returnsToActionsListWithToast", async () => {
    mockIpc([], null, {}, undefined, { success: true, action: {} });
    render(<App />);

    await screen.findByText("Nenhuma ação criada ainda.");
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar ação" })[0]);
    fireEvent.change(await screen.findByLabelText("Nome da ação"), {
      target: { value: "Minha ação" },
    });
    fireEvent.click(await screen.findByText("Notepad"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await screen.findByRole("button", { name: "Adicionar passo" });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar passo" }));
    const manualGroup = (await screen.findByText("Manual")).closest(
      '[data-slot="dropdown-menu-group"]'
    ) as HTMLElement;
    fireEvent.click(within(manualGroup).getByText("Digitar"));
    fireEvent.change(await screen.findByLabelText("Rótulo do campo"), {
      target: { value: "Nome do cliente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await screen.findByText("Manual: Nome do cliente");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Nenhuma ação criada ainda.")).toBeInTheDocument();
    expect(
      screen.getByText("Ação 'Minha ação' criada com sucesso.")
    ).toBeInTheDocument();
  });

  it("test_stepsBuilderCancel_returnsToActionsListWithoutToast", async () => {
    await reachStepsBuilder();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Nenhuma ação criada ainda.")).toBeInTheDocument();
    expect(screen.queryByText(/sucesso/)).not.toBeInTheDocument();
  });
});
