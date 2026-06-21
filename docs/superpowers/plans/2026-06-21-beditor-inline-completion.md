# BEditor Inline Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add adapter-based inline completion to BEditor, implementing Rich mode first and Source mode through the same state machine afterward.

**Architecture:** The feature is split into a shared adapter contract, a shared context/prompt layer, a shared `useInlineCompletion` state machine, and pane-specific rendering adapters. Rich mode uses a TipTap/ProseMirror plugin for ghost text first; Source mode later implements the same contract with CodeMirror without changing the state machine.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, TipTap 3 / ProseMirror, CodeMirror 6, Pinia service model store, existing `useChat().agent.invoke`, Vitest.

**Commit Policy:** Do not commit during implementation. Keep changes in the working tree until the user explicitly approves a final commit.

---

## File Structure

- Create `src/components/BEditor/adapters/inlineCompletionAdapter.ts`
  Defines shared pane, cursor, request token, interaction, adapter, and trigger context types.

- Create `src/components/BEditor/utils/inlineCompletionContext.ts`
  Builds prompt input from editor text, cursor position, and file metadata. Also sanitizes model output and applies display limits.

- Create `src/components/BEditor/hooks/useInlineCompletion.ts`
  Owns the shared state machine, debounce, IME freeze, request token checks, timeout, failure backoff, and accept/cancel orchestration.

- Create `src/components/BEditor/extensions/richInlineCompletion.ts`
  Provides a TipTap extension and Rich adapter factory. Renders ghost text with ProseMirror decorations and accepts text as a single editor transaction.

- Modify `src/components/BEditor/hooks/useRichEditor.ts`
  Adds the Rich inline completion extension to the existing extension list, while preserving current Tab/Esc behavior when no ghost text is showing.

- Modify `src/components/BEditor/panes/PaneRichEditor.vue`
  Creates the Rich adapter and shared state machine when the editor is ready, then destroys both on unmount.

- Create `src/components/BEditor/extensions/sourceInlineCompletion.ts`
  Adds the Source adapter skeleton and CodeMirror ghost extension after Rich is stable.

- Modify `src/components/BEditor/panes/PaneSourceEditor.vue`
  Registers the Source adapter through the same state machine once the Source extension exists.

- Add tests:
  - `test/components/BEditor/inline-completion-context.test.ts`
  - `test/components/BEditor/use-inline-completion.test.ts`
  - `test/components/BEditor/rich-inline-completion.test.ts`
  - `test/components/BEditor/source-inline-completion.test.ts`

- Modify `changelog/2026-06-21.md`
  Records the inline completion feature under `Added` or `Features`.

## Task 1: Shared Types And Prompt Utilities

**Files:**
- Create: `src/components/BEditor/adapters/inlineCompletionAdapter.ts`
- Create: `src/components/BEditor/utils/inlineCompletionContext.ts`
- Test: `test/components/BEditor/inline-completion-context.test.ts`

- [ ] **Step 1: Write failing prompt utility tests**

```ts
/**
 * @file inline-completion-context.test.ts
 * @description BEditor inline completion prompt/context utility tests.
 */
import { describe, expect, it } from 'vitest';
import {
  buildInlineCompletionPrompt,
  normalizeInlineCompletionText,
  shouldDisplayInlineCompletion
} from '@/components/BEditor/utils/inlineCompletionContext';

describe('inline completion context utilities', (): void => {
  it('builds a structured prompt around the cursor', (): void => {
    const prompt = buildInlineCompletionPrompt({
      filename: 'note.md',
      fileType: '.md',
      writingMode: 'rich',
      headingPath: ['Plan'],
      prefix: '# Plan\nThe next step',
      suffix: '\n\n## Later'
    });

    expect(prompt).toContain('## Document metadata');
    expect(prompt).toContain('- Filename: note.md');
    expect(prompt).toContain('Plan');
    expect(prompt).toContain('# Plan\nThe next step<cursor>');
    expect(prompt).toContain('## Text after cursor');
    expect(prompt).toContain('## Later');
  });

  it('normalizes model output before rendering ghost text', (): void => {
    expect(normalizeInlineCompletionText('```markdown\ncontinues here\n```')).toBe('continues here');
    expect(normalizeInlineCompletionText('<cursor>continues')).toBe('continues');
    expect(normalizeInlineCompletionText('---\ntitle: bad\n---\ncontinues')).toBe('continues');
  });

  it('rejects too-short and duplicate completions', (): void => {
    expect(shouldDisplayInlineCompletion(' a ', 'anything')).toBe(false);
    expect(shouldDisplayInlineCompletion('continued text', 'continued text already exists')).toBe(false);
    expect(shouldDisplayInlineCompletion('new thought', 'different suffix')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm test -- test/components/BEditor/inline-completion-context.test.ts`

Expected: FAIL because `inlineCompletionContext.ts` does not exist.

- [ ] **Step 3: Create shared adapter types**

```ts
/**
 * @file inlineCompletionAdapter.ts
 * @description BEditor 内联补全 pane 适配器协议与共享类型。
 */
import type { EditorState } from '../types';

/**
 * 内联补全所在编辑器视图。
 */
export type InlineCompletionPane = 'rich' | 'source';

/**
 * 内联补全状态机状态。
 */
export type InlineCompletionStatus = 'idle' | 'triggering' | 'loading' | 'showing' | 'accepting' | 'cancelling' | 'error';

/**
 * 用户与编辑器的交互类型。
 */
export type InlineCompletionUserInteraction = 'input' | 'cursor' | 'blur' | 'compositionStart' | 'compositionEnd';

/**
 * 光标位置快照。
 */
export interface InlineCompletionCursorPosition {
  /** 编辑器内绝对位置 */
  absolutePosition: number;
}

/**
 * 一次补全请求的稳定令牌。
 */
export interface InlineCompletionRequestToken {
  /** 请求 ID */
  requestId: string;
  /** 请求发起时的文档版本 */
  docVersion: number;
  /** 请求发起时的光标位置 */
  cursorPosition: InlineCompletionCursorPosition;
}

/**
 * 内联补全触发上下文。
 */
export interface InlineCompletionTriggerContext {
  /** 当前编辑器元数据 */
  editorState: EditorState;
  /** 当前 pane 类型 */
  pane: InlineCompletionPane;
}

/**
 * Pane 级内联补全适配器。
 */
export interface InlineCompletionAdapter {
  /** 当前 pane 类型 */
  readonly pane: InlineCompletionPane;
  /** 当前是否可编辑 */
  isEditable(): boolean;
  /** 当前是否允许触发补全 */
  canTriggerInlineCompletion(): boolean;
  /** 读取当前光标位置 */
  getCursorPosition(): InlineCompletionCursorPosition | null;
  /** 读取当前文档版本 */
  getDocVersion(): number;
  /** 读取当前完整文档文本 */
  getDocumentText(): string;
  /** 显示 ghost text */
  showGhost(text: string, requestToken: InlineCompletionRequestToken): void;
  /** 清理 ghost text */
  hideGhost(): void;
  /** 接受当前 ghost text */
  acceptGhostText(text: string): Promise<void>;
  /** 绑定用户交互事件 */
  onUserInteraction(callback: (type: InlineCompletionUserInteraction) => void): () => void;
  /** 销毁资源 */
  destroy(): void;
}
```

- [ ] **Step 4: Create prompt utilities**

```ts
/**
 * @file inlineCompletionContext.ts
 * @description BEditor 内联补全上下文提取、Prompt 组装与输出清洗工具。
 */
import type { InlineCompletionPane } from '../adapters/inlineCompletionAdapter';

const MIN_DISPLAY_CHARS = 2;
const MAX_DISPLAY_CHARS = 500;
const MAX_DISPLAY_LINES = 5;

/**
 * Prompt 输入上下文。
 */
export interface InlineCompletionPromptInput {
  /** 文件名 */
  filename: string;
  /** 文件类型 */
  fileType: string;
  /** 写作模式 */
  writingMode: InlineCompletionPane;
  /** 当前标题路径 */
  headingPath: string[];
  /** 光标前文本 */
  prefix: string;
  /** 光标后文本 */
  suffix: string;
}

/**
 * 提取光标附近上下文。
 * @param documentText - 完整文档文本
 * @param cursorPosition - 光标绝对位置
 * @returns prefix 与 suffix 上下文
 */
export function extractInlineCompletionContext(documentText: string, cursorPosition: number): { prefix: string; suffix: string } {
  const safePosition = Math.min(Math.max(0, cursorPosition), documentText.length);
  const prefix = documentText.slice(Math.max(0, safePosition - 2400), safePosition);
  const suffix = documentText.slice(safePosition, safePosition + 900);
  return { prefix, suffix };
}

/**
 * 从 Markdown 文本中解析当前标题路径。
 * @param prefix - 光标前文本
 * @returns 标题路径，最多 6 级
 */
export function resolveInlineCompletionHeadingPath(prefix: string): string[] {
  const headings: string[] = [];
  prefix.split(/\r?\n/).forEach((line: string): void => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!match) {
      return;
    }

    const level = match[1].length;
    headings.splice(level - 1);
    headings[level - 1] = match[2].trim();
  });
  return headings.filter(Boolean).slice(0, 6);
}

/**
 * 构建内联补全 prompt。
 * @param input - prompt 输入上下文
 * @returns 完整 prompt
 */
export function buildInlineCompletionPrompt(input: InlineCompletionPromptInput): string {
  const headingPath = input.headingPath.length > 0 ? input.headingPath.join(' > ') : '(none)';
  return [
    "You are a writing assistant. Continue the user's markdown document exactly at the cursor position.",
    '',
    '## Document metadata',
    `- Filename: ${input.filename || 'Untitled'}`,
    `- File type: ${input.fileType || '.md'}`,
    `- Writing mode: ${input.writingMode}`,
    '',
    '## Current heading path',
    headingPath,
    '',
    '## Text before cursor',
    `${input.prefix}<cursor>`,
    '',
    '## Text after cursor',
    input.suffix,
    '',
    '## Rules',
    '- Continue directly after `<cursor>`. Do not repeat any text already before `<cursor>`.',
    '- Do not output the literal string `<cursor>`.',
    '- Do not wrap the output in markdown code blocks.',
    '- Do not expand lists unless the cursor is already inside a list item.',
    '- Keep the same writing style, tone, and markdown formatting.',
    '- Output only the continuation text.'
  ].join('\n');
}

/**
 * 清洗模型输出，避免污染编辑器。
 * @param text - 原始模型输出
 * @returns 可显示的补全文本
 */
export function normalizeInlineCompletionText(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/<cursor>/gi, '')
    .replace(/^---[\s\S]*?---\s*/, '')
    .trimEnd();
}

/**
 * 截断 ghost text 到可显示范围。
 * @param text - 清洗后的补全文本
 * @returns 截断后的文本
 */
export function truncateInlineCompletionText(text: string): string {
  const byLength = text.length > MAX_DISPLAY_CHARS ? `${text.slice(0, MAX_DISPLAY_CHARS)}...` : text;
  const lines = byLength.split(/\r?\n/);
  return lines.length > MAX_DISPLAY_LINES ? `${lines.slice(0, MAX_DISPLAY_LINES).join('\n')}...` : byLength;
}

/**
 * 判断 ghost text 是否值得显示。
 * @param text - 补全文本
 * @param suffix - 光标后文本
 * @returns 是否显示
 */
export function shouldDisplayInlineCompletion(text: string, suffix: string): boolean {
  if (text.trim().length < MIN_DISPLAY_CHARS) {
    return false;
  }

  const normalizedText = text.trim().toLowerCase();
  const normalizedSuffix = suffix.trim().toLowerCase();
  if (!normalizedSuffix) {
    return true;
  }

  return !normalizedSuffix.startsWith(normalizedText.slice(0, Math.max(4, Math.floor(normalizedText.length * 0.8))));
}
```

- [ ] **Step 5: Run context tests**

Run: `pnpm test -- test/components/BEditor/inline-completion-context.test.ts`

Expected: PASS.

## Task 2: Shared State Machine

**Files:**
- Create: `src/components/BEditor/hooks/useInlineCompletion.ts`
- Test: `test/components/BEditor/use-inline-completion.test.ts`

- [ ] **Step 1: Write failing state machine tests**

```ts
/**
 * @file use-inline-completion.test.ts
 * @description BEditor inline completion state machine tests.
 */
import type { InlineCompletionAdapter, InlineCompletionUserInteraction } from '@/components/BEditor/adapters/inlineCompletionAdapter';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useInlineCompletion } from '@/components/BEditor/hooks/useInlineCompletion';

function createAdapter(): InlineCompletionAdapter & { emit: (type: InlineCompletionUserInteraction) => void } {
  let callback: ((type: InlineCompletionUserInteraction) => void) | null = null;
  return {
    pane: 'rich',
    isEditable: () => true,
    canTriggerInlineCompletion: () => true,
    getCursorPosition: () => ({ absolutePosition: 5 }),
    getDocVersion: () => 10,
    getDocumentText: () => 'hello world',
    showGhost: vi.fn(),
    hideGhost: vi.fn(),
    acceptGhostText: vi.fn(async (): Promise<void> => undefined),
    onUserInteraction: (handler) => {
      callback = handler;
      return (): void => {
        callback = null;
      };
    },
    destroy: vi.fn(),
    emit: (type) => callback?.(type)
  };
}

describe('useInlineCompletion', (): void => {
  it('shows ghost text after a valid invoke response', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    const completion = useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    await nextTick();

    expect(invoke).toHaveBeenCalledOnce();
    expect(adapter.showGhost).toHaveBeenCalledWith(' completion', expect.objectContaining({ docVersion: 10 }));
    expect(completion.state.value.status).toBe('showing');
    vi.useRealTimers();
  });

  it('cancels stale results after cursor movement', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const invoke = vi.fn(
      async (): Promise<string> =>
        new Promise((resolve) => {
          setTimeout(() => resolve(' stale'), 20);
        })
    );
    useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    adapter.emit('cursor');
    await vi.advanceTimersByTimeAsync(30);

    expect(adapter.showGhost).not.toHaveBeenCalled();
    expect(adapter.hideGhost).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('accepts visible ghost text with a single adapter call', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const completion = useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: async (): Promise<string> => ' accepted',
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    await completion.accept();

    expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
    expect(completion.state.value.status).toBe('idle');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm test -- test/components/BEditor/use-inline-completion.test.ts`

Expected: FAIL because `useInlineCompletion.ts` does not exist.

- [ ] **Step 3: Implement shared state machine**

Implement `useInlineCompletion` with:

```ts
export interface UseInlineCompletionOptions {
  adapter: InlineCompletionAdapter;
  editorState: () => EditorState;
  invokeCompletion: (prompt: string, maxOutputTokens: number) => Promise<string>;
  debounceMs?: number;
  timeoutMs?: number;
}
```

Required behavior:

- `input` schedules debounce unless IME is active.
- `cursor`, `blur`, and `compositionStart` call `cancel()`.
- `compositionStart` freezes debounce.
- `compositionEnd` unfreezes and schedules a new debounce.
- `trigger()` builds prompt using `inlineCompletionContext.ts`.
- `requestId`, `docVersion`, and `cursorPosition.absolutePosition` are checked before showing.
- `accept()` only acts in `showing` state.
- `destroy()` clears timers, hides ghost text, removes interaction listeners, and destroys the adapter.

- [ ] **Step 4: Run state machine tests**

Run: `pnpm test -- test/components/BEditor/use-inline-completion.test.ts`

Expected: PASS.

## Task 3: Rich Ghost Text Extension And Adapter

**Files:**
- Create: `src/components/BEditor/extensions/richInlineCompletion.ts`
- Test: `test/components/BEditor/rich-inline-completion.test.ts`

- [ ] **Step 1: Write failing Rich adapter tests**

```ts
/**
 * @file rich-inline-completion.test.ts
 * @description Rich inline completion adapter tests.
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it, vi } from 'vitest';
import {
  RichInlineCompletion,
  createRichInlineCompletionAdapter,
  richInlineCompletionPluginKey
} from '@/components/BEditor/extensions/richInlineCompletion';

describe('rich inline completion adapter', (): void => {
  it('renders and clears ghost text through plugin state', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);

    adapter.showGhost(' world', {
      requestId: 'r1',
      docVersion: adapter.getDocVersion(),
      cursorPosition: { absolutePosition: editor.state.selection.from }
    });

    expect(richInlineCompletionPluginKey.getState(editor.state)?.text).toBe(' world');
    adapter.hideGhost();
    expect(richInlineCompletionPluginKey.getState(editor.state)?.text).toBe('');
    editor.destroy();
  });

  it('accepts ghost text at the current cursor', async (): Promise<void> => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);

    editor.commands.setTextSelection(6);
    await adapter.acceptGhostText(' world');

    expect(editor.getText()).toContain('hello world');
    editor.destroy();
  });

  it('emits user interaction callbacks', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    editor.commands.insertContent('!');
    expect(callback).toHaveBeenCalledWith('input');
    cleanup();
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm test -- test/components/BEditor/rich-inline-completion.test.ts`

Expected: FAIL because `richInlineCompletion.ts` does not exist.

- [ ] **Step 3: Implement Rich extension and adapter**

Implementation requirements:

- Define `richInlineCompletionPluginKey`.
- Define a ProseMirror plugin state `{ text: string; token: InlineCompletionRequestToken | null }`.
- Add meta actions `show` and `hide`.
- Use `Decoration.widget(position, element, { side: 1 })` to render `<span class="b-markdown-rich__inline-completion-ghost">...</span>`.
- Adapter `getCursorPosition()` returns null when selection is not empty.
- Adapter `onUserInteraction()` wires `update`, `selectionUpdate`, `blur`, and DOM composition events.
- Adapter `destroy()` clears ghost text and removes listeners.

- [ ] **Step 4: Run Rich adapter tests**

Run: `pnpm test -- test/components/BEditor/rich-inline-completion.test.ts`

Expected: PASS.

## Task 4: Wire Rich Pane To State Machine

**Files:**
- Modify: `src/components/BEditor/hooks/useRichEditor.ts`
- Modify: `src/components/BEditor/panes/PaneRichEditor.vue`
- Test: `test/components/BEditor/rich-inline-completion.test.ts`

- [ ] **Step 1: Add Rich extension to `useRichEditor`**

Modify `useRichEditor.ts` so `RichInlineCompletion` is appended to the existing extension list returned by `useExtensions`, preserving current extension order for existing behavior.

- [ ] **Step 2: Create invoke bridge in `PaneRichEditor.vue`**

Add an inline completion instance when `editorInstance` and `props.editorState` are available:

```ts
const inlineCompletion = shallowRef<ReturnType<typeof useInlineCompletion> | null>(null);
const inlineCompletionAdapter = shallowRef<InlineCompletionAdapter | null>(null);
const serviceModelStore = useServiceModelStore();
const { agent } = useChat({ ignoreEnabled: false });
```

The pane-level `invokeCompletion` must:

- Load `polish` service config.
- Return an empty string when no config is available.
- Call `agent.invoke({ providerId, modelId, prompt, temperature: 0.2, maxOutputTokens })`.
- Return `result.text` on success and throw `Error(error.message)` on failure.

- [ ] **Step 3: Preserve existing keyboard behavior**

Ensure the existing `handleKeyDown` logic in `useRichEditor.ts` stays responsible for Tab indentation when no ghost text is showing. The Rich plugin should only consume `Tab` or `Esc` when its plugin state has non-empty text and composition is inactive.

- [ ] **Step 4: Add ghost text style**

Add a full class selector in `PaneRichEditor.vue` style:

```less
.b-markdown-rich__inline-completion-ghost {
  color: var(--editor-placeholder);
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 5: Run Rich tests**

Run: `pnpm test -- test/components/BEditor/rich-inline-completion.test.ts test/components/BEditor/use-inline-completion.test.ts`

Expected: PASS.

## Task 5: Source Adapter Follow-Up

**Files:**
- Create: `src/components/BEditor/extensions/sourceInlineCompletion.ts`
- Modify: `src/components/BEditor/panes/PaneSourceEditor.vue`
- Test: `test/components/BEditor/source-inline-completion.test.ts`

- [ ] **Step 1: Write failing Source adapter tests**

Create tests that instantiate CodeMirror `EditorView`, show ghost text, clear it, accept it, and verify a single dispatch inserts text at the cursor.

- [ ] **Step 2: Implement CodeMirror extension**

Use a `StateField` and `StateEffect` pair to store ghost text. Render a widget decoration with class `b-markdown-source__inline-completion-ghost`.

- [ ] **Step 3: Wire Source pane**

Register the Source extension in `createEditorExtensions()` and create a Source adapter/state machine in `onMounted()` using the same `useInlineCompletion` hook.

- [ ] **Step 4: Run Source tests**

Run: `pnpm test -- test/components/BEditor/source-inline-completion.test.ts`

Expected: PASS.

## Task 6: Changelog And Verification

**Files:**
- Modify: `changelog/2026-06-21.md`

- [ ] **Step 1: Update changelog**

Add under `Added` or `Features`:

```md
- BEditor Markdown 编辑器新增基于适配器的 AI 内联补全能力，支持 Rich 优先接入并为 Source 模式预留同一状态机。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test -- test/components/BEditor/inline-completion-context.test.ts test/components/BEditor/use-inline-completion.test.ts test/components/BEditor/rich-inline-completion.test.ts test/components/BEditor/source-inline-completion.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: PASS or only auto-fixes in touched files.

- [ ] **Step 5: Run stylelint**

Run: `pnpm lint:style`

Expected: PASS or only auto-fixes in touched files.

- [ ] **Step 6: Final status check without commit**

Run: `git status --short`

Expected: shows only intentional working-tree changes. Do not stage or commit until the user approves.

## Self-Review

- Spec coverage: Rich-first implementation, shared adapter contract, one-shot invoke, stale token rejection, IME handling, Tab/Esc behavior, Source follow-up, prompt contract, observability, tests, and changelog are all mapped to tasks.
- Placeholder scan: The plan avoids TBD/TODO placeholders. Source task is intentionally second-phase but still names exact files and required behavior.
- Type consistency: Adapter, request token, cursor position, and interaction names match across tasks.
