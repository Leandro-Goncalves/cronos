import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown

let tmpDir: string
const handlers = new Map<string, Handler>()
const sentMessages: { channel: string; payload: unknown }[] = []
let whenReadyResolve: () => void
const runExecutionMock = vi.fn()

vi.mock('./automationEngine', () => ({
  runExecution: (...args: unknown[]) => runExecutionMock(...args),
}))

vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(() => tmpDir),
      whenReady: vi.fn(() => new Promise<void>((resolve) => { whenReadyResolve = resolve })),
      on: vi.fn(),
      getFileIcon: vi.fn(),
    },
    BrowserWindow: Object.assign(
      class {
        webContents = {
          on: vi.fn((event: string, listener: () => void) => {
            if (event === 'did-finish-load') listener()
          }),
          send: vi.fn((channel: string, payload: unknown) => {
            sentMessages.push({ channel, payload })
          }),
        }
        loadURL() {}
        loadFile() {}
      },
      { getAllWindows: () => [] }
    ),
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => {
        handlers.set(channel, handler)
      }),
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({ id: 1 })),
      getAllDisplays: vi.fn(() => []),
    },
    shell: {
      openPath: vi.fn(),
    },
  }
})

async function loadMain() {
  vi.resetModules()
  handlers.clear()
  sentMessages.length = 0
  await import('./main')
  whenReadyResolve()
  // flush the whenReady().then(...) microtask chain
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cronos-actions-ipc-test-'))
  runExecutionMock.mockReset()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('actions IPC handlers', () => {
  it('test_actionsListHandler_returnsStoreContents', async () => {
    await loadMain()
    const saveHandler = handlers.get('actions:save')!
    await saveHandler(null, {
      name: 'Ação',
      monitorId: 1,
      monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
      defaultDelaySeconds: 2,
      steps: [],
    })

    const listHandler = handlers.get('actions:list')!
    const result = await listHandler(null)

    expect(Array.isArray(result)).toBe(true)
    expect((result as unknown[])).toHaveLength(1)
  })

  it('test_actionsGetHandler_returnsMatchingAction', async () => {
    await loadMain()
    const saveHandler = handlers.get('actions:save')!
    const saved = (await saveHandler(null, {
      name: 'Ação',
      monitorId: 1,
      monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
      defaultDelaySeconds: 2,
      steps: [],
    })) as { action: { id: string } }

    const getHandler = handlers.get('actions:get')!
    const result = await getHandler(null, saved.action.id)

    expect((result as { id: string }).id).toBe(saved.action.id)
  })

  it('test_actionsSaveHandler_returnsSuccessResultShape', async () => {
    await loadMain()
    const saveHandler = handlers.get('actions:save')!
    const result = (await saveHandler(null, {
      name: 'Ação',
      monitorId: 1,
      monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
      defaultDelaySeconds: 2,
      steps: [],
    })) as { success: boolean; action: unknown }

    expect(result.success).toBe(true)
    expect(result.action).toBeTruthy()
  })

  it('test_actionsDeleteHandler_returnsSuccessResultShape', async () => {
    await loadMain()
    const saveHandler = handlers.get('actions:save')!
    const saved = (await saveHandler(null, {
      name: 'Ação',
      monitorId: 1,
      monitorBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
      defaultDelaySeconds: 2,
      steps: [],
    })) as { action: { id: string } }

    const deleteHandler = handlers.get('actions:delete')!
    const result = await deleteHandler(null, saved.action.id)

    expect(result).toEqual({ success: true })
  })

  it('test_startup_corruptedFile_pushesDataWarningMessage', async () => {
    fs.writeFileSync(path.join(tmpDir, 'actions.json'), 'not valid json', 'utf-8')

    await loadMain()

    const warning = sentMessages.find((m) => m.channel === 'actions:data-warning')
    expect(warning).toBeTruthy()
    expect(warning?.payload).toBe(
      'Não foi possível carregar suas ações salvas. Um novo arquivo será criado ao salvar a próxima ação.'
    )
  })

  it('test_executionRunHandler_delegatesToAutomationEngineWithRequestPayload', async () => {
    await loadMain()
    runExecutionMock.mockResolvedValue({ success: true, actionName: 'Ação' })

    const handler = handlers.get('execution:run')!
    const request = { actionId: 'a1', manualValues: { s1: 'valor' } }
    const result = await handler(null, request)

    expect(runExecutionMock).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ getWindow: expect.any(Function), openAppOnDisplay: expect.any(Function) })
    )
    expect(result).toEqual({ success: true, actionName: 'Ação' })
  })
})
