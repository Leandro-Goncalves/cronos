// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

type IpcListener = (event: unknown, ...args: unknown[]) => void;

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

  it("test_onCreate_switchesToWizardCreateScreen", async () => {
    mockIpc([]);
    render(<App />);

    await screen.findByText("Nenhuma ação criada ainda.");
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar ação" })[0]);

    expect(
      screen.getByText("Adicionar ação (em construção)")
    ).toBeInTheDocument();
  });

  it("test_onEdit_switchesToWizardEditScreenWithRecord", async () => {
    mockIpc(
      [sampleAction("a1", "Ação alvo")],
      { id: "a1", name: "Ação alvo" }
    );
    render(<App />);

    await screen.findByText("Ação alvo");
    fireEvent.click(screen.getByLabelText("Editar Ação alvo"));

    expect(
      await screen.findByText('Editar "Ação alvo" (em construção)')
    ).toBeInTheDocument();
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
    mockIpc([]);
    render(<App />);

    await screen.findByText("Nenhuma ação criada ainda.");
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar ação" })[0]);
    fireEvent.click(
      screen.getByText("Simular sucesso (temporário)")
    );

    expect(await screen.findByText("Nenhuma ação criada ainda.")).toBeInTheDocument();
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
});
