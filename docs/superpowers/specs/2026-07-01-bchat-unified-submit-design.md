# BChat Unified Submit Design

## Goal

Refactor message-level interactive components so they adapt their own output into a unified submit payload. The top-level `src/components/BChat/index.vue` should receive one normal submit event and should not branch on whether the submission came from `QuestionCard.vue` or `BubblePartWidget.vue`.

## Current State

`src/components/BChat/components/QuestionCard.vue` emits a `runtime-input` payload with `kind: 'user_choice'`.

`src/components/BChat/components/MessageBubble/BubblePartWidget.vue` emits a `runtime-input` payload with `kind: 'widget_result'`.

`src/components/BChat/index.vue` currently owns separate handlers for these shapes and dispatches with an explicit `kind` branch:

- `handleChatUserChoiceSubmit`
- `handleChatWidgetSubmit`
- `handleChatRuntimeInput`

This makes the top-level chat component aware of message-part-specific submission details.

## Target Design

Introduce a unified BChat submit payload type for message-level interactive submissions. The payload should be prepared by the leaf component that owns the UI interaction.

`QuestionCard.vue` will convert selected answers and optional supplementary text into a user-choice submit payload.

`BubblePartWidget.vue` will convert widget runtime output into a widget-result submit payload, including the structured `widget_result` message part needed by runtime send.

`MessageBubble.vue` and `ConversationView.vue` will only forward a `submit` event. They should not interpret payload kinds.

`src/components/BChat/index.vue` will keep a single submit entry for message-level interactive submissions. It can delegate to a utility or hook that resolves the correct runtime operation, but the component itself should no longer contain `handleChatUserChoiceSubmit`, `handleChatWidgetSubmit`, or a `kind`-based dispatch function.

## Runtime Semantics

User-choice submissions must still use the existing runtime user-choice continuation semantics. They are not equivalent to ordinary text messages because the main process updates the pending assistant tool result before resuming the stream.

Widget-result submissions can continue to flow through runtime send as a structured user message whose part is `type: 'widget_result'`.

The unified submit layer should hide this difference from the top-level component API, not erase the underlying runtime behavior.

## Component API

Replace the message interaction event chain:

- `runtime-input`

With:

- `submit`

The event payload should be a local BChat submit type, not the current `ChatMessageRuntimeInput` union exposed from `types/chat.d.ts`.

## Error Handling

The unified submit path must preserve current behavior:

- Busy chat tasks should reject new submissions without starting another task.
- Missing session or model configuration should finish the task and avoid leaving loading state stuck.
- Widget submission failures should still show/persist a runtime error message where appropriate.
- User-choice completion should finish the task when runtime reports `completed: true`.

## Testing

Update existing BChat tests that assert `runtime-input` emissions so they assert `submit` emissions with the new adapted payload shape.

Keep coverage for:

- `QuestionCard.vue` answer and cancel submissions.
- `BubblePartWidget.vue` widget output conversion.
- `MessageBubble.vue` and `ConversationView.vue` event forwarding.
- `src/components/BChat/index.vue` using one submit entry without the removed handlers.

## Out Of Scope

This refactor does not change widget mounted lifecycle handling or `widget-part-change` persistence.

This refactor does not change the main-process runtime APIs.
