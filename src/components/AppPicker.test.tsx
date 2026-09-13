// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppPicker, type AppInfo } from "./AppPicker";

function makeApp(overrides: Partial<AppInfo> = {}): AppInfo {
  return {
    name: "Notepad",
    path: "C:\\Notepad.lnk",
    iconPath: "C:\\Windows\\System32\\notepad.exe",
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

describe("AppPicker", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("test_search_filtersByNameCaseInsensitiveSubstring", async () => {
    mockIpc({
      "apps:list": () => [
        makeApp({ name: "Notepad", path: "C:\\Notepad.lnk" }),
        makeApp({ name: "Calculator", path: "C:\\Calc.lnk" }),
      ],
      "apps:icon": () => null,
    });

    render(<AppPicker value={null} onChange={vi.fn()} />);

    await screen.findByText("Notepad");
    fireEvent.change(screen.getByPlaceholderText("Buscar aplicativo..."), {
      target: { value: "NOTE" },
    });

    expect(screen.getByText("Notepad")).toBeInTheDocument();
    expect(screen.queryByText("Calculator")).not.toBeInTheDocument();
  });

  it("test_rowClick_selectsAppAndInvokesOnChange", async () => {
    const app = makeApp({ name: "Notepad", path: "C:\\Notepad.lnk" });
    mockIpc({ "apps:list": () => [app], "apps:icon": () => null });
    const onChange = vi.fn();

    render(<AppPicker value={null} onChange={onChange} />);

    const row = await screen.findByText("Notepad");
    fireEvent.click(row);

    expect(onChange).toHaveBeenCalledWith(app);
  });

  it("test_initialValue_highlightsMatchingRowByPath", async () => {
    const app = makeApp({ name: "Notepad", path: "C:\\Notepad.lnk" });
    mockIpc({ "apps:list": () => [app], "apps:icon": () => null });

    render(<AppPicker value={app} onChange={vi.fn()} />);

    await screen.findByText("Notepad");
    expect(screen.getByTestId("app-picker-row")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("test_iconLoadFailure_fallsBackToGenericAppIcon", async () => {
    mockIpc({
      "apps:list": () => [makeApp({ name: "Notepad" })],
      "apps:icon": () => null,
    });

    const { container } = render(<AppPicker value={null} onChange={vi.fn()} />);

    await screen.findByText("Notepad");

    await waitFor(() => {
      expect(container.querySelector(".lucide-app-window")).not.toBeNull();
    });
    expect(container.querySelector("img")).toBeNull();
  });
});
