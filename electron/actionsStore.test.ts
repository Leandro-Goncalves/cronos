import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as actionsStore from './actionsStore'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cronos-actions-test-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function validPayload(overrides: Partial<actionsStore.ActionSavePayload> = {}): actionsStore.ActionSavePayload {
  return {
    name: 'Preencher relatório',
    monitorId: 1,
    monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
    defaultDelaySeconds: 2,
    steps: [{ id: 'step-1', type: 'click', position: { x: 10, y: 20 } }],
    ...overrides,
  }
}

describe('initStore', () => {
  it('test_loadStore_createsEmptyFileOnFirstRun', () => {
    const result = actionsStore.initStore(tmpDir)
    expect(result.corrupted).toBe(false)
    expect(actionsStore.listActions()).toEqual([])
    expect(fs.existsSync(path.join(tmpDir, 'actions.json'))).toBe(true)
  })

  it('test_loadStore_readsExistingValidFile', () => {
    const existing = [
      {
        id: 'a1',
        name: 'Ação existente',
        monitorId: 1,
        monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
        targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
        defaultDelaySeconds: 2,
        steps: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    fs.writeFileSync(path.join(tmpDir, 'actions.json'), JSON.stringify(existing), 'utf-8')

    const result = actionsStore.initStore(tmpDir)
    expect(result.corrupted).toBe(false)
    expect(actionsStore.listActions()).toEqual(existing)
  })

  it('test_loadStore_corruptedJson_startsEmptyAndBacksUpFile', () => {
    fs.writeFileSync(path.join(tmpDir, 'actions.json'), '{ not valid json', 'utf-8')

    const result = actionsStore.initStore(tmpDir)

    expect(result.corrupted).toBe(true)
    expect(actionsStore.listActions()).toEqual([])
    expect(fs.existsSync(path.join(tmpDir, 'actions.json.bak'))).toBe(true)
    expect(fs.readFileSync(path.join(tmpDir, 'actions.json.bak'), 'utf-8')).toBe('{ not valid json')
  })

  it('test_loadStore_corruptedJson_setsDataWarningFlag', () => {
    fs.writeFileSync(path.join(tmpDir, 'actions.json'), 'not json at all', 'utf-8')

    actionsStore.initStore(tmpDir)

    expect(actionsStore.wasDataCorrupted()).toBe(true)
  })
})

describe('saveAction', () => {
  beforeEach(() => {
    actionsStore.initStore(tmpDir)
  })

  it('test_saveAction_createAssignsIdAndCreatedAt', async () => {
    const result = await actionsStore.saveAction(validPayload())

    expect(result.success).toBe(true)
    expect(result.action?.id).toBeTruthy()
    expect(result.action?.createdAt).toBeTruthy()

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'actions.json'), 'utf-8'))
    expect(onDisk).toHaveLength(1)
    expect(onDisk[0].id).toBe(result.action?.id)
  })

  it('test_saveAction_editPreservesIdAndCreatedAt', async () => {
    const created = await actionsStore.saveAction(validPayload())
    const originalId = created.action!.id
    const originalCreatedAt = created.action!.createdAt

    const edited = await actionsStore.saveAction(
      validPayload({ id: originalId, name: 'Nome atualizado' })
    )

    expect(edited.success).toBe(true)
    expect(edited.action?.id).toBe(originalId)
    expect(edited.action?.createdAt).toBe(originalCreatedAt)
    expect(edited.action?.name).toBe('Nome atualizado')
  })

  it('test_saveAction_persistsAcrossReload', async () => {
    const created = await actionsStore.saveAction(validPayload())

    const reload = actionsStore.initStore(tmpDir)

    expect(reload.corrupted).toBe(false)
    expect(actionsStore.getAction(created.action!.id)).toEqual(created.action)
  })

  it('test_saveAction_singleMonitorStoresMonitorIdAndBounds', async () => {
    const result = await actionsStore.saveAction(
      validPayload({ monitorId: 1, monitorBounds: { x: 0, y: 0, width: 1280, height: 720 } })
    )

    expect(result.success).toBe(true)
    expect(result.action?.monitorId).toBe(1)
    expect(result.action?.monitorBounds).toEqual({ x: 0, y: 0, width: 1280, height: 720 })
  })

  it('test_saveAction_validationRejectsInvalidName', async () => {
    const empty = await actionsStore.saveAction(validPayload({ name: '' }))
    expect(empty.success).toBe(false)
    expect(empty.error).toBeTruthy()

    const tooLong = await actionsStore.saveAction(validPayload({ name: 'a'.repeat(61) }))
    expect(tooLong.success).toBe(false)

    expect(actionsStore.listActions()).toEqual([])
  })

  it('test_saveAction_validationRejectsStepCountOver50', async () => {
    const steps = Array.from({ length: 51 }, (_, i) => ({
      id: `step-${i}`,
      type: 'wait' as const,
      seconds: 1,
    }))

    const result = await actionsStore.saveAction(validPayload({ steps }))

    expect(result.success).toBe(false)
    expect(actionsStore.listActions()).toEqual([])
  })

  it('test_saveAction_validationRejectsUnknownEditId', async () => {
    const result = await actionsStore.saveAction(validPayload({ id: 'does-not-exist' }))

    expect(result).toEqual({ success: false, error: 'action not found' })
  })

  it('test_saveAction_writeFailureLeavesPreviousStateIntact', async () => {
    const created = await actionsStore.saveAction(validPayload())
    const storeBefore = actionsStore.listActions()
    const fileBefore = fs.readFileSync(path.join(tmpDir, 'actions.json'), 'utf-8')

    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    const result = await actionsStore.saveAction(validPayload({ id: created.action!.id, name: 'Outro nome' }))

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(actionsStore.listActions()).toEqual(storeBefore)
    expect(fs.readFileSync(path.join(tmpDir, 'actions.json'), 'utf-8')).toBe(fileBefore)
  })

  it('test_saveAction_concurrentWritesSerializeWithoutCorruption', async () => {
    const [first, second] = await Promise.all([
      actionsStore.saveAction(validPayload({ name: 'Ação 1' })),
      actionsStore.saveAction(validPayload({ name: 'Ação 2' })),
    ])

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'actions.json'), 'utf-8'))
    expect(onDisk).toHaveLength(2)
    const names = onDisk.map((a: actionsStore.Action) => a.name).sort()
    expect(names).toEqual(['Ação 1', 'Ação 2'])
  })
})

describe('deleteAction', () => {
  beforeEach(() => {
    actionsStore.initStore(tmpDir)
  })

  it('test_deleteAction_removesFromStoreAndFile', async () => {
    const created = await actionsStore.saveAction(validPayload())

    const result = await actionsStore.deleteAction(created.action!.id)

    expect(result).toEqual({ success: true })
    expect(actionsStore.listActions()).toEqual([])
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'actions.json'), 'utf-8'))
    expect(onDisk).toEqual([])
  })

  it('test_deleteAction_unknownIdReturnsFailure', async () => {
    const result = await actionsStore.deleteAction('does-not-exist')

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(actionsStore.listActions()).toEqual([])
  })
})

describe('read operations', () => {
  beforeEach(() => {
    actionsStore.initStore(tmpDir)
  })

  it('test_listActions_returnsFullInMemoryArray', async () => {
    await actionsStore.saveAction(validPayload({ name: 'Ação 1' }))
    await actionsStore.saveAction(validPayload({ name: 'Ação 2' }))
    const deleted = await actionsStore.saveAction(validPayload({ name: 'Ação 3' }))
    await actionsStore.deleteAction(deleted.action!.id)

    expect(actionsStore.listActions()).toHaveLength(2)
  })

  it('test_getAction_returnsNullForUnknownId', () => {
    expect(actionsStore.getAction('does-not-exist')).toBeNull()
  })
})

describe('full validation coverage across the save path', () => {
  beforeEach(() => {
    actionsStore.initStore(tmpDir)
  })

  it('rejects an invalid monitorId', async () => {
    const result = await actionsStore.saveAction(validPayload({ monitorId: 'x' as unknown as number }))
    expect(result.success).toBe(false)
  })

  it('rejects invalid monitorBounds', async () => {
    const result = await actionsStore.saveAction(
      validPayload({ monitorBounds: { x: 0, y: 0, width: NaN, height: 1080 } })
    )
    expect(result.success).toBe(false)
  })

  it('rejects an incomplete targetApp', async () => {
    const result = await actionsStore.saveAction(
      validPayload({ targetApp: { name: '', path: 'x', iconPath: 'x' } })
    )
    expect(result.success).toBe(false)
  })

  it('rejects defaultDelaySeconds out of range', async () => {
    const tooLow = await actionsStore.saveAction(validPayload({ defaultDelaySeconds: 0.1 }))
    expect(tooLow.success).toBe(false)

    const tooHigh = await actionsStore.saveAction(validPayload({ defaultDelaySeconds: 31 }))
    expect(tooHigh.success).toBe(false)
  })

  it('rejects an auto-type step with invalid text length', async () => {
    const result = await actionsStore.saveAction(
      validPayload({
        steps: [{ id: 's1', type: 'auto-type', position: { x: 0, y: 0 }, text: '' }],
      })
    )
    expect(result.success).toBe(false)
  })

  it('rejects a press-key step with a key outside the predefined list', async () => {
    const result = await actionsStore.saveAction(
      validPayload({
        steps: [{ id: 's1', type: 'press-key', key: 'F13', modifiers: [] }],
      })
    )
    expect(result.success).toBe(false)
  })

  it('rejects a press-key step with an invalid modifier', async () => {
    const result = await actionsStore.saveAction(
      validPayload({
        steps: [{ id: 's1', type: 'press-key', key: 'Enter', modifiers: ['cmd'] }],
      })
    )
    expect(result.success).toBe(false)
  })

  it('rejects a wait step outside 1-60 seconds', async () => {
    const result = await actionsStore.saveAction(
      validPayload({ steps: [{ id: 's1', type: 'wait', seconds: 0 }] })
    )
    expect(result.success).toBe(false)
  })

  it('rejects a manual-type step with an invalid label length', async () => {
    const result = await actionsStore.saveAction(
      validPayload({ steps: [{ id: 's1', type: 'manual-type', label: '' }] })
    )
    expect(result.success).toBe(false)
  })

  it('accepts a valid step of every type in a single action', async () => {
    const result = await actionsStore.saveAction(
      validPayload({
        steps: [
          { id: 's1', type: 'click', position: { x: 1, y: 2 } },
          { id: 's2', type: 'auto-type', position: { x: 1, y: 2 }, text: 'hello' },
          { id: 's3', type: 'press-key', key: 'Enter', modifiers: ['ctrl'] },
          { id: 's4', type: 'wait', seconds: 5 },
          { id: 's5', type: 'manual-type', label: 'Nome', placeholder: 'Digite o nome' },
        ],
      })
    )
    expect(result.success).toBe(true)
  })
})

// F01's side of the cross-feature contracts F02-F08 depend on (spec.md Section 7).
describe('cross-feature integration', () => {
  beforeEach(() => {
    actionsStore.initStore(tmpDir)
  })

  it('test_integration_savedActionExposesNameAppAndStepCountForListing', async () => {
    await actionsStore.saveAction(
      validPayload({
        name: 'Preencher relatório',
        targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
        steps: [
          { id: 's1', type: 'click', position: { x: 1, y: 2 } },
          { id: 's2', type: 'wait', seconds: 3 },
        ],
      })
    )

    const [listed] = actionsStore.listActions()
    expect(listed.name).toBe('Preencher relatório')
    expect(listed.targetApp.name).toBe('Notepad')
    expect(listed.steps).toHaveLength(2)
  })

  it('test_integration_getActionReturnsExactRecordForEditPrefill', async () => {
    const saved = await actionsStore.saveAction(
      validPayload({
        name: 'Ação de edição',
        monitorId: 2,
        monitorBounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        targetApp: { name: 'Chrome', path: 'C:\\Chrome.lnk', iconPath: 'C:\\chrome.exe' },
      })
    )

    const fetched = actionsStore.getAction(saved.action!.id)

    expect(fetched?.name).toBe('Ação de edição')
    expect(fetched?.monitorId).toBe(2)
    expect(fetched?.monitorBounds).toEqual({ x: 1920, y: 0, width: 2560, height: 1440 })
    expect(fetched?.targetApp).toEqual({ name: 'Chrome', path: 'C:\\Chrome.lnk', iconPath: 'C:\\chrome.exe' })
  })

  it('test_integration_editRoundTripsStepsAndDefaultDelayExactly', async () => {
    const steps: actionsStore.Step[] = [
      { id: 's1', type: 'click', position: { x: 5, y: 9 } },
      { id: 's2', type: 'wait', seconds: 7 },
    ]
    const saved = await actionsStore.saveAction(validPayload({ steps, defaultDelaySeconds: 4.5 }))

    actionsStore.initStore(tmpDir)
    const reloaded = actionsStore.getAction(saved.action!.id)
    expect(reloaded?.steps).toEqual(steps)
    expect(reloaded?.defaultDelaySeconds).toBe(4.5)

    const edited = await actionsStore.saveAction({
      ...validPayload({ steps: reloaded!.steps, defaultDelaySeconds: reloaded!.defaultDelaySeconds }),
      id: saved.action!.id,
      name: 'Nome alterado',
    })
    expect(edited.action?.steps).toEqual(steps)
    expect(edited.action?.defaultDelaySeconds).toBe(4.5)
  })

  it('test_integration_clickStepCoordinateRoundTripsExactly', async () => {
    const saved = await actionsStore.saveAction(
      validPayload({ steps: [{ id: 's1', type: 'click', position: { x: 512, y: 340 } }] })
    )

    const fetched = actionsStore.getAction(saved.action!.id)
    const clickStep = fetched?.steps[0] as actionsStore.ClickStep
    expect(clickStep.position).toEqual({ x: 512, y: 340 })
  })

  it('test_integration_targetAppAndMonitorRoundTripExactlyForCaptureAndExecution', async () => {
    const targetApp = { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' }
    const monitorBounds = { x: 0, y: 0, width: 1920, height: 1080 }
    const saved = await actionsStore.saveAction(validPayload({ monitorId: 3, monitorBounds, targetApp }))

    const fetched = actionsStore.getAction(saved.action!.id)
    expect(fetched?.targetApp).toEqual(targetApp)
    expect(fetched?.monitorId).toBe(3)
    expect(fetched?.monitorBounds).toEqual(monitorBounds)
  })

  it('test_integration_stepListDeterminesManualFieldsPresence', async () => {
    const withManual = await actionsStore.saveAction(
      validPayload({ steps: [{ id: 's1', type: 'manual-type', label: 'Nome' }] })
    )
    const withoutManual = await actionsStore.saveAction(
      validPayload({ steps: [{ id: 's1', type: 'wait', seconds: 2 }] })
    )

    const hasManual = (action: actionsStore.Action) => action.steps.some((s) => s.type === 'manual-type')

    expect(hasManual(actionsStore.getAction(withManual.action!.id)!)).toBe(true)
    expect(hasManual(actionsStore.getAction(withoutManual.action!.id)!)).toBe(false)
  })

  it('test_integration_deleteRemovesActionFromSubsequentList', async () => {
    const first = await actionsStore.saveAction(validPayload({ name: 'Fica' }))
    const second = await actionsStore.saveAction(validPayload({ name: 'Sai' }))

    await actionsStore.deleteAction(second.action!.id)

    const remaining = actionsStore.listActions()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(first.action!.id)
  })
})
