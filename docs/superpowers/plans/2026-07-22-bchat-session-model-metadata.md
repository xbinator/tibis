# BChat Session Model Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each existing BChat session's selected model in extensible session metadata, inherit it across branches, and guarantee metadata is durable before any Runtime using that model starts.

**Architecture:** Add a nullable `metadata_json` column to `chat_sessions` and expose typed `ChatSession.metadata.model`. The main process owns atomic metadata merging; Pinia loads sessions by ID and updates models through focused IPC methods. Renderer model selection reads persisted session metadata before the global default, while every model-using Runtime path writes missing legacy metadata before IPC startup.

**Tech Stack:** Vue 3 Composition API, TypeScript strict, Pinia, Electron IPC, better-sqlite3, Vitest, AI SDK v7

## Global Constraints

- Do not execute `git add`, `git commit`, `git commit --amend`, or any automatic commit; the user will review and commit manually.
- Do not use `any`; all new function parameters and return values require explicit types.
- Keep accurate file headers and JSDoc for every new or modified function, interface, and non-obvious logic block.
- Use `asyncTo` for renderer async error normalization; do not add handwritten async `try/catch`.
- Store only `providerId` and `modelId`; Provider credentials remain in the main process.
- Do not backfill legacy sessions while merely viewing them.
- Do not modify `InputToolbar.vue` or model-selector visuals.
- Update `changelog/2026-07-22.md` after behavior is complete.

---

## File Map

- `types/chat.d.ts`: typed session metadata and model identity.
- `electron/main/modules/database/service.mts`: additive `metadata_json` migration and create-table schema.
- `electron/main/modules/chat/service.mts`: map, create, update, and branch session metadata.
- `electron/main/modules/chat/runtime/branch.mts`: inherit source metadata into a branch.
- `types/electron-api.d.ts`: get-session and update-session-model API types.
- `electron/preload/index.mts`: renderer-to-main method forwarding.
- `electron/main/modules/chat/ipc.mts`: focused session metadata handlers.
- `src/stores/chat/session.ts`: by-ID session loading, model update/ensure, and model-aware session creation.
- `src/components/BChat/hooks/useModelSelection.ts`: persisted session metadata as the session model source of truth.
- `src/components/BChat/hooks/useChatServiceConfig.ts`: wait for session metadata before freezing a Runtime model.
- `src/components/BChat/hooks/useChatSessionRuntime.ts`: load directly opened session metadata and create new sessions with the frozen model.
- `src/components/BChat/hooks/useRuntimeRequestConfig.ts`: make the prepared model snapshot required.
- `src/components/BChat/hooks/useChatWorkflow.ts`: ensure model metadata before send, regenerate, compact, and user-choice Runtime startup.
- `src/components/BChat/hooks/useChatSubmitter.ts`: persist the user-choice continuation model before launcher startup.
- `src/components/BChat/index.vue`: connect metadata loading/persistence and surface toolbar update errors.
- `test/electron/main/modules/database/session-metadata-migration.test.ts`: additive migration integration test.
- `test/electron/main/modules/chat/service-runtime-fields.test.ts`: main-process metadata mapping, update, and branch persistence.
- `test/electron/main/modules/chat/session-model-ipc.test.ts`: IPC routing behavior.
- `test/stores/chat/session.test.ts`: Pinia by-ID load, creation, update, ensure, and failure behavior.
- `test/components/BChat/use-model-selection.test.ts`: persisted selection and draft/global boundary.
- `test/components/BChat/use-chat-service-config.test.ts`: metadata load ordering before capability resolution.
- `test/components/BChat/session-id-runtime.test.ts`: end-to-end Runtime persistence ordering and failure blocking.
- `test/electron/main/modules/chat/branch.test.ts`: branch metadata inheritance.

---

### Task 1: Add Typed Session Metadata and SQLite Persistence

**Files:**
- Modify: `types/chat.d.ts`
- Modify: `electron/main/modules/database/service.mts`
- Modify: `electron/main/modules/chat/service.mts`
- Modify: `electron/main/modules/chat/runtime/branch.mts`
- Create: `test/electron/main/modules/database/session-metadata-migration.test.ts`
- Modify: `test/electron/main/modules/chat/service-runtime-fields.test.ts`
- Modify: `test/electron/main/modules/chat/branch.test.ts`

**Interfaces:**
- Produces: `ChatSessionModelMetadata`, `ChatSessionMetadata`, and optional `ChatSession.metadata`.
- Produces: `chatSessionManager.updateSessionModel(sessionId, model): ChatSession`.
- Preserves: existing `ChatSession` construction because `metadata` remains optional.

- [ ] **Step 1: Add failing metadata mapping and update tests**

Extend `service-runtime-fields.test.ts` to import `ChatSessionModelMetadata` and add:

```typescript
it('maps valid session model metadata and ignores malformed metadata', (): void => {
  databaseMock.dbSelect
    .mockReturnValueOnce([
      {
        id: 'session-valid',
        type: 'assistant',
        title: 'Valid',
        created_at: '2026-07-22T00:00:00.000Z',
        updated_at: '2026-07-22T00:00:00.000Z',
        last_message_at: '2026-07-22T00:00:00.000Z',
        usage_json: null,
        metadata_json: JSON.stringify({ model: { providerId: 'provider-1', modelId: 'model-2' } })
      }
    ])
    .mockReturnValueOnce([
      {
        id: 'session-invalid',
        type: 'assistant',
        title: 'Invalid',
        created_at: '2026-07-22T00:00:00.000Z',
        updated_at: '2026-07-22T00:00:00.000Z',
        last_message_at: '2026-07-22T00:00:00.000Z',
        usage_json: null,
        metadata_json: JSON.stringify({ model: { providerId: '', modelId: 1 } })
      }
    ]);

  expect(chatSessionManager.getSessionById('session-valid')?.metadata?.model).toEqual({ providerId: 'provider-1', modelId: 'model-2' });
  expect(chatSessionManager.getSessionById('session-invalid')?.metadata).toBeUndefined();
});

it('atomically merges and returns updated session model metadata', (): void => {
  const model: ChatSessionModelMetadata = { providerId: 'provider-2', modelId: 'model-3' };
  databaseMock.dbSelect.mockReturnValueOnce([
    {
      id: 'session-1',
      type: 'assistant',
      title: 'Session',
      created_at: '2026-07-22T00:00:00.000Z',
      updated_at: '2026-07-22T00:00:00.000Z',
      last_message_at: '2026-07-22T00:00:00.000Z',
      usage_json: null,
      metadata_json: JSON.stringify({ layout: 'compact', model: { providerId: 'provider-1', modelId: 'model-1' } })
    }
  ]);

  const session = chatSessionManager.updateSessionModel('session-1', model);

  expect(session.metadata).toMatchObject({ layout: 'compact', model });
  expect(databaseMock.dbExecute).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE chat_sessions'),
    [JSON.stringify({ layout: 'compact', model }), expect.any(String), 'session-1']
  );
});
```

Add a creation assertion that `createSession()` serializes `session.metadata` as the final session insert parameter.

- [ ] **Step 2: Add a failing branch inheritance test**

In `branch.test.ts`, add `metadata` to the source session fixture and assert:

```typescript
expect(result.session.metadata).toEqual({ model: { providerId: 'provider-1', modelId: 'model-2' } });
expect(result.session.metadata).not.toBe(sourceSession.metadata);
```

In the branch transaction test, include `metadata_json` in the source row and assert the `INSERT INTO chat_sessions` parameters contain the inherited JSON.

- [ ] **Step 3: Add a failing additive migration integration test**

Create `session-metadata-migration.test.ts`. Use `mkdtempSync`, `better-sqlite3`, and a mocked Electron `app.getPath('userData')` to create an old `chat_sessions` table without `metadata_json`, insert one row, then call `initDatabase()`.

```typescript
expect(dbSelect<{ name: string }>('PRAGMA table_info(chat_sessions)').map((column) => column.name)).toContain('metadata_json');
expect(dbSelect<{ title: string }>('SELECT title FROM chat_sessions WHERE id = ?', ['legacy-session'])).toEqual([{ title: 'Legacy' }]);
```

Close both databases and remove the temporary directory in `afterEach`.

- [ ] **Step 4: Run the tests and verify RED**

```bash
pnpm exec vitest run \
  test/electron/main/modules/database/session-metadata-migration.test.ts \
  test/electron/main/modules/chat/service-runtime-fields.test.ts \
  test/electron/main/modules/chat/branch.test.ts
```

Expected: FAIL because `metadata_json`, metadata mapping, and `updateSessionModel` do not exist.

- [ ] **Step 5: Add session metadata types**

Add to `types/chat.d.ts` before `ChatSession`:

```typescript
/** Model identity persisted for one chat session. */
export interface ChatSessionModelMetadata {
  /** Provider stable identifier. */
  providerId: string;
  /** Model identifier within the provider. */
  modelId: string;
}

/** Extensible metadata persisted with one chat session. */
export interface ChatSessionMetadata {
  /** Model selected for future Runtime operations in this session. */
  model?: ChatSessionModelMetadata;
  /** Future metadata fields are preserved by main-process model updates. */
  [key: string]: unknown;
}
```

Add `metadata?: ChatSessionMetadata` to `ChatSession`.

- [ ] **Step 6: Add the database column and session SQL fields**

In database initialization:

```typescript
ensureColumn('chat_sessions', 'metadata_json', 'metadata_json TEXT');
```

Add `metadata_json TEXT` to the create-table statement. Add `metadata_json` to all session SELECT, UPSERT, INSERT, and branch insert SQL in `chat/service.mts`, and add `metadata_json: string | null` to `ChatSessionRow`.

- [ ] **Step 7: Validate, map, and update metadata**

Add validators:

```typescript
function isSessionModelMetadata(value: unknown): value is ChatSessionModelMetadata {
  return isRecordValue(value) && typeof value.providerId === 'string' && value.providerId.trim().length > 0 && typeof value.modelId === 'string' && value.modelId.trim().length > 0;
}

function parseSessionMetadata(json: string | null): ChatSessionMetadata | undefined {
  const value = parseJson<unknown>(json);
  if (!isRecordValue(value)) return undefined;
  if (value.model !== undefined && !isSessionModelMetadata(value.model)) return undefined;
  return value as ChatSessionMetadata;
}
```

Use `parseSessionMetadata` in `mapSessionRow`, serialize `session.metadata` in both insert paths, and add:

```typescript
updateSessionModel(sessionId: string, model: ChatSessionModelMetadata): ChatSession {
  if (!isSessionModelMetadata(model)) throw new Error('会话模型格式无效');
  const session = this.getSessionById(sessionId);
  if (!session) throw new Error('找不到聊天会话');

  const updatedAt = dayjs().toISOString();
  const metadata: ChatSessionMetadata = { ...(session.metadata ?? {}), model };
  dbExecute(UPDATE_SESSION_METADATA_SQL, [stringifyJson(metadata), updatedAt, sessionId]);
  return { ...session, metadata, updatedAt };
}
```

- [ ] **Step 8: Copy metadata into branches**

In `createSessionBranchData`, add:

```typescript
metadata: input.sourceSession.metadata ? structuredClone(input.sourceSession.metadata) : undefined,
```

Persist `branch.session.metadata` in `insertSessionBranch`.

- [ ] **Step 9: Re-run Task 1 tests**

Expected: all three files PASS.

---

### Task 2: Expose Session Get and Model Update IPC

**Files:**
- Modify: `types/electron-api.d.ts`
- Modify: `electron/preload/index.mts`
- Modify: `electron/main/modules/chat/ipc.mts`
- Create: `test/electron/main/modules/chat/session-model-ipc.test.ts`

**Interfaces:**
- Consumes: `ChatSessionModelMetadata` and `chatSessionManager.updateSessionModel` from Task 1.
- Produces: `chatSessionGet` and `chatSessionUpdateModel` Electron API methods.

- [ ] **Step 1: Add failing IPC routing tests**

Mock `electron.ipcMain.handle` and `chatSessionManager`, call `registerChatHandlers`, capture handlers by channel, then assert:

```typescript
await expect(callHandler('chat:session:get', 'session-1')).resolves.toEqual({ ok: true, data: session });
expect(chatSessionManagerMock.getSessionById).toHaveBeenCalledWith('session-1');

await expect(callHandler('chat:session:updateModel', 'session-1', model)).resolves.toEqual({ ok: true, data: updatedSession });
expect(chatSessionManagerMock.updateSessionModel).toHaveBeenCalledWith('session-1', model);
```

Also read `electron/preload/index.mts` as source and assert both channel strings are forwarded.

- [ ] **Step 2: Run the IPC test and verify RED**

```bash
pnpm exec vitest run test/electron/main/modules/chat/session-model-ipc.test.ts
```

Expected: FAIL because neither channel is registered.

- [ ] **Step 3: Add typed Electron API methods**

Add to `ElectronAPI`:

```typescript
chatSessionGet: (sessionId: string) => Promise<ChatHandlerResult<ChatSession | undefined>>;
chatSessionUpdateModel: (sessionId: string, model: ChatSessionModelMetadata) => Promise<ChatHandlerResult<ChatSession>>;
```

Import `ChatSessionModelMetadata` as a type.

- [ ] **Step 4: Add preload and IPC routing**

Preload:

```typescript
chatSessionGet: (sessionId) => ipcRenderer.invoke('chat:session:get', sessionId),
chatSessionUpdateModel: (sessionId, model) => ipcRenderer.invoke('chat:session:updateModel', sessionId, model),
```

Main handlers:

```typescript
ipcMain.handle(
  'chat:session:get',
  wrapHandler((_event, sessionId) => chatSessionManager.getSessionById(sessionId as string))
);
ipcMain.handle(
  'chat:session:updateModel',
  wrapHandler((_event, sessionId, model) => chatSessionManager.updateSessionModel(sessionId as string, model as ChatSessionModelMetadata))
);
```

- [ ] **Step 5: Re-run the IPC test and both TypeScript checks**

```bash
pnpm exec vitest run test/electron/main/modules/chat/session-model-ipc.test.ts
pnpm exec tsc --noEmit
pnpm exec tsc -p electron/tsconfig.json --noEmit
```

Expected: PASS and zero diagnostics.

---

### Task 3: Add Session Store Loading and Model Actions

**Files:**
- Modify: `src/stores/chat/session.ts`
- Modify: `test/stores/chat/session.test.ts`

**Interfaces:**
- Consumes: Task 2 Electron API methods.
- Produces: `loadSessionById`, `updateSessionModel`, `ensureSessionModel`, and model-aware `createSession`.

- [ ] **Step 1: Extend the Electron mock and add failing store tests**

Add typed mocks for `chatSessionGet` and `chatSessionUpdateModel`. Add tests proving:

```typescript
it('loads an unpaged session by id and coalesces concurrent requests', async (): Promise<void> => {
  const deferred = createDeferred<ChatHandlerResult<ChatSession | undefined>>();
  mockElectronAPI.chatSessionGet.mockReturnValue(deferred.promise);
  const store = useChatSessionStore();

  const first = store.loadSessionById('session-old');
  const second = store.loadSessionById('session-old');
  deferred.resolve({ ok: true, data: createSession('session-old', { metadata: { model } }) });

  await expect(Promise.all([first, second])).resolves.toEqual([expect.objectContaining({ id: 'session-old' }), expect.objectContaining({ id: 'session-old' })]);
  expect(mockElectronAPI.chatSessionGet).toHaveBeenCalledOnce();
  expect(store.findSession('session-old')?.metadata?.model).toEqual(model);
});

it('creates a session with the first runtime model', async (): Promise<void> => {
  mockElectronAPI.chatSessionCreate.mockResolvedValue({ ok: true, data: undefined });
  const store = useChatSessionStore();
  const session = await store.createSession('assistant', { title: 'Hello', model });
  expect(session.metadata?.model).toEqual(model);
  expect(mockElectronAPI.chatSessionCreate).toHaveBeenCalledWith(expect.objectContaining({ metadata: { model } }));
});

it('persists a missing model once and preserves an existing model', async (): Promise<void> => {
  const store = useChatSessionStore();
  store.sessions = [createSession('legacy')];
  mockElectronAPI.chatSessionUpdateModel.mockResolvedValue({ ok: true, data: createSession('legacy', { metadata: { model } }) });

  await store.ensureSessionModel('legacy', model);
  await store.ensureSessionModel('legacy', { providerId: 'provider-2', modelId: 'model-3' });

  expect(mockElectronAPI.chatSessionUpdateModel).toHaveBeenCalledOnce();
  expect(store.findSession('legacy')?.metadata?.model).toEqual(model);
});
```

Add a rejection test proving failed update leaves the previous store session unchanged.

- [ ] **Step 2: Run store tests and verify RED**

```bash
pnpm exec vitest run test/stores/chat/session.test.ts
```

Expected: FAIL because the actions and API mocks do not exist.

- [ ] **Step 3: Implement coalesced by-ID loading**

Add a module-closure map:

```typescript
const sessionLoadPromises = new Map<string, Promise<ChatSession | undefined>>();
```

Implement `loadSessionById` using the local getter first, then a shared request Promise. The shared request must use `retryDuringDatabaseInitialization`, normalize errors with `asyncTo`, merge a returned session before resolving, and delete the exact shared Promise from the map after settlement so a later retry is possible. Treat a database-initialization race as an unresolved session; rethrow every other error.

- [ ] **Step 4: Implement model-aware creation and updates**

Change create options to:

```typescript
interface CreateSessionOptions {
  title?: string;
  model?: ChatSessionModelMetadata;
}
```

Construct `metadata: model ? { model } : undefined`.

Implement:

```typescript
async updateSessionModel(sessionId: string, model: ChatSessionModelMetadata): Promise<ChatSession> {
  await this.loadSessionById(sessionId);
  const result = await getElectronAPI().chatSessionUpdateModel(sessionId, toCloneableData(model));
  const session = unwrap(result);
  this.sessions = mergeSessions([session], this.sessions);
  return session;
},

async ensureSessionModel(sessionId: string, model: ChatSessionModelMetadata): Promise<ChatSession> {
  const session = await this.loadSessionById(sessionId);
  if (!session) throw new Error('找不到聊天会话');
  return session.metadata?.model ? session : this.updateSessionModel(sessionId, model);
},
```

- [ ] **Step 5: Re-run store tests**

Expected: all store tests PASS.

---

### Task 4: Restore and Switch Models Through Session Metadata

**Files:**
- Modify: `src/components/BChat/hooks/useModelSelection.ts`
- Modify: `src/components/BChat/hooks/useChatServiceConfig.ts`
- Modify: `src/components/BChat/hooks/useChatSessionRuntime.ts`
- Modify: `src/components/BChat/hooks/useChatComposer.ts`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/components/BChat/use-model-selection.test.ts`
- Modify: `test/components/BChat/use-chat-service-config.test.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

**Interfaces:**
- Consumes: Task 3 session store actions.
- Produces: session metadata-backed `selectedModel` and `resolveSelectedModel()`.
- Changes: `ensureActiveSession(title, model): Promise<string>`.

- [ ] **Step 1: Replace temporary-map tests with persisted-session tests**

In `use-model-selection.test.ts`, set `chatStore.sessions` with metadata and assert reopening/switching session IDs reads each persisted model. Spy on `chatStore.updateSessionModel` and assert existing-session changes call it but never call `serviceModelStore.setChatModel`.

Add a failed persistence test:

```typescript
vi.spyOn(chatStore, 'updateSessionModel').mockRejectedValue(new Error('metadata failed'));
await expect(modelSelection.onModelChange(model2)).rejects.toThrow('metadata failed');
expect(modelSelection.selectedModel.value).toEqual(model1);
```

Keep the draft persistence and disabled Provider/model cases.

- [ ] **Step 2: Add a failing service-config load-order test**

Change `useChatServiceConfig` tests to provide an async `resolveSelectedModel`. Assert it is awaited and `getModelToolSupport` receives the resolved persisted model. Add a missing-model case.

- [ ] **Step 3: Add a failing direct-session-load integration assertion**

Extend the `session-id-runtime.test.ts` chat store mock with `loadSessionById`, `findSession`, `updateSessionModel`, and `ensureSessionModel`. Mount an existing session and assert `loadSessionById('session-active')` is called before a send resolves its model.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
pnpm exec vitest run \
  test/components/BChat/use-model-selection.test.ts \
  test/components/BChat/use-chat-service-config.test.ts \
  test/components/BChat/session-id-runtime.test.ts
```

Expected: FAIL because model selection still uses the in-memory map and service config cannot await session loading.

- [ ] **Step 5: Make session metadata the selection source**

In `useModelSelection`, use `useChatSessionStore`. Replace `sessionModels` with:

```typescript
const sourceModel = computed<SelectedModel | undefined>((): SelectedModel | undefined => {
  const sessionId = activeSessionId.value;
  if (!sessionId) return serviceModelStore.chatModel;
  return chatSessionStore.findSession(sessionId)?.metadata?.model ?? serviceModelStore.chatModel;
});
```

Add:

```typescript
async function resolveSelectedModel(): Promise<SelectedModel | undefined> {
  const sessionId = activeSessionId.value;
  if (sessionId) await chatSessionStore.loadSessionById(sessionId);
  return selectedModel.value;
}
```

Existing-session `onModelChange` awaits `chatSessionStore.updateSessionModel`; draft behavior remains global.

- [ ] **Step 6: Resolve service config through the async model resolver**

Change `useChatServiceConfig` to accept:

```typescript
resolveSelectedModel: () => Promise<SelectedModel | undefined>
```

Await it before querying tool support. Pass `modelSelectionEvents.resolveSelectedModel` from `BChat/index.vue`.

- [ ] **Step 7: Load direct sessions and ensure active sessions have models**

In `useChatSessionRuntime.loadSessionMessages`, load the session record and messages together with `Promise.all`. Change `ensureActiveSession` to accept `ChatSessionModelMetadata`; when creating a draft session call:

```typescript
chatStore.createSession('assistant', { title, model })
```

When an active session already exists, ensure its metadata before returning the ID:

```typescript
async function ensureActiveSession(title: string, model: ChatSessionModelMetadata): Promise<string> {
  const sessionId = activeSessionId.value;
  if (sessionId) {
    await chatStore.ensureSessionModel(sessionId, model);
    return sessionId;
  }

  const session = await chatStore.createSession('assistant', { title, model });
  // Keep the existing created-session bookkeeping and callbacks here.
  return session.id;
}
```

This method is the normal-send persistence boundary: it must not return an existing session ID until missing legacy metadata has been durably written.

- [ ] **Step 8: Surface toolbar persistence errors**

Change `handleModelChange` to an async function using `asyncTo`. On error show an error toast and leave selection unchanged. Keep command-panel rejection behavior unchanged.

- [ ] **Step 9: Re-run Task 4 tests**

Expected: all three files PASS.

---

### Task 5: Persist Missing Metadata Before Every Runtime Path

**Files:**
- Modify: `src/components/BChat/hooks/useRuntimeRequestConfig.ts`
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts`
- Modify: `src/components/BChat/hooks/useChatSubmitter.ts`
- Modify: `test/components/BChat/use-runtime-request-config.test.ts`
- Modify: `test/components/BChat/use-chat-submitter.test.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

**Interfaces:**
- Consumes: `ensureSessionModel(sessionId, model)` from Task 3.
- Produces: `PreparedRuntimeRequest.config.model` as required.
- Guarantees: send, continue, submit-user-choice, and compact IPC only run after model metadata persistence.

- [ ] **Step 1: Make prepared Runtime model required in tests**

Add a type assertion in `use-runtime-request-config.test.ts` and ensure all `PreparedRuntimeRequest` fixtures include:

```typescript
model: { providerId: 'provider-1', modelId: 'model-2' }
```

- [ ] **Step 2: Add failing ordering tests for all four Runtime paths**

In `session-id-runtime.test.ts`, add `ensureSessionModel` to `chatStoreMock`. For normal send, regenerate, compact, and user-choice continuation, record calls in an `order` array and assert:

```typescript
expect(order).toEqual(['persist-model', 'runtime-send']);
expect(order).toEqual(['persist-model', 'runtime-continue']);
expect(order).toEqual(['persist-model', 'runtime-compact']);
expect(order).toEqual(['persist-model', 'runtime-choice']);
```

For a new draft send, assert `createSession` receives `{ title, model }` and no separate update is required.

- [ ] **Step 3: Add failure-blocking tests**

For each Runtime path, reject `ensureSessionModel` and assert the corresponding Electron method is not called. Assert the existing workflow error projection/toast runs.

- [ ] **Step 4: Run focused workflow tests and verify RED**

```bash
pnpm exec vitest run \
  test/components/BChat/use-runtime-request-config.test.ts \
  test/components/BChat/use-chat-submitter.test.ts \
  test/components/BChat/session-id-runtime.test.ts
```

Expected: FAIL because Runtime startup currently does not await session metadata persistence.

- [ ] **Step 5: Refine the prepared request type**

In `useRuntimeRequestConfig.ts`, override the config property:

```typescript
export interface PreparedRuntimeRequest extends Omit<RuntimeRequestPolicyResult, 'config'> {
  /** Runtime config with the renderer-selected model guaranteed. */
  config: ChatRuntimeRequestConfig & { model: ChatRuntimeModelSelection };
  /** Current Memory selection context. */
  memorySelection?: MemorySelectionContext;
}
```

- [ ] **Step 6: Persist before send, regenerate, and compact**

Add a workflow helper:

```typescript
async function ensurePreparedModel(sessionId: string, prepared: PreparedRuntimeRequest): Promise<void> {
  await chatStore.ensureSessionModel(sessionId, prepared.config.model);
}
```

Use it after preparation and before `runtimeLauncher.start` in regenerate and compact. For normal send, pass `prepared.config.model` into `ensureActiveSession`; its Task 4 contract ensures existing sessions before returning and creates new sessions with metadata in one write.

- [ ] **Step 7: Persist before user-choice continuation**

Add this option to `UseChatSubmitterOptions`:

```typescript
ensureSessionModel: (sessionId: string, model: ChatRuntimeModelSelection) => Promise<void>;
```

In `performAssistantTurnContinuation`, call it after preparation succeeds and before `startRuntime`. Pass `chatStore.ensureSessionModel` from `useChatWorkflow`.

- [ ] **Step 8: Re-run Task 5 tests and renderer TypeScript**

```bash
pnpm exec vitest run \
  test/components/BChat/use-runtime-request-config.test.ts \
  test/components/BChat/use-chat-submitter.test.ts \
  test/components/BChat/session-id-runtime.test.ts
pnpm exec tsc --noEmit
```

Expected: all tests PASS and zero diagnostics.

---

### Task 6: Record and Verify the Complete Change

**Files:**
- Modify: `changelog/2026-07-22.md`
- Verify: all files from Tasks 1-5

**Interfaces:**
- Consumes: completed persistence behavior.
- Produces: user-visible changelog and verification evidence; no staging or commit.

- [ ] **Step 1: Append the changelog entry**

Under `## Changed`, add:

```markdown
- 将 `BChat` 已有会话的模型选择持久化到 `chat_sessions.metadata_json`：新会话在首次发送时记录模型，旧会话在首次 Runtime 前按需补写，分支继承源会话模型；模型切换不再影响全局默认，并在发送、重新生成、用户选择续跑和上下文压缩前保证会话模型已落库。
```

- [ ] **Step 2: Run the complete focused test set**

```bash
pnpm exec vitest run \
  test/electron/main/modules/database/session-metadata-migration.test.ts \
  test/electron/main/modules/chat/service-runtime-fields.test.ts \
  test/electron/main/modules/chat/branch.test.ts \
  test/electron/main/modules/chat/session-model-ipc.test.ts \
  test/stores/chat/session.test.ts \
  test/components/BChat/use-model-selection.test.ts \
  test/components/BChat/use-chat-service-config.test.ts \
  test/components/BChat/use-runtime-request-config.test.ts \
  test/components/BChat/use-chat-submitter.test.ts \
  test/components/BChat/session-id-runtime.test.ts \
  test/components/BChat/use-chat-runtime.test.ts \
  test/electron/main/modules/chat/runtime/chat-model-resolver.test.ts \
  test/electron/main/modules/chat/runtime/factory.test.ts \
  test/electron/main/modules/chat/runtime/stream/executor.test.ts \
  test/electron/main/modules/chat/runtime/service.test.ts
```

Expected: every listed test file PASS.

- [ ] **Step 3: Run strict type checks**

```bash
pnpm exec tsc --noEmit
pnpm exec tsc -p electron/tsconfig.json --noEmit
```

Expected: both commands exit 0 with no diagnostics.

- [ ] **Step 4: Run lint checks**

```bash
pnpm lint
pnpm lint:style
```

Expected: both commands exit 0. Review all auto-fixes.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm test
```

Expected: zero failed files and zero failed tests.

- [ ] **Step 6: Review the final working tree**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors and only intended source, test, spec, plan, and changelog changes. Do not stage or commit.
