# BSegmented Component Design

## Context

The source reference is the `library.smart` BSegmented component provided in the user request. It provides a segmented tab control with:

- `value` / `update:value` model binding.
- `options` driven tab labels.
- A `label` slot for custom tab labels.
- Named content slots keyed by option value.
- Lazy rendering for content panels after first activation.
- A sliding active indicator measured from the segment container width.

The Tibis codebase should not copy the file directly because the source component uses `any`, source-specific `m-*` class names, source theme variables, and setup-time DOM measurement.

## Goals

- Add a Tibis-native `src/components/BSegmented` component.
- Preserve the useful interaction model from the source component.
- Migrate only `src/views/drawing/components/DesignSetter.vue` from Ant Design `Segmented` to `BSegmented`.
- Leave `src/views/settings/provider/components/ModelList.vue` on `ASegmented`.
- Keep the implementation aligned with project rules: no `any`, typed props/emits, file headers, JSDoc comments, `createNamespace`, searchable Less selectors, tests first, and changelog update.

## Non-Goals

- Do not replace every `ASegmented` usage.
- Do not add a broad design-system abstraction beyond this component.
- Do not introduce new theme tokens unless existing semantic tokens are insufficient.

## Component API

Create `src/components/BSegmented/types.ts`:

- `BSegmentedValue = string | number`
- `BSegmentedOption` with:
  - `label: string`
  - `value: BSegmentedValue`
  - optional `disabled?: boolean`
  - optional `className?: string`
  - optional `payload?: unknown`
- `BSegmentedProps` with:
  - `value?: BSegmentedValue`
  - `options: BSegmentedOption[]`
  - `block?: boolean`

Create `src/components/BSegmented/index.vue`:

- Support `v-model:value`.
- Emit `update:value` and `change`.
- Render labels from `option.label` by default.
- Support `#label="{ record, active }"` for custom labels.
- Support named content slots with the option value as the slot name.
- Lazily render each content slot after the option has been activated once.
- Ignore clicks on disabled options.
- If `value` is unset or no longer exists in `options`, select the first enabled option when available.

## Rendering And Styling

- Use `defineOptions({ name: 'BSegmented' })`.
- Use `createNamespace('segmented')` to generate `b-segmented` classes.
- Use complete class selectors in Less, such as `.b-segmented__tab`; do not use `&__tab`.
- Use existing semantic tokens:
  - Track background: `var(--bg-secondary)`
  - Active item background: `var(--bg-primary)` or `var(--bg-elevated)`
  - Active text: `var(--color-primary)`
  - Inactive text: `var(--text-secondary)`
  - Borders: `var(--border-primary)`
- Keep the control compact enough for settings panels.
- The root should support full-width use through `block`.

## Measurement

- Measure the nav bar width after mount with `nextTick`.
- Use `useResizeObserver` from `@vueuse/core` on the tab container so the active indicator stays aligned when the panel changes width.
- Compute the active indicator from the active option index and current segment width.
- Avoid setup-time direct DOM measurement from the source component.

## Migration

In `src/views/drawing/components/DesignSetter.vue`:

- Replace `<ASegmented ... />` with `<BSegmented ... />`.
- Remove `Segmented as ASegmented` from the Ant Design import.
- Keep the existing text alignment options and handlers unchanged.

In `vite.config.ts`:

- Add `BSegmented` to `COMPONENT_DIRS` so auto registration and generated component declarations can discover the component.

## Tests

Add `test/components/BSegmented/index.test.ts` before implementation:

- Renders labels from options.
- Defaults to the first enabled option when `value` is unset.
- Emits `update:value` and `change` when clicking another option.
- Does not switch to a disabled option.
- Renders the `label` slot with the option record.
- Lazily renders a named content slot only after activation.

Add or update a focused test for `DesignSetter.vue`:

- Verify the source no longer imports `Segmented as ASegmented`.
- Verify the template uses `BSegmented` for text alignment.

## Verification

Run focused tests first:

```bash
pnpm test test/components/BSegmented/index.test.ts
pnpm test test/views/drawing/settings-panel.test.ts
```

Then run project checks before completion unless a local environment issue blocks them:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```

## Changelog

Update `changelog/2026-06-25.md` under `Changed` with a concise entry noting the new `BSegmented` component and the `DesignSetter.vue` migration.
