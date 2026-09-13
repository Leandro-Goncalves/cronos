import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutoTypeStep, ClickStep, ManualTypeStep, PressKeyStep, WaitStep } from './actionsStore'

const simulateClickMock = vi.fn()
const simulateTypeTextMock = vi.fn()
const simulateKeyPressMock = vi.fn()

vi.mock('./inputSimulation', () => ({
  simulateClick: (...args: unknown[]) => simulateClickMock(...args),
  simulateTypeText: (...args: unknown[]) => simulateTypeTextMock(...args),
  simulateKeyPress: (...args: unknown[]) => simulateKeyPressMock(...args),
}))

const bounds = { x: 1920, y: 0, width: 1920, height: 1080 }

beforeEach(() => {
  simulateClickMock.mockReset().mockResolvedValue(true)
  simulateTypeTextMock.mockReset().mockResolvedValue(true)
  simulateKeyPressMock.mockReset().mockResolvedValue(true)
})

describe('translateCoordinate', () => {
  it('test_clickStep_translatesRelativeCoordinateToCurrentAbsolutePosition', async () => {
    const { translateCoordinate } = await import('./automationEngine')

    const result = translateCoordinate({ x: 100, y: 50 }, bounds)

    expect(result).toEqual({ x: 2020, y: 50 })
  })
})

describe('resolveManualValue', () => {
  it('test_manualValue_returnsValueForMatchingStepId', async () => {
    const { resolveManualValue } = await import('./automationEngine')

    expect(resolveManualValue('s1', { s1: 'João Silva', s2: 'PED-4821' })).toBe('João Silva')
  })

  it('test_manualValue_missingKeyFallsBackToEmptyString', async () => {
    const { resolveManualValue } = await import('./automationEngine')

    expect(resolveManualValue('missing', {})).toBe('')
  })
})

describe('dispatchStep', () => {
  it('test_clickStep_simulatesClickAtTranslatedCoordinate', async () => {
    const { dispatchStep } = await import('./automationEngine')
    const step: ClickStep = { id: 's1', type: 'click', position: { x: 100, y: 50 } }

    const result = await dispatchStep(step, bounds, {})

    expect(result).toBe(true)
    expect(simulateClickMock).toHaveBeenCalledWith(2020, 50)
  })

  it('test_autoTypeStep_clicksThenTypesItsPresetText', async () => {
    const { dispatchStep } = await import('./automationEngine')
    const step: AutoTypeStep = {
      id: 's1',
      type: 'auto-type',
      position: { x: 10, y: 20 },
      text: 'relatorio_final',
    }

    const result = await dispatchStep(step, bounds, {})

    expect(result).toBe(true)
    expect(simulateClickMock).toHaveBeenCalledWith(1930, 20)
    expect(simulateTypeTextMock).toHaveBeenCalledWith('relatorio_final')
  })

  it('test_autoTypeStep_clickFailureStopsBeforeTyping', async () => {
    simulateClickMock.mockResolvedValueOnce(false)
    const { dispatchStep } = await import('./automationEngine')
    const step: AutoTypeStep = { id: 's1', type: 'auto-type', position: { x: 0, y: 0 }, text: 'x' }

    const result = await dispatchStep(step, bounds, {})

    expect(result).toBe(false)
    expect(simulateTypeTextMock).not.toHaveBeenCalled()
  })

  it('test_manualTypeStep_typesResolvedValueWithoutClicking', async () => {
    const { dispatchStep } = await import('./automationEngine')
    const step: ManualTypeStep = { id: 's1', type: 'manual-type', label: 'Nome' }

    const result = await dispatchStep(step, bounds, { s1: 'João Silva' })

    expect(result).toBe(true)
    expect(simulateClickMock).not.toHaveBeenCalled()
    expect(simulateTypeTextMock).toHaveBeenCalledWith('João Silva')
  })

  it('test_manualTypeStep_missingValueFallsBackToEmptyStringWithoutThrowing', async () => {
    const { dispatchStep } = await import('./automationEngine')
    const step: ManualTypeStep = { id: 's1', type: 'manual-type', label: 'Nome' }

    const result = await dispatchStep(step, bounds, {})

    expect(result).toBe(true)
    expect(simulateTypeTextMock).toHaveBeenCalledWith('')
  })

  it('test_pressKeyStep_simulatesExactKeyAndModifierCombination', async () => {
    const { dispatchStep } = await import('./automationEngine')
    const step: PressKeyStep = { id: 's1', type: 'press-key', key: 'Enter', modifiers: ['ctrl'] }

    const result = await dispatchStep(step, bounds, {})

    expect(result).toBe(true)
    expect(simulateKeyPressMock).toHaveBeenCalledWith('Enter', ['ctrl'])
  })

  it('test_waitStep_pausesConfiguredSecondsAndSucceeds', async () => {
    vi.useFakeTimers()
    const { dispatchStep } = await import('./automationEngine')
    const step: WaitStep = { id: 's1', type: 'wait', seconds: 3 }

    const promise = dispatchStep(step, bounds, {})
    await vi.advanceTimersByTimeAsync(3000)
    const result = await promise

    expect(result).toBe(true)
    vi.useRealTimers()
  })
})
