# BWidget Text Design-Mode Size Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make text element sizing use the content actually visible in the current render mode, so hidden design-mode bindings no longer force the selection back to a larger size.

**Architecture:** Add render-mode options to the shared BWidget types and pass them through the geometry/schema measurement boundary. Reuse one binding-display resolver for both Vue text rendering and text metrics, then make design and runtime callers explicit at the points where their mode is known.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vue Test Utils, vue3-moveable

## Global Constraints

- Do not use `any`; all parameters and return values require explicit types.
- Every new or changed function, interface, and non-trivial branch requires an accurate JSDoc or intent comment.
- Async code must use `src/utils/asyncTo.ts`; this change does not introduce async work.
- Keep `model-min-content`; only the measured content changes by render mode.
- Do not change persisted Widget data or add a migration.
- Do not stage or commit changes; the user will commit them.
- Record the code change in `changelog/2026-07-20.md`.

---

### Task 1: Unify display-value resolution by render mode

**Files:**
- Modify: `src/components/BWidget/types.ts`
- Modify: `src/components/BWidget/hooks/useRenderContext.ts`
- Modify: `src/components/BWidget/hooks/useElementValue.ts`
- Modify: `src/components/BWidget/utils/widgetBindings.ts`
- Test: `test/components/BWidget/widget-bindings.test.ts`

**Interfaces:**
- Produces: `WidgetRenderMode = 'design' | 'runtime'`
- Produces: `WidgetRenderContextOptions { mode?: WidgetRenderMode }`
- Produces: `resolveWidgetDisplayValue(value, context, renderOptions): unknown`
- Produces: `resolveWidgetTemplateFieldText(metadata, fieldName, context, renderOptions): string`

- [ ] **Step 1: Add a failing display-resolution test**

Import `resolveWidgetTemplateFieldText` and add a test that proves the same field resolves differently by mode:

```ts
it('resolves field text from the content visible in each render mode', (): void => {
  const context = createRenderContext();
  const metadata = {
    content: "评分：{{ weather.temperature }} / {{ movie.hasScore ? movie.scoreText : '暂无' }}"
  };

  expect(resolveWidgetTemplateFieldText(metadata, 'content', context, { mode: 'design' })).toBe('评分： / ');
  expect(resolveWidgetTemplateFieldText({ content: '{{ weather.temperature }}' }, 'content', context, { mode: 'runtime' })).toBe('28');
});
```

- [ ] **Step 2: Run the test and verify the design assertion fails**

Run: `pnpm vitest run test/components/BWidget/widget-bindings.test.ts`

Expected: FAIL because the fourth render-options argument is ignored and design mode still returns resolved/raw template content.

- [ ] **Step 3: Add shared render types and resolver**

Add the render mode and options to `src/components/BWidget/types.ts`, then re-export them from `useRenderContext.ts` so existing imports remain valid:

```ts
/** Widget Vue 渲染模式。 */
export type WidgetRenderMode = 'design' | 'runtime';

/** Widget Vue 渲染上下文选项。 */
export interface WidgetRenderContextOptions {
  /** Widget Vue 渲染模式 */
  mode?: WidgetRenderMode;
}
```

In `widgetBindings.ts`, add a shared resolver and route field text through it:

```ts
export function resolveWidgetDisplayValue(
  value: unknown,
  context: WidgetRenderContext | undefined,
  renderOptions: WidgetRenderContextOptions = { mode: 'design' }
): unknown {
  if (typeof value !== 'string') return value;

  return renderOptions.mode === 'runtime' ? resolveWidgetTemplateValue(value, context) : removeWidgetTemplateBindings(value);
}
```

Update `useElementValue.ts` to call `resolveWidgetDisplayValue` and remove its private duplicate string-mode branch. Update `resolveWidgetTemplateFieldText` to accept `renderOptions` and format `resolveWidgetDisplayValue(...)`.

- [ ] **Step 4: Run shared binding and element-value tests**

Run: `pnpm vitest run test/components/BWidget/widget-bindings.test.ts test/components/BWidget/use-element-value.test.ts test/components/BWidget/text-element-view.component.test.ts`

Expected: PASS.

### Task 2: Carry render mode through schema-based size measurement

**Files:**
- Modify: `src/components/BWidget/elements/types.ts`
- Modify: `src/components/BWidget/utils/widgetGeometry.ts`
- Modify: `src/components/BWidget/utils/widgetTextMetrics.ts`
- Modify: `src/components/BWidget/utils/widgetRuntime/layout.ts`
- Modify: `test/components/BWidget/widget-loop.test.ts`
- Test: `test/components/BWidget/widget-geometry.test.ts`
- Test: `test/components/BWidget/widget-runtime-layout.test.ts`

**Interfaces:**
- Consumes: `WidgetRenderContextOptions`
- Produces: `measureContent(element, renderContext?, renderOptions?): WidgetSize`
- Produces: `getWidgetShapeRenderSize(element, renderContext?, renderOptions?): WidgetSize`

- [ ] **Step 1: Add failing geometry tests for design and runtime content**

Add one text element with a narrow width and a template expression, then assert design mode measures the static remainder while runtime mode measures the resolved value:

```ts
it('measures text from the content visible in the requested render mode', (): void => {
  const element = {
    ...createTextElement('text-1', '前缀{{ weather.summary }}', { x: 0, y: 0 }, { fontSize: 10 }),
    size: { width: 30, height: 12 }
  };
  const context = {
    input: {},
    output: undefined,
    data: { weather: { summary: '很长很长很长的天气说明' } }
  };

  const designSize = getWidgetShapeRenderSize(element, context, { mode: 'design' });
  const runtimeSize = getWidgetShapeRenderSize(element, context, { mode: 'runtime' });

  expect(runtimeSize.height).toBeGreaterThan(designSize.height);
});
```

- [ ] **Step 2: Run the geometry test and verify it fails**

Run: `pnpm vitest run test/components/BWidget/widget-geometry.test.ts`

Expected: FAIL because `getWidgetShapeRenderSize` and text schema measurement ignore render mode.

- [ ] **Step 3: Extend the size-measurement boundary**

Change `WidgetElementRenderSizeConfig.measureContent` to accept optional render options. Change `getWidgetShapeRenderSize` to default to `{ mode: 'design' }` and pass options into the schema. Change `createWidgetTextRenderSize` to forward options into `resolveWidgetTemplateFieldText`.

Make runtime layout explicit:

```ts
const renderSize = getWidgetShapeRenderSize(item.element, item.renderContext, { mode: 'runtime' });
```

Update the direct runtime expectation in `widget-loop.test.ts` to pass `{ mode: 'runtime' }`.

- [ ] **Step 4: Run geometry, text metrics, loop, and runtime layout tests**

Run: `pnpm vitest run test/components/BWidget/widget-geometry.test.ts test/components/BWidget/widget-text-metrics.test.ts test/components/BWidget/widget-loop.test.ts test/components/BWidget/widget-runtime-layout.test.ts`

Expected: PASS, including existing runtime dynamic-text height comparisons.

### Task 3: Keep WidgetNode and Moveable selection geometry mode-aware

**Files:**
- Modify: `src/components/BWidget/renderers/WidgetNode.vue`
- Modify: `src/components/BWidget/components/MoveableLayer.vue`
- Test: `test/components/BWidget/moveable-layer.component.test.ts`
- Test: `test/components/BWidget/widget-node.component.test.ts`

**Interfaces:**
- Consumes: `renderState.renderContext.value`
- Consumes: `renderState.options.value`
- Preserves: `resize-preview` uses raw Moveable frame size; `resize` uses schema-normalized final size.

- [ ] **Step 1: Add a failing Moveable regression for the reported ternary binding**

Add a design-mode test using the reported unsupported ternary expression and a requested height larger than the empty-content minimum:

```ts
it('keeps a manual design resize when hidden bindings have no visible content', async (): Promise<void> => {
  const textElement: WidgetElement = {
    ...createWidgetElement('text-1', 'text'),
    size: { width: 30, height: 12 },
    style: { fontSize: 10 },
    metadata: { content: "{{ movie.hasScore ? movie.scoreText : '暂无' }}" }
  };
  const { root, wrapper } = mountMoveableLayer(['text-1'], null, [textElement]);

  await flushMoveableLayerSync();
  const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
  const textTarget = queryWidgetElementTarget(root, 'text-1');

  moveableComponent.vm.$emit('resize-end', {
    target: textTarget as Element,
    width: 30,
    height: 24
  });
  await nextTick();

  const resizeEvents = wrapper.emitted('resize') as [WidgetGeometryChange[]][] | undefined;
  expect(resizeEvents?.[0]?.[0][0].size).toEqual({ width: 30, height: 24 });
  wrapper.unmount();
});
```

- [ ] **Step 2: Run the Moveable test and verify it fails**

Run: `pnpm vitest run test/components/BWidget/moveable-layer.component.test.ts`

Expected: FAIL because Moveable measures the raw ternary template and emits a height larger than `24`.

- [ ] **Step 3: Pass render options at Vue measurement call sites**

Update every `getWidgetShapeRenderSize` call in `WidgetNode.vue` and `MoveableLayer.vue` to pass both values:

```ts
getWidgetShapeRenderSize(element, renderState.renderContext.value, renderState.options.value)
```

Extend the Moveable test host with a typed render-mode prop. Keep the existing “resolved render context content” tests in runtime mode, while the new regression uses the default design mode.

- [ ] **Step 4: Run component regression tests**

Run: `pnpm vitest run test/components/BWidget/moveable-layer.component.test.ts test/components/BWidget/widget-node.component.test.ts test/components/BWidget/text-element-view.component.test.ts`

Expected: PASS; design-mode hidden bindings no longer enlarge the final selection, and runtime-mode resolved bindings still determine content height.

### Task 4: Record and verify the complete fix

**Files:**
- Modify: `changelog/2026-07-20.md`
- Verify: all files changed by Tasks 1-3

**Interfaces:**
- Produces no new runtime interface beyond Tasks 1-3.

- [ ] **Step 1: Add the changelog entry**

Under `## Changed` or `## Fixed`, add:

```md
- 修复 BWidget 文本元素在编辑态隐藏变量后仍按模板表达式撑大选区、导致手动缩放回退的问题。
```

- [ ] **Step 2: Run the focused regression suite**

Run:

```bash
pnpm vitest run \
  test/components/BWidget/widget-bindings.test.ts \
  test/components/BWidget/use-element-value.test.ts \
  test/components/BWidget/text-element-view.component.test.ts \
  test/components/BWidget/widget-geometry.test.ts \
  test/components/BWidget/widget-text-metrics.test.ts \
  test/components/BWidget/widget-loop.test.ts \
  test/components/BWidget/widget-runtime-layout.test.ts \
  test/components/BWidget/widget-node.component.test.ts \
  test/components/BWidget/moveable-layer.component.test.ts
```

Expected: all tests PASS with no unexpected warnings.

- [ ] **Step 3: Run repository checks**

Run: `pnpm exec tsc --noEmit`

Expected: exit code `0`.

Run: `pnpm exec eslint src/components/BWidget test/components/BWidget --ext .vue,.ts`

Expected: exit code `0`.

Run: `pnpm exec stylelint 'src/components/BWidget/**/*.{vue,less,css}'`

Expected: exit code `0`.

- [ ] **Step 4: Review the final diff without staging or committing**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; only the approved implementation, tests, plan, and changelog remain as local changes.
