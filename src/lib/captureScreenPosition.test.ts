// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureScreenPosition,
  getCaptureErrorMessage,
  type CapturePositionRequest,
} from "./captureScreenPosition";

function mockIpc() {
  const invoke = vi.fn();
  Object.assign(window, { ipcRenderer: { invoke, on: vi.fn(), off: vi.fn(), send: vi.fn() } });
  return invoke;
}

const sampleRequest: CapturePositionRequest = {
  targetApp: { name: "Notepad", path: "C:\\Notepad.lnk", iconPath: "C:\\notepad.exe" },
  monitorBounds: { x: 1920, y: 0, width: 1920, height: 1080 },
};

describe("captureScreenPosition", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("test_captureScreenPosition_invokesCaptureStartWithExactRequest", async () => {
    const invoke = mockIpc();
    invoke.mockResolvedValue({ status: "cancelled" });

    await captureScreenPosition(sampleRequest);

    expect(invoke).toHaveBeenCalledWith("capture:start", sampleRequest);
  });

  it("test_captureScreenPosition_resolvesWhateverMainReturns", async () => {
    const invoke = mockIpc();

    invoke.mockResolvedValueOnce({ status: "captured", position: { x: 512, y: 340 } });
    await expect(captureScreenPosition(sampleRequest)).resolves.toEqual({
      status: "captured",
      position: { x: 512, y: 340 },
    });

    invoke.mockResolvedValueOnce({ status: "cancelled" });
    await expect(captureScreenPosition(sampleRequest)).resolves.toEqual({
      status: "cancelled",
    });

    invoke.mockResolvedValueOnce({ status: "error" });
    await expect(captureScreenPosition(sampleRequest)).resolves.toEqual({
      status: "error",
    });
  });

  it("test_getCaptureErrorMessage_returnsExactPrdErrorText", () => {
    expect(getCaptureErrorMessage("Notepad")).toBe(
      "Não foi possível abrir Notepad para capturar a posição."
    );
  });
});
