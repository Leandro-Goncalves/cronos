// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BasicInfoScreen } from "./BasicInfoScreen";

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

const oneMonitor = [
  { id: 1, label: "Monitor 1 (principal)", bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
];

const twoMonitors = [
  ...oneMonitor,
  { id: 2, label: "Monitor 2", bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
];

const oneApp = [
  { name: "Notepad", path: "C:\\Notepad.lnk", iconPath: "C:\\notepad.exe" },
];

const otherApp = {
  name: "Calculator",
  path: "C:\\Calc.lnk",
  iconPath: "C:\\calc.exe",
};

const warningText =
  "Alterar o app ou monitor pode fazer com que posições já capturadas fiquem incorretas.";

function editableAction(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    name: "Preencher relatório",
    monitorId: 1,
    monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    targetApp: { name: "Notepad", path: "C:\\Notepad.lnk", iconPath: "C:\\notepad.exe" },
    ...overrides,
  };
}

async function fillNameAndApp(name: string) {
  fireEvent.change(screen.getByLabelText("Nome da ação"), {
    target: { value: name },
  });
  const appRow = await screen.findByText("Notepad");
  fireEvent.click(appRow);
}

describe("BasicInfoScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("test_monitorSelector_hiddenWhenExactlyOneMonitorDetected", async () => {
    mockIpc({
      "displays:list": () => oneMonitor,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="create" />);

    await screen.findByText("Notepad");
    expect(screen.queryByLabelText("Monitor")).not.toBeInTheDocument();
  });

  it("test_monitorSelector_shownWhenTwoOrMoreMonitorsDetected", async () => {
    mockIpc({
      "displays:list": () => twoMonitors,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="create" />);

    expect(await screen.findByLabelText("Monitor")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Monitor"));
    expect(await screen.findByText("Monitor 1 (principal)")).toBeInTheDocument();
    expect(screen.getByText("Monitor 2")).toBeInTheDocument();
  });

  it("test_singleMonitor_autoRecordsIdAndBoundsOnDraft", async () => {
    mockIpc({
      "displays:list": () => oneMonitor,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="create" />);

    await fillNameAndApp("Minha ação");

    await screen.findByText("Notepad");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });

  it("test_confirm_disabledUntilNameAppAndMonitorAreSet", async () => {
    mockIpc({
      "displays:list": () => twoMonitors,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="create" />);

    const confirmButton = await screen.findByRole("button", { name: "Confirmar" });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Nome da ação"), {
      target: { value: "Minha ação" },
    });
    expect(confirmButton).toBeDisabled();

    const appRow = await screen.findByText("Notepad");
    fireEvent.click(appRow);
    expect(confirmButton).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Monitor"));
    await user.click(await screen.findByRole("option", { name: "Monitor 2" }));

    expect(confirmButton).toBeEnabled();
  });

  it("test_confirm_disabledWhenNameIsOnlyWhitespace", async () => {
    mockIpc({
      "displays:list": () => oneMonitor,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="create" />);
    await fillNameAndApp("   ");

    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("test_confirm_disabledWhenNameExceeds60Characters", async () => {
    mockIpc({
      "displays:list": () => oneMonitor,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="create" />);
    await fillNameAndApp("a".repeat(61));

    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("test_editMode_prefillsNameMonitorAndAppFromExistingAction", async () => {
    mockIpc({
      "displays:list": () => twoMonitors,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="edit" action={editableAction()} />);

    expect(await screen.findByLabelText("Nome da ação")).toHaveValue(
      "Preencher relatório"
    );
    expect(await screen.findByLabelText("Monitor")).toHaveTextContent(
      "Monitor 1 (principal)"
    );
    expect(await screen.findByTestId("app-picker-row")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("test_editMode_appNoLongerInstalled_stillPrefillsSelectionWithoutHighlight", async () => {
    mockIpc({
      "displays:list": () => twoMonitors,
      "apps:list": () => [otherApp],
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="edit" action={editableAction()} />);

    await screen.findByText("Calculator");
    expect(screen.getByTestId("app-picker-row")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });

  it("test_editMode_changingAppShowsWarningBanner", async () => {
    mockIpc({
      "displays:list": () => oneMonitor,
      "apps:list": () => [otherApp],
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="edit" action={editableAction()} />);

    expect(screen.queryByText(warningText)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText("Calculator"));

    expect(await screen.findByText(warningText)).toBeInTheDocument();
  });

  it("test_editMode_changingMonitorShowsWarningBanner", async () => {
    mockIpc({
      "displays:list": () => twoMonitors,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="edit" action={editableAction()} />);

    await screen.findByText("Notepad");
    expect(screen.queryByText(warningText)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Monitor"));
    await user.click(await screen.findByRole("option", { name: "Monitor 2" }));

    expect(await screen.findByText(warningText)).toBeInTheDocument();
  });

  it("test_editMode_revertingToOriginalValuesHidesWarningBanner", async () => {
    mockIpc({
      "displays:list": () => oneMonitor,
      "apps:list": () => [...oneApp, otherApp],
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="edit" action={editableAction()} />);

    await screen.findByText("Notepad");
    fireEvent.click(screen.getByText("Calculator"));
    expect(await screen.findByText(warningText)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Notepad"));
    expect(screen.queryByText(warningText)).not.toBeInTheDocument();
  });

  it("test_createMode_neverShowsWarningBanner", async () => {
    mockIpc({
      "displays:list": () => twoMonitors,
      "apps:list": () => oneApp,
      "apps:icon": () => null,
    });

    render(<BasicInfoScreen mode="create" />);
    await fillNameAndApp("Minha ação");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Monitor"));
    await user.click(await screen.findByRole("option", { name: "Monitor 2" }));

    expect(screen.queryByText(warningText)).not.toBeInTheDocument();
  });
});
