# Implementation Plan: F02. Main Screen — Actions List

**Prerequisites:**

- No new IPC channels or backend changes — F02 consumes the existing `actions:list`/`actions:get` channels and the existing `actions:data-warning` push event from F01.
- New devDependencies for the renderer's first component tests: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` (see spec Section 3).
- No environment variables or new configuration files; `vite.config.ts` is not modified (per-file `@vitest-environment jsdom` pragma instead of a global config change).

### Stage 1: Extract Shared Building Blocks from the Existing App Screen

**1. Toast Component Extraction** - Pull the bottom-center, auto-dismissing toast currently written inline in `App.tsx` out into its own reusable component, preserving its exact appearance and timing, so both the existing installed-app screen and the new actions list can show messages the same way.

**2. Icon-Loading Hook Extraction** - Pull the concurrency-limited icon-fetch-and-cache logic currently written inline in `App.tsx` out into a reusable hook, so both the installed-app list and the new actions list rows can resolve an app icon the same way without duplicating that logic.

**3. Installed-App Browser Extraction** - Move the current `App.tsx` body (the installed-app list, its search input, and its display selector) into its own standalone component, using the two pieces just extracted, with no behavior change. This keeps the existing screen available for later reuse (the PRD's F03 app selector reuses this exact listing/search behavior) while freeing up `App.tsx`'s root to become the screen switcher.

### Stage 2: Establish the Screen-Switching and Toast Hand-off Contract

**4. Screen State and Navigation Functions** - Introduce the app-level screen state that distinguishes the actions list from the (not-yet-built) wizard and execute destinations, along with the functions child screens call to move between them, as specified in the spec's Data Model and Architecture sections.

**5. Placeholder Destination Screens** - Add minimal placeholder screens for the wizard-create, wizard-edit, and execute destinations so every navigation transition the actions list triggers has somewhere real to land and a way back, without building any of those features' actual behavior ahead of their own specs.

**6. Success-Toast Hand-off Across Screens** - Wire the mechanism that lets any screen send a one-time message back to the actions list on return, and have the corrupted-data warning pushed by the main process (already emitted, never consumed today) flow through the same mechanism.

### Stage 3: Build the Actions List Screen

**7. Action List Fetching, Sorting, and Row Rendering** - Build the screen that loads all saved actions on mount, sorts them most-recently-created-first, and renders each as a row showing its name, target app name and icon, and step count, per the spec's Component Overview and Data Model.

**8. Empty State** - Add the empty-list presentation with its message and a highlighted call to action, shown in place of the row list when there are no saved actions.

**9. Search/Filter Input** - Add the name-based filter input above the list, reusing the same filtering behavior already established for the installed-app list.

**10. Row Navigation Affordances** - Wire each row's clickable area, edit icon, and delete icon to the navigation contract from Stage 2: row click and edit forward the selected action's id (and, for edit, its full record) onward; the delete icon opens the local placeholder confirmation surface described in the spec, without performing any deletion itself.

**11. "Adicionar Ação" Button** - Add the always-visible top action that starts the create-action navigation path.

### Stage 4: Wrap Up Cross-Cutting Behavior and Tests

**12. Toast Integration on the List Screen** - Connect the actions list screen to the hand-off mechanism from Stage 2 so it displays the one-time success message after returning from a create, edit, delete, or execution, and displays the corrupted-data warning when it fires.

**13. Test Setup and Coverage** - Add the renderer testing dependencies and write the component and integration tests described in the spec's Testing Strategy, covering every F02 acceptance criterion and the cross-feature contracts F02 is responsible for.
