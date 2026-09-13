// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunningScreen } from "./RunningScreen";

function mockIpc(invokeImpl: (channel: string, ...args: unknown[]) => unknown) {
  const invoke = vi.fn(invokeImpl);
  Object.assign(window, { ipcRenderer: { invoke, on: vi.fn(), off: vi.fn(), send: vi.fn() } });
  return invoke;
}

describe("RunningScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("test_onMount_invokesExecutionRunWithExactRequestPayload", () => {
    const invoke = mockIpc(() => new Promise(() => {}));
    const request = { actionId: "a1", manualValues: { s1: "João" } };

    render(<RunningScreen request={request} onComplete={vi.fn()} />);

    expect(invoke).toHaveBeenCalledWith("execution:run", request);
  });

  it("test_successResult_callsOnCompleteWithSuccessToast", async () => {
    mockIpc(() => Promise.resolve({ success: true, actionName: "Preencher relatório" }));
    const onComplete = vi.fn();

    render(
      <RunningScreen request={{ actionId: "a1", manualValues: {} }} onComplete={onComplete} />
    );

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        "Ação 'Preencher relatório' executada com sucesso."
      )
    );
  });

  it("test_failureResult_callsOnCompleteWithExactErrorMessage", async () => {
    mockIpc(() =>
      Promise.resolve({ success: false, errorMessage: "Não foi possível abrir Notepad." })
    );
    const onComplete = vi.fn();

    render(
      <RunningScreen request={{ actionId: "a1", manualValues: {} }} onComplete={onComplete} />
    );

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith("Não foi possível abrir Notepad.")
    );
  });

  it("test_rendersNoVisibleContent", () => {
    mockIpc(() => new Promise(() => {}));

    const { container } = render(
      <RunningScreen request={{ actionId: "a1", manualValues: {} }} onComplete={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
