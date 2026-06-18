# Main Process Chat Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working foundation for a main-process-owned chat runtime: shared runtime types, message persistence fields, runtime IPC/event contracts, context budget calculation, context estimation, and a testable runtime shell.

**Architecture:** This is phase 1 of the larger main-process chat context runtime. It does not migrate tool execution or compaction yet; it creates the stable contracts and storage surface they will depend on. Renderer chat behavior should remain unchanged after this phase except for newly available APIs and fields.

**Tech Stack:** TypeScript, Electron IPC, better-sqlite3, Vitest, Vue renderer type declarations, AI SDK `ModelMessage`.

---

## Scope Check

The full spec covers several independent subsystems: runtime orchestration, tool execution migration, renderer bridge, compaction, overflow replay, prune, and UI replacement. This plan intentionally covers only the first vertical slice:

- data model and database fields,
- repository mapping,
- runtime IPC/event types,
- context budget and estimator services,
- a main-process runtime shell with locking and abort behavior.

Later plans should cover:

- tool runtime and renderer bridge,
- compaction service and `/compact`,
- provider overflow replay and media downgrade,
- tool output prune,
- renderer `useChatRuntime` integration.

Per user instruction, this plan does not include commit steps. Use `git diff`, test commands, and manual review checkpoints instead.

## File Structure

Create:

- `types/chat-runtime.d.ts` — shared runtime command/event/context usage types used by preload, renderer, and main process.
- `electron/main/modules/chat/runtime/types.mts` — main-process internal runtime state and dependency interfaces.
- `electron/main/modules/chat/runtime/context-budget.mts` — pure budget and threshold calculations.
- `electron/main/modules/chat/runtime/context-estimator.mts` — cheap serialized `ModelMessage[]` estimator.
- `electron/main/modules/chat/runtime/locks.mts` — session-scoped writing runtime lock.
- `electron/main/modules/chat/runtime/service.mts` — runtime shell for start/abort/status; no model streaming yet.
- `electron/main/modules/chat/runtime/ipc.mts` — runtime IPC handlers.
- `test/electron/main/modules/chat/runtime/context-budget.test.ts`
- `test/electron/main/modules/chat/runtime/context-estimator.test.ts`
- `test/electron/main/modules/chat/runtime/locks.test.ts`
- `test/electron/main/modules/chat/runtime/service.test.ts`

Modify:

- `types/chat.d.ts` — add compaction part, message meta, runtime ownership fields, summary flag.
- `types/electron-api.d.ts` — expose runtime IPC methods and event listeners.
- `electron/preload/index.mts` — bridge runtime IPC methods/events.
- `electron/main/modules/database/service.mts` — add chat message columns.
- `electron/main/modules/chat/service.mts` — map new fields to/from SQLite.
- `electron/main/modules/chat/ipc.mts` — keep existing chat persistence IPC, no behavior change.
- `electron/main/modules/index.mts` or current main module registrar — register runtime IPC.
- `changelog/2026-06-18.md` — record the runtime foundation change.

Do not modify in this phase:

- `src/components/BChat/hooks/useChatStream.ts`
- `src/components/BChat/hooks/useCompactContext.ts`
- `src/components/BChat/hooks/useContextUsage.ts`
- `src/components/BChat/index.vue`

Those remain the active renderer runtime until later plans replace them.

---

### Task 1: Add Shared Runtime And Message Types

**Files:**
- Create: `types/chat-runtime.d.ts`
- Modify: `types/chat.d.ts`
- Test: `test/electron/main/modules/chat/runtime/context-budget.test.ts` will import these types in later tasks.

- [ ] **Step 1: Add runtime type declarations**

Create `types/chat-runtime.d.ts`:

```ts
/**
 * @file chat-runtime.d.ts
 * @description Shared chat runtime command, event, and context usage types.
 */
import type { AIServiceError, AIUsage } from './ai';
import type { ChatMessageRecord, ChatMessagePart } from './chat';

/** Runtime event channel names emitted from main process to renderer. */
export type ChatRuntimeEventName =
  | 'chat:runtime:message-created'
  | 'chat:runtime:message-updated'
  | 'chat:runtime:context-usage-updated'
  | 'chat:runtime:error'
  | 'chat:runtime:complete';

/** Runtime command result wrapper. */
export interface ChatRuntimeHandlerResult<T = void> {
  /** Whether the command succeeded. */
  ok: boolean;
  /** Command data when successful. */
  data?: T;
  /** Error message when unsuccessful. */
  error?: string;
  /** Stable error code for UI handling. */
  code?: string;
}

/** Renderer context snapshot sent with runtime commands. */
export interface ChatRuntimeClientSnapshot {
  /** Active document snapshot available to main process. */
  document?: {
    /** Document id. */
    id: string;
    /** Visible title. */
    title: string;
    /** Disk path when saved. */
    path: string | null;
    /** Virtual locator for unsaved documents. */
    locator?: string;
    /** Current document content. */
    content: string;
    /** Current selection snapshot. */
    selection?: {
      /** Selection start offset. */
      from: number;
      /** Selection end offset. */
      to: number;
      /** Selected text. */
      text: string;
    } | null;
  };
}

/** Send command input. */
export interface ChatRuntimeSendInput {
  /** Existing session id; omitted for draft sessions. */
  sessionId?: string;
  /** Renderer chat panel id. */
  clientId: string;
  /** Agent id for this turn. */
  agentId: string;
  /** User message text. */
  content: string;
  /** Optional file/image attachments stored in the normal chat message shape. */
  files?: ChatMessageRecord['files'];
  /** Renderer-side context snapshot captured at send time. */
  snapshot?: ChatRuntimeClientSnapshot;
}

/** Abort command input. */
export interface ChatRuntimeAbortInput {
  /** Runtime id to abort. */
  runtimeId: string;
}

/** Runtime state returned after starting a command. */
export interface ChatRuntimeStartResult {
  /** Runtime id created by main process. */
  runtimeId: string;
  /** Session id owned by the runtime. */
  sessionId: string;
}

/** Context usage visual state. */
export type ChatRuntimeContextUsageStatus = 'safe' | 'warning' | 'danger';

/** Context usage snapshot emitted by main process. */
export interface ChatRuntimeContextUsageSnapshot {
  /** Runtime id that produced the snapshot. */
  runtimeId: string;
  /** Session id being evaluated. */
  sessionId: string;
  /** Agent id used for the evaluation. */
  agentId: string;
  /** Complete model context window. */
  contextWindow: number;
  /** Tokens reserved for model output. */
  reservedOutputTokens: number;
  /** Tokens reserved as compaction safety buffer. */
  compactionBufferTokens: number;
  /** Computed usable input budget. */
  usableInputTokens: number;
  /** Estimated serialized input tokens. */
  estimatedInputTokens: number;
  /** Provider-reported tokens from the last turn when available. */
  providerUsageTokens?: number;
  /** Rounded usage percent. */
  usagePercent: number;
  /** Remaining input budget. */
  remainingInputTokens: number;
  /** Visual status for UI. */
  status: ChatRuntimeContextUsageStatus;
  /** Whether the estimate should trigger send-before compaction. */
  shouldCompactBeforeSend: boolean;
}

/** Common event envelope fields. */
export interface ChatRuntimeEventBase {
  /** Runtime id. */
  runtimeId: string;
  /** Session id. */
  sessionId: string;
  /** Renderer client id. */
  clientId: string;
  /** Agent id. */
  agentId: string;
  /** Parent runtime id for future multi-agent flows. */
  parentRuntimeId?: string;
}

/** Message event emitted when a message is created or updated. */
export interface ChatRuntimeMessageEvent extends ChatRuntimeEventBase {
  /** Message payload. */
  message: ChatMessageRecord;
}

/** Context usage event. */
export interface ChatRuntimeContextUsageEvent extends ChatRuntimeEventBase {
  /** Usage snapshot. */
  snapshot: ChatRuntimeContextUsageSnapshot;
}

/** Runtime error event. */
export interface ChatRuntimeErrorEvent extends ChatRuntimeEventBase {
  /** Normalized AI or runtime error. */
  error: AIServiceError;
}

/** Runtime complete event. */
export interface ChatRuntimeCompleteEvent extends ChatRuntimeEventBase {
  /** Optional usage reported by provider. */
  usage?: AIUsage;
}

/** Runtime event payload map. */
export interface ChatRuntimeEventMap {
  'chat:runtime:message-created': ChatRuntimeMessageEvent;
  'chat:runtime:message-updated': ChatRuntimeMessageEvent;
  'chat:runtime:context-usage-updated': ChatRuntimeContextUsageEvent;
  'chat:runtime:error': ChatRuntimeErrorEvent;
  'chat:runtime:complete': ChatRuntimeCompleteEvent;
}

/** Compaction part inserted into user messages by future runtime phases. */
export interface ChatMessageCompactionPart {
  /** Part discriminator. */
  type: 'compaction';
  /** Whether runtime created this automatically. */
  auto: boolean;
  /** Why compaction started. */
  reason: 'manual' | 'auto' | 'overflow';
  /** Current compaction status. */
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  /** First tail message preserved verbatim. */
  tailStartMessageId?: string;
  /** Failure message when status is failed. */
  errorMessage?: string;
}

/** Runtime-specific message metadata. */
export interface ChatMessageRuntimeMeta {
  /** Compaction metadata stored on summary messages. */
  compaction?: {
    /** Anchor summary text. */
    anchorSummary?: string;
    /** Previous summary message id. */
    previousSummaryMessageId?: string;
    /** Message ids hidden from later compaction select passes. */
    hiddenMessageIds?: string[];
    /** Serialized recent model messages for event/debug payloads. */
    recentModelMessagesJson?: string;
  };
  /** Last context usage snapshot associated with this message. */
  contextUsage?: ChatRuntimeContextUsageSnapshot;
}

/** Utility alias used in type-level tests and future message helpers. */
export type ChatRuntimeMessagePart = ChatMessagePart | ChatMessageCompactionPart;
```

- [ ] **Step 2: Extend chat message declarations**

Modify `types/chat.d.ts` imports and type unions:

```ts
import type { AIUsage } from './ai';
import type { ChatMessageCompactionPart, ChatMessageRuntimeMeta } from './chat-runtime';
```

Change `ChatMessagePart`:

```ts
/**
 * 聊天消息结构化片段
 */
export type ChatMessagePart =
  | ChatMessageTextPart
  | ChatMessageErrorPart
  | ChatMessageThinkingPart
  | ChatMessageToolPart
  | ChatMessageConfirmationPart
  | ChatMessageCompactionPart;
```

Extend `ChatMessageRecord`:

```ts
  /** 是否为压缩摘要消息 */
  summary?: boolean;
  /** 执行该消息的 agent ID */
  agentId?: string;
  /** 创建或更新该消息的 runtime ID */
  runtimeId?: string;
  /** 父 runtime ID，预留给多 agent 调度 */
  parentRuntimeId?: string;
  /** runtime 扩展元数据 */
  meta?: ChatMessageRuntimeMeta;
```

- [ ] **Step 3: Run typecheck to verify declarations compile**

Run: `pnpm exec tsc --noEmit`

Expected: PASS, or existing unrelated errors only. New errors about circular type imports must be fixed by converting imports to `import type` and avoiding value imports in `.d.ts` files.

- [ ] **Step 4: Inspect the diff**

Run: `git diff -- types/chat-runtime.d.ts types/chat.d.ts`

Expected: diff only adds shared declarations and record fields. There should be no runtime implementation changes in this task.

---

### Task 2: Persist Runtime Message Fields

**Files:**
- Modify: `electron/main/modules/database/service.mts`
- Modify: `electron/main/modules/chat/service.mts`
- Test: `test/stores/chat/session.test.ts`

- [ ] **Step 1: Write a failing persistence test**

Add to `test/stores/chat/session.test.ts` or create `test/electron/main/modules/chat/message-runtime-fields.test.ts` if the existing store test does not cover main chat service directly:

```ts
import { describe, expect, it } from 'vitest';
import type { ChatMessageRecord } from 'types/chat';

describe('chat message runtime fields', (): void => {
  it('keeps runtime fields on chat message records', (): void => {
    const message: ChatMessageRecord = {
      id: 'message-runtime-1',
      sessionId: 'session-runtime-1',
      role: 'assistant',
      content: 'summary',
      parts: [{ type: 'text', text: 'summary' }],
      createdAt: '2026-06-18T00:00:00.000Z',
      summary: true,
      agentId: 'agent-main',
      runtimeId: 'runtime-main',
      parentRuntimeId: 'runtime-parent',
      meta: {
        compaction: {
          anchorSummary: 'The user is designing a main process runtime.',
          hiddenMessageIds: ['message-old-1']
        }
      }
    };

    expect(message.summary).toBe(true);
    expect(message.agentId).toBe('agent-main');
    expect(message.runtimeId).toBe('runtime-main');
    expect(message.meta?.compaction?.hiddenMessageIds).toEqual(['message-old-1']);
  });
});
```

- [ ] **Step 2: Run the type-level persistence shape test**

Run: `pnpm test test/stores/chat/session.test.ts`

Expected: FAIL before Task 1/2 implementation if `ChatMessageRecord` does not include new fields; PASS after types exist.

- [ ] **Step 3: Add database columns**

Modify `electron/main/modules/database/service.mts`:

```ts
type DatabaseTableName = 'chat_messages' | 'chat_sessions' | 'chat_session_compression_records';
```

Keep the union unchanged, then add columns in `migrateDatabase()`:

```ts
  ensureColumn('chat_messages', 'summary', 'summary INTEGER');
  ensureColumn('chat_messages', 'meta_json', 'meta_json TEXT');
  ensureColumn('chat_messages', 'agent_id', 'agent_id TEXT');
  ensureColumn('chat_messages', 'runtime_id', 'runtime_id TEXT');
  ensureColumn('chat_messages', 'parent_runtime_id', 'parent_runtime_id TEXT');
```

Add columns to `CREATE TABLE IF NOT EXISTS chat_messages`:

```sql
      summary INTEGER,
      meta_json TEXT,
      agent_id TEXT,
      runtime_id TEXT,
      parent_runtime_id TEXT,
```

Place them after `finished INTEGER` to avoid changing existing parameter order until mapper changes are applied.

- [ ] **Step 4: Update chat service SQL and row mapper**

Modify `electron/main/modules/chat/service.mts`.

Update `SELECT_MESSAGES_BY_SESSION_SQL` and `SELECT_MESSAGES_BEFORE_CURSOR_SQL`:

```sql
  SELECT id, session_id, role, content, parts_json, thinking, files_json, usage_json, compression_json, created_at, loading, finished,
         summary, meta_json, agent_id, runtime_id, parent_runtime_id
```

Update `UPSERT_MESSAGE_SQL`:

```sql
  INSERT OR REPLACE INTO chat_messages
    (id, session_id, role, content, parts_json, thinking, files_json, usage_json, compression_json, created_at, loading, finished,
     summary, meta_json, agent_id, runtime_id, parent_runtime_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Extend `ChatMessageRow`:

```ts
  summary: number | null;
  meta_json: string | null;
  agent_id: string | null;
  runtime_id: string | null;
  parent_runtime_id: string | null;
```

Extend `mapMessageRow`:

```ts
    summary: row.summary === null ? undefined : row.summary === 1,
    agentId: row.agent_id ?? undefined,
    runtimeId: row.runtime_id ?? undefined,
    parentRuntimeId: row.parent_runtime_id ?? undefined,
    meta: parseJson(row.meta_json),
```

Extend `buildMessageUpsertParams`:

```ts
    toSqlBoolean(message.summary),
    stringifyJson(message.meta),
    message.agentId ?? null,
    message.runtimeId ?? null,
    message.parentRuntimeId ?? null
```

- [ ] **Step 5: Run focused checks**

Run: `pnpm exec tsc --noEmit`

Expected: PASS. If `parseJson(row.meta_json)` infers `unknown`, use `parseJson<ChatMessageRuntimeMeta>(row.meta_json)` and import the type from `types/chat-runtime`.

- [ ] **Step 6: Inspect the diff**

Run: `git diff -- electron/main/modules/database/service.mts electron/main/modules/chat/service.mts types/chat.d.ts types/chat-runtime.d.ts`

Expected: database and mapper changes only add optional fields and do not change legacy `compression_json` behavior.

---

### Task 3: Add Runtime IPC Types To Electron API

**Files:**
- Modify: `types/electron-api.d.ts`
- Modify: `electron/preload/index.mts`
- Create: `electron/main/modules/chat/runtime/ipc.mts`

- [ ] **Step 1: Extend Electron API declarations**

Modify `types/electron-api.d.ts` imports:

```ts
import type {
  ChatRuntimeAbortInput,
  ChatRuntimeContextUsageEvent,
  ChatRuntimeEventMap,
  ChatRuntimeHandlerResult,
  ChatRuntimeMessageEvent,
  ChatRuntimeSendInput,
  ChatRuntimeStartResult
} from './chat-runtime';
```

Add API fields:

```ts
  // Chat runtime 操作
  chatRuntimeSend: (input: ChatRuntimeSendInput) => Promise<ChatRuntimeHandlerResult<ChatRuntimeStartResult>>;
  chatRuntimeAbort: (input: ChatRuntimeAbortInput) => Promise<ChatRuntimeHandlerResult<void>>;
  chatRuntimeOnMessageCreated: (callback: (event: ChatRuntimeMessageEvent) => void) => () => void;
  chatRuntimeOnMessageUpdated: (callback: (event: ChatRuntimeMessageEvent) => void) => () => void;
  chatRuntimeOnContextUsageUpdated: (callback: (event: ChatRuntimeContextUsageEvent) => void) => () => void;
  chatRuntimeOnComplete: (callback: (event: ChatRuntimeEventMap['chat:runtime:complete']) => void) => () => void;
```

- [ ] **Step 2: Add preload bridge methods**

Modify `electron/preload/index.mts`:

```ts
import type {
  ChatRuntimeContextUsageEvent,
  ChatRuntimeEventMap,
  ChatRuntimeMessageEvent
} from 'types/chat-runtime';
```

Add methods to the exposed API object:

```ts
  chatRuntimeSend: (input) => ipcRenderer.invoke('chat:runtime:send', input),
  chatRuntimeAbort: (input) => ipcRenderer.invoke('chat:runtime:abort', input),
  chatRuntimeOnMessageCreated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ChatRuntimeMessageEvent): void => callback(payload);
    ipcRenderer.on('chat:runtime:message-created', handler);
    return () => ipcRenderer.removeListener('chat:runtime:message-created', handler);
  },
  chatRuntimeOnMessageUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ChatRuntimeMessageEvent): void => callback(payload);
    ipcRenderer.on('chat:runtime:message-updated', handler);
    return () => ipcRenderer.removeListener('chat:runtime:message-updated', handler);
  },
  chatRuntimeOnContextUsageUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ChatRuntimeContextUsageEvent): void => callback(payload);
    ipcRenderer.on('chat:runtime:context-usage-updated', handler);
    return () => ipcRenderer.removeListener('chat:runtime:context-usage-updated', handler);
  },
  chatRuntimeOnComplete: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ChatRuntimeEventMap['chat:runtime:complete']): void => callback(payload);
    ipcRenderer.on('chat:runtime:complete', handler);
    return () => ipcRenderer.removeListener('chat:runtime:complete', handler);
  },
```

- [ ] **Step 3: Add runtime IPC registration skeleton**

Create `electron/main/modules/chat/runtime/ipc.mts`:

```ts
/**
 * @file ipc.mts
 * @description Chat runtime IPC handler registration.
 */
import type { ChatRuntimeAbortInput, ChatRuntimeHandlerResult, ChatRuntimeSendInput, ChatRuntimeStartResult } from 'types/chat-runtime';
import { ipcMain } from 'electron';
import { chatRuntimeService } from './service.mjs';

/**
 * Wraps runtime handlers into the shared result envelope.
 * @param fn - Handler implementation.
 * @returns IPC-safe handler.
 */
function wrapRuntimeHandler<T>(fn: (...args: unknown[]) => Promise<T> | T): (...args: unknown[]) => Promise<ChatRuntimeHandlerResult<T>> {
  return async (...args: unknown[]): Promise<ChatRuntimeHandlerResult<T>> => {
    try {
      const result = await fn(...args);
      return { ok: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'UNKNOWN';
      return { ok: false, error: message, code };
    }
  };
}

/**
 * Registers chat runtime IPC handlers.
 */
export function registerChatRuntimeHandlers(): void {
  ipcMain.handle(
    'chat:runtime:send',
    wrapRuntimeHandler((_event, input): Promise<ChatRuntimeStartResult> => chatRuntimeService.send(input as ChatRuntimeSendInput))
  );

  ipcMain.handle(
    'chat:runtime:abort',
    wrapRuntimeHandler((_event, input): void => {
      chatRuntimeService.abort(input as ChatRuntimeAbortInput);
    })
  );
}
```

- [ ] **Step 4: Register runtime handlers in the main module registrar**

Find where `registerChatHandlers()` is called, then add:

```ts
import { registerChatRuntimeHandlers } from './chat/runtime/ipc.mjs';
```

Call it next to the existing chat handler registration:

```ts
  registerChatHandlers();
  registerChatRuntimeHandlers();
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS. If Electron main import paths require `.mjs` from `.mts`, follow the existing pattern used by `electron/main/modules/chat/ipc.mts`.

---

### Task 4: Implement Context Budget Service

**Files:**
- Create: `electron/main/modules/chat/runtime/context-budget.mts`
- Test: `test/electron/main/modules/chat/runtime/context-budget.test.ts`

- [ ] **Step 1: Write failing context budget tests**

Create `test/electron/main/modules/chat/runtime/context-budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createContextUsageSnapshot, computeUsableInputTokens, shouldCompactBeforeSend } from '../../../../../electron/main/modules/chat/runtime/context-budget.mjs';

describe('chat runtime context budget', (): void => {
  it('subtracts output reserve and compaction buffer from context window', (): void => {
    const usable = computeUsableInputTokens({
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      compactionBufferTokens: 20_000
    });

    expect(usable).toBe(171_808);
  });

  it('uses explicit input limit before total context fallback', (): void => {
    const usable = computeUsableInputTokens({
      contextWindow: 200_000,
      inputLimit: 120_000,
      maxOutputTokens: 8_192,
      compactionBufferTokens: 20_000
    });

    expect(usable).toBe(91_808);
  });

  it('marks send-before compaction at eighty-five percent of usable input', (): void => {
    expect(shouldCompactBeforeSend({ estimatedInputTokens: 85, usableInputTokens: 100 })).toBe(true);
    expect(shouldCompactBeforeSend({ estimatedInputTokens: 84, usableInputTokens: 100 })).toBe(false);
  });

  it('creates a danger snapshot with provider usage when available', (): void => {
    const snapshot = createContextUsageSnapshot({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      contextWindow: 100,
      maxOutputTokens: 10,
      compactionBufferTokens: 10,
      estimatedInputTokens: 95,
      providerUsageTokens: 90
    });

    expect(snapshot.usableInputTokens).toBe(80);
    expect(snapshot.usagePercent).toBe(100);
    expect(snapshot.remainingInputTokens).toBe(0);
    expect(snapshot.status).toBe('danger');
    expect(snapshot.shouldCompactBeforeSend).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/electron/main/modules/chat/runtime/context-budget.test.ts`

Expected: FAIL because `context-budget.mjs` does not exist.

- [ ] **Step 3: Implement context budget service**

Create `electron/main/modules/chat/runtime/context-budget.mts`:

```ts
/**
 * @file context-budget.mts
 * @description Pure context budget calculations for main-process chat runtime.
 */
import type { ChatRuntimeContextUsageSnapshot, ChatRuntimeContextUsageStatus } from 'types/chat-runtime';

/** Default compaction safety buffer. */
export const DEFAULT_COMPACTION_BUFFER_TOKENS = 20_000;

/** Send-before compaction threshold ratio. */
export const SEND_BEFORE_COMPACT_RATIO = 0.85;

/** Warning threshold percent. */
const WARNING_USAGE_PERCENT = 65;

/** Danger threshold percent. */
const DANGER_USAGE_PERCENT = 90;

/**
 * Context budget input.
 */
export interface ContextBudgetInput {
  /** Complete context window. */
  contextWindow: number;
  /** Optional provider-specific input limit. */
  inputLimit?: number;
  /** Max output tokens. */
  maxOutputTokens: number;
  /** Compaction safety buffer. */
  compactionBufferTokens?: number;
}

/**
 * Context usage snapshot input.
 */
export interface ContextUsageSnapshotInput extends ContextBudgetInput {
  /** Runtime id. */
  runtimeId: string;
  /** Session id. */
  sessionId: string;
  /** Agent id. */
  agentId: string;
  /** Estimated input token count. */
  estimatedInputTokens: number;
  /** Provider usage tokens. */
  providerUsageTokens?: number;
}

/**
 * Converts unknown numeric input to a safe non-negative number.
 * @param value - Numeric input.
 * @returns Non-negative finite value.
 */
function safeNonNegativeNumber(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

/**
 * Computes the usable input token budget.
 * @param input - Budget input.
 * @returns Usable input tokens.
 */
export function computeUsableInputTokens(input: ContextBudgetInput): number {
  const contextWindow = safeNonNegativeNumber(input.contextWindow);
  if (contextWindow === 0) return 0;

  const maxOutputTokens = safeNonNegativeNumber(input.maxOutputTokens);
  const compactionBufferTokens = safeNonNegativeNumber(input.compactionBufferTokens ?? DEFAULT_COMPACTION_BUFFER_TOKENS);
  const reserve = maxOutputTokens + compactionBufferTokens;
  const inputLimit = safeNonNegativeNumber(input.inputLimit);

  if (inputLimit > 0) {
    return Math.max(0, inputLimit - reserve);
  }

  return Math.max(0, contextWindow - reserve);
}

/**
 * Determines whether a send should compact before calling the provider.
 * @param input - Estimated and usable token counts.
 * @returns Whether send-before compaction should run.
 */
export function shouldCompactBeforeSend(input: { estimatedInputTokens: number; usableInputTokens: number }): boolean {
  if (input.usableInputTokens <= 0) return false;
  return input.estimatedInputTokens >= Math.floor(input.usableInputTokens * SEND_BEFORE_COMPACT_RATIO);
}

/**
 * Maps usage percent to visual state.
 * @param usagePercent - Rounded usage percent.
 * @returns Visual status.
 */
function getStatus(usagePercent: number): ChatRuntimeContextUsageStatus {
  if (usagePercent >= DANGER_USAGE_PERCENT) return 'danger';
  if (usagePercent >= WARNING_USAGE_PERCENT) return 'warning';
  return 'safe';
}

/**
 * Creates a context usage snapshot for renderer UI and runtime decisions.
 * @param input - Snapshot input.
 * @returns Context usage snapshot.
 */
export function createContextUsageSnapshot(input: ContextUsageSnapshotInput): ChatRuntimeContextUsageSnapshot {
  const contextWindow = safeNonNegativeNumber(input.contextWindow);
  const reservedOutputTokens = safeNonNegativeNumber(input.maxOutputTokens);
  const compactionBufferTokens = safeNonNegativeNumber(input.compactionBufferTokens ?? DEFAULT_COMPACTION_BUFFER_TOKENS);
  const estimatedInputTokens = safeNonNegativeNumber(input.estimatedInputTokens);
  const providerUsageTokens = input.providerUsageTokens === undefined ? undefined : safeNonNegativeNumber(input.providerUsageTokens);
  const usableInputTokens = computeUsableInputTokens(input);
  const rawPercent = usableInputTokens <= 0 ? 0 : (estimatedInputTokens / usableInputTokens) * 100;
  const usagePercent = Math.min(100, Math.max(0, Math.round(rawPercent)));
  const remainingInputTokens = Math.max(0, usableInputTokens - estimatedInputTokens);

  return {
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    agentId: input.agentId,
    contextWindow,
    reservedOutputTokens,
    compactionBufferTokens,
    usableInputTokens,
    estimatedInputTokens,
    providerUsageTokens,
    usagePercent,
    remainingInputTokens,
    status: getStatus(usagePercent),
    shouldCompactBeforeSend: shouldCompactBeforeSend({ estimatedInputTokens, usableInputTokens })
  };
}
```

- [ ] **Step 4: Run budget tests**

Run: `pnpm test test/electron/main/modules/chat/runtime/context-budget.test.ts`

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

---

### Task 5: Implement Serialized Context Estimator

**Files:**
- Create: `electron/main/modules/chat/runtime/context-estimator.mts`
- Test: `test/electron/main/modules/chat/runtime/context-estimator.test.ts`

- [ ] **Step 1: Write failing estimator tests**

Create `test/electron/main/modules/chat/runtime/context-estimator.test.ts`:

```ts
import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { estimateSerializedModelMessages, estimateTextTokens } from '../../../../../electron/main/modules/chat/runtime/context-estimator.mjs';

describe('chat runtime context estimator', (): void => {
  it('estimates serialized model messages with four characters per token', (): void => {
    const messages: ModelMessage[] = [{ role: 'user', content: '12345678' }];
    const expected = Math.ceil(JSON.stringify(messages).length / 4);

    expect(estimateSerializedModelMessages(messages)).toBe(expected);
  });

  it('returns zero for empty messages', (): void => {
    expect(estimateSerializedModelMessages([])).toBe(0);
  });

  it('estimates text tokens with the same cheap heuristic', (): void => {
    expect(estimateTextTokens('123456789')).toBe(3);
  });

  it('counts image parts through serialized payload shape', (): void => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image', image: 'data:image/png;base64,abcdef' }
        ]
      }
    ];

    expect(estimateSerializedModelMessages(messages)).toBe(Math.ceil(JSON.stringify(messages).length / 4));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/electron/main/modules/chat/runtime/context-estimator.test.ts`

Expected: FAIL because `context-estimator.mjs` does not exist.

- [ ] **Step 3: Implement estimator**

Create `electron/main/modules/chat/runtime/context-estimator.mts`:

```ts
/**
 * @file context-estimator.mts
 * @description Cheap serialized model-message token estimator for runtime planning and UI.
 */
import type { ModelMessage } from 'ai';

/** Average serialized characters per token. */
const SERIALIZED_CHARS_PER_TOKEN = 4;

/**
 * Estimates text tokens using a cheap constant heuristic.
 * @param text - Text content.
 * @returns Estimated token count.
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / SERIALIZED_CHARS_PER_TOKEN);
}

/**
 * Estimates serialized model-message token count.
 * @param messages - Model messages in the shape sent to AI SDK.
 * @returns Estimated token count.
 */
export function estimateSerializedModelMessages(messages: ModelMessage[]): number {
  if (!messages.length) return 0;
  return estimateTextTokens(JSON.stringify(messages));
}
```

- [ ] **Step 4: Run estimator tests**

Run: `pnpm test test/electron/main/modules/chat/runtime/context-estimator.test.ts`

Expected: PASS.

- [ ] **Step 5: Compare with renderer estimator deliberately**

Run: `git diff -- electron/main/modules/chat/runtime/context-estimator.mts src/components/BChat/utils/compression/tokenEstimator.ts`

Expected: no edits to renderer estimator. This phase introduces a main-process cheap estimator without removing the existing renderer estimator.

---

### Task 6: Add Session Runtime Lock

**Files:**
- Create: `electron/main/modules/chat/runtime/locks.mts`
- Test: `test/electron/main/modules/chat/runtime/locks.test.ts`

- [ ] **Step 1: Write failing lock tests**

Create `test/electron/main/modules/chat/runtime/locks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRuntimeLockRegistry } from '../../../../../electron/main/modules/chat/runtime/locks.mjs';

describe('chat runtime locks', (): void => {
  it('allows one writing runtime per session', (): void => {
    const locks = createRuntimeLockRegistry();

    expect(locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r1' }).ok).toBe(true);
    expect(locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r2' })).toEqual({
      ok: false,
      ownerRuntimeId: 'r1',
      reason: 'session_busy'
    });
  });

  it('allows different sessions to run independently', (): void => {
    const locks = createRuntimeLockRegistry();

    expect(locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r1' }).ok).toBe(true);
    expect(locks.acquireWritingLock({ sessionId: 's2', runtimeId: 'r2' }).ok).toBe(true);
  });

  it('releases only the owning runtime', (): void => {
    const locks = createRuntimeLockRegistry();

    locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r1' });
    expect(locks.releaseWritingLock({ sessionId: 's1', runtimeId: 'r2' })).toBe(false);
    expect(locks.releaseWritingLock({ sessionId: 's1', runtimeId: 'r1' })).toBe(true);
    expect(locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r3' }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/electron/main/modules/chat/runtime/locks.test.ts`

Expected: FAIL because `locks.mjs` does not exist.

- [ ] **Step 3: Implement runtime locks**

Create `electron/main/modules/chat/runtime/locks.mts`:

```ts
/**
 * @file locks.mts
 * @description Session-scoped writing locks for chat runtimes.
 */

/** Successful lock acquisition. */
export interface RuntimeLockAcquired {
  /** Acquisition succeeded. */
  ok: true;
}

/** Failed lock acquisition. */
export interface RuntimeLockRejected {
  /** Acquisition failed. */
  ok: false;
  /** Current owning runtime. */
  ownerRuntimeId: string;
  /** Stable reason. */
  reason: 'session_busy';
}

/** Lock acquisition result. */
export type RuntimeLockResult = RuntimeLockAcquired | RuntimeLockRejected;

/** Runtime lock registry. */
export interface RuntimeLockRegistry {
  /** Acquire a session writing lock. */
  acquireWritingLock(input: { sessionId: string; runtimeId: string }): RuntimeLockResult;
  /** Release a session writing lock. */
  releaseWritingLock(input: { sessionId: string; runtimeId: string }): boolean;
  /** Read the current owner for a session. */
  getWritingOwner(sessionId: string): string | undefined;
}

/**
 * Creates an in-memory runtime lock registry.
 * @returns Runtime lock registry.
 */
export function createRuntimeLockRegistry(): RuntimeLockRegistry {
  const writingLocks = new Map<string, string>();

  return {
    acquireWritingLock(input: { sessionId: string; runtimeId: string }): RuntimeLockResult {
      const ownerRuntimeId = writingLocks.get(input.sessionId);
      if (ownerRuntimeId && ownerRuntimeId !== input.runtimeId) {
        return { ok: false, ownerRuntimeId, reason: 'session_busy' };
      }

      writingLocks.set(input.sessionId, input.runtimeId);
      return { ok: true };
    },

    releaseWritingLock(input: { sessionId: string; runtimeId: string }): boolean {
      if (writingLocks.get(input.sessionId) !== input.runtimeId) {
        return false;
      }

      writingLocks.delete(input.sessionId);
      return true;
    },

    getWritingOwner(sessionId: string): string | undefined {
      return writingLocks.get(sessionId);
    }
  };
}
```

- [ ] **Step 4: Run lock tests**

Run: `pnpm test test/electron/main/modules/chat/runtime/locks.test.ts`

Expected: PASS.

---

### Task 7: Add Runtime Service Shell

**Files:**
- Create: `electron/main/modules/chat/runtime/types.mts`
- Create: `electron/main/modules/chat/runtime/service.mts`
- Test: `test/electron/main/modules/chat/runtime/service.test.ts`

- [ ] **Step 1: Write failing runtime shell tests**

Create `test/electron/main/modules/chat/runtime/service.test.ts`:

```ts
import type { ChatRuntimeSendInput } from 'types/chat-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createChatRuntimeService } from '../../../../../electron/main/modules/chat/runtime/service.mjs';

describe('chat runtime service shell', (): void => {
  function createInput(overrides: Partial<ChatRuntimeSendInput> = {}): ChatRuntimeSendInput {
    return {
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      content: 'hello',
      ...overrides
    };
  }

  it('starts a runtime and emits a complete event for the shell implementation', async (): Promise<void> => {
    const emit = vi.fn();
    const service = createChatRuntimeService({ emit });

    const result = await service.send(createInput());

    expect(result.runtimeId).toMatch(/^runtime-/);
    expect(result.sessionId).toBe('session-1');
    expect(emit).toHaveBeenCalledWith('chat:runtime:complete', expect.objectContaining({
      runtimeId: result.runtimeId,
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1'
    }));
  });

  it('rejects a second runtime for the same session while the first is active', async (): Promise<void> => {
    const service = createChatRuntimeService({
      emit: vi.fn(),
      keepRuntimeOpenForTest: true
    });

    const first = await service.send(createInput());

    await expect(service.send(createInput({ content: 'second' }))).rejects.toMatchObject({
      code: 'SESSION_BUSY'
    });

    service.abort({ runtimeId: first.runtimeId });
    const second = await service.send(createInput({ content: 'after abort' }));
    expect(second.sessionId).toBe('session-1');
  });

  it('aborts only the targeted runtime', async (): Promise<void> => {
    const emit = vi.fn();
    const service = createChatRuntimeService({ emit, keepRuntimeOpenForTest: true });
    const first = await service.send(createInput({ sessionId: 'session-1' }));
    const second = await service.send(createInput({ sessionId: 'session-2' }));

    service.abort({ runtimeId: first.runtimeId });

    expect(service.getActiveRuntime(first.runtimeId)).toBeUndefined();
    expect(service.getActiveRuntime(second.runtimeId)?.sessionId).toBe('session-2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/electron/main/modules/chat/runtime/service.test.ts`

Expected: FAIL because `service.mjs` does not exist.

- [ ] **Step 3: Add runtime internal types**

Create `electron/main/modules/chat/runtime/types.mts`:

```ts
/**
 * @file types.mts
 * @description Internal chat runtime service types.
 */
import type { ChatRuntimeEventMap } from 'types/chat-runtime';

/** Runtime lifecycle status. */
export type ChatRuntimeStatus = 'running' | 'aborting' | 'completed';

/** Active runtime state. */
export interface ActiveChatRuntime {
  /** Runtime id. */
  runtimeId: string;
  /** Session id. */
  sessionId: string;
  /** Client id. */
  clientId: string;
  /** Agent id. */
  agentId: string;
  /** Parent runtime id. */
  parentRuntimeId?: string;
  /** Runtime status. */
  status: ChatRuntimeStatus;
  /** Abort controller for future stream/tool work. */
  abortController: AbortController;
  /** Creation timestamp. */
  createdAt: number;
}

/** Runtime event emitter. */
export type ChatRuntimeEventEmitter = <TName extends keyof ChatRuntimeEventMap>(name: TName, payload: ChatRuntimeEventMap[TName]) => void;

/** Runtime service dependencies. */
export interface ChatRuntimeServiceDependencies {
  /** Emits runtime events to renderer clients. */
  emit: ChatRuntimeEventEmitter;
  /** Keeps a runtime open during tests to exercise locks. */
  keepRuntimeOpenForTest?: boolean;
}
```

- [ ] **Step 4: Implement runtime service shell**

Create `electron/main/modules/chat/runtime/service.mts`:

```ts
/**
 * @file service.mts
 * @description Main-process chat runtime service shell.
 */
import type { ChatRuntimeAbortInput, ChatRuntimeSendInput, ChatRuntimeStartResult } from 'types/chat-runtime';
import type { ActiveChatRuntime, ChatRuntimeServiceDependencies } from './types.mjs';
import { nanoid } from 'nanoid';
import { BrowserWindow } from 'electron';
import { createRuntimeLockRegistry } from './locks.mjs';

/** Runtime error with a stable code. */
export class ChatRuntimeError extends Error {
  /** Stable error code. */
  code: string;

  /**
   * Creates a runtime error.
   * @param code - Stable error code.
   * @param message - Human-readable message.
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatRuntimeError';
    this.code = code;
  }
}

/**
 * Creates the default Electron event emitter.
 * @returns Runtime event emitter.
 */
function createDefaultEmitter(): ChatRuntimeServiceDependencies['emit'] {
  return (name, payload): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(name, payload);
    }
  };
}

/**
 * Creates a chat runtime service.
 * @param dependencies - Runtime dependencies.
 * @returns Runtime service.
 */
export function createChatRuntimeService(dependencies: Partial<ChatRuntimeServiceDependencies> = {}) {
  const emit = dependencies.emit ?? createDefaultEmitter();
  const locks = createRuntimeLockRegistry();
  const activeRuntimes = new Map<string, ActiveChatRuntime>();

  /**
   * Completes a runtime and releases its session lock.
   * @param runtime - Runtime to complete.
   */
  function completeRuntime(runtime: ActiveChatRuntime): void {
    runtime.status = 'completed';
    activeRuntimes.delete(runtime.runtimeId);
    locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
    emit('chat:runtime:complete', {
      runtimeId: runtime.runtimeId,
      sessionId: runtime.sessionId,
      clientId: runtime.clientId,
      agentId: runtime.agentId,
      parentRuntimeId: runtime.parentRuntimeId
    });
  }

  return {
    /**
     * Starts a chat runtime shell.
     * @param input - Send input.
     * @returns Started runtime identifiers.
     */
    async send(input: ChatRuntimeSendInput): Promise<ChatRuntimeStartResult> {
      const sessionId = input.sessionId ?? `session-${nanoid()}`;
      const runtimeId = `runtime-${nanoid()}`;
      const lock = locks.acquireWritingLock({ sessionId, runtimeId });

      if (!lock.ok) {
        throw new ChatRuntimeError('SESSION_BUSY', `Session ${sessionId} is already running ${lock.ownerRuntimeId}`);
      }

      const runtime: ActiveChatRuntime = {
        runtimeId,
        sessionId,
        clientId: input.clientId,
        agentId: input.agentId,
        status: 'running',
        abortController: new AbortController(),
        createdAt: Date.now()
      };
      activeRuntimes.set(runtimeId, runtime);

      if (!dependencies.keepRuntimeOpenForTest) {
        completeRuntime(runtime);
      }

      return { runtimeId, sessionId };
    },

    /**
     * Aborts a runtime.
     * @param input - Abort input.
     */
    abort(input: ChatRuntimeAbortInput): void {
      const runtime = activeRuntimes.get(input.runtimeId);
      if (!runtime) return;

      runtime.status = 'aborting';
      runtime.abortController.abort();
      activeRuntimes.delete(runtime.runtimeId);
      locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
    },

    /**
     * Reads an active runtime for tests and future diagnostics.
     * @param runtimeId - Runtime id.
     * @returns Active runtime if present.
     */
    getActiveRuntime(runtimeId: string): ActiveChatRuntime | undefined {
      return activeRuntimes.get(runtimeId);
    }
  };
}

/** Default singleton used by IPC handlers. */
export const chatRuntimeService = createChatRuntimeService();
```

- [ ] **Step 5: Run runtime service tests**

Run: `pnpm test test/electron/main/modules/chat/runtime/service.test.ts`

Expected: PASS.

- [ ] **Step 6: Run runtime test slice**

Run: `pnpm test test/electron/main/modules/chat/runtime/context-budget.test.ts test/electron/main/modules/chat/runtime/context-estimator.test.ts test/electron/main/modules/chat/runtime/locks.test.ts test/electron/main/modules/chat/runtime/service.test.ts`

Expected: PASS.

---

### Task 8: Register IPC And Verify Main Build

**Files:**
- Modify: main module registrar file that currently registers `registerChatHandlers`
- Modify: `electron/main/modules/chat/runtime/ipc.mts`

- [ ] **Step 1: Locate the registrar**

Run: `rg -n "registerChatHandlers|register.*Handlers" electron/main/modules electron/main/index.mts`

Expected: identify the file that imports and calls `registerChatHandlers()`.

- [ ] **Step 2: Register chat runtime IPC**

In the registrar file, add:

```ts
import { registerChatRuntimeHandlers } from './chat/runtime/ipc.mjs';
```

Call:

```ts
registerChatRuntimeHandlers();
```

next to the existing chat handler registration.

- [ ] **Step 3: Run Electron main build**

Run: `pnpm run electron:build-main`

Expected: PASS. This verifies `.mts` -> `.mjs` import paths and Electron main type compatibility.

- [ ] **Step 4: Run runtime tests again**

Run: `pnpm test test/electron/main/modules/chat/runtime/context-budget.test.ts test/electron/main/modules/chat/runtime/context-estimator.test.ts test/electron/main/modules/chat/runtime/locks.test.ts test/electron/main/modules/chat/runtime/service.test.ts`

Expected: PASS.

---

### Task 9: Add Changelog And Final Verification

**Files:**
- Create or Modify: `changelog/2026-06-18.md`

- [ ] **Step 1: Add changelog entry**

If `changelog/2026-06-18.md` does not exist, create:

```md
# 2026-06-18

## Added
- 新增主进程聊天 runtime 基础类型、IPC 骨架、上下文预算估算与 session 写入锁，为后续工具执行和上下文压缩主进程化做准备。
```

If the file exists, add the bullet under `## Added`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/electron/main/modules/chat/runtime/context-budget.test.ts test/electron/main/modules/chat/runtime/context-estimator.test.ts test/electron/main/modules/chat/runtime/locks.test.ts test/electron/main/modules/chat/runtime/service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Run Electron main build**

Run: `pnpm run electron:build-main`

Expected: PASS.

- [ ] **Step 5: Run diff checks**

Run: `git diff --check`

Expected: PASS with no whitespace errors.

Run: `git status --short`

Expected: modified and new files only from this plan. There should be no committed changes.

- [ ] **Step 6: Manual review checklist**

Check:

- `useChatStream.ts`, `useCompactContext.ts`, `useContextUsage.ts`, and `BChat/index.vue` are unchanged.
- Existing `chat:*` persistence IPC still exists.
- Existing `chatCompression*` IPC still exists.
- Runtime IPC is additive and does not replace active UI behavior.
- `compression_json` is still readable and writable by legacy code in this phase.

## Plan Self-Review

Spec coverage in this phase:

- Covered: shared runtime IDs, data fields, runtime event contract, budget service, serialized estimator, session writing lock, runtime shell, IPC registration.
- Deferred by design: tool execution migration, renderer context bridge, compaction service, overflow replay, prune, UI runtime hook replacement.

Placeholder scan:

- No placeholder markers, empty implementation steps, or unnamed files are intentionally left in this plan.
- Code steps include concrete snippets and focused commands.

Type consistency:

- `runtimeId`, `sessionId`, `clientId`, `agentId`, and `parentRuntimeId` names are consistent across shared types, runtime internal types, and tests.
- `ChatRuntimeContextUsageSnapshot` is the shared UI snapshot type.
- `ChatMessageCompactionPart` is added to `ChatMessagePart` but not yet used by active runtime behavior in this phase.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-main-process-chat-runtime-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Because the user requested no commits, both options must avoid commit commands and use test/diff checkpoints instead.
