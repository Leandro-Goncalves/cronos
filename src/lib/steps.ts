export interface StepPosition {
  x: number;
  y: number;
}

export interface ClickStepDraft {
  id: string;
  type: "click";
  position: StepPosition;
}

export interface AutoTypeStepDraft {
  id: string;
  type: "auto-type";
  position: StepPosition;
  text: string;
}

export interface PressKeyStepDraft {
  id: string;
  type: "press-key";
  key: string;
  modifiers: string[];
}

export interface WaitStepDraft {
  id: string;
  type: "wait";
  seconds: number;
}

export interface ManualTypeStepDraft {
  id: string;
  type: "manual-type";
  label: string;
  placeholder?: string;
}

export type StepDraft =
  | ClickStepDraft
  | AutoTypeStepDraft
  | PressKeyStepDraft
  | WaitStepDraft
  | ManualTypeStepDraft;

export type StepType = StepDraft["type"];

export const DEFAULT_DELAY_SECONDS = 2;
export const DELAY_MIN = 0.5;
export const DELAY_MAX = 30;

export const WAIT_SECONDS_MIN = 1;
export const WAIT_SECONDS_MAX = 60;

export const AUTO_TYPE_TEXT_MAX = 500;

export const MANUAL_LABEL_MAX = 40;
export const MANUAL_PLACEHOLDER_MAX = 100;

export const MAX_STEPS = 50;

export interface SelectOption {
  value: string;
  label: string;
}

// Mirrors electron/actionsStore.ts's PRESS_KEY_ALLOWED_KEYS with Portuguese display labels.
export const PRESS_KEY_OPTIONS: SelectOption[] = [
  { value: "Enter", label: "Enter" },
  { value: "Tab", label: "Tab" },
  { value: "Esc", label: "Esc" },
  { value: "Backspace", label: "Backspace" },
  { value: "Delete", label: "Delete" },
  { value: "Space", label: "Espaço" },
  { value: "ArrowUp", label: "Seta para cima" },
  { value: "ArrowDown", label: "Seta para baixo" },
  { value: "ArrowLeft", label: "Seta para esquerda" },
  { value: "ArrowRight", label: "Seta para direita" },
  { value: "Home", label: "Home" },
  { value: "End", label: "End" },
  { value: "PageUp", label: "Page Up" },
  { value: "PageDown", label: "Page Down" },
];

// Mirrors electron/actionsStore.ts's PRESS_KEY_ALLOWED_MODIFIERS with Portuguese display labels.
export const PRESS_KEY_MODIFIER_OPTIONS: SelectOption[] = [
  { value: "ctrl", label: "Ctrl" },
  { value: "alt", label: "Alt" },
  { value: "shift", label: "Shift" },
];

export function getKeyLabel(key: string): string {
  return PRESS_KEY_OPTIONS.find((option) => option.value === key)?.label ?? key;
}

export function getModifierLabel(modifier: string): string {
  return (
    PRESS_KEY_MODIFIER_OPTIONS.find((option) => option.value === modifier)
      ?.label ?? modifier
  );
}

export function summarizeStep(step: StepDraft): string {
  switch (step.type) {
    case "click":
      return `Click em (${step.position.x}, ${step.position.y})`;
    case "auto-type":
      return `Digitar: "${step.text}"`;
    case "press-key": {
      const modifierLabels = PRESS_KEY_MODIFIER_OPTIONS.filter((option) =>
        step.modifiers.includes(option.value)
      ).map((option) => option.label);
      const keyLabel = getKeyLabel(step.key);
      return `Pressionar: ${[...modifierLabels, keyLabel].join("+")}`;
    }
    case "wait":
      return `Esperar ${step.seconds}s`;
    case "manual-type":
      return `Manual: ${step.label}`;
  }
}
