import { BrowserWindow } from 'electron'

export interface CaptureTargetApp {
  name: string
  path: string
  iconPath: string
}

export interface CaptureMonitorBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CapturePositionRequest {
  targetApp: CaptureTargetApp
  monitorBounds: CaptureMonitorBounds
}

export interface CapturePositionResult {
  status: 'captured' | 'cancelled' | 'error'
  position?: { x: number; y: number }
}

export interface CaptureDeps {
  openAppOnDisplay: (
    appPath: string,
    iconPath: string,
    displayBounds?: CaptureMonitorBounds
  ) => Promise<boolean>
  mainWindow: BrowserWindow | null
  loadOverlayWindow: (overlay: BrowserWindow, appName: string) => void
}

interface PendingCapture {
  resolve: (result: CapturePositionResult) => void
  overlay: BrowserWindow
}

let pending: PendingCapture | null = null

export function startCapture(
  request: CapturePositionRequest,
  deps: CaptureDeps
): Promise<CapturePositionResult> {
  if (pending) {
    return Promise.resolve({ status: 'error' })
  }

  return new Promise<CapturePositionResult>((resolve) => {
    deps.mainWindow?.minimize()

    const overlay = new BrowserWindow({
      x: request.monitorBounds.x,
      y: request.monitorBounds.y,
      width: request.monitorBounds.width,
      height: request.monitorBounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      fullscreenable: false,
    })
    overlay.setAlwaysOnTop(true, 'screen-saver')

    pending = { resolve, overlay }

    deps.loadOverlayWindow(overlay, request.targetApp.name)

    deps
      .openAppOnDisplay(request.targetApp.path, request.targetApp.iconPath, request.monitorBounds)
      .then((opened) => {
        if (!pending || pending.overlay !== overlay) return

        if (!opened) {
          finishCapture({ status: 'error' }, deps)
          return
        }

        overlay.webContents.send('overlay:ready')
      })
  })
}

function finishCapture(result: CapturePositionResult, deps: CaptureDeps) {
  if (!pending) return
  const { resolve, overlay } = pending
  pending = null
  overlay.close()
  deps.mainWindow?.restore()
  deps.mainWindow?.focus()
  resolve(result)
}

export function handleOverlayClick(position: { x: number; y: number }, deps: CaptureDeps) {
  finishCapture({ status: 'captured', position }, deps)
}

export function handleOverlayCancel(deps: CaptureDeps) {
  finishCapture({ status: 'cancelled' }, deps)
}
