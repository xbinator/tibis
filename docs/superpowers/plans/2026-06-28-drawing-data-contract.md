# DrawingData Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drawing-level `name`, `description`, `inputSchema`, and `outputSchema` contract fields to `DrawingData`, with defaults, legacy normalization, and a PageSetter editing surface.

**Architecture:** Keep the new contract fields on external `DrawingData`, not inside `DrawingBoardState`, so canvas history and selection behavior stay unchanged. Centralize schema/default helpers in a small drawing data utility, then have creation, model sync, persistence, and PageSetter share the same normalized shape.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Vitest, Vue Test Utils, Ant Design Vue stubs, lodash-es, existing BDrawing utilities.

**Execution Constraint:** Do not create a git commit or stage files. The user will review and commit all changes later.

---

## File Map

- Modify `src/components/BDrawing/types.ts`: add `DrawingSchemaPropertyType`, `DrawingSchemaProperty`, `DrawingSchemaObject`, and the four new `DrawingData` contract fields.
- Create `src/components/BDrawing/utils/drawingData.ts`: own default schema creation, schema normalization, default empty `DrawingData`, and contract-field normalization helpers.
- Modify `src/components/BDrawing/utils/boardTransforms.ts`: preserve and normalize contract fields in `createDrawingDataSnapshot()`.
- Modify `src/components/BDrawing/hooks/useModelSync.ts`: keep content comparison scoped to `elements` and `viewport`, while preserving contract fields on emitted snapshots.
- Modify `src/components/BDrawing/index.vue`: use `createDefaultDrawingData()` for `defineModel` defaults.
- Modify `src/views/drawing/index.vue`: use `createDefaultDrawingData()` for file-session default data.
- Modify `src/hooks/useOpenFile.ts`: use `createDefaultDrawingData()` for newly created drawing files.
- Modify `src/views/drawing/components/PageSetter.vue`: edit `name`, `description`, `inputSchema`, and `outputSchema`.
- Modify `test/components/BDrawing/use-model-sync.test.ts`: verify contract preservation, defaulting, and no internal state leakage.
- Modify `test/components/BDrawing/board-transforms.test.ts`: verify legacy data normalization in lightweight snapshots.
- Modify `test/views/drawing/page-setter.test.ts`: verify PageSetter edits and schema validation.
- Modify `test/views/drawing/index.test.ts`, `test/hooks/use-file-session.test.ts`, and drawing fixtures under `test/components/BDrawing`: update `DrawingData` fixtures to include or import the default contract shape.
- Create or modify `changelog/2026-06-28.md`: record the DrawingData contract addition.

## Task 1: Contract Types And Default Helpers

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Create: `src/components/BDrawing/utils/drawingData.ts`
- Test: `test/components/BDrawing/board-transforms.test.ts`
- Test: `test/components/BDrawing/use-model-sync.test.ts`

- [ ] **Step 1: Write failing type/default tests**

In `test/components/BDrawing/board-transforms.test.ts`, add `createDrawingDataSnapshot` to the existing import from `@/components/BDrawing/utils/boardTransforms`.

Add this test:

```ts
it('normalizes drawing data contract fields in lightweight snapshots', (): void => {
  const legacySnapshot = {
    metadata: {},
    elements: [createShapeElement('node-1')],
    viewport: {
      center: { x: 10, y: 20 },
      zoom: 1
    }
  };

  const snapshot = createDrawingDataSnapshot(legacySnapshot);

  expect(snapshot.name).toBe('');
  expect(snapshot.description).toBe('');
  expect(snapshot.inputSchema).toEqual({
    type: 'object',
    properties: {},
    required: [],
  });
  expect(snapshot.outputSchema).toEqual({
    type: 'object',
    properties: {},
    required: [],
  });
  expect(snapshot.elements).toHaveLength(1);
  expect(snapshot.viewport).toEqual({ center: { x: 10, y: 20 }, zoom: 1 });
});
```

In `test/components/BDrawing/use-model-sync.test.ts`, update `hasInternalStateFields()` to keep checking only internal fields:

```ts
function hasInternalStateFields(value: DrawingData): boolean {
  return 'selection' in value || 'draft' in value || 'history' in value;
}
```

Add this test:

```ts
it('preserves drawing data contract fields when emitting board content changes', async (): Promise<void> => {
  const scope = effectScope();
  const modelValue = ref<DrawingData | undefined>({
    ...createDrawingData('node-1'),
    name: 'profile_card',
    description: '生成个人资料卡片',
    inputSchema: {
      type: 'object',
      properties: {
        userName: {
          type: 'string',
          description: '用户姓名'
        }
      },
      required: ['userName'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        drawingId: {
          type: 'string',
          description: '画板 ID'
        }
      },
      required: ['drawingId'],
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

  expect(modelValue.value?.name).toBe('profile_card');
  expect(modelValue.value?.description).toBe('生成个人资料卡片');
  expect(modelValue.value?.inputSchema.required).toEqual(['userName']);
  expect(modelValue.value?.outputSchema.required).toEqual(['drawingId']);
  expect(hasInternalStateFields(modelValue.value as DrawingData)).toBe(false);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
pnpm exec vitest run test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/use-model-sync.test.ts
```

Expected: FAIL because `DrawingData` does not yet define `name`, `description`, `inputSchema`, or `outputSchema`.

- [ ] **Step 3: Add contract types**

In `src/components/BDrawing/types.ts`, add these types near `DrawingMetadata`:

```ts
/**
 * DrawingData 支持的 schema 字段类型。
 */
export type DrawingSchemaPropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * DrawingData 入参与出参 schema 属性。
 */
export interface DrawingSchemaProperty {
  /** 字段类型 */
  type: DrawingSchemaPropertyType;
  /** 字段说明 */
  description?: string;
  /** 对象字段定义 */
  properties?: Record<string, DrawingSchemaProperty>;
  /** 数组元素结构 */
  items?: DrawingSchemaProperty;
}

/**
 * DrawingData 入参与出参对象 schema。
 */
export interface DrawingSchemaObject {
  /** 顶层 schema 固定为对象 */
  type: 'object';
  /** schema 说明 */
  description?: string;
  /** 对象字段定义 */
  properties: Record<string, DrawingSchemaProperty>;
  /** 必填字段 */
  required?: string[];
  /** 是否允许未声明字段 */
}
```

Update `DrawingData`:

```ts
export interface DrawingData {
  /** 画板能力标识符 */
  name: string;
  /** 画板能力描述 */
  description: string;
  /** 画板能力入参 schema */
  inputSchema: DrawingSchemaObject;
  /** 画板能力出参 schema */
  outputSchema: DrawingSchemaObject;
  /** 画板元信息 */
  metadata: DrawingMetadata;
  /** 元素数据 */
  elements: DrawingElement[];
  /** 视口数据 */
  viewport: DrawingViewport;
}
```

- [ ] **Step 4: Create default and normalization helpers**

Create `src/components/BDrawing/utils/drawingData.ts`:

```ts
/**
 * @file drawingData.ts
 * @description BDrawing 外部 DrawingData 默认值与契约字段归一化工具。
 */
import type { DrawingData, DrawingMetadata, DrawingSchemaObject, DrawingViewport } from '../types';
import { cloneDeep } from 'lodash-es';

/**
 * 可归一化为 DrawingData 契约字段的数据。
 */
export interface DrawingDataContractCandidate {
  /** 画板能力标识符 */
  name?: unknown;
  /** 画板能力描述 */
  description?: unknown;
  /** 入参 schema */
  inputSchema?: unknown;
  /** 出参 schema */
  outputSchema?: unknown;
  /** 画板元信息 */
  metadata?: DrawingMetadata;
}

/**
 * 创建默认对象 schema。
 * @returns 默认对象 schema
 */
export function createDefaultDrawingSchemaObject(): DrawingSchemaObject {
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

/**
 * 判断值是否为可保存的 DrawingData 对象 schema。
 * @param value - 待检查值
 * @returns 是否为对象 schema
 */
function isDrawingSchemaObject(value: unknown): value is DrawingSchemaObject {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'object';
}

/**
 * 归一化 DrawingData 对象 schema。
 * @param value - 原始 schema
 * @returns 可保存对象 schema
 */
export function normalizeDrawingSchemaObject(value: unknown): DrawingSchemaObject {
  if (!isDrawingSchemaObject(value)) {
    return createDefaultDrawingSchemaObject();
  }

  return {
    ...cloneDeep(value),
    type: 'object',
    properties: typeof value.properties === 'object' && value.properties !== null ? cloneDeep(value.properties) : {},
    required: Array.isArray(value.required) ? [...value.required].filter((item: unknown): item is string => typeof item === 'string') : [],
  };
}

/**
 * 归一化 DrawingData 契约字段。
 * @param candidate - 原始候选值
 * @returns 契约字段
 */
export function normalizeDrawingDataContract(candidate: DrawingDataContractCandidate): Pick<DrawingData, 'name' | 'description' | 'inputSchema' | 'outputSchema' | 'metadata'> {
  return {
    name: typeof candidate.name === 'string' ? candidate.name : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    inputSchema: normalizeDrawingSchemaObject(candidate.inputSchema),
    outputSchema: normalizeDrawingSchemaObject(candidate.outputSchema),
    metadata: cloneDeep(candidate.metadata ?? {})
  };
}

/**
 * 创建默认视口。
 * @returns 默认视口
 */
export function createDefaultDrawingViewport(): DrawingViewport {
  return {
    center: { x: 0, y: 0 },
    zoom: 1
  };
}

/**
 * 创建空画板数据。
 * @returns 空画板数据
 */
export function createDefaultDrawingData(): DrawingData {
  return {
    ...normalizeDrawingDataContract({}),
    elements: [],
    viewport: createDefaultDrawingViewport()
  };
}
```

- [ ] **Step 5: Update lightweight snapshots**

In `src/components/BDrawing/utils/boardTransforms.ts`, import the helper:

```ts
import { createDefaultDrawingViewport, normalizeDrawingDataContract, type DrawingDataContractCandidate } from './drawingData';
```

Remove the local `createDefaultViewport()` and `createDefaultMetadata()` helpers. Update initial board state:

```ts
viewport: cloneDeep(snapshot?.viewport ?? createDefaultDrawingViewport()),
```

Update `createDrawingDataSnapshot()`:

```ts
export function createDrawingDataSnapshot(
  snapshot: Pick<DrawingBoardSnapshot, 'elements' | 'viewport'> & DrawingDataContractCandidate
): DrawingData {
  return {
    ...normalizeDrawingDataContract(snapshot),
    elements: cloneSupportedElements(snapshot.elements),
    viewport: cloneDeep(snapshot.viewport)
  };
}
```

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```bash
pnpm exec vitest run test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/use-model-sync.test.ts
```

Expected: PASS for the new contract tests and existing board/model-sync behavior.

## Task 2: Default Data And Model Sync Integration

**Files:**
- Modify: `src/components/BDrawing/hooks/useModelSync.ts`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `src/views/drawing/index.vue`
- Modify: `src/hooks/useOpenFile.ts`
- Modify: `test/views/drawing/index.test.ts`
- Modify: `test/hooks/use-file-session.test.ts`
- Modify: drawing fixtures in `test/components/BDrawing/*.test.ts` and `test/views/drawing/*.test.ts`

- [ ] **Step 1: Update fixtures with a shared helper**

In tests that define `createEmptyDrawingData()` or `createDrawingData()`, import the default helper:

```ts
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';
```

For empty data fixtures, replace the object literal:

```ts
function createEmptyDrawingData(): DrawingData {
  return createDefaultDrawingData();
}
```

For fixtures with elements, spread the default data:

```ts
function createDrawingData(elements: DrawingElement | DrawingElement[]): DrawingData {
  return {
    ...createDefaultDrawingData(),
    elements: Array.isArray(elements) ? elements : [elements],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}
```

Apply this pattern to the existing local fixtures in:

- `test/components/BDrawing/drawing-canvas.component.test.ts`
- `test/components/BDrawing/node-click-selection.test.ts`
- `test/components/BDrawing/drawing-context-menu.component.test.ts`
- `test/components/BDrawing/drawing-context-menu-actions.test.ts`
- `test/views/drawing/index.test.ts`
- `test/views/drawing/panel-settings.test.ts`
- `test/views/drawing/page-setter.test.ts`

- [ ] **Step 2: Add default creation assertions**

In `test/views/drawing/index.test.ts`, add an assertion to the existing file-session default test or create a new test:

```ts
it('starts new drawing sessions with drawing contract defaults', (): void => {
  shallowMount(DrawingPage, {
    global: {
      stubs: {
        BDrawing: true,
        Icon: true
      }
    }
  });

  expect(drawingDataMock.value).toMatchObject({
    name: '',
    description: '',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {},
      required: [],
    }
  });
});
```

In `test/hooks/use-file-session.test.ts`, update `createDrawingData()`:

```ts
function createDrawingData(): DrawingData {
  return createDefaultDrawingData();
}
```

Update serialization expectations to include:

```ts
data: {
  name: '',
  description: '',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  metadata: {},
  elements: [],
  viewport: {
    center: { x: 0, y: 0 },
    zoom: 1
  }
}
```

- [ ] **Step 3: Run the integration tests and verify they fail**

Run:

```bash
pnpm exec vitest run test/views/drawing/index.test.ts test/hooks/use-file-session.test.ts test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/node-click-selection.test.ts
```

Expected: FAIL until production defaults and model sync preserve the contract fields.

- [ ] **Step 4: Preserve contract fields in model sync**

In `src/components/BDrawing/hooks/useModelSync.ts`, update `createModelUpdateSnapshot()`:

```ts
function createModelUpdateSnapshot(board: UseDrawingBoardReturn, drawingData: DrawingData | undefined): DrawingData {
  return createDrawingDataSnapshot({
    ...board.state.value,
    name: drawingData?.name,
    description: drawingData?.description,
    inputSchema: drawingData?.inputSchema,
    outputSchema: drawingData?.outputSchema,
    metadata: drawingData?.metadata
  });
}
```

Do not add these fields to `createDrawingModelSnapshot()`. It should continue comparing only `elements` and `viewport`:

```ts
function createDrawingModelSnapshot(snapshot: Pick<DrawingBoardSnapshot, 'elements' | 'viewport'>): Pick<DrawingBoardSnapshot, 'elements' | 'viewport'> {
  return {
    elements: snapshot.elements,
    viewport: snapshot.viewport
  };
}
```

- [ ] **Step 5: Use default data in creation points**

In `src/components/BDrawing/index.vue`, import:

```ts
import { createDefaultDrawingData } from './utils/drawingData';
```

Update the model default:

```ts
const drawingData = defineModel<DrawingData>('value', {
  default: createDefaultDrawingData
});
```

In `src/views/drawing/index.vue`, import:

```ts
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';
```

Update `useFileSession`:

```ts
defaultData: createDefaultDrawingData(),
```

In `src/hooks/useOpenFile.ts`, import:

```ts
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';
```

Replace the local `createEmptyDrawingData()` body with:

```ts
function createEmptyDrawingData(): DrawingData {
  return createDefaultDrawingData();
}
```

- [ ] **Step 6: Run integration tests and verify they pass**

Run:

```bash
pnpm exec vitest run test/views/drawing/index.test.ts test/hooks/use-file-session.test.ts test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/node-click-selection.test.ts
```

Expected: PASS.

## Task 3: PageSetter Editing Surface

**Files:**
- Modify: `src/views/drawing/components/PageSetter.vue`
- Modify: `test/views/drawing/page-setter.test.ts`

- [ ] **Step 1: Add PageSetter test stubs**

In `test/views/drawing/page-setter.test.ts`, keep stubs for `AInput`, `ATextarea`, `BButton`, `BIcon`, `BModal`, `BMonaco`, `BDrawer`, `BSectionBlock`, and `BSectionItem` so PageSetter can be tested with real child components while avoiding browser-only editor behavior.

- [ ] **Step 2: Write PageSetter contract editing tests**

Cover these behaviors:

- `PageSetter` uses `v-model:value` to edit `name` and `description`.
- `PageSetter` shows `inputSchema` and `outputSchema` as preview blocks, without exposing raw `inputSchema` / `outputSchema` labels in the panel.
- The schema edit button stays in the `BSectionBlock` `extra` slot, is `size="mini"`, and opens `SchemaEditor`.
- Valid schema JSON from the modal updates the correct field.
- Invalid schema JSON keeps the previous schema and displays validation feedback.
- The “查看填写说明” trigger is a bare `BIcon` rendered through the `BSectionBlock` `help` slot beside the section title, not a `BButton`.
- Clicking the input/output help icons opens `SchemaHelp` with the corresponding title, a parameter table, and a weather-query example.

- [ ] **Step 3: Run PageSetter tests and verify they fail**

Run:

```bash
pnpm exec vitest run test/views/drawing/page-setter.test.ts
```

Expected: FAIL because `PageSetter` does not yet render contract fields or parse schema JSON.

- [ ] **Step 4: Implement PageSetter contract controls**

Current implementation shape:

- `src/views/drawing/components/PanelSettings.vue` exposes `v-model:value` for the full `DrawingData` and forwards that model into `PageSetter`.
- `src/views/drawing/index.vue` binds `PanelSettings` with `v-model:value="session.data.value"`.
- `src/views/drawing/components/PageSetter.vue` also exposes `v-model:value`, renders `name` and `description`, and shows `inputSchema` / `outputSchema` as read-only previews.
- `src/components/BSection/Block.vue` exposes a `help` slot beside the title while keeping `extra` as the right-side action area.
- `src/views/drawing/components/PageSetter/SchemaEditor.vue` owns the `BModal` + `BMonaco` JSON editing flow and emits a normalized `DrawingSchemaObject` on save.
- `src/views/drawing/components/PageSetter/SchemaHelp.vue` owns the `BDrawer` guidance content, including the parameter table and the “查天气” JSON Schema example.
- The “查看填写说明” entry is a `BIcon` in the `BSectionBlock` `help` slot beside the “入参 / 出参” title; it is not a button. The schema edit command remains a mini button in the section `extra` slot.

- [ ] **Step 5: Run PageSetter tests and verify they pass**

Run:

```bash
pnpm exec vitest run test/views/drawing/page-setter.test.ts
```

Expected: PASS.

## Task 4: Changelog And Full Verification

**Files:**
- Create or modify: `changelog/2026-06-28.md`
- Verify: all files changed by Tasks 1-3

- [ ] **Step 1: Add changelog entry**

If `changelog/2026-06-28.md` does not exist, create:

```markdown
# 2026-06-28

## Added
- 为 DrawingData 增加画板级能力契约字段，并提供 PageSetter 基础配置入口。

## Changed

## Removed

## Features
```

If it already exists, add this line under `## Added`:

```markdown
- 为 DrawingData 增加画板级能力契约字段，并提供 PageSetter 基础配置入口。
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm exec vitest run test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/use-model-sync.test.ts test/views/drawing/page-setter.test.ts test/views/drawing/index.test.ts test/hooks/use-file-session.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run lint for touched source and test files**

Run:

```bash
pnpm exec eslint src/components/BSection/Block.vue src/components/BDrawing/types.ts src/components/BDrawing/utils/drawingData.ts src/components/BDrawing/utils/boardTransforms.ts src/components/BDrawing/hooks/useModelSync.ts src/components/BDrawing/index.vue src/views/drawing/index.vue src/views/drawing/components/PanelSettings.vue src/views/drawing/components/PageSetter.vue src/views/drawing/components/PageSetter/SchemaEditor.vue src/views/drawing/components/PageSetter/SchemaHelp.vue src/hooks/useOpenFile.ts test/components/BSection/block.test.ts test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/use-model-sync.test.ts test/views/drawing/page-setter.test.ts test/views/drawing/panel-settings.test.ts test/views/drawing/index.test.ts test/hooks/use-file-session.test.ts --ext .vue,.ts
```

Expected: PASS with no ESLint errors.

- [ ] **Step 5: Run style lint for touched Vue file**

Run:

```bash
pnpm exec stylelint src/components/BSection/Block.vue src/views/drawing/components/PageSetter.vue src/views/drawing/components/PageSetter/SchemaEditor.vue src/views/drawing/components/PageSetter/SchemaHelp.vue
```

Expected: PASS with no Stylelint errors.

- [ ] **Step 6: Inspect git status without staging**

Run:

```bash
git status --short
```

Expected: modified source/test/changelog files are visible, no files are staged by this plan, and no commit has been created.

## Self-Review Notes

- Spec coverage: contract fields, defaults, legacy normalization, PageSetter editing, model-sync boundary, error handling, tests, and non-goals are covered by Tasks 1-4.
- Placeholder scan: the plan uses concrete file paths, concrete test code, concrete implementation snippets, and exact commands.
- Type consistency: `DrawingSchemaObject`, `createDefaultDrawingData()`, `normalizeDrawingSchemaObject()`, and `createDrawingDataSnapshot()` names are used consistently across tasks.
