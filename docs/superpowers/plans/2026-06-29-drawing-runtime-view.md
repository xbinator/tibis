# BDrawingRuntimeView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only BDrawing runtime view that can render a DrawingData template with a supplied DrawingRenderContext for chat/session display.

**Architecture:** Create `src/components/BDrawing/RuntimeView.vue` as a small wrapper around the existing `InfiniteViewport` and `DrawingCanvas`. It provides the supplied render context through `provideRenderContext`, reuses existing element renderers, and deliberately omits editor-only layers such as Toolbar, MoveableLayer, SelectoLayer, setters, selection state, and context menu handling.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Vue Test Utils, Vitest, existing BDrawing renderers and hooks.

---

## File Structure

- Create `src/components/BDrawing/RuntimeView.vue`
  - Owns the read-only runtime container.
  - Accepts `drawingData: DrawingData` and `renderContext: DrawingRenderContext`.
  - Provides render context with `provideRenderContext`.
  - Renders existing `DrawingCanvas` with empty selection and no-op event handlers.
- Create `test/components/BDrawing/drawing-runtime-view.component.test.ts`
  - Verifies template rendering with runtime context.
  - Verifies no editor-only UI is present.
  - Verifies source `DrawingData` is not mutated.
  - Verifies prop updates refresh rendered text.
- Modify `changelog/2026-06-29.md`
  - Add one Changed entry for the read-only runtime view.

## Boundaries

- Do not add AI routing.
- Do not add script execution.
- Do not add HTTP permissions.
- Do not add element event execution.
- Do not change `BDrawing/index.vue` editing behavior.
- Do not add compatibility for old dynamic binding storage.

---

### Task 1: Runtime View Regression Test

**Files:**
- Create: `test/components/BDrawing/drawing-runtime-view.component.test.ts`
- Depends on component created in Task 2: `src/components/BDrawing/RuntimeView.vue`

- [ ] **Step 1: Write the failing test**

Create `test/components/BDrawing/drawing-runtime-view.component.test.ts`:

```ts
/**
 * @file drawing-runtime-view.component.test.ts
 * @description 验证 BDrawing 运行态只读视图按会话上下文渲染画布。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { cloneDeep } from 'lodash-es';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawingRuntimeView from '@/components/BDrawing/RuntimeView.vue';
import type { DrawingData, DrawingRenderContext } from '@/components/BDrawing/types';
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';

/**
 * ResizeObserver 测试替身。
 */
class ResizeObserverMock {
  /** 监听目标元素尺寸。 */
  public observe = vi.fn();

  /** 停止监听目标元素。 */
  public unobserve = vi.fn();

  /** 断开全部尺寸监听。 */
  public disconnect = vi.fn();
}

/**
 * 创建运行态测试画布数据。
 * @returns 测试画布数据
 */
function createRuntimeDrawingData(): DrawingData {
  return {
    ...createDefaultDrawingData(),
    elements: [
      {
        id: 'text-1',
        name: 'text',
        label: '文本',
        icon: 'lucide:type',
        title: '天气文本',
        position: { x: 24, y: 36 },
        size: { width: 180, height: 48 },
        rotation: 0,
        style: {},
        metadata: {
          content: '{{ input.city }} 当前 {{ state.weather.temperature }}°C'
        }
      },
      {
        id: 'rect-1',
        name: 'rect',
        label: '矩形',
        icon: 'lucide:square',
        title: '背景卡片',
        position: { x: 12, y: 18 },
        size: { width: 220, height: 96 },
        rotation: 0,
        style: {},
        metadata: {}
      }
    ],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建运行态渲染上下文。
 * @param city - 城市名称
 * @param temperature - 温度
 * @returns 渲染上下文
 */
function createRenderContext(city: string, temperature: number): DrawingRenderContext {
  return {
    input: {
      city
    },
    state: {
      weather: {
        temperature
      }
    }
  };
}

/**
 * 挂载运行态画布视图。
 * @param drawingData - 画布数据
 * @param renderContext - 渲染上下文
 * @returns 组件包装器
 */
function mountRuntimeView(drawingData: DrawingData, renderContext: DrawingRenderContext): VueWrapper {
  return mount(BDrawingRuntimeView, {
    props: {
      drawingData,
      renderContext
    },
    attachTo: document.body
  });
}

/**
 * 通过节点 ID 查找画布节点。
 * @param wrapper - 组件包装器
 * @param id - 节点 ID
 * @returns 节点包装器
 */
function findNodeById(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  return wrapper.find<Element>(`[data-drawing-element-id="${id}"]`);
}

describe('BDrawingRuntimeView', (): void => {
  beforeEach((): void => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('renders drawing nodes with template content from the runtime context', (): void => {
    const wrapper = mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

    expect(wrapper.find('[data-testid="drawing-runtime-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-canvas"]').exists()).toBe(true);
    expect(findNodeById(wrapper, 'text-1').text()).toBe('上海 当前 28°C');
    expect(findNodeById(wrapper, 'rect-1').find('.drawing-rect-element-view').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not render editor-only interaction layers', (): void => {
    const wrapper = mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

    expect(wrapper.find('.b-drawing').exists()).toBe(false);
    expect(wrapper.find('.toolbar-stub').exists()).toBe(false);
    expect(wrapper.find('.moveable-layer-stub').exists()).toBe(false);
    expect(wrapper.find('.selecto-layer-stub').exists()).toBe(false);
    expect(wrapper.find('.drawing-context-menu').exists()).toBe(false);
    expect(wrapper.find('.b-drawing-node.is-selected').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not mutate the source drawing data while rendering', async (): Promise<void> => {
    const drawingData = createRuntimeDrawingData();
    const originalDrawingData = cloneDeep(drawingData);
    const wrapper = mountRuntimeView(drawingData, createRenderContext('上海', 28));

    await wrapper.setProps({
      renderContext: createRenderContext('杭州', 31)
    });
    await nextTick();

    expect(drawingData).toEqual(originalDrawingData);
    wrapper.unmount();
  });

  it('updates rendered template content when the runtime context changes', async (): Promise<void> => {
    const wrapper = mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

    await wrapper.setProps({
      renderContext: createRenderContext('杭州', 31)
    });
    await nextTick();

    expect(findNodeById(wrapper, 'text-1').text()).toBe('杭州 当前 31°C');
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-view.component.test.ts
```

Expected result:

```text
FAIL test/components/BDrawing/drawing-runtime-view.component.test.ts
Cannot find module '@/components/BDrawing/RuntimeView.vue'
```

---

### Task 2: Runtime View Component

**Files:**
- Create: `src/components/BDrawing/RuntimeView.vue`
- Test: `test/components/BDrawing/drawing-runtime-view.component.test.ts`

- [ ] **Step 1: Implement the minimal component**

Create `src/components/BDrawing/RuntimeView.vue`:

```vue
<!--
  @file RuntimeView.vue
  @description BDrawing 运行态只读画布视图。
-->
<template>
  <section ref="rootRef" class="b-drawing-runtime-view" data-testid="drawing-runtime-view">
    <InfiniteViewport>
      <DrawingCanvas
        :elements="drawingData.elements"
        :selection="EMPTY_SELECTION"
        :geometry-preview-changes="EMPTY_GEOMETRY_PREVIEW_CHANGES"
        :viewport="drawingData.viewport"
        :viewport-size="viewportSize"
        :viewport-ready="isViewportReady"
        active-tool="runtime"
        @select="ignoreElementEvent"
        @element-pointerup="ignoreElementEvent"
        @canvas-pointerdown="ignoreCanvasPointerEvent"
        @canvas-pointermove="ignoreCanvasPointerEvent"
        @canvas-pointerup="ignoreCanvasPointerEvent"
        @canvas-wheel="ignoreCanvasWheel"
        @context-menu="ignoreContextMenu"
      />
    </InfiniteViewport>
  </section>
</template>

<script setup lang="ts">
import type { DrawingData, DrawingGeometryChange, DrawingRenderContext } from './types';
import { computed } from 'vue';
import InfiniteViewport from './components/InfiniteViewport.vue';
import { provideRenderContext } from './hooks/useRenderContext';
import { useViewportSize } from './hooks/useViewportSize';
import DrawingCanvas from './renderers/DrawingCanvas.vue';

/**
 * 运行态画布视图入参。
 */
interface Props {
  /** 画布模板数据 */
  drawingData: DrawingData;
  /** 运行态渲染上下文 */
  renderContext: DrawingRenderContext;
}

const props = defineProps<Props>();

/** 运行态不展示选区。 */
const EMPTY_SELECTION: string[] = [];
/** 运行态不展示编辑预览几何。 */
const EMPTY_GEOMETRY_PREVIEW_CHANGES: DrawingGeometryChange[] = [];
/** 运行态渲染上下文响应式包装。 */
const providedRenderContext = computed<DrawingRenderContext>(() => props.renderContext);

provideRenderContext(providedRenderContext);

const { rootRef, viewportSize, isViewportReady } = useViewportSize();

/**
 * 忽略运行态节点事件。
 */
function ignoreElementEvent(): void {
  return undefined;
}

/**
 * 忽略运行态画布指针事件。
 */
function ignoreCanvasPointerEvent(): void {
  return undefined;
}

/**
 * 忽略运行态滚轮事件。
 */
function ignoreCanvasWheel(): void {
  return undefined;
}

/**
 * 忽略运行态右键菜单事件。
 */
function ignoreContextMenu(): void {
  return undefined;
}
</script>

<style lang="less" scoped>
.b-drawing-runtime-view {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-drawing-runtime-view :deep(.b-drawing-node) {
  cursor: default;
}
</style>
```

- [ ] **Step 2: Run the runtime view test**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-view.component.test.ts
```

Expected result:

```text
Test Files  1 passed (1)
Tests  4 passed (4)
```

- [ ] **Step 3: Run existing BDrawing render tests**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-view.component.test.ts test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/text-element-view.component.test.ts test/components/BDrawing/use-render-context.test.ts
```

Expected result:

```text
Test Files  4 passed (4)
```

---

### Task 3: Changelog, Static Checks, and Commit

**Files:**
- Modify: `changelog/2026-06-29.md`
- Modify: `docs/superpowers/plans/2026-06-29-drawing-runtime-view.md`
- Verify: `src/components/BDrawing/RuntimeView.vue`
- Verify: `test/components/BDrawing/drawing-runtime-view.component.test.ts`

- [ ] **Step 1: Update changelog**

In `changelog/2026-06-29.md`, add this line under `## Changed`:

```markdown
- 新增 BDrawing 运行态只读画布视图，用于按会话渲染上下文展示动态模板内容。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-view.component.test.ts test/components/BDrawing/drawing-canvas.component.test.ts test/components/BDrawing/text-element-view.component.test.ts test/components/BDrawing/use-render-context.test.ts
```

Expected result:

```text
Test Files  4 passed (4)
```

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm exec eslint src/components/BDrawing test/components/BDrawing --ext .vue,.ts
```

Expected result:

```text
exit code 0
```

- [ ] **Step 4: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected result:

```text
exit code 0
```

- [ ] **Step 5: Run style check**

Run:

```bash
pnpm exec stylelint 'src/**/*.{vue,less,css}'
```

Expected result:

```text
exit code 0
```

- [ ] **Step 6: Check staged diff hygiene**

Run:

```bash
git diff --check
```

Expected result:

```text
exit code 0
```

- [ ] **Step 7: Commit the runtime view**

Run:

```bash
git add src/components/BDrawing/RuntimeView.vue test/components/BDrawing/drawing-runtime-view.component.test.ts changelog/2026-06-29.md docs/superpowers/plans/2026-06-29-drawing-runtime-view.md
git commit -m "feat(drawing): 添加画布运行态只读视图"
```

Expected result:

```text
[main <hash>] feat(drawing): 添加画布运行态只读视图
```

---

## Self-Review

- Spec coverage: This plan implements only the approved next step, `BDrawingRuntimeView` read-only runtime rendering. It does not implement AI routing, session state machine, methods, HTTP, permissions, or chat message integration.
- Placeholder scan: The plan has concrete file paths, commands, code blocks, and expected outcomes for each task.
- Type consistency: The component uses existing `DrawingData`, `DrawingRenderContext`, and `DrawingGeometryChange` types from `src/components/BDrawing/types.ts`.
- Testability: The first task fails before implementation because `RuntimeView.vue` does not exist, then the component task makes the four runtime behaviors pass.
