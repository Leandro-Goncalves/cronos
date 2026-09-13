# Implementation Plan: F08. Execute Action — Automation Engine

**Prerequisites:**

- Electron 30 main process, Node's built-in `child_process.execFile` and `fs` modules (already used by `electron/main.ts`)
- Windows PowerShell (`powershell.exe`) available on the target machine, same runtime dependency the existing window-placement feature already requires
- No new npm dependencies (see spec Section 3, "Input-simulation mechanism")
- F01 (Actions Data Store) and F07 (Execute Action — Manual Fields) already implemented and unchanged by this plan

### Stage 1: Win32 Input Simulation Foundation

**1. Input-simulation module scaffold** - Create `electron/inputSimulation.ts` following the existing `WIN32_TYPE_DEFINITION` + `execFile('powershell.exe', ...)` shelling pattern from `electron/main.ts`, including the non-Windows platform guard used by `focusRunningApp`.

**2. Simulated click primitive** - Implement absolute-coordinate mouse click simulation via `SetCursorPos` plus a `SendInput` button down/up pair, exposed as a single async function.

**3. Simulated text typing primitive** - Implement Unicode text typing via `SendInput` with one key-event pair per character, covering the full range of characters an action's typed text may contain.

**4. Simulated key-press primitive** - Implement key-plus-modifiers press simulation using the virtual-key and modifier mapping tables defined in the spec, respecting the documented press/release order.

### Stage 2: Coordinate Translation & Step Dispatch

**5. Current-monitor lookup** - Add the logic that fetches the action's currently-configured monitor bounds and matches them by the action's saved monitor id, distinct from the possibly-stale bounds stored on the action record.

**6. Coordinate translation** - Implement the monitor-relative-to-absolute coordinate conversion used by `click` and `auto-type` steps, per the formula in the spec.

**7. Manual-value resolution** - Implement the lookup that resolves each `manual-type` step's typed text from the incoming manual values map, keyed by step id, with a safe fallback when a value is unexpectedly missing.

**8. Per-step dispatch** - Implement the switch that routes each step type (`click`, `auto-type`, `press-key`, `wait`, `manual-type`) to the correct input-simulation call(s), including the "no click for manual-type" behavior documented in the spec.

### Stage 3: Automation Engine Orchestration & Error Handling

**9. Orchestration entry point** - Create `electron/automationEngine.ts` with the top-level function that loads the action, runs the monitor-existence precondition, and sequences the remaining stages before returning a single result object.

**10. Minimize / restore lifecycle** - Wire the Cronos window minimize call after the monitor check passes, and the restore call on both the success path and every post-minimize failure path.

**11. Target app open/focus with error differentiation** - Call the existing `openAppOnDisplay` and apply the executable-existence pre-check that distinguishes "app cannot be opened" from "window cannot be found/focused," each producing its own exact toast text.

**12. Sequential step loop with default delay** - Implement the loop that executes steps in saved order, applying the action's default delay before every step after the first and the step's own extra wait time for `wait` steps.

**13. Mid-sequence failure handling** - Stop the loop on the first step failure, restore Cronos, and build the "interrupted at step [n]: [type]" toast using the step-type label table from the spec.

### Stage 4: IPC Wiring

**14. `execution:run` handler** - Register the new IPC channel in `electron/main.ts`, export `openAppOnDisplay` for reuse, and connect the handler to `automationEngine`'s entry point along with a way to reach the current Cronos `BrowserWindow`.

### Stage 5: Renderer Integration

**15. `RunningScreen` component** - Create `src/screens/RunningScreen.tsx`, invoking `execution:run` on mount with the `ExecutionRequest` payload and deriving the success or failure toast message from the result.

**16. Screen-switcher wiring** - Update `src/App.tsx` to render `RunningScreen` for the `running` screen kind in place of the temporary placeholder, connecting its completion callback to the existing `returnToList`.

**17. Placeholder cleanup** - Remove the now-unused "Simular sucesso (temporário)" affordance from `App.tsx`'s placeholder helper, keeping it only for any screen kinds still pending implementation.
