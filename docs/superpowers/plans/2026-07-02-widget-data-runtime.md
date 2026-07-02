# Widget Data Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Widget runtime public model from state to Vue-style data, including `Widget({ data })`, direct `this.message` reads/writes, bound `this.sendText()` methods, direct template bindings such as `{{ message }}`, `renderContext.data`, and `dataSchema`.

**Architecture:** Keep the current runtime/editor split. Update protocol types first through tests, then migrate the sandbox adapter and schema inference utility, and finally align bindings, examples, fixtures, and docs. No old `state` aliases or migration fallback are kept.

**Tech Stack:** Vue 3, TypeScript, Vitest, Monaco extra libs, lodash-es, existing sandbox runtime utilities.

---

### Task 1: Runtime Data API

**Files:**
- Modify: `test/components/BChat/widget-runtime.test.ts`
- Modify: `src/components/BChat/utils/widgetRuntime.ts`

- [ ] **Step 1: Write failing runtime tests**

Add tests that use `Widget({ data: { weather: { temperature: 18 } } })`, read `this.weather.temperature`, update with `this.weather.temperature = 28`, and expect returned parts to write `renderContext.data`.

- [ ] **Step 2: Verify runtime tests fail**

Run: `pnpm test test/components/BChat/widget-runtime.test.ts`
Expected: FAIL because `renderContext.data` and direct Widget `this` data fields do not exist yet.

- [ ] **Step 3: Implement runtime data execution**

Rename payload/result internals in `src/components/BChat/utils/widgetRuntime.ts` from state to data. In the generated adapter, replace `__widgetState` with `__widgetData`, expose data keys directly on the Widget `this` context, bind `methods` onto `this`, initialize from `Widget({ data })`, and return `{ data, dataChanged, sendMessage }`.

- [ ] **Step 4: Verify runtime tests pass**

Run: `pnpm test test/components/BChat/widget-runtime.test.ts`
Expected: PASS.

### Task 2: Types And Protocol Fields

**Files:**
- Modify: `types/widget.d.ts`
- Modify: `types/chat.d.ts`
- Modify: `src/components/BChat/components/MessageBubble/BubblePartWidget.vue`
- Modify: `src/components/BChat/utils/messageHelper.ts`

- [ ] **Step 1: Update type-driven tests**

Update Widget fixtures in BChat tests so message parts carry `renderContext.data` and Widget contracts carry `dataSchema`.

- [ ] **Step 2: Verify type-related tests fail**

Run: `pnpm test test/components/BChat/message-helper-widget.test.ts test/components/BChat/bubble-part-widget.component.test.ts`
Expected: FAIL until protocol fields are renamed.

- [ ] **Step 3: Rename protocol fields**

Replace `WidgetRenderContext.state` with `WidgetRenderContext.data`, `WidgetContract.stateSchema` with `WidgetContract.dataSchema`, and update BChat widget finish/init code to read and emit the new fields.

- [ ] **Step 4: Verify type-related tests pass**

Run: `pnpm test test/components/BChat/message-helper-widget.test.ts test/components/BChat/bubble-part-widget.component.test.ts`
Expected: PASS.

### Task 3: Editor Types And Data Schema Inference

**Files:**
- Modify: `test/components/BWidget/widget-data-schema.test.ts`
- Modify: `test/views/widget/code-editor.test.ts`
- Modify: `src/components/BWidget/utils/widgetStateSchema.ts`
- Modify: `src/views/widget/constants/methodScriptExtraLib.ts`
- Modify: `src/views/widget/components/CodeEditor.vue`

- [ ] **Step 1: Write failing schema/editor tests**

Update tests to expect `WidgetData`, direct `this` data fields, bound `this` methods, and schema inference from both `Widget({ data: { ... } })` and direct `this.xxx = ...` assignments.

- [ ] **Step 2: Verify schema/editor tests fail**

Run: `pnpm test test/components/BWidget/widget-data-schema.test.ts test/views/widget/code-editor.test.ts`
Expected: FAIL while the inference utility and Monaco declarations still use state names.

- [ ] **Step 3: Implement data schema inference**

Update the inference utility to build data schema from `Widget({ data })` object literals and direct `this.xxx = ...` assignments. Rename the public builder and all local concepts from state schema to data schema where touched.

- [ ] **Step 4: Implement editor declarations**

Update Monaco extra libs to declare `WidgetData`, direct data fields on `this`, bound `methods`, and `WidgetConfig.data`; update `CodeEditor.vue` to use data schema naming.

- [ ] **Step 5: Verify schema/editor tests pass**

Run: `pnpm test test/components/BWidget/widget-data-schema.test.ts test/views/widget/code-editor.test.ts`
Expected: PASS.

### Task 4: Bindings, Variables, Defaults, And Examples

**Files:**
- Modify: `src/components/BWidget/utils/widgetBindings.ts`
- Modify: `src/components/BWidget/hooks/useElementVariables.ts`
- Modify: `src/components/BWidget/utils/widgetData.ts`
- Modify: `src/views/widget/components/PageSetter.vue`
- Modify: `src/views/widget/components/PageSetter/SchemaHelp.vue`
- Modify: `src/views/widget/constants/pageSetter.ts`
- Modify: Widget-related tests under `test/components/BWidget`, `test/views/widget`, and `test/components/BChat`

- [ ] **Step 1: Update failing binding/variable tests**

Change expected roots and sample content from `state` to direct data fields, including `{{ weather.temperature }}`.

- [ ] **Step 2: Verify binding/variable tests fail**

Run: `pnpm test test/components/BWidget/widget-bindings.test.ts test/components/BWidget/use-element-variables.test.ts test/components/BWidget/text-element-view.component.test.ts test/components/BWidget/text-setter.component.test.ts`
Expected: FAIL until binding roots and defaults are renamed.

- [ ] **Step 3: Implement binding and default updates**

Keep `input` as an explicit binding root, expose data fields directly in template bindings, change the default Widget data schema to `dataSchema`, and update default code/docs examples to use `Widget({ data })`, direct `this` data fields, and bound `methods`.

- [ ] **Step 4: Verify binding/variable tests pass**

Run: `pnpm test test/components/BWidget/widget-bindings.test.ts test/components/BWidget/use-element-variables.test.ts test/components/BWidget/text-element-view.component.test.ts test/components/BWidget/text-setter.component.test.ts`
Expected: PASS.

### Task 5: Repo-Wide Cleanup And Verification

**Files:**
- Modify: `changelog/2026-07-02.md`
- Modify: any remaining Widget-specific references found by `rg "\$state|\$setState|stateSchema|renderContext\.state|\{\{ state"`

- [ ] **Step 1: Add changelog entry**

Record the Widget runtime API migration under `Changed`.

- [ ] **Step 2: Search for removed public API names**

Run: `rg "\$state|\$setState|stateSchema|renderContext\.state|\{\{ state" src test types docs`
Expected: no remaining Widget public API references, except historical wording in the approved spec if intentionally left.

- [ ] **Step 3: Run focused tests**

Run: `pnpm test test/components/BChat/widget-runtime.test.ts test/components/BWidget/widget-data-schema.test.ts test/views/widget/code-editor.test.ts test/components/BWidget/widget-bindings.test.ts test/components/BWidget/use-element-variables.test.ts`
Expected: PASS.

- [ ] **Step 4: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
