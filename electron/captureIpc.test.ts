import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown

let tmpDir: string
const handlers = new Map<string, Handler>()
let whenReadyResolve: () => void
let execFileStdout = 'FOUND'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: unknown, stdout: string) => void
    ) => {
      callback(null, execFileStdout)
    }
  ),
}))

class FakeBrowserWindow {
  webContents = {
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'did-finish-load') listener()
    }),
    send: vi.fn(),
  }
  minimize = vi.fn()
  restore = vi.fn()
  focus = vi.fn()
  close = vi.fn()
  setAlwaysOnTop = vi.fn()
  loadURL = vi.fn()
  loadFile = vi.fn()

  static getAllWindows() {
    return []
  }
}

vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(() => tmpDir),
      whenReady: vi.fn(() => new Promise<void>((resolve) => { whenReadyResolve = resolve })),
      on: vi.fn(),
      getFileIcon: vi.fn(),
    },
    BrowserWindow: FakeBrowserWindow,
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
  execFileStdout = 'FOUND'
  await import('./main')
  whenReadyResolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cronos-capture-ipc-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const sampleRequest = {
  targetApp: { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' },
  monitorBounds: { x: 1920, y: 0, width: 1920, height: 1080 },
}

describe('capture IPC handlers', () => {
  it('test_captureStartHandler_registered', async () => {
    await loadMain()

    expect(handlers.has('capture:start')).toBe(true)
    expect(handlers.has('capture:click')).toBe(true)
    expect(handlers.has('capture:cancel')).toBe(true)
  })

  it('test_captureStartHandler_endToEnd_capturedFlow', async () => {
    await loadMain()

    const startHandler = handlers.get('capture:start')!
    const clickHandler = handlers.get('capture:click')!

    const startPromise = startHandler(null, sampleRequest)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    await clickHandler(null, { x: 512, y: 340 })

    await expect(startPromise).resolves.toEqual({
      status: 'captured',
      position: { x: 512, y: 340 },
    })
  })

  it('test_captureStartHandler_endToEnd_cancelledFlow', async () => {
    await loadMain()

    const startHandler = handlers.get('capture:start')!
    const cancelHandler = handlers.get('capture:cancel')!

    const startPromise = startHandler(null, sampleRequest)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    await cancelHandler(null)

    await expect(startPromise).resolves.toEqual({ status: 'cancelled' })
  })
})
