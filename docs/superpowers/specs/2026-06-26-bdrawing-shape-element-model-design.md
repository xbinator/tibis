# 2026-06-26 BDrawing Shape Element Model Design

## Goal

Refactor `DrawingShapeElement` so the shared element model only contains canvas-level instance data and element registry metadata. Component-specific business data moves into `metadata`, allowing each drawing node implementation to own its own payload shape.

## Requirements

- Make `style` required on every `DrawingShapeElement`.
- Replace the current default metadata structure with required custom metadata: `Record<string, unknown>`.
- Remove top-level `text` and `description`.
- Add `label` and `icon`, copied from `DrawingElementSchema` when the element is created.
- Add `title` for user-defined Chinese display names.
- Keep `label` read-only. Users edit `title`, not `label`.
- Display names use `title` directly.
- Create new elements with `title` copied from `label` and `metadata: {}`.
- Legacy `text` and `description` fields are discarded during normalization.
- Do not commit the design or implementation changes in this task; the user will commit later.

## Data Model

`src/components/BDrawing/types.ts` should define:

```ts
/**
 * 自由形状元素。
 */
export interface DrawingShapeElement {
  /** 真实元素 ID */
  id: string;
  /** 元素注册名称 */
  name: string;
  /** 元素显示名称，来自注册配置，不支持编辑 */
  label: string;
  /** 元素图标，来自注册配置 */
  icon: string;
  /** 用户自定义中文名称，默认取 label */
  title: string;
  /** 元素位置 */
  position: DrawingPoint;
  /** 元素尺寸 */
  size: DrawingSize;
  /** 旋转角度，单位为度 */
  rotation: number;
  /** 元素样式 */
  style: DrawingElementStyle;
  /** 组件自定义元数据 */
  metadata: Record<string, unknown>;
}
```

`DrawingAddShapeOptions` should no longer accept `text` or `createdAt`. It should still accept `style?: DrawingElementStyle`, because callers may provide partial initial style and creation can normalize it to a required object.

## Registry Data

`label` and `icon` come from `src/components/BDrawing/elements/types.ts` through `DrawingElementSchema`.

At creation time:

- `name` remains the stable registry key.
- `label` is copied from `schema.label`.
- `icon` is copied from `schema.icon`.
- `title` is copied from `schema.label`.
- `style` is set to a normalized style object.
- `metadata` is set to `{}`.

These values should be stored on each element snapshot. They should not be re-derived on every render, so persisted elements remain self-describing even if registry display metadata changes later.

## Display Name

Do not add a display-title helper. Normalization and creation guarantee `title` is populated with the registry `label` by default, so UI consumers can render `element.title` directly.

`label` is not editable. The settings panel should edit `title`.

## Normalization And Legacy Data

`boardTransforms.ts` already has a normalization path through `createSupportedElementSnapshot`. That path should become the single place that adapts older data to the new shape.

Normalization rules:

- Preserve `id`, `name`, `position`, `size`, `rotation`, existing `style`, existing `label`, existing `icon`, existing `title`, and custom `metadata` when valid.
- Fill missing `style` with `{}`.
- Fill missing `metadata` with `{}`.
- Fill missing `label` and `icon` from the element schema when the schema exists.
- Use a safe fallback for unknown schema names so old or experimental files do not crash. A suitable fallback is `label: name` and `icon: 'lucide:box'`.
- Fill missing `title` with the normalized `label`.
- Continue supporting old snapshots that used `shape` instead of `name`.
- Drop legacy `text`, `description`, `source`, `createdAt`, and `manualSize`.

Because `manualSize` is removed from `metadata`, text-driven auto-height behavior that depended on `metadata.manualSize` should be removed from the generic model. Component-specific sizing can return later through component-owned metadata or component-specific logic.

## Board Commands

Creation should look up the schema before creating an element. `createElementFromClientPoint` already validates schema at the component boundary; lower-level board code should either receive registry metadata in `DrawingAddShapeOptions` or perform a schema lookup itself.

The preferred low-friction option is to extend `DrawingAddShapeOptions` with copied registry fields:

```ts
export interface DrawingAddShapeOptions {
  id: string;
  name: string;
  label: string;
  icon: string;
  start: DrawingPoint;
  end: DrawingPoint;
  style?: DrawingElementStyle;
}
```

`useDrawingBoard.commitCreateShapeDraft` can resolve the schema from the draft name and pass `label` and `icon` into `addDrawingShape`.

Rename or replace text-oriented commands:

- `updateDrawingNodeText` should become `updateDrawingElementTitle`.
- The public board return type should expose `updateElementTitle`.
- Existing settings code should bind to `title`.

## Rendering

Generic rendering no longer reads `element.text`.

`DrawingNode.vue` fallback should show `element.title`.

`Text/index.vue` should not read `element.text`. Until text-node metadata schema is introduced, it can show `element.title`.

`Rect/index.vue` currently renders the whole element object. That should be replaced with a simple visual using `element.title`.

`getDrawingShapeRenderSize` should no longer special-case `text` by measuring `element.text`. Text-specific sizing should wait for a metadata-backed text component model.

## Settings Panel

`DesignSetter.vue` should edit:

- `dataItem.title` for the name field.
- `dataItem.style.*` without optional style guards, because `style` is required.
- geometry fields as before.

Labels in the settings panel should read `title` directly. If an older snapshot lacks `title`, the normalization path fills it from `label`.

## Electron Runtime Boundary

`electron/main/modules/chat/runtime/domain/drawing-runtime.mts` has its own `DrawingShapeElement` shape with `kind`, `shape`, and `text`. That runtime is related but not identical to the front-end BDrawing model.

This refactor should focus on `src/components/BDrawing` and the drawing page first. Runtime alignment can be handled separately unless a type check or data sync path requires immediate changes.

## Testing

Update tests around these behaviors:

- New elements include required `style`, required `metadata`, `label`, `icon`, and `title` copied from `label`.
- Legacy snapshots normalize old `shape` to `name`, fill registry metadata, and discard `text`, `description`, `source`, `createdAt`, and `manualSize`.
- Settings panel edits `title`, not `text`.
- Layer titles use `title`.
- Text-specific auto-sizing and `manualSize` expectations are removed or rewritten for the generic model.
- Existing move, resize, reorder, selection, and model-sync tests continue to pass with the new required fields.

## Non-Goals

- Designing the metadata schema for the text element.
- Migrating legacy `text` into `title` or `metadata`.
- Aligning the Electron drawing runtime model in this change.
- Persisting creation timestamps or source metadata in the generic element model.
