// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  actionsGetById: Record<string, unknown> = {}
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

  it("test_basicInfoConfirm_switchesToStepsBuilderPlaceholderWithDraft", async () => {
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
      await screen.findByText("Passos da ação (em construção)")
    ).toBeInTheDocument();
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

  it("test_onExecute_actionWithZeroManualSteps_reachesRunningPlaceholderImmediately", async () => {
    mockIpc([sampleAction("a1", "Ação alvo")], null, {
      a1: {
        id: "a1",
        name: "Ação alvo",
        steps: [{ id: "s1", type: "click" }],
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByText("Ação alvo"));

    expect(
      await screen.findByText("Executando ação (em construção)")
    ).toBeInTheDocument();
  });

  it("test_executeScreenConfirm_carriesExecutionRequestToRunningPlaceholder", async () => {
    mockIpc([sampleAction("a1", "Ação alvo")], null, {
      a1: {
        id: "a1",
        name: "Ação alvo",
        steps: [{ id: "s1", type: "manual-type", label: "Nome" }],
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByText("Ação alvo"));
    fireEvent.change(await screen.findByLabelText("Nome"), {
      target: { value: "João" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Executar" }));

    expect(
      await screen.findByText("Executando ação (em construção)")
    ).toBeInTheDocument();
  });

  it("test_executeScreenCancel_returnsToActionsListWithoutRunning", async () => {
    mockIpc([sampleAction("a1", "Ação alvo")], null, {
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
    expect(
      screen.queryByText("Executando ação (em construção)")
    ).not.toBeInTheDocument();
  });

  it("test_returnToList_withMessage_showsToastOnce", async () => {
    mockIpc([sampleAction("a1", "Ação alvo")], null, {
      a1: {
        id: "a1",
        name: "Ação alvo",
        steps: [{ id: "s1", type: "click" }],
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByText("Ação alvo"));
    await screen.findByText("Executando ação (em construção)");
    fireEvent.click(screen.getByText("Simular sucesso (temporário)"));

    expect(await screen.findByText("Ação alvo")).toBeInTheDocument();
    expect(
      screen.getByText("Ação executada com sucesso.")
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
});
