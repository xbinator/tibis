# Settings Private Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move settings-only layout components from global `src/components` into `src/views/settings/_components` with private names and private class prefixes.

**Architecture:** Keep component behavior and slots unchanged, but rename the public template tags to `SettingsPage` and `SettingsSection`. Settings pages import these components explicitly from `_components`, while Vite no longer auto-registers the old global `BSettingsPage` and `BSettingsSection` components.

**Tech Stack:** Vue 3 SFC, TypeScript, Less, Vitest, Vue Test Utils, Vite `unplugin-vue-components`.

---

### Task 1: Make Tests Expect Private Component Names

**Files:**
- Modify: `test/views/settings/basic/index.test.ts`
- Modify: `test/views/settings/tools/memory/index.test.ts`
- Modify: `test/views/settings/service-model/service-config.test.ts`

- [ ] **Step 1: Rename settings layout stubs in tests**

Change stubs named `BSettingsPage` and `BSettingsSection` to `SettingsPage` and `SettingsSection`.

Use this shape for page stubs:

```ts
/**
 * SettingsPage 测试替身。
 */
const SettingsPageStub = defineComponent({
  name: 'SettingsPage',
  template: '<main><slot /></main>'
});
```

Use this shape for section stubs:

```ts
/**
 * SettingsSection 测试替身。
 */
const SettingsSectionStub = defineComponent({
  name: 'SettingsSection',
  template: '<section><slot /></section>'
});
```

Register the stubs with the same new keys:

```ts
global: {
  stubs: {
    SettingsPage: SettingsPageStub,
    SettingsSection: SettingsSectionStub
  }
}
```

- [ ] **Step 2: Run targeted tests and confirm RED**

Run:

```bash
pnpm exec vitest run test/views/settings/basic/index.test.ts test/views/settings/tools/memory/index.test.ts test/views/settings/service-model/service-config.test.ts
```

Expected: at least one test fails because production templates still reference `BSettingsPage` or `BSettingsSection`.

### Task 2: Move Component Files and Rename Classes

**Files:**
- Create: `src/views/settings/_components/SettingsPage.vue`
- Create: `src/views/settings/_components/SettingsSection.vue`
- Delete: `src/components/BSettingsPage/index.vue`
- Delete: `src/components/BSettingsSection/index.vue`

- [ ] **Step 1: Create `SettingsPage.vue`**

Copy the existing page component structure, add a file header, set `defineOptions({ name: 'SettingsPage' })`, and change the namespace to:

```ts
const [, bem] = createNamespace('settings-page', '');
```

This makes the generated root class `settings-page`.

- [ ] **Step 2: Create `SettingsSection.vue`**

Copy the existing section component structure, add a file header, set `defineOptions({ name: 'SettingsSection' })`, and change the namespace to:

```ts
const [name, bem] = createNamespace('settings-section', '');
```

This makes the generated root class `settings-section`.

- [ ] **Step 3: Update Less selectors**

Replace page selectors:

```less
.b-settings-page {}
.b-settings-page__header {}
.b-settings-page__title {}
.b-settings-page__extra {}
.b-settings-page__body {}
```

with:

```less
.settings-page {}
.settings-page__header {}
.settings-page__title {}
.settings-page__extra {}
.settings-page__body {}
```

Replace section selectors:

```less
.b-settings-section {}
.b-settings-section__header {}
.b-settings-section__header-text {}
.b-settings-section__header-extra {}
```

with:

```less
.settings-section {}
.settings-section__header {}
.settings-section__header-text {}
.settings-section__header-extra {}
```

### Task 3: Update Settings Views

**Files:**
- Modify: `src/views/settings/basic/index.vue`
- Modify: `src/views/settings/service-model/index.vue`
- Modify: `src/views/settings/service-model/components/ServiceConfig.vue`
- Modify: `src/views/settings/speech/index.vue`
- Modify: `src/views/settings/logger/index.vue`
- Modify: `src/views/settings/tools/search/index.vue`
- Modify: `src/views/settings/tools/mcp/index.vue`
- Modify: `src/views/settings/tools/memory/index.vue`
- Modify: `src/views/settings/tools/skill/index.vue`
- Modify: `src/views/settings/tools/skill/detail.vue`

- [ ] **Step 1: Replace template tags**

Replace:

```vue
<BSettingsPage>
<BSettingsSection>
```

with:

```vue
<SettingsPage>
<SettingsSection>
```

Also update closing tags.

- [ ] **Step 2: Add local imports**

For files directly under `src/views/settings/<page>/index.vue`, import from:

```ts
import SettingsPage from '@/views/settings/_components/SettingsPage.vue';
import SettingsSection from '@/views/settings/_components/SettingsSection.vue';
```

For `src/views/settings/service-model/components/ServiceConfig.vue`, import only:

```ts
import SettingsSection from '@/views/settings/_components/SettingsSection.vue';
```

For `src/views/settings/tools/skill/detail.vue`, import only:

```ts
import SettingsPage from '@/views/settings/_components/SettingsPage.vue';
```

- [ ] **Step 3: Replace deep selectors**

Replace deep selectors that reference old classes:

```less
:deep(.b-settings-page__body)
:deep(.b-settings-section)
```

with:

```less
:deep(.settings-page__body)
:deep(.settings-section)
```

### Task 4: Remove Global Registration and Update Changelog

**Files:**
- Modify: `vite.config.ts`
- Modify: `types/components.d.ts`
- Modify: `changelog/2026-06-26.md`

- [ ] **Step 1: Remove global component dirs**

Delete these entries from `COMPONENT_DIRS`:

```ts
'BSettingsSection',
'BSettingsPage',
```

- [ ] **Step 2: Remove generated global declarations**

Delete the `BSettingsPage` and `BSettingsSection` declarations from both sections of `types/components.d.ts` so TypeScript no longer points at deleted files.

- [ ] **Step 3: Add changelog entry**

Add a `Changed` entry describing that settings layout components moved from global `BSettings*` components to private `Settings*` components under `src/views/settings/_components`.

### Task 5: Verify Migration

**Files:**
- Inspect all changed files.

- [ ] **Step 1: Search for stale component names**

Run:

```bash
rg "BSettingsPage|BSettingsSection|b-settings-page|b-settings-section" src test vite.config.ts
```

Expected: no matches in runtime source or tests.

- [ ] **Step 2: Run targeted settings tests**

Run:

```bash
pnpm exec vitest run test/views/settings/basic/index.test.ts test/views/settings/tools/memory/index.test.ts test/views/settings/service-model/service-config.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 3: Run static checks**

Run:

```bash
pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx
pnpm exec stylelint 'src/**/*.{vue,less,css}'
pnpm exec tsc --noEmit
```

Expected: checks pass, or failures are reported with exact output if they are caused by unrelated existing workspace changes.

### Task 6: Leave Work Uncommitted

**Files:**
- Inspect: `git status --short`

- [ ] **Step 1: Review diff**

Run:

```bash
git diff -- src/components/BSettingsPage src/components/BSettingsSection src/views/settings test/views/settings vite.config.ts types/components.d.ts changelog/2026-06-26.md docs/superpowers/plans/2026-06-26-settings-private-components.md
```

Expected: diff only contains the migration, plan, and changelog changes for this task.

- [ ] **Step 2: Do not commit**

Leave all implementation changes unstaged and uncommitted so the user can commit them together later.
