// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { StepsBuilderScreen } from "./StepsBuilderScreen";
import { captureScreenPosition } from "../lib/captureScreenPosition";
import type { StepDraft } from "../lib/steps";

vi.mock("../lib/captureScreenPosition", async () => {
  const actual = await vi.importActual<typeof import("../lib/captureScreenPosition")>(
    "../lib/captureScreenPosition"
  );
  return {
    ...actual,
    captureScreenPosition: vi.fn(),
  };
});

let capturedDndProps: ComponentProps<typeof import("@dnd-kit/core").DndContext> | null =
  null;

vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      capturedDndProps = props;
      return props.children;
    },
  };
});

interface SavePayload {
  steps: { type: string; label?: string; position?: { x: number; y: number } }[];
}

function savePayloadOf(call: unknown[] | undefined): SavePayload {
  return call?.[1] as SavePayload;
}

const draft = {
  name: "Preencher relatório",
  monitorId: 1,
  monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  targetApp: { name: "Notepad", path: "C:\\Notepad.lnk", iconPath: "C:\\notepad.exe" },
};

function mockIpc({
  actionsGet = null,
  saveResult = { success: true, action: {} },
}: {
  actionsGet?: unknown;
  saveResult?: unknown;
} = {}) {
  const invoke = vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>((channel) => {
    if (channel === "actions:get") return Promise.resolve(actionsGet);
    if (channel === "actions:save") return Promise.resolve(saveResult);
    return Promise.resolve(undefined);
  });
  Object.assign(window, {
    ipcRenderer: { invoke, on: vi.fn(), off: vi.fn(), send: vi.fn() },
  });
  return { invoke };
}

async function addManualStep(label: string) {
  fireEvent.click(screen.getByRole("button", { name: "Adicionar passo" }));
  const manualGroup = (await screen.findByText("Manual")).closest(
    '[data-slot="dropdown-menu-group"]'
  ) as HTMLElement;
  fireEvent.click(within(manualGroup).getByText("Digitar"));

  fireEvent.change(await screen.findByLabelText("Rótulo do campo"), {
    target: { value: label },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

describe("StepsBuilderScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    capturedDndProps = null;
  });

  it("test_saveDisabled_whenStepsListIsEmpty", async () => {
    mockIpc();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("test_saveEnabled_afterFirstStepAdded", async () => {
    mockIpc();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={vi.fn()} />);

    await addManualStep("Nome do cliente");

    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("test_editMode_loadsExistingStepsAndDelayOnMount", async () => {
    const existingSteps: StepDraft[] = [
      { id: "s1", type: "wait", seconds: 5 },
    ];
    mockIpc({ actionsGet: { steps: existingSteps, defaultDelaySeconds: 7 } });
    render(
      <StepsBuilderScreen
        mode="edit"
        actionId="a1"
        draft={draft}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(await screen.findByText("Esperar 5s")).toBeInTheDocument();
    expect(screen.getByLabelText("Atraso padrão entre passos (segundos)")).toHaveValue(7);
  });

  it("test_save_assemblesPayloadWithDraftBasicInfoAndCurrentStepsAndDelay", async () => {
    const { invoke } = mockIpc();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={vi.fn()} />);

    await addManualStep("Nome do cliente");
    fireEvent.change(screen.getByLabelText("Atraso padrão entre passos (segundos)"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "actions:save",
        expect.objectContaining({
          name: draft.name,
          monitorId: draft.monitorId,
          monitorBounds: draft.monitorBounds,
          targetApp: draft.targetApp,
          defaultDelaySeconds: 3,
          steps: [expect.objectContaining({ type: "manual-type", label: "Nome do cliente" })],
        })
      )
    );
  });

  it("test_save_success_returnsToListWithCreateOrEditToast", async () => {
    mockIpc({ saveResult: { success: true, action: {} } });
    const onSave = vi.fn();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={onSave} onCancel={vi.fn()} />);

    await addManualStep("Nome do cliente");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        `Ação '${draft.name}' criada com sucesso.`
      )
    );
  });

  it("test_save_failure_keepsScreenOpenWithDataIntactAndShowsErrorToast", async () => {
    mockIpc({ saveResult: { success: false, error: "boom" } });
    const onSave = vi.fn();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={onSave} onCancel={vi.fn()} />);

    await addManualStep("Nome do cliente");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Não foi possível salvar a ação. Tente novamente.")
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Manual: Nome do cliente")).toBeInTheDocument();
  });

  it("test_removeStep_updatesListImmediately", async () => {
    mockIpc();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={vi.fn()} />);

    await addManualStep("Nome do cliente");
    expect(screen.getByText("Manual: Nome do cliente")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Remover passo: Manual: Nome do cliente"));

    expect(screen.queryByText("Manual: Nome do cliente")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("test_reorderSteps_updatesSavedOrder", async () => {
    let counter = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => `step-${++counter}` as ReturnType<typeof crypto.randomUUID>
    );
    const { invoke } = mockIpc();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={vi.fn()} />);

    await addManualStep("Primeiro");
    await addManualStep("Segundo");

    expect(screen.getAllByTestId("step-row")).toHaveLength(2);

    act(() => {
      capturedDndProps?.onDragEnd?.({
        active: { id: "step-1" },
        over: { id: "step-2" },
      } as never);
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => {
      const call = invoke.mock.calls.find((c) => c[0] === "actions:save");
      expect(savePayloadOf(call).steps.map((s) => s.label)).toEqual([
        "Segundo",
        "Primeiro",
      ]);
    });
  });

  it("test_cancelWithNoChanges_navigatesAwayImmediately", async () => {
    mockIpc();
    const onCancel = vi.fn();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByText("Descartar alterações?")).not.toBeInTheDocument();
  });

  it("test_cancelWithUnsavedChanges_showsDiscardConfirmation", async () => {
    mockIpc();
    const onCancel = vi.fn();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={onCancel} />);

    await addManualStep("Nome do cliente");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Descartar alterações?")).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("test_integration_editingLoadsPreviouslySavedStepsAndDelayBeforeAnyChange", async () => {
    const existingSteps: StepDraft[] = [
      { id: "s1", type: "click", position: { x: 100, y: 200 } },
      { id: "s2", type: "manual-type", label: "Nome do cliente" },
    ];
    mockIpc({ actionsGet: { steps: existingSteps, defaultDelaySeconds: 4 } });
    render(
      <StepsBuilderScreen
        mode="edit"
        actionId="a1"
        draft={draft}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(await screen.findByText("Click em (100, 200)")).toBeInTheDocument();
    expect(screen.getByText("Manual: Nome do cliente")).toBeInTheDocument();
    expect(screen.getByLabelText("Atraso padrão entre passos (segundos)")).toHaveValue(4);
  });

  it("test_integration_capturedCoordinateStoredOnCorrectStepMatchesF08Expectation", async () => {
    vi.mocked(captureScreenPosition).mockResolvedValue({
      status: "captured",
      position: { x: 321, y: 654 },
    });
    const { invoke } = mockIpc();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar passo" }));
    const automaticoGroup = (await screen.findByText("Automático")).closest(
      '[data-slot="dropdown-menu-group"]'
    ) as HTMLElement;
    fireEvent.click(within(automaticoGroup).getByText("Click"));

    await screen.findByText("Click em (321, 654)");

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "actions:save",
        expect.objectContaining({
          steps: [expect.objectContaining({ type: "click", position: { x: 321, y: 654 } })],
        })
      )
    );
  });

  it("test_integration_savedActionStepCountVisibleToF02", async () => {
    const { invoke } = mockIpc();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={vi.fn()} />);

    await addManualStep("Um");
    await addManualStep("Dois");
    await addManualStep("Três");

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => {
      const call = invoke.mock.calls.find((c) => c[0] === "actions:save");
      expect(savePayloadOf(call).steps).toHaveLength(3);
    });
  });

  it("test_integration_manualTypeStepsPersistLabelForF07", async () => {
    const { invoke } = mockIpc();
    render(<StepsBuilderScreen mode="create" draft={draft} onSave={vi.fn()} onCancel={vi.fn()} />);

    await addManualStep("Nome do cliente");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => {
      const call = invoke.mock.calls.find((c) => c[0] === "actions:save");
      expect(savePayloadOf(call).steps[0].label).toBe("Nome do cliente");
    });
  });
});
