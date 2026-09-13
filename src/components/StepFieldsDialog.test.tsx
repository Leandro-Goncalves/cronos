// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepFieldsDialog, type StepDialogRequest } from "./StepFieldsDialog";
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

const targetApp = { name: "Notepad", path: "C:\\Notepad.lnk", iconPath: "C:\\notepad.exe" };
const monitorBounds = { x: 0, y: 0, width: 1920, height: 1080 };

function renderDialog(request: StepDialogRequest | null) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const onCaptureError = vi.fn();
  render(
    <StepFieldsDialog
      request={request}
      targetApp={targetApp}
      monitorBounds={monitorBounds}
      onConfirm={onConfirm}
      onClose={onClose}
      onCaptureError={onCaptureError}
    />
  );
  return { onConfirm, onClose, onCaptureError };
}

describe("StepFieldsDialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("test_addClick_triggersCaptureImmediatelyOnOpen", () => {
    vi.mocked(captureScreenPosition).mockReturnValue(new Promise(() => {}));
    renderDialog({ mode: "add", type: "click" });

    expect(captureScreenPosition).toHaveBeenCalledWith({ targetApp, monitorBounds });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("test_addClick_capturedResult_producesStepWithPosition", async () => {
    vi.mocked(captureScreenPosition).mockResolvedValue({
      status: "captured",
      position: { x: 10, y: 20 },
    });
    const { onConfirm } = renderDialog({ mode: "add", type: "click" });

    await vi.waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ type: "click", position: { x: 10, y: 20 } })
      )
    );
  });

  it("test_addClick_cancelledResult_producesNoStep", async () => {
    vi.mocked(captureScreenPosition).mockResolvedValue({ status: "cancelled" });
    const { onConfirm, onClose } = renderDialog({ mode: "add", type: "click" });

    await screen.findByText("Captura cancelada.");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("test_addAutoType_asksForTextBeforeTriggeringCapture", () => {
    renderDialog({ mode: "add", type: "auto-type" });

    expect(screen.getByLabelText("Texto a digitar")).toBeInTheDocument();
    expect(captureScreenPosition).not.toHaveBeenCalled();
  });

  it("test_addAutoType_confirmedText_thenCapturedResult_producesStepWithTextAndPosition", async () => {
    vi.mocked(captureScreenPosition).mockResolvedValue({
      status: "captured",
      position: { x: 5, y: 6 },
    });
    const { onConfirm } = renderDialog({ mode: "add", type: "auto-type" });

    fireEvent.change(screen.getByLabelText("Texto a digitar"), {
      target: { value: "relatorio_final" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capturar posição" }));

    await vi.waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "auto-type",
          text: "relatorio_final",
          position: { x: 5, y: 6 },
        })
      )
    );
  });

  it("test_addPressKey_noPositionCaptureTriggered", () => {
    const { onConfirm } = renderDialog({ mode: "add", type: "press-key" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Ctrl" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(captureScreenPosition).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ type: "press-key", modifiers: ["ctrl"] })
    );
  });

  it("test_addWait_validatesSecondsRange", () => {
    renderDialog({ mode: "add", type: "wait" });
    const input = screen.getByLabelText("Segundos");
    const saveButton = screen.getByRole("button", { name: "Salvar" });

    fireEvent.change(input, { target: { value: "0" } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "61" } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "30" } });
    expect(saveButton).toBeEnabled();
  });

  it("test_addManualType_validatesLabelLength", () => {
    renderDialog({ mode: "add", type: "manual-type" });
    const input = screen.getByLabelText("Rótulo do campo");
    const saveButton = screen.getByRole("button", { name: "Salvar" });

    fireEvent.change(input, { target: { value: "a".repeat(41) } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "Nome do cliente" } });
    expect(saveButton).toBeEnabled();
  });

  it("test_editAutoType_changingTextOnly_doesNotTriggerCapture", () => {
    const step: StepDraft = {
      id: "s1",
      type: "auto-type",
      position: { x: 1, y: 2 },
      text: "old",
    };
    const { onConfirm } = renderDialog({ mode: "edit", step });

    fireEvent.change(screen.getByLabelText("Texto a digitar"), {
      target: { value: "new text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(captureScreenPosition).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith({ ...step, text: "new text" });
  });

  it("test_editClickOrAutoType_refazerPosicaoButton_triggersCaptureAndOverwritesOnlyPosition", async () => {
    const step: StepDraft = { id: "s1", type: "click", position: { x: 1, y: 2 } };
    vi.mocked(captureScreenPosition).mockResolvedValue({
      status: "captured",
      position: { x: 99, y: 100 },
    });
    const { onConfirm } = renderDialog({ mode: "edit", step });

    fireEvent.click(screen.getByRole("button", { name: "Refazer posição" }));

    await vi.waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({ ...step, position: { x: 99, y: 100 } })
    );
  });

  it("test_captureError_showsExactPrdErrorToastAndAddsNoStep", async () => {
    vi.mocked(captureScreenPosition).mockResolvedValue({ status: "error" });
    const { onConfirm, onCaptureError } = renderDialog({ mode: "add", type: "click" });

    await vi.waitFor(() =>
      expect(onCaptureError).toHaveBeenCalledWith(
        "Não foi possível abrir Notepad para capturar a posição."
      )
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
