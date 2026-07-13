# BWidget Runtime Responsive Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `BWidgetRuntime` 始终以宿主实时宽度双向等比缩放，容器缩小后能够重新放大，并自动计算展示高度。

**Architecture:** 将运行态根节点固定为宿主宽度测量边界，删除由布局结果反向写入根节点宽度的反馈环。`useRuntimeLayout` 先计算 metadata 对应的基础展示盒子，再按当前宿主宽度统一缩放基础盒子、内容比例和舞台偏移。

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
  width: 640,
  height: 360,
  scale: 3.2,
  stageOffset: { x: 0, y: 20 }
});
```

同时覆盖未配置 metadata、仅配置宽度、仅配置高度、无内容和非法 metadata。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm exec vitest run test/components/BWidget/use-runtime-layout.test.ts`

Expected: FAIL；当前布局会把 `320 × 180` 视为最大展示盒子，宿主宽度为 `640` 时仍返回 `320 × 180`。

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
  hostWidth: number
): WidgetRuntimeDisplayLayout {
  const responsiveScale = hostWidth > 0 ? hostWidth / baseLayout.size.width : 1;

  return {
    width: baseLayout.size.width * responsiveScale,
    height: baseLayout.size.height * responsiveScale,
    scale: baseLayout.scale * responsiveScale,
    stageOffset: {
      x: baseLayout.stageOffset.x * responsiveScale,
      y: baseLayout.stageOffset.y * responsiveScale
    }
  };
}
```

基础展示盒子继续保留四种 metadata 语义；最终响应式比例允许大于 `1`，不再调用只允许缩小的 `constrainDisplayBoxToHost`。

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
expect(stageViewport.attributes('style')).toContain('width: 504px');

ResizeObserverMock.trigger(160, 90);
await nextTick();
expect(stageViewport.attributes('style')).toContain('width: 160px');
expect(stageViewport.attributes('style')).toContain('height: 90px');

ResizeObserverMock.trigger(640, 360);
await nextTick();
expect(stageViewport.attributes('style')).toContain('width: 640px');
expect(stageViewport.attributes('style')).toContain('height: 360px');
```

同步更新已有 metadata 宽高测试：实际展示宽度改为当前宿主宽度，基础盒子比例、`contain` 居中和无变形语义保持不变。

- [ ] **Step 3: 运行组件测试并确认失败**

Run: `pnpm exec vitest run test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: FAIL；当前根样式仍写入固定像素宽度，而且 metadata 展示盒子不会放大到 `640px`。

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
- 修复 BWidget 运行态配置展示宽高后只能随宿主缩小、无法重新放大的问题；运行态内容现在按宿主实时宽度双向等比缩放并自动计算高度。
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
