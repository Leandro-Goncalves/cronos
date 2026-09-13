// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecuteActionScreen } from "./ExecuteActionScreen";

function mockIpc(actionsGet: unknown) {
  const invoke = vi.fn((...args: unknown[]) => {
    if (args[0] === "actions:get") return Promise.resolve(actionsGet);
    return Promise.resolve(undefined);
  });
  Object.assign(window, {
    ipcRenderer: { invoke, on: vi.fn(), off: vi.fn(), send: vi.fn() },
  });
  return invoke;
}

function makeAction(steps: unknown[]) {
  return { id: "a1", name: "Ação alvo", steps };
}

describe("ExecuteActionScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("test_zeroManualSteps_skipsFormAndHandsOffImmediately", async () => {
    mockIpc(
      makeAction([
        { id: "s1", type: "click" },
        { id: "s2", type: "wait" },
      ])
    );
    const onConfirm = vi.fn();

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({
      actionId: "a1",
      manualValues: {},
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("test_oneManualStep_rendersLabeledInputStartingEmpty", async () => {
    mockIpc(
      makeAction([
        {
          id: "s1",
          type: "manual-type",
          label: "Nome do cliente",
          placeholder: "Ex: João Silva",
        },
      ])
    );

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const input = (await screen.findByLabelText(
      "Nome do cliente"
    )) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Ex: João Silva");
  });

  it("test_multipleManualSteps_rendersOneInputPerStepInStepOrder", async () => {
    mockIpc(
      makeAction([
        { id: "s1", type: "click" },
        { id: "s2", type: "manual-type", label: "Primeiro campo" },
        { id: "s3", type: "wait" },
        { id: "s4", type: "manual-type", label: "Segundo campo" },
      ])
    );

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await screen.findByLabelText("Primeiro campo");
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    expect(screen.getByLabelText("Segundo campo")).toBeInTheDocument();
  });

  it("test_executarDisabled_untilAllFieldsNonEmpty", async () => {
    mockIpc(
      makeAction([
        { id: "s1", type: "manual-type", label: "Campo 1" },
        { id: "s2", type: "manual-type", label: "Campo 2" },
      ])
    );

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await screen.findByLabelText("Campo 1");
    fireEvent.change(screen.getByLabelText("Campo 1"), {
      target: { value: "valor" },
    });

    expect(screen.getByRole("button", { name: "Executar" })).toBeDisabled();
  });

  it("test_executarDisabled_whenFieldIsWhitespaceOnly", async () => {
    mockIpc(makeAction([{ id: "s1", type: "manual-type", label: "Campo" }]));

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await screen.findByLabelText("Campo");
    fireEvent.change(screen.getByLabelText("Campo"), {
      target: { value: "   " },
    });

    expect(screen.getByRole("button", { name: "Executar" })).toBeDisabled();
  });

  it("test_executarEnabled_onceAllFieldsFilled", async () => {
    mockIpc(
      makeAction([
        { id: "s1", type: "manual-type", label: "Campo 1" },
        { id: "s2", type: "manual-type", label: "Campo 2" },
      ])
    );

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await screen.findByLabelText("Campo 1");
    fireEvent.change(screen.getByLabelText("Campo 1"), {
      target: { value: "valor 1" },
    });
    fireEvent.change(screen.getByLabelText("Campo 2"), {
      target: { value: "valor 2" },
    });

    expect(screen.getByRole("button", { name: "Executar" })).toBeEnabled();
  });

  it("test_executarClick_handsOffValuesKeyedByStepId", async () => {
    mockIpc(
      makeAction([
        { id: "s1", type: "manual-type", label: "Nome" },
        { id: "s2", type: "manual-type", label: "Pedido" },
      ])
    );
    const onConfirm = vi.fn();

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await screen.findByLabelText("Nome");
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "João Silva" },
    });
    fireEvent.change(screen.getByLabelText("Pedido"), {
      target: { value: "PED-4821" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Executar" }));

    expect(onConfirm).toHaveBeenCalledWith({
      actionId: "a1",
      manualValues: { s1: "João Silva", s2: "PED-4821" },
    });
  });

  it("test_cancelarClick_invokesOnCancelWithoutHandOff", async () => {
    mockIpc(makeAction([{ id: "s1", type: "manual-type", label: "Campo" }]));
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await screen.findByLabelText("Campo");
    fireEvent.change(screen.getByLabelText("Campo"), {
      target: { value: "parcial" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("test_actionsGetReturnsNull_treatedAsZeroManualSteps", async () => {
    mockIpc(null);
    const onConfirm = vi.fn();

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({
      actionId: "a1",
      manualValues: {},
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("test_integration_stepListFromF01DeterminesScreenShownOrSkipped", async () => {
    const invoke = mockIpc(null);
    invoke.mockImplementation((...args: unknown[]) => {
      if (args[0] !== "actions:get") return Promise.resolve(undefined);
      if (args[1] === "with-manual") {
        return Promise.resolve(
          makeAction([{ id: "s1", type: "manual-type", label: "Campo" }])
        );
      }
      return Promise.resolve(makeAction([{ id: "s1", type: "click" }]));
    });
    const onConfirmWith = vi.fn();
    const onConfirmWithout = vi.fn();

    const { unmount } = render(
      <ExecuteActionScreen
        actionId="with-manual"
        onConfirm={onConfirmWith}
        onCancel={vi.fn()}
      />
    );
    await screen.findByLabelText("Campo");
    expect(onConfirmWith).not.toHaveBeenCalled();
    unmount();

    render(
      <ExecuteActionScreen
        actionId="without-manual"
        onConfirm={onConfirmWithout}
        onCancel={vi.fn()}
      />
    );
    await vi.waitFor(() => expect(onConfirmWithout).toHaveBeenCalledTimes(1));
    expect(onConfirmWithout).toHaveBeenCalledWith({
      actionId: "without-manual",
      manualValues: {},
    });
  });

  it("test_integration_manualValuesKeyedCorrectlyForF08Consumption", async () => {
    mockIpc(
      makeAction([
        { id: "step-abc", type: "manual-type", label: "Campo A" },
        { id: "step-xyz", type: "manual-type", label: "Campo B" },
      ])
    );
    const onConfirm = vi.fn();

    render(
      <ExecuteActionScreen
        actionId="a1"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await screen.findByLabelText("Campo A");
    fireEvent.change(screen.getByLabelText("Campo A"), {
      target: { value: "Valor A" },
    });
    fireEvent.change(screen.getByLabelText("Campo B"), {
      target: { value: "Valor B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Executar" }));

    const request = onConfirm.mock.calls[0][0];
    expect(Object.keys(request.manualValues).sort()).toEqual([
      "step-abc",
      "step-xyz",
    ]);
    expect(request.manualValues["step-abc"]).toBe("Valor A");
    expect(request.manualValues["step-xyz"]).toBe("Valor B");
  });
});
