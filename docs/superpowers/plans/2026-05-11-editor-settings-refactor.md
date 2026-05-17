# Editor Settings Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract editor-specific preferences into a dedicated store, add a new settings page for editor view/save behavior, and implement real disk save strategies for `manual`, `onBlur`, and `onChange` without breaking draft persistence or file watching.

**Architecture:** Introduce `src/stores/editorPreferences.ts` as the single source of truth for editor view mode, outline visibility, page width, and save strategy. Keep `useAutoSave` focused on draft persistence, while `useSession` owns a new `useSavePolicy` execution layer plus a non-interactive `saveCurrentFileToDisk()` path that coordinates dirty state and watcher behavior. Wire the new preferences into menus, editor runtime, and `/settings/editor`.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vue Router, Vitest, Vue Test Utils, Electron/native bridge.

---

### Task 1: Add `editorPreferences` store with migration from `settingStore`

**Files:**
- Create: `src/stores/editorPreferences.ts`
- Test: `test/stores/editorPreferences.test.ts`
- Reference: `src/stores/setting.ts`

- [ ] **Step 1: Write the failing store tests**

Create `test/stores/editorPreferences.test.ts` with these cases:

```ts
/**
 * @file editorPreferences.test.ts
 * @description 验证编辑器偏好 store 的持久化与旧设置迁移。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EDITOR_PREFERENCES_STORAGE_KEY = 'editor_preferences';
const SETTINGS_STORAGE_KEY = 'app_settings';
const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

vi.mock('@/shared/platform', () => ({
  native: {
    updateMenuItem: vi.fn()
  }
}));

describe('useEditorPreferencesStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('persists editor preferences into dedicated storage', async () => {
    const { useEditorPreferencesStore } = await import('@/stores/editorPreferences');
    const store = useEditorPreferencesStore();

    store.setViewMode('source');
    store.setShowOutline(false);
    store.setPageWidth('full');
    store.setSaveStrategy('onChange');

    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"viewMode":"source"');
    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"showOutline":false');
    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"pageWidth":"full"');
    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"saveStrategy":"onChange"');
  });

  it('migrates legacy editor settings from app_settings when dedicated storage is missing', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(SETTINGS_STORAGE_KEY, {
      chatSidebarActiveSessionId: null,
      providerSidebarCollapsed: false,
      settingsSidebarCollapsed: false,
      theme: 'system',
      showOutline: false,
      sourceMode: true,
      editorPageWidth: 'wide',
      sidebarVisible: false,
      sidebarWidth: 340,
      toolPermissionMode: 'ask',
      alwaysToolPermissionGrants: {}
    });

    const { useEditorPreferencesStore } = await import('@/stores/editorPreferences');
    const store = useEditorPreferencesStore();

    expect(store.viewMode).toBe('source');
    expect(store.showOutline).toBe(false);
    expect(store.pageWidth).toBe('wide');
    expect(store.saveStrategy).toBe('manual');
    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"pageWidth":"wide"');
  });

  it('falls back to defaults when persisted values are invalid', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(EDITOR_PREFERENCES_STORAGE_KEY, {
      viewMode: 'preview',
      showOutline: 'yes',
      pageWidth: 'giant',
      saveStrategy: 'always'
    });

    const { useEditorPreferencesStore } = await import('@/stores/editorPreferences');
    const store = useEditorPreferencesStore();

    expect(store.viewMode).toBe('rich');
    expect(store.showOutline).toBe(true);
    expect(store.pageWidth).toBe('default');
    expect(store.saveStrategy).toBe('manual');
  });
});
```

- [ ] **Step 2: Run the store test file to confirm failure**

Run:

```bash
pnpm test -- test/stores/editorPreferences.test.ts
```

Expected: `FAIL` because `src/stores/editorPreferences.ts` does not exist yet.

- [ ] **Step 3: Implement `src/stores/editorPreferences.ts`**

Create `src/stores/editorPreferences.ts` with this structure:

```ts
/**
 * @file editorPreferences.ts
 * @description 编辑器偏好 Store，负责管理视图模式、大纲、页宽和保存策略。
 */
import { defineStore } from 'pinia';
import { native } from '@/shared/platform';
import { local } from '@/shared/storage/base';

export type EditorViewMode = 'rich' | 'source';
export type EditorPageWidth = 'default' | 'wide' | 'full';
export type EditorSaveStrategy = 'manual' | 'onBlur' | 'onChange';

const EDITOR_PREFERENCES_STORAGE_KEY = 'editor_preferences';
const LEGACY_SETTINGS_STORAGE_KEY = 'app_settings';

interface PersistedEditorPreferences {
  viewMode: EditorViewMode;
  showOutline: boolean;
  pageWidth: EditorPageWidth;
  saveStrategy: EditorSaveStrategy;
}

interface LegacySettingsSnapshot {
  showOutline?: unknown;
  sourceMode?: unknown;
  editorPageWidth?: unknown;
}

const DEFAULT_EDITOR_PREFERENCES: PersistedEditorPreferences = {
  viewMode: 'rich',
  showOutline: true,
  pageWidth: 'default',
  saveStrategy: 'manual'
};

function isEditorViewMode(value: unknown): value is EditorViewMode {
  return value === 'rich' || value === 'source';
}

function isEditorPageWidth(value: unknown): value is EditorPageWidth {
  return value === 'default' || value === 'wide' || value === 'full';
}

function isEditorSaveStrategy(value: unknown): value is EditorSaveStrategy {
  return value === 'manual' || value === 'onBlur' || value === 'onChange';
}

function normalizeEditorPreferences(value: unknown): PersistedEditorPreferences {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<PersistedEditorPreferences>) : {};

  return {
    viewMode: isEditorViewMode(source.viewMode) ? source.viewMode : DEFAULT_EDITOR_PREFERENCES.viewMode,
    showOutline: typeof source.showOutline === 'boolean' ? source.showOutline : DEFAULT_EDITOR_PREFERENCES.showOutline,
    pageWidth: isEditorPageWidth(source.pageWidth) ? source.pageWidth : DEFAULT_EDITOR_PREFERENCES.pageWidth,
    saveStrategy: isEditorSaveStrategy(source.saveStrategy) ? source.saveStrategy : DEFAULT_EDITOR_PREFERENCES.saveStrategy
  };
}

function loadLegacyEditorPreferences(): PersistedEditorPreferences {
  const legacySettings = local.getItem<LegacySettingsSnapshot>(LEGACY_SETTINGS_STORAGE_KEY);

  return normalizeEditorPreferences({
    viewMode: legacySettings?.sourceMode === true ? 'source' : 'rich',
    showOutline: legacySettings?.showOutline,
    pageWidth: legacySettings?.editorPageWidth,
    saveStrategy: 'manual'
  });
}

function loadPersistedEditorPreferences(): PersistedEditorPreferences {
  const saved = local.getItem<PersistedEditorPreferences>(EDITOR_PREFERENCES_STORAGE_KEY);
  if (saved) {
    const normalized = normalizeEditorPreferences(saved);
    local.setItem(EDITOR_PREFERENCES_STORAGE_KEY, normalized);
    return normalized;
  }

  const migrated = loadLegacyEditorPreferences();
  local.setItem(EDITOR_PREFERENCES_STORAGE_KEY, migrated);
  return migrated;
}

function persistEditorPreferences(preferences: PersistedEditorPreferences): void {
  local.setItem(EDITOR_PREFERENCES_STORAGE_KEY, preferences);
}

export const useEditorPreferencesStore = defineStore('editorPreferences', {
  state: (): PersistedEditorPreferences => ({
    ...loadPersistedEditorPreferences()
  }),
  actions: {
    syncNativeMenuState(): void {
      native.updateMenuItem?.('view:source', { checked: this.viewMode === 'source' });
      native.updateMenuItem?.('view:outline', { checked: this.showOutline });
      native.updateMenuItem?.('view:pageWidth:default', { checked: this.pageWidth === 'default' });
      native.updateMenuItem?.('view:pageWidth:wide', { checked: this.pageWidth === 'wide' });
      native.updateMenuItem?.('view:pageWidth:full', { checked: this.pageWidth === 'full' });
    },
    setViewMode(mode: EditorViewMode): void {
      this.viewMode = mode;
      persistEditorPreferences({
        viewMode: this.viewMode,
        showOutline: this.showOutline,
        pageWidth: this.pageWidth,
        saveStrategy: this.saveStrategy
      });
      this.syncNativeMenuState();
    },
    setShowOutline(show: boolean): void {
      this.showOutline = show;
      persistEditorPreferences({
        viewMode: this.viewMode,
        showOutline: this.showOutline,
        pageWidth: this.pageWidth,
        saveStrategy: this.saveStrategy
      });
      this.syncNativeMenuState();
    },
    setPageWidth(width: EditorPageWidth): void {
      this.pageWidth = width;
      persistEditorPreferences({
        viewMode: this.viewMode,
        showOutline: this.showOutline,
        pageWidth: this.pageWidth,
        saveStrategy: this.saveStrategy
      });
      this.syncNativeMenuState();
    },
    setSaveStrategy(strategy: EditorSaveStrategy): void {
      this.saveStrategy = strategy;
      persistEditorPreferences({
        viewMode: this.viewMode,
        showOutline: this.showOutline,
        pageWidth: this.pageWidth,
        saveStrategy: this.saveStrategy
      });
    }
  }
});
```

- [ ] **Step 4: Re-run the store test file**

Run:

```bash
pnpm test -- test/stores/editorPreferences.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit the store task**

Run:

```bash
git add src/stores/editorPreferences.ts test/stores/editorPreferences.test.ts
git commit -m "feat: add editor preferences store"
```

---

### Task 2: Rewire editor view settings and menu actions to `editorPreferences`

**Files:**
- Modify: `src/views/editor/index.vue`
- Modify: `src/components/BMarkdown/index.vue`
- Modify: `src/hooks/useMenuAction.ts`
- Modify: `src/stores/setting.ts`
- Modify: `test/hooks/useMenuAction.test.ts`
- Modify: `test/components/BMarkdown/index.page-width.test.ts`
- Modify: `test/stores/setting.test.ts`

- [ ] **Step 1: Write the failing integration tests for the new store wiring**

Append these cases:

In `test/hooks/useMenuAction.test.ts`:

```ts
it('maps source and outline menu actions to editor preferences updates', async () => {
  const { useEditorPreferencesStore } = await import('@/stores/editorPreferences');
  mount(HookHarness);

  const store = useEditorPreferencesStore();

  menuCallbacks[0]?.('view:source');
  expect(store.viewMode).toBe('source');

  menuCallbacks[0]?.('view:outline');
  expect(store.showOutline).toBe(false);
});
```

In `test/components/BMarkdown/index.page-width.test.ts`, replace `useSettingStore()` with `useEditorPreferencesStore()` and add:

```ts
it('uses source mode and outline visibility from editor preferences', async () => {
  const { useEditorPreferencesStore } = await import('@/stores/editorPreferences');
  const store = useEditorPreferencesStore();
  store.setViewMode('source');
  store.setShowOutline(false);

  const wrapper = mountEditor();

  expect(wrapper.findComponent({ name: 'PaneSourceEditor' }).exists()).toBe(true);
  expect(wrapper.props('showOutline')).toBe(false);
});
```

In `test/stores/setting.test.ts`, add:

```ts
it('does not persist editor-specific fields into app settings anymore', async () => {
  const { useSettingStore } = await import('@/stores/setting');
  const settingStore = useSettingStore();

  settingStore.setChatSidebarActiveSessionId('session-42');

  const persisted = localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '';

  expect(persisted).not.toContain('sourceMode');
  expect(persisted).not.toContain('showOutline');
  expect(persisted).not.toContain('editorPageWidth');
});
```

- [ ] **Step 2: Run the affected tests to confirm failure**

Run:

```bash
pnpm test -- test/hooks/useMenuAction.test.ts test/components/BMarkdown/index.page-width.test.ts test/stores/setting.test.ts
```

Expected: `FAIL` because runtime code still reads from `settingStore`.

- [ ] **Step 3: Update runtime wiring and slim down `settingStore`**

Make these changes:

In `src/views/editor/index.vue`:

```ts
import { useEditorPreferencesStore } from '@/stores/editorPreferences';

const editorPreferencesStore = useEditorPreferencesStore();
```

and in the template:

```vue
<BMarkdown
  ref="editorRef"
  :key="fileState.id"
  v-model:value="fileState"
  :view-mode="editorPreferencesStore.viewMode"
  :show-outline="editorPreferencesStore.showOutline"
  @rename-file="actions.onRename"
  @save="actions.onSave"
  @save-as="actions.onSaveAs"
  @copy-path="actions.onCopyPath"
  @copy-relative-path="actions.onCopyRelativePath"
  @show-in-folder="actions.onShowInFolder"
/>
```

In `src/components/BMarkdown/index.vue`, replace page-width store consumption with:

```ts
import { useEditorPreferencesStore } from '@/stores/editorPreferences';

const editorPreferencesStore = useEditorPreferencesStore();

const editorPageMaxWidth = computed<string>(() => {
  switch (editorPreferencesStore.pageWidth) {
    case 'wide':
      return '1200px';
    case 'full':
      return 'none';
    default:
      return '900px';
  }
});
```

In `src/hooks/useMenuAction.ts`, map menu actions to the new store:

```ts
import { useEditorPreferencesStore } from '@/stores/editorPreferences';

const editorPreferencesStore = useEditorPreferencesStore();

case 'view:source':
  editorPreferencesStore.setViewMode(editorPreferencesStore.viewMode === 'source' ? 'rich' : 'source');
  break;
case 'view:outline':
  editorPreferencesStore.setShowOutline(!editorPreferencesStore.showOutline);
  break;
case 'view:pageWidth:default':
  editorPreferencesStore.setPageWidth('default');
  break;
case 'view:pageWidth:wide':
  editorPreferencesStore.setPageWidth('wide');
  break;
case 'view:pageWidth:full':
  editorPreferencesStore.setPageWidth('full');
  break;
```

In `src/stores/setting.ts`, remove these fields and code paths:

```ts
- showOutline: boolean;
- sourceMode: boolean;
- editorPageWidth: EditorPageWidth;
```

Also remove:

```ts
- LEGACY_OUTLINE_STORAGE_KEY
- LEGACY_SOURCE_MODE_STORAGE_KEY
- isEditorPageWidth()
- setShowOutline()
- toggleOutline()
- setSourceMode()
- toggleSourceMode()
- setEditorPageWidth()
- view:* menu sync lines for source/outline/pageWidth
```

Keep unrelated global settings intact.

- [ ] **Step 4: Re-run the affected tests**

Run:

```bash
pnpm test -- test/stores/editorPreferences.test.ts test/hooks/useMenuAction.test.ts test/components/BMarkdown/index.page-width.test.ts test/stores/setting.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit the wiring task**

Run:

```bash
git add src/views/editor/index.vue src/components/BMarkdown/index.vue src/hooks/useMenuAction.ts src/stores/setting.ts test/hooks/useMenuAction.test.ts test/components/BMarkdown/index.page-width.test.ts test/stores/setting.test.ts
git commit -m "refactor: move editor view settings into editor preferences"
```

---

### Task 3: Add `editor-blur` event with internal focus filtering in `BMarkdown`

**Files:**
- Modify: `src/components/BMarkdown/index.vue`
- Modify: `src/components/BMarkdown/components/PaneRichEditor.vue`
- Modify: `src/components/BMarkdown/components/PaneSourceEditor.vue`
- Create: `test/components/BMarkdown/index.editor-blur.test.ts`

- [ ] **Step 1: Write the failing blur-filter tests**

Create `test/components/BMarkdown/index.editor-blur.test.ts`:

```ts
/**
 * @file index.editor-blur.test.ts
 * @description 验证 BMarkdown 仅在焦点真正离开编辑器时抛出 editor-blur。
 */
/* @vitest-environment jsdom */

import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BMarkdown from '@/components/BMarkdown/index.vue';

const PaneRichEditorStub = defineComponent({
  name: 'PaneRichEditor',
  emits: ['editor-blur'],
  template: '<button class="rich-editor" @blur="$emit(\'editor-blur\', $event)">rich</button>'
});

describe('BMarkdown editor-blur', () => {
  it('re-emits editor-blur when focus leaves the whole editor', async () => {
    const wrapper = mount(BMarkdown, {
      props: {
        value: { id: 'doc', name: 'Doc', content: 'content', ext: 'md', path: '/tmp/doc.md' },
        viewMode: 'rich',
        showOutline: true
      },
      attachTo: document.body,
      global: {
        stubs: {
          PaneRichEditor: PaneRichEditorStub,
          PaneSourceEditor: true,
          BMarkdownSidebar: true,
          BScrollbar: { template: '<div><slot /></div>' }
        }
      }
    });

    const outside = document.createElement('button');
    document.body.appendChild(outside);

    await wrapper.get('.rich-editor').trigger('blur', { relatedTarget: outside });

    expect(wrapper.emitted('editor-blur')).toHaveLength(1);
  });

  it('does not emit editor-blur when focus moves inside the editor container', async () => {
    const wrapper = mount(BMarkdown, {
      props: {
        value: { id: 'doc', name: 'Doc', content: 'content', ext: 'md', path: '/tmp/doc.md' },
        viewMode: 'rich',
        showOutline: true
      },
      attachTo: document.body,
      global: {
        stubs: {
          PaneRichEditor: PaneRichEditorStub,
          PaneSourceEditor: true,
          BMarkdownSidebar: true,
          BScrollbar: { template: '<div><slot /></div>' }
        }
      }
    });

    const inside = document.createElement('button');
    inside.className = 'editor-toolbar-button';
    wrapper.element.appendChild(inside);

    await wrapper.get('.rich-editor').trigger('blur', { relatedTarget: inside });

    expect(wrapper.emitted('editor-blur')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the blur test to confirm failure**

Run:

```bash
pnpm test -- test/components/BMarkdown/index.editor-blur.test.ts
```

Expected: `FAIL` because `BMarkdown` does not emit `editor-blur` yet.

- [ ] **Step 3: Implement filtered `editor-blur` forwarding**

In `src/components/BMarkdown/components/PaneRichEditor.vue` and `src/components/BMarkdown/components/PaneSourceEditor.vue`, add:

```ts
const emit = defineEmits<{
  (e: 'editor-blur', event: FocusEvent): void;
  // existing emits...
}>();
```

and forward the editable root blur:

```vue
<EditorContent class="pane-rich-editor" @blur="emit('editor-blur', $event)" />
```

In `src/components/BMarkdown/index.vue`, add:

```ts
const rootRef = ref<HTMLElement | null>(null);

function handleEditorBlur(event: FocusEvent): void {
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && rootRef.value?.contains(nextTarget)) {
    return;
  }

  emit('editor-blur', event);
}
```

and wire it:

```vue
<div ref="rootRef" class="b-markdown">
  <PaneRichEditor
    v-if="viewMode === 'rich'"
    v-model:value="value"
    v-model:outline-content="outlineContent"
    @editor-blur="handleEditorBlur"
  />
</div>
```

- [ ] **Step 4: Re-run the blur test**

Run:

```bash
pnpm test -- test/components/BMarkdown/index.editor-blur.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit the blur event task**

Run:

```bash
git add src/components/BMarkdown/index.vue src/components/BMarkdown/components/PaneRichEditor.vue src/components/BMarkdown/components/PaneSourceEditor.vue test/components/BMarkdown/index.editor-blur.test.ts
git commit -m "feat: expose filtered editor blur event"
```

---

### Task 4: Add `useSavePolicy` and non-interactive disk-save path in `useSession`

**Files:**
- Create: `src/views/editor/hooks/useSavePolicy.ts`
- Modify: `src/views/editor/hooks/useSession.ts`
- Modify: `src/views/editor/index.vue`
- Create: `test/views/editor/useSavePolicy.test.ts`
- Modify: `test/views/editor/useSessionFileDeleted.test.ts`
- Modify: `test/views/editor/useFileWatcher.test.ts`

- [ ] **Step 1: Write the failing save-policy tests**

Create `test/views/editor/useSavePolicy.test.ts`:

```ts
/**
 * @file useSavePolicy.test.ts
 * @description 验证编辑器真实写盘保存策略。
 */
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavePolicy } from '@/views/editor/hooks/useSavePolicy';

describe('useSavePolicy', () => {
  const saveCurrentFileToDisk = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    saveCurrentFileToDisk.mockReset();
    saveCurrentFileToDisk.mockResolvedValue({ status: 'saved' });
  });

  it('does not autosave pathless files in onChange mode', async () => {
    const policy = useSavePolicy({
      saveStrategy: ref('onChange'),
      hasFilePath: ref(false),
      isDirty: () => true,
      saveCurrentFileToDisk
    });

    policy.notifyContentChanged();
    vi.advanceTimersByTime(800);

    expect(saveCurrentFileToDisk).not.toHaveBeenCalled();
  });

  it('saves dirty files after debounce in onChange mode', async () => {
    const policy = useSavePolicy({
      saveStrategy: ref('onChange'),
      hasFilePath: ref(true),
      isDirty: () => true,
      saveCurrentFileToDisk
    });

    policy.notifyContentChanged();
    vi.advanceTimersByTime(800);
    await Promise.resolve();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(1);
  });

  it('saves dirty files on blur in onBlur mode', async () => {
    const policy = useSavePolicy({
      saveStrategy: ref('onBlur'),
      hasFilePath: ref(true),
      isDirty: () => true,
      saveCurrentFileToDisk
    });

    await policy.handleEditorBlur();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(1);
  });

  it('queues one more save when a change happens while saving', async () => {
    let resolveFirstSave: ((value: { status: "saved" }) => void) | null = null;
    saveCurrentFileToDisk.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirstSave = resolve;
    }));

    const policy = useSavePolicy({
      saveStrategy: ref('onChange'),
      hasFilePath: ref(true),
      isDirty: () => true,
      saveCurrentFileToDisk
    });

    policy.notifyContentChanged();
    vi.advanceTimersByTime(800);
    policy.notifyContentChanged();
    vi.advanceTimersByTime(800);

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(1);

    resolveFirstSave?.({ status: 'saved' });
    await Promise.resolve();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the save-policy tests to confirm failure**

Run:

```bash
pnpm test -- test/views/editor/useSavePolicy.test.ts
```

Expected: `FAIL` because `useSavePolicy.ts` does not exist yet.

- [ ] **Step 3: Implement `useSavePolicy.ts`**

Create `src/views/editor/hooks/useSavePolicy.ts`:

```ts
/**
 * @file useSavePolicy.ts
 * @description 根据编辑器偏好执行真实磁盘保存策略。
 */
import type { Ref } from 'vue';
import { onUnmounted, ref } from 'vue';

export interface SaveToDiskResult {
  status: 'saved' | 'skipped' | 'failed';
  error?: Error;
}

export interface SavePolicyOptions {
  saveStrategy: Ref<'manual' | 'onBlur' | 'onChange'>;
  hasFilePath: Ref<boolean>;
  isDirty: () => boolean;
  saveCurrentFileToDisk: () => Promise<SaveToDiskResult>;
}

const ON_CHANGE_DELAY = 800;

export function useSavePolicy(options: SavePolicyOptions) {
  const isSaving = ref(false);
  const pendingResave = ref(false);
  const lastAutoSaveError = ref<Error | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function runSave(): Promise<void> {
    if (!options.hasFilePath.value || !options.isDirty()) {
      return;
    }

    if (isSaving.value) {
      pendingResave.value = true;
      return;
    }

    isSaving.value = true;
    const result = await options.saveCurrentFileToDisk();
    isSaving.value = false;

    if (result.status === 'failed') {
      lastAutoSaveError.value = result.error ?? new Error('auto save failed');
    }

    if (pendingResave.value) {
      pendingResave.value = false;
      await runSave();
    }
  }

  function notifyContentChanged(): void {
    if (options.saveStrategy.value !== 'onChange' || !options.hasFilePath.value) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      void runSave();
    }, ON_CHANGE_DELAY);
  }

  async function handleEditorBlur(): Promise<void> {
    if (options.saveStrategy.value !== 'onBlur') {
      return;
    }

    await runSave();
  }

  function dispose(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  onUnmounted(dispose);

  return {
    dispose,
    handleEditorBlur,
    isSaving,
    lastAutoSaveError,
    notifyContentChanged,
    pendingResave
  };
}
```

- [ ] **Step 4: Extract `saveCurrentFileToDisk()` and wire `useSavePolicy` into `useSession`**

Update `src/views/editor/hooks/useSession.ts` with:

```ts
import { useEditorPreferencesStore } from '@/stores/editorPreferences';
import { useSavePolicy, type SaveToDiskResult } from './useSavePolicy';

const editorPreferencesStore = useEditorPreferencesStore();

async function saveCurrentFileToDisk(): Promise<SaveToDiskResult> {
  if (!fileState.value.path) {
    return { status: 'skipped' };
  }

  try {
    await native.writeFile(fileState.value.path, fileState.value.content);
    await fileStateActions.markCurrentContentSaved();
    tabsStore.clearMissing(fileId.value);
    return { status: 'saved' };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error : new Error('save to disk failed')
    };
  }
}

const savePolicy = useSavePolicy({
  saveStrategy: computed(() => editorPreferencesStore.saveStrategy),
  hasFilePath: computed(() => Boolean(fileState.value.path)),
  isDirty: () => tabsStore.isDirty(fileId.value),
  saveCurrentFileToDisk
});

watch(
  () => fileState.value.content,
  () => {
    savePolicy.notifyContentChanged();
  }
);
```

Then update `onSave()` to reuse the extracted path:

```ts
async function onSave() {
  await fileStateActions.ensureStoredFile();

  if (tabsStore.isMissing(fileId.value)) {
    await saveMissingFile();
    return;
  }

  if (fileState.value.path) {
    await saveCurrentFileToDisk();
    return;
  }

  await saveWithDialog();
}
```

Expose blur handling from `useSession`:

```ts
const actions = {
  onEditorBlur: savePolicy.handleEditorBlur,
  onSave,
  onSaveAs,
  // existing actions...
};
```

Update `src/views/editor/index.vue`:

```vue
<BMarkdown
  ref="editorRef"
  :key="fileState.id"
  v-model:value="fileState"
  :view-mode="editorPreferencesStore.viewMode"
  :show-outline="editorPreferencesStore.showOutline"
  @editor-blur="actions.onEditorBlur"
  @rename-file="actions.onRename"
  @save="actions.onSave"
  @save-as="actions.onSaveAs"
/>
```

- [ ] **Step 5: Re-run the save-policy and editor session tests**

Run:

```bash
pnpm test -- test/views/editor/useSavePolicy.test.ts test/views/editor/useSessionFileDeleted.test.ts test/views/editor/useFileWatcher.test.ts
```

Expected: `PASS`.

- [ ] **Step 6: Commit the save-policy task**

Run:

```bash
git add src/views/editor/hooks/useSavePolicy.ts src/views/editor/hooks/useSession.ts src/views/editor/index.vue test/views/editor/useSavePolicy.test.ts test/views/editor/useSessionFileDeleted.test.ts test/views/editor/useFileWatcher.test.ts
git commit -m "feat: add editor disk save policies"
```

---

### Task 5: Add `/settings/editor` page and editor settings navigation

**Files:**
- Modify: `src/views/settings/constants.ts`
- Modify: `src/router/routes/modules/settings.ts`
- Create: `src/views/settings/editor/index.vue`
- Create: `test/views/settings/editor/index.test.ts`

- [ ] **Step 1: Write the failing settings-page test**

Create `test/views/settings/editor/index.test.ts`:

```ts
/**
 * @file index.test.ts
 * @description 验证编辑器设置页可读写视图与保存策略。
 */
/* @vitest-environment jsdom */

import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import EditorSettingsView from '@/views/settings/editor/index.vue';
import { useEditorPreferencesStore } from '@/stores/editorPreferences';

describe('EditorSettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders current editor preferences and updates the save strategy', async () => {
    const store = useEditorPreferencesStore();
    store.setViewMode('source');
    store.setShowOutline(false);
    store.setPageWidth('wide');
    store.setSaveStrategy('onBlur');

    const wrapper = mount(EditorSettingsView, {
      global: {
        stubs: {
          BSelect: {
            props: ['value'],
            emits: ['update:value'],
            template: '<div class="select-stub" :data-value="value"><slot /></div>'
          },
          ASwitch: {
            props: ['checked'],
            emits: ['update:checked'],
            template: '<div class="switch-stub" :data-checked="checked"></div>'
          }
        }
      }
    });

    expect(wrapper.text()).toContain('默认视图模式');
    expect(wrapper.text()).toContain('保存策略');
    expect(wrapper.text()).toContain('自动保存策略仅对已有磁盘路径的文档生效');
  });
});
```

- [ ] **Step 2: Run the settings-page test to confirm failure**

Run:

```bash
pnpm test -- test/views/settings/editor/index.test.ts
```

Expected: `FAIL` because the editor settings route and view do not exist yet.

- [ ] **Step 3: Implement route, menu item, and settings page**

Update `src/views/settings/constants.ts`:

```ts
export type SettingsMenuKey = 'provider' | 'service-model' | 'speech' | 'logger' | 'editor';

export const menuItems: MenuItem[] = [
  { key: 'provider', label: 'AI服务商', icon: 'lucide:brain', path: '/settings/provider' },
  { key: 'service-model', label: '服务模型', icon: 'lucide:sparkles', path: '/settings/service-model' },
  { key: 'editor', label: '编辑器', icon: 'lucide:square-pen', path: '/settings/editor' },
  { key: 'speech', label: '语音组件', icon: 'lucide:mic', path: '/settings/speech' },
  { key: 'logger', label: '运行日志', icon: 'lucide:file-text', path: '/settings/logger' }
];
```

Update `src/router/routes/modules/settings.ts`:

```ts
{
  path: 'editor',
  name: 'editor-settings',
  component: () => import('@/views/settings/editor/index.vue'),
  meta: { title: '编辑器' }
},
```

Create `src/views/settings/editor/index.vue`:

```vue
<!--
  @file index.vue
  @description 编辑器设置页，负责管理视图偏好与真实写盘保存策略。
-->
<template>
  <div class="editor-settings">
    <div class="editor-settings__header">
      <div class="editor-settings__title">编辑器</div>
    </div>

    <div class="editor-settings__body">
      <section class="editor-settings__section">
        <div class="editor-settings__section-title">视图</div>
        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">默认视图模式</div>
          </div>
          <BSelect :value="store.viewMode" :options="viewModeOptions" @update:value="store.setViewMode" />
        </div>
        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">页面宽度</div>
          </div>
          <BSelect :value="store.pageWidth" :options="pageWidthOptions" @update:value="store.setPageWidth" />
        </div>
        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">显示大纲</div>
          </div>
          <ASwitch :checked="store.showOutline" @update:checked="store.setShowOutline" />
        </div>
      </section>

      <section class="editor-settings__section">
        <div class="editor-settings__section-title">保存</div>
        <div class="editor-settings__item">
          <div class="editor-settings__meta">
            <div class="editor-settings__label">保存策略</div>
            <div class="editor-settings__desc">未保存到磁盘的文档仍只会保存到应用草稿。自动保存策略仅对已有磁盘路径的文档生效。</div>
          </div>
          <BSelect :value="store.saveStrategy" :options="saveStrategyOptions" @update:value="store.setSaveStrategy" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorPreferencesStore } from '@/stores/editorPreferences';

const store = useEditorPreferencesStore();

const viewModeOptions = [
  { value: 'rich', label: '富文本' },
  { value: 'source', label: '源码' }
];

const pageWidthOptions = [
  { value: 'default', label: '默认' },
  { value: 'wide', label: '宽版' },
  { value: 'full', label: '全宽' }
];

const saveStrategyOptions = [
  { value: 'manual', label: '主动保存' },
  { value: 'onBlur', label: '失去焦点保存' },
  { value: 'onChange', label: '更新即保存' }
];
</script>
```

- [ ] **Step 4: Re-run the settings-page test**

Run:

```bash
pnpm test -- test/views/settings/editor/index.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit the settings-page task**

Run:

```bash
git add src/views/settings/constants.ts src/router/routes/modules/settings.ts src/views/settings/editor/index.vue test/views/settings/editor/index.test.ts
git commit -m "feat: add editor settings page"
```

---

### Task 6: Final regression pass and documentation updates

**Files:**
- Modify: `changelog/2026-05-11.md`
- Reference: `docs/superpowers/specs/2026-05-11-editor-settings-refactor-design.md`

- [ ] **Step 1: Update the changelog**

Append these lines under `## Changed` in `changelog/2026-05-11.md`:

```md
- 重构编辑器设置存储，新增独立的 `editorPreferences` 用于管理默认视图模式、大纲显示、页宽和保存策略。
- 新增设置中心“编辑器”页面，统一配置编辑器视图偏好与真实写盘保存策略。
- 为编辑器新增 `manual`、`onBlur`、`onChange` 三种真实磁盘保存策略，并保持未落盘文档只写应用草稿。
```

- [ ] **Step 2: Run the focused regression suite**

Run:

```bash
pnpm test -- test/stores/editorPreferences.test.ts test/stores/setting.test.ts test/hooks/useMenuAction.test.ts test/components/BMarkdown/index.page-width.test.ts test/components/BMarkdown/index.editor-blur.test.ts test/views/editor/useSavePolicy.test.ts test/views/editor/useSessionFileDeleted.test.ts test/views/editor/useFileWatcher.test.ts test/views/settings/editor/index.test.ts
```

Expected: all tests `PASS`.

- [ ] **Step 3: Run the broader editor/settings regression suite**

Run:

```bash
pnpm test -- test/views/settings/logger/index.test.ts test/views/settings/speech/index.test.ts test/views/editor/useFileSelection.test.ts test/views/editor/reconcileFileContent.test.ts
```

Expected: all tests `PASS`, proving the refactor did not break adjacent settings or editor flows.

- [ ] **Step 4: Commit the final polish**

Run:

```bash
git add changelog/2026-05-11.md
git commit -m "test: verify editor settings refactor regressions"
```
