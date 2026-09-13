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
