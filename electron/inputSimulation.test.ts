import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.fn()

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

let originalPlatform: PropertyDescriptor | undefined

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform })
}

beforeEach(() => {
  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  execFileMock.mockReset()
})

afterEach(() => {
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
})

describe('inputSimulation script builders', () => {
  it('test_buildClickScript_setsCursorAndIssuesLeftButtonDownUpPair', async () => {
    const { buildClickScript } = await import('./inputSimulation')
    const script = buildClickScript(512, 340)

    expect(script).toContain('SetCursorPos(512, 340)')
    expect(script).toContain('down.u.mi.dwFlags = 2') // MOUSEEVENTF_LEFTDOWN
    expect(script).toContain('up.u.mi.dwFlags = 4') // MOUSEEVENTF_LEFTUP
    expect(script).toContain('SendInput(2,')
  })

  it('test_buildTypeTextScript_encodesEveryCharacterAsUnicodeKeyEvent', async () => {
    const { buildTypeTextScript } = await import('./inputSimulation')
    const script = buildTypeTextScript('João')

    // 4 characters -> 4 down/up pairs -> 8 INPUT structs
    expect(script).toContain('SendInput(8,')
    expect(script).toContain('down0.u.ki.dwFlags = 4') // KEYEVENTF_UNICODE
    expect(script).toContain('up0.u.ki.dwFlags = 6') // KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
    // ã (U+00E3) = 227
    expect(script).toContain('wScan = 227')
  })

  it('test_buildKeyPressScript_mapsEveryAllowedKeyToItsVkCode', async () => {
    const { buildKeyPressScript, PRESS_KEY_VK_CODES } = await import('./inputSimulation')

    for (const [key, vkCode] of Object.entries(PRESS_KEY_VK_CODES)) {
      const script = buildKeyPressScript(key, [])
      expect(script).toContain(`keyDown.u.ki.wVk = ${vkCode}`)
      expect(script).toContain(`keyUp.u.ki.wVk = ${vkCode}`)
    }
  })

  it('test_buildKeyPressScript_appliesModifiersInFixedDownAndReverseUpOrder', async () => {
    const { buildKeyPressScript } = await import('./inputSimulation')
    const script = buildKeyPressScript('Enter', ['shift', 'ctrl'])

    const ctrlDownIndex = script.indexOf('modDown0.u.ki.wVk = 17') // VK_CONTROL
    const shiftDownIndex = script.indexOf('modDown1.u.ki.wVk = 16') // VK_SHIFT
    const keyDownIndex = script.indexOf('keyDown.u.ki.wVk = 13') // VK_RETURN
    const shiftUpIndex = script.indexOf('modUp0.u.ki.wVk = 16')
    const ctrlUpIndex = script.indexOf('modUp1.u.ki.wVk = 17')

    expect(ctrlDownIndex).toBeGreaterThan(-1)
    expect(shiftDownIndex).toBeGreaterThan(ctrlDownIndex)
    expect(keyDownIndex).toBeGreaterThan(shiftDownIndex)
    expect(shiftUpIndex).toBeGreaterThan(keyDownIndex)
    expect(ctrlUpIndex).toBeGreaterThan(shiftUpIndex)
  })
})

describe('inputSimulation platform + execFile behavior', () => {
  it('test_simulateClick_nonWindowsPlatform_resolvesFalseWithoutShelling', async () => {
    setPlatform('darwin')
    const { simulateClick } = await import('./inputSimulation')

    const result = await simulateClick(10, 10)

    expect(result).toBe(false)
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('test_simulateTypeText_executFileSuccess_resolvesTrue', async () => {
    setPlatform('win32')
    execFileMock.mockImplementation((_cmd, _args, _opts, callback) => callback(null))
    const { simulateTypeText } = await import('./inputSimulation')

    const result = await simulateTypeText('abc')

    expect(result).toBe(true)
    expect(execFileMock).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('test_simulateKeyPress_executFileFailure_resolvesFalse', async () => {
    setPlatform('win32')
    execFileMock.mockImplementation((_cmd, _args, _opts, callback) => callback(new Error('boom')))
    const { simulateKeyPress } = await import('./inputSimulation')

    const result = await simulateKeyPress('Enter', [])

    expect(result).toBe(false)
  })
})
