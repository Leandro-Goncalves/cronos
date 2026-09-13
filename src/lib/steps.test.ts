import { describe, expect, it } from "vitest";
import { summarizeStep, type StepDraft } from "./steps";

describe("summarizeStep", () => {
  it("test_summarizeStep_click", () => {
    const step: StepDraft = { id: "1", type: "click", position: { x: 512, y: 340 } };
    expect(summarizeStep(step)).toBe("Click em (512, 340)");
  });

  it("test_summarizeStep_autoType", () => {
    const step: StepDraft = {
      id: "1",
      type: "auto-type",
      position: { x: 0, y: 0 },
      text: "relatorio_final",
    };
    expect(summarizeStep(step)).toBe('Digitar: "relatorio_final"');
  });

  it("test_summarizeStep_pressKeyWithModifiers", () => {
    const step: StepDraft = {
      id: "1",
      type: "press-key",
      key: "Enter",
      modifiers: ["ctrl"],
    };
    expect(summarizeStep(step)).toBe("Pressionar: Ctrl+Enter");
  });

  it("test_summarizeStep_pressKeyNoModifiers", () => {
    const step: StepDraft = {
      id: "1",
      type: "press-key",
      key: "Tab",
      modifiers: [],
    };
    expect(summarizeStep(step)).toBe("Pressionar: Tab");
  });

  it("test_summarizeStep_wait", () => {
    const step: StepDraft = { id: "1", type: "wait", seconds: 3 };
    expect(summarizeStep(step)).toBe("Esperar 3s");
  });

  it("test_summarizeStep_manualType", () => {
    const step: StepDraft = {
      id: "1",
      type: "manual-type",
      label: "Nome do cliente",
    };
    expect(summarizeStep(step)).toBe("Manual: Nome do cliente");
  });
});
