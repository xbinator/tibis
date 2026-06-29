# Widget Schema Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PageSetter schema JSON previews with an inline tree editor while keeping the JSON modal as an advanced editor.

**Architecture:** Rename the current Monaco schema modal to `SchemaInputEditor.vue`, create a new `SchemaTreeEditor.vue` for recursive schema rows, and wire it into `PageSetter.vue` with `v-model:schema`. Keep data changes scoped to `WidgetSchemaObject` and `WidgetSchemaProperty`.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Ant Design Vue stubs in Vitest, existing BButton/BIcon/BSelect components.

---

### Task 1: Add Failing PageSetter Tests

**Files:**
- Modify: `test/views/widget/page-setter.test.ts`

- [ ] **Step 1: Update stubs**

Add an `ACheckbox` stub that emits `update:checked`, and make the `BSelect`/`ASelect` path testable by using native `<select>` in the stub layer.

- [ ] **Step 2: Replace preview assertion**

Change the existing schema preview test to assert `.schema-editor` rows are rendered and `.schema-preview` no longer exists.

- [ ] **Step 3: Add inline edit test**

Add a test that edits the first input schema field name, toggles required, changes a field type to object, adds a child field, and deletes that child field.

- [ ] **Step 4: Run the focused test**

Run: `pnpm exec vitest run test/views/widget/page-setter.test.ts`

Expected before implementation: FAIL because `.schema-editor` does not exist and inline actions are missing.

### Task 2: Split JSON Modal and Create Tree Editor

**Files:**
- Move: current Monaco schema modal implementation to `src/views/widget/components/PageSetter/SchemaInputEditor.vue`
- Create: `src/views/widget/components/PageSetter/SchemaTreeEditor.vue`
- Modify: `src/views/widget/components/PageSetter.vue`

- [ ] **Step 1: Rename JSON modal**

Move the current Monaco modal implementation into `SchemaInputEditor.vue` and update its file header.

- [ ] **Step 2: Build recursive schema tree editor**

Create `SchemaTreeEditor.vue` with `schema` model, row rendering, typed mutation helpers, unique field names, required synchronization, object child editing, array item defaults, and scoped styles.

- [ ] **Step 3: Wire PageSetter**

Replace each `<pre class="schema-preview">` with `<SchemaTreeEditor v-model:schema="inputSchema" />` and `<SchemaTreeEditor v-model:schema="outputSchema" />`. Import `SchemaInputEditor` for the JSON modal.

- [ ] **Step 4: Run focused test**

Run: `pnpm exec vitest run test/views/widget/page-setter.test.ts`

Expected after implementation: PASS for PageSetter tests.

### Task 3: Verification and Changelog

**Files:**
- Modify: `changelog/2026-06-29.md`

- [ ] **Step 1: Add changelog entry**

Add a `Changed` entry describing the PageSetter schema preview to inline tree editor refactor.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm exec vitest run test/views/widget/page-setter.test.ts
pnpm exec tsc --noEmit
pnpm lint
pnpm lint:style
```

Expected: Commands complete successfully. If an existing unrelated repository issue appears, report it with the exact failing command and message.

- [ ] **Step 3: Skip commit**

Do not run `git add` or `git commit`; the user will submit the final code.
