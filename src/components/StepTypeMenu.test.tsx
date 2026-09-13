// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepTypeMenu } from "./StepTypeMenu";
import type { StepType } from "../lib/steps";

describe("StepTypeMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("test_menu_groupsTypesUnderAutomaticoAndManual", async () => {
    render(<StepTypeMenu onSelectType={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar passo" }));

    const automaticoGroup = (await screen.findByText("Automático")).closest(
      '[data-slot="dropdown-menu-group"]'
    ) as HTMLElement;
    const manualGroup = screen
      .getByText("Manual")
      .closest('[data-slot="dropdown-menu-group"]') as HTMLElement;

    expect(within(automaticoGroup).getByText("Click")).toBeInTheDocument();
    expect(within(automaticoGroup).getByText("Digitar")).toBeInTheDocument();
    expect(within(automaticoGroup).getByText("Pressionar")).toBeInTheDocument();
    expect(within(automaticoGroup).getByText("Esperar")).toBeInTheDocument();
    expect(within(manualGroup).getByText("Digitar")).toBeInTheDocument();
  });

  it("test_selectingType_invokesCallbackWithType", async () => {
    const onSelectType = vi.fn();
    render(<StepTypeMenu onSelectType={onSelectType} />);

    const types: { label: string; group: "Automático" | "Manual"; type: StepType }[] = [
      { label: "Click", group: "Automático", type: "click" },
      { label: "Pressionar", group: "Automático", type: "press-key" },
      { label: "Esperar", group: "Automático", type: "wait" },
    ];

    for (const { label, group, type } of types) {
      fireEvent.click(screen.getByRole("button", { name: "Adicionar passo" }));
      const groupEl = (await screen.findByText(group)).closest(
        '[data-slot="dropdown-menu-group"]'
      ) as HTMLElement;
      fireEvent.click(within(groupEl).getByText(label));
      expect(onSelectType).toHaveBeenCalledWith(type);
    }

    onSelectType.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar passo" }));
    const automaticoGroup = (await screen.findByText("Automático")).closest(
      '[data-slot="dropdown-menu-group"]'
    ) as HTMLElement;
    fireEvent.click(within(automaticoGroup).getByText("Digitar"));
    expect(onSelectType).toHaveBeenCalledWith("auto-type");

    onSelectType.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar passo" }));
    const manualGroup = (await screen.findByText("Manual")).closest(
      '[data-slot="dropdown-menu-group"]'
    ) as HTMLElement;
    fireEvent.click(within(manualGroup).getByText("Digitar"));
    expect(onSelectType).toHaveBeenCalledWith("manual-type");
  });
});
