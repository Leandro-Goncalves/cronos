// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureOverlayScreen } from "./CaptureOverlayScreen";

type IpcListener = (event: unknown, ...args: unknown[]) => void;

function mockIpc() {
  const listeners: Record<string, IpcListener[]> = {};
  const invoke = vi.fn(() => Promise.resolve(undefined));
  const on = vi.fn((channel: string, listener: IpcListener) => {
    listeners[channel] = listeners[channel] ?? [];
    listeners[channel].push(listener);
  });
  const off = vi.fn();
  Object.assign(window, { ipcRenderer: { invoke, on, off, send: vi.fn() } });
  return {
    invoke,
    emitReady() {
      for (const listener of listeners["overlay:ready"] ?? []) {
        listener({});
      }
    },
  };
}

describe("CaptureOverlayScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("test_initialRender_showsLoadingTextWithAppName", () => {
    mockIpc();
    render(<CaptureOverlayScreen appName="Notepad" />);

    expect(screen.getByText("Abrindo Notepad...")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-overlay-surface")).not.toBeInTheDocument();
  });

  it("test_clickBeforeReadySignal_doesNotInvokeCaptureClick", () => {
    const { invoke } = mockIpc();
    render(<CaptureOverlayScreen appName="Notepad" />);

    fireEvent.mouseDown(screen.getByText("Abrindo Notepad..."), { button: 0 });

    expect(invoke).not.toHaveBeenCalledWith("capture:click", expect.anything());
  });

  it("test_readySignalReceived_switchesToInteractiveTintedCrosshairSurface", () => {
    const { emitReady } = mockIpc();
    render(<CaptureOverlayScreen appName="Notepad" />);

    act(() => emitReady());

    expect(screen.queryByText("Abrindo Notepad...")).not.toBeInTheDocument();
    const surface = screen.getByTestId("capture-overlay-surface");
    expect(surface.className).toContain("cursor-crosshair");
    expect(surface.closest('[class*="bg-black/15"]')).not.toBeNull();
  });

  it("test_leftClickAfterReady_invokesCaptureClickWithRoundedCoordinates", () => {
    const { invoke, emitReady } = mockIpc();
    render(<CaptureOverlayScreen appName="Notepad" />);
    act(() => emitReady());

    fireEvent.mouseDown(screen.getByTestId("capture-overlay-surface"), {
      button: 0,
      clientX: 512.4,
      clientY: 339.6,
    });

    expect(invoke).toHaveBeenCalledWith("capture:click", { x: 512, y: 340 });
  });

  it("test_nonLeftClickAfterReady_isIgnored", () => {
    const { invoke, emitReady } = mockIpc();
    render(<CaptureOverlayScreen appName="Notepad" />);
    act(() => emitReady());

    fireEvent.mouseDown(screen.getByTestId("capture-overlay-surface"), {
      button: 2,
      clientX: 100,
      clientY: 100,
    });

    expect(invoke).not.toHaveBeenCalledWith("capture:click", expect.anything());
  });

  it("test_escDuringLoading_invokesCaptureCancel", () => {
    const { invoke } = mockIpc();
    render(<CaptureOverlayScreen appName="Notepad" />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(invoke).toHaveBeenCalledWith("capture:cancel");
  });

  it("test_escAfterReady_invokesCaptureCancel", () => {
    const { invoke, emitReady } = mockIpc();
    render(<CaptureOverlayScreen appName="Notepad" />);
    act(() => emitReady());

    fireEvent.keyDown(window, { key: "Escape" });

    expect(invoke).toHaveBeenCalledWith("capture:cancel");
  });
});
