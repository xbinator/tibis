# BChat Abort View Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a successful Chat Runtime abort immediately project the main process's persisted assistant and interrupt message mutations into the active BChat view.

**Architecture:** The main process remains the only writer of abort-finalized messages and returns the exact persisted mutation set from the abort IPC. The renderer applies that idempotent result to the active session's reactive message list before unregistering the Runtime, while keeping normal Runtime events for streaming, background sessions, and multi-window updates.

**Tech Stack:** TypeScript, Vue 3 Composition API, Electron IPC, XState, Vitest

## Global Constraints

- Do not create Git commits; the user will commit the implementation.
- Preserve existing uncommitted changes in `src/components/BChat/hooks/useChatWorkflow.ts`, `src/components/BChat/hooks/useRollback.ts`, `test/components/BChat/session-id-runtime.test.ts`, and `changelog/2026-07-20.md`.
- Do not use `any`; all parameters and return values require explicit types.
- Add file, interface, field, and function comments required by `AGENTS.md`.
- Keep function names to four words or fewer.
- Use `asyncTo` instead of new asynchronous `try/catch` blocks; the existing workflow cancellation `try/catch` remains unchanged.
- Do not change interrupt visual styles or the pending-user-choice abort branch.

---

### Task 1: Return authoritative abort mutations from the main process

**Files:**
- Modify: `types/chat-runtime.d.ts:329`
- Modify: `electron/main/modules/chat/runtime/service.mts:1287`
- Test: `test/electron/main/modules/chat/runtime/service.test.ts:2841`

**Interfaces:**
- Produces: `ChatRuntimeAbortResult` with `deletedMessageId?: string`, `assistantMessage?: ChatMessageRecord`, and `interruptMessage?: ChatMessageRecord`.
- Produces: `createChatRuntimeService().abort(input: ChatRuntimeAbortInput): Promise<ChatRuntimeAbortResult>`.

- [ ] **Step 1: Write failing service assertions for an empty assistant draft**

Capture the existing abort result in `drops an empty assistant draft before creating an interrupt message` and assert:

```typescript
const abortResult = await service.abort({ runtimeId: result.runtimeId });

expect(abortResult).toEqual({
  deletedMessageId: 'assistant-message-1',
  interruptMessage: expect.objectContaining({
    id: 'interrupt-message-1',
    role: 'interrupt',
    content: '已中断'
  })
});
```

- [ ] **Step 2: Write failing service assertions for a partial assistant response**

Capture the existing abort result in `keeps streamed assistant parts before creating an interrupt message` and assert:

```typescript
const abortResult = await service.abort({ runtimeId: result.runtimeId });

expect(abortResult).toEqual({
  assistantMessage: expect.objectContaining({
    id: 'assistant-message-1',
    content: 'partial answer',
    loading: false,
    finished: true
  }),
  interruptMessage: expect.objectContaining({
    id: 'interrupt-message-1',
    role: 'interrupt',
    content: '已中断'
  })
});
```

- [ ] **Step 3: Run the focused service tests and verify RED**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/chat/runtime/service.test.ts -t "drops an empty assistant draft|keeps streamed assistant parts"
```

Expected: both new result assertions fail because `abort` currently returns `undefined`.

- [ ] **Step 4: Define the shared abort result**

Add after `ChatRuntimeAbortInput` in `types/chat-runtime.d.ts`:

```typescript
/** Persisted message mutations produced by aborting a Runtime. */
export interface ChatRuntimeAbortResult {
  /** Empty assistant draft removed during abort finalization. */
  deletedMessageId?: string;
  /** Partial assistant response finalized during abort. */
  assistantMessage?: ChatMessageRecord;
  /** Interrupt marker persisted after abort finalization. */
  interruptMessage?: ChatMessageRecord;
}
```

- [ ] **Step 5: Return cloned persisted mutations from the service**

Import `ChatRuntimeAbortResult`, change the method return type, return `{}` for a missing Runtime or assistant draft, and build a result without changing persistence or event order:

```typescript
async abort(input: ChatRuntimeAbortInput): Promise<ChatRuntimeAbortResult> {
  const runtime = activeRuntimes.get(input.runtimeId);
  if (!runtime) return {};

  // Existing cancellation setup remains unchanged.
  const result: ChatRuntimeAbortResult = {};
  try {
    // Existing cancellation wait and compaction handling remain unchanged.
    if (!assistantMessage) return result;

    if (!hasAssistantResponseContent(assistantMessage)) {
      await deleteAssistantMessage(runtime, assistantMessage);
      result.deletedMessageId = assistantMessage.id;
    } else {
      finishAssistantMessageInterrupted(assistantMessage);
      await messageWriter.updateMessage(assistantMessage);
      result.assistantMessage = cloneRuntimeMessage(assistantMessage);
      // Existing message-updated event remains unchanged.
    }

    const interruptMessage = createRuntimeInterruptMessage(runtime, createMessageId('interrupt'), now());
    await messageWriter.addMessage(interruptMessage);
    result.interruptMessage = cloneRuntimeMessage(interruptMessage);
    // Existing message-created event remains unchanged.
    return result;
  } finally {
    locks.releaseWritingLock({ sessionId: runtime.sessionId, runtimeId: runtime.runtimeId });
  }
}
```

- [ ] **Step 6: Run the focused service tests and verify GREEN**

Run the Step 3 command again.

Expected: both tests pass and the existing persistence/event assertions remain green.

### Task 2: Expose the abort result through the renderer command adapter

**Files:**
- Modify: `types/electron-api.d.ts:675`
- Modify: `src/components/BChat/hooks/useChatRuntime.ts:192`
- Test: `test/components/BChat/use-chat-runtime.test.ts:100`

**Interfaces:**
- Consumes: `ChatRuntimeAbortResult` from Task 1.
- Produces: `useChatRuntime().abort(runtimeId: string): Promise<ChatRuntimeAbortResult>`.

- [ ] **Step 1: Write a failing renderer adapter assertion**

Make the abort mock return a structured result and assert that the adapter forwards it:

```typescript
const interruptMessage = {
  id: 'interrupt-message-1',
  sessionId: 'session-1',
  role: 'interrupt',
  content: '已中断',
  parts: [],
  createdAt: '2026-07-20T00:00:00.000Z',
  loading: false,
  finished: true
} satisfies ChatMessageRecord;
electronAPIMock.chatRuntimeAbort.mockResolvedValue({ ok: true, data: { interruptMessage } });

await expect(runtime.abort('runtime-1')).resolves.toEqual({ interruptMessage });
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-chat-runtime.test.ts -t "submits renderer message parts and aborts an explicitly addressed runtime"
```

Expected: the resolved value is `undefined`.

- [ ] **Step 3: Update Electron and adapter return types**

Change the Electron API declaration:

```typescript
chatRuntimeAbort: (input: ChatRuntimeAbortInput) => Promise<ChatRuntimeHandlerResult<ChatRuntimeAbortResult>>;
```

Change the adapter to unwrap and return the result:

```typescript
/** 中止明确指定的 Runtime。 */
async function abort(runtimeId: string): Promise<ChatRuntimeAbortResult> {
  return unwrapRuntimeResult(await electronAPI.chatRuntimeAbort({ runtimeId }));
}
```

- [ ] **Step 4: Run the adapter test and verify GREEN**

Run the Step 2 command again.

Expected: the adapter returns the structured result and its existing failure-path assertion still passes when the full file runs.

### Task 3: Project abort mutations into the active BChat view

**Files:**
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts:490-575`
- Test: `test/components/BChat/session-id-runtime.test.ts:1250`

**Interfaces:**
- Consumes: `ChatRuntimeAbortResult` from Task 1 and the adapter from Task 2.
- Produces: idempotent local helpers `upsertMessage`, `removeMessage`, and `applyAbortResult` inside `useChatWorkflow`.

- [ ] **Step 1: Write the failing zero-output component test**

After starting a Runtime, configure `chatRuntimeAbort` to return an interrupt result without emitting a Runtime event, abort, and assert the visible messages immediately include exactly one interrupt marker:

```typescript
const [sendInput] = electronAPIMock.chatRuntimeSend.mock.calls[0] as [ChatRuntimeSendInput];
const interruptMessage = {
  id: 'interrupt-message-zero-output',
  sessionId: 'session-active',
  runtimeId: sendInput.runtimeId,
  role: 'interrupt',
  content: '已中断',
  parts: [],
  createdAt: '2026-07-20T00:00:00.000Z',
  loading: false,
  finished: true
} satisfies ChatMessageRecord;
electronAPIMock.chatRuntimeAbort.mockResolvedValueOnce({
  ok: true,
  data: { deletedMessageId: 'assistant-empty', interruptMessage }
});

wrapper.findComponent(InputToolbarStub).vm.$emit('abort');
await flushPromises();

const visibleMessages = wrapper.findComponent(ConversationViewStub).props('messages') as Message[];
expect(visibleMessages.filter((message) => message.role === 'interrupt')).toEqual([expect.objectContaining({ id: interruptMessage.id, content: '已中断' })]);
```

- [ ] **Step 2: Write the failing partial-output and duplicate-event test**

Emit a partial assistant update before abort, return its finalized form and the interrupt marker from the abort command, then emit the same interrupt event after abort. Assert the assistant remains finished and the interrupt appears once:

```typescript
expect(visibleMessages).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: 'assistant-partial', content: 'partial answer', loading: false, finished: true }),
    expect.objectContaining({ id: 'interrupt-partial', role: 'interrupt', content: '已中断' })
  ])
);
expect(visibleMessages.filter((message) => message.id === 'interrupt-partial')).toHaveLength(1);
```

- [ ] **Step 3: Run the component tests and verify RED**

Run:

```bash
pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts -t "projects an abort result|keeps partial output"
```

Expected: the zero-output test lacks an interrupt message and the partial assistant is not finalized from the abort result.

- [ ] **Step 4: Add idempotent visible-message helpers**

Inside `useChatWorkflow`, add fully documented helpers and reuse them from `handleSessionUIEvent`:

```typescript
/** 按消息 ID 新增或合并当前可见消息。 */
function upsertMessage(nextMessage: Message): void {
  const normalizedMessage = userChoice.normalizePendingState(nextMessage);
  const index = options.messages.value.findIndex((message: Message): boolean => message.id === normalizedMessage.id);
  if (index < 0) options.messages.value.push(normalizedMessage);
  else options.messages.value.splice(index, 1, { ...options.messages.value[index], ...normalizedMessage });
}

/** 按消息 ID 删除当前可见消息。 */
function removeMessage(messageId: string): void {
  const index = options.messages.value.findIndex((message: Message): boolean => message.id === messageId);
  if (index >= 0) options.messages.value.splice(index, 1);
}

/** 将主进程中止结果投影到当前可见消息。 */
function applyAbortResult(result: ChatRuntimeAbortResult): void {
  if (result.deletedMessageId) removeMessage(result.deletedMessageId);
  if (result.assistantMessage) upsertMessage(result.assistantMessage as Message);
  if (result.interruptMessage) upsertMessage(result.interruptMessage as Message);
}
```

- [ ] **Step 5: Apply the result before unregistering the Runtime**

Capture the target session before awaiting IPC and only mutate the same still-visible session:

```typescript
const abortedSessionId = options.activeSessionId.value;
if (runtimeId) {
  const result = await chatRuntime.abort(runtimeId);
  if (options.activeSessionId.value === abortedSessionId) {
    applyAbortResult(result);
    await nextTick();
    options.scrollToBottom();
  }
}
options.sessionActor.markRuntimeCancelled();
if (runtimeId) options.actorSystem.unregisterRuntime(runtimeId);
```

- [ ] **Step 6: Reuse the helpers for Runtime message events**

Replace the duplicated `messageCreated`/`messageUpdated` and `messageDeleted` array logic with `upsertMessage(event.event.message as Message)` and `removeMessage(event.event.messageId)` so normal events and abort results share identical idempotency.

- [ ] **Step 7: Run the component tests and verify GREEN**

Run the Step 3 command again, then run the full component test file:

```bash
pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts
```

Expected: the new abort projection tests and all existing BChat Runtime tests pass, including the user's busy rollback test.

### Task 4: Document and verify the complete fix

**Files:**
- Modify: `changelog/2026-07-20.md`
- Verify: all files modified by Tasks 1-3

**Interfaces:**
- Consumes: the complete abort result pipeline from Tasks 1-3.
- Produces: a documented, linted, type-checked implementation left uncommitted for the user.

- [ ] **Step 1: Add the changelog entry**

Under `## Fixed`, preserve existing entries and add:

```markdown
- 修复 BChat 在模型尚未返回内容时中止生成不会立即显示“已中断”、必须刷新页面才出现的问题；主进程中止结果现在会直接同步到当前响应式消息列表，并保留已有部分输出。
```

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/chat/runtime/service.test.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: all focused test files pass with zero failures.

- [ ] **Step 3: Run non-mutating code checks**

Run:

```bash
pnpm exec eslint src/components/BChat/hooks/useChatRuntime.ts src/components/BChat/hooks/useChatWorkflow.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/session-id-runtime.test.ts
pnpm exec stylelint 'src/**/*.{vue,less,css}'
pnpm exec tsc --noEmit
```

Expected: every command exits with code 0. Stylelint is included for the repository requirement even though no style file changes.

- [ ] **Step 4: Review the final diff without committing**

Run:

```bash
git diff --check
git status --short
git diff -- types/chat-runtime.d.ts types/electron-api.d.ts electron/main/modules/chat/runtime/service.mts src/components/BChat/hooks/useChatRuntime.ts src/components/BChat/hooks/useChatWorkflow.ts test/electron/main/modules/chat/runtime/service.test.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/session-id-runtime.test.ts changelog/2026-07-20.md
```

Expected: only the planned implementation plus the user's preserved pre-existing changes are present, with no staged files and no new commit.
