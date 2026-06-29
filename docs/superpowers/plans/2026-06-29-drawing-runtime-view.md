# BDrawingRuntimeView Content Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chat-friendly read-only BDrawing runtime view that uses rendered node bounds as its container bounds and scales the whole drawing to the available chat width.

**Architecture:** Add a pure runtime layout utility that computes rendered element bounds, content size, and shifted node positions from `DrawingData.elements` plus `DrawingRenderContext`. Add `RuntimeView.vue` that provides the render context, measures its own available width, scales a content-bound stage to that width, and renders existing `DrawingNode` components directly without `InfiniteViewport`, `DrawingCanvas`, editor toolbar, selection, moveable, selecto, or context menu.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Vue Test Utils, Vitest, existing BDrawing element renderers and geometry helpers.

---

## File Structure

- Create `src/components/BDrawing/utils/drawingRuntimeLayout.ts`
  - Computes content bounds from rendered node sizes.
  - Applies padding and returns shifted node positions.
  - Includes rotation-aware axis-aligned bounds so rotated nodes remain inside the runtime container.
- Create `src/components/BDrawing/RuntimeView.vue`
  - Measures available width with `useViewportSize`.
  - Provides `DrawingRenderContext`.
  - Renders a scaled content-bound stage with `DrawingNode`.
  - Does not import or render `InfiniteViewport` or `DrawingCanvas`.
- Create `test/components/BDrawing/drawing-runtime-layout.test.ts`
  - Verifies bounds, padding, shifted positions, empty layout, and rotation bounds.
- Create `test/components/BDrawing/drawing-runtime-view.component.test.ts`
  - Verifies runtime rendering, absence of infinite/editor UI, scale-to-width behavior, source immutability, and context updates.
- Modify `changelog/2026-06-29.md`
  - Add one Changed entry for the runtime view.

## Boundaries

- Do not add AI routing.
- Do not add script execution.
- Do not add HTTP permissions.
- Do not add element event execution.
- Do not use `InfiniteViewport`.
- Do not use `DrawingCanvas`.
- Do not use editing viewport center/zoom for runtime display.
- Do not change `BDrawing/index.vue` editing behavior.
- Do not add compatibility for old dynamic binding storage.

---

### Task 1: Runtime Layout Utility

**Files:**
- Create: `test/components/BDrawing/drawing-runtime-layout.test.ts`
- Create: `src/components/BDrawing/utils/drawingRuntimeLayout.ts`

- [ ] **Step 1: Write the failing layout tests**

Create `test/components/BDrawing/drawing-runtime-layout.test.ts`:

```ts
/**
 * @file drawing-runtime-layout.test.ts
 * @description 验证 BDrawing 运行态内容边界布局计算。
 */
import { describe, expect, it } from 'vitest';
import { createDrawingRuntimeLayout, type DrawingRuntimeElementLayout } from '@/components/BDrawing/utils/drawingRuntimeLayout';
import type { DrawingElement, DrawingRenderContext } from '@/components/BDrawing/types';

/**
 * 创建矩形测试元素。
 * @param id - 元素 ID
 * @param position - 元素位置
 * @param size - 元素尺寸
 * @param rotation - 旋转角度
 * @returns 测试元素
 */
function createRectElement(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
  rotation = 0
): DrawingElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: id,
    position,
    size,
    rotation,
    style: {},
    metadata: {}
  };
}

/**
 * 创建文本测试元素。
 * @param content - 文本模板
 * @returns 测试元素
 */
function createTextElement(content: string): DrawingElement {
  return {
    id: 'text-1',
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '天气文本',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 24 },
    rotation: 0,
    style: {},
    metadata: {
      content
    }
  };
}

describe('createDrawingRuntimeLayout', (): void => {
  it('uses rendered node bounds as the content container bounds', (): void => {
    const layout = createDrawingRuntimeLayout(
      [
        createRectElement('rect-1', { x: -20, y: 10 }, { width: 100, height: 40 }),
        createRectElement('rect-2', { x: 90, y: 30 }, { width: 40, height: 50 })
      ],
      undefined,
      16
    );

    expect(layout.bounds).toEqual({
      minX: -20,
      minY: 10,
      maxX: 130,
      maxY: 80,
      width: 150,
      height: 70
    });
    expect(layout.contentSize).toEqual({
      width: 182,
      height: 102
    });
    expect(layout.offset).toEqual({
      x: 36,
      y: 6
    });
    expect(layout.elements.map((item: DrawingRuntimeElementLayout) => ({ id: item.element.id, position: item.position }))).toEqual([
      {
        id: 'rect-1',
        position: { x: 16, y: 16 }
      },
      {
        id: 'rect-2',
        position: { x: 126, y: 36 }
      }
    ]);
  });

  it('keeps rotated nodes inside the content bounds', (): void => {
    const layout = createDrawingRuntimeLayout([createRectElement('rect-1', { x: 0, y: 0 }, { width: 40, height: 20 }, 90)], undefined, 10);

    expect(layout.bounds).toEqual({
      minX: 10,
      minY: -10,
      maxX: 30,
      maxY: 30,
      width: 20,
      height: 40
    });
    expect(layout.contentSize).toEqual({
      width: 40,
      height: 60
    });
    expect(layout.offset).toEqual({
      x: 0,
      y: 20
    });
    expect(layout.elements[0].position).toEqual({
      x: 0,
      y: 20
    });
  });

  it('uses render context when measuring dynamic text nodes', (): void => {
    const compactLayout = createDrawingRuntimeLayout([createTextElement('{{ input.city }}')], {
      input: {
        city: '沪'
      },
      state: {}
    });
    const expandedLayout = createDrawingRuntimeLayout([createTextElement('{{ input.city }}')], {
      input: {
        city: '上海浦东新区'
      },
      state: {}
    } satisfies DrawingRenderContext);

    expect(expandedLayout.bounds.width).toBeGreaterThan(compactLayout.bounds.width);
  });

  it('returns a minimal empty layout when there are no visible nodes', (): void => {
    const layout = createDrawingRuntimeLayout([], undefined, 16);

    expect(layout.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0
    });
    expect(layout.contentSize).toEqual({
      width: 1,
      height: 1
    });
    expect(layout.offset).toEqual({
      x: 0,
      y: 0
    });
    expect(layout.elements).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the layout tests to verify they fail**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-layout.test.ts
```

Expected result:

```text
FAIL test/components/BDrawing/drawing-runtime-layout.test.ts
Failed to resolve import "@/components/BDrawing/utils/drawingRuntimeLayout"
```

- [ ] **Step 3: Implement the runtime layout utility**

Create `src/components/BDrawing/utils/drawingRuntimeLayout.ts`:

```ts
/**
 * @file drawingRuntimeLayout.ts
 * @description BDrawing 运行态内容边界布局工具。
 */
import type { DrawingElement, DrawingPoint, DrawingRenderContext, DrawingShapeElement, DrawingSize } from '../types';
import { getDrawingShapeRenderSize } from './drawingGeometry';

/**
 * 运行态内容边界。
 */
export interface DrawingRuntimeBounds {
  /** 左侧边界 */
  minX: number;
  /** 顶部边界 */
  minY: number;
  /** 右侧边界 */
  maxX: number;
  /** 底部边界 */
  maxY: number;
  /** 边界宽度 */
  width: number;
  /** 边界高度 */
  height: number;
}

/**
 * 运行态元素布局。
 */
export interface DrawingRuntimeElementLayout {
  /** 原始元素 */
  element: DrawingShapeElement;
  /** 平移后的运行态位置 */
  position: DrawingPoint;
  /** 渲染尺寸 */
  renderSize: DrawingSize;
}

/**
 * 运行态画布布局。
 */
export interface DrawingRuntimeLayout {
  /** 原始内容边界 */
  bounds: DrawingRuntimeBounds;
  /** 加上留白后的内容尺寸 */
  contentSize: DrawingSize;
  /** 原始坐标到运行态舞台坐标的平移量 */
  offset: DrawingPoint;
  /** 运行态元素布局 */
  elements: DrawingRuntimeElementLayout[];
}

/**
 * 运行态元素测量结果。
 */
interface DrawingRuntimeMeasuredElement {
  /** 原始元素 */
  element: DrawingShapeElement;
  /** 渲染尺寸 */
  renderSize: DrawingSize;
  /** 视觉边界 */
  bounds: DrawingRuntimeBounds;
}

/** 空运行态布局最小内容尺寸。 */
const DRAWING_RUNTIME_EMPTY_CONTENT_SIZE: DrawingSize = { width: 1, height: 1 };

/**
 * 创建运行态边界对象。
 * @param minX - 左侧边界
 * @param minY - 顶部边界
 * @param maxX - 右侧边界
 * @param maxY - 底部边界
 * @returns 运行态边界
 */
function createRuntimeBounds(minX: number, minY: number, maxX: number, maxY: number): DrawingRuntimeBounds {
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * 将角度转换为弧度。
 * @param degrees - 角度
 * @returns 弧度
 */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 计算点绕中心点旋转后的坐标。
 * @param point - 原始点
 * @param center - 旋转中心
 * @param radians - 旋转弧度
 * @returns 旋转后的点
 */
function rotatePoint(point: DrawingPoint, center: DrawingPoint, radians: number): DrawingPoint {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;

  return {
    x: center.x + deltaX * cos - deltaY * sin,
    y: center.y + deltaX * sin + deltaY * cos
  };
}

/**
 * 计算单个元素的运行态视觉边界。
 * @param element - 画布元素
 * @param renderSize - 元素渲染尺寸
 * @returns 元素视觉边界
 */
function createElementRuntimeBounds(element: DrawingShapeElement, renderSize: DrawingSize): DrawingRuntimeBounds {
  const left = element.position.x;
  const top = element.position.y;
  const right = left + renderSize.width;
  const bottom = top + renderSize.height;

  if (!element.rotation) {
    return createRuntimeBounds(left, top, right, bottom);
  }

  const center = {
    x: left + renderSize.width / 2,
    y: top + renderSize.height / 2
  };
  const radians = degreesToRadians(element.rotation);
  const points = [
    rotatePoint({ x: left, y: top }, center, radians),
    rotatePoint({ x: right, y: top }, center, radians),
    rotatePoint({ x: right, y: bottom }, center, radians),
    rotatePoint({ x: left, y: bottom }, center, radians)
  ];
  const xValues = points.map((point: DrawingPoint): number => point.x);
  const yValues = points.map((point: DrawingPoint): number => point.y);

  return createRuntimeBounds(Math.min(...xValues), Math.min(...yValues), Math.max(...xValues), Math.max(...yValues));
}

/**
 * 判断元素布局是否可见。
 * @param renderSize - 元素渲染尺寸
 * @returns 是否可见
 */
function isVisibleRenderSize(renderSize: DrawingSize): boolean {
  return renderSize.width > 0 && renderSize.height > 0;
}

/**
 * 创建空运行态布局。
 * @returns 空布局
 */
function createEmptyRuntimeLayout(): DrawingRuntimeLayout {
  return {
    bounds: createRuntimeBounds(0, 0, 0, 0),
    contentSize: { ...DRAWING_RUNTIME_EMPTY_CONTENT_SIZE },
    offset: { x: 0, y: 0 },
    elements: []
  };
}

/**
 * 根据元素和渲染上下文创建运行态布局。
 * @param elements - 画布元素列表
 * @param renderContext - 运行态渲染上下文
 * @param padding - 内容留白
 * @returns 运行态布局
 */
export function createDrawingRuntimeLayout(elements: DrawingElement[], renderContext?: DrawingRenderContext, padding = 16): DrawingRuntimeLayout {
  const elementLayouts = elements
    .map((element: DrawingElement): DrawingRuntimeMeasuredElement => {
      const renderSize = getDrawingShapeRenderSize(element, renderContext);

      return {
        element,
        renderSize,
        bounds: createElementRuntimeBounds(element, renderSize)
      };
    })
    .filter((item: DrawingRuntimeMeasuredElement): boolean => isVisibleRenderSize(item.renderSize));

  if (!elementLayouts.length) {
    return createEmptyRuntimeLayout();
  }

  const bounds = elementLayouts.reduce<DrawingRuntimeBounds>(
    (currentBounds: DrawingRuntimeBounds, item: DrawingRuntimeMeasuredElement): DrawingRuntimeBounds =>
      createRuntimeBounds(
        Math.min(currentBounds.minX, item.bounds.minX),
        Math.min(currentBounds.minY, item.bounds.minY),
        Math.max(currentBounds.maxX, item.bounds.maxX),
        Math.max(currentBounds.maxY, item.bounds.maxY)
      ),
    elementLayouts[0].bounds
  );
  const offset = {
    x: padding - bounds.minX,
    y: padding - bounds.minY
  };

  return {
    bounds,
    contentSize: {
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    },
    offset,
    elements: elementLayouts.map(
      (item: DrawingRuntimeMeasuredElement): DrawingRuntimeElementLayout => ({
        element: item.element,
        renderSize: item.renderSize,
        position: {
          x: item.element.position.x + offset.x,
          y: item.element.position.y + offset.y
        }
      })
    )
  };
}
```

- [ ] **Step 4: Run the layout tests to verify they pass**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-layout.test.ts
```

Expected result:

```text
Test Files  1 passed (1)
Tests  4 passed (4)
```

---

### Task 2: Content-Bounds Runtime View

**Files:**
- Create: `test/components/BDrawing/drawing-runtime-view.component.test.ts`
- Create: `src/components/BDrawing/RuntimeView.vue`
- Depends on: `src/components/BDrawing/utils/drawingRuntimeLayout.ts`

- [ ] **Step 1: Write the failing runtime view tests**

Create `test/components/BDrawing/drawing-runtime-view.component.test.ts`:

```ts
/**
 * @file drawing-runtime-view.component.test.ts
 * @description 验证 BDrawing 运行态只读视图按内容边界缩放渲染画布。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { cloneDeep } from 'lodash-es';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawingRuntimeView from '@/components/BDrawing/RuntimeView.vue';
import type { DrawingData, DrawingRenderContext } from '@/components/BDrawing/types';
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';

/** ResizeObserver 回调。 */
type ResizeObserverCallbackLike = (entries: ResizeObserverEntry[]) => void;

/** 运行态测试容器宽度。 */
const RUNTIME_CONTAINER_WIDTH = 504;
/** 运行态测试容器高度。 */
const RUNTIME_CONTAINER_HEIGHT = 300;

/**
 * ResizeObserver 测试替身。
 */
class ResizeObserverMock {
  /** ResizeObserver 回调。 */
  private readonly callback: ResizeObserverCallbackLike;

  /**
   * 创建 ResizeObserver 测试替身。
   * @param callback - ResizeObserver 回调
   */
  public constructor(callback: ResizeObserverCallbackLike) {
    this.callback = callback;
  }

  /**
   * 监听目标元素尺寸。
   * @param target - 监听目标
   */
  public observe = (target: Element): void => {
    const entry = {
      target,
      contentRect: DOMRect.fromRect({
        width: RUNTIME_CONTAINER_WIDTH,
        height: RUNTIME_CONTAINER_HEIGHT
      }),
      contentBoxSize: [
        {
          inlineSize: RUNTIME_CONTAINER_WIDTH,
          blockSize: RUNTIME_CONTAINER_HEIGHT
        }
      ]
    } as unknown as ResizeObserverEntry;

    this.callback([entry]);
  };

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
      center: { x: 1000, y: 1000 },
      zoom: 0.1
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
async function mountRuntimeView(drawingData: DrawingData, renderContext: DrawingRenderContext): Promise<VueWrapper> {
  const wrapper = mount(BDrawingRuntimeView, {
    props: {
      drawingData,
      renderContext
    },
    attachTo: document.body
  });

  await nextTick();
  await nextTick();

  return wrapper;
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

  it('renders drawing nodes with template content from the runtime context', async (): Promise<void> => {
    const wrapper = await mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

    expect(wrapper.find('[data-testid="drawing-runtime-view"]').exists()).toBe(true);
    expect(findNodeById(wrapper, 'text-1').text()).toBe('上海 当前 28°C');
    expect(findNodeById(wrapper, 'rect-1').find('.drawing-rect-element-view').exists()).toBe(true);
    wrapper.unmount();
  });

  it('uses content bounds instead of infinite canvas or editor viewport', async (): Promise<void> => {
    const wrapper = await mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));
    const stageViewport = wrapper.find('[data-testid="drawing-runtime-stage-viewport"]');
    const stage = wrapper.find('[data-testid="drawing-runtime-stage"]');
    const textNode = findNodeById(wrapper, 'text-1');
    const rectNode = findNodeById(wrapper, 'rect-1');

    expect(wrapper.find('[data-testid="drawing-infinite-viewer"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-canvas"]').exists()).toBe(false);
    expect(stageViewport.attributes('style')).toContain('height: 256px');
    expect(stage.attributes('style')).toContain('width: 252px');
    expect(stage.attributes('style')).toContain('height: 128px');
    expect(stage.attributes('style')).toContain('scale(2)');
    expect(textNode.attributes('style')).toContain('translate(28px, 34px)');
    expect(rectNode.attributes('style')).toContain('translate(16px, 16px)');
    wrapper.unmount();
  });

  it('does not render editor-only interaction layers', async (): Promise<void> => {
    const wrapper = await mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

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
    const wrapper = await mountRuntimeView(drawingData, createRenderContext('上海', 28));

    await wrapper.setProps({
      renderContext: createRenderContext('杭州', 31)
    });
    await nextTick();

    expect(drawingData).toEqual(originalDrawingData);
    wrapper.unmount();
  });

  it('updates rendered template content when the runtime context changes', async (): Promise<void> => {
    const wrapper = await mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

    await wrapper.setProps({
      renderContext: createRenderContext('杭州', 31)
    });
    await nextTick();

    expect(findNodeById(wrapper, 'text-1').text()).toBe('杭州 当前 31°C');
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: Run the runtime view tests to verify they fail**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-view.component.test.ts
```

Expected result:

```text
FAIL test/components/BDrawing/drawing-runtime-view.component.test.ts
Failed to resolve import "@/components/BDrawing/RuntimeView.vue"
```

- [ ] **Step 3: Implement `RuntimeView.vue`**

Create `src/components/BDrawing/RuntimeView.vue`:

```vue
<!--
  @file RuntimeView.vue
  @description BDrawing 运行态内容边界只读画布视图。
-->
<template>
  <section ref="rootRef" class="b-drawing-runtime-view" data-testid="drawing-runtime-view" :style="rootStyle">
    <div class="b-drawing-runtime-view__stage-viewport" data-testid="drawing-runtime-stage-viewport" :style="stageViewportStyle">
      <div class="b-drawing-runtime-view__stage" data-testid="drawing-runtime-stage" :style="stageStyle">
        <DrawingNode
          v-for="element in runtimeElements"
          :key="element.id"
          :node="element"
          @select="ignoreNodeEvent"
          @release="ignoreNodeEvent"
          @context-menu="ignoreContextMenu"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DrawingData, DrawingRenderContext, DrawingShapeElement } from './types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import { provideRenderContext } from './hooks/useRenderContext';
import { useViewportSize } from './hooks/useViewportSize';
import DrawingNode from './renderers/DrawingNode.vue';
import { createDrawingRuntimeLayout } from './utils/drawingRuntimeLayout';

/**
 * 运行态画布视图入参。
 */
interface Props {
  /** 画布模板数据 */
  drawingData: DrawingData;
  /** 运行态渲染上下文 */
  renderContext: DrawingRenderContext;
  /** 内容留白 */
  padding?: number;
}

const props = withDefaults(defineProps<Props>(), {
  padding: 16
});

/** 运行态渲染上下文响应式包装。 */
const providedRenderContext = computed<DrawingRenderContext>(() => props.renderContext);

provideRenderContext(providedRenderContext);

const { rootRef, viewportSize } = useViewportSize();

/** 当前运行态内容布局。 */
const runtimeLayout = computed(() => createDrawingRuntimeLayout(props.drawingData.elements, props.renderContext, props.padding));
/** 当前运行态内容缩放比例。 */
const runtimeScale = computed<number>(() => {
  if (!runtimeLayout.value.elements.length) {
    return 1;
  }

  if (!viewportSize.value.width || !runtimeLayout.value.contentSize.width) {
    return 1;
  }

  return viewportSize.value.width / runtimeLayout.value.contentSize.width;
});
/** 缩放后的运行态视图高度。 */
const scaledHeight = computed<number>(() => runtimeLayout.value.contentSize.height * runtimeScale.value);
/** 运行态渲染元素，使用平移后的内容边界坐标，不修改来源画布数据。 */
const runtimeElements = computed<DrawingShapeElement[]>(() =>
  runtimeLayout.value.elements.map(
    (item): DrawingShapeElement => ({
      ...item.element,
      position: item.position
    })
  )
);
/** 运行态根节点样式。 */
const rootStyle = computed<CSSProperties>(() => ({
  height: `${scaledHeight.value}px`
}));
/** 运行态舞台裁剪容器样式。 */
const stageViewportStyle = computed<CSSProperties>(() => ({
  height: `${scaledHeight.value}px`
}));
/** 运行态内容舞台样式。 */
const stageStyle = computed<CSSProperties>(() => ({
  width: `${runtimeLayout.value.contentSize.width}px`,
  height: `${runtimeLayout.value.contentSize.height}px`,
  transform: `scale(${runtimeScale.value})`
}));

/**
 * 忽略运行态节点指针事件。
 */
function ignoreNodeEvent(): void {
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
  position: relative;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-drawing-runtime-view__stage-viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.b-drawing-runtime-view__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.b-drawing-runtime-view :deep(.b-drawing-node) {
  cursor: default;
}
</style>
```

- [ ] **Step 4: Run the runtime view tests to verify they pass**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-view.component.test.ts
```

Expected result:

```text
Test Files  1 passed (1)
Tests  5 passed (5)
```

- [ ] **Step 5: Run focused BDrawing runtime tests**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-layout.test.ts test/components/BDrawing/drawing-runtime-view.component.test.ts test/components/BDrawing/text-element-view.component.test.ts test/components/BDrawing/use-render-context.test.ts
```

Expected result:

```text
Test Files  4 passed (4)
```

---

### Task 3: Changelog, Static Checks, and Commit

**Files:**
- Modify: `changelog/2026-06-29.md`
- Add: `docs/superpowers/plans/2026-06-29-drawing-runtime-view.md`
- Verify: `src/components/BDrawing/RuntimeView.vue`
- Verify: `src/components/BDrawing/utils/drawingRuntimeLayout.ts`
- Verify: `test/components/BDrawing/drawing-runtime-view.component.test.ts`
- Verify: `test/components/BDrawing/drawing-runtime-layout.test.ts`

- [ ] **Step 1: Update changelog**

In `changelog/2026-06-29.md`, add this line under `## Changed`:

```markdown
- 新增 BDrawing 运行态只读画布视图，按节点内容边界等比缩放展示动态模板内容。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BDrawing/drawing-runtime-layout.test.ts test/components/BDrawing/drawing-runtime-view.component.test.ts test/components/BDrawing/text-element-view.component.test.ts test/components/BDrawing/use-render-context.test.ts
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

- [ ] **Step 6: Check diff hygiene**

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
git add src/components/BDrawing/RuntimeView.vue src/components/BDrawing/utils/drawingRuntimeLayout.ts test/components/BDrawing/drawing-runtime-view.component.test.ts test/components/BDrawing/drawing-runtime-layout.test.ts changelog/2026-06-29.md docs/superpowers/plans/2026-06-29-drawing-runtime-view.md docs/superpowers/specs/2026-06-29-drawing-skill-design.md
git commit -m "feat(drawing): 添加内容边界运行态视图"
```

Expected result:

```text
[main <hash>] feat(drawing): 添加内容边界运行态视图
```

---

## Self-Review

- Spec coverage: This plan implements only the approved next step, `BDrawingRuntimeView` content-bounds read-only runtime rendering. It does not implement AI routing, session state machine, methods, HTTP, permissions, or chat message integration.
- Placeholder scan: The plan has concrete file paths, commands, code blocks, and expected outcomes for each task.
- Type consistency: The utility and component use existing `DrawingData`, `DrawingElement`, `DrawingRenderContext`, `DrawingShapeElement`, `DrawingPoint`, and `DrawingSize` types from `src/components/BDrawing/types.ts`.
- Runtime boundary: The component renders `DrawingNode` directly and does not import `InfiniteViewport` or `DrawingCanvas`.
- Testability: The first task fails before the utility exists, the second task fails before the component exists, and each implementation step has focused passing commands.
