# 2026-06-26 BDrawing Select Model Refactor Design

## Goal

Refactor `src/components/BDrawing/index.vue` so its public data API uses `defineModel`, and so the drawing page can edit a single current target through `v-model:select`.

The new API separates persisted drawing data from transient canvas selection:

- Persisted data lives in `DrawingData`.
- Internal canvas selection remains an ID array inside `DrawingBoardState`.
- The public `select` model exposes the current editable target only.

## Requirements

- Remove the `modelValue` prop and `update:modelValue` emit from `BDrawing`.
- Use a named data model such as `defineModel<DrawingData>('value', ...)`, consumed as `v-model:value`.
- Add `v-model:select` for the current editable target.
- Add `metadata` to `DrawingData`.
- When no element is selected, `select` points to `DrawingData.metadata`.
- When exactly one element is selected, `select` points to that `DrawingElement`.
- When multiple elements are selected, `select` is `null` and should be treated as not directly editable.
- Keep `selection` out of persisted `DrawingData`.

## Data Model

Add a top-level metadata object:

```ts
/**
 * 画板元信息。
 */
export interface DrawingMetadata {
  /** 预留扩展字段 */
  [key: string]: unknown;
}

/**
 * 画板外部双向绑定数据。
 */
export interface DrawingData {
  /** 画板元信息 */
  metadata: DrawingMetadata;
  /** 元素数据 */
  elements: DrawingElement[];
  /** 视口数据 */
  viewport: DrawingViewport;
}
```

Add a select target type:

```ts
/**
 * 当前设置面板可编辑目标。
 * 有 id 时表示画图元素；无 id 时表示画板 metadata；null 表示多选等不可直接编辑状态。
 */
export type DrawingSelectTarget = DrawingElement | DrawingMetadata | null;
```

`DrawingMetadata` should not use a top-level `id` field. `id` is reserved as the discriminator for element targets.

## Component API

`BDrawing` should expose:

```vue
<BDrawing
  ref="drawingRef"
  v-model:value="session.data.value"
  v-model:select="selectedTarget"
/>
```

Internally:

```ts
const drawingData = defineModel<DrawingData>('value', {
  default: (): DrawingData => createEmptyDrawingData()
});

const selectedTarget = defineModel<DrawingSelectTarget>('select', {
  default: null
});
```

The existing `selection-change` event is removed after callers migrate to `v-model:select`.

## Select Synchronization

`BDrawing` keeps `board.state.selection` as the source of truth for interaction behavior.

When `board.state.selection` changes, `BDrawing` updates `select` for the parent:

- `[]` emits the current `drawingData.metadata` object reference.
- `[id]` emits the matching object reference from `drawingData.elements`.
- More than one ID emits `null`.

`select` is not a second data source. It is a direct reference into `DrawingData`, so settings controls mutate the referenced metadata or element object in place. `BDrawing` does not need a separate watcher that copies `select` back into `drawingData`.

## Metadata Defaults And Migration

New drawing data should include:

```ts
{
  metadata: {},
  elements: [],
  viewport: {
    center: { x: 0, y: 0 },
    zoom: 1
  }
}
```

Existing `.tibis` files without `metadata` remain supported. Model normalization should create `metadata: {}` when loading or syncing old data.

`createDrawingDataSnapshot()` should always emit `metadata`, `elements`, and `viewport`, and still avoid internal fields such as `selection`, `draft`, and `history`.

## Drawing Page Changes

`src/views/drawing/index.vue` no longer needs the computed `selectedElements` bridge for settings-panel editing.

Expected shape:

- Keep `session.data.value` as the persisted data model.
- Add `selectedTarget = ref<DrawingSelectTarget>(session.data.value.metadata)`.
- Pass `v-model:select` to `BDrawing`.
- Pass `selectedTarget` to `SettingsPanel`.

`selectedElementIds` may still exist only for layer highlighting if `SidebarPanel` needs to show multi-selection. That state should come from a separate read-only selection ID channel, or remain local to `BDrawing`; it must not be mixed into the editable `select` target.

## Settings Panel Behavior

`SettingsPanel` receives only the editable target:

- `select === null`: show a multi-select read-only state.
- `select` has `id`: show element design controls.
- `select` has no `id`: show page/metadata controls.

`PageSetter` should be updated to work from `DrawingMetadata` plus any read-only drawing summary it still needs. First version can keep metadata empty and show existing derived summary from `DrawingData` if the page still passes it separately.

`DesignSetter` should edit a single `DrawingElement` target reference, not an array. Multi-select batch editing is intentionally out of scope for this refactor.

## Testing

Update or add tests for:

- `BDrawing` emits `update:value` instead of `update:modelValue`.
- `BDrawing` emits `update:select` with metadata for empty selection.
- `BDrawing` emits `update:select` with an element for single selection.
- `BDrawing` emits `update:select` with `null` for multi-select.
- Empty and single-selection `update:select` payloads reference the corresponding object in `DrawingData`.
- Selection-driven `update:select` does not emit `update:value`.
- Editing metadata or an element through settings mutates the referenced `DrawingData` object.
- Old drawing data without `metadata` normalizes to `metadata: {}`.
- Lightweight model snapshots include `metadata` but exclude `selection`, `draft`, and `history`.

## Non-Goals

- Persisting canvas selection in `.tibis` files.
- Batch editing multiple selected elements through `select`.
- Defining concrete metadata fields beyond an empty extensible object.
- Refactoring drawing history, Moveable, Selecto, or viewport behavior beyond the API migration.
