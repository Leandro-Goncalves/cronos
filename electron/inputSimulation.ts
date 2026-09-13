import { execFile } from 'node:child_process'

// Mirrors electron/main.ts's WIN32_TYPE_DEFINITION + execFile('powershell.exe', ...) shelling
// pattern used by focusRunningApp, extended to cover SendInput-based input simulation.
const INPUT_TYPE_DEFINITION = `
using System;
using System.Runtime.InteropServices;

public class CronosInput {
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public INPUTUNION u;
    }

    [DllImport("user32.dll")]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
}
`

const INPUT_TYPE_MOUSE = 0
const INPUT_TYPE_KEYBOARD = 1
const MOUSEEVENTF_LEFTDOWN = 0x0002
const MOUSEEVENTF_LEFTUP = 0x0004
const KEYEVENTF_UNICODE = 0x0004
const KEYEVENTF_KEYUP = 0x0002

// Virtual-key codes per F08 spec Section 6, "PRESS_KEY_ALLOWED_KEYS -> Win32 VK constant".
export const PRESS_KEY_VK_CODES: Record<string, number> = {
  Enter: 0x0d,
  Tab: 0x09,
  Esc: 0x1b,
  Backspace: 0x08,
  Delete: 0x2e,
  Space: 0x20,
  ArrowUp: 0x26,
  ArrowDown: 0x28,
  ArrowLeft: 0x25,
  ArrowRight: 0x27,
  Home: 0x24,
  End: 0x23,
  PageUp: 0x21,
  PageDown: 0x22,
}

// Modifier virtual-key codes per F08 spec Section 6, "PRESS_KEY_ALLOWED_MODIFIERS -> Win32 VK constant".
export const MODIFIER_VK_CODES: Record<string, number> = {
  ctrl: 0x11,
  alt: 0x12,
  shift: 0x10,
}

// Fixed press order per spec: ctrl, alt, shift down (only those present), then the main key,
// then the same modifiers up in reverse order.
const MODIFIER_ORDER = ['ctrl', 'alt', 'shift'] as const

function escapeForSingleQuotedPowerShellString(value: string): string {
  return value.replace(/'/g, "''")
}

function buildInputArrayScript(inputs: string[]): string {
  return `[CronosInput]::SendInput(${inputs.length}, @(${inputs.join(', ')}), [System.Runtime.InteropServices.Marshal]::SizeOf([type][CronosInput+INPUT])) | Out-Null`
}

function mouseInput(varName: string, dwFlags: number): string {
  return [
    `$${varName} = New-Object CronosInput+INPUT`,
    `$${varName}.type = ${INPUT_TYPE_MOUSE}`,
    `$${varName}.u.mi.dwFlags = ${dwFlags}`,
  ].join('\n')
}

function keyboardInput(varName: string, wVk: number, wScan: number, dwFlags: number): string {
  return [
    `$${varName} = New-Object CronosInput+INPUT`,
    `$${varName}.type = ${INPUT_TYPE_KEYBOARD}`,
    `$${varName}.u.ki.wVk = ${wVk}`,
    `$${varName}.u.ki.wScan = ${wScan}`,
    `$${varName}.u.ki.dwFlags = ${dwFlags}`,
  ].join('\n')
}

function wrapScript(bodyLines: string[]): string {
  const escapedTypeDef = escapeForSingleQuotedPowerShellString(INPUT_TYPE_DEFINITION)
  return [
    '$ErrorActionPreference = "SilentlyContinue"',
    `Add-Type -TypeDefinition '${escapedTypeDef}'`,
    ...bodyLines,
  ].join('\n')
}

export function buildClickScript(x: number, y: number): string {
  return wrapScript([
    `[CronosInput]::SetCursorPos(${x}, ${y}) | Out-Null`,
    mouseInput('down', MOUSEEVENTF_LEFTDOWN),
    mouseInput('up', MOUSEEVENTF_LEFTUP),
    buildInputArrayScript(['$down', '$up']),
  ])
}

export function buildTypeTextScript(text: string): string {
  const inputVars: string[] = []
  const lines: string[] = []

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const downVar = `down${i}`
    const upVar = `up${i}`
    lines.push(keyboardInput(downVar, 0, code, KEYEVENTF_UNICODE))
    lines.push(keyboardInput(upVar, 0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP))
    inputVars.push(`$${downVar}`, `$${upVar}`)
  }

  if (inputVars.length === 0) {
    return wrapScript(['Write-Output "OK"'])
  }

  lines.push(buildInputArrayScript(inputVars))
  return wrapScript(lines)
}

export function buildKeyPressScript(key: string, modifiers: string[]): string {
  const keyVk = PRESS_KEY_VK_CODES[key]
  const activeModifiers = MODIFIER_ORDER.filter((m) => modifiers.includes(m))

  const lines: string[] = []
  const inputVars: string[] = []

  activeModifiers.forEach((modifier, index) => {
    const varName = `modDown${index}`
    lines.push(keyboardInput(varName, MODIFIER_VK_CODES[modifier], 0, 0))
    inputVars.push(`$${varName}`)
  })

  lines.push(keyboardInput('keyDown', keyVk, 0, 0))
  lines.push(keyboardInput('keyUp', keyVk, 0, KEYEVENTF_KEYUP))
  inputVars.push('$keyDown', '$keyUp')

  ;[...activeModifiers].reverse().forEach((modifier, index) => {
    const varName = `modUp${index}`
    lines.push(keyboardInput(varName, MODIFIER_VK_CODES[modifier], 0, KEYEVENTF_KEYUP))
    inputVars.push(`$${varName}`)
  })

  lines.push(buildInputArrayScript(inputVars))
  return wrapScript(lines)
}

function runPowerShellScript(script: string): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)

  return new Promise((resolvePromise) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 10000 },
      (error) => {
        resolvePromise(!error)
      }
    )
  })
}

export function simulateClick(x: number, y: number): Promise<boolean> {
  return runPowerShellScript(buildClickScript(x, y))
}

export function simulateTypeText(text: string): Promise<boolean> {
  return runPowerShellScript(buildTypeTextScript(text))
}

export function simulateKeyPress(key: string, modifiers: string[]): Promise<boolean> {
  return runPowerShellScript(buildKeyPressScript(key, modifiers))
}
