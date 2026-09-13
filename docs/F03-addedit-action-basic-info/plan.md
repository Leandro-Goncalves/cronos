# Implementation Plan: F03. Add/Edit Action — Basic Info

**Prerequisites:**

- No new IPC channels or backend changes — F03 consumes the existing `displays:list`, `apps:list`, and `apps:icon` channels already implemented in `electron/main.ts`.
- New shadcn UI primitives: `select` and `label`, added the same way `input` and `alert-dialog` were added for F02.
- No environment variables or new configuration files.

### Stage 1: Add Shared Form and Selection Building Blocks

**1. Shadcn Select and Label Primitives** - Add the shadcn `select` and `label` UI primitives to the project's component library, continuing the incremental migration from plain HTML form controls to shadcn components already started for the actions list screen.

**2. Reusable Searchable App Picker** - Extract a single-select, searchable installed-app listing component from the list, search, and icon-rendering behavior already used by the existing installed-app browser, exposing a selected-value and change-callback contract in place of that browser's open/focus actions.

### Stage 2: Build the Basic Info Screen's Core Fields

**3. Screen Scaffold and Field State** - Create the Basic Info screen with its own state for the name, the selected monitor, and the selected app, all starting empty in create mode, as specified in the spec's Component Overview and Data Model.

**4. Monitor Detection and Conditional Selector** - Load the currently detected monitors when the screen opens, automatically record the sole monitor's identity and bounds when only one is detected, and render a selector only when two or more are detected.

**5. Name Field and Validation** - Add the name input with the same trimming and length rule already enforced at the persistence layer, feeding its validity into the confirmation gating.

**6. App Selection** - Wire the extracted app picker into the screen so exactly one installed app can be selected, reusing the existing search/filter behavior end to end.

**7. Confirm Button Gating** - Disable confirmation until the name, the selected app, and, when applicable, the selected monitor are all valid, combining the validity signals from the steps above.

### Stage 3: Edit Mode Behavior

**8. Edit-Mode Prefill** - When the screen opens for an existing action, seed the name, monitor selection, and app selection from that action's stored data, and capture the original app/monitor values for later comparison.

**9. Change-Detection Warning Banner** - Compare the current app and monitor selections against the captured original values at all times, showing the warning banner whenever either differs and hiding it again if the original values are restored.

### Stage 4: Draft Hand-off and Navigation Wiring

**10. Draft Basic Info Contract** - Define the in-memory shape carrying the confirmed name, monitor identity and bounds, and target app forward, matching exactly the fields described in the spec's hand-off contract for the future Steps Builder.

**11. Confirm and Cancel Actions** - Wire confirmation to build the draft and advance to the steps-builder hand-off destination, and wire cancellation to return to the main screen without persisting anything, in both create and edit modes.

**12. App.tsx Integration** - Replace the existing wizard placeholder with the real Basic Info screen at both the create and edit navigation entry points, and add a placeholder destination representing the not-yet-built Steps Builder so the hand-off is observable end to end.
