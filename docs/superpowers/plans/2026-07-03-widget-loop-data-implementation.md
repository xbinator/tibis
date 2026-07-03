# Widget Loop Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not create git commits for this work; the repository owner will commit manually.

**Goal:** Add runtime loop rendering for single Widget elements and grouped Widget elements, configured from the Widget settings panel advanced tab.

**Architecture:** Store loop configuration in the loop owner element metadata. Runtime expands loop templates into temporary renderable elements before layout, attaches per-iteration render contexts, and leaves persisted `WidgetData.elements` unchanged. Settings UI edits the loop owner metadata through focused setter components rather than growing `PanelSettings.vue`.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Vitest, Vue Test Utils, existing BWidget runtime/layout/binding utilities.

---

## File Map

- Create `src/components/BWidget/utils/widgetLoop.ts`: loop metadata normalization, array data-source collection, runtime loop expansion, per-element render context mapping.
- Modify `src/components/BWidget/types.ts`: add `WidgetElementLoopConfig` and render-time loop helper types.
- Modify `src/components/BWidget/utils/widgetBindings.ts`: support local loop binding roots while preserving current input/data behavior.
- Modify `src/components/BWidget/hooks/useRenderContext.ts`: allow node-level render context providers to override the runtime root context.
- Modify `src/components/BWidget/renderers/WidgetNode.vue`: accept optional `renderContext` prop and provide it to element views.
- Modify `src/components/BWidget/Runtime.vue`: expand loops before layout and pass node-level render contexts to `WidgetNode`.
- Modify `src/components/BWidget/hooks/useElementVariables.ts`: include loop item/index variables when an element has loop config.
- Create `src/views/widget/components/AdvancedSetter.vue`: advanced tab UI for loop settings.
- Modify `src/views/widget/components/PanelSettings.vue`: add advanced tab for single element and same-group multi-selection.
- Modify `src/views/widget/index.vue`: handle multi-selection loop config updates from `PanelSettings`.
- Add or update tests under `test/components/BWidget/` and `test/views/widget/`.
- Update `changelog/2026-07-03.md`.

---

### Task 1: Binding Local Roots

**Files:**
- Modify: `src/components/BWidget/utils/widgetBindings.ts`
- Test: `test/components/BWidget/widget-bindings.test.ts`

- [ ] **Step 1: Write failing tests for local loop roots**

Add tests that call `evaluateWidgetBindingExpression` and `resolveWidgetTemplateValue` with a local context option:

```ts
it('resolves loop local variables before data fields', (): void => {
  const context: WidgetRenderContext = {
    input: { city: '上海' },
    data: {
      item: { name: 'data item' },
      weather: { temperature: 28 }
    }
  };

  expect(evaluateWidgetBindingExpression('item.name', context, { locals: { item: { name: '拿铁' }, index: 2 } })).toEqual({
    resolved: true,
    value: '拿铁'
  });
  expect(resolveWidgetTemplateValue('{{ item.name }} #{{ index }} {{ weather.temperature }}', context, {
    locals: { item: { name: '拿铁' }, index: 2 }
  })).toBe('拿铁 #2 28');
});

it('keeps existing input and data binding behavior without locals', (): void => {
  const context = createRenderContext();

  expect(resolveWidgetTemplateValue('{{ input.city }} 当前 {{ weather.temperature }}°C', context)).toBe('上海 当前 28°C');
  expect(resolveWidgetTemplateValue('{{ item.name }}', context)).toBe('{{ item.name }}');
});
```

- [ ] **Step 2: Run binding tests and verify failure**

Run: `pnpm test -- test/components/BWidget/widget-bindings.test.ts`

Expected: FAIL because `evaluateWidgetBindingExpression` and `resolveWidgetTemplateValue` do not accept local binding options.

- [ ] **Step 3: Implement local binding options**

Add exported option types in `widgetBindings.ts`:

```ts
export interface WidgetBindingEvaluationOptions {
  /** Local binding roots, used by runtime loop rendering. */
  locals?: Record<string, unknown>;
}
```

Update `createBindingScope`, `parseWidgetBindingPath`, `evaluateWidgetBindingExpression`, `resolveWidgetBindingTemplate`, and `resolveWidgetTemplateValue` so:

- `input` remains explicit input root.
- An expression whose first path segment matches `options.locals` resolves from that local root.
- Other expressions resolve from data exactly as today.

- [ ] **Step 4: Run binding tests and verify pass**

Run: `pnpm test -- test/components/BWidget/widget-bindings.test.ts`

Expected: PASS.

- [ ] **Step 5: Inspect diff**

Run: `git diff -- src/components/BWidget/utils/widgetBindings.ts test/components/BWidget/widget-bindings.test.ts`

Expected: Only binding utility and test changes.

---

### Task 2: Loop Utility

**Files:**
- Create: `src/components/BWidget/utils/widgetLoop.ts`
- Modify: `src/components/BWidget/types.ts`
- Test: `test/components/BWidget/widget-loop.test.ts`

- [ ] **Step 1: Add failing loop utility tests**

Create `test/components/BWidget/widget-loop.test.ts` with cases for:

```ts
it('collects array paths from input and data schemas', (): void => {
  expect(collectWidgetLoopDataSourceOptions(inputSchema, dataSchema).map((item) => item.value)).toEqual([
    'input.items',
    'input.order.lines',
    'products'
  ]);
});

it('expands a single element into grid render elements and removes the template', (): void => {
  const result = createWidgetLoopRenderElements([loopTextElement], renderContext);

  expect(result.map((item) => item.element.id)).toEqual(['text-1__loop_0', 'text-1__loop_1', 'text-1__loop_2']);
  expect(result.map((item) => item.element.position)).toEqual([
    { x: 10, y: 20 },
    { x: 122, y: 20 },
    { x: 10, y: 82 }
  ]);
  expect(result[0].renderContext.locals).toEqual({ item: { name: 'A' }, index: 0 });
});

it('expands a grouped template from the group bounds and shares iteration locals', (): void => {
  const result = createWidgetLoopRenderElements([groupOwner, groupChild], renderContext);

  expect(result.map((item) => item.element.id)).toEqual([
    'card-bg__loop_0',
    'card-title__loop_0',
    'card-bg__loop_1',
    'card-title__loop_1'
  ]);
  expect(result[1].element.position).toEqual({ x: 24, y: 18 });
  expect(result[3].element.position).toEqual({ x: 156, y: 18 });
  expect(result[0].renderContext.locals).toBe(result[1].renderContext.locals);
});
```

- [ ] **Step 2: Run loop tests and verify failure**

Run: `pnpm test -- test/components/BWidget/widget-loop.test.ts`

Expected: FAIL because `widgetLoop.ts` does not exist.

- [ ] **Step 3: Add types**

In `src/components/BWidget/types.ts`, add:

```ts
export interface WidgetElementLoopConfig {
  enabled: boolean;
  source: string;
  columns: number;
  columnGap: number;
  rowGap: number;
  itemName: string;
  indexName: string;
}
```

- [ ] **Step 4: Implement `widgetLoop.ts`**

Implement:

- `WIDGET_LOOP_METADATA_KEY = 'loop'`
- `createDefaultWidgetElementLoopConfig()`
- `readWidgetElementLoopConfig(metadata)`
- `writeWidgetElementLoopConfig(metadata, config)`
- `collectWidgetLoopDataSourceOptions(inputSchema, dataSchema)`
- `createWidgetLoopRenderElements(elements, renderContext)`

The render output should include:

```ts
export interface WidgetLoopRenderElement {
  element: WidgetElement;
  renderContext: WidgetRenderContext & {
    locals?: Record<string, unknown>;
  };
}
```

Use existing group metadata helpers from `src/components/BWidget/utils/widgetGroups.ts` and `getWidgetShapeRenderSize` from `src/components/BWidget/utils/widgetGeometry.ts`. Clamp `columns` to at least `1`, gaps to at least `0`, and empty variable names to `item` / `index`.

- [ ] **Step 5: Run loop utility tests**

Run: `pnpm test -- test/components/BWidget/widget-loop.test.ts`

Expected: PASS.

- [ ] **Step 6: Inspect diff**

Run: `git diff -- src/components/BWidget/types.ts src/components/BWidget/utils/widgetLoop.ts test/components/BWidget/widget-loop.test.ts`

Expected: New utility plus type additions only.

---

### Task 3: Runtime Integration

**Files:**
- Modify: `src/components/BWidget/Runtime.vue`
- Modify: `src/components/BWidget/renderers/WidgetNode.vue`
- Modify: `src/components/BWidget/hooks/useRenderContext.ts`
- Test: `test/components/BWidget/widget-runtime-view.component.test.ts`

- [ ] **Step 1: Add failing runtime rendering tests**

Add tests verifying:

```ts
it('renders loop-expanded text nodes with item and index locals', async (): Promise<void> => {
  const dataItem = createRuntimeWidgetDataWithLoopText();
  const wrapper = await mountRuntime(dataItem, {
    input: {},
    data: {
      products: [{ name: '拿铁' }, { name: '美式' }]
    }
  });

  expect(wrapper.find('[data-widget-element-id="text-1"]').exists()).toBe(false);
  expect(findNodeById(wrapper, 'text-1__loop_0').text()).toContain('拿铁 0');
  expect(findNodeById(wrapper, 'text-1__loop_1').text()).toContain('美式 1');
});
```

Also add a grouped loop test that checks both group elements render per item and the original group IDs are absent.

- [ ] **Step 2: Run runtime tests and verify failure**

Run: `pnpm test -- test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: FAIL because runtime still renders original elements only.

- [ ] **Step 3: Update render context hook**

Keep `provideRenderContext` API, but allow `WidgetNode` to provide a more specific context for its subtree. No public protocol change is required.

- [ ] **Step 4: Update `WidgetNode.vue`**

Add optional prop:

```ts
nodeRenderContext?: WidgetRenderContext & { locals?: Record<string, unknown> }
```

Inside setup, call `provideRenderContext(computed(() => props.nodeRenderContext ?? renderContext.value))` so element views resolve local loop variables.

- [ ] **Step 5: Update `Runtime.vue`**

Replace direct use of `runtimeState.value.value.elements` in layout with loop-expanded render items:

```ts
const runtimeRenderElements = computed<WidgetLoopRenderElement[]>(() =>
  createWidgetLoopRenderElements(runtimeState.value.value.elements, runtimeState.value.renderContext)
);
```

Build layout from `runtimeRenderElements.value.map((item) => item.element)` and pass each item render context to `WidgetNode`.

- [ ] **Step 6: Run runtime tests**

Run: `pnpm test -- test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: PASS.

- [ ] **Step 7: Inspect diff**

Run: `git diff -- src/components/BWidget/Runtime.vue src/components/BWidget/renderers/WidgetNode.vue src/components/BWidget/hooks/useRenderContext.ts test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: Runtime and node context changes only.

---

### Task 4: Advanced Settings UI

**Files:**
- Create: `src/views/widget/components/AdvancedSetter.vue`
- Modify: `src/views/widget/components/PanelSettings.vue`
- Modify: `src/views/widget/index.vue`
- Test: `test/views/widget/panel-settings.test.ts`
- Test: `test/views/widget/index.test.ts`

- [ ] **Step 1: Add failing PanelSettings tests**

Add tests that assert:

```ts
it('renders advanced tab for a selected element and writes loop metadata', async (): Promise<void> => {
  const element = createWidgetElement('text-1', 'text');
  const dataItem = createWidgetData(element);
  dataItem.inputSchema.properties.items = { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } };
  const wrapper = mount(PanelSettings, { props: { value: dataItem, select: element } });

  expect(wrapper.find('[data-tab="高级"]').exists()).toBe(true);
  wrapper.findComponent({ name: 'AdvancedSetter' }).vm.$emit('loop-change', {
    elementIds: ['text-1'],
    config: { enabled: true, source: 'input.items', columns: 2, columnGap: 12, rowGap: 12, itemName: 'item', indexName: 'index' }
  });

  expect(wrapper.emitted('loop-change')).toEqual([[{
    elementIds: ['text-1'],
    config: expect.objectContaining({ source: 'input.items', columns: 2 })
  }]]);
});
```

Add a same-group multi-selection test and a mixed multi-selection test that does not render loop controls.

- [ ] **Step 2: Run PanelSettings tests and verify failure**

Run: `pnpm test -- test/views/widget/panel-settings.test.ts`

Expected: FAIL because advanced UI does not exist.

- [ ] **Step 3: Implement `AdvancedSetter.vue`**

Create a focused Vue component with:

- Props: `dataItem`, `targetElements`
- Emits: `loop-change`
- Uses `collectWidgetLoopDataSourceOptions`
- Reads/writes loop config through `readWidgetElementLoopConfig`
- Renders BSectionBlock fields for enabled, source, itemName, indexName, columns, columnGap, rowGap.

- [ ] **Step 4: Wire `PanelSettings.vue`**

Add advanced tab in single-element mode and same-group multi-select mode. Emit:

```ts
'loop-change': [payload: { elementIds: string[]; config: WidgetElementLoopConfig }]
```

- [ ] **Step 5: Wire `index.vue` metadata update**

Handle `@loop-change` from `PanelSettings`. Update the loop owner element metadata with `writeWidgetElementLoopConfig`. For a group, use the first ID in the payload as the loop owner.

- [ ] **Step 6: Run view tests**

Run: `pnpm test -- test/views/widget/panel-settings.test.ts test/views/widget/index.test.ts`

Expected: PASS.

- [ ] **Step 7: Inspect diff**

Run: `git diff -- src/views/widget/components/AdvancedSetter.vue src/views/widget/components/PanelSettings.vue src/views/widget/index.vue test/views/widget/panel-settings.test.ts test/views/widget/index.test.ts`

Expected: UI wiring and tests only.

---

### Task 5: Element Variable Candidates

**Files:**
- Modify: `src/components/BWidget/hooks/useElementVariables.ts`
- Test: `test/components/BWidget/use-element-variables.test.ts`

- [ ] **Step 1: Add failing variable tests**

Add a test where a text element with loop config receives variable options containing `item`, `item.name`, and `index`.

```ts
it('adds loop item and index variables for loop-enabled elements', (): void => {
  const dataItem = ref<WidgetData | undefined>(createWidgetData());
  const loopConfig = {
    enabled: true,
    source: 'input.items',
    columns: 1,
    columnGap: 12,
    rowGap: 12,
    itemName: 'item',
    indexName: 'index'
  };
  const { variableOptions } = useElementVariables(() => dataItem.value, () => loopConfig);

  expect(readVariableValues(variableOptions.value)).toEqual(expect.arrayContaining(['item', 'item.name', 'index']));
});
```

- [ ] **Step 2: Run variable tests and verify failure**

Run: `pnpm test -- test/components/BWidget/use-element-variables.test.ts`

Expected: FAIL because `useElementVariables` has no loop config reader.

- [ ] **Step 3: Implement loop variable candidates**

Extend `useElementVariables(readDataItem, readLoopConfig?)`. When loop config is enabled and source points to an array schema, add local loop variables to the existing variable group:

- item root with children inferred from the array item schema.
- index variable with number semantics and label `索引`.

- [ ] **Step 4: Run variable tests**

Run: `pnpm test -- test/components/BWidget/use-element-variables.test.ts`

Expected: PASS.

- [ ] **Step 5: Inspect diff**

Run: `git diff -- src/components/BWidget/hooks/useElementVariables.ts test/components/BWidget/use-element-variables.test.ts`

Expected: Hook signature remains backward compatible.

---

### Task 6: Changelog and Full Verification

**Files:**
- Modify: `changelog/2026-07-03.md`

- [ ] **Step 1: Add changelog entry**

Add under `## Added`:

```md
- Widget 设置面板新增循环数据高级配置，运行态支持按 input/data 数组展开单元素或组合模板。
```

If `## Added` does not exist, create it under the date heading.

- [ ] **Step 2: Run focused test suite**

Run:

```bash
pnpm test -- \
  test/components/BWidget/widget-bindings.test.ts \
  test/components/BWidget/widget-loop.test.ts \
  test/components/BWidget/widget-runtime-view.component.test.ts \
  test/components/BWidget/use-element-variables.test.ts \
  test/views/widget/panel-settings.test.ts \
  test/views/widget/index.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run: `pnpm exec tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run lint on touched source**

Run: `pnpm exec eslint src/components/BWidget src/views/widget --ext .vue,.ts`

Expected: PASS or only pre-existing unrelated warnings. If ESLint reports auto-fixable errors, run `pnpm lint` and inspect the diff.

- [ ] **Step 5: Run stylelint on touched Vue files**

Run: `pnpm exec stylelint 'src/components/BWidget/**/*.vue' 'src/views/widget/**/*.vue'`

Expected: PASS.

- [ ] **Step 6: Final diff review**

Run: `git status --short` and `git diff --stat`.

Expected: Changes are limited to the plan/spec docs, Widget loop implementation, tests, and changelog. Do not run `git commit`.

