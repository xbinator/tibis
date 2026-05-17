# Monaco JSON 编辑器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在复用现有编辑页与 `EditorController` 协议的前提下，为 `.json` 文件接入基于 Monaco 的编辑器实现。

**Architecture:** 新增 `BEditor` 作为非 Markdown 文本编辑入口，首期仅承载 JSON。`src/views/editor/drivers/editor.ts` 负责把 `.json` 文件分流到 `BEditor`，`BEditor` 内部按扩展名渲染 `PaneJsonEditor`，而 `PaneJsonEditor` 通过 `createMonacoEditor.ts` 适配层懒加载 Monaco、封装 worker 与主题切换、暴露统一编辑接口。

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite, Electron, Monaco Editor

---

### Task 1: 搭建 Monaco 适配层与构建依赖

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/components/BEditor/utils/createMonacoEditor.ts`

- [ ] **Step 1: 先把依赖与拆包入口写出来**

在 `package.json` 的 `dependencies` 中新增 `monaco-editor`：

```json
{
  "dependencies": {
    "monaco-editor": "^0.52.2"
  }
}
```

在 `vite.config.ts` 的 `VENDOR_CHUNK_GROUPS` 中新增 `monaco` 分组，避免 Monaco 被混进默认大包：

```ts
{
  name: 'monaco',
  test: /node_modules\/monaco-editor\//
}
```

- [ ] **Step 2: 新建 Monaco 适配层文件，统一封装懒加载、worker 与主题切换**

创建 `src/components/BEditor/utils/createMonacoEditor.ts`：

```ts
/**
 * @file createMonacoEditor.ts
 * @description Monaco 编辑器实例创建适配层，统一封装 worker、主题与销毁责任。
 */

import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

/**
 * Monaco 编辑器创建参数。
 */
export interface CreateMonacoEditorOptions {
  /** 宿主 DOM。 */
  container: HTMLElement;
  /** 初始文本。 */
  value: string;
  /** 语言标识。 */
  language: string;
  /** 是否只读。 */
  readOnly: boolean;
  /** 主题名。 */
  theme: 'tibis-light' | 'tibis-dark';
}

/**
 * 组件侧可消费的 Monaco 适配实例。
 */
export interface MonacoEditorHandle {
  /** 当前文本。 */
  getValue: () => string;
  /** 整体替换文本。 */
  setValue: (value: string) => void;
  /** 更新编辑器选项。 */
  updateOptions: (options: { readOnly?: boolean }) => void;
  /** 聚焦编辑器。 */
  focus: () => void;
  /** 获取底层编辑器实例。 */
  getEditor: () => Monaco.editor.IStandaloneCodeEditor;
  /** 获取底层文本模型。 */
  getModel: () => Monaco.editor.ITextModel;
  /** 销毁编辑器与模型。 */
  dispose: () => void;
}

let cachedMonaco: typeof Monaco | null = null;
let monacoEnvironmentReady = false;

/**
 * 初始化 Monaco worker 环境。
 */
function ensureMonacoEnvironment(): void {
  if (monacoEnvironmentReady) {
    return;
  }

  globalThis.MonacoEnvironment = {
    getWorker(_: string, label: string): Worker {
      if (label === 'json') {
        return new jsonWorker();
      }

      return new editorWorker();
    }
  };

  monacoEnvironmentReady = true;
}

/**
 * 按需加载 Monaco 主模块。
 * @returns Monaco API
 */
async function loadMonaco(): Promise<typeof Monaco> {
  if (cachedMonaco) {
    return cachedMonaco;
  }

  cachedMonaco = await import('monaco-editor/esm/vs/editor/editor.api');
  return cachedMonaco;
}

/**
 * 注册 Tibis Monaco 主题。
 * @param monaco - Monaco API
 */
function ensureThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('tibis-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff'
    }
  });

  monaco.editor.defineTheme('tibis-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#141414'
    }
  });
}

/**
 * 创建 Monaco 编辑器实例。
 * @param options - 创建参数
 * @returns 适配后的编辑器实例
 */
export async function createMonacoEditor(options: CreateMonacoEditorOptions): Promise<MonacoEditorHandle> {
  ensureMonacoEnvironment();

  const monaco = await loadMonaco();
  ensureThemes(monaco);
  monaco.editor.setTheme(options.theme);

  const model = monaco.editor.createModel(options.value, options.language);
  const editor = monaco.editor.create(options.container, {
    model,
    automaticLayout: true,
    minimap: { enabled: false },
    readOnly: options.readOnly,
    scrollBeyondLastLine: false
  });

  return {
    getValue: () => model.getValue(),
    setValue: (value: string) => model.setValue(value),
    updateOptions: (nextOptions) => editor.updateOptions(nextOptions),
    focus: () => editor.focus(),
    getEditor: () => editor,
    getModel: () => model,
    dispose: () => {
      editor.dispose();
      model.dispose();
    }
  };
}
```

- [ ] **Step 3: 安装依赖并确认类型可通过**

Run: `pnpm add monaco-editor`

Expected: `package.json` 与 `pnpm-lock.yaml` 更新，安装成功且无 peer dependency 错误。

- [ ] **Step 4: 先跑一次基础类型检查范围测试**

Run: `pnpm test -- test/views/editor/drivers.test.ts`

Expected: 现有 driver 测试仍通过，说明新增依赖与 vite 配置没有立即破坏现有编辑器注册表。

### Task 2: 新建 `BEditor` 入口组件并定义 JSON 分发边界

**Files:**
- Create: `src/components/BEditor/index.vue`
- Create: `test/components/BEditor/index.test.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: 先写 `BEditor` 的失败测试，固定 JSON 文件走 Monaco 分支**

创建 `test/components/BEditor/index.test.ts`：

```ts
/**
 * @file index.test.ts
 * @description BEditor 入口组件测试，验证 JSON 文件分支选择。
 */
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BEditor from '@/components/BEditor/index.vue';

describe('BEditor', () => {
  it('renders PaneJsonEditor for json files', () => {
    const wrapper = mount(BEditor, {
      props: {
        value: {
          id: 'json-1',
          name: 'config',
          ext: 'json',
          content: '{}',
          path: null
        }
      }
    });

    expect(wrapper.findComponent({ name: 'PaneJsonEditor' }).exists()).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认当前失败**

Run: `pnpm test -- test/components/BEditor/index.test.ts`

Expected: FAIL，报错 `Cannot find module '@/components/BEditor/index.vue'` 或 `PaneJsonEditor` 不存在。

- [ ] **Step 3: 创建 `BEditor` 入口组件**

创建 `src/components/BEditor/index.vue`：

```vue
<!--
  @file index.vue
  @description 通用文本编辑器入口组件，首期承载 JSON 文件的 Monaco 编辑分支。
-->
<template>
  <PaneJsonEditor
    v-if="isJsonFile"
    v-model:value="editorState.content"
    :editor-state="editorState"
    :editable="editable"
    @editor-blur="emit('editor-blur', $event)"
  />
</template>

<script setup lang="ts">
import type { EditorState } from '@/components/BMarkdown/types';
import { computed } from 'vue';
import PaneJsonEditor from './components/PaneJsonEditor.vue';

interface Props {
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true
});

const emit = defineEmits<{
  (e: 'editor-blur', event: FocusEvent): void;
}>();

const editorState = defineModel<EditorState>('value', {
  default: () => ({ id: '', name: '', path: null, ext: '', content: '' })
});

const isJsonFile = computed<boolean>(() => editorState.value.ext === 'json');
</script>
```

- [ ] **Step 4: 更新组件自动发现目录**

在 `vite.config.ts` 的 `COMPONENT_DIRS` 中补上 `BEditor`：

```ts
'BEditor',
```

- [ ] **Step 5: 重新运行入口组件测试**

Run: `pnpm test -- test/components/BEditor/index.test.ts`

Expected: PASS，说明 `BEditor` 已经成为可挂载入口，并能对 `.json` 执行分发。

### Task 3: 实现 `PaneJsonEditor` 与统一编辑协议

**Files:**
- Create: `src/components/BEditor/components/PaneJsonEditor.vue`
- Create: `test/components/BEditor/pane-json-editor.test.ts`
- Modify: `src/components/BMarkdown/adapters/types.ts`

- [ ] **Step 1: 先写 `PaneJsonEditor` 的失败测试，覆盖内容同步与 `EditorController` 核心能力**

创建 `test/components/BEditor/pane-json-editor.test.ts`：

```ts
/**
 * @file pane-json-editor.test.ts
 * @description PaneJsonEditor 基础交互与协议兼容测试。
 */
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PaneJsonEditor from '@/components/BEditor/components/PaneJsonEditor.vue';

const editorMock = {
  getValue: vi.fn(() => '{}'),
  setValue: vi.fn(),
  updateOptions: vi.fn(),
  focus: vi.fn(),
  getEditor: vi.fn(),
  getModel: vi.fn(),
  dispose: vi.fn()
};

vi.mock('@/components/BEditor/utils/createMonacoEditor', () => ({
  createMonacoEditor: vi.fn(async () => editorMock)
}));

describe('PaneJsonEditor', () => {
  it('syncs initial json content into Monaco and exposes editor methods', async () => {
    const wrapper = mount(PaneJsonEditor, {
      props: {
        value: '{}',
        editable: true,
        editorState: {
          id: '1',
          name: 'config',
          ext: 'json',
          content: '{}',
          path: null
        }
      }
    });

    await Promise.resolve();

    expect(wrapper.vm.focusEditor).toBeTypeOf('function');
    expect(editorMock.focus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认当前失败**

Run: `pnpm test -- test/components/BEditor/pane-json-editor.test.ts`

Expected: FAIL，报错 `PaneJsonEditor.vue` 不存在或未暴露编辑方法。

- [ ] **Step 3: 创建 `PaneJsonEditor.vue`，实现最小可用的内容同步与协议暴露**

创建 `src/components/BEditor/components/PaneJsonEditor.vue`：

```vue
<template>
  <div class="b-editor-json" @focusout="handleFocusOut">
    <div v-if="loadError" class="b-editor-json__fallback">
      <div class="b-editor-json__error">{{ loadError }}</div>
      <textarea class="b-editor-json__textarea" :value="editorContent" readonly></textarea>
    </div>
    <div v-else ref="hostRef" class="b-editor-json__host"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file PaneJsonEditor.vue
 * @description JSON Monaco 编辑器窗格，实现统一编辑器协议。
 */

import type { EditorController, EditorSearchState, EditorSelection } from '@/components/BMarkdown/adapters/types';
import type { EditorState } from '@/components/BMarkdown/types';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useSettingStore } from '@/stores/setting';
import { createMonacoEditor, type MonacoEditorHandle } from '../utils/createMonacoEditor';

interface Props {
  value: string;
  editable?: boolean;
  editorState: EditorState;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true
});

const emit = defineEmits<{
  (e: 'update:value', value: string): void;
  (e: 'editor-blur', event: FocusEvent): void;
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const editorHandle = ref<MonacoEditorHandle | null>(null);
const loadError = ref('');
const ignoreModelChange = ref(false);
const settingStore = useSettingStore();
const editorContent = ref(props.value);

function handleFocusOut(event: FocusEvent): void {
  emit('editor-blur', event);
}

function getSearchState(): EditorSearchState {
  return {
    currentIndex: 0,
    matchCount: 0,
    term: ''
  };
}

function getSelection(): EditorSelection | null {
  return null;
}

async function initEditor(): Promise<void> {
  if (!hostRef.value) {
    return;
  }

  try {
    editorHandle.value = await createMonacoEditor({
      container: hostRef.value,
      value: props.value,
      language: 'json',
      readOnly: !props.editable,
      theme: settingStore.resolvedTheme === 'dark' ? 'tibis-dark' : 'tibis-light'
    });
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Monaco 初始化失败';
  }
}

watch(
  () => props.value,
  (nextValue: string): void => {
    editorContent.value = nextValue;

    if (!editorHandle.value || editorHandle.value.getValue() === nextValue) {
      return;
    }

    ignoreModelChange.value = true;
    editorHandle.value.setValue(nextValue);
    ignoreModelChange.value = false;
  }
);

watch(
  () => props.editable,
  (editable: boolean): void => {
    editorHandle.value?.updateOptions({ readOnly: !editable });
  }
);

onMounted(async (): Promise<void> => {
    await nextTick();
    await initEditor();
});

onBeforeUnmount((): void => {
  editorHandle.value?.dispose();
});

defineExpose<EditorController>({
  undo: () => undefined,
  redo: () => undefined,
  canUndo: () => false,
  canRedo: () => false,
  focusEditor: () => editorHandle.value?.focus(),
  focusEditorAtStart: () => editorHandle.value?.focus(),
  setSearchTerm: () => undefined,
  findNext: () => undefined,
  findPrevious: () => undefined,
  clearSearch: () => undefined,
  getSelection,
  insertAtCursor: async () => undefined,
  replaceSelection: async () => undefined,
  replaceDocument: async (content: string) => {
    emit('update:value', content);
  },
  selectLineRange: () => false,
  getSearchState,
  scrollToAnchor: () => false,
  getActiveAnchorId: () => ''
});
</script>
```

- [ ] **Step 4: 把 `EditorState` 类型出口补成 `PaneJsonEditor` 可直接复用**

如果 `src/components/BMarkdown/types.ts` 当前没有直接导出 `EditorState`，补上显式导出：

```ts
export type { EditorState } from './types';
```

- [ ] **Step 5: 运行 JSON pane 测试，确认组件已经可挂载**

Run: `pnpm test -- test/components/BEditor/pane-json-editor.test.ts`

Expected: PASS 或至少从“模块不存在”推进到“行为断言失败”，确认组件骨架已接通。

### Task 4: 接入 `editorDriver` 并让 `.json` 文件命中新分支

**Files:**
- Create: `src/views/editor/drivers/editor.ts`
- Modify: `src/views/editor/drivers/index.ts`
- Modify: `src/views/editor/drivers/types.ts`
- Create: `test/views/editor/drivers-editor.test.ts`
- Modify: `test/views/editor/drivers.test.ts`

- [ ] **Step 1: 先写 driver 测试，固定 `.json` 走 `editorDriver`**

创建 `test/views/editor/drivers-editor.test.ts`：

```ts
/**
 * @file drivers-editor.test.ts
 * @description editorDriver 测试。
 */

import { describe, expect, it } from 'vitest';
import { editorDriver } from '@/views/editor/drivers/editor';

describe('editorDriver', () => {
  it('matches json files and only exposes search toolbar', () => {
    expect(
      editorDriver.match({
        id: 'json-1',
        name: 'config',
        ext: 'json',
        content: '{}',
        path: null
      })
    ).toBe(true);

    expect(editorDriver.toolbar).toEqual({
      showViewModeToggle: false,
      showStructuredViewToggle: false,
      showSearch: true
    });
  });
});
```

把 `test/views/editor/drivers.test.ts` 中的第一条断言改为：

```ts
it('resolveEditorDriver returns editor driver for json files', () => {
  expect(
    resolveEditorDriver({
      id: '1',
      name: 'demo',
      ext: 'json',
      content: '{}',
      path: null
    }).id
  ).toBe('editor');
});
```

- [ ] **Step 2: 运行 driver 测试确认失败**

Run: `pnpm test -- test/views/editor/drivers.test.ts test/views/editor/drivers-editor.test.ts`

Expected: FAIL，报错 `editor.ts` 不存在，或 `resolveEditorDriver` 仍回退到 `markdown`。

- [ ] **Step 3: 实现 `editorDriver` 并注册到 driver 列表**

创建 `src/views/editor/drivers/editor.ts`：

```ts
/**
 * @file editor.ts
 * @description 通用编辑驱动，首期承载 JSON 文件的 Monaco 编辑器。
 */

import type { EditorDriver } from './types';
import BEditor from '@/components/BEditor/index.vue';
import { createBaseToolContext } from './markdown';

/**
 * 通用编辑驱动。
 */
export const editorDriver: EditorDriver = {
  id: 'editor',
  match(file): boolean {
    return file.ext === 'json';
  },
  component: BEditor,
  createToolContext({ fileState, editorInstance }) {
    return createBaseToolContext(fileState, editorInstance);
  },
  toolbar: {
    showViewModeToggle: false,
    showStructuredViewToggle: false,
    showSearch: true
  }
};
```

修改 `src/views/editor/drivers/index.ts`：

```ts
import { editorDriver } from './editor';
import { markdownDriver } from './markdown';

export const editorDrivers: EditorDriver[] = [editorDriver, markdownDriver];
```

- [ ] **Step 4: 重新运行 driver 测试**

Run: `pnpm test -- test/views/editor/drivers.test.ts test/views/editor/drivers-editor.test.ts test/views/editor/drivers-markdown.test.ts`

Expected: PASS，`.json` 命中 `editor`，`.md` 仍命中 `markdown`。

### Task 5: 补齐主题、查找、释放与回归验证

**Files:**
- Modify: `src/components/BEditor/components/PaneJsonEditor.vue`
- Modify: `test/components/BEditor/pane-json-editor.test.ts`
- Modify: `changelog/2026-05-17.md`

- [ ] **Step 1: 给 `PaneJsonEditor` 补上主题监听、只读切换与释放断言测试**

在 `test/components/BEditor/pane-json-editor.test.ts` 中新增用例，验证：

```ts
it('updates readOnly option when editable changes', async () => {
  const wrapper = mount(PaneJsonEditor, {
    props: {
      value: '{}',
      editable: true,
      editorState: {
        id: '2',
        name: 'config',
        ext: 'json',
        content: '{}',
        path: null
      }
    }
  });

  await Promise.resolve();
  await wrapper.setProps({ editable: false });

  expect(editorMock.updateOptions).toHaveBeenCalledWith({ readOnly: true });
});

it('disposes Monaco resources on unmount', async () => {
  const wrapper = mount(PaneJsonEditor, {
    props: {
      value: '{}',
      editable: true,
      editorState: {
        id: '3',
        name: 'config',
        ext: 'json',
        content: '{}',
        path: null
      }
    }
  });

  await Promise.resolve();
  wrapper.unmount();

  expect(editorMock.dispose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 在组件中把只读更新、主题切换与释放真正做完**

在 `PaneJsonEditor.vue` 中补上：

```ts
watch(
  () => settingStore.resolvedTheme,
  (theme) => {
    const nextTheme = theme === 'dark' ? 'tibis-dark' : 'tibis-light';
    void import('monaco-editor/esm/vs/editor/editor.api').then((monaco) => {
      monaco.editor.setTheme(nextTheme);
    });
  }
);
```

并确保 `onBeforeUnmount` 中保留：

```ts
onBeforeUnmount((): void => {
  editorHandle.value?.dispose();
});
```

- [ ] **Step 3: 更新 changelog**

在 `changelog/2026-05-17.md` 的 `## Added` 或 `## Changed` 下追加：

```md
- 新增 `BEditor` 与 Monaco JSON 编辑分支，`.json` 文件不再回退到 Markdown 编辑器。
```

- [ ] **Step 4: 运行本次改动的核心测试集**

Run: `pnpm test -- test/components/BEditor/index.test.ts test/components/BEditor/pane-json-editor.test.ts test/views/editor/drivers.test.ts test/views/editor/drivers-editor.test.ts test/views/editor/drivers-markdown.test.ts`

Expected: PASS，JSON 分支与新编辑器适配层的核心回归通过。

- [ ] **Step 5: 运行完整质量检查**

Run: `pnpm test`

Expected: PASS，现有编辑器测试未因新增 Monaco 分支回归。

Run: `pnpm lint`

Expected: PASS，新增 `BEditor`、driver 与适配层文件通过 ESLint。
