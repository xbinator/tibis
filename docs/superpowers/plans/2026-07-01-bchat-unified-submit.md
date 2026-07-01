# BChat Unified Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move BChat message-level interaction adaptation into leaf components and let `src/components/BChat/index.vue` receive one unified `submit` event.

**Architecture:** Add a BChat-local executable submit action type and a `useChatSubmitter` hook. `QuestionCard.vue` and `BubblePartWidget.vue` adapt their own interaction data into an executable action, while `MessageBubble.vue` and `ConversationView.vue` only forward `submit`.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Vitest, existing ChatRuntime IPC hooks.

---

## Files

- Create: `src/components/BChat/utils/submitAction.ts`
- Create: `src/components/BChat/hooks/useChatSubmitter.ts`
- Modify: `src/components/BChat/components/QuestionCard.vue`
- Modify: `src/components/BChat/components/MessageBubble/BubblePartWidget.vue`
- Modify: `src/components/BChat/components/MessageBubble.vue`
- Modify: `src/components/BChat/components/ConversationView.vue`
- Modify: `src/components/BChat/index.vue`
- Modify: `types/chat.d.ts`
- Modify: `test/components/BChat/message-bubble.component.test.ts`
- Modify: `test/components/BChat/conversation-view.component.test.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`
- Modify: `changelog/2026-07-01.md`

## Task 1: Define Unified Submit Action

- [x] Add `src/components/BChat/utils/submitAction.ts` with `BChatSubmitAction`, `BChatSubmitContext`, helper factories, and `BChatAdaptedUserMessageSubmitInput`.
- [x] Include file header comments and JSDoc for all exported types.
- [x] Use `ChatRuntimeUserInputPart` for runtime parts and `Message` for renderer-created user messages.

## Task 2: Add Submitter Hook

- [x] Add `src/components/BChat/hooks/useChatSubmitter.ts`.
- [x] Implement `submit(action)` as `action.run(context)`.
- [x] Provide `continueAssistantTurn(answer)` in the context to preserve current `chatRuntime.submitUserChoice` behavior.
- [x] Provide `sendAdaptedUserMessage(input)` in the context to delegate to the existing `sendRuntimeUserMessage` callback.
- [x] Do not branch on action shape in `index.vue` or `useChatSubmitter`.

## Task 3: Component Submit Event Tests

- [x] Update `test/components/BChat/message-bubble.component.test.ts` so widget and question tests expect `submit` instead of `runtime-input`.
- [x] Update expected widget action to run `sendAdaptedUserMessage({ userMessage, parts, errorMessage })` against a fake context.
- [x] Update expected question action to run `continueAssistantTurn(answer)` against a fake context.
- [x] Run focused BChat submit tests after implementation.

## Task 4: Implement Leaf Component Adaptation

- [x] Update `QuestionCard.vue` to emit `submit` with `createUserChoiceSubmitAction(answer)`.
- [x] Update `BubblePartWidget.vue` to create `ChatMessageWidgetResultPart`, create a user message with `create.userMessage`, and emit `createRuntimeUserMessageSubmitAction(...)`.
- [x] Keep existing widget mounted lifecycle and `widget-part-change` behavior unchanged.
- [x] Re-run the message bubble test and make it pass.

## Task 5: Replace Forwarding Chain

- [x] Update `MessageBubble.vue` to forward child `submit` events and remove `runtime-input` emit typing.
- [x] Update `ConversationView.vue` to forward `submit` and remove `runtime-input` emit typing.
- [x] Update `test/components/BChat/conversation-view.component.test.ts` if stubs or emitted names mention `runtime-input`.

## Task 6: Wire Top-Level Submitter

- [x] Update `src/components/BChat/index.vue` to listen for `@submit="chatSubmitter.submit"`.
- [x] Remove `handleChatUserChoiceSubmit`, `handleChatWidgetSubmit`, and `handleChatRuntimeInput`.
- [x] Keep `sendRuntimeUserMessage` as the normal runtime send helper used by text input and submitter hook.
- [x] Update `test/components/BChat/session-id-runtime.test.ts` to emit `submit` actions from the `ConversationViewStub`.

## Task 7: Remove Old Component Runtime Input Types

- [x] Search for `ChatMessageRuntimeInput`, `ChatMessageUserChoiceRuntimeInput`, and `ChatMessageWidgetResultRuntimeInput`.
- [x] Remove them from `types/chat.d.ts` if only the old BChat event chain used them.
- [x] Keep `AIUserChoiceAnswerData`, `ChatMessageWidgetSubmitPayload`, `ChatMessageWidgetResultPart`, and `ChatMessageWidgetSubmitResult`.

## Task 8: Verify And Document

- [x] Run focused tests:
  - `pnpm exec vitest run test/components/BChat/message-bubble.component.test.ts`
  - `pnpm exec vitest run test/components/BChat/conversation-view.component.test.ts`
  - `pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts`
- [x] Run type check: `pnpm exec tsc --noEmit`.
- [x] Update `changelog/2026-07-01.md` under `Changed`.
- [x] Do not commit; leave all changes in the working tree for the user to commit.
