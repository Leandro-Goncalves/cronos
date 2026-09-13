import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { Action, AutoTypeStep, ClickStep, ManualTypeStep, PressKeyStep, WaitStep } from './actionsStore'

const simulateClickMock = vi.fn()
const simulateTypeTextMock = vi.fn()
const simulateKeyPressMock = vi.fn()
const getAllDisplaysMock = vi.fn()
const getActionMock = vi.fn()
const existsSyncMock = vi.fn()

vi.mock('./inputSimulation', () => ({
  simulateClick: (...args: unknown[]) => simulateClickMock(...args),
  simulateTypeText: (...args: unknown[]) => simulateTypeTextMock(...args),
  simulateKeyPress: (...args: unknown[]) => simulateKeyPressMock(...args),
}))

vi.mock('electron', () => ({
  screen: { getAllDisplays: (...args: unknown[]) => getAllDisplaysMock(...args) },
}))

vi.mock('./actionsStore', () => ({
  getAction: (...args: unknown[]) => getActionMock(...args),
}))

vi.mock('node:fs', () => ({
  default: { existsSync: (...args: unknown[]) => existsSyncMock(...args) },
}))

const bounds = { x: 1920, y: 0, width: 1920, height: 1080 }

function baseAction(overrides: Partial<Action> = {}): Action {
  return {
    id: 'a1',
    name: 'Preencher relatório',
    monitorId: 1,
    monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
    defaultDelaySeconds: 2,
    steps: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeWindow() {
  return { minimize: vi.fn(), restore: vi.fn(), show: vi.fn() } as unknown as BrowserWindow & {
    minimize: ReturnType<typeof vi.fn>
    restore: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  simulateClickMock.mockReset().mockResolvedValue(true)
  simulateTypeTextMock.mockReset().mockResolvedValue(true)
  simulateKeyPressMock.mockReset().mockResolvedValue(true)
  getAllDisplaysMock.mockReset().mockReturnValue([{ id: 1, bounds }])
  getActionMock.mockReset().mockReturnValue(baseAction())
  existsSyncMock.mockReset().mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
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

describe('runExecution orchestration', () => {
  it('test_actionNotFound_treatedAsFailureWithoutMinimizing', async () => {
    getActionMock.mockReturnValue(null)
    const { runExecution } = await import('./automationEngine')
    const win = makeWindow()

    const result = await runExecution(
      { actionId: 'missing', manualValues: {} },
      { getWindow: () => win, openAppOnDisplay: vi.fn() }
    )

    expect(win.minimize).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      errorMessage: 'Não foi possível executar a ação: ela pode ter sido excluída.',
    })
  })

  it('test_monitorMissing_cancelsBeforeMinimizingAndShowsConfiguredMonitorToast', async () => {
    getAllDisplaysMock.mockReturnValue([{ id: 999, bounds }])
    const { runExecution } = await import('./automationEngine')
    const win = makeWindow()

    const result = await runExecution(
      { actionId: 'a1', manualValues: {} },
      { getWindow: () => win, openAppOnDisplay: vi.fn() }
    )

    expect(win.minimize).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      errorMessage: 'O monitor configurado para esta ação não foi encontrado. Edite a ação para selecionar outro monitor.',
    })
  })

  it('test_happyPath_minimizesBeforeOpeningAppAndBeforeAnyStep', async () => {
    getActionMock.mockReturnValue(
      baseAction({ steps: [{ id: 's1', type: 'click', position: { x: 0, y: 0 } }] })
    )
    const callOrder: string[] = []
    simulateClickMock.mockImplementation(async () => {
      callOrder.push('click')
      return true
    })
    const openAppOnDisplay = vi.fn(async () => {
      callOrder.push('open')
      return true
    })
    const win = makeWindow()
    win.minimize.mockImplementation(() => callOrder.push('minimize'))

    const { runExecution } = await import('./automationEngine')
    await runExecution({ actionId: 'a1', manualValues: {} }, { getWindow: () => win, openAppOnDisplay })

    expect(callOrder).toEqual(['minimize', 'open', 'click'])
    expect(openAppOnDisplay).toHaveBeenCalledWith('C:\\Notepad.lnk', 'C:\\notepad.exe', bounds)
  })

  it('test_stepsExecuteInSavedOrderWithDefaultDelayBetweenThem', async () => {
    vi.useFakeTimers()
    const order: string[] = []
    simulateClickMock.mockImplementation(async () => {
      order.push(`click@${Date.now()}`)
      return true
    })
    getActionMock.mockReturnValue(
      baseAction({
        defaultDelaySeconds: 2,
        steps: [
          { id: 's1', type: 'click', position: { x: 0, y: 0 } },
          { id: 's2', type: 'click', position: { x: 0, y: 0 } },
          { id: 's3', type: 'click', position: { x: 0, y: 0 } },
        ],
      })
    )
    const win = makeWindow()
    const { runExecution } = await import('./automationEngine')

    const start = Date.now()
    const promise = runExecution(
      { actionId: 'a1', manualValues: {} },
      { getWindow: () => win, openAppOnDisplay: vi.fn(async () => true) }
    )
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(2000)
    await promise

    expect(order).toEqual([`click@${start}`, `click@${start + 2000}`, `click@${start + 4000}`])
  })

  it('test_waitStep_pausesConfiguredSecondsInAdditionToDefaultDelay', async () => {
    vi.useFakeTimers()
    const order: string[] = []
    simulateClickMock.mockImplementation(async () => {
      order.push(`click@${Date.now()}`)
      return true
    })
    getActionMock.mockReturnValue(
      baseAction({
        defaultDelaySeconds: 2,
        steps: [
          { id: 's1', type: 'click', position: { x: 0, y: 0 } },
          { id: 's2', type: 'wait', seconds: 3 },
          { id: 's3', type: 'click', position: { x: 0, y: 0 } },
        ],
      })
    )
    const win = makeWindow()
    const { runExecution } = await import('./automationEngine')

    const start = Date.now()
    const promise = runExecution(
      { actionId: 'a1', manualValues: {} },
      { getWindow: () => win, openAppOnDisplay: vi.fn(async () => true) }
    )
    await vi.advanceTimersByTimeAsync(0) // step 1 (no leading delay)
    await vi.advanceTimersByTimeAsync(2000) // default delay before wait step
    await vi.advanceTimersByTimeAsync(3000) // wait step's own extra pause
    await vi.advanceTimersByTimeAsync(2000) // default delay before step 3
    await promise

    // step1 at t0, step3 at t0 + 2000(default) + 3000(wait) + 2000(default) = t0 + 7000
    expect(order).toEqual([`click@${start}`, `click@${start + 7000}`])
  })

  it('test_appCannotBeOpenedAtAll_targetPathMissing_cancelsBeforeAnyStepAndShowsCannotOpenToast', async () => {
    existsSyncMock.mockReturnValue(false)
    getActionMock.mockReturnValue(
      baseAction({ steps: [{ id: 's1', type: 'click', position: { x: 0, y: 0 } }] })
    )
    const win = makeWindow()
    const openAppOnDisplay = vi.fn()
    const { runExecution } = await import('./automationEngine')

    const result = await runExecution({ actionId: 'a1', manualValues: {} }, { getWindow: () => win, openAppOnDisplay })

    expect(openAppOnDisplay).not.toHaveBeenCalled()
    expect(simulateClickMock).not.toHaveBeenCalled()
    expect(win.restore).toHaveBeenCalled()
    expect(result).toEqual({ success: false, errorMessage: 'Não foi possível abrir Notepad.' })
  })

  it('test_windowNotFoundAfterRetries_cancelsBeforeAnyStepAndShowsWindowNotFoundToast', async () => {
    getActionMock.mockReturnValue(
      baseAction({ steps: [{ id: 's1', type: 'click', position: { x: 0, y: 0 } }] })
    )
    const win = makeWindow()
    const openAppOnDisplay = vi.fn(async () => false)
    const { runExecution } = await import('./automationEngine')

    const result = await runExecution({ actionId: 'a1', manualValues: {} }, { getWindow: () => win, openAppOnDisplay })

    expect(simulateClickMock).not.toHaveBeenCalled()
    expect(win.restore).toHaveBeenCalled()
    expect(result).toEqual({ success: false, errorMessage: 'Não foi possível encontrar a janela de Notepad.' })
  })

  it('test_midSequenceStepFailure_stopsRemainingStepsAndNamesFailedStepInToast', async () => {
    getActionMock.mockReturnValue(
      baseAction({
        defaultDelaySeconds: 0.001,
        steps: [
          { id: 's1', type: 'click', position: { x: 0, y: 0 } },
          { id: 's2', type: 'click', position: { x: 0, y: 0 } },
          { id: 's3', type: 'auto-type', position: { x: 0, y: 0 }, text: 'x' },
          { id: 's4', type: 'click', position: { x: 0, y: 0 } },
          { id: 's5', type: 'click', position: { x: 0, y: 0 } },
        ],
      })
    )
    let clickCalls = 0
    simulateClickMock.mockImplementation(async () => {
      clickCalls += 1
      // third click call corresponds to step 3 (auto-type)'s click
      return clickCalls !== 3
    })
    const win = makeWindow()
    const { runExecution } = await import('./automationEngine')

    const result = await runExecution(
      { actionId: 'a1', manualValues: {} },
      { getWindow: () => win, openAppOnDisplay: vi.fn(async () => true) }
    )

    expect(clickCalls).toBe(3)
    expect(simulateTypeTextMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      errorMessage: 'A execução foi interrompida no passo 3: Digitar.',
    })
  })

  it('test_successfulCompletion_restoresCronosAndReturnsActionName', async () => {
    getActionMock.mockReturnValue(
      baseAction({ name: 'Preencher relatório', steps: [{ id: 's1', type: 'click', position: { x: 0, y: 0 } }] })
    )
    const win = makeWindow()
    const { runExecution } = await import('./automationEngine')

    const result = await runExecution(
      { actionId: 'a1', manualValues: {} },
      { getWindow: () => win, openAppOnDisplay: vi.fn(async () => true) }
    )

    expect(win.restore).toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    expect(result).toEqual({ success: true, actionName: 'Preencher relatório' })
  })

  it('test_manualTypeStep_valuesAppliedByCorrectStepId', async () => {
    getActionMock.mockReturnValue(
      baseAction({
        defaultDelaySeconds: 0.001,
        steps: [
          { id: 's1', type: 'manual-type', label: 'Nome' },
          { id: 's2', type: 'manual-type', label: 'Pedido' },
        ],
      })
    )
    const win = makeWindow()
    const { runExecution } = await import('./automationEngine')

    await runExecution(
      { actionId: 'a1', manualValues: { s1: 'João Silva', s2: 'PED-4821' } },
      { getWindow: () => win, openAppOnDisplay: vi.fn(async () => true) }
    )

    expect(simulateTypeTextMock).toHaveBeenNthCalledWith(1, 'João Silva')
    expect(simulateTypeTextMock).toHaveBeenNthCalledWith(2, 'PED-4821')
  })
})
