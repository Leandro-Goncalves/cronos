import { ipcMain, screen, app, BrowserWindow, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
const PRESS_KEY_ALLOWED_KEYS = [
  "Enter",
  "Tab",
  "Esc",
  "Backspace",
  "Delete",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown"
];
const PRESS_KEY_ALLOWED_MODIFIERS = ["ctrl", "alt", "shift"];
const FILE_NAME = "actions.json";
const BACKUP_FILE_NAME = "actions.json.bak";
const WRITE_FAILURE_MESSAGE = "Não foi possível salvar as alterações. Tente novamente.";
const DELETE_FAILURE_MESSAGE = "Não foi possível excluir a ação. Tente novamente.";
let actionsFilePath = "";
let backupFilePath = "";
let store = [];
let writeQueue = Promise.resolve();
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validateMonitorBounds(bounds) {
  if (typeof bounds !== "object" || bounds === null) return false;
  const b = bounds;
  return isFiniteNumber(b.x) && isFiniteNumber(b.y) && isFiniteNumber(b.width) && isFiniteNumber(b.height);
}
function validateTargetApp(targetApp) {
  if (typeof targetApp !== "object" || targetApp === null) return false;
  const t = targetApp;
  return isNonEmptyString(t.name) && isNonEmptyString(t.path) && isNonEmptyString(t.iconPath);
}
function validatePosition(position) {
  if (typeof position !== "object" || position === null) return false;
  const p = position;
  return isFiniteNumber(p.x) && isFiniteNumber(p.y);
}
function validateStep(step) {
  if (typeof step !== "object" || step === null) return "Passo inválido.";
  const s = step;
  if (!isNonEmptyString(s.id)) return "Passo sem identificador válido.";
  switch (s.type) {
    case "click":
      if (!validatePosition(s.position)) return "Passo de clique com posição inválida.";
      return null;
    case "auto-type":
      if (!validatePosition(s.position)) return "Passo de digitação automática com posição inválida.";
      if (typeof s.text !== "string" || s.text.length < 1 || s.text.length > 500) {
        return "O texto do passo de digitação automática deve ter entre 1 e 500 caracteres.";
      }
      return null;
    case "press-key":
      if (typeof s.key !== "string" || !PRESS_KEY_ALLOWED_KEYS.includes(s.key)) {
        return "Tecla do passo de pressionar inválida.";
      }
      if (!Array.isArray(s.modifiers) || !s.modifiers.every((m) => PRESS_KEY_ALLOWED_MODIFIERS.includes(m))) {
        return "Modificadores do passo de pressionar inválidos.";
      }
      return null;
    case "wait":
      if (!isFiniteNumber(s.seconds) || !Number.isInteger(s.seconds) || s.seconds < 1 || s.seconds > 60) {
        return "O tempo de espera deve ser um número inteiro entre 1 e 60 segundos.";
      }
      return null;
    case "manual-type":
      if (typeof s.label !== "string" || s.label.length < 1 || s.label.length > 40) {
        return "O rótulo do passo manual deve ter entre 1 e 40 caracteres.";
      }
      if (s.placeholder !== void 0 && (typeof s.placeholder !== "string" || s.placeholder.length > 100)) {
        return "O texto de exemplo do passo manual deve ter no máximo 100 caracteres.";
      }
      return null;
    default:
      return "Tipo de passo desconhecido.";
  }
}
function validateActionPayload(payload) {
  if (!isNonEmptyString(payload.name) || payload.name.trim().length > 60) {
    return "O nome da ação deve ter entre 1 e 60 caracteres.";
  }
  if (!isFiniteNumber(payload.monitorId)) {
    return "Monitor inválido.";
  }
  if (!validateMonitorBounds(payload.monitorBounds)) {
    return "Os limites do monitor são inválidos.";
  }
  if (!validateTargetApp(payload.targetApp)) {
    return "O aplicativo alvo é inválido.";
  }
  if (!isFiniteNumber(payload.defaultDelaySeconds) || payload.defaultDelaySeconds < 0.5 || payload.defaultDelaySeconds > 30) {
    return "O atraso padrão deve estar entre 0.5 e 30 segundos.";
  }
  if (!Array.isArray(payload.steps) || payload.steps.length > 50) {
    return "A ação pode ter no máximo 50 passos.";
  }
  for (const step of payload.steps) {
    const stepError = validateStep(step);
    if (stepError) return stepError;
  }
  return null;
}
function writeFileAtomicSync(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(filePath)}.tmp-${randomUUID()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
function initStore(dataDir) {
  actionsFilePath = path.join(dataDir, FILE_NAME);
  backupFilePath = path.join(dataDir, BACKUP_FILE_NAME);
  if (!fs.existsSync(actionsFilePath)) {
    store = [];
    writeFileAtomicSync(actionsFilePath, store);
    return { corrupted: false };
  }
  try {
    const raw = fs.readFileSync(actionsFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("actions.json root is not an array");
    store = parsed;
    return { corrupted: false };
  } catch {
    try {
      if (fs.existsSync(backupFilePath)) fs.unlinkSync(backupFilePath);
      fs.renameSync(actionsFilePath, backupFilePath);
    } catch {
    }
    store = [];
    return { corrupted: true };
  }
}
function enqueueWrite(task) {
  const result = writeQueue.then(task);
  writeQueue = result.then(
    () => void 0,
    () => void 0
  );
  return result;
}
function persistStore(nextStore) {
  const previousStore = store;
  try {
    writeFileAtomicSync(actionsFilePath, nextStore);
    store = nextStore;
    return true;
  } catch {
    store = previousStore;
    return false;
  }
}
function listActions() {
  return store;
}
function getAction(id) {
  return store.find((a) => a.id === id) ?? null;
}
function saveAction(payload) {
  return enqueueWrite(() => {
    const validationError = validateActionPayload(payload);
    if (validationError) {
      return { success: false, error: validationError };
    }
    if (payload.id) {
      const existingIndex = store.findIndex((a) => a.id === payload.id);
      if (existingIndex === -1) {
        return { success: false, error: "action not found" };
      }
      const existing = store[existingIndex];
      const nextAction2 = { ...payload, id: existing.id, createdAt: existing.createdAt };
      const nextStore2 = [...store];
      nextStore2[existingIndex] = nextAction2;
      if (!persistStore(nextStore2)) return { success: false, error: WRITE_FAILURE_MESSAGE };
      return { success: true, action: nextAction2 };
    }
    const nextAction = { ...payload, id: randomUUID(), createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    const nextStore = [...store, nextAction];
    if (!persistStore(nextStore)) return { success: false, error: WRITE_FAILURE_MESSAGE };
    return { success: true, action: nextAction };
  });
}
function deleteAction(id) {
  return enqueueWrite(() => {
    const existingIndex = store.findIndex((a) => a.id === id);
    if (existingIndex === -1) {
      return { success: false, error: DELETE_FAILURE_MESSAGE };
    }
    const nextStore = store.filter((a) => a.id !== id);
    if (!persistStore(nextStore)) return { success: false, error: DELETE_FAILURE_MESSAGE };
    return { success: true };
  });
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function resolveShortcutTargets(shortcutPaths) {
  return new Promise((resolvePromise) => {
    if (shortcutPaths.length === 0) {
      resolvePromise(/* @__PURE__ */ new Map());
      return;
    }
    const inputFile = path.join(os.tmpdir(), `cronos-shortcuts-in-${randomUUID()}.json`);
    const outputFile = path.join(os.tmpdir(), `cronos-shortcuts-out-${randomUUID()}.json`);
    fs.writeFileSync(inputFile, JSON.stringify(shortcutPaths), "utf-8");
    const script = [
      '$ErrorActionPreference = "SilentlyContinue"',
      `$paths = Get-Content -Raw -Path '${inputFile}' | ConvertFrom-Json`,
      "$shell = New-Object -ComObject WScript.Shell",
      "$result = @{}",
      "foreach ($p in $paths) {",
      "  try {",
      "    $result[$p] = $shell.CreateShortcut($p).TargetPath",
      "  } catch {",
      '    $result[$p] = ""',
      "  }",
      "}",
      `$result | ConvertTo-Json | Set-Content -Path '${outputFile}' -Encoding UTF8`
    ].join("; ");
    const cleanup = () => {
      fs.unlink(inputFile, () => {
      });
      fs.unlink(outputFile, () => {
      });
    };
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 2e4 },
      () => {
        const map = /* @__PURE__ */ new Map();
        try {
          let raw = fs.readFileSync(outputFile, "utf-8");
          if (raw.charCodeAt(0) === 65279) raw = raw.slice(1);
          const parsed = JSON.parse(raw);
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string" && value) map.set(key, value);
          }
        } catch {
        }
        cleanup();
        resolvePromise(map);
      }
    );
  });
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
`;
function focusRunningApp(exePath, displayBounds) {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolvePromise) => {
    const escapedPath = exePath.replace(/'/g, "''");
    const escapedTypeDef = WIN32_TYPE_DEFINITION.replace(/'/g, "''");
    const placementLines = displayBounds ? [
      "  $wp = New-Object CronosWin32+WINDOWPLACEMENT",
      "  $wp.length = [System.Runtime.InteropServices.Marshal]::SizeOf($wp)",
      "  [CronosWin32]::GetWindowPlacement($proc.MainWindowHandle, [ref]$wp) | Out-Null",
      "  $wp.showCmd = 3",
      "  $rect = New-Object CronosWin32+RECT",
      `  $rect.Left = ${displayBounds.x}`,
      `  $rect.Top = ${displayBounds.y}`,
      `  $rect.Right = ${displayBounds.x + displayBounds.width}`,
      `  $rect.Bottom = ${displayBounds.y + displayBounds.height}`,
      "  $wp.rcNormalPosition = $rect",
      "  [CronosWin32]::SetWindowPlacement($proc.MainWindowHandle, [ref]$wp) | Out-Null"
    ] : ["  [CronosWin32]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null"];
    const script = [
      '$ErrorActionPreference = "SilentlyContinue"',
      `Add-Type -TypeDefinition '${escapedTypeDef}'`,
      "[CronosWin32]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null",
      `$target = '${escapedPath}'`,
      "$proc = Get-Process | Where-Object { $_.Path -and ($_.Path -ieq $target) -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1",
      "if ($proc) {",
      ...placementLines,
      "  [CronosWin32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null",
      '  Write-Output "FOUND"',
      "} else {",
      '  Write-Output "NOTFOUND"',
      "}"
    ].join("\n");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 1e4 },
      (_error, stdout) => {
        resolvePromise(stdout.trim() === "FOUND");
      }
    );
  });
}
function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
async function openAppOnDisplay(appPath, iconPath, displayBounds) {
  if (await focusRunningApp(iconPath, displayBounds)) return true;
  await shell.openPath(appPath);
  let found = false;
  for (let attempt = 0; attempt < 10 && !found; attempt++) {
    await delay(500);
    found = await focusRunningApp(iconPath, displayBounds);
  }
  if (found && displayBounds) {
    for (let i = 0; i < 4; i++) {
      await delay(400);
      await focusRunningApp(iconPath, displayBounds);
    }
  }
  return found;
}
function walkDir(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath, entry);
    }
  }
}
async function listWindowsApps() {
  const dirs = [
    process.env.APPDATA && path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs"),
    process.env.ProgramData && path.join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs")
  ].filter((dir) => !!dir);
  const shortcuts = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    walkDir(dir, (fullPath, entry) => {
      if (entry.name.toLowerCase().endsWith(".lnk")) {
        const name = entry.name.slice(0, -4);
        if (!shortcuts.has(name.toLowerCase())) {
          shortcuts.set(name.toLowerCase(), fullPath);
        }
      }
    });
  }
  const targets = await resolveShortcutTargets(Array.from(shortcuts.values()));
  const apps = Array.from(shortcuts.entries()).map(([, fullPath]) => ({
    name: path.basename(fullPath, ".lnk"),
    path: fullPath,
    iconPath: targets.get(fullPath) || fullPath
  }));
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
function listMacApps() {
  const dirs = ["/Applications", path.join(app.getPath("home"), "Applications")];
  const apps = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith(".app")) {
        const name = entry.name.slice(0, -4);
        const fullPath = path.join(dir, entry.name);
        apps.set(name.toLowerCase(), { name, path: fullPath, iconPath: fullPath });
      }
    }
  }
  return Array.from(apps.values()).sort((a, b) => a.name.localeCompare(b.name));
}
function listLinuxApps() {
  const dirs = [
    "/usr/share/applications",
    "/usr/local/share/applications",
    path.join(app.getPath("home"), ".local", "share", "applications")
  ];
  const apps = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".desktop")) {
        const fullPath = path.join(dir, entry.name);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (/^NoDisplay=true$/m.test(content)) continue;
          const nameMatch = content.match(/^Name=(.+)$/m);
          if (nameMatch) {
            const name = nameMatch[1].trim();
            apps.set(name.toLowerCase(), { name, path: fullPath, iconPath: fullPath });
          }
        } catch {
          continue;
        }
      }
    }
  }
  return Array.from(apps.values()).sort((a, b) => a.name.localeCompare(b.name));
}
function listApps() {
  if (process.platform === "win32") return listWindowsApps();
  if (process.platform === "darwin") return listMacApps();
  return listLinuxApps();
}
const iconCache = /* @__PURE__ */ new Map();
ipcMain.handle("apps:list", () => listApps());
ipcMain.handle(
  "apps:open",
  (_event, appPath, iconPath, displayBounds) => openAppOnDisplay(appPath, iconPath, displayBounds)
);
ipcMain.handle(
  "apps:focus",
  (_event, exePath, displayBounds) => focusRunningApp(exePath, displayBounds)
);
ipcMain.handle("displays:list", () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: `Monitor ${index + 1}${display.id === primaryId ? " (principal)" : ""}`,
    bounds: display.bounds
  }));
});
ipcMain.handle("apps:icon", async (_event, appPath) => {
  if (iconCache.has(appPath)) return iconCache.get(appPath) ?? null;
  try {
    const icon = await app.getFileIcon(appPath, { size: "normal" });
    const dataUrl = icon.toDataURL();
    iconCache.set(appPath, dataUrl);
    return dataUrl;
  } catch {
    iconCache.set(appPath, null);
    return null;
  }
});
ipcMain.handle("actions:list", () => listActions());
ipcMain.handle("actions:get", (_event, id) => getAction(id));
ipcMain.handle("actions:save", (_event, payload) => saveAction(payload));
ipcMain.handle("actions:delete", (_event, id) => deleteAction(id));
let pendingDataWarning = false;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
    if (pendingDataWarning) {
      pendingDataWarning = false;
      win == null ? void 0 : win.webContents.send(
        "actions:data-warning",
        "Não foi possível carregar suas ações salvas. Um novo arquivo será criado ao salvar a próxima ação."
      );
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  const initResult = initStore(app.getPath("userData"));
  pendingDataWarning = initResult.corrupted;
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
