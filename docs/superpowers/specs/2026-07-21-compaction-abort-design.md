# 2026-07-21 Compaction Abort Design

## Context

BChat uses the normal runtime abort path for both assistant generation and context compaction. For generation, aborting should preserve partial assistant output when present and append an interrupt marker. For context compaction, the visible object is already the compaction assistant message, so adding an interrupt marker or creating a fresh compaction part makes the history noisier than necessary.

## Goal

When a user aborts an in-progress context compaction, the runtime should only settle the existing compaction message. It should not append a separate interrupt message, and it should not create a new compaction part when no pending compaction part has been written yet.

## Behavior

- If the compaction message contains a pending compaction part, abort changes that part to `cancelled` with `USER_CANCELLED`.
- If the compaction message has no compaction part yet, abort finishes the existing empty placeholder without adding a new part or interrupt marker.
- Compaction abort still releases the session write lock only after the executor cancellation has settled.
- Normal assistant generation abort behavior is unchanged: partial output is preserved and an interrupt message is appended.
- Waiting user-choice cancellation is unchanged because it is not a compaction runtime.

## Implementation Shape

Keep the behavior in `electron/main/modules/chat/runtime/service.mts`, where the runtime phase and compaction trigger are known. Add a compaction-specific abort finalization path before the generic interrupt-message append. Reuse the existing executor cancellation flow and existing assistant-message update/delete helpers.

## Tests

Update the chat runtime service tests around cancelled compaction:

- Aborting a pending manual compaction updates the existing compaction part to `cancelled` and does not create an interrupt message.
- Aborting before the executor writes a pending part does not create a synthetic compaction part.
- Existing generation abort tests should continue to expect an interrupt message.
