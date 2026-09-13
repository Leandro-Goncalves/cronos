# Implementation Plan: F01. Actions Data Store

**Prerequisites:**

- Node built-ins only for the store logic itself (`node:fs`, `node:path`, `node:crypto`), consistent with the existing `electron/main.ts`
- `vitest` added as a devDependency for this feature's test suite (see spec Section 3/7)
- No environment variables or new configuration files required; the data file lives under Electron's existing `app.getPath('userData')`

### Stage 1: Schema & Persistence Core

**1. Action and Step Schema Definitions** - Define the shape of a saved action and its five step types, along with the field-level validation rules that any save must satisfy. Reference the spec's Data Model for exact fields, types, and constraints.

**2. Startup Load with First-Run and Corrupted-File Handling** - Build the routine that reads the data file on app startup, producing an empty in-memory list when the file is missing (creating it silently) and also when the file's contents are invalid, in the latter case preserving the unreadable file instead of discarding it. Reference the spec's Error Handling and Component Overview for the exact behavior and file naming.

**3. Atomic Write Primitive** - Build the low-level write operation that never leaves the data file partially written, even if the app crashes mid-save. Reference the spec's Technical Decisions for the chosen approach.

**4. In-Memory Store State** - Establish the single in-memory representation of all actions that is populated at startup and kept in sync after every successful write, serving as the source of truth for all reads.

### Stage 2: Write Queue & CRUD Operations

**5. Write Queue Serialization** - Ensure that overlapping save and delete requests are applied one at a time in the order they were requested, so two near-simultaneous changes can never race or partially overwrite each other.

**6. Save Operation (Create and Edit)** - Implement the logic that accepts a full action record, distinguishes a new action from an edit of an existing one, assigns whatever identifying information is missing, validates every field against the constraints in the spec, and persists the result through the atomic write and write queue.

**7. Delete Operation** - Implement the logic that removes a single action by its identifier from both the in-memory store and the persisted file, through the same write queue.

**8. Read Operations** - Implement the operations that return the full list of actions and a single action by identifier from the in-memory store.

### Stage 3: IPC Layer & Startup Integration

**9. IPC Channel Registration** - Expose the four operations to the renderer process as IPC channels, following the existing pattern already used for the app-listing and display-enumeration channels in `electron/main.ts` (a plain `window.ipcRenderer.invoke` call per channel, no typed wrapper).

**10. Store Initialization in App Startup** - Wire the startup load into the application's existing startup sequence so the in-memory store is ready before the renderer can issue its first request.

**11. Corrupted-Data Notification to Renderer** - Wire a one-time notification from the main process to the renderer when startup detects a corrupted data file, so the renderer can surface the corresponding message to the user.

### Stage 4: Error Handling & Result Contracts

**12. Failure Result Contract for Writes** - Ensure every save and delete failure (validation or disk-level) returns a consistent failure result to the caller, and that the in-memory store and the on-disk file are left exactly as they were before the failed attempt.

**13. Concurrent Save Handling Verification** - Confirm that two overlapping save/delete requests, once serialized through the write queue, always leave the store in a fully consistent state reflecting both changes applied in sequence, with no partial merge.

**14. Full Validation Coverage Across the Save Path** - Walk every field constraint defined in the spec's Data Model (name length, delay range, step count ceiling, and each step type's own fields) and confirm the save operation rejects violations of each one without touching persisted state.
