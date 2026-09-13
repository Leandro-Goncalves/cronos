# Implementation Plan: F04. Screen Position Capture

**Prerequisites:**

- No new npm dependencies — Electron's own `BrowserWindow` API and native DOM events cover the overlay, transparency, always-on-top behavior, and ESC/click capture.
- No new environment variables or configuration files.
- No changes to the existing `apps:open`, `apps:focus`, `displays:list`, or `actions:*` IPC channels — F04 reuses `openAppOnDisplay` as-is.

### Stage 1: Renderer Capture Contract and Overlay Entry Point

**1. Capture Position Contract** - Define the renderer-side request/result types and the `captureScreenPosition` function that wraps the new capture IPC call, plus the exact PRD-mandated error message F04 owns, as specified in the spec's API Contracts and Data Model sections.

**2. Overlay Renderer Entry Point** - Branch the renderer's root render between the normal application and a dedicated overlay view based on how the window was launched, so the overlay window can reuse the existing built renderer bundle without a new build entry, per the spec's Architecture Impact and Technical Decisions.

### Stage 2: Backend Overlay Window and Capture State Machine

**3. Overlay Window Module** - Create the dedicated backend module that owns the overlay window's configuration and lifecycle (borderless, transparent, always-on-top, sized and positioned to the target monitor), per the spec's Component Overview and Technical Decisions.

**4. Pending Capture State Machine** - Implement the single in-flight capture tracking that resolves to a captured position, a cancellation, or an error, and that coordinates the overlay's loading and interactive phases, per the spec's Technical Decisions and Assumptions.

**5. App-Open Reuse via Dependency Injection** - Wire the module to call the existing app-open/focus logic directly, injected as a dependency rather than reimplemented or called through a second IPC round-trip, per the spec's Technical Decisions.

### Stage 3: IPC Wiring and Main-Window Coordination

**6. Capture IPC Handlers** - Register the new IPC channels in the main process, delegating to the overlay window module, per the spec's API Contracts.

**7. Main Window Minimize/Restore Sequencing** - Wire the main window to minimize before the capture flow begins and to restore and focus itself on every outcome of the flow, per the spec's Architecture Impact.

**8. App-Open Failure Short-Circuit** - Wire the failure path so that when the target app cannot be opened or focused, the capture is aborted before the overlay ever becomes an interactive capture surface, per the spec's Error Handling and Technical Decisions.

### Stage 4: Overlay UI and Placeholder Trigger Wiring

**9. Overlay Loading and Interactive States** - Build the overlay screen's two visual states: the initial loading indicator naming the target app, and the tinted, crosshair-cursor capture surface it switches to once the target app is confirmed open, per the spec's Requirements and Technical Decisions.

**10. Click and ESC Handling** - Wire the overlay screen's left-click capture and ESC-to-cancel handling, ensuring ESC works throughout while a click only registers once the overlay has become interactive, per the spec's Technical Decisions and Assumptions.

**11. Steps-Builder Placeholder Trigger** - Add the temporary trigger into the existing steps-builder placeholder so the whole capture flow — minimize, open, overlay, click or cancel, restore — is exercisable end to end today, surfacing its outcome without building any real steps-builder UI, per the spec's Technical Decisions.
