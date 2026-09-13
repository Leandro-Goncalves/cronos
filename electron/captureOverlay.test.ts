import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureDeps, CaptureMonitorBounds } from './captureOverlay'

type ConstructorArgs = Record<string, unknown>

let constructedWith: ConstructorArgs[] = []
let instances: FakeBrowserWindow[] = []

class FakeBrowserWindow {
  options: ConstructorArgs
  webContents = { send: vi.fn() }
  setAlwaysOnTop = vi.fn()
  close = vi.fn()

  constructor(options: ConstructorArgs) {
    this.options = options
    constructedWith.push(options)
    instances.push(this)
  }
}

function lastOverlayInstance(): FakeBrowserWindow | null {
  return instances[instances.length - 1] ?? null
}

vi.mock('electron', () => ({
  BrowserWindow: FakeBrowserWindow,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function fakeMainWindow() {
  return {
    minimize: vi.fn(),
    restore: vi.fn(),
    focus: vi.fn(),
  }
}

const monitorBounds: CaptureMonitorBounds = { x: 1920, y: 0, width: 1920, height: 1080 }
const targetApp = { name: 'Notepad', path: 'C:\\Notepad.lnk', iconPath: 'C:\\notepad.exe' }

let captureOverlay: typeof import('./captureOverlay')

beforeEach(async () => {
  vi.resetModules()
  constructedWith = []
  instances = []
  captureOverlay = await import('./captureOverlay')
})

function buildDeps(openAppOnDisplay: CaptureDeps['openAppOnDisplay'], mainWindow: ReturnType<typeof fakeMainWindow>) {
  return {
    openAppOnDisplay,
    mainWindow: mainWindow as unknown as CaptureDeps['mainWindow'],
    loadOverlayWindow: vi.fn(),
  } satisfies CaptureDeps
}

describe('captureOverlay', () => {
  it('test_startCapture_minimizesMainWindowBeforeOpeningApp', async () => {
    const mainWindow = fakeMainWindow()
    const openAppOnDisplay = vi.fn(() => new Promise<boolean>(() => {}))
    const deps = buildDeps(openAppOnDisplay, mainWindow)

    captureOverlay.startCapture({ targetApp, monitorBounds }, deps)

    expect(mainWindow.minimize).toHaveBeenCalled()
    expect(openAppOnDisplay).toHaveBeenCalled()
    expect(mainWindow.minimize.mock.invocationCallOrder[0]).toBeLessThan(
      openAppOnDisplay.mock.invocationCallOrder[0]
    )
  })

  it('test_startCapture_callsOpenAppOnDisplayWithExactRequestValues', async () => {
    const mainWindow = fakeMainWindow()
    const openAppOnDisplay = vi.fn(() => new Promise<boolean>(() => {}))
    const deps = buildDeps(openAppOnDisplay, mainWindow)

    captureOverlay.startCapture({ targetApp, monitorBounds }, deps)

    expect(openAppOnDisplay).toHaveBeenCalledWith(targetApp.path, targetApp.iconPath, monitorBounds)
  })

  it('test_startCapture_openSucceeds_createsOverlayWindowSizedToMonitorBounds', async () => {
    const mainWindow = fakeMainWindow()
    const openAppOnDisplay = vi.fn(() => Promise.resolve(true))
    const deps = buildDeps(openAppOnDisplay, mainWindow)

    captureOverlay.startCapture({ targetApp, monitorBounds }, deps)
    await flushMicrotasks()

    expect(constructedWith).toHaveLength(1)
    expect(constructedWith[0]).toMatchObject({
      x: monitorBounds.x,
      y: monitorBounds.y,
      width: monitorBounds.width,
      height: monitorBounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
    })
  })

  it('test_startCapture_openFails_neverCreatesInteractiveOverlayAndResolvesError', async () => {
    const mainWindow = fakeMainWindow()
    const openAppOnDisplay = vi.fn(() => Promise.resolve(false))
    const deps = buildDeps(openAppOnDisplay, mainWindow)

    const result = await captureOverlay.startCapture({ targetApp, monitorBounds }, deps)

    expect(result).toEqual({ status: 'error' })
    expect(lastOverlayInstance()?.close).toHaveBeenCalled()
    expect(lastOverlayInstance()?.webContents.send).not.toHaveBeenCalledWith('overlay:ready')
    expect(mainWindow.restore).toHaveBeenCalled()
    expect(mainWindow.focus).toHaveBeenCalled()
  })

  it('test_handleOverlayClick_resolvesCapturedWithExactPositionAndClosesOverlay', async () => {
    const mainWindow = fakeMainWindow()
    const openAppOnDisplay = vi.fn(() => Promise.resolve(true))
    const deps = buildDeps(openAppOnDisplay, mainWindow)

    const resultPromise = captureOverlay.startCapture({ targetApp, monitorBounds }, deps)
    await flushMicrotasks()

    captureOverlay.handleOverlayClick({ x: 512, y: 340 }, deps)

    await expect(resultPromise).resolves.toEqual({
      status: 'captured',
      position: { x: 512, y: 340 },
    })
    expect(lastOverlayInstance()?.close).toHaveBeenCalled()
    expect(mainWindow.restore).toHaveBeenCalled()
    expect(mainWindow.focus).toHaveBeenCalled()
  })

  it('test_handleOverlayCancel_resolvesCancelledAndClosesOverlay', async () => {
    const mainWindow = fakeMainWindow()
    const openAppOnDisplay = vi.fn(() => Promise.resolve(true))
    const deps = buildDeps(openAppOnDisplay, mainWindow)

    const resultPromise = captureOverlay.startCapture({ targetApp, monitorBounds }, deps)
    await flushMicrotasks()

    captureOverlay.handleOverlayCancel(deps)

    await expect(resultPromise).resolves.toEqual({ status: 'cancelled' })
    expect(lastOverlayInstance()?.close).toHaveBeenCalled()
    expect(mainWindow.restore).toHaveBeenCalled()
    expect(mainWindow.focus).toHaveBeenCalled()
  })

  it('test_secondConcurrentStartCapture_resolvesErrorImmediately', async () => {
    const mainWindow = fakeMainWindow()
    const openAppOnDisplay = vi.fn(() => new Promise<boolean>(() => {}))
    const deps = buildDeps(openAppOnDisplay, mainWindow)

    captureOverlay.startCapture({ targetApp, monitorBounds }, deps)
    const second = await captureOverlay.startCapture({ targetApp, monitorBounds }, deps)

    expect(second).toEqual({ status: 'error' })
    expect(openAppOnDisplay).toHaveBeenCalledTimes(1)
  })

  it('test_overlayReadySignal_sentOnlyAfterOpenSucceeds', async () => {
    const mainWindow = fakeMainWindow()
    const gate = deferred<boolean>()
    const openAppOnDisplay = vi.fn(() => gate.promise)
    const deps = buildDeps(openAppOnDisplay, mainWindow)

    captureOverlay.startCapture({ targetApp, monitorBounds }, deps)
    await flushMicrotasks()

    expect(lastOverlayInstance()?.webContents.send).not.toHaveBeenCalledWith('overlay:ready')

    gate.resolve(true)
    await flushMicrotasks()

    expect(lastOverlayInstance()?.webContents.send).toHaveBeenCalledWith('overlay:ready')
  })
})

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
