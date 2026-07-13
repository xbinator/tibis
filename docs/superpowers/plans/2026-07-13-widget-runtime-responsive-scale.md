# BWidget Runtime Responsive Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `BWidgetRuntime` 在空间充足时保持 metadata 设定尺寸，空间不足时等比缩小，并在空间恢复后放大回设定尺寸。

**Architecture:** 将运行态根节点固定为宿主宽度测量边界，删除由布局结果反向写入根节点宽度的反馈环。`useRuntimeLayout` 先计算 metadata 对应的基础展示盒子；配置有效 metadata 尺寸时按 `min(hostWidth / baseWidth, 1)` 缩放基础盒子、内容比例和舞台偏移，未配置时继续填满宿主宽度。Hook 内部最终只保留 metadata 读取、纯布局计算和响应式包装三个函数，避免单步骤 helper 造成阅读跳转。

**Tech Stack:** Vue 3 Composition API、TypeScript、VueUse `ResizeObserver`、Vitest、Vue Test Utils、Less。

**Execution constraint:** 用户要求直接在当前 `main` 工作区开发，不创建 worktree、不创建分支、不执行 Git 提交。

---

### Task 1: 用单元测试定义双向布局计算

**Files:**
- Create: `test/components/BWidget/use-runtime-layout.test.ts`
- Modify: `src/components/BWidget/hooks/useRuntimeLayout.ts`

- [ ] **Step 1: 编写失败测试**

创建 Hook 纯逻辑测试，使用 `200 × 100` 内容、`320 × 180` 基础展示盒子和响应式 `viewportSize`：

```typescript
const viewportSize = ref<WidgetSize>({ width: 160, height: 0 });
const { runtimeDisplayLayout } = useRuntimeLayout({
  widgetData: computed<WidgetData>(() => ({
    ...createDefaultWidgetData(),
    metadata: { width: 320, height: 180 }
  })),
  contentSize: computed<WidgetSize>(() => ({ width: 200, height: 100 })),
  hasRenderableElements: computed<boolean>(() => true),
  viewportSize
});

expect(runtimeDisplayLayout.value).toEqual({
  width: 160,
  height: 90,
  scale: 0.8,
  stageOffset: { x: 0, y: 5 }
});

viewportSize.value = { width: 640, height: 0 };

expect(runtimeDisplayLayout.value).toEqual({
  width: 320,
  height: 180,
  scale: 1.6,
  stageOffset: { x: 0, y: 10 }
});
```

同时覆盖未配置 metadata、仅配置宽度、仅配置高度、无内容和非法 metadata。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm exec vitest run test/components/BWidget/use-runtime-layout.test.ts`

Expected: FAIL；错误布局会在宿主宽度为 `640` 时返回 `640 × 360`，超过设定的 `320 × 180`。

- [ ] **Step 3: 实现基础展示盒子和响应式比例**

在 `useRuntimeLayout.ts` 中用带完整注释的内部类型和函数拆开两阶段计算：

```typescript
interface WidgetRuntimeBaseLayout {
  size: WidgetSize;
  scale: number;
  stageOffset: WidgetPoint;
}

function createResponsiveRuntimeDisplayLayout(
  baseLayout: WidgetRuntimeBaseLayout,
  hostWidth: number,
  constrainToBaseSize: boolean
): WidgetRuntimeDisplayLayout {
  const hostScale = hostWidth > 0 ? hostWidth / baseLayout.size.width : 1;
  const responsiveScale = constrainToBaseSize ? Math.min(hostScale, 1) : hostScale;
  const availableWidth = hostWidth > 0 ? hostWidth : baseLayout.size.width;
  const displayWidth = constrainToBaseSize ? Math.min(availableWidth, baseLayout.size.width) : availableWidth;

  return {
    width: displayWidth,
    height: baseLayout.size.height * responsiveScale,
    scale: baseLayout.scale * responsiveScale,
    stageOffset: {
      x: baseLayout.stageOffset.x * responsiveScale,
      y: baseLayout.stageOffset.y * responsiveScale
    }
  };
}
```

基础展示盒子继续保留四种 metadata 语义；配置有效 metadata 尺寸时最终响应式比例不超过 `1`，未配置 metadata 时仍允许按宿主宽度放大内容。

- [ ] **Step 4: 运行 Hook 测试并确认通过**

Run: `pnpm exec vitest run test/components/BWidget/use-runtime-layout.test.ts`

Expected: PASS。

### Task 2: 解除根节点宽度反馈并验证连续 ResizeObserver 变化

**Files:**
- Modify: `src/components/BWidget/Runtime.vue`
- Modify: `test/components/BWidget/widget-runtime-view.component.test.ts`

- [ ] **Step 1: 扩展 ResizeObserver 测试替身**

让测试替身记录回调并提供显式触发方法：

```typescript
class ResizeObserverMock {
  private static callbacks: ResizeObserverCallbackLike[] = [];

  public static trigger(width: number, height: number): void {
    resizeObserverWidth = width;
    resizeObserverHeight = height;
    ResizeObserverMock.callbacks.forEach((callback: ResizeObserverCallbackLike): void => {
      observedResizeTargets.forEach((target: Element): void => {
        callback([createResizeObserverEntry(target, width, height)]);
      });
    });
  }
}
```

把条目创建提取为有 JSDoc、明确参数和返回值的 `createResizeObserverEntry`，并在 `beforeEach` 中重置回调集合。

- [ ] **Step 2: 编写组件级失败测试**

挂载配置 `metadata: { width: 320, height: 180 }` 的 Widget，依次触发 `504 → 160 → 640`：

```typescript
expect(root.attributes('style')).not.toContain('width:');
expect(stageViewport.attributes('style')).toContain('width: 320px');
expect(stageViewport.attributes('style')).toContain('height: 180px');

ResizeObserverMock.trigger(160, 90);
await nextTick();
expect(stageViewport.attributes('style')).toContain('width: 160px');
expect(stageViewport.attributes('style')).toContain('height: 90px');

ResizeObserverMock.trigger(640, 360);
await nextTick();
expect(stageViewport.attributes('style')).toContain('width: 320px');
expect(stageViewport.attributes('style')).toContain('height: 180px');
```

同步更新已有 metadata 宽高测试：空间充足时保持设定尺寸，空间不足时缩小，基础盒子比例、`contain` 居中和无变形语义保持不变。

- [ ] **Step 3: 运行组件测试并确认失败**

Run: `pnpm exec vitest run test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: FAIL；错误实现会让 metadata 展示盒子超过设定尺寸放大到 `640px`。

- [ ] **Step 4: 修改 Runtime 根节点样式职责**

将 `rootStyle` 简化为只写入自动计算的高度：

```typescript
const rootStyle = computed<CSSProperties>(() => ({
  height: `${runtimeDisplayLayout.value.height}px`
}));
```

保留 `.b-widget-runtime { width: 100%; }`，让根节点持续反映宿主实时可用宽度；舞台裁剪容器继续使用 `runtimeDisplayLayout.width` 和 `runtimeDisplayLayout.height`。

- [ ] **Step 5: 运行组件测试并确认通过**

Run: `pnpm exec vitest run test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: PASS。

### Task 3: 记录变更并完成项目验证

**Files:**
- Modify: `changelog/2026-07-13.md`

- [ ] **Step 1: 更新 changelog**

在当天日志的 `Changed` 或 `Fixed` 小节记录：

```markdown
- 修复 BWidget 运行态配置展示宽高后只能随宿主缩小、无法恢复设定尺寸的问题；运行态内容现在会在空间不足时等比缩小，并在空间恢复后放大回设定尺寸。
```

- [ ] **Step 2: 运行目标测试**

Run: `pnpm exec vitest run test/components/BWidget/use-runtime-layout.test.ts test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: 两个测试文件全部 PASS。

- [ ] **Step 3: 运行代码规范检查**

Run: `pnpm exec eslint src/components/BWidget/Runtime.vue src/components/BWidget/hooks/useRuntimeLayout.ts test/components/BWidget/use-runtime-layout.test.ts test/components/BWidget/widget-runtime-view.component.test.ts --ext .vue,.ts`

Expected: exit code 0。

Run: `pnpm exec stylelint 'src/components/BWidget/Runtime.vue'`

Expected: exit code 0。

- [ ] **Step 4: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0。

- [ ] **Step 5: 检查最终差异**

Run: `git diff --check && git status --short`

Expected: 无空白错误；只显示本计划、设计文档、运行态布局实现、测试和当天 changelog 的预期修改。不要暂存或提交文件。

### Task 4: 合并过度拆分的运行态布局函数

**Files:**
- Modify: `src/components/BWidget/hooks/useRuntimeLayout.ts`
- Modify: `test/components/BWidget/use-runtime-layout.test.ts`
- Modify: `changelog/2026-07-13.md`

- [ ] **Step 1: 编写失败的源码结构测试**

在 `test/components/BWidget/use-runtime-layout.test.ts` 读取 Hook 源码，约束已确认移除的单步骤 helper 和中间类型：

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('keeps runtime layout calculation in three focused functions', (): void => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/BWidget/hooks/useRuntimeLayout.ts'), 'utf8');

  expect(source).not.toContain('function normalizeRuntimeDisplaySizeValue');
  expect(source).not.toContain('function createCenteredStageOffset');
  expect(source).not.toContain('function createRuntimeBaseLayout');
  expect(source).not.toContain('function createResponsiveRuntimeDisplayLayout');
  expect(source).not.toContain('interface WidgetRuntimeBaseLayout');
});
```

- [ ] **Step 2: 运行结构测试并确认失败**

Run: `pnpm exec vitest run test/components/BWidget/use-runtime-layout.test.ts -t "three focused functions"`

Expected: FAIL，源码仍包含上述 helper 和中间类型。

- [ ] **Step 3: 合并 metadata 归一化函数**

删除 `normalizeRuntimeDisplaySizeValue`，在 `readRuntimeDisplaySize` 中一次读取并归一化两个字段：

```typescript
function readRuntimeDisplaySize(value: WidgetData): WidgetRuntimeDisplaySize {
  const width = value.metadata.width;
  const height = value.metadata.height;

  return {
    width: isNumber(width) && isFiniteNumber(width) && width > 0 ? width : undefined,
    height: isNumber(height) && isFiniteNumber(height) && height > 0 ? height : undefined
  };
}
```

- [ ] **Step 4: 将布局计算合并为一条线性流程**

删除 `WidgetRuntimeBaseLayout`、`createCenteredStageOffset`、`createRuntimeBaseLayout` 和 `createResponsiveRuntimeDisplayLayout`，在 `createRuntimeDisplayLayout` 中依次计算基础尺寸、基础缩放、宿主约束和最终结果：

```typescript
function createRuntimeDisplayLayout(
  contentSize: WidgetSize,
  displaySize: WidgetRuntimeDisplaySize,
  hostWidth: number,
  hasRenderableElements: boolean
): WidgetRuntimeDisplayLayout {
  if (!hasRenderableElements || !contentSize.width || !contentSize.height) {
    return {
      height: contentSize.height,
      scale: 1,
      stageOffset: { x: 0, y: 0 }
    };
  }

  // 1. 根据 metadata 创建基础展示盒子；缺失的单边按内容比例推导。
  const widthScale = displaySize.width === undefined ? Number.POSITIVE_INFINITY : displaySize.width / contentSize.width;
  const heightScale = displaySize.height === undefined ? Number.POSITIVE_INFINITY : displaySize.height / contentSize.height;
  const calculatedBaseScale = Math.min(widthScale, heightScale);
  const baseScale = isFiniteNumber(calculatedBaseScale) ? calculatedBaseScale : 1;
  const baseWidth = displaySize.width ?? contentSize.width * baseScale;
  const baseHeight = displaySize.height ?? contentSize.height * baseScale;
  const baseOffset = {
    x: Math.max((baseWidth - contentSize.width * baseScale) / 2, 0),
    y: Math.max((baseHeight - contentSize.height * baseScale) / 2, 0)
  };

  // 2. 配置 metadata 时不超过基础展示盒子；未配置时继续填满宿主宽度。
  const constrainToBaseSize = displaySize.width !== undefined || displaySize.height !== undefined;
  const hostScale = hostWidth > 0 ? hostWidth / baseWidth : 1;
  const responsiveScale = constrainToBaseSize ? Math.min(hostScale, 1) : hostScale;
  const availableWidth = hostWidth > 0 ? hostWidth : baseWidth;
  const displayWidth = constrainToBaseSize ? Math.min(availableWidth, baseWidth) : availableWidth;

  return {
    width: displayWidth,
    height: baseHeight * responsiveScale,
    scale: baseScale * responsiveScale,
    stageOffset: {
      x: baseOffset.x * responsiveScale,
      y: baseOffset.y * responsiveScale
    }
  };
}
```

- [ ] **Step 5: 运行结构与行为测试**

Run: `pnpm exec vitest run test/components/BWidget/use-runtime-layout.test.ts test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: 两个测试文件共 45 项全部 PASS，所有尺寸断言保持不变。

- [ ] **Step 6: 更新 changelog 并运行静态检查**

在 `changelog/2026-07-13.md` 的 `Changed` 小节增加：

```markdown
- 简化 BWidget 运行态布局 Hook，将过度拆分的基础盒子、缩放和偏移 helper 合并为线性纯布局计算，保持现有展示尺寸行为不变。
```

Run: `pnpm exec eslint src/components/BWidget/hooks/useRuntimeLayout.ts test/components/BWidget/use-runtime-layout.test.ts --ext .ts`

Expected: exit code 0。

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0。

- [ ] **Step 7: 检查最终差异**

Run: `git diff --check && git status --short`

Expected: 无空白错误，不暂存、不提交任何文件。
