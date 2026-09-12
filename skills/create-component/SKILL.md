---
name: create-component
description: Scaffolds a new React component following this codebase's conventions (folder layout, props typing, exports, hooks colocation, forms, styling). Use whenever creating a new component, dialog, or form section anywhere under src/.
---

# Create Component

Generates a new React/TypeScript component that matches the patterns already established in this repo (most consistently in `src/pages/app/PDVNext/`), instead of inventing a new shape each time.

## INPUT

Free-form. Expect some combination of:

- A component name (e.g. `NegotiateTotalDialog`, `VariationChips`).
- Where it belongs, or enough context to infer it (a feature/page, or "shared").
- What it does / its props, roughly.
- Whether it's a dialog, a form, or a plain presentational piece.

If the name or location is ambiguous, ask; don't guess a business-relevant location silently.

## OUTPUT

- A new folder `<ComponentName>/` with `<ComponentName>.tsx` and `index.ts` (and a `hooks/` subfolder if a hook is warranted — see below).
- No changes to unrelated files. Don't wire the component into a parent unless asked — creating it is the task, not integrating it.

---

## STEP 1 — Decide where it lives

Walk this in order:

1. **Only ever used inside one other component** (e.g. a dialog opened from a single panel) → nest it under that parent: `.../components/<Parent>/components/<ComponentName>/`. See `src/pages/app/PDVNext/components/CartPanel/components/NegotiateTotalDialog/` for the pattern.
2. **Used by one page/feature, but by more than one component in it (or the page's top level)** → `src/pages/app/<Feature>/components/<ComponentName>/`.
3. **Reusable across pages/features** → top-level `src/components/<ComponentName>/`.

Never put a component directly in a page's root folder mixed in with the page file itself — always a `components/` subfolder.

**Dialogs are never inlined.** If a component opens a `<Dialog>` (or `Drawer`/modal), that dialog always gets its own component in its own file under the parent's internal `components/` folder — `.../components/<Parent>/components/<SomeDialog>/<SomeDialog>.tsx` + `index.ts` — even if it's small and only used once. Don't write the `<Dialog>` JSX inline inside the parent's return.

## STEP 2 — Scaffold the files

Folder and file names are PascalCase and match the component name exactly (`NegotiateTotalDialog/NegotiateTotalDialog.tsx`, not `index.tsx`).

**`<ComponentName>.tsx`**:

```tsx
interface ComponentNameProps {
  // typed props — avoid `any` here even though the lint rule allows it;
  // reserve `any` for genuine boundary cases (untyped service responses, etc.)
}

export const ComponentName: React.FC<ComponentNameProps> = ({
  // destructure props
}) => {
  return (
    // MUI components, styled with the `sx` prop
  );
};
```

- Named export, no default export — unless this component is a route page mounted via `componentLoader()` in [src/router.tsx](../../../src/router.tsx), which does need `export default`.
- No `import React from 'react'` — this repo uses the automatic JSX runtime; only import what's actually used (hooks, types).
- Styling: MUI `sx` prop is the default. Only reach for `styled()` from `@mui/material/styles` when the same style variant is reused across several instances.
- Any user-facing string (labels, button text, error messages) is Portuguese (pt-BR), matching the rest of the app.
- Follow the repo's no-comments default: don't explain what the JSX does. A short comment is only justified for a non-obvious WHY (a Figma-spec quirk, a business rule that isn't visible from the code itself) — see the existing `NegotiateTotalDialog.tsx` / `VariationChips.tsx` doc comments for the tone to match.

**`index.ts`**:

```ts
export { ComponentName } from './ComponentName';
```

(Plain named re-export — this is the pattern used by the newest components. Don't add a default re-export unless the component is consumed somewhere that specifically needs one.)

## STEP 3 — Extract a hook if there's non-trivial logic

If the component owns form state, multi-step derived state, or any logic dense enough to clutter the JSX, pull it into `hooks/use<ComponentName><Purpose>.ts` next to the component (e.g. `NegotiateTotalDialog/hooks/useNegotiateTotalDialogForm.ts`), and have the component call it as its first line:

```ts
const { ...values } = useComponentNameForm({ ...args });
```

- The hook file is a **named export only**, same as the component.
- For forms: `react-hook-form` + `zod`, resolved via `zodResolver`. Define the schema and `type XFormData = z.infer<typeof schema>` in the hook file, not in the component.
- If the component needs cross-route state, read/write the relevant Zustand store from `src/stores/` (e.g. `useOrderCheckout`) — don't invent local state that duplicates store state.
- If the component needs server data, use an existing `useX` hook from `src/queries/`; don't fetch inline with `useEffect` + a service call directly in the component.

## STEP 4 — Loading state: skeleton when the design doesn't say otherwise

If the component (or the data it depends on) has a loading state and the design/spec doesn't say what it should look like, don't fall back to a spinner or a blank state — build a skeleton that mirrors the real content's layout, following the repo-wide pattern (see e.g. `SupplierItemSkeleton`, `CreditSkeletonRow`, `ClientTableSkeleton`):

- A dedicated component named `<ComponentName>Skeleton` (rows/table skeletons are named `<ComponentName>SkeletonRow`), in its own file/folder with an `index.ts`, sibling to the component it stands in for.
- Built from MUI's `Skeleton` (`variant="text" | "circular" | "rectangular"`), sized and laid out to approximate the real content's dimensions — not a generic centered spinner.
- Rendered by the parent in place of the real content while loading (e.g. mapping a fixed count of `<ComponentNameSkeleton />` rows), not as a separate route or overlay.

If the design *does* specify a loading treatment, follow that instead — this rule only fills the gap when nothing was specified.

## STEP 5 — Sanity check

- Re-read [CLAUDE.md](../../../CLAUDE.md) if the component touches a domain area with its own conventions (label printing, PDV, mock/local services) — those sections take precedence over the generic shape here.
- Run `tsc -b` (or let lint-staged catch it at commit time) — don't hand-wave type errors on the new files.
- Don't add a barrel export for the parent folder's `components/` directory unless one already exists there.
