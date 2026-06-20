# Chat Message File Part Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert BChat file references into first-class `type: 'file'` message parts, snapshot file content at send time, and send snapshots to AI SDK as native file content parts.

**Architecture:** Renderer parses input text into ordered `text` and `file` input parts without reading files. Main-process ChatRuntime materializes file input parts into persisted file parts with snapshots before storing the user message. Model-message conversion renders persisted file parts into AI SDK `ModelMessage` content arrays and reuses snapshots for regenerate/continue/compact.

**Tech Stack:** Vue 3, Electron main process `.mts`, TypeScript strict mode, Vitest, AI SDK 6 `ModelMessage` file parts.

---

## Current Context

Design spec: `docs/superpowers/specs/2026-06-20-chat-message-file-part-design.md`

Important current behavior:

- `src/components/BChat/index.vue` currently calls `buildMessageReferences(trimmedContent)` before `chatRuntime.send(...)`.
- `src/components/BChat/utils/messageHelper.ts` currently has renderer-only `references` support.
- `types/chat.d.ts` currently has no persisted `references` or `file` message part in `ChatMessageRecord`.
- `electron/main/modules/chat/runtime/messages/factory.mts` creates runtime user messages from `content` and `files` only.
- `electron/main/modules/chat/runtime/context/model-message.mts` converts user messages from `content` and image `files` only.
- `src/components/BChat/utils/runtimeBridge.ts` can already read opened editor file content and unsaved draft content via `file-content-snapshot`.

## File Structure

Create:

- `src/components/BChat/utils/filePartParser.ts`  
  Renderer pure parser that splits input text into `ChatMessageTextPart | ChatMessageFilePartInput` without reading files.

- `electron/main/modules/chat/runtime/messages/file-parts.mts`  
  Main-process snapshot/materialization helpers for `ChatMessageFilePartInput -> ChatMessageFilePart`.

- `test/components/BChat/file-part-parser.test.ts`  
  Renderer parser tests.

- `test/electron/main/modules/chat/runtime/file-parts.test.ts`  
  Main-process snapshot tests.

Modify:

- `types/chat.d.ts`  
  Add `ChatMessageFilePartInput`, `ChatMessageFilePartSnapshot`, `ChatMessageFilePart`, and include persisted `ChatMessageFilePart` in `ChatMessagePart`.

- `types/chat-runtime.d.ts`  
  Add `parts?: ChatRuntimeUserInputPart[]` to `ChatRuntimeSendInput`, where file parts are input-only and text parts are normal text parts.

- `src/utils/file/reference.ts`  
  Export reusable file-ref match/parse helpers that preserve source text ranges.

- `src/components/BChat/utils/messageHelper.ts`  
  Remove new-send dependency on `references`; keep legacy helpers only where existing UI/tests still need them.

- `src/components/BChat/index.vue`  
  Build user input parts and pass them to `chatRuntime.send(...)`; improve send error toast for snapshot failures.

- `src/components/BChat/hooks/useChatRuntime.ts`  
  Include `parts` in `BChatRuntimeSendInput` and cloneable IPC payload.

- `electron/main/modules/chat/runtime/messages/factory.mts`  
  Accept materialized parts when creating user messages.

- `electron/main/modules/chat/runtime/types.mts`  
  Add an injectable file part materializer dependency for service integration tests.

- `electron/main/modules/chat/runtime/service.mts`  
  Materialize file parts before persisting user messages.

- `electron/main/modules/chat/runtime/context/model-message.mts`  
  Convert user message parts into AI SDK content arrays with native `type: 'file'` parts.

- Existing tests:
  - `test/utils/file/reference.test.ts`
  - `test/components/BChat/use-chat-runtime.test.ts`
  - `test/components/BChat/session-id-runtime.test.ts`
  - `test/electron/main/modules/chat/runtime/model-message-context.test.ts`
  - `test/electron/main/modules/chat/runtime/service.test.ts`

## Constraints

- Do not commit per task. Keep all changes uncommitted until the full feature is complete and verified.
- All new functions, interfaces, and complex logic need comments per `AGENTS.md`.
- Do not use `any`; use concrete types or `unknown`.
- `B*` components remain globally auto-imported unless used as types or dynamic imports.
- Less selectors must not use `&__child` shorthand.

---

### Task 1: Add Shared File Part Types

**Files:**
- Modify: `types/chat.d.ts`
- Modify: `types/chat-runtime.d.ts`
- Test: `test/electron/main/modules/chat/runtime/shared-types.test.ts`

- [ ] **Step 1: Write the failing type-level test**

Append compile-time assertions to `test/electron/main/modules/chat/runtime/shared-types.test.ts`:

```ts
import type { ChatMessageFilePart, ChatMessageFilePartInput, ChatMessagePart } from 'types/chat';
import type { ChatRuntimeSendInput } from 'types/chat-runtime';

describe('chat runtime shared file part types', (): void => {
  it('accepts input file parts without snapshots and persisted file parts with snapshots', (): void => {
    const inputPart: ChatMessageFilePartInput = {
      type: 'file',
      id: 'file-part-1',
      filename: 'foo.ts',
      mime: 'text/plain',
      url: 'file:///workspace/src/foo.ts?start=10&end=20',
      path: 'src/foo.ts',
      sourceText: { start: 4, end: 25, value: '{{#src/foo.ts 10-20}}' }
    };

    const persistedPart: ChatMessageFilePart = {
      ...inputPart,
      snapshot: {
        content: 'export const foo = 1;',
        startLine: 10,
        endLine: 20,
        totalLines: 100,
        contentHash: 'hash-1',
        capturedAt: '2026-06-20T00:00:00.000Z'
      }
    };

    const messagePart: ChatMessagePart = persistedPart;
    const sendInput: Pick<ChatRuntimeSendInput, 'parts'> = { parts: [{ type: 'text', text: 'fix ' }, inputPart] };

    expect(messagePart.type).toBe('file');
    expect(sendInput.parts?.[1]?.type).toBe('file');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test test/electron/main/modules/chat/runtime/shared-types.test.ts
```

Expected: FAIL with missing exported `ChatMessageFilePartInput` / `ChatMessageFilePart`.

- [ ] **Step 3: Add shared types**

In `types/chat.d.ts`, add before `ChatMessageTextPart`:

```ts
/**
 * 聊天消息文件输入片段。
 * Renderer 发送前使用该形态，不包含 snapshot。
 */
export interface ChatMessageFilePartInput {
  /** 片段类型 */
  type: 'file';
  /** 文件 part 唯一标识 */
  id: string;
  /** 展示文件名 */
  filename: string;
  /** MIME 类型 */
  mime: string;
  /** 规范化资源 URL */
  url: string;
  /** 用户输入来源路径 */
  path: string;
  /** 用户原始输入中的引用文本及位置 */
  sourceText: {
    /** token 起始 offset */
    start: number;
    /** token 结束 offset */
    end: number;
    /** 原始 token 文本 */
    value: string;
  };
}

/**
 * 聊天消息文件内容快照。
 */
export interface ChatMessageFilePartSnapshot {
  /** 固化后的文件内容 */
  content: string;
  /** 快照起始行号 */
  startLine: number;
  /** 快照结束行号 */
  endLine: number;
  /** 文件总行数 */
  totalLines: number;
  /** 快照内容哈希 */
  contentHash: string;
  /** 快照创建时间 */
  capturedAt: string;
  /** 是否被截断 */
  truncated?: boolean;
}

/**
 * 聊天消息文件片段。
 * 进入聊天历史前必须包含 snapshot。
 */
export interface ChatMessageFilePart extends ChatMessageFilePartInput {
  /** 发送时固化的文件内容快照 */
  snapshot: ChatMessageFilePartSnapshot;
}
```

Update `ChatMessagePart` union:

```ts
export type ChatMessagePart =
  | ChatMessageTextPart
  | ChatMessageFilePart
  | ChatMessageErrorPart
  | ChatMessageThinkingPart
  | ChatMessageToolPart
  | ChatMessageConfirmationPart
  | ChatMessageCompactionPart;
```

In `types/chat-runtime.d.ts`, import `ChatMessageFilePartInput` and `ChatMessageTextPart`:

```ts
import type { AIUserChoiceAnswerData, ChatMessageConfirmationCustomInputConfig, ChatMessageFilePartInput, ChatMessagePart, ChatMessageRecord, ChatMessageTextPart } from './chat';
```

Add:

```ts
/** Renderer-created user input parts accepted by runtime send commands. */
export type ChatRuntimeUserInputPart = ChatMessageTextPart | ChatMessageFilePartInput;
```

Add to `ChatRuntimeSendInput`:

```ts
  /** Ordered user input parts parsed by renderer before file snapshots are materialized. */
  parts?: ChatRuntimeUserInputPart[];
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test test/electron/main/modules/chat/runtime/shared-types.test.ts
```

Expected: PASS.

---

### Task 2: Parse Renderer Input Into Ordered Parts

**Files:**
- Modify: `src/utils/file/reference.ts`
- Create: `src/components/BChat/utils/filePartParser.ts`
- Test: `test/utils/file/reference.test.ts`
- Test: `test/components/BChat/file-part-parser.test.ts`

- [ ] **Step 1: Write file reference source-range tests**

Append to `test/utils/file/reference.test.ts`:

```ts
import { findFileReferenceTokens } from '@/utils/file/reference';

describe('findFileReferenceTokens', (): void => {
  it('returns decoded file references with source offsets', (): void => {
    const content = `fix {{#[](${encodeURIComponent('src/foo.ts')}) 10-20}} please`;
    const tokens = findFileReferenceTokens(content);

    expect(tokens).toEqual([
      {
        token: `{{#[](${encodeURIComponent('src/foo.ts')}) 10-20}}`,
        start: 4,
        end: content.length - 7,
        reference: expect.objectContaining({
          rawPath: 'src/foo.ts',
          startLine: 10,
          endLine: 20,
          fileName: 'foo.ts'
        })
      }
    ]);
  });
});
```

- [ ] **Step 2: Add source-range helper**

In `src/utils/file/reference.ts`, export:

```ts
/**
 * 文件引用 token 匹配结果。
 */
export interface FileReferenceTokenMatch {
  /** 原始完整 token，含双花括号 */
  token: string;
  /** token 起始 offset */
  start: number;
  /** token 结束 offset */
  end: number;
  /** 结构化文件引用 */
  reference: ParsedFileReference;
}

/** 消息中的文件引用 token 正则表达式。 */
export const FILE_REFERENCE_MESSAGE_TOKEN_PATTERN = /\{\{(#\S+(?:\s+\d+-\d+(?:\|\d+-\d+)?)?)\}\}/g;

/**
 * 查找文本中的文件引用 token，并保留源码位置。
 * @param content - 输入文本
 * @returns 文件引用 token 列表
 */
export function findFileReferenceTokens(content: string): FileReferenceTokenMatch[] {
  return [...content.matchAll(FILE_REFERENCE_MESSAGE_TOKEN_PATTERN)]
    .map((match): FileReferenceTokenMatch | null => {
      const [token, tokenContent] = match;
      const reference = parseFileReferenceToken(tokenContent);
      if (!reference || match.index === undefined) return null;

      return {
        token,
        start: match.index,
        end: match.index + token.length,
        reference
      };
    })
    .filter((item): item is FileReferenceTokenMatch => item !== null);
}
```

- [ ] **Step 3: Write parser tests**

Create `test/components/BChat/file-part-parser.test.ts`:

```ts
/**
 * @file file-part-parser.test.ts
 * @description BChat 输入文件 part 解析测试。
 */
import type { ChatMessageFilePartInput } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { buildUserInputParts } from '@/components/BChat/utils/filePartParser';
import { encodeFileReferencePath } from '@/utils/file/reference';

describe('buildUserInputParts', (): void => {
  it('splits text and file references in source order', (): void => {
    const tokenPath = encodeFileReferencePath('src/foo.ts');
    const parts = buildUserInputParts(`fix {{#${tokenPath} 10-20}} please`, '/workspace');

    expect(parts[0]).toEqual({ type: 'text', text: 'fix ' });
    expect(parts[1]).toMatchObject({
      type: 'file',
      filename: 'foo.ts',
      mime: 'text/plain',
      path: 'src/foo.ts',
      url: 'file:///workspace/src/foo.ts?start=10&end=20',
      sourceText: { start: 4, value: `{{#${tokenPath} 10-20}}` }
    });
    expect(parts[2]).toEqual({ type: 'text', text: ' please' });
  });

  it('keeps unsaved paths as unsaved URL inputs', (): void => {
    const path = 'unsaved://file-1/Draft.md';
    const tokenPath = encodeFileReferencePath(path);
    const parts = buildUserInputParts(`read {{#${tokenPath}}}`, '/workspace');
    const filePart = parts[1] as ChatMessageFilePartInput;

    expect(filePart.type).toBe('file');
    expect(filePart.path).toBe(path);
    expect(filePart.url).toBe('unsaved://file-1/Draft.md');
  });
});
```

- [ ] **Step 4: Create parser implementation**

Create `src/components/BChat/utils/filePartParser.ts`:

```ts
/**
 * @file filePartParser.ts
 * @description 将 BChat 输入文本解析为有序 runtime user parts。
 */
import type { ChatMessageFilePartInput, ChatMessageTextPart } from 'types/chat';
import { nanoid } from 'nanoid';
import { isAbsoluteFilePath } from '@/shared/workspace/pathUtils';
import { findFileReferenceTokens, type FileReferenceTokenMatch } from '@/utils/file/reference';
import { isUnsavedPath } from '@/utils/file/unsaved';

/** Renderer 发送给 ChatRuntime 的用户输入片段。 */
export type BChatUserInputPart = ChatMessageTextPart | ChatMessageFilePartInput;

/**
 * 追加非空文本片段。
 * @param parts - 输出片段列表
 * @param text - 文本内容
 */
function appendTextPart(parts: BChatUserInputPart[], text: string): void {
  if (!text) return;

  parts.push({ type: 'text', text });
}

/**
 * 解析 file URL 查询行号。
 * @param match - token 匹配结果
 * @returns URLSearchParams
 */
function createLineSearchParams(match: FileReferenceTokenMatch): URLSearchParams {
  const params = new URLSearchParams();
  if (match.reference.startLine > 0) params.set('start', String(match.reference.startLine));
  if (match.reference.endLine > 0) params.set('end', String(match.reference.endLine));
  return params;
}

/**
 * 拼接工作区路径。
 * @param rawPath - 输入路径
 * @param workspaceRoot - 工作区根路径
 * @returns 可用于 file URL 的文件路径
 */
function createAbsoluteFilePath(rawPath: string, workspaceRoot: string | undefined): string {
  if (isAbsoluteFilePath(rawPath) || !workspaceRoot) return rawPath;
  return `${workspaceRoot.replace(/[\\/]+$/, '')}/${rawPath.replace(/^[\\/]+/, '')}`;
}

/**
 * 在 renderer 环境中创建 file URL，避免依赖 Node path/url。
 * @param filePath - 文件路径
 * @returns file URL
 */
function createFileUrl(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const absolutePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  const encodedPath = absolutePath
    .split('/')
    .map((segment, index): string => (index === 0 ? '' : encodeURIComponent(segment)))
    .join('/');
  return `file://${encodedPath}`;
}

/**
 * 将输入路径转成 runtime 使用的 canonical URL。
 * @param rawPath - 文件路径或 unsaved 路径
 * @param workspaceRoot - 工作区根路径
 * @param match - token 匹配结果
 * @returns canonical URL
 */
function createRuntimeFileUrl(rawPath: string, workspaceRoot: string | undefined, match: FileReferenceTokenMatch): string {
  const params = createLineSearchParams(match);
  if (isUnsavedPath(rawPath)) {
    const query = params.toString();
    return query ? `${rawPath}?${query}` : rawPath;
  }

  const query = params.toString();
  const url = createFileUrl(createAbsoluteFilePath(rawPath, workspaceRoot));
  return query ? `${url}?${query}` : url;
}

/**
 * 从用户输入文本构建有序 runtime input parts。
 * @param content - 用户输入文本
 * @param workspaceRoot - 当前工作区根路径
 * @returns 有序输入片段
 */
export function buildUserInputParts(content: string, workspaceRoot?: string): BChatUserInputPart[] {
  const matches = findFileReferenceTokens(content);
  if (!matches.length) return content ? [{ type: 'text', text: content }] : [];

  const parts: BChatUserInputPart[] = [];
  let cursor = 0;
  for (const match of matches) {
    appendTextPart(parts, content.slice(cursor, match.start));
    parts.push({
      type: 'file',
      id: `file-part-${nanoid()}`,
      filename: match.reference.fileName,
      mime: 'text/plain',
      url: createRuntimeFileUrl(match.reference.rawPath, workspaceRoot, match),
      path: match.reference.rawPath,
      sourceText: {
        start: match.start,
        end: match.end,
        value: match.token
      }
    });
    cursor = match.end;
  }
  appendTextPart(parts, content.slice(cursor));
  return parts;
}
```

- [ ] **Step 5: Run parser tests**

Run:

```bash
pnpm test test/utils/file/reference.test.ts test/components/BChat/file-part-parser.test.ts
```

Expected: PASS.

---

### Task 3: Send Parsed Parts From Renderer

**Files:**
- Modify: `src/components/BChat/index.vue`
- Modify: `src/components/BChat/hooks/useChatRuntime.ts`
- Modify: `src/components/BChat/utils/messageHelper.ts`
- Test: `test/components/BChat/use-chat-runtime.test.ts`
- Test: `test/components/BChat/session-id-runtime.test.ts`

- [ ] **Step 1: Write hook IPC test for parts**

Append to `test/components/BChat/use-chat-runtime.test.ts`:

```ts
it('passes parsed user input parts through runtime send', async (): Promise<void> => {
  const messages = ref<Message[]>([]);
  const runtime = useChatRuntime({ messages, getSessionId: () => 'session-1' });

  await runtime.send({
    sessionId: 'session-1',
    content: 'fix {{#src/foo.ts}}',
    parts: [
      { type: 'text', text: 'fix ' },
      {
        type: 'file',
        id: 'file-part-1',
        filename: 'foo.ts',
        mime: 'text/plain',
        url: 'file:///workspace/src/foo.ts',
        path: 'src/foo.ts',
        sourceText: { start: 4, end: 19, value: '{{#src/foo.ts}}' }
      }
    ]
  });

  expect(electronAPI.chatRuntimeSend).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'fix {{#src/foo.ts}}',
      parts: [
        { type: 'text', text: 'fix ' },
        expect.objectContaining({ type: 'file', path: 'src/foo.ts' })
      ]
    })
  );
});
```

- [ ] **Step 2: Update hook send input types**

In `src/components/BChat/hooks/useChatRuntime.ts`, update `BChatRuntimeSendInput` pick to include `parts`:

```ts
export type BChatRuntimeSendInput = Pick<
  ChatRuntimeSendInput,
  'sessionId' | 'content' | 'parts' | 'files' | 'userMessageId' | 'userMessageCreatedAt' | 'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'tavily' | 'mcp'
>;
```

- [ ] **Step 3: Update BChat send path**

In `src/components/BChat/index.vue`, remove the new-send use of `buildMessageReferences` and import `buildUserInputParts`:

```ts
import { buildUserInputParts } from './utils/filePartParser';
import { create, userChoice } from './utils/messageHelper';
```

Inside `submitUserTextMessage`, replace:

```ts
const references = await buildMessageReferences(trimmedContent);

const userMessage = create.userMessage(trimmedContent, references);
```

with:

```ts
const userParts = buildUserInputParts(trimmedContent, workspaceRoot.value || undefined);
const userMessage = create.userMessage(trimmedContent);
```

Add to `chatRuntime.send(...)`:

```ts
parts: userParts,
```

Update catch block in `submitUserTextMessage` so snapshot send failures surface as a toast:

```ts
  } catch (error) {
    taskRuntime.finishTask('chat');
    const message = error instanceof Error ? error.message : '发送消息失败';
    interactionAPI.showToast({ type: 'error', content: message });
    throw error;
  }
```

- [ ] **Step 4: Keep legacy reference exports but stop new-send dependency**

In `src/components/BChat/utils/messageHelper.ts`, keep `buildMessageReferences` exported for legacy tests/UI, but `create.userMessage` should no longer require references at new-send call sites.

Do not remove the `references?: FileReference[]` field yet; it is still used by compression keyword recall and legacy renderer behavior.

- [ ] **Step 5: Update BChat component send test**

In `test/components/BChat/session-id-runtime.test.ts`, add this test after “sends new user messages through main process ChatRuntime”:

```ts
it('sends parsed file input parts to ChatRuntime', async (): Promise<void> => {
  const createdSession = createSession('session-created', 'fix {{#src/foo.ts}}');
  chatStoreMock.createSession.mockResolvedValue(createdSession);
  const wrapper = mountBChat(null);
  await flushPromises();

  wrapper.findComponent(BPromptEditorStub).vm.$emit('update:value', 'fix {{#src/foo.ts}}');
  await flushPromises();
  wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
  await flushPromises();

  expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionId: 'session-created',
      content: 'fix {{#src/foo.ts}}',
      parts: [
        { type: 'text', text: 'fix ' },
        expect.objectContaining({ type: 'file', path: 'src/foo.ts' })
      ]
    })
  );
});
```

- [ ] **Step 6: Run renderer send tests**

Run:

```bash
pnpm test test/components/BChat/use-chat-runtime.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: PASS.

---

### Task 4: Materialize File Snapshots In Main Process

**Files:**
- Create: `electron/main/modules/chat/runtime/messages/file-parts.mts`
- Modify: `electron/main/modules/chat/runtime/messages/factory.mts`
- Modify: `electron/main/modules/chat/runtime/types.mts`
- Modify: `electron/main/modules/chat/runtime/service.mts`
- Test: `test/electron/main/modules/chat/runtime/file-parts.test.ts`
- Test: `test/electron/main/modules/chat/runtime/service.test.ts`

- [ ] **Step 1: Write snapshot helper tests**

Create `test/electron/main/modules/chat/runtime/file-parts.test.ts`:

```ts
/**
 * @file file-parts.test.ts
 * @description ChatRuntime file part snapshot materialization tests.
 */
import type { ChatMessageFilePartInput } from 'types/chat';
import { describe, expect, it, vi } from 'vitest';
import { materializeRuntimeFileParts } from '../../../../../../electron/main/modules/chat/runtime/messages/file-parts.mjs';

function createInput(path: string, url = `file:///workspace/${path}`): ChatMessageFilePartInput {
  return {
    type: 'file',
    id: 'file-part-1',
    filename: path.split('/').at(-1) ?? path,
    mime: 'text/plain',
    url,
    path,
    sourceText: { start: 0, end: 10, value: `{{#${path}}}` }
  };
}

describe('materializeRuntimeFileParts', (): void => {
  it('snapshots opened editor content before reading disk content', async (): Promise<void> => {
    const parts = await materializeRuntimeFileParts({
      parts: [createInput('src/foo.ts')],
      runtime: { runtimeId: 'runtime-1', workspaceRoot: '/workspace' },
      now: () => '2026-06-20T00:00:00.000Z',
      requestBridge: vi.fn().mockResolvedValue({
        status: 'success',
        data: { path: 'src/foo.ts', content: 'editor line 1\neditor line 2' }
      })
    });

    expect(parts[0]).toMatchObject({
      type: 'file',
      snapshot: {
        content: 'editor line 1\neditor line 2',
        startLine: 1,
        endLine: 2,
        totalLines: 2,
        capturedAt: '2026-06-20T00:00:00.000Z'
      }
    });
  });

  it('uses explicit line ranges from the file URL', async (): Promise<void> => {
    const parts = await materializeRuntimeFileParts({
      parts: [createInput('src/foo.ts', 'file:///workspace/src/foo.ts?start=2&end=3')],
      runtime: { runtimeId: 'runtime-1', workspaceRoot: '/workspace' },
      now: () => '2026-06-20T00:00:00.000Z',
      requestBridge: vi.fn().mockResolvedValue({
        status: 'success',
        data: { path: 'src/foo.ts', content: 'one\ntwo\nthree\nfour' }
      })
    });

    expect(parts[0]?.snapshot).toMatchObject({
      content: 'two\nthree',
      startLine: 2,
      endLine: 3,
      totalLines: 4
    });
  });

  it('materializes unsaved paths through bridge content', async (): Promise<void> => {
    const parts = await materializeRuntimeFileParts({
      parts: [createInput('unsaved://file-1/Draft.md', 'unsaved://file-1/Draft.md')],
      runtime: { runtimeId: 'runtime-1', workspaceRoot: '/workspace' },
      now: () => '2026-06-20T00:00:00.000Z',
      requestBridge: vi.fn().mockResolvedValue({
        status: 'success',
        data: { path: 'unsaved://file-1/Draft.md', content: 'draft content' }
      })
    });

    expect(parts[0]?.snapshot.content).toBe('draft content');
  });
});
```

- [ ] **Step 2: Implement materialization helper**

Create `electron/main/modules/chat/runtime/messages/file-parts.mts`:

```ts
/**
 * @file file-parts.mts
 * @description ChatRuntime user file part snapshot materialization.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { ChatMessageFilePart, ChatMessageFilePartInput, ChatMessagePart } from 'types/chat';
import type { ChatRuntimeBridgeResult } from 'types/chat-runtime';
import { isRuntimeFileContentSnapshot } from '../tools/guards.mjs';
import { isRuntimeUnsavedPath, resolveRuntimeReadTarget } from '../tools/paths.mjs';

/** 单个文件快照最大字符数。 */
const MAX_FILE_SNAPSHOT_CHARS = 120_000;

/** 文件快照运行时上下文。 */
interface FilePartRuntimeContext {
  /** runtime ID */
  runtimeId: string;
  /** 工作区根路径 */
  workspaceRoot?: string;
}

/** Renderer bridge 请求函数。 */
type FilePartBridgeRequester = (input: { runtimeId: string; toolCallId: string; kind: string; payload?: unknown }) => Promise<ChatRuntimeBridgeResult>;

/** 文件 part materialize 输入。 */
export interface MaterializeRuntimeFilePartsInput {
  /** 输入片段 */
  parts: Array<ChatMessagePart | ChatMessageFilePartInput>;
  /** runtime 上下文 */
  runtime: FilePartRuntimeContext;
  /** 当前时间 */
  now: () => string;
  /** renderer bridge 请求 */
  requestBridge: FilePartBridgeRequester;
}

/** 文件 part materializer 依赖函数。 */
export type RuntimeFilePartMaterializer = (input: MaterializeRuntimeFilePartsInput) => Promise<ChatMessagePart[]>;

/**
 * 读取 URL 中的行号范围。
 * @param urlText - 文件 URL
 * @returns 行号范围
 */
function readLineRangeFromUrl(urlText: string): { startLine?: number; endLine?: number } {
  try {
    const url = new URL(urlText);
    const start = Number(url.searchParams.get('start'));
    const end = Number(url.searchParams.get('end'));
    return {
      ...(Number.isInteger(start) && start > 0 ? { startLine: start } : {}),
      ...(Number.isInteger(end) && end > 0 ? { endLine: end } : {})
    };
  } catch {
    return {};
  }
}

/**
 * 统计文件总行数，空文件按一行处理。
 * @param content - 文件内容
 * @returns 总行数
 */
function countTotalLines(content: string): number {
  if (!content) return 1;
  return content.split('\n').length;
}

/**
 * 截取指定行号范围。
 * @param content - 完整内容
 * @param startLine - 起始行
 * @param endLine - 结束行
 * @returns 截取内容与归一化行号
 */
function sliceContentByLines(content: string, startLine: number | undefined, endLine: number | undefined): { content: string; startLine: number; endLine: number; totalLines: number } {
  const lines = content ? content.split('\n') : [''];
  const totalLines = countTotalLines(content);
  const normalizedStart = Math.min(Math.max(startLine ?? 1, 1), totalLines);
  const normalizedEnd = Math.min(Math.max(endLine ?? totalLines, normalizedStart), totalLines);

  return {
    content: lines.slice(normalizedStart - 1, normalizedEnd).join('\n'),
    startLine: normalizedStart,
    endLine: normalizedEnd,
    totalLines
  };
}

/**
 * 截断过大的快照内容。
 * @param content - 快照内容
 * @returns 截断结果
 */
function truncateSnapshotContent(content: string): { content: string; truncated?: boolean } {
  if (content.length <= MAX_FILE_SNAPSHOT_CHARS) return { content };
  return { content: content.slice(0, MAX_FILE_SNAPSHOT_CHARS), truncated: true };
}

/**
 * 计算内容哈希。
 * @param content - 快照内容
 * @returns sha256 hash
 */
function hashSnapshotContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 通过 renderer bridge 读取已打开或未保存文件内容。
 * @param part - 文件输入片段
 * @param input - materialize 输入
 * @returns 文件内容，无法读取时返回 null
 */
async function readFileContentFromBridge(part: ChatMessageFilePartInput, input: MaterializeRuntimeFilePartsInput): Promise<{ path: string; content: string } | null> {
  const result = await input.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: part.id,
    kind: 'file-content-snapshot',
    payload: { path: part.path, workspaceRoot: input.runtime.workspaceRoot }
  });
  if (result.status === 'failure') return null;
  if (!isRuntimeFileContentSnapshot(result.data)) throw new Error('文件内容快照格式无效');
  return result.data;
}

/**
 * 从磁盘读取文件内容。
 * @param part - 文件输入片段
 * @param input - materialize 输入
 * @returns 文件内容
 */
async function readFileContentFromDisk(part: ChatMessageFilePartInput, input: MaterializeRuntimeFilePartsInput): Promise<{ path: string; content: string }> {
  const target = resolveRuntimeReadTarget(part.path, input.runtime.workspaceRoot, 'file_part_snapshot');
  if ('status' in target) throw new Error(target.error?.message ?? '文件路径无效');
  const stats = await fs.stat(target.filePath);
  if (!stats.isFile()) throw new Error('文件引用目标不是文件');
  return { path: target.filePath, content: await fs.readFile(target.filePath, 'utf8') };
}

/**
 * 固化单个文件输入片段。
 * @param part - 文件输入片段
 * @param input - materialize 输入
 * @returns 持久化文件片段
 */
async function materializeFilePart(part: ChatMessageFilePartInput, input: MaterializeRuntimeFilePartsInput): Promise<ChatMessageFilePart> {
  const bridgeContent = await readFileContentFromBridge(part, input);
  const fileContent = bridgeContent ?? (isRuntimeUnsavedPath(part.path) ? null : await readFileContentFromDisk(part, input));
  if (!fileContent) throw new Error(`无法读取文件引用：${part.path}`);

  const range = readLineRangeFromUrl(part.url);
  const sliced = sliceContentByLines(fileContent.content, range.startLine, range.endLine);
  const truncated = truncateSnapshotContent(sliced.content);
  return {
    ...part,
    path: fileContent.path,
    snapshot: {
      content: truncated.content,
      startLine: sliced.startLine,
      endLine: sliced.endLine,
      totalLines: sliced.totalLines,
      contentHash: hashSnapshotContent(truncated.content),
      capturedAt: input.now(),
      ...(truncated.truncated ? { truncated: true } : {})
    }
  };
}

/**
 * 固化 runtime user input parts 中的文件片段。
 * @param input - materialize 输入
 * @returns 可持久化消息片段
 */
export async function materializeRuntimeFileParts(input: MaterializeRuntimeFilePartsInput): Promise<ChatMessagePart[]> {
  const parts: ChatMessagePart[] = [];
  for (const part of input.parts) {
    if (part.type === 'file' && !('snapshot' in part)) {
      // eslint-disable-next-line no-await-in-loop
      parts.push(await materializeFilePart(part, input));
      continue;
    }
    parts.push(part as ChatMessagePart);
  }
  return parts;
}
```

- [ ] **Step 3: Run helper tests**

Run:

```bash
pnpm test test/electron/main/modules/chat/runtime/file-parts.test.ts
```

Expected: PASS.

- [ ] **Step 4: Integrate materialization into runtime service**

In `electron/main/modules/chat/runtime/types.mts`, import the runtime file materializer type:

```ts
import type { RuntimeFilePartMaterializer } from './messages/file-parts.mjs';
```

Add to `ChatRuntimeServiceDependencies`:

```ts
  /** 文件 part 固化函数。 */
  materializeFileParts: RuntimeFilePartMaterializer;
```

In `electron/main/modules/chat/runtime/service.mts`, import:

```ts
import { materializeRuntimeFileParts } from './messages/file-parts.mjs';
```

After dependency initialization, add:

```ts
  const materializeFileParts = dependencies.materializeFileParts ?? materializeRuntimeFileParts;
```

In `send(input: ChatRuntimeSendInput)`, before `createRuntimeUserMessage`, add:

```ts
        const userParts = input.parts?.length
          ? await materializeFileParts({
              parts: input.parts,
              runtime,
              now,
              requestBridge: bridgeRequests.request
            })
          : undefined;
        const userMessage = createRuntimeUserMessage({ ...input, parts: userParts }, runtime, input.userMessageId ?? createMessageId('user'), createdAt);
```

Remove the old direct `const userMessage = createRuntimeUserMessage(input, ...)` line.

In `electron/main/modules/chat/runtime/messages/factory.mts`, use materialized parts:

```ts
    parts: input.parts?.length ? input.parts : input.content ? [{ type: 'text', text: input.content }] : [],
```

Keep `content: input.content` for search/copy compatibility.

- [ ] **Step 5: Add service integration test**

In `test/electron/main/modules/chat/runtime/service.test.ts`, add a test using the existing `createInput`, `createNoopMessageReader`, and `createNoopStreamExecutor` helpers:

```ts
it('materializes file input parts before persisting user messages', async (): Promise<void> => {
  const persistedMessages: ChatMessageRecord[] = [];
  const materializedParts: ChatMessagePart[] = [
    { type: 'text', text: 'fix ' },
    {
      type: 'file',
      id: 'file-part-1',
      filename: 'foo.ts',
      mime: 'text/plain',
      url: 'file:///workspace/src/foo.ts',
      path: 'src/foo.ts',
      sourceText: { start: 4, end: 19, value: '{{#src/foo.ts}}' },
      snapshot: {
        content: 'editor content',
        startLine: 1,
        endLine: 1,
        totalLines: 1,
        contentHash: 'hash-1',
        capturedAt: '2026-06-20T00:00:00.000Z'
      }
    }
  ];
  const materializeFileParts = vi.fn().mockResolvedValue(materializedParts);
  const service = createChatRuntimeService({
    emit: vi.fn(),
    messageWriter: {
      addMessage: (message) => persistedMessages.push(message),
      updateMessage: vi.fn(),
      deleteMessage: vi.fn()
    },
    messageReader: createNoopMessageReader(),
    streamExecutor: createNoopStreamExecutor(),
    materializeFileParts,
    now: () => '2026-06-20T00:00:00.000Z'
  });

  await service.send(createInput({
    content: 'fix {{#src/foo.ts}}',
    workspaceRoot: '/workspace',
    parts: [
      { type: 'text', text: 'fix ' },
      {
        type: 'file',
        id: 'file-part-1',
        filename: 'foo.ts',
        mime: 'text/plain',
        url: 'file:///workspace/src/foo.ts',
        path: 'src/foo.ts',
        sourceText: { start: 4, end: 19, value: '{{#src/foo.ts}}' }
      }
    ]
  }));

  expect(materializeFileParts).toHaveBeenCalledWith(
    expect.objectContaining({
      parts: expect.arrayContaining([expect.objectContaining({ type: 'file', path: 'src/foo.ts' })])
    })
  );
  expect(persistedMessages[0].parts[1]).toMatchObject({
    type: 'file',
    snapshot: expect.objectContaining({ startLine: 1, endLine: expect.any(Number) })
  });
});
```

Add imports if missing:

```ts
import type { ChatMessagePart, ChatMessageRecord } from 'types/chat';
```

- [ ] **Step 6: Run main runtime tests**

Run:

```bash
pnpm test test/electron/main/modules/chat/runtime/file-parts.test.ts test/electron/main/modules/chat/runtime/service.test.ts
```

Expected: PASS.

---

### Task 5: Convert Persisted File Parts To AI SDK Model Messages

**Files:**
- Modify: `electron/main/modules/chat/runtime/context/model-message.mts`
- Test: `test/electron/main/modules/chat/runtime/model-message-context.test.ts`

- [ ] **Step 1: Write model-message tests**

Append to `test/electron/main/modules/chat/runtime/model-message-context.test.ts`:

```ts
it('converts user file parts into AI SDK file content parts without duplicate text content', (): void => {
  const messages = toRuntimeModelMessages([
    {
      id: 'user-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'fix {{#src/foo.ts 10-20}}',
      parts: [
        { type: 'text', text: 'fix ' },
        {
          type: 'file',
          id: 'file-part-1',
          filename: 'foo.ts',
          mime: 'text/plain',
          url: 'file:///workspace/src/foo.ts?start=10&end=20',
          path: 'src/foo.ts',
          sourceText: { start: 4, end: 25, value: '{{#src/foo.ts 10-20}}' },
          snapshot: {
            content: 'export const foo = 1;',
            startLine: 10,
            endLine: 20,
            totalLines: 100,
            contentHash: 'hash-1',
            capturedAt: '2026-06-20T00:00:00.000Z'
          }
        }
      ],
      createdAt: '2026-06-20T00:00:00.000Z',
      finished: true
    }
  ]);

  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    role: 'user',
    content: [
      { type: 'text', text: 'fix ' },
      {
        type: 'file',
        filename: '@src/foo.ts#L10-L20',
        mediaType: 'text/plain'
      }
    ]
  });
  expect(JSON.stringify(messages)).not.toContain('<file ');
});
```

- [ ] **Step 2: Implement user part conversion**

In `electron/main/modules/chat/runtime/context/model-message.mts`, import `ChatMessageFilePart`:

```ts
import type { ChatMessageFilePart, ChatMessagePart, ChatMessageRecord } from 'types/chat';
```

Add helper types:

```ts
/** User model message content片段。 */
type UserModelMessageContent = Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mediaType?: string } | { type: 'file'; data: Uint8Array; filename?: string; mediaType: string }>;
```

Add helpers before `toUserModelMessage`:

```ts
/** 文本编码器。 */
const textEncoder = new TextEncoder();

/**
 * 判断消息片段是否为 file part。
 * @param part - 消息片段
 * @returns 是否为 file part
 */
function isFilePart(part: ChatMessagePart): part is ChatMessageFilePart {
  return part.type === 'file';
}

/**
 * 构建模型可读文件名。
 * @param part - 文件片段
 * @returns 模型文件名
 */
function createModelFileName(part: ChatMessageFilePart): string {
  return `@${part.path}#L${part.snapshot.startLine}-L${part.snapshot.endLine}`;
}

/**
 * 将 file part 转为 AI SDK file content。
 * @param part - 文件片段
 * @returns 模型 file content
 */
function toUserFileContentPart(part: ChatMessageFilePart): { type: 'file'; data: Uint8Array; filename: string; mediaType: string } {
  return {
    type: 'file',
    filename: createModelFileName(part),
    mediaType: part.mime,
    data: textEncoder.encode(part.snapshot.content)
  };
}
```

Update `toUserModelMessage` so parts drive conversion:

```ts
function toUserModelMessage(message: RuntimeUserMessageRecord): ModelMessage | undefined {
  const contentParts: UserModelMessageContent = [];

  if (message.parts.length) {
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        contentParts.push({ type: 'text', text: part.text });
      } else if (isFilePart(part)) {
        contentParts.push(toUserFileContentPart(part));
      }
    }
  } else if (message.content) {
    contentParts.push({ type: 'text', text: message.content });
  }

  const imageFiles = message.files?.filter((file) => file.type === 'image' && file.url) ?? [];
  for (const file of imageFiles) {
    contentParts.push({ type: 'image', image: file.url as string, mediaType: file.mimeType });
  }

  if (!contentParts.length) return undefined;
  if (contentParts.length === 1 && contentParts[0].type === 'text') return { role: 'user', content: contentParts[0].text };
  return { role: 'user', content: contentParts };
}
```

- [ ] **Step 3: Run model context tests**

Run:

```bash
pnpm test test/electron/main/modules/chat/runtime/model-message-context.test.ts
```

Expected: PASS.

---

### Task 6: Update Display And Legacy Compatibility

**Files:**
- Modify: `src/components/BChat/components/MessageBubble/BubblePartUserInput.vue`
- Modify: `src/components/BChat/components/FileRefChip/presentation.ts`
- Test: `test/components/BChat/bubble-part-tool-open-file.test.ts` or add `test/components/BChat/bubble-part-user-input.test.ts`

- [ ] **Step 1: Inspect existing user input renderer**

Read `src/components/BChat/components/MessageBubble/BubblePartUserInput.vue`. Confirm whether it renders from `message.content` tokens or from `message.parts`.

- [ ] **Step 2: Add file part rendering path**

If the component currently parses `message.content`, preserve that legacy path, but prefer `message.parts` when file parts exist:

```ts
const displayParts = computed(() => {
  if (props.message.parts.some((part) => part.type === 'file')) {
    return props.message.parts;
  }
  return parseLegacyContentParts(props.message.content);
});
```

Render `type: 'file'` using existing `FileRefChip` presentation data:

```ts
const fileNavigationTarget = {
  rawPath: part.path,
  filePath: part.path.startsWith('unsaved://') ? null : part.path,
  fileId: part.path.startsWith('unsaved://') ? parseUnsavedPath(part.path)?.fileId ?? null : null,
  fileName: part.filename,
  startLine: part.snapshot.startLine,
  endLine: part.snapshot.endLine
};
```

- [ ] **Step 3: Add/adjust user bubble test**

Add a test that renders a user message with:

```ts
parts: [
  { type: 'text', text: 'fix ' },
  {
    type: 'file',
    id: 'file-part-1',
    filename: 'foo.ts',
    mime: 'text/plain',
    url: 'file:///workspace/src/foo.ts?start=10&end=20',
    path: 'src/foo.ts',
    sourceText: { start: 4, end: 25, value: '{{#src/foo.ts 10-20}}' },
    snapshot: {
      content: 'export const foo = 1;',
      startLine: 10,
      endLine: 20,
      totalLines: 100,
      contentHash: 'hash-1',
      capturedAt: '2026-06-20T00:00:00.000Z'
    }
  },
  { type: 'text', text: ' please' }
]
```

Expected assertions:

```ts
expect(wrapper.text()).toContain('fix');
expect(wrapper.text()).toContain('foo.ts');
expect(wrapper.text()).toContain('10-20');
expect(wrapper.text()).toContain('please');
```

- [ ] **Step 4: Run BChat display tests**

Run:

```bash
pnpm test test/components/BChat/bubble-part-tool-open-file.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: PASS.

---

### Task 7: Remove New-Send Reference Snapshot Path And Update Estimation

**Files:**
- Modify: `src/components/BChat/utils/messageHelper.ts`
- Modify: `src/components/BChat/utils/compression/tokenEstimator.ts`
- Test: `test/components/BChat/message-helper-compression.test.ts`
- Test: `test/components/BChat/context-usage-budget.test.ts`

- [ ] **Step 1: Add token/hash coverage for file parts**

In `test/components/BChat/message-helper-compression.test.ts` or `test/components/BChat/context-usage-budget.test.ts`, add a message with a file part and assert context estimation includes snapshot content:

```ts
it('includes file part snapshots in message context signatures', (): void => {
  const message: Message = {
    id: 'user-1',
    role: 'user',
    content: 'fix {{#src/foo.ts}}',
    parts: [
      { type: 'text', text: 'fix ' },
      {
        type: 'file',
        id: 'file-part-1',
        filename: 'foo.ts',
        mime: 'text/plain',
        url: 'file:///workspace/src/foo.ts',
        path: 'src/foo.ts',
        sourceText: { start: 4, end: 19, value: '{{#src/foo.ts}}' },
        snapshot: {
          content: 'export const foo = 1;',
          startLine: 1,
          endLine: 1,
          totalLines: 1,
          contentHash: 'hash-1',
          capturedAt: '2026-06-20T00:00:00.000Z'
        }
      }
    ],
    createdAt: '2026-06-20T00:00:00.000Z',
    finished: true
  };

  const modelMessages = convert.toModelMessages([message]);
  expect(JSON.stringify(modelMessages)).toContain('foo.ts');
});
```

- [ ] **Step 2: Update renderer model conversion compatibility**

In `src/components/BChat/utils/messageHelper.ts`, mirror main-process user file part conversion for renderer-side context usage estimation. Add a helper and call it from the existing user-message conversion path:

```ts
function toUserContentParts(message: ModelCompatibleMessage): ModelMessageContent {
  const parts = message.parts.flatMap((part) => {
    if (part.type === 'text' && part.text) return [{ type: 'text' as const, text: part.text }];
    if (part.type === 'file') {
      return [
        {
          type: 'file' as const,
          filename: `@${part.path}#L${part.snapshot.startLine}-L${part.snapshot.endLine}`,
          mediaType: part.mime,
          data: new TextEncoder().encode(part.snapshot.content)
        }
      ];
    }
    return [];
  });
  return parts;
}

function toUserModelMessage(message: ModelCompatibleMessage): ModelMessage | undefined {
  const parts = toUserContentParts(message);
  // Preserve image file handling exactly as current code does after this branch.
}
```

Keep legacy behavior for old messages whose `parts` array has no `file` part.

- [ ] **Step 3: Update token signature**

In `src/components/BChat/utils/compression/tokenEstimator.ts`, change the file reference signature part from `references` to persisted file parts:

```ts
const fileParts = msg.parts
  .filter((part): part is Extract<ChatMessagePart, { type: 'file' }> => part.type === 'file')
  .map((part) => `${part.path}:${part.snapshot.startLine}-${part.snapshot.endLine}:${part.snapshot.contentHash}`)
  .join(',');
```

Include `fileParts` in the hash string. Keep old `references` contribution only if needed for legacy messages.

- [ ] **Step 4: Run estimator/conversion tests**

Run:

```bash
pnpm test test/components/BChat/message-helper-compression.test.ts test/components/BChat/context-usage-budget.test.ts
```

Expected: PASS.

---

### Task 8: Changelog And Full Verification

**Files:**
- Modify: `changelog/2026-06-20.md`
- Verify all touched files.

- [ ] **Step 1: Update changelog**

Add under `## Changed` in `changelog/2026-06-20.md`:

```md
- 重构聊天文件引用发送链路，将文件引用固化为 `type: 'file'` 消息片段并由主进程生成发送时快照。
```

If `## Changed` does not exist, add it following the existing changelog style.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
pnpm test test/utils/file/reference.test.ts test/components/BChat/file-part-parser.test.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/session-id-runtime.test.ts test/components/BChat/runtime-bridge.test.ts test/electron/main/modules/chat/runtime/file-parts.test.ts test/electron/main/modules/chat/runtime/model-message-context.test.ts test/electron/main/modules/chat/runtime/service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: no ESLint errors after auto-fix.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: changes are limited to chat file part implementation, tests, design/plan docs, and changelog.

- [ ] **Step 6: Final commit only after user approval**

Do not commit automatically. Ask the user whether to create the final unified commit after verification passes.

---

## Self-Review

Spec coverage:

- `type: 'file'` part: covered by Tasks 1, 2, 4, 5.
- Separate input vs persisted types: covered by Task 1 and Task 4.
- No outer `token/startLine/endLine`: covered by Task 1 type shape.
- `url` plus `path`: covered by Task 2 parser and Task 4 materialization.
- Opened editor content wins over disk: covered by Task 4 tests and implementation.
- Snapshot persisted, synthetic content not persisted: covered by Task 4.
- AI SDK file part uses `data`, no custom `url`: covered by Task 5.
- No duplicate text/file content: covered by Task 5 tests.
- Legacy old messages: covered by Task 5 and Task 7 compatibility.
- Verification and changelog: covered by Task 8.

Placeholder scan:

- No placeholder markers or unspecified “add tests” steps remain.
- Code snippets specify concrete function names and files.

Type consistency:

- `ChatMessageFilePartInput` is input-only.
- `ChatMessageFilePart` extends input with required `snapshot`.
- `ChatRuntimeSendInput.parts` accepts input parts.
- Persisted `ChatMessagePart` accepts `ChatMessageFilePart`, not input file parts.
