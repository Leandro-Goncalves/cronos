# Implementation Plan: F06. Delete Action

**Prerequisites:**

- No new IPC channels or backend changes — F06 consumes the existing `actions:delete` channel from F01 exactly as documented, with no modification to `electron/actionsStore.ts` or `electron/main.ts`.
- No new dependencies, environment variables, or configuration files.

### Stage 1: Wire the Confirmation Dialog to the Real Deletion

**1. Real Delete Call and Success Handling** - Replace the confirm button's placeholder handler with a real call to the existing deletion channel for the selected action. On a successful result, remove that action from the rendered list immediately, close the dialog, and show the success toast naming the deleted action, per the spec's Architecture and Technical Decisions sections.

**2. Failure Handling** - When the deletion call does not succeed, close the dialog without changing the rendered list, and show the fixed error toast described in the spec, so a persistence failure never silently discards or hides an action.

### Stage 2: Guard Against Duplicate Submission

**3. In-Flight Button State** - Disable the dialog's confirm and cancel controls for the duration of the deletion call, so a user cannot trigger a second delete or dismiss the dialog while the first request is still resolving, as described in the spec's Assumptions.
