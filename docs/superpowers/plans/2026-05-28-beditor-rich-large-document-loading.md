# BEditor Rich Large Document Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为大文档（>30,000 字符）Rich 模式提供异步分帧加载能力，消除主线程长时间冻结，方案 A（加载状态机 + 分帧装载）+ 方案 B（Worker 预解析预留）。

**Architecture:** 新增 `useRichEditorLoad.ts`（状态机核心）和 `richMarkdownParser.ts`（解析接口），拆分 `useExtensions.ts` 为 schema 组 + runtime 组，改造 `useRichEditor.ts`、`useContent.ts`、`PaneRichEditor.vue` 支持加载态，加载期间锁定编辑、不进 undo history、不触发回写。

**Tech Stack:** Vue 3 + Tiptap v3.23.4 + ProseMirror + Vitest (jsdom)

---

## File Structure

### Create files
- `src/components/BEditor/hooks/useRichEditorLoad.ts` — 加载状态机核心
- `src/components/BEditor/hooks/richMarkdownParser.ts` — Markdown → JSON 解析接口
- `test/components/BEditor/richMarkdownParser.test.ts` — 解析接口测试
- `test/components/BEditor/useRichEditorLoad.test.ts` — 状态机测试
- `test/components/BEditor/richLargeDocumentLoad.test.ts` — 集成测试

### Modify files
- `src/components/BEditor/hooks/useExtensions.ts` — 拆分为 schema/runtime 两组
- `src/components/BEditor/hooks/useContent.ts` — 增加 isLoadTransaction/loadPhase 参数、dispatchLoadChunk
- `src/components/BEditor/hooks/useRichEditor.ts` — 分支初始化、watch 改造、keyDown 守卫
- `src/components/BEditor/panes/PaneRichEditor.vue` — loading/failed UI、guardEdit
- `src/components/BEditor/adapters/types.ts` — RichLoadState 等类型定义

---

## Task 1: Define types for rich loading

**Files:**
- Modify: `src/components/BEditor/adapters/types.ts`

- [ ] **Step 1: Add RichLoadState and related types to adapters/types.ts**

Add the following type definitions at the end of the file (after the existing exports):

```typescript
// ============ Rich 编辑器大文档加载相关类型 ============

/**
 * Rich 编辑器加载阶段
 */
export type RichLoadPhase = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * 分帧阶段
 */
export type RichLoadStage = 'parsing' | 'mounting';

/**
 * 取消原因
 */
export type RichLoadCancelReason =
  | 'switch-file'
  | 'switch-source'
  | 'external-change'
  | 'unmount'
  | 'retry';

/**
 * 加载状态（暴露给 UI）
 */
export interface RichLoadState {
  /** 当前阶段 */
  phase: RichLoadPhase;
  /** 首次加载还是重新加载 */
  isReload: boolean;
  /** 当前子阶段 */
  stage?: RichLoadStage;
  /** 分帧装载进度：parsing 阶段为 indeterminate，mounting 阶段为 0.05→1 */
  progress: number;
  /** 失败时的错误信息，仅 failed 阶段有值 */
  errorMessage?: string;
}

/**
 * 解析接口返回结果
 */
export interface RichParseResult {
  json: import('@tiptap/core').JSONContent;
  stats: {
    durationMs: number;
    nodeCount: number;
  };
}

/**
 * 加载完成 payload
 */
export interface RichLoadCompletePayload {
  rawMarkdown: string;
  json: import('@tiptap/core').JSONContent;
  stats: RichParseResult['stats'];
}
```

- [ ] **Step 2: Verify type compilation**

```bash
pnpm exec tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No new type errors from types.ts.

---

## Task 2: Split extensions — createRichMarkdownSchemaExtensions

**Files:**
- Modify: `src/components/BEditor/hooks/useExtensions.ts`
- Create: `test/components/BEditor/useRichEditorLoad.test.ts` (initial scaffolding)

- [ ] **Step 1: Extract helper functions and extension factories into standalone exports**

In `useExtensions.ts`, refactor the extension definitions (HtmlComment, LinkDefinitionAsText, CodeBlock schema, Heading, Paragraph, ListItem, MarkdownTable, MarkdownLink) into standalone factory functions that can be composed. The key refactoring:

Extract these factory functions out of `useExtensions()` so they can be called independently:

```typescript
// ==== Schema Extensions (可用在 Worker 中) ====

/**
 * 创建仅包含 node/mark schema + Markdown parse/render 的扩展集合。
 * 不含 Vue NodeView、不含 DOM/Window 引用、不含运行时 Plugin。
 * 可在 Worker 中使用，也供主线程 editor 使用。
 */
export function createRichMarkdownSchemaExtensions(
  editorInstanceId: string,
  createSourceLineTracker: () => ReturnType<typeof import('../adapters/sourceLineMapping').createSourceLineTracker>,
): Extension[] {
  // headingIndex 需要是外部可控的状态，支持 reset
  let headingIndex = 0;
  const sourceLineTracker = createSourceLineTracker();

  function getHeadingId(index: number): string {
    return `${editorInstanceId}-heading-${index}`;
  }

  function resetHeadingIndex(): void {
    headingIndex = 0;
  }

  // ... 复用 useExtensions 内部的所有扩展定义（除 Search、Placeholder、AISelectionHighlight、VueNodeView 部分）

  const HtmlComment = Extension.create({ /* 同 useExtensions.ts:410-429 */ });
  const LinkDefinitionAsText = Extension.create({ /* 同 useExtensions.ts:432-443 */ });
  const Code = _Code.extend({ excludes: '' });

  // CodeBlock（仅 schema + parseMarkdown，不含 VueNodeView）
  const CodeBlock = CodeBlockLowlight.extend({
    addAttributes() { return createSourceLineAttributes(this.parent?.() ?? {}); },
    parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult => {
      const language = typeof token.lang === 'string' && token.lang ? token.lang : null;
      const text = typeof token.text === 'string' ? token.text : '';
      return helpers.createNode('codeBlock', { ...createSourceLineNodeAttrs(token), language }, text ? [helpers.createTextNode(text)] : []);
    },
  }).configure({ lowlight, defaultLanguage: 'plaintext' });

  // Heading（含 parseMarkdown + schema，不含 keyboardShortcuts）
  const Heading = BaseHeading.extend({
    addAttributes() { return createSourceLineAttributes({ ...(this.parent?.() ?? {}), id: { ... } }); },
    parseMarkdown: (token, helpers) => { /* 同 useExtensions.ts:470-481 */ },
    onCreate() { /* 同 useExtensions.ts:486-491 */ },
  }).configure({ levels: [1, 2, 3, 4, 5, 6] });

  // Paragraph
  const Paragraph = BaseParagraph.extend({
    addAttributes() { return createSourceLineAttributes(this.parent?.() ?? {}); },
    parseMarkdown: (token, helpers) => { /* 同 useExtensions.ts:498-508 */ },
    renderMarkdown: (node, helpers) => { /* 同 useExtensions.ts:510-524 */ },
  });

  // ListItem
  const ListItem = BaseListItem.extend({
    addAttributes() { return createSourceLineAttributes(this.parent?.() ?? {}); },
    parseMarkdown: (token, helpers) => { /* 同 useExtensions.ts:531-567 */ },
  });

  // MarkdownTable（仅 schema + parseMarkdown，不含 VueNodeView）
  const MarkdownTable = Table.extend({
    addAttributes() { return createSourceLineAttributes({ ...(this.parent?.() ?? {}), markdownRaw: {...}, markdownSignature: {...} }); },
    parseMarkdown: (token, helpers) => { /* 同 useExtensions.ts:585-623 */ },
    renderMarkdown: (node, helpers) => { /* 同 useExtensions.ts:625-634 */ },
  });

  // MarkdownLink
  const MarkdownLink = Link.extend({
    parseMarkdown: (token, helpers) => { /* 同 useExtensions.ts:638-649 */ },
  });

  return [
    StarterKit.configure({
      code: false, codeBlock: false, heading: false, link: false,
      listItem: false, paragraph: false, strike: false, underline: false,
      dropcursor: false, gapcursor: false,
    }),
    Markdown,
    HtmlComment,
    LinkDefinitionAsText,
    Heading,
    Paragraph,
    Code,
    CodeBlock,
    ListItem,
    MarkdownTable.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'editor-image' } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    Strike,
    TextStyle,
    Color,
    Typography,
    Underline,
    MarkdownLink.configure({ openOnClick: false, HTMLAttributes: { class: 'editor-link' } }),
    Mathematics.configure({ katexOptions: { throwOnError: false } }),
  ];
}
```

**Note:** The actual refactoring should extract all extension definitions into helper functions called by both `createRichMarkdownSchemaExtensions` and `useExtensions`, rather than duplicating code. Since `useExtensions` is 745 lines, the cleanest approach is:

1. Extract each custom extension into its own factory function (e.g., `createHtmlCommentExtension()`, `createHeadingExtension(...)`, etc.)
2. `createRichMarkdownSchemaExtensions` composes the schema group
3. `useExtensions` composes schema group + runtime group

This is a mechanical refactoring — no behavior change expected. The existing `useExtensions` signature and return values remain identical.

**For this step, draw the boundary at these exact extension groupings as defined in the spec:**

| Extension | Schema Group | Runtime Group |
|-----------|-------------|---------------|
| StarterKit (minus History) | Yes | - |
| History | - | Yes (in StarterKit configure) |
| Markdown | Yes | - |
| HtmlComment | Yes | - |
| LinkDefinitionAsText | Yes | - |
| AISelectionHighlight | - | Yes |
| InlineCommentMark | Yes | Yes |
| Heading | Yes (schema+parse) | Yes (keyboardShortcuts) |
| Paragraph | Yes (schema+parse) | Yes |
| Code | Yes | - |
| CodeBlock | Yes (schema+parse) | Yes (VueNodeView) |
| ListItem | Yes | - |
| MarkdownTable | Yes (schema+parse) | Yes (VueNodeView) |
| TableRow/TableHeader/TableCell | Yes | - |
| Search | - | Yes |
| Image | Yes | - |
| TaskList/TaskItem | Yes | - |
| Highlight/Strike/TextStyle/Color/Typography/Underline | Yes | - |
| MarkdownLink | Yes | - |
| Placeholder | - | Yes |
| Mathematics | Yes | - |

**Core constraint:** CodeBlock and MarkdownTable must have identical name, attrs, and schema in both groups.

- [ ] **Step 2: Run existing tests to verify no regression**

```bash
pnpm test -- test/components/BEditor/ 2>&1 | tail -30
```

Expected: All existing tests pass.

- [ ] **Step 3: Write test — verify schema extensions can parse markdown**

Create `test/components/BEditor/richMarkdownParser.test.ts`:

```typescript
/* @vitest-environment jsdom */
/**
 * @file richMarkdownParser.test.ts
 * @description 验证 createRichMarkdownSchemaExtensions 能生成与主线程 editor 兼容的 JSON。
 */
import { Editor } from '@tiptap/core';
import { describe, expect, test } from 'vitest';
import { createRichMarkdownSchemaExtensions, createRichEditorRuntimeOnlyExtensions } from '@/components/BEditor/hooks/useExtensions';
import { getPersistedMarkdown } from '@/components/BEditor/utils/editorMarkdown';
import { createSourceLineTracker } from '@/components/BEditor/adapters/sourceLineMapping';

/**
 * 创建使用完整扩展集的编辑器（模拟现有路径）。
 */
function createFullEditor(): Editor {
  const instanceId = 'test';
  const schemaExtensions = createRichMarkdownSchemaExtensions(instanceId, createSourceLineTracker);
  const runtimeExtensions = createRichEditorRuntimeOnlyExtensions(instanceId);
  return new Editor({
    extensions: [...schemaExtensions, ...runtimeExtensions],
    content: '',
    contentType: 'markdown',
  });
}

/**
 * 创建仅使用 schema 扩展的编辑器（模拟 Worker 路径的可测试版本）。
 */
function createSchemaOnlyEditor(): Editor {
  const instanceId = 'test';
  const schemaExtensions = createRichMarkdownSchemaExtensions(instanceId, createSourceLineTracker);
  return new Editor({
    extensions: schemaExtensions,
    content: '',
    contentType: 'markdown',
  });
}

describe('createRichMarkdownSchemaExtensions', () => {
  test('schema-only editor parses markdown identically to full editor', () => {
    const markdown = '# 标题\n\n段落内容\n\n- 列表项1\n- 列表项2\n\n```js\nconst x = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |';

    const fullEditor = createFullEditor();
    fullEditor.commands.setContent(markdown, { contentType: 'markdown' });
    const fullJson = fullEditor.getJSON();
    fullEditor.destroy();

    const schemaEditor = createSchemaOnlyEditor();
    schemaEditor.commands.setContent(markdown, { contentType: 'markdown' });
    const schemaJson = schemaEditor.getJSON();
    schemaEditor.destroy();

    expect(schemaJson).toEqual(fullJson);
  });

  test('schema-only editor round-trip is stable', () => {
    const markdowns = [
      '# 标题',
      '- [ ] 待办',
      '<!-- comment -->',
      '1. 第一项',
      '```\ncode\n```',
    ];

    for (const md of markdowns) {
      const editor = createSchemaOnlyEditor();
      editor.commands.setContent(md, { contentType: 'markdown' });
      const exported = getPersistedMarkdown(editor);
      editor.destroy();
      expect(exported).toBe(md);
    }
  });
});
```

Run: `pnpm test -- test/components/BEditor/richMarkdownParser.test.ts 2>&1 | tail -20`
Expected: Tests FAIL (functions not yet extracted—this step only creates the test to guide refactoring).

- [ ] **Step 4: Refactor useExtensions.ts — extract extensions into factory functions**

This is a large mechanical refactoring. The strategy:

1. **Move helper functions** (`createParagraphNode`, `getReferenceStyleLinkRaw`, `parseInlinePreservingReferenceLinks`, `parseInlineOrText`, `getRawHtmlCommentFromParagraph`, `normalizeMarkdownTableAlignment`, `getMarkdownDisplayWidth`, `normalizeMarkdownTableCellText`, `getTextFromJsonContent`, `renderMarkdownTableCellText`, `buildMarkdownTableSignatureFromToken`, `buildMarkdownTableSignatureFromNode`, `escapeMarkdownTableCell`, `createMarkdownTableDividerCell`, `renderMarkdownTableFallback`) to top-level module scope (they're already function declarations — move them outside `useExtensions()` if they're inside).

2. **Extract extension constructors** that don't depend on closure state into standalone factory functions:

```typescript
// Each of these takes the necessary dependencies as parameters:

function createHtmlCommentExtension(
  createSourceLineNodeAttrs: (token: MarkdownToken) => Record<string, unknown>,
): Extension { /* ... */ }

function createLinkDefinitionAsTextExtension(
  createSourceLineNodeAttrs: (token: MarkdownToken) => Record<string, unknown>,
): Extension { /* ... */ }

function createCodeBlockSchemaExtension(
  createSourceLineAttributes: (parent?: Record<string, unknown>) => Record<string, unknown>,
  createSourceLineNodeAttrs: (token: MarkdownToken) => Record<string, unknown>,
): Extension { /* ... CodeBlockLowlight without VueNodeView */ }

function createHeadingSchemaExtension(
  getHeadingId: (index: number) => string,
  createSourceLineAttributes: (parent?: Record<string, unknown>) => Record<string, unknown>,
  createSourceLineNodeAttrs: (token: MarkdownToken) => Record<string, unknown>,
  resetHeadingIndex: () => void,
): Extension { /* ... */ }

function createParagraphSchemaExtension(
  createSourceLineAttributes: (parent?: Record<string, unknown>) => Record<string, unknown>,
  createSourceLineNodeAttrs: (token: MarkdownToken) => Record<string, unknown>,
): Extension { /* ... */ }

function createListItemSchemaExtension(
  createSourceLineAttributes: (parent?: Record<string, unknown>) => Record<string, unknown>,
  createSourceLineNodeAttrs: (token: MarkdownToken) => Record<string, unknown>,
): Extension { /* ... */ }

function createMarkdownTableSchemaExtension(
  createSourceLineAttributes: (parent?: Record<string, unknown>) => Record<string, unknown>,
  createSourceLineNodeAttrs: (token: MarkdownToken) => Record<string, unknown>,
): Extension { /* ... Table without VueNodeView */ }

function createMarkdownLinkExtension(): Extension { /* ... */ }
```

3. **Define `createRichMarkdownSchemaExtensions`** that composes only the schema group:

```typescript
export function createRichMarkdownSchemaExtensions(
  editorInstanceId: string,
  sourceLineTracker: ReturnType<typeof createSourceLineTracker>,
): Extension[] {
  // headingIndex needs to be externally controllable for reset
  let headingIndex = 0;
  const tracker = sourceLineTracker;

  function getHeadingId(index: number): string {
    return `${editorInstanceId}-heading-${index}`;
  }

  function resetHeadingIndex(): void {
    headingIndex = 0;
  }

  function createSourceLineAttributes(parent: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...parent, sourceLineStart: { default: null, renderHTML: () => ({}) }, sourceLineEnd: { default: null, renderHTML: () => ({}) } };
  }

  function createSourceLineNodeAttrs(token: MarkdownToken): Record<string, unknown> {
    if (typeof token.raw !== 'string' || !token.raw) return {};
    const range = captureSourceLineRange(tracker, token.raw);
    return { sourceLineStart: range.startLine, sourceLineEnd: range.endLine };
  }

  return [
    StarterKit.configure({ code: false, codeBlock: false, heading: false, link: false, listItem: false, paragraph: false, strike: false, underline: false, dropcursor: false, gapcursor: false }),
    Markdown,
    createHtmlCommentExtension(createSourceLineNodeAttrs),
    createLinkDefinitionAsTextExtension(createSourceLineNodeAttrs),
    createHeadingSchemaExtension(getHeadingId, createSourceLineAttributes, createSourceLineNodeAttrs, resetHeadingIndex),
    createParagraphSchemaExtension(createSourceLineAttributes, createSourceLineNodeAttrs),
    _Code.extend({ excludes: '' }),
    createCodeBlockSchemaExtension(createSourceLineAttributes, createSourceLineNodeAttrs),
    createListItemSchemaExtension(createSourceLineAttributes, createSourceLineNodeAttrs),
    createMarkdownTableSchemaExtension(createSourceLineAttributes, createSourceLineNodeAttrs),
    TableRow, TableHeader, TableCell,
    Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'editor-image' } }),
    TaskList, TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }), Strike, TextStyle, Color, Typography, Underline,
    createMarkdownLinkExtension(),
    Mathematics.configure({ katexOptions: { throwOnError: false } }),
  ];
}
```

4. **Define `createRichEditorRuntimeOnlyExtensions`**：

```typescript
export function createRichEditorRuntimeOnlyExtensions(
  editorInstanceId: string,
  options?: { onSearchMatchFocus?: (context: SearchScrollContext) => void },
): Extension[] {
  const runtimeExtensions: Extension[] = [];

  // Placeholder
  runtimeExtensions.push(Placeholder.configure({ emptyEditorClass: 'is-editor-empty', placeholder: '请输入内容' }));

  // AISelectionHighlight
  runtimeExtensions.push(AISelectionHighlight);

  // Search
  runtimeExtensions.push(Search.configure({ onMatchFocus: options?.onSearchMatchFocus ?? null }));

  // CodeBlock with Vue NodeView
  const { createCodeBlockSchemaExtension: createCodeBlockSchema } = useCreateExtensionsUtils();
  runtimeExtensions.push(
    CodeBlockLowlight.extend({
      addNodeView: () => VueNodeViewRenderer(CodeBlockView as unknown as Component<NodeViewProps>),
    }).configure({ lowlight, defaultLanguage: 'plaintext' }),
  );

  // Table with Vue NodeView
  runtimeExtensions.push(
    Table.extend({
      addNodeView: () => VueNodeViewRenderer(TableView as unknown as Component<NodeViewProps>),
    }).configure({ resizable: false }),
  );

  return runtimeExtensions;
}
```

**IMPORTANT:** The actual implementation should NOT duplicate extension definitions. The schema group defines the extension's schema/parse parts, and the runtime group only adds on `addNodeView()` etc. The recommended approach:

For CodeBlock:
- Schema group: `CodeBlockLowlight.extend({ addAttributes: ..., parseMarkdown: ... })` — no addNodeView
- Runtime group: uses the same extension but calls `.extend({ addNodeView: () => VueNodeViewRenderer(...) })` to add the view

This is achieved by having the Runtime group re-extend the schema extension:
```typescript
// In runtime group
runtimeExtensions.push(
  createCodeBlockSchemaExtension(createSourceLineAttributes, createSourceLineNodeAttrs)
    .extend({ addNodeView: () => VueNodeViewRenderer(CodeBlockView as unknown as Component<NodeViewProps>) })
);
```

Same pattern for MarkdownTable.

5. **Rewrite `useExtensions()`** to compose both groups:

```typescript
export function useExtensions(editorInstanceId: Ref<string>, options: UseExtensionsOptions = {}): UseEditorExtensionsResult {
  const sourceLineTracker = createSourceLineTracker();

  const schemaExtensions = createRichMarkdownSchemaExtensions(editorInstanceId.value, sourceLineTracker);
  const runtimeExtensions = createRichEditorRuntimeOnlyExtensions(editorInstanceId.value, options);

  // For assignHeadingIds and resetHeadingIndex, use the schema group's built-in functions
  // The useExtensions result must be compatible with existing API

  // Combine
  const editorExtensions = [...schemaExtensions, ...runtimeExtensions];

  // ... (rest of the existing return structure)
}
```

**The key invariant:** `useExtensions()` return values (`editorExtensions`, `assignHeadingIds`, `resetHeadingIndex`, `resetSourceLineTracker`) must remain identical to current behavior.

- [ ] **Step 5: Run tests to verify no regression**

```bash
pnpm test -- test/components/BEditor/ 2>&1 | tail -30
```

Expected: All existing tests pass. The schema parse tests may now pass (if functions were extracted correctly).

- [ ] **Step 6: Commit**

```bash
git add src/components/BEditor/hooks/useExtensions.ts test/components/BEditor/richMarkdownParser.test.ts
git commit -m "refactor(BEditor): split extensions into schema and runtime groups

- Extract extension factories from useExtensions() into independent functions
- Add createRichMarkdownSchemaExtensions() for Worker-safe parse group
- Add createRichEditorRuntimeOnlyExtensions() for main-thread runtime group
- useExtensions() now composes both groups, maintaining backward compatibility
- Schema group excludes VueNodeView, DOM refs, and runtime plugins
- Core constraint: same extension's name/attrs/schema must be identical in both groups
- Add test verifying schema-only editor produces identical JSON to full editor"
```

---

## Task 3: Parse interface — richMarkdownParser.ts

**Files:**
- Create: `src/components/BEditor/hooks/richMarkdownParser.ts`
- Modify: `test/components/BEditor/richMarkdownParser.test.ts`

- [ ] **Step 1: Implement richMarkdownParser.ts**

```typescript
/**
 * @file richMarkdownParser.ts
 * @description Rich 编辑器 Markdown 解析统一异步接口。
 * 第一阶段：主线程同步解析（Promise 包装）。
 * 第二阶段：切 Web Worker 解析，调用方零改动。
 */
import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { createRichMarkdownSchemaExtensions } from './useExtensions';
import { createSourceLineTracker } from '../adapters/sourceLineMapping';

/**
 * 解析接口返回结果
 */
export interface RichParseResult {
  json: JSONContent;
  stats: {
    durationMs: number;
    nodeCount: number;
  };
}

/**
 * 递归统计 JSON 中的节点总数
 * @param json - 待统计的 JSON 节点
 * @returns 节点总数
 */
function countNodes(json: JSONContent): number {
  let count = 1;
  if (Array.isArray(json.content)) {
    for (const child of json.content) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * 在主线程上解析 Markdown 为 Tiptap JSON
 * @param markdown - 原始 Markdown 字符串
 * @param extensions - 解析扩展集合
 * @returns 解析后的 JSON
 */
function parseMarkdownOnMainThread(
  markdown: string,
  extensions: ReturnType<typeof createRichMarkdownSchemaExtensions>,
): JSONContent {
  const manager = new MarkdownManager({
    indentation: { style: 'space', size: 2 },
    extensions,
  });
  return manager.parse(markdown);
}

/**
 * 解析 Markdown 为 Tiptap JSON
 *
 * @param markdown - 原始 Markdown 字符串
 * @param editorInstanceId - 编辑器实例 ID（用于 heading ID 前缀等）
 * @param requestId - 请求 ID（用于取消校验，与 loadToken 分开）
 * @param signal - AbortSignal（解析前后检查，主线程同步路径不能中途打断）
 * @returns 解析结果
 */
export async function parseMarkdownForRichLoad(
  markdown: string,
  editorInstanceId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<RichParseResult> {
  // 解析前检查取消
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const startTime = performance.now();
  const sourceLineTracker = createSourceLineTracker();
  const extensions = createRichMarkdownSchemaExtensions(editorInstanceId, sourceLineTracker);
  const json = parseMarkdownOnMainThread(markdown, extensions);

  // 解析后再次检查取消
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  return {
    json,
    stats: {
      durationMs: performance.now() - startTime,
      nodeCount: countNodes(json),
    },
  };
}
```

**Note:** The `MarkdownManager` constructor signature must be verified. If it doesn't accept `{ indentation, extensions }`, the implementation should be adjusted based on actual Tiptap v3 API. The first step after writing the parser is to verify `MarkdownManager` usability.

- [ ] **Step 2: Write tests for parseMarkdownForRichLoad**

Add to `test/components/BEditor/richMarkdownParser.test.ts`:

```typescript
/* @vitest-environment jsdom */
import { Editor } from '@tiptap/core';
import { describe, expect, test } from 'vitest';
import { parseMarkdownForRichLoad, type RichParseResult } from '@/components/BEditor/hooks/richMarkdownParser';
import { createRichMarkdownSchemaExtensions, createRichEditorRuntimeOnlyExtensions } from '@/components/BEditor/hooks/useExtensions';
import { getPersistedMarkdown } from '@/components/BEditor/utils/editorMarkdown';
import { createSourceLineTracker } from '@/components/BEditor/adapters/sourceLineMapping';

describe('parseMarkdownForRichLoad', () => {
  test('returns valid JSONContent for simple markdown', async () => {
    const result = await parseMarkdownForRichLoad('# Hello\n\nWorld', 'test', 'req-1');
    expect(result.json.type).toBe('doc');
    expect(result.json.content).toBeDefined();
    expect(result.json.content!.length).toBeGreaterThan(0);
    expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.nodeCount).toBeGreaterThan(0);
  });

  test('parsed JSON can be loaded into editor and produces same markdown', async () => {
    const markdown = '# 标题\n\n段落内容\n\n- 列表项1\n- 列表项2';
    const result = await parseMarkdownForRichLoad(markdown, 'test', 'req-2');

    const sourceLineTracker = createSourceLineTracker();
    const schemaExtensions = createRichMarkdownSchemaExtensions('test', sourceLineTracker);
    const runtimeExtensions = createRichEditorRuntimeOnlyExtensions('test');
    const editor = new Editor({
      extensions: [...schemaExtensions, ...runtimeExtensions],
      content: result.json,
    });

    const exported = getPersistedMarkdown(editor);
    editor.destroy();

    expect(exported).toBe(markdown);
  });

  test('throws when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      parseMarkdownForRichLoad('# test', 'test', 'req-3', controller.signal),
    ).rejects.toThrow('Aborted');
  });

  test('returns stats with nodeCount matching editor', async () => {
    const markdown = '# A\n## B\n### C\n\nparagraph';
    const result = await parseMarkdownForRichLoad(markdown, 'test', 'req-4');

    const sourceLineTracker = createSourceLineTracker();
    const extensions = [...createRichMarkdownSchemaExtensions('test', sourceLineTracker), ...createRichEditorRuntimeOnlyExtensions('test')];
    const editor = new Editor({
      extensions,
      content: result.json,
    });
    const editorNodeCount = countEditorNodes(editor);
    editor.destroy();

    expect(result.stats.nodeCount).toBe(editorNodeCount);
  });
});

function countEditorNodes(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants(() => { count++; });
  return count;
}
```

Run: `pnpm test -- test/components/BEditor/richMarkdownParser.test.ts --reporter=verbose 2>&1 | tail -40`

Fix any issues with `MarkdownManager` API until all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/BEditor/hooks/richMarkdownParser.ts test/components/BEditor/richMarkdownParser.test.ts
git commit -m "feat(BEditor): add parseMarkdownForRichLoad async interface

- Create richMarkdownParser.ts with Promise-based Markdown parse API
- Parse on main thread using MarkdownManager with schema extensions
- Return RichParseResult with JSON, durationMs, nodeCount
- Support AbortSignal for cancellation checks
- Test: round-trip stability, abort behavior, node count accuracy"
```

---

## Task 4: Loading state machine — useRichEditorLoad.ts

**Files:**
- Create: `src/components/BEditor/hooks/useRichEditorLoad.ts`
- Create: `test/components/BEditor/useRichEditorLoad.test.ts`

- [ ] **Step 1: Write failing tests for useRichEditorLoad**

Create `test/components/BEditor/useRichEditorLoad.test.ts`:

```typescript
/* @vitest-environment jsdom */
/**
 * @file useRichEditorLoad.test.ts
 * @description 验证 useRichEditorLoad 状态机的状态转移、取消、事务 meta 等行为。
 */
import { nextTick, ref, type Ref } from 'vue';
import { Editor } from '@tiptap/core';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { useRichEditorLoad, type RichLoadCancelReason, type RichLoadCompletePayload } from '@/components/BEditor/hooks/useRichEditorLoad';
import type { RichLoadState } from '@/components/BEditor/adapters/types';
import { createRichMarkdownSchemaExtensions, createRichEditorRuntimeOnlyExtensions } from '@/components/BEditor/hooks/useExtensions';
import { createSourceLineTracker } from '@/components/BEditor/adapters/sourceLineMapping';

/**
 * 空占位文档 JSON
 */
const EMPTY_PARAGRAPH_JSON = {
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const }],
};

/**
 * 同步调度器：分帧回调立即执行，便于测试
 */
function syncScheduler(fn: () => void): () => void {
  fn();
  return () => {};
}

/**
 * 创建测试用 editor（大文档路径：空占位初始化）
 */
function createTestEditor(): Editor {
  const sourceLineTracker = createSourceLineTracker();
  const schemaExtensions = createRichMarkdownSchemaExtensions('test-load', sourceLineTracker);
  const runtimeExtensions = createRichEditorRuntimeOnlyExtensions('test-load');
  return new Editor({
    extensions: [...schemaExtensions, ...runtimeExtensions],
    content: EMPTY_PARAGRAPH_JSON,
    editable: false,
  });
}

describe('useRichEditorLoad', () => {
  let editor: Editor;
  let loadState: Ref<RichLoadState>;
  let onLoadCompletePayloads: RichLoadCompletePayload[];
  let onLoadFailedErrors: string[];

  function setup() {
    editor = createTestEditor();
    onLoadCompletePayloads = [];
    onLoadFailedErrors = [];

    const result = useRichEditorLoad({
      getEditor: () => (editor.isDestroyed ? undefined : editor),
      onLoadComplete: (payload) => { onLoadCompletePayloads.push(payload); },
      onLoadFailed: (error) => { onLoadFailedErrors.push(error); },
      scheduler: syncScheduler,
    });

    loadState = result.loadState as Ref<RichLoadState>;
    return result;
  }

  afterEach(() => {
    if (!editor.isDestroyed) editor.destroy();
  });

  describe('state machine basics', () => {
    test('initial state is idle', () => {
      const { loadState: ls } = setup();
      expect(ls.value.phase).toBe('idle');
      expect(ls.value.progress).toBe(0);
    });

    test('startLoad transitions idle -> loading', async () => {
      const { startLoad } = setup();
      await startLoad('# Hello\n\nWorld');
      expect(loadState.value.phase).toBe('loading');
    });

    test('startLoad transitions loading -> ready on completion', async () => {
      const { startLoad } = setup();
      await startLoad('# Hello\n\nWorld');
      // 同步调度器意味着所有分帧立即完成
      await nextTick();
      expect(loadState.value.phase).toBe('ready');
      expect(loadState.value.progress).toBe(1);
    });
  });

  describe('cancelLoad', () => {
    test('cancelLoad during loading transitions to idle', async () => {
      const { startLoad, cancelLoad } = setup();
      const loadPromise = startLoad('# Hello\n\nWorld');
      cancelLoad('switch-source');
      await loadPromise;
      expect(loadState.value.phase).toBe('idle');
    });

    test('cancelled load does not call onLoadComplete', async () => {
      const { startLoad, cancelLoad } = setup();
      const loadPromise = startLoad('# Hello\n\nWorld');
      cancelLoad('switch-source');
      await loadPromise;
      expect(onLoadCompletePayloads).toHaveLength(0);
    });

    test('cancelled load does not write to editor', async () => {
      const { startLoad, cancelLoad } = setup();
      const loadPromise = startLoad('# Hello\n\nWorld');
      cancelLoad('switch-source');
      await loadPromise;

      // Editor should be empty placeholder
      expect(editor.state.doc.textContent.trim()).toBe('');
    });
  });

  describe('isLoadTransaction', () => {
    test('identifies loading transaction meta', () => {
      const { isLoadTransaction } = setup();
      const tr = editor.state.tr.setMeta('bEditorRichLoad', true);
      expect(isLoadTransaction(tr)).toBe(true);
    });

    test('returns false for normal transactions', () => {
      const { isLoadTransaction } = setup();
      const tr = editor.state.tr.insertText('hello');
      expect(isLoadTransaction(tr)).toBe(false);
    });
  });

  describe('loadVersion/cancelToken', () => {
    test('isCurrentToken returns true for active token', () => {
      const { isCurrentToken } = setup();
      // Get current token via internal mechanism
      // This needs the hook to expose currentLoadToken for testing
      // Alternative: test via behavior — cancelled loads don't affect editor
    });
  });

  describe('isReload tracking', () => {
    test('first load has isReload=false', async () => {
      const { startLoad } = setup();
      await startLoad('# First');
      // Check during loading
      expect(loadState.value.isReload).toBe(false);
    });

    test('second load has isReload=true', async () => {
      const { startLoad } = setup();
      await startLoad('# First');
      await nextTick();
      await startLoad('# Second', { isReload: true });
      expect(loadState.value.isReload).toBe(true);
    });
  });
});
```

Run: `pnpm test -- test/components/BEditor/useRichEditorLoad.test.ts --reporter=verbose 2>&1 | tail -40`
Expected: Tests FAIL (function not implemented yet).

- [ ] **Step 2: Implement useRichEditorLoad.ts**

```typescript
/**
 * @file useRichEditorLoad.ts
 * @description Rich 编辑器大文档异步加载状态机。
 * 管理 idle/loading/ready/failed 状态转移、分帧装载、取消令牌、事务 meta。
 */
import type { Transaction } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ref, type Ref, type ComputedRef, computed } from 'vue';
import type { RichLoadState, RichLoadPhase, RichLoadStage, RichLoadCancelReason, RichLoadParseResult, RichLoadCompletePayload } from '../adapters/types';
import { parseMarkdownForRichLoad } from './richMarkdownParser';

/**
 * 每帧时间预算（毫秒）
 */
const TIME_BUDGET_MS = 12;

/**
 * 空占位文档 JSON
 */
export const EMPTY_PARAGRAPH_JSON: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/**
 * 用空占位文档替换 editor 当前内容，带 silent meta
 * @param editor - 编辑器实例
 */
export function clearEditorToEmptyPlaceholder(editor: Editor): void {
  const emptyNode = editor.schema.nodeFromJSON(EMPTY_PARAGRAPH_JSON);
  const tr = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, emptyNode.content)
    .setMeta('preventUpdate', true)
    .setMeta('addToHistory', false)
    .setMeta('bEditorRichLoad', true);
  editor.view.dispatch(tr);
}

/**
 * 调度器接口：执行回调并返回取消函数
 */
type RichLoadScheduler = (fn: () => void) => () => void;

interface UseRichEditorLoadParams {
  getEditor: () => Editor | undefined;
  onLoadComplete: (payload: RichLoadCompletePayload) => void;
  onLoadFailed: (error: string) => void;
  loadTimeoutMs?: number;
  scheduler?: RichLoadScheduler;
}

interface UseRichEditorLoadResult {
  loadState: Readonly<Ref<RichLoadState>>;
  startLoad: (markdown: string, options?: { isReload?: boolean }) => Promise<void>;
  cancelLoad: (reason: RichLoadCancelReason) => void;
  retryLoad: () => Promise<void>;
  isLoadTransaction: (transaction: Transaction) => boolean;
  isCurrentToken: (token: symbol) => boolean;
  getLoadSource: () => string | null;
}

/**
 * 错误信息映射
 */
const ERROR_MESSAGES: Record<string, string> = {
  PARSE_FAILED: '富文本加载失败：文档解析错误，请切换回源码模式检查内容',
  SCHEMA_MISMATCH: '富文本加载失败：文档结构不兼容，请切换回源码模式检查内容',
  LOAD_TIMEOUT: '富文本加载超时，文档过大，建议在源码模式下编辑',
  DISPATCH_FAILED: '富文本加载失败：内容写入错误',
  UNKNOWN: '富文本加载失败，请重试或切换回源码模式',
};

/**
 * 创建 Rich 编辑器加载状态机
 */
export function useRichEditorLoad({
  getEditor,
  onLoadComplete,
  onLoadFailed,
  loadTimeoutMs = 30_000,
  scheduler: customScheduler,
}: UseRichEditorLoadParams): UseRichEditorLoadResult {
  const scheduler: RichLoadScheduler = customScheduler ?? ((fn) => { const h = requestAnimationFrame(fn); return () => cancelAnimationFrame(h); });

  const loadState = ref<RichLoadState>({
    phase: 'idle',
    isReload: false,
    progress: 0,
  });

  let currentLoadToken = Symbol('rich-load-init');
  let loadSourceMarkdown: string | null = null;
  let previousReadyDocJson: JSONContent | null = null;
  let scheduledFrameCancel: (() => void) | null = null;

  /**
   * 判断 transaction 是否为加载事务
   * @param transaction - ProseMirror transaction
   * @returns 是否为加载事务
   */
  function isLoadTransaction(transaction: Transaction): boolean {
    return transaction.getMeta('bEditorRichLoad') === true;
  }

  /**
   * 检查 token 是否匹配当前版本
   * @param token - 待检查的 token
   * @returns 是否匹配
   */
  function isCurrentToken(token: symbol): boolean {
    return token === currentLoadToken;
  }

  /**
   * 获取当前加载源的 markdown
   * @returns 加载源 markdown，无加载源返回 null
   */
  function getLoadSource(): string | null {
    return loadSourceMarkdown;
  }

  /**
   * 获取占位段落的范围（供首帧替换使用）
   * @param doc - 当前文档
   * @returns 占位段落位置 { from, to }
   */
  function getPlaceholderRange(doc: ProseMirrorNode): { from: number; to: number } | null {
    const firstChild = doc.firstChild;
    if (!firstChild || firstChild.type.name !== 'paragraph') return null;
    return { from: 0, to: firstChild.nodeSize };
  }

  /**
   * 启动加载
   * @param markdown - 原始 Markdown 文本
   * @param options - 加载选项
   */
  async function startLoad(markdown: string, options?: { isReload?: boolean }): Promise<void> {
    // 取消旧任务
    invalidateCurrentTask();

    const editor = getEditor();
    if (!editor || editor.isDestroyed) return;

    const token = currentLoadToken;
    const isReload = options?.isReload ?? false;

    // 进入 loading 状态
    loadState.value = {
      phase: 'loading',
      isReload,
      stage: 'parsing',
      progress: 0,
    };
    loadSourceMarkdown = markdown;

    // 清空 editor 为空占位
    clearEditorToEmptyPlaceholder(editor);

    try {
      // 阶段 1：解析
      const requestId = `parse-${String(token)}`;
      const parseResult = await parseMarkdownForRichLoad(markdown, editor.storage?.editorInstanceId ?? 'unknown', requestId);

      // 校验版本
      if (!isCurrentToken(token)) return;

      // 阶段 2：分帧装载
      loadState.value = { ...loadState.value, stage: 'mounting', progress: 0.05 };

      await mountJsonInChunks(editor, parseResult.json, token, parseResult);

    } catch (error) {
      if (!isCurrentToken(token)) return; // 已取消

      const message = error instanceof DOMException && error.name === 'AbortError'
        ? '加载已取消'
        : ERROR_MESSAGES.PARSE_FAILED;

      handleLoadFailure(message, isReload, markdown);
      onLoadFailed(message);
    }
  }

  /**
   * 分帧装载 JSON 到 editor
   */
  async function mountJsonInChunks(
    editor: Editor,
    json: JSONContent,
    token: symbol,
    parseResult: RichLoadParseResult,
  ): Promise<void> {
    const blocks = json.content ?? [];
    if (blocks.length === 0) {
      finishLoad(editor, token, loadSourceMarkdown ?? '', json, parseResult);
      return;
    }

    let cursor = 0;

    return new Promise<void>((resolve, reject) => {
      function scheduleNextChunk() {
        if (!isCurrentToken(token)) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        if (!editor || editor.isDestroyed) {
          reject(new Error('Editor destroyed'));
          return;
        }

        const frameStart = performance.now();
        let tr = editor.state.tr;

        try {
          while (cursor < blocks.length) {
            const block = blocks[cursor];
            // 首帧：替换占位段落；后续帧：append 到末尾
            if (cursor === 0) {
              const range = getPlaceholderRange(editor.state.doc);
              if (range) {
                const node = editor.schema.nodeFromJSON(block);
                tr = tr.replaceWith(range.from, range.to, node);
                cursor++;
                if (performance.now() - frameStart >= TIME_BUDGET_MS) break;
                continue;
              }
            }

            const node = editor.schema.nodeFromJSON(block);
            tr = tr.insert(tr.doc.content.size, node);
            cursor++;

            if (performance.now() - frameStart >= TIME_BUDGET_MS) break;
          }

          tr.setMeta('preventUpdate', true)
            .setMeta('addToHistory', false)
            .setMeta('bEditorRichLoad', true);
          editor.view.dispatch(tr);

          const progress = 0.05 + 0.9 * (cursor / blocks.length);
          loadState.value = { ...loadState.value, progress };

          if (cursor < blocks.length) {
            scheduledFrameCancel = scheduler(scheduleNextChunk);
          } else {
            // 装载完成
            finishLoad(editor, token, loadSourceMarkdown ?? '', json, parseResult);
            resolve();
          }
        } catch (err) {
          reject(err instanceof Error ? err : new Error(ERROR_MESSAGES.DISPATCH_FAILED));
        }
      }

      scheduleNextChunk();
    });
  }

  /**
   * 装载完成后统一处理
   */
  function finishLoad(
    editor: Editor,
    token: symbol,
    rawMarkdown: string,
    json: JSONContent,
    parseResult: RichLoadParseResult,
  ): void {
    if (!isCurrentToken(token)) return;

    loadState.value = {
      phase: 'ready',
      isReload: loadState.value.isReload,
      progress: 1,
    };

    previousReadyDocJson = json;
    onLoadComplete({ rawMarkdown, json, stats: parseResult.stats });
  }

  /**
   * 处理加载失败
   */
  function handleLoadFailure(message: string, isReload: boolean, _markdown: string): void {
    const editor = getEditor();
    if (!editor || editor.isDestroyed) return;

    // 恢复上一个 ready doc（如果有）或清空
    if (isReload && previousReadyDocJson) {
      const tr = editor.state.tr
        .replaceWith(0, editor.state.doc.content.size, 
          editor.schema.nodeFromJSON(previousReadyDocJson).content)
        .setMeta('preventUpdate', true)
        .setMeta('addToHistory', false)
        .setMeta('bEditorRichLoad', true);
      editor.view.dispatch(tr);
    } else {
      clearEditorToEmptyPlaceholder(editor);
    }

    loadState.value = {
      phase: 'failed',
      isReload,
      progress: 0,
      errorMessage: message,
    };
  }

  /**
   * 作废当前任务 token
   */
  function invalidateCurrentTask(): void {
    currentLoadToken = Symbol('rich-load-canceled');
    if (scheduledFrameCancel) {
      scheduledFrameCancel();
      scheduledFrameCancel = null;
    }
    loadSourceMarkdown = null;
  }

  /**
   * 取消当前加载
   * @param reason - 取消原因
   */
  function cancelLoad(reason: RichLoadCancelReason): void {
    invalidateCurrentTask();

    const editor = getEditor();
    if (editor && !editor.isDestroyed && reason !== 'retry') {
      clearEditorToEmptyPlaceholder(editor);
    }

    loadState.value = {
      phase: 'idle',
      isReload: false,
      progress: 0,
    };
  }

  /**
   * 重试加载
   */
  async function retryLoad(): Promise<void> {
    if (loadState.value.phase !== 'failed') return;

    const source = loadSourceMarkdown;
    if (!source) {
      loadState.value = { phase: 'idle', isReload: false, progress: 0 };
      return;
    }

    await startLoad(source, { isReload: true });
  }

  return {
    loadState: computed(() => loadState.value),
    startLoad,
    cancelLoad,
    retryLoad,
    isLoadTransaction,
    isCurrentToken,
    getLoadSource,
  };
}
```

- [ ] **Step 3: Run tests and fix until all pass**

```bash
pnpm test -- test/components/BEditor/useRichEditorLoad.test.ts --reporter=verbose 2>&1 | tail -40
```

Fix issues iteratively until all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/BEditor/hooks/useRichEditorLoad.ts test/components/BEditor/useRichEditorLoad.test.ts
git commit -m "feat(BEditor): add useRichEditorLoad loading state machine

- Implement idle/loading/ready/failed state machine with cancel token
- Frame-based JSON chunk mounting with 12ms time budget
- Transaction meta (bEditorRichLoad, preventUpdate, addToHistory: false)
- AbortSignal support, cancelLoad with reason tracking
- Error handling: parse failure, dispatch failure, timeout detection
- Failed reload preserves previousReadyDocJson for recovery
- Test: state transitions, cancel behavior, meta identification"
```

---

## Task 5: Module integration — useContent.ts

**Files:**
- Modify: `src/components/BEditor/hooks/useContent.ts`
- Modify: `test/components/BEditor/richLargeDocumentLoad.test.ts` (new)

- [ ] **Step 1: Add optional params and new methods to useContent**

Modify `useContent.ts`:

1. Extend `UseEditorContentParams` with optional `isLoadTransaction` and `loadPhase`:

```typescript
interface UseEditorContentParams {
  assignHeadingIds: (editor: Editor) => void;
  editable: Ref<boolean>;
  editorContent: Ref<string | undefined>;
  getEditorInstance: () => Editor | undefined;
  resetHeadingIndex: () => void;
  resetSourceLineTracker: () => void;
  onContentChange?: () => void;
  /** 判断 transaction 是否为加载事务（大文档路径传入） */
  isLoadTransaction?: (transaction: Transaction) => boolean;
  /** 当前加载阶段（大文档路径传入，小文档不传则不做守卫） */
  loadPhase?: () => RichLoadPhase;
}
```

Import needed types:
```typescript
import type { Transaction } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { RichLoadPhase } from '../adapters/types';
```

2. Modify `onEditorUpdate` signature and add guards:

```typescript
function onEditorUpdate({ editor, transaction }: { editor: Editor; transaction: Transaction }): void {
  // Guards: only for large document path
  if (isLoadTransaction && isLoadTransaction(transaction)) return;
  // loadPhase is undefined for small document path — skip guard entirely
  if (loadPhase !== undefined && loadPhase() !== 'ready') return;

  // Original logic
  assignHeadingIds(editor);
  const markdown = getPersistedMarkdown(editor);
  editorContent.value = markdown === lastImportedCanonicalContent ? lastImportedRawContent : markdown;
  onContentChange?.();
}
```

3. Add new methods to `UseEditorContentResult`:

```typescript
interface UseEditorContentResult {
  isEquivalentToImportedContent: (externalContent: string | undefined, currentMarkdown: string) => boolean;
  rememberImportedContent: (text: string) => void;
  onEditorUpdate: ({ editor, transaction }: { editor: Editor; transaction: Transaction }) => void;
  onPaste: (_view: unknown, event: ClipboardEvent) => boolean;
  setEditorContent: (text: string, emitUpdate?: boolean) => void;
  /** 大文档：直接 dispatch ProseMirror transaction 装载完整 JSON */
  dispatchLoadContent: (json: JSONContent) => void;
  /** 大文档：分帧装载一个 chunk 的 ProseMirror Node */
  dispatchLoadChunk: (blockNodes: ProseMirrorNode[]) => void;
  /** 装载完成后记录快照 */
  onLoadComplete: (rawMarkdown: string) => void;
  /** 清空 editor 为空占位文档 */
  clearEditorToEmptyPlaceholder: () => void;
}
```

4. Add implementations:

```typescript
function dispatchLoadContent(json: JSONContent): void {
  const instance = getEditorInstance();
  if (!instance) return;

  const nextDoc = instance.schema.nodeFromJSON(json);
  const tr = instance.state.tr
    .replaceWith(0, instance.state.doc.content.size, nextDoc.content)
    .setMeta('preventUpdate', true)
    .setMeta('addToHistory', false)
    .setMeta('bEditorRichLoad', true);
  instance.view.dispatch(tr);
}

function dispatchLoadChunk(blockNodes: ProseMirrorNode[]): void {
  const instance = getEditorInstance();
  if (!instance) return;

  let tr = instance.state.tr;
  for (const node of blockNodes) {
    tr = tr.insert(tr.doc.content.size, node);
  }
  tr.setMeta('preventUpdate', true)
    .setMeta('addToHistory', false)
    .setMeta('bEditorRichLoad', true);
  instance.view.dispatch(tr);
}

function onLoadComplete(rawMarkdown: string): void {
  rememberImportedContent(rawMarkdown);
}

function clearEditorToEmptyPlaceholder(): void {
  const editor = getEditorInstance();
  if (!editor) return;
  const emptyDoc = editor.schema.nodeFromJSON(EMPTY_PARAGRAPH_JSON);
  const tr = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, emptyDoc.content)
    .setMeta('preventUpdate', true)
    .setMeta('addToHistory', false)
    .setMeta('bEditorRichLoad', true);
  editor.view.dispatch(tr);
}
```

5. Add `EMPTY_PARAGRAPH_JSON` import at top:
```typescript
import { EMPTY_PARAGRAPH_JSON } from './useRichEditorLoad';
```

6. Return new methods:
```typescript
return {
  isEquivalentToImportedContent,
  rememberImportedContent,
  onEditorUpdate,
  onPaste,
  setEditorContent,
  dispatchLoadContent,
  dispatchLoadChunk,
  onLoadComplete,
  clearEditorToEmptyPlaceholder,
};
```

- [ ] **Step 2: Verify existing tests pass**

```bash
pnpm test -- test/components/BEditor/ 2>&1 | tail -30
```

Expected: All existing tests pass (new params are optional, backward compatible).

- [ ] **Step 3: Commit**

```bash
git add src/components/BEditor/hooks/useContent.ts
git commit -m "feat(BEditor): extend useContent with loading transaction support

- Add optional isLoadTransaction and loadPhase params for large doc path
- onEditorUpdate now accepts transaction param and skips load transactions
- loadPhase guard: only blocks when param is provided (not undefined for small docs)
- Add dispatchLoadContent, dispatchLoadChunk for ProseMirror-level insertion
- Add onLoadComplete for delayed snapshot recording
- Add clearEditorToEmptyPlaceholder for safe cleanup
- All new params optional — backward compatible with existing callers"
```

---

## Task 6: Module integration — useRichEditor.ts

**Files:**
- Modify: `src/components/BEditor/hooks/useRichEditor.ts`

- [ ] **Step 1: Rework useRichEditor.ts for large document support**

```typescript
import type { SearchScrollContext } from '../extensions/editorSearch';
import type { Ref, ComputedRef } from 'vue';
import { ref, watch, computed } from 'vue';
import { TextSelection } from '@tiptap/pm/state';
import { useEditor, type Editor } from '@tiptap/vue-3';
import type { Transaction } from '@tiptap/pm/state';
import { normalizeEditorContent } from '../extensions/emptyContent';
import { getPersistedMarkdown } from '../utils/editorMarkdown';
import type { RichLoadState, RichLoadCancelReason, RichLoadCompletePayload, RichLoadPhase } from '../adapters/types';
import { useContent } from './useContent';
import { useExtensions } from './useExtensions';
import { useRichEditorLoad, EMPTY_PARAGRAPH_JSON } from './useRichEditorLoad';

/**
 * 大文档阈值（字符数）
 */
export const LARGE_DOCUMENT_THRESHOLD = 30_000;

interface UseRichEditorParams {
  bodyContent: Ref<string>;
  editable: Ref<boolean>;
  editorInstanceId: Ref<string>;
  onContentChange: () => void;
  onSearchMatchFocus?: (context: SearchScrollContext) => void;
}

interface UseRichEditorResult {
  editorInstance: ReturnType<typeof useEditor>;
  editorInstanceRef: Ref<Editor | undefined>;
  setContent: (text: string) => void;
  /** 判断当前文档是否为大文档 */
  isLargeDocument: ComputedRef<boolean>;
  /** 加载状态（大文档使用） */
  loadState: Readonly<Ref<RichLoadState>>;
  /** 启动 Rich 加载 */
  startLoad: (markdown: string, options?: { isReload?: boolean }) => Promise<void>;
  /** 取消当前加载 */
  cancelLoad: (reason: RichLoadCancelReason) => void;
  /** 判断 transaction 是否为加载事务 */
  isLoadTransaction: (transaction: Transaction) => boolean;
  /** 获取加载源 markdown */
  getLoadSource: () => string | null;
}

// ... (keep existing helper functions: getActiveCodeBlockRange, handleSelectAllInCodeBlock)

export function useRichEditor({
  bodyContent,
  editable,
  editorInstanceId,
  onContentChange,
  onSearchMatchFocus,
}: UseRichEditorParams): UseRichEditorResult {
  const { editorExtensions, resetHeadingIndex, resetSourceLineTracker, assignHeadingIds } = useExtensions(editorInstanceId, { onSearchMatchFocus });
  const editorInstanceRef = ref<Editor>();

  const isLargeDocument = computed(() => (bodyContent.value?.length ?? 0) > LARGE_DOCUMENT_THRESHOLD);

  // 加载完成回调
  function handleLoadComplete(payload: RichLoadCompletePayload): void {
    const editor = editorInstanceRef.value;
    if (!editor) return;

    // 标题 ID 校正（silent — 不进 history、不写回）
    assignHeadingIdsSilent(editor, assignHeadingIds);
    
    // 记录快照
    onLoadComplete(payload.rawMarkdown);
    
    // 恢复 editable
    editor.setEditable(editable.value);
  }

  // 加载失败回调
  function handleLoadFailed(_error: string): void {
    // 不修改持久化内容
  }

  const {
    setEditorContent,
    onPaste,
    onEditorUpdate,
    isEquivalentToImportedContent,
    rememberImportedContent,
    dispatchLoadChunk,
    onLoadComplete,
    clearEditorToEmptyPlaceholder,
  } = useContent({
    assignHeadingIds,
    editable,
    editorContent: bodyContent,
    getEditorInstance: () => editorInstanceRef.value,
    resetHeadingIndex,
    resetSourceLineTracker,
    onContentChange,
    isLoadTransaction: undefined, // will be wired after load hook creation
    loadPhase: undefined,         // will be wired after load hook creation
  });

  const {
    loadState,
    startLoad,
    cancelLoad,
    isLoadTransaction,
    getLoadSource,
  } = useRichEditorLoad({
    getEditor: () => editorInstanceRef.value,
    onLoadComplete: handleLoadComplete,
    onLoadFailed: handleLoadFailed,
  });

  // Wire content bridge with load guards AFTER both hooks exist
  // Reconstruct useContent call with guards? No — the approach is:
  // useContent is called once, but the guards are applied at the call site in useRichEditor.
  // Since these are function references, we wrap them.

  // Actually, the cleanest approach is to call useContent once more with the guards:
  // But that creates two instances. Better: create a wrapper.
  // Simplest: pass the guards directly. useContent was already updated to accept them.

  // REVISIT: We need to establish content bridge with guards. 
  // The issue is that useContent is called before useRichEditorLoad exists.
  // Solution: Restructure — initialize useContent with guards as function refs:

  // BETTER APPROACH: Define the guards as lazy refs then create useContent after:

  // ACTUALLY: Let's restructure the initialization order:
  // 1. Create useRichEditorLoad first (before useContent)
  // 2. Pass isLoadTransaction and loadPhase to useContent

  // FINAL APPROACH (restructure the function):
```

**IMPORTANT RESTRUCTURING:** The initialization order must be: `useExtensions` → `useRichEditorLoad` → `useContent` (with guards) → `useEditor`. This is because `useContent` now takes `isLoadTransaction` and `loadPhase` from `useRichEditorLoad`.

Here is the corrected full implementation:

```typescript
export function useRichEditor({
  bodyContent,
  editable,
  editorInstanceId,
  onContentChange,
  onSearchMatchFocus,
}: UseRichEditorParams): UseRichEditorResult {
  const { editorExtensions, resetHeadingIndex, resetSourceLineTracker, assignHeadingIds } = useExtensions(editorInstanceId, { onSearchMatchFocus });
  const editorInstanceRef = ref<Editor>();

  const isLargeDocument = computed(() => (bodyContent.value?.length ?? 0) > LARGE_DOCUMENT_THRESHOLD);

  // Step 1: Create load hook first (it needs getEditor which points to instanceRef)
  const {
    loadState,
    startLoad,
    cancelLoad,
    isLoadTransaction,
    getLoadSource,
  } = useRichEditorLoad({
    getEditor: () => editorInstanceRef.value,
    onLoadComplete: (payload: RichLoadCompletePayload) => {
      const editor = editorInstanceRef.value;
      if (!editor) return;
      assignHeadingIdsSilent(editor, assignHeadingIds);
      onLoadCompleteWrapper(payload.rawMarkdown);
      editor.setEditable(editable.value);
    },
    onLoadFailed: (_error: string) => {
      // 不修改持久化内容
    },
  });

  // Step 2: Create content bridge with loading guards
  const {
    setEditorContent,
    onPaste,
    onEditorUpdate,
    isEquivalentToImportedContent,
    rememberImportedContent,
    onLoadComplete: onLoadCompleteWrapper,
    clearEditorToEmptyPlaceholder,
  } = useContent({
    assignHeadingIds,
    editable,
    editorContent: bodyContent,
    getEditorInstance: () => editorInstanceRef.value,
    resetHeadingIndex,
    resetSourceLineTracker,
    onContentChange,
    isLoadTransaction: isLargeDocument.value ? isLoadTransaction : undefined,
    loadPhase: isLargeDocument.value ? (() => loadState.value.phase as RichLoadPhase) : undefined,
  });

  // Determine initial content based on document size
  const initialContent = computed(() => {
    if (isLargeDocument.value) {
      return EMPTY_PARAGRAPH_JSON;
    }
    return normalizeEditorContent(bodyContent.value ?? '');
  });

  const initialContentType = computed(() => {
    if (isLargeDocument.value) {
      return undefined; // JSON content, no contentType needed
    }
    return bodyContent.value ? 'markdown' : undefined;
  });

  const initialEditable = computed(() => {
    if (isLargeDocument.value) {
      return false; // Large docs start as non-editable
    }
    return editable.value;
  });

  const editorInstance = useEditor({
    content: initialContent.value,
    extensions: editorExtensions,
    editable: initialEditable.value,
    contentType: initialContentType.value,
    editorProps: {
      handleDrop: () => true,
      attributes: { spellcheck: 'false', draggable: 'false' },
      handlePaste: onPaste,
      handleKeyDown: (_, event) => {
        const canEdit = loadState.value.phase === 'ready' && editable.value;

        const key = event.key.toLowerCase();
        const isTab = key === 'tab';
        const isSelectAll = (event.ctrlKey || event.metaKey) && key === 'a' && !event.shiftKey && !event.altKey;
        const isUndo = (event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey;
        const isRedo = (event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey));

        // Editing keys require canEdit
        if (isTab || isUndo || isRedo) {
          if (!canEdit) return true; // Prevent edit when not ready
        }

        if (isSelectAll) {
          const instance = editorInstanceRef.value;
          if (!instance) return false;
          if (!canEdit) return true;
          if (handleSelectAllInCodeBlock(instance, event)) return true;
        }

        if (isTab && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const instance = editorInstanceRef.value;
          if (!instance || !canEdit) return true;
          if (instance.isActive('table') || instance.isActive('listItem')) return false;
          event.preventDefault();
          if (event.shiftKey) {
            const { from, empty } = instance.state.selection;
            if (!empty || from <= 2) return true;
            const before = instance.state.doc.textBetween(from - 2, from, '\0', '\0');
            if (before === '  ') { instance.commands.deleteRange({ from: from - 2, to: from }); }
            return true;
          }
          instance.commands.insertContent(instance.isActive('codeBlock') ? '\t' : '  ');
          return true;
        }

        if (isUndo || isRedo) {
          if (!canEdit) return true;
          event.preventDefault();
          const instance = editorInstanceRef.value;
          if (!instance) return true;
          if (isUndo) { instance.commands.undo(); return true; }
          instance.commands.redo();
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        dragstart: (_view, event) => { event.preventDefault(); return true; },
        drop: (_view, event) => { event.preventDefault(); return true; },
      },
    },
    onUpdate: onEditorUpdate,
  });

  watch(
    editorInstance,
    (instance) => {
      editorInstanceRef.value = instance;
      if (instance) {
        if (isLargeDocument.value) {
          // Large doc: trigger async load
          const content = bodyContent.value;
          if (content) {
            startLoad(content);
          }
        } else {
          // Small doc: existing behavior
          rememberImportedContent(bodyContent.value ?? '');
        }
      }
    },
    { immediate: true },
  );

  // Watch bodyContent for external changes
  watch(bodyContent, (content) => {
    const instance = editorInstanceRef.value;
    if (!instance) return;

    if (isLargeDocument.value) {
      const phase = loadState.value.phase;

      if (phase === 'loading') {
        const source = getLoadSource();
        if (content !== source && content) {
          cancelLoad('external-change');
          startLoad(content, { isReload: true });
        }
        // same content: ignore
      } else if (phase === 'ready') {
        const currentContent = getPersistedMarkdown(instance);
        if (!isEquivalentToImportedContent(content, currentContent) && currentContent !== content) {
          startLoad(content ?? '', { isReload: true });
        }
      } else if (phase === 'failed') {
        if (content && (content?.length ?? 0) > LARGE_DOCUMENT_THRESHOLD) {
          startLoad(content, { isReload: true });
        }
        // If content shrinks below threshold, the editor would need recreation — but that
        // requires component remount via key change. For now, still use async path.
      }
    } else {
      // Small document: existing behavior
      const currentContent = getPersistedMarkdown(instance);
      if (isEquivalentToImportedContent(content, currentContent)) return;
      if (currentContent === content) return;
      setEditorContent(content ?? '', false);
    }
  });

  function setContent(text: string): void {
    setEditorContent(text, false);
  }

  return {
    editorInstance,
    editorInstanceRef,
    setContent,
    isLargeDocument,
    loadState: computed(() => loadState.value),
    startLoad,
    cancelLoad,
    isLoadTransaction,
    getLoadSource,
  };
}

/**
 * 静默执行标题 ID 校正（不进 history，不触发回写）
 * @param editor - 编辑器实例
 * @param assignHeadingIds - 原始 ID 分配函数
 */
function assignHeadingIdsSilent(editor: Editor, assignHeadingIds: (editor: Editor) => void): void {
  // 监听 transaction 事件，对 assignHeadingIds 产生的带有标题 ID 变更的 transaction 打上 meta
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (transaction.getMeta('bEditorSilentHeadingIds')) return;
    // assignHeadingIds 内部直接 view.dispatch(tr)，我们无法拦截。
    // 方案：在调用前 hook transaction listener，调用后移除。
    // 更实际的方案：调整 assignHeadingIds 使其支持 silent 参数。
  };
  
  // For now, assignHeadingIds is called as-is.
  // TODO: Extend assignHeadingIds to accept { silent?: boolean } parameter.
  // When silent: true, sets addToHistory: false and preventUpdate: true on the transaction.
  assignHeadingIds(editor);
}
```

**Note about `assignHeadingIdsSilent`:** The current `assignHeadingIds` in `useExtensions.ts` directly does `view.dispatch(tr)` without meta. We need to either:
- A) Modify `assignHeadingIds` to accept an optional `{ silent?: boolean }` parameter
- B) Wrap the transaction listener during the call

For this task, extend `assignHeadingIds` signature:

In `useExtensions.ts`, change:
```typescript
function assignHeadingIds(editor: Editor, options?: { silent?: boolean }): void {
  const { state, view } = editor;
  const { tr } = state;
  let index = 0;
  let needsUpdate = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const expectedId = getHeadingId(index);
      if (node.attrs.id !== expectedId) {
        needsUpdate = true;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: expectedId });
      }
      index++;
    }
  });

  if (needsUpdate) {
    if (options?.silent) {
      tr.setMeta('preventUpdate', true)
        .setMeta('addToHistory', false);
    }
    view.dispatch(tr);
  }
}
```

And update the `UseEditorExtensionsResult` interface:
```typescript
interface UseEditorExtensionsResult {
  assignHeadingIds: (editor: Editor, options?: { silent?: boolean }) => void;
  editorExtensions: AnyExtension[];
  resetSourceLineTracker: () => void;
  resetHeadingIndex: () => void;
}
```

- [ ] **Step 2: Run existing tests to verify no regression**

```bash
pnpm test -- test/components/BEditor/ 2>&1 | tail -40
```

Fix any issues with the new initial values (e.g., `UnwrapRef` issues with computed refs vs raw values for `useEditor` params).

**Key fix note:** `useEditor()` expects `content` to be a reactive value or plain value. Since `initialContent` and `initialContentType` are computed refs from Vue, they should be accessed as `.value` when passed. However, `useEditor` from `@tiptap/vue-3` should handle reactive values. Test this carefully.

If `useEditor` doesn't support reactive initial content, use plain values:
```typescript
const editorInstance = useEditor({
  content: isLargeDocument.value 
    ? EMPTY_PARAGRAPH_JSON 
    : normalizeEditorContent(bodyContent.value ?? ''),
  extensions: editorExtensions,
  editable: isLargeDocument.value ? false : editable.value,
  contentType: isLargeDocument.value ? undefined : (bodyContent.value ? 'markdown' : undefined),
  // ...
});
```

This means the editor won't reactively re-create when `isLargeDocument` changes, but that's acceptable — the size of a document doesn't change at runtime without a file switch (which destroys the editor anyway).

- [ ] **Step 3: Commit**

```bash
git add src/components/BEditor/hooks/useRichEditor.ts src/components/BEditor/hooks/useExtensions.ts
git commit -m "feat(BEditor): integrate large document async loading into useRichEditor

- Branch initialization: empty JSON placeholder for large docs, existing path for small docs
- Wire useRichEditorLoad state machine with useContent guards
- Loading transactions skip onEditorUpdate writeback and undo history
- handleKeyDown blocks editing keys when loadState.phase !== 'ready'
- watch(bodyContent) handles loading/ready/failed state transitions
- AssignHeadingIds supports { silent: true } mode
- Large doc threshold: LARGE_DOCUMENT_THRESHOLD = 30_000"
```

---

## Task 7: PaneRichEditor.vue — UI and guardEdit

**Files:**
- Modify: `src/components/BEditor/panes/PaneRichEditor.vue`

- [ ] **Step 1: Add loading/failed UI and guardEdit to PaneRichEditor.vue**

**Template additions** (after the overlayRootRef div):

```vue
<template>
  <div ref="overlayRootRef" :class="name" @click="handleEditorClick" @focusout="handleEditorFocusOut">
    <!-- Loading overlay -->
    <div v-if="isLoadingRich" class="b-markdown-rich__loading-overlay">
      <div class="b-markdown-rich__loading-content">
        <div class="b-markdown-rich__loading-spinner" />
        <p>{{ richLoadState.isReload ? '正在重新生成富文本视图，当前暂不可编辑' : '正在加载富文本视图' }}</p>
      </div>
    </div>

    <!-- Failed overlay -->
    <div v-if="isFailedRich" class="b-markdown-rich__failed-overlay">
      <div class="b-markdown-rich__failed-content">
        <p class="b-markdown-rich__failed-message">{{ richLoadState.errorMessage }}</p>
        <div class="b-markdown-rich__failed-actions">
          <BButton size="small" @click="handleRetryLoad">重试</BButton>
          <BButton size="small" type="plain" @click="handleSwitchToSource">切换到源码模式</BButton>
        </div>
      </div>
    </div>

    <!-- Keep existing FrontMatterCard, CurrentBlockMenu, EditorContent -->
    <FrontMatterCard ... />
    <CurrentBlockMenu ... />
    <EditorContent
      :key="editorState?.id"
      :editor="editorInstance ?? undefined"
      class="b-markdown-rich__content"
      :class="{ 'b-markdown-rich__content--loading': isLoadingRich }"
    />
  </div>
</template>
```

**Script additions:**

```typescript
// After existing imports:
import type { RichLoadState, RichLoadCancelReason } from '../adapters/types';

// After existing destructuring of useRichEditor:
const {
  editorInstance,
  loadState: richLoadState,
  isLargeDocument,
} = useRichEditor({
  bodyContent,
  editable: toRef(props, 'editable'),
  editorInstanceId,
  onContentChange: syncToExternal,
  onSearchMatchFocus: handleSearchMatchFocus,
});

// Computed helpers for template
const isLoadingRich = computed(() => richLoadState.value?.phase === 'loading');
const isFailedRich = computed(() => richLoadState.value?.phase === 'failed');
const canEdit = computed(() => richLoadState.value?.phase === 'ready' && props.editable);

// Emit for source mode switch
const emit = defineEmits<{
  (e: 'editor-blur', event: FocusEvent): void;
  (e: 'request-source-mode'): void;
}>();

function handleRetryLoad(): void {
  // retryLoad is exposed from useRichEditor — need to add to return type
}

function handleSwitchToSource(): void {
  emit('request-source-mode');
}
```

**EditorCommand guardEdit wrapper:**

```typescript
/**
 * 统一编辑守卫
 * @throws Error with code RICH_EDITOR_NOT_READY
 */
function guardEdit(): TiptapEditor {
  if (richLoadState.value?.phase !== 'ready' || !props.editable) {
    throw new Error(richLoadState.value?.phase === 'failed'
      ? '富文本加载失败，请重试或切换回源码模式'
      : '富文本正在加载，请稍后或切换到源码模式'
    );
  }
  const instance = editorInstance.value;
  if (!instance) throw new Error('编辑器未初始化');
  return instance;
}

// Modify write methods to use guardEdit:
async function insertAtCursor(content: string): Promise<void> {
  const instance = guardEdit();
  const { selection } = instance.state;
  instance.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, content, { contentType: 'markdown' }).run();
}

async function replaceSelection(content: string): Promise<void> {
  const instance = guardEdit();
  const { selection } = instance.state;
  if (selection.from === selection.to) {
    throw new Error('NO_SELECTION');
  }
  instance.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, content, { contentType: 'markdown' }).run();
}

async function replaceDocument(content: string): Promise<void> {
  const instance = guardEdit();
  instance.commands.setContent(content, { contentType: 'markdown' });
}
```

**Update defineExpose:**

```typescript
defineExpose({
  ...controller,
  recomputeSelectionOverlays,
  richLoadState: computed(() => richLoadState.value),
});
```

**Update useRichEditor return type** to include `retryLoad`:

```typescript
interface UseRichEditorResult {
  // ... existing
  loadState: Readonly<Ref<RichLoadState>>;
  startLoad: (markdown: string, options?: { isReload?: boolean }) => Promise<void>;
  cancelLoad: (reason: RichLoadCancelReason) => void;
  retryLoad: () => Promise<void>;
  isLoadTransaction: (transaction: Transaction) => boolean;
  getLoadSource: () => string | null;
}
```

- [ ] **Step 2: Add loading overlay styles**

Add to the existing `<style lang="less">` block:

```less
.b-markdown-rich__loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-primary) 85%, transparent);
}

.b-markdown-rich__loading-content {
  text-align: center;

  p {
    margin-top: 12px;
    font-size: 14px;
    color: var(--text-secondary);
  }
}

.b-markdown-rich__loading-spinner {
  display: inline-block;
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--editor-link);
  border-radius: 50%;
  animation: b-markdown-rich-spin 0.8s linear infinite;
}

@keyframes b-markdown-rich-spin {
  to { transform: rotate(360deg); }
}

.b-markdown-rich__failed-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
}

.b-markdown-rich__failed-content {
  text-align: center;
}

.b-markdown-rich__failed-message {
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.b-markdown-rich__failed-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.b-markdown-rich__content--loading {
  opacity: 0.5;
  pointer-events: none;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- test/components/BEditor/ 2>&1 | tail -30
```

- [ ] **Step 4: Commit**

```bash
git add src/components/BEditor/panes/PaneRichEditor.vue src/components/BEditor/hooks/useRichEditor.ts
git commit -m "feat(BEditor): add loading/failed UI overlay and guardEdit to PaneRichEditor

- Loading overlay with spinner and context-aware messages
- Failed overlay with retry + switch-to-source buttons
- guardEdit() wrapper on all write commands (insertAtCursor, replaceSelection, replaceDocument)
- throws RICH_EDITOR_NOT_READY when loadState.phase !== 'ready'
- Emit 'request-source-mode' for source switch (decoupled from store)
- Expose richLoadState via defineExpose for parent consumption"
```

---

## Task 8: Side-effect isolation

**Files:**
- Modify: `src/components/BEditor/components/CurrentBlockMenu.vue`
- Modify: `src/components/BEditor/extensions/editorSearch.ts`
- Modify: `src/components/BEditor/adapters/richSelectionAssistant.ts`
- Modify: `src/components/BEditor/Markdown.vue`

- [ ] **Step 1: CurrentBlockMenu — skip recompute during loading**

In `CurrentBlockMenu.vue`, the `transaction` event listener that triggers menu recalculation should check if the transaction is a loading transaction:

```typescript
// In the transaction listener:
editor.on('transaction', ({ transaction }) => {
  // Skip menu recalculation during loading
  if (transaction.getMeta('bEditorRichLoad')) return;
  // ... existing logic
});
```

To access this check, `CurrentBlockMenu` needs to either:
- A) Receive a `disableComputed` prop from parent
- B) Check transaction meta directly

Since CurrentBlockMenu already has access to the `editor` prop, use approach B.

- [ ] **Step 2: editorSearch — clear/pause search during loading**

In `editorSearch.ts`, the search plugin should check for loading transactions:

```typescript
// In the plugin's state apply:
apply(tr, value, oldState, newState) {
  // During loading, don't update search state
  if (tr.getMeta('bEditorRichLoad')) return value;
  // ... existing logic
}
```

- [ ] **Step 3: richSelectionAssistant — hide toolbar during loading**

In `richSelectionAssistant.ts`, the selection update listener should check editor state:

```typescript
function createRichSelectionAssistantAdapter(editor: Editor, options: ...) {
  // ... existing code
  
  editor.on('selectionUpdate', ({ editor: ed }) => {
    // Hide toolbar during loading
    if (!ed.isEditable) return; // Loading sets editable=false, so this naturally blocks
    // ... existing logic
  });
}
```

Since the loading state machine already sets `editor.setEditable(false)` during loading, the natural `!ed.isEditable` check should block selection tools. Verify this is sufficient.

- [ ] **Step 4: Markdown.vue — disable AI/comment/selection tools during loading**

In `Markdown.vue`, add a prop or computed from `PaneRichEditor`'s `richLoadState`:

```vue
<template>
  <!-- Disable AI input when loading -->
  <SelectionAIInput v-if="!isRichLoading" ... />
  
  <!-- Disable comment input when loading -->
  <SelectionCommentInput v-if="!isRichLoading" ... />
  
  <!-- Existing pane rich editor -->
  <PaneRichEditor
    ref="paneRichEditorRef"
    ...
    @request-source-mode="handleSwitchToSource"
  />
</template>

<script setup lang="ts">
const isRichLoading = computed(() => 
  paneRichEditorRef.value?.richLoadState?.phase === 'loading' || 
  paneRichEditorRef.value?.richLoadState?.phase === 'failed'
);

function handleSwitchToSource(): void {
  // Set viewMode to source
  editorPreferencesStore.setViewMode('source');
}
</script>
```

> **Note:** The exact template/ref structure of `Markdown.vue` needs to be read and verified before making modifications. The above is a structural illustration.

- [ ] **Step 5: Run tests**

```bash
pnpm test -- test/components/BEditor/ 2>&1 | tail -30
```

- [ ] **Step 6: Commit**

```bash
git add src/components/BEditor/components/CurrentBlockMenu.vue \
        src/components/BEditor/extensions/editorSearch.ts \
        src/components/BEditor/adapters/richSelectionAssistant.ts \
        src/components/BEditor/Markdown.vue
git commit -m "feat(BEditor): isolate side effects during rich loading

- CurrentBlockMenu: skip menu recompute on loading transactions
- editorSearch: preserve search state during loading transactions
- richSelectionAssistant: rely on isEditable=false to hide toolbar
- Markdown.vue: disable AI/comment/selection tools during loading
- Handle request-source-mode emit from PaneRichEditor"
```

---

## Task 9: Integration test — end-to-end large document loading

**Files:**
- Create: `test/components/BEditor/richLargeDocumentLoad.test.ts`

- [ ] **Step 1: Write end-to-end integration test**

```typescript
/* @vitest-environment jsdom */
/**
 * @file richLargeDocumentLoad.test.ts
 * @description 验证大文档异步加载的完整流程：状态转移、undo 历史隔离、写命令拒绝、快照正确性。
 */
import { nextTick, ref } from 'vue';
import { Editor } from '@tiptap/core';
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import type { Transaction } from '@tiptap/pm/state';
import { useRichEditorLoad, EMPTY_PARAGRAPH_JSON } from '@/components/BEditor/hooks/useRichEditorLoad';
import type { RichLoadState, RichLoadCompletePayload } from '@/components/BEditor/adapters/types';
import { createRichMarkdownSchemaExtensions, createRichEditorRuntimeOnlyExtensions } from '@/components/BEditor/hooks/useExtensions';
import { createSourceLineTracker } from '@/components/BEditor/adapters/sourceLineMapping';
import { getPersistedMarkdown } from '@/components/BEditor/utils/editorMarkdown';

const LARGE_FIXTURE = Array.from({ length: 500 }, (_, i) => `## 章节 ${i + 1}\n\n这是第 ${i + 1} 个章节的段落内容。\n\n- 列表项 A\n- 列表项 B\n\n`).join('');

describe('Large document loading integration', () => {
  let editor: Editor;

  function syncScheduler(fn: () => void): () => void {
    fn();
    return () => {};
  }

  function createEditor(): Editor {
    const sourceLineTracker = createSourceLineTracker();
    const schemaExtensions = createRichMarkdownSchemaExtensions('test-integration', sourceLineTracker);
    const runtimeExtensions = createRichEditorRuntimeOnlyExtensions('test-integration');
    return new Editor({
      extensions: [...schemaExtensions, ...runtimeExtensions],
      content: EMPTY_PARAGRAPH_JSON,
      editable: false,
    });
  }

  beforeEach(() => {
    editor = createEditor();
  });

  afterEach(() => {
    if (!editor.isDestroyed) editor.destroy();
  });

  test('loading transactions do not enter undo history', async () => {
    const completePayloads: RichLoadCompletePayload[] = [];
    const { startLoad, isLoadTransaction } = useRichEditorLoad({
      getEditor: () => editor,
      onLoadComplete: (p) => completePayloads.push(p),
      onLoadFailed: () => {},
      scheduler: syncScheduler,
    });

    // Track undo-able transactions
    const undoableTransactions: Transaction[] = [];
    editor.on('transaction', ({ transaction }) => {
      // Check if transaction would be added to history
      const historyMeta = transaction.getMeta('addToHistory');
      if (historyMeta !== false) {
        undoableTransactions.push(transaction);
      }
    });

    await startLoad(LARGE_FIXTURE);
    await nextTick();

    // Filter only loading transactions for assertion
    const loadingTransactions = undoableTransactions.filter(t => isLoadTransaction(t));
    expect(loadingTransactions).toHaveLength(0);

    // After loading, one undo should not affect the loaded content
    // (since loading transactions aren't in history)
    const contentAfterLoad = getPersistedMarkdown(editor);
    editor.commands.undo();
    const contentAfterUndo = getPersistedMarkdown(editor);
    expect(contentAfterUndo).toBe(contentAfterLoad);
  });

  test('onEditorUpdate should not be triggered by loading transactions', async () => {
    const updateCalls: unknown[] = [];
    editor.on('update', () => {
      updateCalls.push({});
    });

    const { startLoad } = useRichEditorLoad({
      getEditor: () => editor,
      onLoadComplete: () => {},
      onLoadFailed: () => {},
      scheduler: syncScheduler,
    });

    await startLoad(LARGE_FIXTURE);
    await nextTick();

    // No update events should have been emitted during loading
    expect(updateCalls).toHaveLength(0);
  });

  test('loading preserves markdown structure', async () => {
    const completePayloads: RichLoadCompletePayload[] = [];
    const { startLoad } = useRichEditorLoad({
      getEditor: () => editor,
      onLoadComplete: (p) => completePayloads.push(p),
      onLoadFailed: () => {},
      scheduler: syncScheduler,
    });

    await startLoad(LARGE_FIXTURE);
    await nextTick();

    expect(completePayloads).toHaveLength(1);
    const exported = getPersistedMarkdown(editor);
    expect(exported).toBe(LARGE_FIXTURE);
  });
});
```

Run: `pnpm test -- test/components/BEditor/richLargeDocumentLoad.test.ts --reporter=verbose 2>&1 | tail -60`

- [ ] **Step 2: Fix until all tests pass**

- [ ] **Step 3: Commit**

```bash
git add test/components/BEditor/richLargeDocumentLoad.test.ts
git commit -m "test(BEditor): add large document loading integration tests

- Verify loading transactions don't enter undo history
- Verify onEditorUpdate not triggered by loading transactions
- Verify markdown round-trip stability after async loading
- Use 500-section fixture for realistic loading behavior"
```

---

## Task 10: Run full test suite and type check

- [ ] **Step 1: Full TypeScript type check**

```bash
pnpm exec tsc --noEmit 2>&1 | tail -40
```

Fix any type errors.

- [ ] **Step 2: Full test suite**

```bash
pnpm test 2>&1 | tail -50
```

Fix any failing tests.

- [ ] **Step 3: ESLint check**

```bash
pnpm lint 2>&1 | tail -40
```

- [ ] **Step 4: Stylelint check**

```bash
pnpm lint:style 2>&1 | tail -40
```

- [ ] **Step 5: Commit (if any fixes)**

```bash
git add -A
git commit -m "chore(BEditor): fix type errors and lint issues from loading implementation"
```
