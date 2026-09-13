# Implementation Plan: F07. Execute Action — Manual Fields

**Prerequisites:**

- No new IPC channels or backend changes — F07 consumes the existing `actions:get` channel from F01.
- No new devDependencies — reuses the renderer test setup (`@testing-library/react`, `jsdom`) already added by F02.
- No environment variables or new configuration files.

### Stage 1: Hand-off Contract and Navigation Wiring

**1. Execution Hand-off Interface** - Define the structural payload that represents a ready-to-run request (the action to run plus its filled-in manual values, keyed by step id), as specified in the spec's API Contracts and Data Model sections. This is the boundary a future automation engine will consume; nothing about how execution actually runs is defined here.

**2. Screen State Extension in App.tsx** - Extend the app's screen-switching state so the existing execute destination renders the real manual-fields screen instead of its placeholder, and add a new placeholder destination that stands in for the not-yet-built automation engine, carrying the hand-off payload forward exactly as produced.

### Stage 2: Manual-Step Detection and Skip Path

**3. Shared Label Component** - Add the reusable label component needed to associate each manual field's visible text with its input, following the project's existing shadcn-based component conventions.

**4. Action Load and Manual-Step Detection** - Build the logic that loads the full record for the selected action and determines, in step order, which of its steps are Manual-Digitar steps, per the spec's Component Overview.

**5. Skip-to-Execution Path** - Wire the case where an action has no Manual-Digitar steps so it reaches the hand-off immediately, with no form ever rendered, per the spec's Technical Decisions and Assumptions.

### Stage 3: Manual Fields Form and Confirmation

**6. Manual Fields Form Rendering** - Render one labeled input per Manual-Digitar step, in step order, each starting empty and showing its configured placeholder, per the spec's Data Model.

**7. Field Validation and Executar Button State** - Wire the field values so the Executar button stays disabled until every manual field holds a non-empty value, and becomes enabled once they all do.

**8. Confirm and Cancel Actions** - Wire "Executar" to hand off the collected values keyed by step id through the interface from Stage 1, and wire "Cancelar" to return to the main screen without executing anything, per the spec's Architecture Impact and Technical Decisions.
