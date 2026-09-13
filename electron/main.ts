import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import * as actionsStore from './actionsStore'
import * as captureOverlay from './captureOverlay'
import * as automationEngine from './automationEngine'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

interface AppInfo {
  name: string
  path: string
  iconPath: string
}

interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

function resolveShortcutTargets(shortcutPaths: string[]): Promise<Map<string, string>> {
  return new Promise((resolvePromise) => {
    if (shortcutPaths.length === 0) {
      resolvePromise(new Map())
      return
    }

    const inputFile = path.join(os.tmpdir(), `cronos-shortcuts-in-${randomUUID()}.json`)
    const outputFile = path.join(os.tmpdir(), `cronos-shortcuts-out-${randomUUID()}.json`)
    fs.writeFileSync(inputFile, JSON.stringify(shortcutPaths), 'utf-8')

    const script = [
      '$ErrorActionPreference = "SilentlyContinue"',
      `$paths = Get-Content -Raw -Path '${inputFile}' | ConvertFrom-Json`,
      '$shell = New-Object -ComObject WScript.Shell',
      '$result = @{}',
      'foreach ($p in $paths) {',
      '  try {',
      '    $result[$p] = $shell.CreateShortcut($p).TargetPath',
      '  } catch {',
      '    $result[$p] = ""',
      '  }',
      '}',
      `$result | ConvertTo-Json | Set-Content -Path '${outputFile}' -Encoding UTF8`,
    ].join('; ')

    const cleanup = () => {
      fs.unlink(inputFile, () => {})
      fs.unlink(outputFile, () => {})
    }

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 20000 },
      () => {
        const map = new Map<string, string>()
        try {
          let raw = fs.readFileSync(outputFile, 'utf-8')
          if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
          const parsed = JSON.parse(raw)
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value) map.set(key, value)
          }
        } catch {
          // resolution failed; callers fall back to the shortcut path itself
        }
        cleanup()
        resolvePromise(map)
      }
    )
  })
}

const WIN32_TYPE_DEFINITION = `
using System;
using System.Runtime.InteropServices;

public class CronosWin32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct WINDOWPLACEMENT {
        public int length;
        public int flags;
        public int showCmd;
        public POINT ptMinPosition;
        public POINT ptMaxPosition;
        public RECT rcNormalPosition;
    }

    [DllImport("user32.dll")]
    public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
}
`

function focusRunningApp(exePath: string, displayBounds?: DisplayBounds): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)

  return new Promise((resolvePromise) => {
    const escapedPath = exePath.replace(/'/g, "''")
    const escapedTypeDef = WIN32_TYPE_DEFINITION.replace(/'/g, "''")

    const placementLines = displayBounds
      ? [
          '  $wp = New-Object CronosWin32+WINDOWPLACEMENT',
          '  $wp.length = [System.Runtime.InteropServices.Marshal]::SizeOf($wp)',
          '  [CronosWin32]::GetWindowPlacement($proc.MainWindowHandle, [ref]$wp) | Out-Null',
          '  $wp.showCmd = 3',
          '  $rect = New-Object CronosWin32+RECT',
          `  $rect.Left = ${displayBounds.x}`,
          `  $rect.Top = ${displayBounds.y}`,
          `  $rect.Right = ${displayBounds.x + displayBounds.width}`,
          `  $rect.Bottom = ${displayBounds.y + displayBounds.height}`,
          '  $wp.rcNormalPosition = $rect',
          '  [CronosWin32]::SetWindowPlacement($proc.MainWindowHandle, [ref]$wp) | Out-Null',
        ]
      : ['  [CronosWin32]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null']

    const script = [
      '$ErrorActionPreference = "SilentlyContinue"',
      `Add-Type -TypeDefinition '${escapedTypeDef}'`,
      '[CronosWin32]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null',
      `$target = '${escapedPath}'`,
      '$proc = Get-Process | Where-Object { $_.Path -and ($_.Path -ieq $target) -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1',
      'if ($proc) {',
      ...placementLines,
      '  [CronosWin32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null',
      '  Write-Output "FOUND"',
      '} else {',
      '  Write-Output "NOTFOUND"',
      '}',
    ].join('\n')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 10000 },
      (_error, stdout) => {
        resolvePromise(stdout.trim() === 'FOUND')
      }
    )
  })
}

function delay(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

export async function openAppOnDisplay(appPath: string, iconPath: string, displayBounds?: DisplayBounds): Promise<boolean> {
  if (await focusRunningApp(iconPath, displayBounds)) return true

  await shell.openPath(appPath)

  let found = false
  for (let attempt = 0; attempt < 10 && !found; attempt++) {
    await delay(500)
    found = await focusRunningApp(iconPath, displayBounds)
  }

  if (found && displayBounds) {
    // Many apps restore their own last window position/monitor shortly after
    // creating their window, undoing our placement — reassert it a few more
    // times to win that race.
    for (let i = 0; i < 4; i++) {
      await delay(400)
      await focusRunningApp(iconPath, displayBounds)
    }
  }

  return found
}

function walkDir(dir: string, onFile: (fullPath: string, entry: fs.Dirent) => void) {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(fullPath, onFile)
    } else if (entry.isFile()) {
      onFile(fullPath, entry)
    }
  }
}

async function listWindowsApps(): Promise<AppInfo[]> {
  const dirs = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.ProgramData && path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter((dir): dir is string => !!dir)

  const shortcuts = new Map<string, string>()
  for (const dir of dirs) {
    walkDir(dir, (fullPath, entry) => {
      if (entry.name.toLowerCase().endsWith('.lnk')) {
        const name = entry.name.slice(0, -4)
        if (!shortcuts.has(name.toLowerCase())) {
          shortcuts.set(name.toLowerCase(), fullPath)
        }
      }
    })
  }

  const targets = await resolveShortcutTargets(Array.from(shortcuts.values()))

  const apps = Array.from(shortcuts.entries()).map(([, fullPath]) => ({
    name: path.basename(fullPath, '.lnk'),
    path: fullPath,
    iconPath: targets.get(fullPath) || fullPath,
  }))

  return apps.sort((a, b) => a.name.localeCompare(b.name))
}

function listMacApps(): AppInfo[] {
  const dirs = ['/Applications', path.join(app.getPath('home'), 'Applications')]
  const apps = new Map<string, AppInfo>()
  for (const dir of dirs) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith('.app')) {
        const name = entry.name.slice(0, -4)
        const fullPath = path.join(dir, entry.name)
        apps.set(name.toLowerCase(), { name, path: fullPath, iconPath: fullPath })
      }
    }
  }
  return Array.from(apps.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function listLinuxApps(): AppInfo[] {
  const dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    path.join(app.getPath('home'), '.local', 'share', 'applications'),
  ]
  const apps = new Map<string, AppInfo>()
  for (const dir of dirs) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.desktop')) {
        const fullPath = path.join(dir, entry.name)
        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          if (/^NoDisplay=true$/m.test(content)) continue
          const nameMatch = content.match(/^Name=(.+)$/m)
          if (nameMatch) {
            const name = nameMatch[1].trim()
            apps.set(name.toLowerCase(), { name, path: fullPath, iconPath: fullPath })
          }
        } catch {
          continue
        }
      }
    }
  }
  return Array.from(apps.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function listApps(): Promise<AppInfo[]> | AppInfo[] {
  if (process.platform === 'win32') return listWindowsApps()
  if (process.platform === 'darwin') return listMacApps()
  return listLinuxApps()
}

const iconCache = new Map<string, string | null>()

ipcMain.handle('apps:list', () => listApps())
ipcMain.handle('apps:open', (_event, appPath: string, iconPath: string, displayBounds?: DisplayBounds) =>
  openAppOnDisplay(appPath, iconPath, displayBounds)
)
ipcMain.handle('apps:focus', (_event, exePath: string, displayBounds?: DisplayBounds) =>
  focusRunningApp(exePath, displayBounds)
)
ipcMain.handle('displays:list', () => {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: `Monitor ${index + 1}${display.id === primaryId ? ' (principal)' : ''}`,
    bounds: display.bounds,
  }))
})
ipcMain.handle('apps:icon', async (_event, appPath: string) => {
  if (iconCache.has(appPath)) return iconCache.get(appPath) ?? null
  try {
    const icon = await app.getFileIcon(appPath, { size: 'normal' })
    const dataUrl = icon.toDataURL()
    iconCache.set(appPath, dataUrl)
    return dataUrl
  } catch {
    iconCache.set(appPath, null)
    return null
  }
})

ipcMain.handle('actions:list', () => actionsStore.listActions())
ipcMain.handle('actions:get', (_event, id: string) => actionsStore.getAction(id))
ipcMain.handle('actions:save', (_event, payload: actionsStore.ActionSavePayload) => actionsStore.saveAction(payload))
ipcMain.handle('actions:delete', (_event, id: string) => actionsStore.deleteAction(id))

function loadOverlayWindow(overlay: BrowserWindow, appName: string) {
  const query = `capture=1&app=${encodeURIComponent(appName)}`
  if (VITE_DEV_SERVER_URL) {
    overlay.loadURL(`${VITE_DEV_SERVER_URL}?${query}`)
  } else {
    overlay.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      query: { capture: '1', app: appName },
    })
  }
}

function getCaptureDeps(): captureOverlay.CaptureDeps {
  return {
    openAppOnDisplay,
    mainWindow: win,
    loadOverlayWindow,
  }
}

ipcMain.handle('capture:start', (_event, request: captureOverlay.CapturePositionRequest) =>
  captureOverlay.startCapture(request, getCaptureDeps())
)
ipcMain.handle('capture:click', (_event, position: { x: number; y: number }) => {
  captureOverlay.handleOverlayClick(position, getCaptureDeps())
  return { acknowledged: true }
})
ipcMain.handle('capture:cancel', () => {
  captureOverlay.handleOverlayCancel(getCaptureDeps())
  return { acknowledged: true }
})

ipcMain.handle('execution:run', (_event, request: automationEngine.ExecutionRequest) =>
  automationEngine.runExecution(request, { getWindow: () => win, openAppOnDisplay })
)

let pendingDataWarning = false

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
    if (pendingDataWarning) {
      pendingDataWarning = false
      win?.webContents.send(
        'actions:data-warning',
        'Não foi possível carregar suas ações salvas. Um novo arquivo será criado ao salvar a próxima ação.'
      )
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  const initResult = actionsStore.initStore(app.getPath('userData'))
  pendingDataWarning = initResult.corrupted
  createWindow()
})
