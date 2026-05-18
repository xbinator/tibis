# BEditor Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/views/editor/index.vue` 的编辑器入口、`src/views/editor/drivers` 的兼容判断，以及原 `src/components/BMarkdown` 的实现能力统一迁移到 `src/components/BEditor` 域内，并彻底移除 `BMarkdown` 组织语义。

**Architecture:** 以 `src/components/BEditor/index.vue` 作为唯一编辑器入口，内部基于 `fileState.ext` 解析渲染 Markdown 或 `BMonaco`。统一类型、控制器、公共交互层和工具上下文全部收口到 `BEditor` 域中；Markdown 保留在 `BEditor` 域内，Monaco 则抽为独立低层组件。

**Tech Stack:** Vue 3.5、TypeScript、TipTap 3、CodeMirror 6、Monaco Editor、Pinia、Vitest、ESLint

---

## File Structure

### New / Reorganized Files

- Create: `src/components/BEditor/types.ts`
  - 统一导出 `EditorState`、`EditorController`、`EditorSearchState`、`EditorSelection`。
- Create: `src/components/BEditor/constants/resolver.ts`
  - 负责基于 `fileState.ext` 解析 `markdown` / `monaco`。
- Create: `src/components/BEditor/hooks/useEditorResolver.ts`
  - 封装组件层文件类型分流。
- Create: `src/components/BEditor/hooks/useEditorToolContext.ts`
  - 封装统一工具上下文注册输入。
- Create: `src/components/BMonaco/index.vue`
  - 承接 Monaco 低层实现。
- Create: `src/components/BMonaco/utils/createMonacoEditor.ts`
  - 承接 Monaco 初始化与 worker / theme 适配。
- Create: `src/components/BEditor/panes/PaneMarkdownRich.vue`
  - 从原 `BMarkdown/components/PaneRichEditor.vue` 迁入。
- Create: `src/components/BEditor/panes/PaneMarkdownSource.vue`
  - 从原 `BMarkdown/components/PaneSourceEditor.vue` 迁入。
- Create: `src/components/BEditor/shared/FindBar.vue`
  - 收口查找条宿主。
- Create: `src/components/BEditor/shared/QuickActions.vue`
  - 收口通用快捷操作。
- Create: `src/components/BEditor/shared/SelectionAIInput.vue`
  - 收口 AI 改写输入层。

### Modified Files

- Modify: `src/components/BEditor/index.vue`
  - 从单一 Monaco 入口重构为统一编辑器入口，并接入 `BMonaco`。
- Modify: `src/views/editor/index.vue`
  - 移除 `resolveEditorDriver`，固定渲染 `BEditor`。
- Modify: `src/views/editor/hooks/useBindings.ts`
  - 类型依赖改为 `src/components/BEditor/types.ts`。
- Modify: `src/views/editor/hooks/useFileSelection.ts`
  - 类型依赖改为 `src/components/BEditor/types.ts`。
- Modify: `src/ai/tools/editor-context` 相关使用方
  - 接受 `BEditor` 统一工具上下文。

### Removed Files

- Remove: `src/views/editor/drivers/index.ts`
- Remove: `src/views/editor/drivers/types.ts`
- Remove: `src/views/editor/drivers/editor.ts`
- Remove: `src/views/editor/drivers/markdown.ts`
- Remove: `src/components/BMarkdown/index.vue`
- Remove: `src/components/BMarkdown/types.ts`
- Remove: `src/components/BMarkdown/components/*`
- Remove: `src/components/BMarkdown/hooks/*`
- Remove: `src/components/BMarkdown/adapters/*`
- Remove: `src/components/BMarkdown/extensions/*`
- Remove: `src/components/BMarkdown/utils/*`

### Tests To Add / Update

- Create or modify: `test/components/BEditor/index.test.ts`
- Create or modify: `test/views/editor/index.test.ts`
- Create or modify: `test/views/editor/hooks/useFileSelection.test.ts`
- Create or modify: `test/ai/tools/editor-context.test.ts`

## Task 1: 建立 BEditor 统一边界

**Files:**
- Create: `src/components/BEditor/types.ts`
- Create: `src/components/BEditor/constants/resolver.ts`
- Create: `src/components/BEditor/hooks/useEditorResolver.ts`
- Test: `test/components/BEditor/index.test.ts`

- [ ] **Step 1: 写失败测试，锁定分流规则和类型出口**

```ts
import { describe, expect, it } from 'vitest'
import { resolveEditorKind } from '@/components/BEditor/constants/resolver'

describe('resolveEditorKind', () => {
  it('routes markdown extensions to markdown pane', () => {
    expect(resolveEditorKind('md')).toBe('markdown')
    expect(resolveEditorKind('markdown')).toBe('markdown')
    expect(resolveEditorKind('')).toBe('markdown')
  })

  it('routes json to monaco pane', () => {
    expect(resolveEditorKind('json')).toBe('monaco')
  })
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pnpm vitest run test/components/BEditor/index.test.ts`

Expected: FAIL，提示 `resolveEditorKind` 或新文件不存在。

- [ ] **Step 3: 建立统一类型出口与 resolver**

```ts
/**
 * @file types.ts
 * @description BEditor 统一类型出口。
 */
export interface EditorState {
  /** 编辑器内容 */
  content: string
  /** 文件名 */
  name: string
  /** 文件路径 */
  path: string | null
  /** 文档唯一标识 */
  id: string
  /** 文件扩展名 */
  ext: string
}

export interface EditorSearchState {
  /** 当前命中序号 */
  currentIndex: number
  /** 命中总数 */
  matchCount: number
  /** 当前搜索词 */
  term: string
}

export interface EditorSelection {
  /** 起始偏移 */
  from: number
  /** 结束偏移 */
  to: number
  /** 选中文本 */
  text: string
}

export interface EditorController {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  focusEditor: () => void
  focusEditorAtStart: () => void
  setSearchTerm: (term: string) => void
  findNext: () => void
  findPrevious: () => void
  clearSearch: () => void
  getSelection: () => EditorSelection | null
  insertAtCursor: (content: string) => Promise<void>
  replaceSelection: (content: string) => Promise<void>
  replaceDocument: (content: string) => Promise<void>
  selectLineRange: (startLine: number, endLine: number) => boolean | Promise<boolean>
  getSearchState: () => EditorSearchState
}
```

```ts
/**
 * @file resolver.ts
 * @description 根据扩展名解析 BEditor 内部实现类型。
 */
export type EditorKind = 'markdown' | 'monaco'

const MARKDOWN_EXTENSIONS = new Set(['', 'md', 'markdown'])
const MONACO_EXTENSIONS = new Set(['json'])

/**
 * 解析当前文件应使用的编辑器类型。
 * @param ext - 文件扩展名
 * @returns 编辑器类型
 */
export function resolveEditorKind(ext: string | null | undefined): EditorKind {
  const normalizedExt = String(ext ?? '').trim().toLowerCase()

  if (MARKDOWN_EXTENSIONS.has(normalizedExt)) {
    return 'markdown'
  }

  if (MONACO_EXTENSIONS.has(normalizedExt)) {
    return 'monaco'
  }

  return 'markdown'
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm vitest run test/components/BEditor/index.test.ts`

Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/components/BEditor/types.ts src/components/BEditor/constants/resolver.ts src/components/BEditor/hooks/useEditorResolver.ts test/components/BEditor/index.test.ts
git commit -m "refactor: establish beditor unified boundaries"
```

## Task 2: 抽离 Monaco 为独立 BMonaco 组件

**Files:**
- Modify: `src/components/BEditor/index.vue`
- Create: `src/components/BMonaco/index.vue`
- Create: `src/components/BMonaco/utils/createMonacoEditor.ts`
- Test: `test/components/BEditor/index.test.ts`
- Test: `test/components/BMonaco/index.test.ts`

- [ ] **Step 1: 写失败测试，锁定 BEditor 对 json 的渲染**

```ts
import { mount } from '@vue/test-utils'
import BEditor from '@/components/BEditor/index.vue'

it('renders BMonaco for json files', () => {
  const wrapper = mount(BEditor, {
    props: {
      value: {
        id: 'doc-1',
        name: 'settings',
        path: '/tmp/settings.json',
        ext: 'json',
        content: '{}'
      }
    }
  })

  expect(wrapper.findComponent({ name: 'BMonaco' }).exists()).toBe(true)
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pnpm vitest run test/components/BEditor/index.test.ts -t "renders BMonaco for json files"`

Expected: FAIL，提示找不到 `BMonaco` 或 `BEditor` 仍是旧实现。

- [ ] **Step 3: 抽出 `BMonaco` 并改造 `BEditor` 入口**

```vue
<template>
  <BMonaco
    v-if="editorKind === 'monaco'"
    ref="editorPaneRef"
    v-model:value="editorState"
    :editable="props.editable"
    @editor-blur="emit('editor-blur', $event)"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EditorController, EditorState } from './types'
import { resolveEditorKind } from './constants/resolver'
import BMonaco from '@/components/BMonaco/index.vue'

interface Props {
  /** 是否允许编辑 */
  editable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  editable: true
})

const emit = defineEmits(['editor-blur', 'rename-file', 'save', 'save-as', 'copy-path', 'show-in-folder'])
const editorState = defineModel<EditorState>('value', { required: true })
const editorPaneRef = ref<EditorController | null>(null)
const editorKind = computed(() => resolveEditorKind(editorState.value.ext))

defineExpose<EditorController>({
  undo: () => editorPaneRef.value?.undo(),
  redo: () => editorPaneRef.value?.redo(),
  canUndo: () => editorPaneRef.value?.canUndo() ?? false,
  canRedo: () => editorPaneRef.value?.canRedo() ?? false,
  focusEditor: () => editorPaneRef.value?.focusEditor(),
  focusEditorAtStart: () => editorPaneRef.value?.focusEditorAtStart(),
  setSearchTerm: (term: string) => editorPaneRef.value?.setSearchTerm(term),
  findNext: () => editorPaneRef.value?.findNext(),
  findPrevious: () => editorPaneRef.value?.findPrevious(),
  clearSearch: () => editorPaneRef.value?.clearSearch(),
  getSelection: () => editorPaneRef.value?.getSelection() ?? null,
  insertAtCursor: async (content: string) => editorPaneRef.value?.insertAtCursor(content),
  replaceSelection: async (content: string) => editorPaneRef.value?.replaceSelection(content),
  replaceDocument: async (content: string) => editorPaneRef.value?.replaceDocument(content),
  selectLineRange: (startLine: number, endLine: number) => editorPaneRef.value?.selectLineRange(startLine, endLine) ?? false,
  getSearchState: () => editorPaneRef.value?.getSearchState() ?? { currentIndex: 0, matchCount: 0, term: '' }
})
</script>
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm vitest run test/components/BEditor/index.test.ts -t "renders BMonaco for json files"`

Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/components/BEditor/index.vue src/components/BMonaco/index.vue src/components/BMonaco/utils/createMonacoEditor.ts test/components/BEditor/index.test.ts test/components/BMonaco/index.test.ts
git commit -m "refactor: extract bmonaco from beditor"
```

## Task 3: 将 Markdown pane、hooks、adapters、extensions 并入 BEditor

**Files:**
- Create: `src/components/BEditor/panes/PaneMarkdownRich.vue`
- Create: `src/components/BEditor/panes/PaneMarkdownSource.vue`
- Create: `src/components/BEditor/hooks/useMarkdownContent.ts`
- Create: `src/components/BEditor/hooks/useMarkdownExtensions.ts`
- Create: `src/components/BEditor/hooks/useMarkdownSelectionAssistant.ts`
- Create: `src/components/BEditor/adapters/*`
- Create: `src/components/BEditor/extensions/*`
- Create: `src/components/BEditor/utils/editorMarkdown.ts`
- Test: `test/components/BEditor/index.test.ts`

- [ ] **Step 1: 写失败测试，锁定 md 文件会走 Markdown pane**

```ts
it('renders markdown panes for md files', () => {
  const wrapper = mount(BEditor, {
    props: {
      value: {
        id: 'doc-2',
        name: 'note',
        path: '/tmp/note.md',
        ext: 'md',
        content: '# Title'
      }
    }
  })

  expect(wrapper.findComponent({ name: 'PaneMarkdownRich' }).exists()).toBe(true)
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pnpm vitest run test/components/BEditor/index.test.ts -t "renders markdown panes for md files"`

Expected: FAIL，提示 Markdown pane 未接入。

- [ ] **Step 3: 迁移 Markdown 文件并统一 import 出口**

```ts
/**
 * @file useMarkdownExtensions.ts
 * @description 组装 Markdown 编辑器扩展集合。
 */
import type { SearchScrollContext } from '../extensions/editorSearch'
import type { Ref } from 'vue'
import { useExtensions } from '@/components/BEditor/hooks/useExtensions'

interface UseMarkdownExtensionsParams {
  /** 编辑器实例 ID */
  editorInstanceId: Ref<string>
  /** 搜索滚动回调 */
  onSearchMatchFocus?: (context: SearchScrollContext) => void
}

/**
 * 创建 Markdown 扩展集合。
 * @param params - 依赖参数
 * @returns 扩展集合与重置函数
 */
export function useMarkdownExtensions(params: UseMarkdownExtensionsParams) {
  return useExtensions(params.editorInstanceId, {
    onSearchMatchFocus: params.onSearchMatchFocus
  })
}
```

```vue
<template>
  <PaneMarkdownRich
    v-if="editorKind === 'markdown'"
    ref="editorPaneRef"
    v-model:value="editorState.content"
    v-model:outline-content="outlineContent"
    :editor-state="editorState"
    :editable="editable"
    @editor-blur="emit('editor-blur', $event)"
  />
</template>
```

- [ ] **Step 4: 运行聚焦测试，确认 Markdown 路由通过**

Run: `pnpm vitest run test/components/BEditor/index.test.ts -t "renders markdown panes for md files"`

Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/components/BEditor/panes src/components/BEditor/hooks src/components/BEditor/adapters src/components/BEditor/extensions src/components/BEditor/utils test/components/BEditor/index.test.ts
git commit -m "refactor: migrate markdown implementation into beditor"
```

## Task 4: 将公共交互层和工具上下文宿主上提到 BEditor

**Files:**
- Modify: `src/components/BEditor/index.vue`
- Create: `src/components/BEditor/shared/FindBar.vue`
- Create: `src/components/BEditor/shared/QuickActions.vue`
- Create: `src/components/BEditor/shared/SelectionAIInput.vue`
- Create: `src/components/BEditor/hooks/useEditorToolContext.ts`
- Test: `test/ai/tools/editor-context.test.ts`

- [ ] **Step 1: 写失败测试，锁定统一工具上下文和查找能力**

```ts
import { describe, expect, it } from 'vitest'
import { createEditorToolContext } from '@/components/BEditor/hooks/useEditorToolContext'

describe('createEditorToolContext', () => {
  it('uses the unified editor controller contract', async () => {
    const context = createEditorToolContext({
      fileState: {
        id: 'doc-3',
        name: 'draft',
        path: null,
        ext: 'md',
        content: 'hello'
      },
      editorInstance: {
        getSelection: () => ({ from: 0, to: 5, text: 'hello' }),
        insertAtCursor: async () => undefined,
        replaceSelection: async () => undefined,
        replaceDocument: async () => undefined
      }
    })

    expect(context.document.id).toBe('doc-3')
    expect(context.editor.getSelection()?.text).toBe('hello')
  })
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pnpm vitest run test/ai/tools/editor-context.test.ts`

Expected: FAIL，提示 `createEditorToolContext` 不存在。

- [ ] **Step 3: 实现统一宿主与上下文工厂**

```ts
/**
 * @file useEditorToolContext.ts
 * @description BEditor 统一工具上下文工厂。
 */
import type { AIToolContext } from 'types/ai'
import type { EditorController, EditorState } from '../types'
import { buildUnsavedPath, resolveFileTitle } from '@/utils/file'

interface CreateEditorToolContextInput {
  /** 当前文件状态 */
  fileState: EditorState
  /** 编辑器实例 */
  editorInstance: Pick<EditorController, 'getSelection' | 'insertAtCursor' | 'replaceSelection' | 'replaceDocument'> | null
}

/**
 * 创建统一编辑器工具上下文。
 * @param input - 工具上下文输入
 * @returns AI 工具上下文
 */
export function createEditorToolContext(input: CreateEditorToolContextInput): AIToolContext {
  const { fileState, editorInstance } = input

  return {
    document: {
      id: fileState.id,
      title: resolveFileTitle(fileState),
      path: fileState.path,
      locator: fileState.path ?? buildUnsavedPath({ id: fileState.id, fileName: `${fileState.name}.${fileState.ext}` }),
      getContent: () => fileState.content
    },
    editor: {
      getSelection: () => editorInstance?.getSelection() ?? null,
      insertAtCursor: async (content: string) => editorInstance?.insertAtCursor(content),
      replaceSelection: async (content: string) => editorInstance?.replaceSelection(content),
      replaceDocument: async (content: string) => editorInstance?.replaceDocument(content)
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm vitest run test/ai/tools/editor-context.test.ts`

Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/components/BEditor/index.vue src/components/BEditor/shared src/components/BEditor/hooks/useEditorToolContext.ts test/ai/tools/editor-context.test.ts
git commit -m "refactor: host shared editor interactions in beditor"
```

## Task 5: 页面入口改为固定渲染 BEditor，并删除 drivers / BMarkdown

**Files:**
- Modify: `src/views/editor/index.vue`
- Modify: `src/views/editor/hooks/useBindings.ts`
- Modify: `src/views/editor/hooks/useFileSelection.ts`
- Remove: `src/views/editor/drivers/*`
- Remove: `src/components/BMarkdown/**`
- Test: `test/views/editor/index.test.ts`

- [ ] **Step 1: 写失败测试，锁定页面层不再依赖 driver**

```ts
import { mount } from '@vue/test-utils'
import EditorView from '@/views/editor/index.vue'

it('renders BEditor directly without resolveEditorDriver', () => {
  const wrapper = mount(EditorView, {
    global: {
      stubs: {
        BEditor: {
          name: 'BEditor',
          template: '<div class="b-editor-stub" />'
        }
      }
    }
  })

  expect(wrapper.find('.b-editor-stub').exists()).toBe(true)
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pnpm vitest run test/views/editor/index.test.ts`

Expected: FAIL，提示仍依赖动态 driver 组件。

- [ ] **Step 3: 删除页面层 driver 分发并切换类型引用**

```vue
<template>
  <div class="editor-layout editor-content">
    <div class="editor-main-container">
      <div class="editor-content-wrapper">
        <BEditor
          ref="editorRef"
          :key="fileState.id"
          v-model:value="fileState"
          @editor-blur="actions.onEditorBlur"
          @rename-file="actions.onRename"
          @save="actions.onSave"
          @save-as="actions.onSaveAs"
          @copy-path="actions.onCopyPath"
          @show-in-folder="actions.onShowInFolder"
        />
      </div>
    </div>
  </div>
</template>
```

```ts
import type { EditorController } from '@/components/BEditor/types'
import BEditor from '@/components/BEditor/index.vue'
```

- [ ] **Step 4: 运行全量验证**

Run: `pnpm vitest run test/views/editor/index.test.ts test/views/editor/hooks/useFileSelection.test.ts test/components/BEditor/index.test.ts test/ai/tools/editor-context.test.ts`

Expected: PASS

Run: `pnpm exec tsc --noEmit`

Expected: PASS

Run: `pnpm exec eslint src/components/BEditor src/views/editor --ext .ts,.vue`

Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/views/editor/index.vue src/views/editor/hooks/useBindings.ts src/views/editor/hooks/useFileSelection.ts src/components/BEditor test/views/editor/index.test.ts test/views/editor/hooks/useFileSelection.test.ts test/components/BEditor/index.test.ts test/ai/tools/editor-context.test.ts
git rm -r src/views/editor/drivers src/components/BMarkdown
git commit -m "refactor: unify editor entry under beditor"
```

## Spec Coverage Check

- 统一入口到 `BEditor`：Task 2、Task 5 覆盖。
- 以 `fileState.ext` 分流：Task 1、Task 2、Task 3 覆盖。
- 移除 `BMarkdown` 组织：Task 3、Task 5 覆盖。
- 抽离 Monaco 为低层 pane：Task 2 覆盖。
- 统一类型出口与编辑器能力接口：Task 1 覆盖。
- 统一工具上下文、交互宿主：Task 4 覆盖。
- 页面层移除 driver 兼容判断：Task 5 覆盖。

## Validation Checklist

- `pnpm vitest run test/components/BEditor/index.test.ts`
- `pnpm vitest run test/views/editor/index.test.ts`
- `pnpm vitest run test/views/editor/hooks/useFileSelection.test.ts`
- `pnpm vitest run test/ai/tools/editor-context.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint src/components/BEditor src/views/editor --ext .ts,.vue`
