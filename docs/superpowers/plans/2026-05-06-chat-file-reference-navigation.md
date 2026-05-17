# Chat File Reference Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make file reference chips in chat bubbles and the prompt editor open the target file and optionally select the referenced source line range in both source and rich editor modes.

**Architecture:** Keep file-reference token parsing in a shared utility under `src/utils/fileReference`, route all file-opening through `src/hooks/useNavigate.ts`, and carry optional line-selection intent through a lightweight store consumed by a new editor-page hook. Source and rich selection behaviors stay behind the `BMarkdownPublicInstance.selectLineRange()` boundary so `BChatSidebar` never needs editor internals.

**Tech Stack:** Vue 3 Composition API, Pinia store conventions, Vue Router, CodeMirror 6, Tiptap/ProseMirror, Vitest

---

### Task 1: Shared File-Reference Parsing

**Files:**
- Create: `src/utils/fileReference/types.ts`
- Create: `src/utils/fileReference/parseToken.ts`
- Modify: `src/components/BChatSidebar/utils/chipResolver.ts`
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue`
- Test: `test/components/BChatSidebar/chipResolver.test.ts`
- Test: `test/components/BChatSidebar/bubblePartUserInput.test.ts`

- [ ] **Step 1: Write the failing parser tests**

```ts
describe('parseFileReferenceToken', () => {
  test('parses saved file references with render line metadata', () => {
    expect(parseFileReferenceToken('#src/demo.ts 12-14|20-24')).toEqual({
      rawPath: 'src/demo.ts',
      filePath: 'src/demo.ts',
      fileId: null,
      fileName: 'demo.ts',
      startLine: 12,
      endLine: 14,
      renderStartLine: 20,
      renderEndLine: 24,
      lineText: '12-14',
      isUnsaved: false
    });
  });

  test('parses unsaved references into fileId + null filePath', () => {
    expect(parseFileReferenceToken('#unsaved://abc123/draft.md 3-5|3-5')).toMatchObject({
      rawPath: 'unsaved://abc123/draft.md',
      filePath: null,
      fileId: 'abc123',
      fileName: 'draft.md',
      isUnsaved: true
    });
  });

  test('returns null for invalid tokens', () => {
    expect(parseFileReferenceToken('#src/demo.ts nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run: `pnpm vitest run test/components/BChatSidebar/chipResolver.test.ts`

Expected: FAIL with missing `parseFileReferenceToken` export or assertions that still reference `parseFileRef`.

- [ ] **Step 3: Implement shared file-reference parser and types**

```ts
// src/utils/fileReference/types.ts
/**
 * 文件引用解析结果
 */
export interface ParsedFileReference {
  rawPath: string;
  filePath: string | null;
  fileId: string | null;
  fileName: string;
  startLine: number;
  endLine: number;
  renderStartLine: number;
  renderEndLine: number;
  lineText: string;
  isUnsaved: boolean;
}

/**
 * 文件引用导航目标
 */
export interface FileReferenceNavigationTarget {
  rawPath: string;
  filePath: string | null;
  fileId: string | null;
  fileName: string;
  startLine: number;
  endLine: number;
}
```

```ts
// src/utils/fileReference/parseToken.ts
const FILE_REFERENCE_TOKEN_PATTERN = /^#(\S+)\s+(\d+)-(\d+)(?:\|(\d+)-(\d+))?$/;

/**
 * 解析文件引用 token。
 * @param tokenContent - token 内容
 * @returns 结构化解析结果；非法格式返回 null
 */
export function parseFileReferenceToken(tokenContent: string): ParsedFileReference | null {
  const match = tokenContent.match(FILE_REFERENCE_TOKEN_PATTERN);
  if (!match) return null;

  const [, rawPath, startLineText, endLineText, renderStartText, renderEndText] = match;
  const normalizedPath = rawPath.trim();
  const unsavedMatch = normalizedPath.match(/^unsaved:\/\/([^/]+)\/(.+)$/);
  const fileName = normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? normalizedPath;
  const startLine = Number(startLineText);
  const endLine = Number(endLineText);

  return {
    rawPath: normalizedPath,
    filePath: unsavedMatch ? null : normalizedPath,
    fileId: unsavedMatch ? unsavedMatch[1] : null,
    fileName,
    startLine,
    endLine,
    renderStartLine: renderStartText ? Number(renderStartText) : startLine,
    renderEndLine: renderEndText ? Number(renderEndText) : endLine,
    lineText: `${startLine}-${endLine}`,
    isUnsaved: Boolean(unsavedMatch)
  };
}
```

- [ ] **Step 4: Rewire chat parsing callers to the shared utility**

```ts
// src/components/BChatSidebar/utils/chipResolver.ts
import { parseFileReferenceToken } from '@/utils/fileReference/parseToken';

export const chipResolver: ChipResolver = (content) => {
  if (!content.startsWith('#')) return null;

  const parsed = parseFileReferenceToken(content);
  if (!parsed) return null;

  return { widget: new FileRefWidget(parsed) };
};
```

```ts
// src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue
interface FileRefSegment {
  type: 'fileRef';
  fullPath: string | null;
  fileId: string | null;
  fileName: string;
  lineText: string;
  startLine: number;
  endLine: number;
  isUnsaved: boolean;
}

const parsed = parseFileReferenceToken(`#${filePath} ${startLine}-${endLine}`);
if (parsed) {
  result.push({
    type: 'fileRef',
    fullPath: parsed.filePath,
    fileId: parsed.fileId,
    fileName: parsed.fileName,
    lineText: parsed.lineText,
    startLine: parsed.startLine,
    endLine: parsed.endLine,
    isUnsaved: parsed.isUnsaved
  });
}
```

- [ ] **Step 5: Add bubble rendering regression coverage**

```ts
test('renders parsed file reference segments with filename and line text', () => {
  const wrapper = mount(BubblePartUserInput, {
    props: {
      part: {
        type: 'text',
        text: 'See {{#unsaved://abc123/draft.md 3-5|3-5}} now'
      }
    }
  });

  expect(wrapper.text()).toContain('draft.md');
  expect(wrapper.text()).toContain('3-5');
});
```

- [ ] **Step 6: Run parsing and rendering tests**

Run: `pnpm vitest run test/components/BChatSidebar/chipResolver.test.ts test/components/BChatSidebar/bubblePartUserInput.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/utils/fileReference/types.ts src/utils/fileReference/parseToken.ts src/components/BChatSidebar/utils/chipResolver.ts src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue test/components/BChatSidebar/chipResolver.test.ts test/components/BChatSidebar/bubblePartUserInput.test.ts
git commit -m "feat: unify chat file reference parsing"
```

### Task 2: General Open-File Entry and Selection Intent Store

**Files:**
- Create: `src/stores/fileSelectionIntent.ts`
- Modify: `src/hooks/useNavigate.ts`
- Modify: `src/hooks/useOpenFile.ts`
- Test: `test/hooks/useNavigate.test.ts`

- [ ] **Step 1: Write failing navigation-intent tests**

```ts
test('openFile opens by path and records a selection intent', async () => {
  const { openFile } = useNavigate();

  await openFile({
    filePath: '/tmp/demo.md',
    range: {
      startLine: 4,
      endLine: 6
    }
  });

  expect(openFileByPathMock).toHaveBeenCalledWith('/tmp/demo.md');
  expect(fileSelectionIntentStore.intent).toMatchObject({
    fileId: 'file-1',
    startLine: 4,
    endLine: 6
  });
});

test('openFile does not write intent when no range is provided', async () => {
  await openFile({ fileId: 'draft-1' });
  expect(fileSelectionIntentStore.intent).toBeNull();
});
```

- [ ] **Step 2: Run the navigation tests to verify they fail**

Run: `pnpm vitest run test/hooks/useNavigate.test.ts`

Expected: FAIL with missing `openFile` method and missing `fileSelectionIntent` store.

- [ ] **Step 3: Add the one-shot selection intent store**

```ts
// src/stores/fileSelectionIntent.ts
/**
 * 文件选区意图
 */
export interface FileSelectionIntent {
  intentId: string;
  fileId: string;
  startLine: number;
  endLine: number;
}

export const useFileSelectionIntentStore = defineStore('fileSelectionIntent', () => {
  const intent = ref<FileSelectionIntent | null>(null);

  function setIntent(nextIntent: FileSelectionIntent): void {
    intent.value = nextIntent;
  }

  function clearIntent(intentId: string): void {
    if (intent.value?.intentId === intentId) {
      intent.value = null;
    }
  }

  return {
    intent,
    setIntent,
    clearIntent
  };
});
```

- [ ] **Step 4: Extend `useOpenFile()` and `useNavigate()`**

```ts
// src/hooks/useOpenFile.ts
async function openFileByPath(path: string): Promise<StoredFile | null> {
  const openedFile = await filesStore.openOrCreateByPath(path);
  if (!openedFile) return null;

  await router.push({ name: 'editor', params: { id: openedFile.id } });
  return openedFile;
}

return { openFile, openFileById, openFileByPath, openNativeFile, createNewFile };
```

```ts
// src/hooks/useNavigate.ts
async function openFile(options: OpenFileOptions): Promise<void> {
  if (navigating.value) return;
  navigating.value = true;

  try {
    const openedFile = options.filePath
      ? await openFileActions.openFileByPath(options.filePath)
      : options.fileId
        ? await openFileActions.openFileById(options.fileId)
        : null;

    if (!openedFile) {
      toast.error(options.fileId ? '未找到引用草稿' : '未找到引用文件');
      return;
    }

    if (options.range) {
      fileSelectionIntentStore.setIntent({
        intentId: createIntentId(),
        fileId: openedFile.id,
        startLine: Math.max(1, options.range.startLine),
        endLine: Math.max(options.range.startLine, options.range.endLine)
      });
    }
  } finally {
    navigating.value = false;
  }
}
```

- [ ] **Step 5: Verify navigation tests pass**

Run: `pnpm vitest run test/hooks/useNavigate.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/fileSelectionIntent.ts src/hooks/useNavigate.ts src/hooks/useOpenFile.ts test/hooks/useNavigate.test.ts
git commit -m "feat: add generic open-file navigation intent"
```

### Task 3: Wire Chat Bubble and Prompt Chip Click Navigation

**Files:**
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue`
- Modify: `src/components/BChatSidebar/utils/chipResolver.ts`
- Test: `test/components/BChatSidebar/chipResolver.test.ts`
- Test: `test/components/BChatSidebar/bubblePartUserInput.test.ts`

- [ ] **Step 1: Add failing interaction tests**

```ts
test('bubble file chip calls openFile with source line range', async () => {
  const openFile = vi.fn();
  vi.mock('@/hooks/useNavigate', () => ({
    useNavigate: () => ({ openFile })
  }));

  const wrapper = mount(BubblePartUserInput, {
    props: {
      part: {
        type: 'text',
        text: 'See {{#src/demo.ts 8-10|20-22}}'
      }
    }
  });

  await wrapper.get('[role="button"]').trigger('click');

  expect(openFile).toHaveBeenCalledWith({
    filePath: 'src/demo.ts',
    fileId: null,
    fileName: 'demo.ts',
    range: { startLine: 8, endLine: 10 }
  });
});

test('chipResolver widget triggers onOpenFile on click and keyboard', async () => {
  const onOpenFile = vi.fn();
  const resolver = createFileRefChipResolver(onOpenFile);
  const result = resolver('#src/demo.ts 8-10|20-22');
  const dom = (result!.widget as { toDOM: () => HTMLElement }).toDOM();

  dom.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  expect(onOpenFile).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run chat interaction tests to verify they fail**

Run: `pnpm vitest run test/components/BChatSidebar/chipResolver.test.ts test/components/BChatSidebar/bubblePartUserInput.test.ts`

Expected: FAIL because chips are still non-clickable and `createFileRefChipResolver` does not exist yet.

- [ ] **Step 3: Make bubble chips clickable and accessible**

```vue
<span
  v-else
  :class="bem('chip')"
  :title="segment.fullPath ?? segment.fileName"
  role="button"
  tabindex="0"
  @click="onChipClick(segment)"
  @keydown.enter.prevent="onChipClick(segment)"
  @keydown.space.prevent="onChipClick(segment)"
>
```

```ts
function onChipClick(segment: FileRefSegment): void {
  openFile({
    filePath: segment.fullPath,
    fileId: segment.fileId,
    fileName: segment.fileName,
    range: {
      startLine: segment.startLine,
      endLine: segment.endLine
    }
  });
}
```

- [ ] **Step 4: Convert prompt chips to an injected resolver factory**

```ts
export function createFileRefChipResolver(
  onOpenFile: (target: FileReferenceNavigationTarget) => void
): ChipResolver {
  return (content) => {
    const parsed = parseFileReferenceToken(content);
    if (!parsed) return null;

    return {
      widget: new FileRefWidget(parsed, onOpenFile)
    };
  };
}
```

```ts
toDOM(): HTMLElement {
  const span = document.createElement('span');
  span.tabIndex = 0;
  span.setAttribute('role', 'button');

  span.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  span.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    this.onOpenFile(toNavigationTarget(this.location));
  });
  span.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onOpenFile(toNavigationTarget(this.location));
    }
  });

  return span;
}
```

- [ ] **Step 5: Re-run the chat interaction tests**

Run: `pnpm vitest run test/components/BChatSidebar/chipResolver.test.ts test/components/BChatSidebar/bubblePartUserInput.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue src/components/BChatSidebar/utils/chipResolver.ts test/components/BChatSidebar/chipResolver.test.ts test/components/BChatSidebar/bubblePartUserInput.test.ts
git commit -m "feat: make chat file references clickable"
```

### Task 4: Editor Intent Consumption and Source-Mode Selection

**Files:**
- Create: `src/views/editor/hooks/useFileSelection.ts`
- Modify: `src/views/editor/index.vue`
- Modify: `src/components/BMarkdown/adapters/types.ts`
- Modify: `src/components/BMarkdown/index.vue`
- Modify: `src/components/BMarkdown/components/PaneSourceEditor.vue`
- Test: `test/views/editor/useFileSelection.test.ts`
- Test: `test/components/BMarkdown/paneSourceEditor.selectLineRange.test.ts`

- [ ] **Step 1: Add failing editor-consumption tests**

```ts
test('useFileSelection consumes matching intent after editor becomes ready', async () => {
  const editorInstance = ref({
    selectLineRange: vi.fn().mockResolvedValue(true)
  });
  const fileState = ref({ id: 'file-1' });
  const isEditorReady = ref(true);

  fileSelectionIntentStore.setIntent({
    intentId: 'intent-1',
    fileId: 'file-1',
    startLine: 4,
    endLine: 6
  });

  useFileSelection({ fileState, isEditorReady, editorInstance });
  await nextTick();

  expect(editorInstance.value.selectLineRange).toHaveBeenCalledWith(4, 6);
  expect(fileSelectionIntentStore.intent).toBeNull();
});
```

```ts
test('source editor selectLineRange selects full line range and scrolls into view', async () => {
  const wrapper = mount(PaneSourceEditor, { /* minimal editor props */ });
  const controller = wrapper.vm as unknown as { selectLineRange: (start: number, end: number) => boolean };

  expect(controller.selectLineRange(2, 3)).toBe(true);
  expect(getCurrentSelection(wrapper)).toEqual({ startLine: 2, endLine: 3 });
});
```

- [ ] **Step 2: Run the editor tests to verify they fail**

Run: `pnpm vitest run test/views/editor/useFileSelection.test.ts test/components/BMarkdown/paneSourceEditor.selectLineRange.test.ts`

Expected: FAIL with missing `useFileSelection` and missing `selectLineRange` method on `BMarkdownPublicInstance`.

- [ ] **Step 3: Add the editor-page hook and public API**

```ts
// src/views/editor/hooks/useFileSelection.ts
export function useFileSelection(options: UseFileSelectionOptions): void {
  const fileSelectionIntentStore = useFileSelectionIntentStore();

  watch(
    [
      () => options.fileState.value.id,
      () => fileSelectionIntentStore.intent?.intentId,
      () => options.isEditorReady.value,
      options.editorInstance
    ],
    async () => {
      const intent = fileSelectionIntentStore.intent;
      if (!intent) return;
      if (!options.isEditorReady.value) return;
      if (options.fileState.value.id !== intent.fileId) return;
      if (!options.editorInstance.value) return;

      await nextTick();
      const consumed = await options.editorInstance.value.selectLineRange(intent.startLine, intent.endLine);
      if (consumed) {
        fileSelectionIntentStore.clearIntent(intent.intentId);
      }
    },
    { immediate: true }
  );
}
```

```ts
// src/components/BMarkdown/adapters/types.ts
export interface EditorController {
  // ...
  selectLineRange: (startLine: number, endLine: number) => boolean | Promise<boolean>;
}
```

- [ ] **Step 4: Implement source-mode `selectLineRange()`**

```ts
function selectLineRange(startLine: number, endLine: number): boolean {
  const view = editorView.value;
  if (!view) return false;

  const totalLines = view.state.doc.lines;
  const safeStartLine = Math.min(Math.max(1, startLine), totalLines);
  const safeEndLine = Math.min(Math.max(safeStartLine, endLine), totalLines);
  const fromLine = view.state.doc.line(safeStartLine);
  const toLine = view.state.doc.line(safeEndLine);

  view.dispatch({
    selection: EditorSelection.range(fromLine.from, toLine.to),
    scrollIntoView: true
  });
  view.focus();
  return true;
}
```

- [ ] **Step 5: Wire the hook into the editor page**

```ts
const isEditorReady = ref(false);

useFileSelection({
  fileState,
  isEditorReady,
  editorInstance: editorRef
});
```

```vue
<BMarkdown
  ref="editorRef"
  @ready="isEditorReady = true"
/>
```

- [ ] **Step 6: Run the editor-selection tests**

Run: `pnpm vitest run test/views/editor/useFileSelection.test.ts test/components/BMarkdown/paneSourceEditor.selectLineRange.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/views/editor/hooks/useFileSelection.ts src/views/editor/index.vue src/components/BMarkdown/adapters/types.ts src/components/BMarkdown/index.vue src/components/BMarkdown/components/PaneSourceEditor.vue test/views/editor/useFileSelection.test.ts test/components/BMarkdown/paneSourceEditor.selectLineRange.test.ts
git commit -m "feat: consume file selection intent in editor"
```

### Task 5: Rich-Mode Reverse Mapping and End-to-End Navigation Coverage

**Files:**
- Modify: `src/components/BMarkdown/adapters/sourceLineMapping.ts`
- Modify: `src/components/BMarkdown/components/PaneRichEditor.vue`
- Modify: `src/components/BMarkdown/index.vue`
- Test: `test/components/BMarkdown/sourceLineMapping.test.ts`
- Test: `test/components/BMarkdown/sourceLineMapping.integration.test.ts`
- Test: `test/components/BMarkdown/paneRichEditor.selectLineRange.test.ts`

- [ ] **Step 1: Add failing reverse-mapping tests**

```ts
it('maps source line ranges back to ProseMirror positions', () => {
  const doc = testSchema.node('doc', undefined, [
    testSchema.node('paragraph', { sourceLineStart: 5, sourceLineEnd: 6 }, [testSchema.text('alpha\nbeta')])
  ]);

  expect(mapSourceLineRangeToProseMirrorRange(doc, 6, 6)).toEqual({
    from: 8,
    to: 12,
    exact: true
  });
});
```

```ts
test('rich editor selectLineRange applies text selection and AI highlight', async () => {
  const wrapper = mount(PaneRichEditor, { /* minimal rich editor props */ });
  const controller = wrapper.vm as unknown as { selectLineRange: (start: number, end: number) => Promise<boolean> };

  await expect(controller.selectLineRange(5, 6)).resolves.toBe(true);
  expect(setAISelectionHighlightMock).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the rich-mode tests to verify they fail**

Run: `pnpm vitest run test/components/BMarkdown/sourceLineMapping.test.ts test/components/BMarkdown/sourceLineMapping.integration.test.ts test/components/BMarkdown/paneRichEditor.selectLineRange.test.ts`

Expected: FAIL with missing `mapSourceLineRangeToProseMirrorRange` and no `selectLineRange` implementation in the rich editor.

- [ ] **Step 3: Implement reverse mapping in `sourceLineMapping.ts`**

```ts
export interface LineRangeMappingResult {
  from: number;
  to: number;
  exact: boolean;
}

export function mapSourceLineRangeToProseMirrorRange(
  doc: ProseMirrorNode,
  startLine: number,
  endLine: number
): LineRangeMappingResult | null {
  let mappedFrom: number | null = null;
  let mappedTo: number | null = null;

  doc.descendants((node, pos) => {
    const range = getNodeSourceLineRange(node);
    if (!range) return;
    if (range.startLine > endLine || range.endLine < startLine) return;

    mappedFrom ??= pos + 1;
    mappedTo = pos + node.content.size + 1;
  });

  if (mappedFrom === null || mappedTo === null) {
    return null;
  }

  return {
    from: mappedFrom,
    to: mappedTo,
    exact: true
  };
}
```

- [ ] **Step 4: Add rich-editor selection behavior**

```ts
async function selectLineRange(startLine: number, endLine: number): Promise<boolean> {
  const editor = editorRef.value;
  if (!editor) return false;

  const result = mapSourceLineRangeToProseMirrorRange(editor.state.doc, startLine, endLine);
  if (!result) return false;

  editor.commands.setTextSelection({
    from: result.from,
    to: result.to
  });
  setAISelectionHighlight(result.from, result.to);
  editor.commands.focus();
  return true;
}
```

- [ ] **Step 5: Re-run the rich-mode tests**

Run: `pnpm vitest run test/components/BMarkdown/sourceLineMapping.test.ts test/components/BMarkdown/sourceLineMapping.integration.test.ts test/components/BMarkdown/paneRichEditor.selectLineRange.test.ts`

Expected: PASS

- [ ] **Step 6: Run the focused full regression suite**

Run: `pnpm vitest run test/components/BChatSidebar/chipResolver.test.ts test/components/BChatSidebar/bubblePartUserInput.test.ts test/hooks/useNavigate.test.ts test/views/editor/useFileSelection.test.ts test/components/BMarkdown/sourceLineMapping.test.ts test/components/BMarkdown/sourceLineMapping.integration.test.ts test/components/BMarkdown/paneSourceEditor.selectLineRange.test.ts test/components/BMarkdown/paneRichEditor.selectLineRange.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/BMarkdown/adapters/sourceLineMapping.ts src/components/BMarkdown/components/PaneRichEditor.vue src/components/BMarkdown/index.vue test/components/BMarkdown/sourceLineMapping.test.ts test/components/BMarkdown/sourceLineMapping.integration.test.ts test/components/BMarkdown/paneRichEditor.selectLineRange.test.ts
git commit -m "feat: support rich editor file reference navigation"
```
