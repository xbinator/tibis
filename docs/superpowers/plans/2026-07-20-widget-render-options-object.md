# BWidget Render Options Object Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate `renderContext` and `renderOptions` position parameters in the current BWidget render/measurement chain with one shared options object.

**Architecture:** Add a dependency-neutral `WidgetRenderEvaluationOptions` interface, then pass the same structural object through geometry, element-schema measurement, text measurement, and template display resolution. Keep required business values such as `element`, `metadata`, and `fieldName` as positional arguments; only optional render state is grouped.

**Tech Stack:** TypeScript 5.9, Vue 3, Vitest

## Global Constraints

- Use `{ renderContext?: WidgetRenderContext; renderOptions?: WidgetRenderContextOptions }` as the single shared render-evaluation options shape.
- Options default to `{}` and missing `renderOptions` retains `{ mode: 'design' }` behavior.
- Do not alter design/runtime rendering, template evaluation, geometry, or persisted Widget data.
- Do not refactor unrelated APIs such as `evaluateWidgetBindingExpression`, `resolveWidgetBindingTemplate`, or `createWidgetRuntimeLayout`.
- Do not use `any`; all new interfaces and functions require comments and explicit types.
- Update `changelog/2026-07-20.md`.
- Do not stage or commit; the user will commit.

---

### Task 1: Introduce and propagate the shared render options type

**Files:**
- Create: `src/components/BWidget/renderOptions.ts`
- Modify: `src/components/BWidget/elements/types.ts`
- Modify: `src/components/BWidget/utils/widgetGeometry.ts`
- Modify: `src/components/BWidget/utils/widgetTextMetrics.ts`
- Modify: `src/components/BWidget/utils/widgetBindings.ts`
- Test: `test/components/BWidget/widget-geometry.test.ts`
- Test: `test/components/BWidget/widget-bindings.test.ts`

**Interfaces:**
- Produces: `WidgetRenderEvaluationOptions { renderContext?: WidgetRenderContext; renderOptions?: WidgetRenderContextOptions }`
- Produces: `getWidgetShapeRenderSize(element, options?): WidgetSize`
- Produces: `measureContent(element, options?): WidgetSize`
- Produces: `resolveWidgetDisplayValue(value, options?): unknown`
- Produces: `resolveWidgetTemplateFieldText(metadata, fieldName, options?): string`

- [x] **Step 1: Change integration tests to the approved object API**

Update the render-mode geometry test to call:

```ts
const designSize = getWidgetShapeRenderSize(element, {
  renderContext: context,
  renderOptions: { mode: 'design' }
});
const runtimeSize = getWidgetShapeRenderSize(element, {
  renderContext: context,
  renderOptions: { mode: 'runtime' }
});
```

Update binding field-text assertions to call:

```ts
resolveWidgetTemplateFieldText(metadata, 'content', {
  renderContext: context,
  renderOptions: { mode: 'design' }
});
```

- [x] **Step 2: Run the two tests and verify RED**

Run:

```bash
pnpm vitest run \
  test/components/BWidget/widget-geometry.test.ts \
  test/components/BWidget/widget-bindings.test.ts
```

Expected: FAIL because the existing positional APIs interpret the new object as `renderContext` and never receive the requested runtime mode.

- [x] **Step 3: Add the shared type and refactor the core chain**

Create `renderOptions.ts`:

```ts
/**
 * @file renderOptions.ts
 * @description BWidget 渲染求值与内容测量共享选项。
 */
import type { WidgetRenderContextOptions } from './types';
import type { WidgetRenderContext } from 'types/widget';

/**
 * Widget 渲染求值选项。
 */
export interface WidgetRenderEvaluationOptions {
  /** Widget 渲染上下文 */
  renderContext?: WidgetRenderContext;
  /** Widget 渲染模式选项 */
  renderOptions?: WidgetRenderContextOptions;
}
```

Change the four public/core signatures to accept `options: WidgetRenderEvaluationOptions = {}`. `getWidgetShapeRenderSize` must call `renderSize.measureContent(element, options)`, and text measurement must call `resolveWidgetTemplateFieldText(element.metadata, fieldName, options)` without splitting the object.

In `resolveWidgetDisplayValue`, use:

```ts
const { renderContext, renderOptions = { mode: 'design' } } = options;
```

Then preserve the existing design/runtime branch. `resolveWidgetTemplateFieldText` must pass the same `options` object to `resolveWidgetDisplayValue`.

- [x] **Step 4: Run the two tests and verify GREEN**

Run:

```bash
pnpm vitest run \
  test/components/BWidget/widget-geometry.test.ts \
  test/components/BWidget/widget-bindings.test.ts
```

Expected: both files PASS with identical size and display assertions.

### Task 2: Convert every caller in the current feature scope

**Files:**
- Modify: `src/components/BWidget/hooks/useElementValue.ts`
- Modify: `src/components/BWidget/renderers/WidgetNode.vue`
- Modify: `src/components/BWidget/components/MoveableLayer.vue`
- Modify: `src/components/BWidget/utils/widgetRuntime/layout.ts`
- Modify: `test/components/BWidget/widget-loop.test.ts`
- Modify: `test/components/BWidget/text-element-view.component.test.ts`
- Modify: `test/components/BWidget/button-element-view.component.test.ts`
- Modify: `test/components/BWidget/image-element-view.component.test.ts`
- Modify: `test/components/BWidget/use-element-value.test.ts`

**Interfaces:**
- Consumes: all object APIs produced by Task 1.
- Produces: no remaining feature-scope call that passes `renderContext` and `renderOptions` as adjacent positional arguments.

- [x] **Step 1: Run TypeScript and verify caller failures**

Run: `pnpm exec tsc --noEmit`

Expected: FAIL at old positional call sites after Task 1 changes, identifying every caller that still needs conversion.

- [x] **Step 2: Convert production callers to object arguments**

Use this exact shape in `useElementValue.ts`, `WidgetNode.vue`, and `MoveableLayer.vue`:

```ts
{
  renderContext: renderState.renderContext.value,
  renderOptions: renderState.options.value
}
```

Use this shape in runtime layout and loop measurement:

```ts
{
  renderContext,
  renderOptions: { mode: 'runtime' }
}
```

Calls that have no render state continue to omit the options argument.

- [x] **Step 3: Objectify affected test mount helpers**

Replace newly extended positional helper signatures with file-local commented options interfaces:

```ts
interface MountElementViewOptions {
  renderContext?: WidgetRenderContext;
  renderOptions?: WidgetRenderContextOptions;
}
```

For the button helper, include `runtime?: WidgetRuntimeController`. For the element-value helper, include `valueOptions?: DisplayValueOptions`. Update every invocation in the same test file to pass one object after required business arguments.

- [x] **Step 4: Run the focused regression suite**

Run:

```bash
pnpm vitest run \
  test/components/BWidget/widget-geometry.test.ts \
  test/components/BWidget/widget-bindings.test.ts \
  test/components/BWidget/widget-loop.test.ts \
  test/components/BWidget/widget-runtime-layout.test.ts \
  test/components/BWidget/moveable-layer.component.test.ts \
  test/components/BWidget/use-element-value.test.ts \
  test/components/BWidget/text-element-view.component.test.ts \
  test/components/BWidget/button-element-view.component.test.ts \
  test/components/BWidget/image-element-view.component.test.ts
```

Expected: all listed files PASS.

### Task 3: Record and verify the refactor

**Files:**
- Modify: `changelog/2026-07-20.md`
- Verify: all files modified by Tasks 1-2

**Interfaces:**
- No additional runtime interface.

- [x] **Step 1: Add the changelog entry**

Under `## Changed`, add:

```md
- BWidget 渲染与内容测量链路统一使用 options 对象传递渲染上下文和模式，避免继续增加位置参数。
```

- [x] **Step 2: Run TypeScript and lint checks**

Run: `pnpm exec tsc --noEmit`

Run:

```bash
pnpm exec eslint \
  src/components/BWidget/renderOptions.ts \
  src/components/BWidget/elements/types.ts \
  src/components/BWidget/utils/widgetGeometry.ts \
  src/components/BWidget/utils/widgetTextMetrics.ts \
  src/components/BWidget/utils/widgetBindings.ts \
  src/components/BWidget/hooks/useElementValue.ts \
  src/components/BWidget/renderers/WidgetNode.vue \
  src/components/BWidget/components/MoveableLayer.vue \
  src/components/BWidget/utils/widgetRuntime/layout.ts \
  test/components/BWidget/widget-geometry.test.ts \
  test/components/BWidget/widget-bindings.test.ts \
  test/components/BWidget/widget-loop.test.ts \
  test/components/BWidget/text-element-view.component.test.ts \
  test/components/BWidget/button-element-view.component.test.ts \
  test/components/BWidget/image-element-view.component.test.ts \
  test/components/BWidget/use-element-value.test.ts
```

Run: `pnpm exec stylelint 'src/components/BWidget/**/*.{vue,less,css}'`

Expected: every command exits with code `0`.

- [x] **Step 3: Review unstaged changes**

Run `git diff --check`, `git status --short`, and `git diff --stat` as separate read-only commands.

Expected: no whitespace errors and no staged or committed changes.
