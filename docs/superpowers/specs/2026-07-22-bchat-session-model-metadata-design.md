# BChat Session Model Metadata Design

## Goal

Persist the model selected for an existing `BChat` session in session metadata without changing the global default model. New draft sessions continue to use and update the global default until the first session is created.

The resulting behavior is:

- A draft model change updates the global chat default.
- A newly created session stores the model frozen for its first Runtime.
- An existing session model change updates only that session's metadata.
- A legacy session without model metadata falls back to the current global default while it is only being viewed.
- The first Runtime operation for a legacy session stores the model frozen for that operation before the Runtime starts.
- A branched session inherits the source session metadata and can diverge afterward.

## Non-Goals

- Do not persist Provider credentials in session metadata.
- Do not change the global `service_models` record for existing-session switches.
- Do not record per-message model provenance in this change.
- Do not backfill all legacy sessions during database startup or when they are only viewed.
- Do not change `InputToolbar` or model selector visuals.

## Data Model

Add typed session metadata to `types/chat.d.ts`:

```typescript
export interface ChatSessionModelMetadata {
  providerId: string;
  modelId: string;
}

export interface ChatSessionMetadata {
  model?: ChatSessionModelMetadata;
}

export interface ChatSession {
  // Existing fields...
  metadata?: ChatSessionMetadata;
}
```

The SQLite `chat_sessions` table gains a nullable `metadata_json TEXT` column through the existing `ensureColumn` migration mechanism. The generic JSON column keeps session metadata extensible, while model updates use a dedicated API so renderer callers cannot accidentally overwrite unrelated metadata.

Only `providerId` and `modelId` are stored. Provider API keys and complete Provider configuration remain owned by the main process.

## Main-Process Persistence

All session SELECT, INSERT, UPSERT, and branch INSERT statements include `metadata_json`. `ChatSessionRow` and `mapSessionRow` parse it into `ChatSession.metadata`.

Metadata parsing is defensive:

- A valid object with a valid optional `model` is returned.
- Invalid JSON or malformed model fields are treated as missing metadata for normal session reads.
- A later valid model update replaces the malformed value with valid metadata.

`ChatSessionManager` adds two focused operations:

1. `getSessionById(sessionId)` is exposed through IPC so a restored or directly opened session can load metadata even when it is outside the currently loaded sidebar page.
2. `updateSessionModel(sessionId, model)` reads the current session, merges `metadata.model`, updates `updated_at`, persists `metadata_json`, and returns the updated `ChatSession`.

The model update is performed in the main process so future metadata fields are preserved atomically. Missing sessions and empty model identifiers produce an error instead of silently succeeding.

Session branching copies `sourceSession.metadata` into the new session data before the branch transaction inserts it. The source and branch then own independent JSON values.

## IPC And Renderer Store

Add these Electron API methods:

```typescript
chatSessionGet(sessionId: string): Promise<ChatHandlerResult<ChatSession | undefined>>;
chatSessionUpdateModel(
  sessionId: string,
  model: ChatSessionModelMetadata
): Promise<ChatHandlerResult<ChatSession>>;
```

`useChatSessionStore` adds:

- `loadSessionById(sessionId)`: returns an already loaded session or fetches it by ID and merges it into `sessions`.
- `updateSessionModel(sessionId, model)`: ensures the session is loaded, invokes the update IPC, and merges the returned session.
- `ensureSessionModel(sessionId, model)`: preserves an existing metadata model; when metadata is missing, persists the supplied Runtime model.
- `createSession(..., { model })`: includes `metadata.model` in the initial session insert when a draft becomes a real session.

Direct session loads should be coalesced so concurrent history loading, model switching, and Runtime preparation do not issue competing reads or overwrite a newer model response.

## Renderer Model Selection

`useModelSelection` stops treating the in-memory override map as the source of truth. For an active session it resolves the model in this order:

1. `chatSessionStore.findSession(sessionId)?.metadata?.model`
2. `serviceModelStore.chatModel`

For a draft it continues to use `serviceModelStore.chatModel`.

Model changes follow these rules:

- Draft: call `serviceModelStore.setChatModel(model)` as today.
- Existing session: call `chatSessionStore.updateSessionModel(sessionId, model)` and never call `setChatModel`.

The UI changes only after persistence succeeds. A failed toolbar update keeps the previous selection and shows an error toast. A failed `/model` update rejects through the existing safe command-panel selection path, leaving the panel open.

Session loading and Runtime preparation must not race. Before resolving a Runtime service configuration for an active session, the renderer ensures that session metadata has been loaded by ID. This prevents a restored old tab from briefly using the global default when persisted model metadata exists.

## Runtime Write Boundary

Model metadata must be durable before any model invocation begins.

For a new draft send:

1. Prepare the Runtime and freeze its model.
2. Create the session with that model in `metadata.model`.
3. Start the Runtime.

For a legacy existing session without metadata:

1. Prepare the Runtime and freeze the current fallback model.
2. Call `ensureSessionModel(sessionId, prepared.config.model)`.
3. Start the Runtime only after persistence succeeds.

The same pre-start check applies to all model-using BChat operations:

- normal send;
- regenerate/continue;
- submit user choice and continue;
- manual context compaction.

If the session already has model metadata, `ensureSessionModel` does not overwrite it. A model change must go through the explicit selector path before preparing the Runtime.

## Failure Handling

- Session model persistence failure blocks Runtime startup and enters the existing preparation/start error flow.
- New session creation failure continues to block the first Runtime as it does today.
- Toolbar persistence failure keeps the previous model and displays an error toast.
- Command-panel persistence failure keeps the panel open through its existing guarded selection handler.
- Missing or malformed metadata falls back to the global default until a valid Runtime or explicit switch writes a valid model.
- A persisted model whose Provider or model is disabled is treated as unavailable by the existing Provider availability checks; the no-model UI remains responsible for asking the user to choose a valid model.

## Testing

Use TDD and cover these boundaries:

### Database and Main Process

- Existing databases gain `metadata_json` without losing rows.
- Session list and get-by-ID map valid metadata.
- Invalid metadata is ignored safely.
- Create and update persist model metadata.
- Updating a model preserves unrelated metadata fields.
- A branch inherits source metadata and later updates independently.
- IPC and preload methods pass typed model data and return the updated session.

### Renderer Store and Selection

- Draft changes still call the global model store.
- Existing-session changes call the session store only.
- Reopening a session restores its persisted model.
- A directly loaded session outside the current page is fetched by ID.
- A legacy session falls back to the default without writing during viewing.
- Persistence failure leaves the previous selected model intact.

### Runtime Workflows

- New session creation includes the first Runtime model.
- A legacy session writes its fallback model before normal send.
- Regenerate, user-choice continuation, and manual compaction ensure metadata before Runtime startup.
- A persistence rejection prevents all four Runtime IPC commands.
- Existing Runtime model snapshot tests continue to prove the main process uses the same model.

## Compatibility

The migration is additive and nullable. Existing rows remain readable and behave as legacy sessions until their first Runtime operation or explicit model switch. Existing callers that construct `ChatSession` remain valid because `metadata` is optional.

No Git staging or commit is part of this work; the user will review and commit changes manually.
