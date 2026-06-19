# 2026-06-19 Todo Rollback Snapshot Design

## Goal

When a user actively rolls back a chat message, todo changes produced by the rolled-back conversation range should also be reverted. Existing todo state before that range must be preserved.

## Current Behavior

The `todowrite` tool stores a full replacement todo list per `sessionId` in `src/stores/chat/todo.ts`. Rollback in `src/components/BChat/hooks/useRollback.ts` truncates chat messages and persists the truncated message list, but it does not update the todo store.

Because todowrite is full replacement, individual todo items cannot be reliably attributed to a single assistant message. A later todowrite call can update old items and add new items in the same payload.

## Recommended Design

Record todo write snapshots and restore the last safe snapshot during rollback.

Each successful todowrite execution stores:

- `sessionId`
- source identifier for the runtime turn, preferably `runtimeId`
- `beforeTodos`
- `afterTodos`
- `createdAt`

Rollback restores the todo list to the state before the first todowrite snapshot whose source belongs to the deleted message range. If no matching snapshot exists, rollback leaves todo state unchanged.

## Data Flow

1. `useChatRuntime` receives a tool request event from the main-process runtime.
2. Renderer tool execution passes runtime metadata into `todowrite`.
3. `todowrite` reads current todos as `beforeTodos`, writes normalized input todos as `afterTodos`, and records a snapshot.
4. User confirms rollback from a user message.
5. Rollback truncates messages as it does today.
6. After successful truncation, rollback asks the todo store to restore todos using the deleted messages' runtime/source ids.

## Edge Cases

- If the rolled-back range includes no todowrite snapshots, todos are unchanged.
- If multiple todowrite snapshots exist in the range, restore to the earliest snapshot's `beforeTodos`.
- If the restored list is empty, remove the session todo entry and hide the todo panel.
- If older sessions contain todos without snapshot history, rollback cannot safely infer ownership and should leave them unchanged.

## Testing

Add focused BChat tests for:

- rollback after a later todowrite restores the previous todo list
- rollback with no matching todo snapshot keeps current todos
- empty restored todos clear the todo panel state
