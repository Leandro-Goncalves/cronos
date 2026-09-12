import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export interface MonitorBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface TargetApp {
  name: string
  path: string
  iconPath: string
}

export interface ClickStep {
  id: string
  type: 'click'
  position: { x: number; y: number }
}

export interface AutoTypeStep {
  id: string
  type: 'auto-type'
  position: { x: number; y: number }
  text: string
}

export interface PressKeyStep {
  id: string
  type: 'press-key'
  key: string
  modifiers: string[]
}

export interface WaitStep {
  id: string
  type: 'wait'
  seconds: number
}

export interface ManualTypeStep {
  id: string
  type: 'manual-type'
  label: string
  placeholder?: string
}

export type Step = ClickStep | AutoTypeStep | PressKeyStep | WaitStep | ManualTypeStep

export interface Action {
  id: string
  name: string
  monitorId: number
  monitorBounds: MonitorBounds
  targetApp: TargetApp
  defaultDelaySeconds: number
  steps: Step[]
  createdAt: string
}

export type ActionSavePayload = Omit<Action, 'id' | 'createdAt'> & {
  id?: string
}

export interface SaveResult {
  success: boolean
  action?: Action
  error?: string
}

export interface DeleteResult {
  success: boolean
  error?: string
}

export interface InitResult {
  corrupted: boolean
}

// Predefined key list per PRD Section 6 (Pressionar step): Enter, Tab, Esc, Backspace,
// Delete, Espaço, arrows, Home, End, Page Up/Down. Identifiers below are the canonical
// values persisted on disk; the renderer maps these to their Portuguese display labels.
export const PRESS_KEY_ALLOWED_KEYS = [
  'Enter',
  'Tab',
  'Esc',
  'Backspace',
  'Delete',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
] as const

export const PRESS_KEY_ALLOWED_MODIFIERS = ['ctrl', 'alt', 'shift'] as const

const FILE_NAME = 'actions.json'
const BACKUP_FILE_NAME = 'actions.json.bak'
const WRITE_FAILURE_MESSAGE = 'Não foi possível salvar as alterações. Tente novamente.'
const DELETE_FAILURE_MESSAGE = 'Não foi possível excluir a ação. Tente novamente.'

let actionsFilePath = ''
let backupFilePath = ''
let store: Action[] = []
let dataWasCorrupted = false
let writeQueue: Promise<void> = Promise.resolve()

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateMonitorBounds(bounds: unknown): bounds is MonitorBounds {
  if (typeof bounds !== 'object' || bounds === null) return false
  const b = bounds as Record<string, unknown>
  return isFiniteNumber(b.x) && isFiniteNumber(b.y) && isFiniteNumber(b.width) && isFiniteNumber(b.height)
}

function validateTargetApp(targetApp: unknown): targetApp is TargetApp {
  if (typeof targetApp !== 'object' || targetApp === null) return false
  const t = targetApp as Record<string, unknown>
  return isNonEmptyString(t.name) && isNonEmptyString(t.path) && isNonEmptyString(t.iconPath)
}

function validatePosition(position: unknown): position is { x: number; y: number } {
  if (typeof position !== 'object' || position === null) return false
  const p = position as Record<string, unknown>
  return isFiniteNumber(p.x) && isFiniteNumber(p.y)
}

function validateStep(step: unknown): string | null {
  if (typeof step !== 'object' || step === null) return 'Passo inválido.'
  const s = step as Record<string, unknown>
  if (!isNonEmptyString(s.id)) return 'Passo sem identificador válido.'

  switch (s.type) {
    case 'click':
      if (!validatePosition(s.position)) return 'Passo de clique com posição inválida.'
      return null
    case 'auto-type':
      if (!validatePosition(s.position)) return 'Passo de digitação automática com posição inválida.'
      if (typeof s.text !== 'string' || s.text.length < 1 || s.text.length > 500) {
        return 'O texto do passo de digitação automática deve ter entre 1 e 500 caracteres.'
      }
      return null
    case 'press-key':
      if (typeof s.key !== 'string' || !(PRESS_KEY_ALLOWED_KEYS as readonly string[]).includes(s.key)) {
        return 'Tecla do passo de pressionar inválida.'
      }
      if (
        !Array.isArray(s.modifiers) ||
        !s.modifiers.every((m) => (PRESS_KEY_ALLOWED_MODIFIERS as readonly string[]).includes(m))
      ) {
        return 'Modificadores do passo de pressionar inválidos.'
      }
      return null
    case 'wait':
      if (!isFiniteNumber(s.seconds) || !Number.isInteger(s.seconds) || s.seconds < 1 || s.seconds > 60) {
        return 'O tempo de espera deve ser um número inteiro entre 1 e 60 segundos.'
      }
      return null
    case 'manual-type':
      if (typeof s.label !== 'string' || s.label.length < 1 || s.label.length > 40) {
        return 'O rótulo do passo manual deve ter entre 1 e 40 caracteres.'
      }
      if (s.placeholder !== undefined && (typeof s.placeholder !== 'string' || s.placeholder.length > 100)) {
        return 'O texto de exemplo do passo manual deve ter no máximo 100 caracteres.'
      }
      return null
    default:
      return 'Tipo de passo desconhecido.'
  }
}

function validateActionPayload(payload: ActionSavePayload): string | null {
  if (!isNonEmptyString(payload.name) || payload.name.trim().length > 60) {
    return 'O nome da ação deve ter entre 1 e 60 caracteres.'
  }
  if (!isFiniteNumber(payload.monitorId)) {
    return 'Monitor inválido.'
  }
  if (!validateMonitorBounds(payload.monitorBounds)) {
    return 'Os limites do monitor são inválidos.'
  }
  if (!validateTargetApp(payload.targetApp)) {
    return 'O aplicativo alvo é inválido.'
  }
  if (!isFiniteNumber(payload.defaultDelaySeconds) || payload.defaultDelaySeconds < 0.5 || payload.defaultDelaySeconds > 30) {
    return 'O atraso padrão deve estar entre 0.5 e 30 segundos.'
  }
  if (!Array.isArray(payload.steps) || payload.steps.length > 50) {
    return 'A ação pode ter no máximo 50 passos.'
  }
  for (const step of payload.steps) {
    const stepError = validateStep(step)
    if (stepError) return stepError
  }
  return null
}

function writeFileAtomicSync(filePath: string, data: Action[]) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmpPath = path.join(dir, `${path.basename(filePath)}.tmp-${randomUUID()}`)
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

/**
 * Loads (or creates) the actions data file at `dataDir` into the in-memory store.
 * Must be called once during app startup, before any IPC handler can be invoked.
 */
export function initStore(dataDir: string): InitResult {
  actionsFilePath = path.join(dataDir, FILE_NAME)
  backupFilePath = path.join(dataDir, BACKUP_FILE_NAME)
  dataWasCorrupted = false

  if (!fs.existsSync(actionsFilePath)) {
    store = []
    writeFileAtomicSync(actionsFilePath, store)
    return { corrupted: false }
  }

  try {
    const raw = fs.readFileSync(actionsFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('actions.json root is not an array')
    store = parsed as Action[]
    return { corrupted: false }
  } catch {
    try {
      if (fs.existsSync(backupFilePath)) fs.unlinkSync(backupFilePath)
      fs.renameSync(actionsFilePath, backupFilePath)
    } catch {
      // best-effort preservation of the corrupted file; proceed regardless
    }
    store = []
    dataWasCorrupted = true
    return { corrupted: true }
  }
}

export function wasDataCorrupted(): boolean {
  return dataWasCorrupted
}

function enqueueWrite<T>(task: () => T): Promise<T> {
  const result = writeQueue.then(task)
  writeQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function persistStore(nextStore: Action[]): boolean {
  const previousStore = store
  try {
    writeFileAtomicSync(actionsFilePath, nextStore)
    store = nextStore
    return true
  } catch {
    store = previousStore
    return false
  }
}

export function listActions(): Action[] {
  return store
}

export function getAction(id: string): Action | null {
  return store.find((a) => a.id === id) ?? null
}

export function saveAction(payload: ActionSavePayload): Promise<SaveResult> {
  return enqueueWrite<SaveResult>(() => {
    const validationError = validateActionPayload(payload)
    if (validationError) {
      return { success: false, error: validationError }
    }

    if (payload.id) {
      const existingIndex = store.findIndex((a) => a.id === payload.id)
      if (existingIndex === -1) {
        return { success: false, error: 'action not found' }
      }
      const existing = store[existingIndex]
      const nextAction: Action = { ...payload, id: existing.id, createdAt: existing.createdAt }
      const nextStore = [...store]
      nextStore[existingIndex] = nextAction
      if (!persistStore(nextStore)) return { success: false, error: WRITE_FAILURE_MESSAGE }
      return { success: true, action: nextAction }
    }

    const nextAction: Action = { ...payload, id: randomUUID(), createdAt: new Date().toISOString() }
    const nextStore = [...store, nextAction]
    if (!persistStore(nextStore)) return { success: false, error: WRITE_FAILURE_MESSAGE }
    return { success: true, action: nextAction }
  })
}

export function deleteAction(id: string): Promise<DeleteResult> {
  return enqueueWrite<DeleteResult>(() => {
    const existingIndex = store.findIndex((a) => a.id === id)
    if (existingIndex === -1) {
      return { success: false, error: DELETE_FAILURE_MESSAGE }
    }
    const nextStore = store.filter((a) => a.id !== id)
    if (!persistStore(nextStore)) return { success: false, error: DELETE_FAILURE_MESSAGE }
    return { success: true }
  })
}
