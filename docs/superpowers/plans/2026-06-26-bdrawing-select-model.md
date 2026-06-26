# BDrawing Select Model Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `BDrawing` from `modelValue` plus `selection-change` to named `defineModel` bindings for persisted drawing data and the current editable select target.

**Architecture:** Keep `DrawingBoardState.selection` as the internal interaction state, but expose only a single editable `DrawingSelectTarget` to the page. `DrawingData` gains top-level `metadata`, and `select` points directly at the current metadata or element object inside `DrawingData`.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Vitest, Vue Test Utils, lodash-es, existing BDrawing board transform utilities.

---

## File Map

- Modify `src/components/BDrawing/types.ts`: add `DrawingMetadata` and `DrawingSelectTarget`, and add `metadata` to `DrawingData`.
- Modify `src/components/BDrawing/utils/boardTransforms.ts`: normalize old data without metadata and include metadata in lightweight snapshots.
- Modify `src/components/BDrawing/hooks/useModelSync.ts`: sync elements and viewport through the board while preserving external metadata and valid internal selection.
- Modify `src/components/BDrawing/index.vue`: replace props/emits model API with `defineModel('value')` and `defineModel('select')`; expose metadata/element references as the select target.
- Modify `src/views/drawing/index.vue`: consume `v-model:value` and `v-model:select`; remove the `selectedElements` computed bridge.
- Modify `src/views/drawing/components/SettingsPanel.vue`: consume `v-model:select` and branch on null / element / metadata.
- Modify `src/views/drawing/components/DesignSetter.vue`: edit one `DrawingElement` reference through props.
- Modify `src/views/drawing/components/PageSetter.vue`: accept `metadata` plus read-only `drawingData` summary.
- Modify `src/hooks/useOpenFile.ts`: new drawing files include `metadata: {}`.
- Modify tests under `test/components/BDrawing`, `test/views/drawing`, and `test/hooks` for new API and metadata normalization.
- Modify `changelog/2026-06-26.md`: add a changed/fixed entry for the BDrawing model API refactor.

### Task 1: DrawingData Metadata Normalization

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Modify: `src/components/BDrawing/utils/boardTransforms.ts`
- Modify: `src/hooks/useOpenFile.ts`
- Test: `test/components/BDrawing/use-model-sync.test.ts`
- Test: `test/hooks/use-file-session.test.ts`

- [ ] **Step 1: Write failing metadata snapshot tests**

In `test/components/BDrawing/use-model-sync.test.ts`, import `createDrawingDataSnapshot` from `@/components/BDrawing/utils/boardTransforms`, update `createDrawingData()` to include `metadata: {}`, and add:

```ts
it('normalizes old drawing data without metadata to an empty metadata object', async (): Promise<void> => {
  const scope = effectScope();
  const legacyData = {
    elements: [createShapeElement('node-1')],
    viewport: {
      center: { x: 10, y: 20 },
      zoom: 1
    }
  } as DrawingData;
  const modelValue = ref<DrawingData | undefined>(legacyData);
  const emitted: DrawingData[] = [];
  let readBoardData: () => DrawingData = (): DrawingData => createDrawingData('fallback');

  scope.run((): void => {
    const board = useDrawingBoard(modelValue.value);
    useModelSync({
      board,
      modelValue
    });

    readBoardData = (): DrawingData => createDrawingDataSnapshot(board.state.value);
  });

  await nextTick();
  scope.stop();

  expect(readBoardData().metadata).toEqual({});
});
```

Add a preservation test:

```ts
it('preserves model metadata when emitting board content changes', async (): Promise<void> => {
  const scope = effectScope();
  const modelValue = ref<DrawingData | undefined>({
    ...createDrawingData('node-1'),
    metadata: {
      title: '流程图'
    }
  });

  scope.run((): void => {
    const board = useDrawingBoard(modelValue.value);
    useModelSync({
      board,
      drawingData: modelValue
    });

    board.startCreateShapeDraft('rect', { x: 20, y: 30 });
    board.updateDraftPoint({ x: 140, y: 90 });
    board.commitCreateShapeDraft();
  });

  await nextTick();
  scope.stop();

  expect(modelValue.value?.metadata).toEqual({ title: '流程图' });
});
```

In `test/hooks/use-file-session.test.ts`, update the serialization and parsing expectations to include `metadata: {}`:

```ts
expect(JSON.parse(content)).toEqual({
  type: 'drawing',
  version: 1,
  metadata: {},
  elements: [],
  viewport: {
    center: { x: 0, y: 0 },
    zoom: 1
  }
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm test test/components/BDrawing/use-model-sync.test.ts test/hooks/use-file-session.test.ts
```

Expected: FAIL because `DrawingData` has no `metadata` and snapshots do not emit it.

- [ ] **Step 3: Implement metadata types and snapshots**

In `src/components/BDrawing/types.ts`, add:

```ts
/**
 * 画板元信息。
 */
export interface DrawingMetadata {
  /** 预留扩展字段 */
  [key: string]: unknown;
}
```

Update `DrawingData`:

```ts
export interface DrawingData {
  /** 画板元信息 */
  metadata: DrawingMetadata;
  /** 元素数据 */
  elements: DrawingElement[];
  /** 视口数据 */
  viewport: DrawingViewport;
}
```

In `src/components/BDrawing/utils/boardTransforms.ts`, import `DrawingMetadata`, add:

```ts
/**
 * 创建默认画板元信息。
 * @returns 默认画板元信息
 */
function createDefaultMetadata(): DrawingMetadata {
  return {};
}
```

Update `createDrawingDataSnapshot()` so callers can pass metadata when they have it:

```ts
export function createDrawingDataSnapshot(snapshot: Pick<DrawingBoardSnapshot, 'elements' | 'viewport'> & { metadata?: DrawingMetadata }): DrawingData {
  return {
    metadata: cloneDeep(snapshot.metadata ?? createDefaultMetadata()),
    elements: cloneSupportedElements(snapshot.elements),
    viewport: cloneDeep(snapshot.viewport)
  };
}
```

In `src/hooks/useOpenFile.ts`, update `createEmptyDrawingData()` to include `metadata: {}`.

In `src/components/BDrawing/hooks/useModelSync.ts`, update `createModelUpdateSnapshot()` to preserve the current model metadata:

```ts
function createModelUpdateSnapshot(board: UseDrawingBoardReturn, drawingData: DrawingData | undefined): DrawingData {
  return createDrawingDataSnapshot({
    ...board.state.value,
    metadata: drawingData?.metadata
  });
}
```

Then assign the result inside `useModelSync` as `options.drawingData.value = createModelUpdateSnapshot(options.board, options.drawingData.value)`.

- [ ] **Step 4: Run metadata tests**

Run:

```bash
pnpm test test/components/BDrawing/use-model-sync.test.ts test/hooks/use-file-session.test.ts
```

Expected: PASS for metadata-related assertions.

### Task 2: BDrawing Named Models And Select Sync

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `src/components/BDrawing/hooks/useModelSync.ts`
- Test: `test/components/BDrawing/drawing-canvas.component.test.ts`
- Test: `test/components/BDrawing/node-click-selection.test.ts`

- [ ] **Step 1: Write failing component API tests**

In `src/components/BDrawing/types.ts`, add the target type in the same task as implementation later:

```ts
export type DrawingSelectTarget = DrawingElement | DrawingMetadata | null;
```

In `test/components/BDrawing/drawing-canvas.component.test.ts`, update mounts to pass `value` instead of `modelValue`, and update emitted assertions to `update:value`.

Add:

```ts
it('emits metadata select target for empty selection without changing drawing data', async (): Promise<void> => {
  const wrapper = mount(BDrawing, {
    props: {
      value: createEmptyDrawingData()
    },
    attachTo: document.body
  });

  await flushDrawingUpdates();

  expect(wrapper.emitted('update:select')?.at(-1)?.[0]).toEqual({});
  expect(toRaw(wrapper.emitted('update:select')?.at(-1)?.[0])).toBe(data.metadata);
  expect(wrapper.emitted('update:value')).toBeUndefined();
  wrapper.unmount();
});
```

In `test/components/BDrawing/node-click-selection.test.ts`, update mounts to `value`, then add an assertion to the single-click test:

```ts
const selectedPayload = wrapper.emitted('update:select')?.at(-1)?.[0] as DrawingSelectTarget;
expect(selectedPayload && 'id' in selectedPayload ? selectedPayload.id : '').toBe('node-1');
expect(toRaw(selectedPayload)).toBe(((wrapper.emitted('update:value') as Array<[DrawingData]> | undefined)?.at(-1)?.[0] ?? data).elements[0]);
```

For the multi-select mount that uses initial `selection`, assert:

```ts
expect(wrapper.emitted('update:select')?.at(-1)?.[0]).toBeNull();
```

- [ ] **Step 2: Run failing component tests**

Run:

```bash
pnpm test test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/node-click-selection.test.ts
```

Expected: FAIL because `BDrawing` still exposes `modelValue` and `selection-change`.

- [ ] **Step 3: Implement named models and reference select sync**

In `src/components/BDrawing/index.vue`, replace props/emits with:

```ts
const drawingData = defineModel<DrawingData>('value', {
  default: (): DrawingData => ({
    metadata: {},
    elements: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  })
});
const selectedTarget = defineModel<DrawingSelectTarget>('select', { default: null });
```

Update `useDrawingBoard(drawingData.value)` and `useModelSync()` to receive `drawingData`; the hook writes `drawingData.value` directly when the board changes.

Add a helper:

```ts
function createSelectedTargetFromSelection(selection: string[]): DrawingSelectTarget {
  if (selection.length === 0) {
    return drawingData.value.metadata;
  }

  if (selection.length > 1) {
    return null;
  }

  const selectedId = selection[0];
  const element = drawingData.value.elements.find((item: DrawingElement): boolean => item.id === selectedId);

  return element ?? drawingData.value.metadata;
}
```

Watch selection:

```ts
watch(() => board.state.value.selection, (selection: string[]): void => {
  selectedTarget.value = createSelectedTargetFromSelection(selection);
}, { immediate: true });
```

Remove the `selection-change` emit.

- [ ] **Step 4: Run component tests**

Run:

```bash
pnpm test test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/node-click-selection.test.ts
```

Expected: PASS.

### Task 3: Drawing Page And Settings Panel Select Target

**Files:**
- Modify: `src/views/drawing/index.vue`
- Modify: `src/views/drawing/components/SettingsPanel.vue`
- Modify: `src/views/drawing/components/DesignSetter.vue`
- Modify: `src/views/drawing/components/PageSetter.vue`
- Test: `test/views/drawing/settings-panel.test.ts`

- [ ] **Step 1: Write failing settings-panel tests**

In `test/views/drawing/settings-panel.test.ts`, update `createDrawingData()` to include `metadata: {}` and replace `selectedElements` props with `select`.

Update the no-selection/page test:

```ts
props: {
  drawingData: createDrawingData(),
  select: {}
}
```

Update the single-element test:

```ts
props: {
  drawingData: data,
  select: data.elements[0]
}
```

Replace the multi-select test with:

```ts
it('shows read-only state when select target is null', (): void => {
  const wrapper = mount(SettingsPanel, {
    global: {
      stubs: {
        BIcon: true
      }
    },
    props: {
      drawingData: createDrawingData(),
      select: null
    }
  });

  expect(wrapper.text()).toContain('已选择多个元素');
  expect(wrapper.text()).not.toContain('属性');
});
```

Update `DesignSetter` tests to use `element` and assert in-place mutation:

```ts
props: {
  element
}
```

and:

```ts
expect(wrapper.emitted('update:element')).toBeUndefined();
expect(element.text).toBe('更新标题');
```

- [ ] **Step 2: Run failing settings tests**

Run:

```bash
pnpm test test/views/drawing/settings-panel.test.ts
```

Expected: FAIL because settings components still use `selectedElements`.

- [ ] **Step 3: Implement page select model**

In `src/views/drawing/index.vue`:

```vue
<SidebarPanel :elements="session.data.value.elements" />

<section class="drawing-page__canvas" @dragover="handleCanvasDragOver" @drop="handleCanvasDrop">
  <BDrawing ref="drawingRef" v-model:value="session.data.value" v-model:select="selectedTarget" />
</section>

<SettingsPanel v-model:select="selectedTarget" :drawing-data="session.data.value" />
```

Use:

```ts
const selectedTarget = ref<DrawingSelectTarget>(session.data.value.metadata);
```

Remove `selectedElementIds`, `selectedElements`, and `handleDrawingSelectionChange()` from the page. Do not derive layer multi-selection highlighting from `select`, because `select` is an editable target and is intentionally `null` for multi-select.

- [ ] **Step 4: Implement SettingsPanel and setters**

In `SettingsPanel.vue`, use:

```ts
const select = defineModel<DrawingSelectTarget>('select', { default: null });

function isElementTarget(target: DrawingSelectTarget): target is DrawingElement {
  return typeof target === 'object' && target !== null && 'id' in target && typeof target.id === 'string';
}
```

Template:

```vue
<PageSetter v-if="select && !isElementTarget(select)" :drawing-data="drawingData" :metadata="select" @update:metadata="select = $event" />
<div v-else-if="select === null" class="setter-panel__empty">已选择多个元素</div>
<template v-else>
  <ATabs>
    <ATabPane key="design" tab="设计">
      <DesignSetter :element="select" />
    </ATabPane>
    <ATabPane key="style" tab="属性">1</ATabPane>
  </ATabs>
</template>
```

In `DesignSetter.vue`, rename `selectedElements` to a single `element` prop:

```ts
const props = defineProps<{ element: DrawingElement }>();
const selectedElement = computed<DrawingElement>(() => props.element);
```

Change updates to:

```ts
function updateSelectedElement(key: string, value: string | number): void {
  writeValueByPath(props.element, key, value);
}
```

In `PageSetter.vue`, add:

```ts
interface Props {
  /** 当前画图数据 */
  drawingData: DrawingData;
  /** 当前画板元信息 */
  metadata: DrawingMetadata;
}
```

First version does not need editable metadata fields.

- [ ] **Step 5: Run settings tests**

Run:

```bash
pnpm test test/views/drawing/settings-panel.test.ts
```

Expected: PASS.

### Task 4: Full Regression And Changelog

**Files:**
- Modify: `changelog/2026-06-26.md`
- Test: BDrawing and drawing settings tests

- [ ] **Step 1: Add changelog entry**

In `changelog/2026-06-26.md`, under `## Changed` or create it if absent, add:

```md
- 重构 BDrawing 对外模型，改用 `v-model:value` 绑定画板数据，并通过 `v-model:select` 暴露当前可编辑目标。
```

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
pnpm test test/components/BDrawing/use-model-sync.test.ts test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/node-click-selection.test.ts test/views/drawing/settings-panel.test.ts test/hooks/use-file-session.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run lint checks**

Run:

```bash
pnpm lint
pnpm lint:style
```

Expected: PASS.
