import fs from 'node:fs'
import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { getAction } from './actionsStore'
import type { Step } from './actionsStore'
import { simulateClick, simulateKeyPress, simulateTypeText } from './inputSimulation'

export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

// Step-type display labels for the "interrupted at step [n]" toast, per F08 spec Section 6 —
// kept consistent with the Portuguese step-type nouns F05's step summaries already establish.
export const STEP_TYPE_LABELS: Record<Step['type'], string> = {
  click: 'Click',
  'auto-type': 'Digitar',
  'press-key': 'Pressionar',
  wait: 'Esperar',
  'manual-type': 'Manual',
}

/**
 * Translates a step's monitor-relative captured position into the monitor's current absolute
 * screen position, per F08 spec Section 6: absoluteX = currentBounds.x + step.position.x.
 */
export function translateCoordinate(
  position: { x: number; y: number },
  currentBounds: DisplayBounds
): { x: number; y: number } {
  return { x: currentBounds.x + position.x, y: currentBounds.y + position.y }
}

/**
 * Resolves a manual-type step's typed text from the incoming manual values map, keyed by step
 * id. Falls back to an empty string when the key is unexpectedly missing (defensive; F07's
 * contract should always supply every manual-type step's id).
 */
export function resolveManualValue(stepId: string, manualValues: Record<string, string>): string {
  return manualValues[stepId] ?? ''
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

/**
 * Dispatches a single step to the appropriate input-simulation primitive(s). Returns whether the
 * step succeeded; a `false` result stops the whole run at the orchestration layer.
 */
export async function dispatchStep(
  step: Step,
  currentBounds: DisplayBounds,
  manualValues: Record<string, string>
): Promise<boolean> {
  switch (step.type) {
    case 'click': {
      const { x, y } = translateCoordinate(step.position, currentBounds)
      return simulateClick(x, y)
    }
    case 'auto-type': {
      const { x, y } = translateCoordinate(step.position, currentBounds)
      const clicked = await simulateClick(x, y)
      if (!clicked) return false
      return simulateTypeText(step.text)
    }
    case 'manual-type': {
      // No recorded position for manual-type steps: no click is simulated, per spec Assumptions —
      // the preceding step's click (or the target app's own tab order) is expected to already
      // hold keyboard focus on the right control.
      const value = resolveManualValue(step.id, manualValues)
      return simulateTypeText(value)
    }
    case 'press-key':
      return simulateKeyPress(step.key, step.modifiers)
    case 'wait':
      await delay(step.seconds * 1000)
      return true
    default:
      return true
  }
}

export interface ExecutionRequest {
  actionId: string
  manualValues: Record<string, string>
}

export interface ExecutionResult {
  success: boolean
  actionName?: string
  errorMessage?: string
}

export type OpenAppOnDisplayFn = (
  appPath: string,
  iconPath: string,
  displayBounds?: DisplayBounds
) => Promise<boolean>

export interface RunExecutionDeps {
  getWindow: () => BrowserWindow | null
  openAppOnDisplay: OpenAppOnDisplayFn
}

const ACTION_NOT_FOUND_MESSAGE = 'Não foi possível executar a ação: ela pode ter sido excluída.'
const MONITOR_NOT_FOUND_MESSAGE =
  'O monitor configurado para esta ação não foi encontrado. Edite a ação para selecionar outro monitor.'

/**
 * Runs the full F08 execution orchestration: loads the action, validates its configured monitor
 * still exists (before minimizing, so Cronos stays visible on that failure per the PRD), minimizes
 * Cronos, opens/focuses the target app, runs every step in saved order applying the default delay
 * between them, then restores Cronos and reports the final result.
 */
export async function runExecution(request: ExecutionRequest, deps: RunExecutionDeps): Promise<ExecutionResult> {
  const action = getAction(request.actionId)
  if (!action) {
    return { success: false, errorMessage: ACTION_NOT_FOUND_MESSAGE }
  }

  const currentDisplay = screen.getAllDisplays().find((display) => display.id === action.monitorId)
  if (!currentDisplay) {
    return { success: false, errorMessage: MONITOR_NOT_FOUND_MESSAGE }
  }

  const bounds = currentDisplay.bounds as DisplayBounds
  const win = deps.getWindow()
  win?.minimize()

  function restoreCronos() {
    win?.restore()
    win?.show()
  }

  if (!fs.existsSync(action.targetApp.path)) {
    restoreCronos()
    return { success: false, errorMessage: `Não foi possível abrir ${action.targetApp.name}.` }
  }

  const opened = await deps.openAppOnDisplay(action.targetApp.path, action.targetApp.iconPath, bounds)
  if (!opened) {
    restoreCronos()
    return { success: false, errorMessage: `Não foi possível encontrar a janela de ${action.targetApp.name}.` }
  }

  for (let i = 0; i < action.steps.length; i++) {
    if (i > 0) {
      await delay(action.defaultDelaySeconds * 1000)
    }

    const step = action.steps[i]
    const succeeded = await dispatchStep(step, bounds, request.manualValues)
    if (!succeeded) {
      restoreCronos()
      return {
        success: false,
        errorMessage: `A execução foi interrompida no passo ${i + 1}: ${STEP_TYPE_LABELS[step.type]}.`,
      }
    }
  }

  restoreCronos()
  return { success: true, actionName: action.name }
}
