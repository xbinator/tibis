# Compaction Abort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make aborting an in-progress context compaction settle the compaction message itself without adding interrupt messages or synthetic compaction parts.

**Architecture:** Keep the change in the main-process chat runtime service, because it owns runtime phase, active assistant messages, and persisted abort mutations. Add regression coverage in the existing runtime service test suite before changing production code.

**Tech Stack:** TypeScript, Electron main process `.mts` modules, Vitest.

## Global Constraints

- Do not commit code; the user will commit manually.
- Preserve normal assistant generation abort behavior.
- Preserve session write-lock release after compaction cancellation settles.
- Follow repository TypeScript and comment requirements.

---

### Task 1: Regression Tests For Compaction Abort

**Files:**
- Modify: `test/electron/main/modules/chat/runtime/service.test.ts`

**Interfaces:**
- Consumes: `createChatRuntimeService`, `ChatRuntimeAbortResult`, `ChatMessageRecord`, `CompactionExecutor`.
- Produces: failing assertions that describe the new compaction abort behavior.

- [ ] **Step 1: Add a failing test for pending compaction abort**

Add a test near the existing compaction cancellation tests and import `ChatMessageCompactionPart` from `types/chat`:

```typescript
it('updates a cancelled manual compaction without creating an interrupt message', async (): Promise<void> => {
  const executionGate = createDeferred<void>();
  const collector = createEventCollector();
  const messages: ChatMessageRecord[] = [];
  const compactionExecutor: CompactionExecutor = {
    async execute(input): Promise<{ status: 'cancelled'; checkpoint: ChatMessageCompactionPart }> {
      const pendingPart: ChatMessageCompactionPart = {
        id: 'checkpoint-cancel-existing',
        type: 'compaction',
        status: 'pending',
        trigger: 'manual',
        boundaryPartId: 'old-source-part',
        sourceFingerprint: 'fingerprint-cancel-existing',
        createdAt: 1
      };
      input.assistantMessage.parts.push(pendingPart);
      await executionGate.promise;
      const cancelledPart: ChatMessageCompactionPart = {
        ...pendingPart,
        status: 'cancelled',
        errorCode: 'USER_CANCELLED',
        completedAt: 2
      };
      input.assistantMessage.parts.splice(0, 1, cancelledPart);
      return { status: 'cancelled', checkpoint: cancelledPart };
    },
    async cancel(): Promise<void> {
      executionGate.resolve();
    }
  };
  const service = createChatRuntimeService({
    emit: collector.emit,
    createMessageId: (kind): string => `${kind}-cancel-existing`,
    messageReader: createNoopMessageReader(),
    messageWriter: {
      addMessage: async (message: ChatMessageRecord): Promise<void> => {
        messages.push(structuredClone(message));
      },
      updateMessage: async (message: ChatMessageRecord): Promise<void> => {
        const index = messages.findIndex((candidate: ChatMessageRecord): boolean => candidate.id === message.id);
        if (index >= 0) messages[index] = structuredClone(message);
      }
    },
    resolveModel: async () => createModelResolution(),
    compactionExecutor,
    streamExecutor: createNoopStreamExecutor()
  });

  await service.compact({
    runtimeId: 'runtime-cancel-existing',
    sessionId: 'session-1',
    clientId: 'client-1',
    agentId: 'primary',
    contextWindow: 12_000
  });
  const result = await service.abort({ runtimeId: 'runtime-cancel-existing' });

  expect(result.interruptMessage).toBeUndefined();
  expect(collector.events).not.toContainEqual(expect.objectContaining({ name: 'chat:runtime:message-created', payload: expect.objectContaining({ message: expect.objectContaining({ role: 'interrupt' }) }) }));
  expect(result.assistantMessage?.parts).toEqual([expect.objectContaining({ type: 'compaction', status: 'cancelled' })]);
});
```

- [ ] **Step 2: Add a failing test for early compaction abort**

Add a second test that keeps the executor from writing a pending part:

```typescript
it('does not create a synthetic compaction part when manual compaction is aborted before pending write', async (): Promise<void> => {
  const collector = createEventCollector();
  const messages: ChatMessageRecord[] = [];
  const service = createChatRuntimeService({
    emit: collector.emit,
    createMessageId: (kind): string => `${kind}-early-empty`,
    messageReader: createNoopMessageReader(),
    messageWriter: {
      addMessage: async (message: ChatMessageRecord): Promise<void> => {
        messages.push(structuredClone(message));
      },
      updateMessage: async (message: ChatMessageRecord): Promise<void> => {
        const index = messages.findIndex((candidate: ChatMessageRecord): boolean => candidate.id === message.id);
        if (index >= 0) messages[index] = structuredClone(message);
      }
    },
    compactionExecutor: {
      async execute(): Promise<{ status: 'cancelled'; checkpoint: ChatMessageCompactionPart }> {
        return {
          status: 'cancelled',
          checkpoint: {
            id: 'unused-checkpoint',
            type: 'compaction',
            status: 'cancelled',
            trigger: 'manual',
            errorCode: 'USER_CANCELLED',
            createdAt: 1,
            completedAt: 2
          }
        };
      },
      async cancel(): Promise<void> {}
    },
    streamExecutor: createNoopStreamExecutor()
  });

  await service.compact({
    runtimeId: 'runtime-early-empty',
    sessionId: 'session-1',
    clientId: 'client-1',
    agentId: 'primary',
    contextWindow: 12_000
  });
  const result = await service.abort({ runtimeId: 'runtime-early-empty' });

  expect(result.interruptMessage).toBeUndefined();
  expect(collector.events).not.toContainEqual(expect.objectContaining({ name: 'chat:runtime:message-created', payload: expect.objectContaining({ message: expect.objectContaining({ role: 'interrupt' }) }) }));
  expect(result.assistantMessage?.parts).toEqual([]);
  expect(result.assistantMessage).toMatchObject({ role: 'assistant', loading: false, finished: true });
});
```

- [ ] **Step 3: Run the targeted tests and verify RED**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/chat/runtime/service.test.ts --testNamePattern "manual compaction"
```

Expected: the new tests fail because current abort behavior creates an interrupt message and may synthesize a cancelled compaction part.

### Task 2: Compaction-Specific Abort Finalization

**Files:**
- Modify: `electron/main/modules/chat/runtime/service.mts`

**Interfaces:**
- Consumes: `ActiveChatRuntime.phase`, `ChatRuntimeAbortResult`, `ChatMessageRecord`.
- Produces: helper behavior used only by `abort()`.

- [ ] **Step 1: Change compaction cancellation helper to update only existing parts**

Replace `cancelCompactionMessage` with a boolean helper:

```typescript
function cancelExistingCompactionPart(assistantMessage: ChatMessageRecord): boolean {
  const timestamp = getCompactionNow();
  const pendingIndex = assistantMessage.parts.findIndex((part: ChatMessagePart): boolean => part.type === 'compaction' && part.status === 'pending');
  if (pendingIndex < 0) return false;

  const pending = assistantMessage.parts[pendingIndex];
  if (pending.type !== 'compaction') return false;
  assistantMessage.parts[pendingIndex] = {
    ...structuredClone(pending),
    status: 'cancelled',
    errorCode: 'USER_CANCELLED',
    completedAt: timestamp
  };
  return true;
}
```

- [ ] **Step 2: Add compaction abort finalization before the generic interrupt path**

Inside `abort()`, after the `assistantMessage` null check, branch on `runtime.phase === 'compacting'`:

```typescript
if (runtime.phase === 'compacting') {
  cancelExistingCompactionPart(assistantMessage);
  finishAssistantMessageInterrupted(assistantMessage);
  await messageWriter.updateMessage(assistantMessage);
  abortResult.assistantMessage = cloneRuntimeMessage(assistantMessage);
  emit('chat:runtime:message-updated', {
    runtimeId: runtime.runtimeId,
    sessionId: runtime.sessionId,
    clientId: runtime.clientId,
    agentId: runtime.agentId,
    parentRuntimeId: runtime.parentRuntimeId,
    message: assistantMessage
  });
  return abortResult;
}
```

- [ ] **Step 3: Keep the existing generic generation abort path**

Leave the `hasAssistantResponseContent`, delete empty draft, preserve partial assistant, and create interrupt message logic unchanged for non-compaction runtimes.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/chat/runtime/service.test.ts --testNamePattern "compaction"
```

Expected: compaction tests pass, including existing compaction cancellation tests.

### Task 3: Changelog And Regression Sweep

**Files:**
- Create or modify: `changelog/2026-07-21.md`

**Interfaces:**
- Consumes: repository changelog convention.
- Produces: user-visible change note.

- [ ] **Step 1: Add changelog entry**

Add under `## Changed`:

```markdown
- 调整上下文压缩中止逻辑，取消压缩时只收敛压缩消息状态，不再额外追加中断消息或新压缩片段。
```

- [ ] **Step 2: Run focused BChat/runtime tests**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/chat/runtime/service.test.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/session-id-runtime.test.ts --testNamePattern "abort|compact|compaction|中断|压缩"
```

Expected: relevant abort and compaction tests pass.

- [ ] **Step 3: Check final diff**

Run:

```bash
git diff --stat
git diff -- electron/main/modules/chat/runtime/service.mts test/electron/main/modules/chat/runtime/service.test.ts changelog/2026-07-21.md
```

Expected: only the intended files changed, plus the already-existing unrelated user change remains unstaged.
