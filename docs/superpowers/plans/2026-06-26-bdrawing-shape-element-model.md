# BDrawing Shape Element Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `DrawingShapeElement` so generic drawing elements store required style, required custom metadata, registry label/icon, and editable title while removing generic text/description fields.

**Architecture:** Normalize all element snapshots through `boardTransforms.ts`, then update rendering and settings consumers to use populated `title` directly. The generic model stops owning text payload and text auto-sizing; component-specific content will later live in `metadata`.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Vitest, lodash-es, BDrawing local utilities.

**Execution Constraint:** Do not create a git commit. The user will review and commit all changes later.

---

## File Structure

- Modify `src/components/BDrawing/types.ts`: update `DrawingShapeElement`, `DrawingAddShapeOptions`, and remove generic text fields.
- Modify `src/components/BDrawing/utils/boardTransforms.ts`: normalize new fields, drop legacy fields, update creation, remove generic text sizing, and rename title update command.
- Modify `src/components/BDrawing/hooks/useDrawingBoard.ts`: pass schema label/icon into creation and expose `updateElementTitle`.
- Modify `src/components/BDrawing/renderers/DrawingNode.vue`: use required style and display title fallback.
- Modify `src/components/BDrawing/elements/Text/index.vue`: render display title instead of generic `text`.
- Modify `src/components/BDrawing/elements/Rect/index.vue`: render a clean rectangle using display title instead of dumping the whole element.
- Modify `src/components/BDrawing/utils/drawingGeometry.ts`: remove text-specific render-size measurement.
- Modify `src/components/BDrawing/components/MoveableLayer.vue`: remove `metadata.manualSize` and text auto-fit assumptions from generic resize preview.
- Modify `src/views/drawing/components/SidebarPanel.vue`: use stored `label/icon` and display title.
- Modify `src/views/drawing/components/DesignSetter.vue`: edit `title` and rely on required `style`.
- Modify BDrawing tests under `test/components/BDrawing` and `test/views/drawing` to match the new model.
- Modify `changelog/2026-06-26.md` or create it if absent: record the model refactor.

### Task 1: Model Tests

**Files:**
- Modify: `test/components/BDrawing/board-transforms.test.ts`
- Modify: `test/components/BDrawing/drawing-geometry.test.ts`
- Modify: `test/components/BDrawing/use-model-sync.test.ts`

- [ ] **Step 1: Update test fixtures to the new shape**

Use fixtures with required fields:

```ts
function createShapeElement(id: string): DrawingShapeElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '矩形',
    position: { x: 100, y: 120 },
    size: { width: 180, height: 72 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}
```

- [ ] **Step 2: Add normalization expectations**

Add or update assertions in `board-transforms.test.ts`:

```ts
it('normalizes shape elements to required registry and custom metadata fields', (): void => {
  const initial = createDrawingBoardState({
    elements: [createLegacyShapeElement('node-1')]
  });
  const element = expectShapeElement(initial.elements[0]);

  expect(element).toMatchObject({
    id: 'node-1',
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '矩形',
    style: {},
    metadata: {}
  });
  expect('text' in element).toBe(false);
  expect('description' in element).toBe(false);
});
```

- [ ] **Step 3: Replace text update tests with title update tests**

Replace `updateDrawingNodeText` imports and expectations:

```ts
const updated = updateDrawingElementTitle(initial, 'node-1', '审批节点');

expect(expectShapeElement(updated.elements[0]).title).toBe('审批节点');
expect(updated.history.past).toHaveLength(1);
```

- [ ] **Step 4: Rewrite creation tests**

Assert new elements include copied registry fields and no legacy fields:

```ts
expect(added.elements[0]).toMatchObject({
  id: 'shape-1',
  name: 'rect',
  label: '矩形',
  icon: 'lucide:square',
  title: '矩形',
  style: {},
  metadata: {}
});
expect('text' in expectShapeElement(added.elements[0])).toBe(false);
```

- [ ] **Step 5: Remove generic text auto-sizing expectations**

Delete assertions that depend on:

```ts
measureDrawingTextElementSize
metadata.manualSize
element.text
updateDrawingNodeText
```

Keep move, resize, undo, redo, reorder, and model-sync coverage with the new fixture.

- [ ] **Step 6: Run the focused tests and confirm they fail before implementation**

Run:

```bash
pnpm exec vitest run test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/drawing-geometry.test.ts test/components/BDrawing/use-model-sync.test.ts
```

Expected: FAIL with TypeScript/runtime errors for missing `label`, `icon`, `title`, required `style`, or missing `updateDrawingElementTitle`.

### Task 2: Core Types And Normalization

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Modify: `src/components/BDrawing/utils/boardTransforms.ts`
- Modify: `src/components/BDrawing/hooks/useDrawingBoard.ts`

- [ ] **Step 1: Update `DrawingShapeElement` and `DrawingAddShapeOptions`**

Use this shape in `src/components/BDrawing/types.ts`:

```ts
export interface DrawingShapeElement {
  /** 真实元素 ID */
  id: string;
  /** 元素注册名称 */
  name: string;
  /** 元素显示名称，来自注册配置，不支持编辑 */
  label: string;
  /** 元素图标，来自注册配置 */
  icon: string;
  /** 用户自定义中文名称 */
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

export interface DrawingAddShapeOptions {
  /** 元素 ID */
  id: string;
  /** 元素注册名称 */
  name: string;
  /** 元素显示名称 */
  label: string;
  /** 元素图标 */
  icon: string;
  /** 拖拽起点 */
  start: DrawingPoint;
  /** 拖拽终点 */
  end: DrawingPoint;
  /** 元素初始样式 */
  style?: DrawingElementStyle;
}
```

- [ ] **Step 2: Use title directly for display**

Do not create a shared display-title helper. Creation and normalization should populate `title`, so renderers and layer lists can read `element.title` directly.

- [ ] **Step 3: Update snapshot candidate typing**

In `boardTransforms.ts`, use a candidate type that accepts legacy fields:

```ts
type DrawingElementSnapshotCandidate = Partial<Omit<DrawingShapeElement, 'metadata' | 'style'>> & {
  /** 旧版元素类别 */
  kind?: unknown;
  /** 旧版形状类型 */
  shape?: unknown;
  /** 旧版主文本 */
  text?: unknown;
  /** 旧版说明 */
  description?: unknown;
  /** 旧版或新版样式 */
  style?: Partial<DrawingElementStyle>;
  /** 组件自定义元数据或旧版系统元数据 */
  metadata?: Record<string, unknown>;
};
```

- [ ] **Step 4: Add schema fallback helpers**

Import `getDrawingElementSchema` and add helpers:

```ts
/**
 * 读取元素注册显示信息。
 * @param name - 元素注册名称
 * @returns 元素显示信息
 */
function getElementRegistryDisplay(name: string): { label: string; icon: string } {
  const schema = getDrawingElementSchema(name);

  return {
    label: schema?.label ?? name,
    icon: schema?.icon ?? 'lucide:box'
  };
}
```

- [ ] **Step 5: Normalize supported snapshots**

Return the new shape from `createSupportedElementSnapshot`:

```ts
const registryDisplay = getElementRegistryDisplay(name);

return {
  id: element.id,
  name,
  label: typeof element.label === 'string' ? element.label : registryDisplay.label,
  icon: typeof element.icon === 'string' ? element.icon : registryDisplay.icon,
  title: typeof element.title === 'string' ? element.title : label,
  position: cloneDeep(element.position),
  size: cloneDeep(element.size),
  rotation: typeof element.rotation === 'number' ? element.rotation : 0,
  style: cloneDeep(element.style ?? {}),
  metadata: cloneDeep(element.metadata ?? {})
};
```

- [ ] **Step 6: Simplify creation style and remove generic text sizing**

Make `createShapeInitialStyle` always return a style object:

```ts
function createShapeInitialStyle(style?: DrawingElementStyle): DrawingElementStyle {
  return cloneDeep(style ?? {});
}
```

Remove `getShapeDefaultText`, `createTextShapeGeometry`, `getRegularShapeManualSize`, `setRegularShapeManualSize`, `createManualResizeSize`, and `fitRegularShapeSizeToText`.

- [ ] **Step 7: Update `addDrawingShape`**

Create elements with required fields:

```ts
const style = createShapeInitialStyle(options.style);
const geometry = createShapeGeometry(options.start, options.end);
const element: DrawingShapeElement = {
  id: options.id,
  name: options.name,
  label: options.label,
  icon: options.icon,
  title: options.label,
  position: cloneDeep(geometry.position),
  size: cloneDeep(geometry.size),
  rotation: 0,
  style,
  metadata: {}
};
```

- [ ] **Step 8: Update resize and style commands**

Resize should clamp size and update position without text fit:

```ts
if (change.size) {
  element.size = {
    width: Math.max(DRAWING_MIN_ELEMENT_SIZE.width, normalizeGeometryValue(change.size.width)),
    height: Math.max(DRAWING_MIN_ELEMENT_SIZE.height, normalizeGeometryValue(change.size.height))
  };
}
```

Style update should merge into required style and not measure text:

```ts
element.style = {
  ...element.style,
  ...style
};
```

- [ ] **Step 9: Replace text update command with title update command**

Rename the exported command:

```ts
export function updateDrawingElementTitle(state: DrawingBoardState, elementId: string, title: string): DrawingBoardState {
  const nextElements = cloneDeep(state.elements);
  const element = nextElements.find((item) => item.id === elementId);
  if (!element) {
    return withError(state, new Error(`找不到元素: ${elementId}`));
  }

  element.title = title;

  return withHistory(state, {
    elements: nextElements,
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}
```

- [ ] **Step 10: Update `useDrawingBoard` creation and API**

Import `getDrawingElementSchema`. In `commitCreateShapeDraft`, resolve schema:

```ts
const schema = getDrawingElementSchema(draft.name);
if (!schema) {
  state.value = {
    ...state.value,
    draft: undefined,
    lastError: new Error(`找不到元素注册配置: ${draft.name}`)
  };
  return;
}
```

Pass `label` and `icon` into `addDrawingShape`, and expose:

```ts
updateElementTitle: (elementId: string, title: string) => void;
```

- [ ] **Step 11: Run focused model tests**

Run:

```bash
pnpm exec vitest run test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/drawing-geometry.test.ts test/components/BDrawing/use-model-sync.test.ts
```

Expected: PASS for model tests or only UI-consumer failures that are handled in later tasks.

### Task 3: Rendering And Interaction Consumers

**Files:**
- Modify: `src/components/BDrawing/renderers/DrawingNode.vue`
- Modify: `src/components/BDrawing/elements/Text/index.vue`
- Modify: `src/components/BDrawing/elements/Rect/index.vue`
- Modify: `src/components/BDrawing/utils/drawingGeometry.ts`
- Modify: `src/components/BDrawing/components/MoveableLayer.vue`

- [ ] **Step 1: Update `DrawingNode.vue` fallback**

Render the populated title directly:

```vue
<div v-else class="b-drawing-node__fallback">{{ node.title }}</div>
```

Use required style directly:

```ts
opacity: props.node.style.opacity,
```

- [ ] **Step 2: Update `Text/index.vue`**

Render display title:

```vue
<div class="drawing-text-element-view">{{ element?.title }}</div>
```

Keep the existing typed `element?: DrawingShapeElement` prop.

- [ ] **Step 3: Update `Rect/index.vue`**

Render a clean rectangle:

```vue
<div class="drawing-rect-element-view">{{ element?.title }}</div>
```

Keep the existing typed `element?: DrawingShapeElement` prop.

- [ ] **Step 4: Simplify render size**

In `drawingGeometry.ts`, remove `measureDrawingTextElementSize` import and make:

```ts
export function getDrawingShapeRenderSize(element: DrawingShapeElement): DrawingSize {
  return element.size;
}
```

- [ ] **Step 5: Simplify Moveable resize previews**

In `MoveableLayer.vue`, remove `createDrawingTextFitSize` import, `resizeGestureBaseSizes`, `shouldFitShapeTextSize`, `getResizeGestureBaseSize`, `hasVerticalResizeDirection`, `createGestureManualSize`, `clearResizeGestureBaseSizes`, and `createTextFitPreviewSize`.

Use direct size in resize changes:

```ts
const size = shouldConvertGroupSize
  ? groupResizeSizeToWorld({ width: payload.width, height: payload.height })
  : { width: payload.width, height: payload.height };
```

Use direct size in previews:

```ts
updateNodePreviewSize(event.target, size);

return {
  id,
  position,
  size
};
```

Remove calls to `clearResizeGestureBaseSizes`.

- [ ] **Step 6: Run component tests related to canvas rendering and selection**

Run:

```bash
pnpm exec vitest run test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/node-click-selection.test.ts
```

Expected: FAIL only where test expectations still reference old text output; then update those tests in Task 4.

### Task 4: Drawing Page And Settings Consumers

**Files:**
- Modify: `src/views/drawing/components/SidebarPanel.vue`
- Modify: `src/views/drawing/components/DesignSetter.vue`
- Modify: `test/views/drawing/settings-panel.test.ts`
- Modify: `test/components/BDrawing/drawing-canvas.component.test.ts`
- Modify: `test/components/BDrawing/node-click-selection.test.ts`

- [ ] **Step 1: Update sidebar title and icon usage**

Use stored title and icon directly:

```ts
function getElementTitle(element: DrawingElement): string {
  return element.title;
}

function getElementIcon(element: DrawingElement): string {
  return element.icon;
}
```

Update template call:

```vue
<span class="sidebar-panel__layer-title">{{ getElementTitle(element) }}</span>
```

- [ ] **Step 2: Update `DesignSetter.vue` model**

Change the name field to:

```vue
<AInput v-model:value="dataItem.title" />
```

Update test source assertions from `selectedElement.text` to `selectedElement.title` or from `dataItem.text` to `dataItem.title`, matching the current source structure.

- [ ] **Step 3: Update test fixtures in component tests**

Use the required shape:

```ts
{
  id: 'node-1',
  name: 'rect',
  label: '矩形',
  icon: 'lucide:square',
  title: '外部节点',
  position: { x: 120, y: 80 },
  size: { width: 180, height: 72 },
  rotation: 0,
  style: {},
  metadata: {}
}
```

- [ ] **Step 4: Update rendering expectations**

Replace old text expectations:

```ts
expect(node.find('.drawing-rect-element-view').text()).toBe('外部节点');
expect(textNode.text()).toContain('文本');
```

with display-title expectations:

```ts
expect(node.find('.drawing-rect-element-view').text()).toBe('外部节点');
expect(textNode.text()).toContain('文本');
```

For newly created default text elements, the expected display remains `'文本'` because `title` is copied from the schema label.

- [ ] **Step 5: Update settings mutation tests**

Expect title mutation:

```ts
expect(element.title).toBe('更新标题');
```

Keep style tests using required style:

```ts
expect(element.style.textAlign).toBe('left');
```

- [ ] **Step 6: Run page and component tests**

Run:

```bash
pnpm exec vitest run test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/node-click-selection.test.ts test/views/drawing/settings-panel.test.ts
```

Expected: PASS.

### Task 5: Changelog And Full Verification

**Files:**
- Modify or create: `changelog/2026-06-26.md`

- [ ] **Step 1: Record the change**

Ensure `changelog/2026-06-26.md` contains:

```md
# 2026-06-26

## Changed
- Refactored BDrawing shape element data to store required style, required custom metadata, registry label/icon, and editable title while removing generic text fields.
```

If the file already exists, add the bullet under `## Changed`.

- [ ] **Step 2: Run focused BDrawing test suite**

Run:

```bash
pnpm exec vitest run test/components/BDrawing test/views/drawing
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run lint checks**

Run:

```bash
pnpm exec eslint src/components/BDrawing src/views/drawing test/components/BDrawing test/views/drawing --ext .vue,.ts
pnpm exec stylelint 'src/components/BDrawing/**/*.{vue,less,css}' 'src/views/drawing/**/*.{vue,less,css}'
```

Expected: PASS.

- [ ] **Step 5: Confirm no commits were created**

Run:

```bash
git status --short
```

Expected: changed files are visible, but no commit has been created by this implementation.
