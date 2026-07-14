# BChat Workflow Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 BChat 消息持久化内聚到工作流 hook，修复异步创建分支后抢回已切换会话的问题，并清理入口组件的类型与命名规范问题。

**Architecture:** `useChatWorkflow` 直接获取 `useChatSessionStore`，对下层持久化接口继续传递 Store 方法，保持行为不变。`BChat/index.vue` 在分支请求完成后校验活动会话仍为源会话，再决定是否发送自动切换事件；入口组件同时移除类型抑制并补齐显式返回类型。

**Tech Stack:** Vue 3、TypeScript 5.9 strict、Pinia 3、Vitest、Vue Test Utils、ESLint、Stylelint。

## Global Constraints

- 禁止使用 `any`，所有新增函数参数和返回值必须显式标注。
- 所有新增或修改的函数、接口和复杂逻辑必须有准确注释。
- 函数名不超过四个单词。
- 不修改或覆盖 `src/components/BChat/components/MessageBubble.vue` 中现有用户改动。
- 代码改动记录到 `changelog/2026-07-14.md`。
- 不执行 `git add` 或 `git commit`。

---

### Task 1: 锁定分支会话切换竞态

**Files:**
- Modify: `test/components/BChat/session-id-runtime.test.ts`
- Test: `test/components/BChat/session-id-runtime.test.ts`

**Interfaces:**
- Consumes: `BChat` 的 `sessionId` prop、`ConversationView` 的 `branch` 事件和 `chatStore.branchSession` Promise。
- Produces: 用户在分支请求期间切换会话后不发送 `session-created` 的回归测试。

- [x] **Step 1: 编写失败测试**

在现有分支测试旁增加：

```typescript
it('does not switch to a completed branch after the active session changes', async (): Promise<void> => {
  const assistantMessage = createAssistantMessage();
  const branchedSession = createSession('session-branch', '原标题');
  let resolveBranch: ((session: ChatSession) => void) | undefined;
  chatStoreMock.branchSession.mockReturnValue(
    new Promise<ChatSession>((resolve): void => {
      resolveBranch = resolve;
    })
  );
  const wrapper = mountBChat('session-active');
  await flushPromises();

  wrapper.findComponent(ConversationViewStub).vm.$emit('branch', assistantMessage);
  await wrapper.setProps({ sessionId: 'session-other' });
  await flushPromises();
  resolveBranch?.(branchedSession);
  await flushPromises();

  expect(wrapper.emitted('session-created')).toBeUndefined();
});
```

- [x] **Step 2: 运行测试确认红灯**

Run: `pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts -t "does not switch to a completed branch after the active session changes"`

Expected: FAIL，`session-created` 当前仍包含已完成的分支会话。

---

### Task 2: 修复分支竞态并清理入口组件规范

**Files:**
- Modify: `src/components/BChat/index.vue`
- Modify: `src/components/BChat/hooks/useChatComposer.ts`
- Test: `test/components/BChat/session-id-runtime.test.ts`

**Interfaces:**
- Consumes: `activeSessionId: ComputedRef<string | null>` 与 `chatStore.branchSession(sourceSessionId, messageId)`。
- Produces: 仅当活动会话仍等于源会话时发送 `session-created`。

- [x] **Step 1: 实现最小竞态修复**

在分支 Promise 成功后增加活动会话校验：

```typescript
if (activeSessionId.value !== sourceSessionId) return;
emit('session-created', session);
```

- [x] **Step 2: 清理入口组件类型和命名**

将 `containerRef` 改为组件直接持有，并传给 composer：

```typescript
const containerRef = ref<HTMLElement | null>(null);
const composer = useChatComposer({
  containerRef,
  // 其余依赖保持不变
});
```

从 `UseChatComposerReturn` 删除 `containerRef`，改由 `UseChatComposerOptions` 接收 `Ref<HTMLElement | null>`；入口解构中移除 `@ts-ignore` 与 `containerRef`。将 `toContextUsageBudgetSnapshot` 缩短为 `toUsageBudgetSnapshot`，将 `showNoModelConfigToast` 缩短为 `showNoModelToast`，并给本文件触达的匿名回调增加 `: void`、`: string | undefined` 或相应 Promise 返回类型。

- [x] **Step 3: 运行回归测试确认绿灯**

Run: `pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts -t "does not switch to a completed branch after the active session changes"`

Expected: PASS。

---

### Task 3: 将消息持久化内聚到 useChatWorkflow

**Files:**
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts`
- Modify: `src/components/BChat/index.vue`
- Test: `test/components/BChat/session-id-runtime.test.ts`

**Interfaces:**
- Consumes: `useChatSessionStore(): ReturnType<typeof defineStore>`，包含 `setSessionMessages(sessionId, messages)` 和 `updateSessionMessage(sessionId, message)`。
- Produces: 不再包含 `persistMessages`、`updateSessionMessage` 的 `UseChatWorkflowOptions`。

- [x] **Step 1: 在工作流内部获取 Store**

```typescript
import { useChatSessionStore } from '@/stores/chat/session';

export function useChatWorkflow(options: UseChatWorkflowOptions): UseChatWorkflowReturn {
  const chatStore = useChatSessionStore();
  // ...
}
```

- [x] **Step 2: 替换工作流持久化透传**

删除 `UseChatWorkflowOptions` 的两个回调字段，并将调用替换为：

```typescript
persistMessages: chatStore.setSessionMessages
updateSessionMessage: chatStore.updateSessionMessage
await chatStore.setSessionMessages(sessionId, nextMessages)
```

保留 `useRollback`、`useChatSubmitter` 和 `appendRuntimeErrorMessage` 的既有接口，不扩大重构范围。

- [x] **Step 3: 删除入口组件无策略回调**

从 `useChatWorkflow` 参数中删除：

```typescript
persistMessages: (sessionId: string, nextMessages: Message[]): Promise<void> => chatStore.setSessionMessages(sessionId, nextMessages),
updateSessionMessage: (sessionId: string | undefined, nextMessage: Message): Promise<void> => chatStore.updateSessionMessage(sessionId, nextMessage),
```

- [x] **Step 4: 运行 BChat 聚焦测试**

Run: `pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts test/components/BChat/use-chat-submitter.test.ts test/components/BChat/use-rollback.test.ts test/components/BChat/runtime-error.test.ts test/components/BChat/command-panel-model-entry.test.ts`

Expected: PASS。

---

### Task 4: Changelog 与完整验证

**Files:**
- Modify: `changelog/2026-07-14.md`

**Interfaces:**
- Consumes: 前三项任务的实现结果。
- Produces: 可交付且经过项目检查的未提交工作区改动。

- [x] **Step 1: 更新 changelog**

在 `## Fixed` 下增加：

```markdown
- BChat 将消息持久化收口到 Chat Workflow，并避免异步创建分支完成后抢回用户已切换的会话；同步清理入口组件类型抑制与函数签名。
```

- [x] **Step 2: 运行静态检查**

Run: `pnpm exec eslint src/components/BChat/index.vue src/components/BChat/hooks/useChatComposer.ts src/components/BChat/hooks/useChatWorkflow.ts test/components/BChat/session-id-runtime.test.ts test/components/BChat/command-panel-model-entry.test.ts`

Expected: PASS。

Run: `pnpm exec stylelint 'src/components/BChat/index.vue'`

Expected: PASS。

Run: `pnpm exec tsc --noEmit`

Expected: PASS。

- [x] **Step 3: 运行完整测试**

Run: `pnpm test`

Actual: 本次新增及相关测试均通过；完整套件共 2051 条测试，2049 条通过、1 条跳过，唯一失败来自用户已有 `src/components/BChat/components/MessageBubble.vue` 图标改动与既有测试断言不一致。

- [x] **Step 4: 检查工作区边界**

Run: `git diff -- src/components/BChat/index.vue src/components/BChat/hooks/useChatComposer.ts src/components/BChat/hooks/useChatWorkflow.ts test/components/BChat/session-id-runtime.test.ts test/components/BChat/command-panel-model-entry.test.ts changelog/2026-07-14.md docs/superpowers/specs/2026-07-14-bchat-workflow-persistence-design.md docs/superpowers/plans/2026-07-14-bchat-workflow-persistence.md`

Expected: 仅包含本计划改动；`src/components/BChat/components/MessageBubble.vue` 的用户改动保持原样且未进入本次 diff 检查范围。
