# BChat State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 XState v5 将 BChat 的聊天流程迁移到应用级 Actor 系统，使组件只负责 UI 绑定，并为多会话后台运行和子 Agent 建立稳定边界。

**Architecture:** `src/ai/chat` 提供无 Vue 依赖的 policies、Agent/Turn/Session/Supervisor machines 和 actor system；应用根级 hook 只注册一次 ChatRuntime IPC 事件并路由到 Supervisor；BChat hooks 订阅当前 Session actor，把 UI 操作转换为领域事件。Electron ChatRuntime 和 Pinia 继续负责模型执行与持久数据。

**Tech Stack:** TypeScript、Vue 3、Pinia、XState v5、`@xstate/vue`、Vitest、Electron IPC

**Commit policy:** 本计划执行期间不创建 Git commit，最终由用户统一提交。

---

## File Map

### AI 领域层

- Create: `src/ai/chat/types.ts` — Actor 地址、intent、错误和领域事件。
- Create: `src/ai/chat/policies/memorySelection.ts` — Memory 意图、引用和工具过滤纯策略。
- Create: `src/ai/chat/policies/regeneration.ts` — 重新生成消息边界纯策略。
- Create: `src/ai/chat/policies/runtimeRequest.ts` — Runtime 请求配置组合纯策略。
- Create: `src/ai/chat/machine/agentMachine.ts` — 单 Agent 生命周期。
- Create: `src/ai/chat/machine/turnMachine.ts` — 单 Turn 与 Agent 聚合。
- Create: `src/ai/chat/machine/sessionMachine.ts` — 会话级提交、继续、回退和压缩状态。
- Create: `src/ai/chat/machine/supervisorMachine.ts` — 多会话 Actor 注册和事件路由。
- Create: `src/ai/chat/machine/selectors.ts` — busy、abortable、waiting 等 selectors。
- Create: `src/ai/chat/actorSystem.ts` — 应用级 Actor system 创建、启动和查找接口。
- Create: `src/ai/chat/runtimeCapabilities.ts` — Runtime renderer 能力冻结、查找和释放。
- Create: `src/ai/chat/sessionEvents.ts` — 按 session 分发且不缓存消息的 UI 事件总线。
- Create: `src/ai/chat/index.ts` — 稳定公共导出。

### Vue 与 IPC 接入

- Create: `src/hooks/useChatActorSystem.ts` — 在应用根级启动、provide 和停止 Actor system。
- Create: `src/hooks/useChatRuntimeEvents.ts` — 全局 ChatRuntime 事件监听和 renderer 请求处理。
- Modify: `src/App.vue` — 挂载应用级 Chat Actor system。
- Modify: `src/components/BChat/hooks/useChatRuntime.ts` — 收敛为无监听器的 Runtime command adapter，最终删除会话过滤逻辑。
- Create: `src/components/BChat/hooks/useChatSessionActor.ts` — 当前 Session actor 的 Vue selectors 与事件 API。
- Create: `src/components/BChat/hooks/useRuntimeRequestConfig.ts` — Runtime 配置准备 IO actor。
- Create: `src/components/BChat/hooks/useChatComposer.ts` — 输入、图片、文件、语音和拖放组合。
- Create: `src/components/BChat/hooks/useChatNotifications.ts` — Toast、Provider 引导和错误展示。
- Modify: `src/components/BChat/index.vue` — 仅保留 UI refs、hook 组装和模板绑定。

### 迁移与清理

- Modify: `src/components/BChat/hooks/useChatSubmitter.ts` — 先改为 machine event adapter，最后删除旧任务控制。
- Modify: `src/components/BChat/hooks/useChatTaskRuntime.ts` — 迁移后删除或仅保留兼容导出。
- Modify: `src/components/BChat/hooks/useRuntimeCompactContext.ts` — 抽出压缩 IO，流程由 Session machine 控制。
- Modify: `src/components/BChat/hooks/useRollback.ts` — 抽出回退 IO，流程由 Session machine 控制。
- Modify: `src/components/BChat/hooks/useRuntimeConfig.ts` — 保留 Store 读取，策略计算迁入 `src/ai/chat/policies`。
- Modify: `src/components/BChat/hooks/useRuntimeTools.ts` — 保留工具实例创建，工具筛选迁入 policy。
- Modify: `changelog/2026-07-11.md` — 记录 BChat 状态机与多会话后台运行。

### 测试

- Create: `test/ai/chat/memory-selection.test.ts`
- Create: `test/ai/chat/regeneration.test.ts`
- Create: `test/ai/chat/agent-machine.test.ts`
- Create: `test/ai/chat/turn-machine.test.ts`
- Create: `test/ai/chat/session-machine.test.ts`
- Create: `test/ai/chat/supervisor-machine.test.ts`
- Create: `test/ai/chat/actor-system.test.ts`
- Create: `test/ai/chat/runtime-capabilities.test.ts`
- Create: `test/ai/chat/session-events.test.ts`
- Create: `test/ai/chat/runtime-request.test.ts`
- Create: `test/hooks/use-chat-runtime-events.test.ts`
- Create: `test/components/BChat/use-chat-session-actor.test.ts`
- Create: `test/components/BChat/use-runtime-request-config.test.ts`
- Create: `test/components/BChat/use-chat-composer.test.ts`
- Create: `test/components/BChat/use-chat-notifications.test.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`
- Modify: `test/components/BChat/use-runtime-tools.test.ts`

---

### Task 1: Add XState and Extract Pure Chat Policies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/ai/chat/types.ts`
- Create: `src/ai/chat/policies/memorySelection.ts`
- Create: `src/ai/chat/policies/regeneration.ts`
- Create: `test/ai/chat/memory-selection.test.ts`
- Create: `test/ai/chat/regeneration.test.ts`

- [ ] **Step 1: Install XState dependencies**

Run:

```bash
pnpm add xstate @xstate/vue
```

Expected: `package.json` contains both dependencies and `pnpm-lock.yaml` resolves compatible versions.

- [ ] **Step 2: Write failing policy tests**

Create tests covering these exact contracts:

```ts
const selection = createMemorySelection({
  content: '记住这个约定',
  messageReferences: ['/notes/a.md'],
  filePartReferences: ['/notes/b.md', '/notes/a.md'],
  workspaceRoot: '/workspace'
})

expect(selection).toEqual({
  userMessage: '记住这个约定',
  references: ['/notes/a.md', '/notes/b.md'],
  workspaceRoot: '/workspace',
  mode: 'full'
})

expect(findRegenerationStartIndex(messages, 'assistant-2')).toBe(2)
expect(createRegenerationSlice(messages, 'assistant-2')).toEqual({
  sourceMessages: messages.slice(0, 3),
  removedMessages: messages.slice(3)
})
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run test/ai/chat/memory-selection.test.ts test/ai/chat/regeneration.test.ts
```

Expected: FAIL because `src/ai/chat/policies/*` does not exist.

- [ ] **Step 4: Implement typed policy contracts**

Define `ChatActorAddress`, `ChatIntent`, `ChatWorkflowErrorCode` and policy inputs in `src/ai/chat/types.ts`. Implement:

```ts
export function createMemorySelection(input: MemorySelectionInput): MemorySelectionContext
export function filterMemoryTools(tools: AIToolExecutor[], mode: MemorySelectionContext['mode']): AIToolExecutor[]
export function findRegenerationStartIndex(messages: Message[], targetMessageId: string): number
export function createRegenerationSlice(messages: Message[], targetMessageId: string): RegenerationSlice | null
```

Move `MEMORY_EDIT_INTENT_PATTERNS`, reference de-duplication, `findLastUserMessage`, `filterRelevantMemoryTools` and regenerate slicing rules out of `BChat/index.vue`. Functions must not import Vue or stores.

- [ ] **Step 5: Run policy tests and existing BChat tests**

Run:

```bash
pnpm exec vitest run test/ai/chat/memory-selection.test.ts test/ai/chat/regeneration.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: PASS with existing BChat behavior unchanged.

---

### Task 2: Implement the Agent Machine

**Files:**
- Create: `src/ai/chat/machine/agentMachine.ts`
- Create: `src/ai/chat/machine/selectors.ts`
- Create: `test/ai/chat/agent-machine.test.ts`

- [ ] **Step 1: Write failing Agent transition tests**

Test the following sequence using `createActor(agentMachine, { input })`:

```text
queued --agent.start--> starting
starting --runtime.started--> running
running --runtime.userChoiceRequired--> waiting
waiting --agent.resume--> running
running --agent.cancel--> cancelling
cancelling --runtime.cancelled--> cancelled
```

Also assert that `runtime.completed` from `cancelled` and an event with a different `runtimeId` do not change state.

- [ ] **Step 2: Run the Agent test and verify RED**

Run:

```bash
pnpm exec vitest run test/ai/chat/agent-machine.test.ts
```

Expected: FAIL because `agentMachine` is missing.

- [ ] **Step 3: Implement a strongly typed XState v5 machine**

Use this input and context boundary:

```ts
interface AgentMachineInput {
  address: Omit<ChatActorAddress, 'runtimeId'>
}

interface AgentMachineContext {
  address: Omit<ChatActorAddress, 'runtimeId'>
  runtimeId?: string
  error?: ChatWorkflowError
}
```

Use `setup({ types: { context, input, events } })`. Add guards that reject Runtime events whose `runtimeId` differs from context. Tag `starting`, `running`, `waiting`, and `cancelling` as `busy`; tag `running`, `waiting` as `abortable`.

- [ ] **Step 4: Implement selectors**

Export pure selectors:

```ts
export const selectIsBusy = (snapshot: ChatMachineSnapshot): boolean => snapshot.hasTag('busy')
export const selectIsAbortable = (snapshot: ChatMachineSnapshot): boolean => snapshot.hasTag('abortable')
export const selectIsWaitingForUser = (snapshot: ChatMachineSnapshot): boolean => snapshot.matches('waiting')
```

- [ ] **Step 5: Run Agent tests**

Run:

```bash
pnpm exec vitest run test/ai/chat/agent-machine.test.ts
```

Expected: PASS.

---

### Task 3: Implement Turn and Session Machines

**Files:**
- Create: `src/ai/chat/machine/turnMachine.ts`
- Create: `src/ai/chat/machine/sessionMachine.ts`
- Create: `test/ai/chat/turn-machine.test.ts`
- Create: `test/ai/chat/session-machine.test.ts`

- [ ] **Step 1: Write failing Turn tests**

Cover:

```ts
turn.send({ type: 'turn.prepare', intent })
expect(turn.getSnapshot().matches('preparing')).toBe(true)

turn.send({ type: 'turn.prepared', request })
expect(turn.getSnapshot().matches('running')).toBe(true)
expect(selectAgentIds(turn.getSnapshot())).toEqual(['primary'])

turn.send({ type: 'agent.spawned', agentId: 'researcher', parentAgentId: 'primary' })
expect(selectAgentIds(turn.getSnapshot())).toEqual(['primary', 'researcher'])

turn.send({ type: 'turn.cancel' })
expect(turn.getSnapshot().matches('cancelling')).toBe(true)
```

Assert that all child Agent refs are stopped after `turn.cancelled`.

- [ ] **Step 2: Write failing Session tests**

Cover:

- `idle -> preparing -> running -> idle` for submit.
- Second `session.submit` is ignored while busy.
- `session.userChoiceSubmitted` from `waitingForUser` resumes the same Turn.
- `session.rollbackRequested` while running enters `rollingBack.cancellingActiveRuntime` before `applyingRollback`.
- Preparation failure restores `submit` to `idle`, `regenerate` to `idle`, and `continue` to `waitingForUser`.
- `session.compactRequested` is accepted only while idle.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run test/ai/chat/turn-machine.test.ts test/ai/chat/session-machine.test.ts
```

Expected: FAIL because Turn and Session machines are missing.

- [ ] **Step 4: Implement Turn machine**

The Turn context contains only IDs, intent, immutable request input, child refs and categorized error. Spawn the Primary Agent with ID `primary`; handle future `agent.spawned` using dynamic child IDs. Turn completion requires every required Agent to be terminal.

- [ ] **Step 5: Implement Session machine**

Create explicit states:

```text
idle
preparing
running
waitingForUser
cancelling
compacting
rollingBack.cancellingActiveRuntime
rollingBack.applyingRollback
cancelFailed
```

Use tags for `busy`, `acceptsInput`, and `abortable`. The machine emits commands through invoked actors; it must not import stores or Electron APIs.

- [ ] **Step 6: Run Turn and Session tests**

Run:

```bash
pnpm exec vitest run test/ai/chat/turn-machine.test.ts test/ai/chat/session-machine.test.ts
```

Expected: PASS.

---

### Task 4: Implement the Multi-Session Supervisor and Actor System

**Files:**
- Create: `src/ai/chat/machine/supervisorMachine.ts`
- Create: `src/ai/chat/actorSystem.ts`
- Create: `src/ai/chat/runtimeCapabilities.ts`
- Create: `src/ai/chat/sessionEvents.ts`
- Create: `src/ai/chat/index.ts`
- Create: `test/ai/chat/supervisor-machine.test.ts`
- Create: `test/ai/chat/actor-system.test.ts`
- Create: `test/ai/chat/runtime-capabilities.test.ts`
- Create: `test/ai/chat/session-events.test.ts`

- [ ] **Step 1: Write failing Supervisor tests**

Create two sessions and assert they run independently:

```ts
supervisor.send({ type: 'supervisor.ensureSession', sessionId: 'session-a' })
supervisor.send({ type: 'supervisor.ensureSession', sessionId: 'session-b' })
supervisor.send({ type: 'session.submit', sessionId: 'session-a', input })
supervisor.send({ type: 'session.submit', sessionId: 'session-b', input })

expect(selectSessionState(supervisor.getSnapshot(), 'session-a')).toMatch('preparing')
expect(selectSessionState(supervisor.getSnapshot(), 'session-b')).toMatch('preparing')
```

Also test runtime registration, routing, late-event rejection, session removal and complete Actor subtree cleanup.

Test capabilities and UI events separately:

- A Runtime continues using the tool/editor/Bridge capabilities captured at start after the visible session changes.
- Runtime completion removes its capabilities.
- Events emitted without an active UI subscriber are not cached.
- A subscriber only receives events for its own `sessionId`.

- [ ] **Step 2: Run Supervisor tests and verify RED**

Run:

```bash
pnpm exec vitest run test/ai/chat/supervisor-machine.test.ts test/ai/chat/actor-system.test.ts
```

Expected: FAIL because Supervisor and actor system are missing.

- [ ] **Step 3: Implement Supervisor context**

Use these maps:

```ts
interface SupervisorContext {
  sessions: Map<string, ActorRefFrom<typeof sessionMachine>>
  runtimeRoutes: Map<string, ChatActorAddress>
}
```

Handle `supervisor.ensureSession`, `supervisor.removeSession`, `runtime.register`, `runtime.unregister` and normalized `runtime.event`. A runtime event without a matching route must be ignored and logged through an injected action.

- [ ] **Step 4: Implement actor system factory**

Export:

```ts
export interface ChatActorSystem {
  actor: ActorRefFrom<typeof supervisorMachine>
  start(): void
  stop(): void
  ensureSession(sessionId: string): ActorRefFrom<typeof sessionMachine>
  getSession(sessionId: string): ActorRefFrom<typeof sessionMachine> | undefined
  send(event: ChatSupervisorEvent): void
  registerRuntimeCapabilities(runtimeId: string, capabilities: RuntimeExecutionCapabilities): void
  getRuntimeCapabilities(runtimeId: string): RuntimeExecutionCapabilities | undefined
  subscribeSessionEvents(sessionId: string, listener: ChatSessionUIEventListener): () => void
}

export function createChatActorSystem(dependencies: ChatActorSystemDependencies): ChatActorSystem
```

The factory provides IO actors/actions to the machine, owns the single Supervisor actor, stores non-serializable Runtime capabilities outside machine context, and owns the session UI event bus.

- [ ] **Step 5: Run Supervisor tests**

Run:

```bash
pnpm exec vitest run test/ai/chat/supervisor-machine.test.ts test/ai/chat/actor-system.test.ts test/ai/chat/runtime-capabilities.test.ts test/ai/chat/session-events.test.ts
```

Expected: PASS.

---

### Task 5: Lift Runtime Events to the Application Root

**Files:**
- Create: `src/hooks/useChatActorSystem.ts`
- Create: `src/hooks/useChatRuntimeEvents.ts`
- Modify: `src/App.vue`
- Modify: `src/components/BChat/hooks/useChatRuntime.ts`
- Create: `test/hooks/use-chat-runtime-events.test.ts`

- [ ] **Step 1: Write failing global event routing tests**

Mock two registered Runtime IDs in different sessions. Emit message, completion, error, context usage, tool, confirmation and bridge events. Assert each event reaches the matching Session/Agent even when that session is not currently visible.

Explicitly assert that background renderer tool requests no longer fail with `当前会话已切换` solely because BChat changed sessions.

Register different tool/editor/Bridge capabilities for both Runtime IDs and assert each request uses its own captured capabilities. Confirmation without remembered permission must enter the target Agent's waiting state and remain available when that session is opened.

- [ ] **Step 2: Run the event tests and verify RED**

Run:

```bash
pnpm exec vitest run test/hooks/use-chat-runtime-events.test.ts
```

Expected: FAIL because global hooks are missing.

- [ ] **Step 3: Implement the application-level provider**

`useChatActorSystem` creates the Actor system once, provides it through a typed `InjectionKey`, starts it from `App.vue`, and stops it only when the application root scope is disposed.

Export:

```ts
export function useProvideChatActorSystem(): ChatActorSystem
export function useChatActorSystem(): ChatActorSystem
```

- [ ] **Step 4: Implement global Runtime event routing**

Move all `chatRuntimeOn*` subscriptions from `useChatRuntime` into `useChatRuntimeEvents`. Normalize every IPC event into a `runtime.event` domain event and route by registered `runtimeId`.

Renderer-local tool, confirmation and bridge requests must resolve dependencies by Actor address and Session capabilities, not by current BChat `sessionId`.

Message and context-usage events are also published to the session UI event bus. The global hook must not retain hidden-session message bodies.

Captured editor tools must resolve context by the Runtime's document ID, not `editorToolContextRegistry.getCurrentContext()`. Bridge handlers must be created at application scope and must not close over BChat component refs.

- [ ] **Step 5: Reduce `useChatRuntime` to commands**

Keep only cloneable command conversion and methods:

```ts
send(input)
continueTurn(input)
submitUserChoice(input)
submitMessagePart(input)
abort(runtimeId)
```

Remove component-scoped IPC subscriptions, `activeRuntimeId`, `abortedRuntimeIds`, and current-session event filters.

- [ ] **Step 6: Run global event and Runtime regression tests**

Run:

```bash
pnpm exec vitest run test/hooks/use-chat-runtime-events.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: PASS.

---

### Task 6: Move Runtime Request Preparation into an Invoked Actor

**Files:**
- Create: `src/ai/chat/policies/runtimeRequest.ts`
- Create: `src/components/BChat/hooks/useRuntimeRequestConfig.ts`
- Modify: `src/components/BChat/hooks/useRuntimeConfig.ts`
- Modify: `src/components/BChat/hooks/useRuntimeTools.ts`
- Modify: `src/components/BChat/index.vue`
- Create: `test/ai/chat/runtime-request.test.ts`
- Create: `test/components/BChat/use-runtime-request-config.test.ts`

- [ ] **Step 1: Write failing request policy tests**

Assert that the policy:

- Filters `edit_memory` in relevant mode.
- Retains it in full mode.
- Produces transport tools only when provider tool support is enabled.
- Includes current Skill hashes, workspace root, Tavily and MCP configuration.
- Returns typed debug information without logging inside the pure policy.

- [ ] **Step 2: Run request tests and verify RED**

Run:

```bash
pnpm exec vitest run test/ai/chat/runtime-request.test.ts test/components/BChat/use-runtime-request-config.test.ts
```

Expected: FAIL because the policy and hook are missing.

- [ ] **Step 3: Implement pure request assembly**

Export a pure function:

```ts
export function buildRuntimeRequestConfig(input: RuntimeRequestPolicyInput): RuntimeRequestPolicyResult
```

It receives already-resolved service support, system prompt, tools and resource versions. It does not read stores or call logger.

- [ ] **Step 4: Implement the IO hook**

`useRuntimeRequestConfig` performs Store and service IO:

1. Resolve provider config.
2. Synchronize AI resources.
3. Resolve active tools.
4. Build Memory selection.
5. Resolve system prompt, Tavily and MCP.
6. Call the pure policy.
7. Emit debug logs through injected logger.

Return an actor-compatible async function accepting `AbortSignal` and `ChatIntent`.

Update `useRuntimeTools` so pending-question lookup comes from the Session/Turn actor capability instead of the BChat-local `messages` ref. Runtime capabilities returned by preparation include a frozen tool list, document ID and application-scope Bridge handler.

- [ ] **Step 5: Wire request preparation into Session/Turn actors**

Replace `resolveChatRuntimeRequestConfig` in BChat with the injected `prepareRuntimeRequest` actor. Model-not-configured is a categorized `preparationFailed` result consumed by `useChatNotifications`.

- [ ] **Step 6: Run request and BChat tests**

Run:

```bash
pnpm exec vitest run test/ai/chat/runtime-request.test.ts test/components/BChat/use-runtime-request-config.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: PASS.

---

### Task 7: Migrate Submit, Continue and Regenerate Flows

**Files:**
- Create: `src/components/BChat/hooks/useChatSessionActor.ts`
- Modify: `src/components/BChat/hooks/useChatSubmitter.ts`
- Modify: `src/components/BChat/hooks/useChatTaskRuntime.ts`
- Modify: `src/components/BChat/index.vue`
- Create: `test/components/BChat/use-chat-session-actor.test.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

- [ ] **Step 1: Write failing Session actor hook tests**

Assert:

- `submit(input)` sends `session.submit` to the current Session actor.
- `continueWithAnswer(answer)` resumes the existing Turn.
- `regenerate(messageId)` sends a regenerate intent and restores removed messages on preparation/start failure.
- Switching `sessionId` changes selector subscription without stopping the previous actor.
- Switching `sessionId` unsubscribes the old UI event bus listener, loads current persisted messages, then subscribes to the new session's incremental events.
- `loading` is derived from machine tags.

- [ ] **Step 2: Run the hook test and verify RED**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-chat-session-actor.test.ts
```

Expected: FAIL because `useChatSessionActor` is missing.

- [ ] **Step 3: Implement `useChatSessionActor`**

Use `@xstate/vue` selectors to expose:

```ts
interface UseChatSessionActorReturn {
  loading: ComputedRef<boolean>
  waitingForUser: ComputedRef<boolean>
  activeRuntimeId: ComputedRef<string | undefined>
  submit(input: ChatSubmitInput): void
  continueWithAnswer(answer: AIUserChoiceAnswerData): void
  regenerate(targetMessageId: string): void
  cancel(): void
  compact(): void
  rollback(targetMessageId: string): void
}
```

The hook must resubscribe when `activeSessionId` changes and must not stop Session actors on scope disposal.

- [ ] **Step 4: Convert submitter to an event adapter**

Keep message-part UI updates, but replace task begin/finish and direct Runtime calls with Session actor events. Remove duplicate loading checks now represented by guards.

- [ ] **Step 5: Remove migrated component logic**

Delete from BChat:

- `RuntimeUserMessageSendInput`.
- `resolveChatRuntimeRequestConfig`.
- `findRuntimeRegenerateStartIndex`.
- `startRuntimeRegenerate`.
- `handleChatRegenerate` control flow.
- `sendRuntimeUserMessage` control flow.
- `submitUserTextMessage` task begin/finish logic.

Keep thin handlers that build UI input and call the Session actor hook.

- [ ] **Step 6: Run submit/regenerate regression tests**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-chat-session-actor.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: PASS.

---

### Task 8: Migrate Cancellation, Rollback and Compaction

**Files:**
- Modify: `src/components/BChat/hooks/useRuntimeCompactContext.ts`
- Modify: `src/components/BChat/hooks/useRollback.ts`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/components/BChat/session-id-runtime.test.ts`
- Modify: `test/components/BChat/runtime-compact-context.test.ts`
- Modify: `test/components/BChat/use-rollback.test.ts`

- [ ] **Step 1: Add failing cancellation and rollback tests**

Cover:

- Cancel enters `cancelling` and remains busy until Electron abort resolves.
- Abort failure enters `cancelFailed` and retains `runtimeId`.
- Pending user choice cancellation persists an interrupt message before returning idle.
- Rollback while running cancels the Turn first.
- Late Runtime events after rollback are ignored by Supervisor routing.
- Compact is rejected while Session is busy and is independently abortable.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run test/ai/chat/session-machine.test.ts test/components/BChat/runtime-compact-context.test.ts test/components/BChat/use-rollback.test.ts
```

Expected: FAIL on the new machine-driven expectations.

- [ ] **Step 3: Extract rollback and compact IO actors**

Keep persistence and Electron calls as typed async adapters. Remove state ownership from `useRollback` and `useRuntimeCompactContext`; each adapter returns a structured success or throws a categorized error.

- [ ] **Step 4: Wire IO actors into Session machine**

Use invoked actors for `abortRuntime`, `cancelPendingChoice`, `applyRollback`, `runCompaction` and `abortCompaction`. Every invocation must define `onDone` and `onError`.

- [ ] **Step 5: Remove component runtime-ignore and task state**

Delete `rollbackIgnoredRuntimeIds`, `abortRuntimeChatTask`, `abortPendingUserChoiceIfNeeded`, `useChatTaskRuntime` usage and direct compact/rollback task transitions from BChat.

- [ ] **Step 6: Run cancellation, rollback and compact regressions**

Run:

```bash
pnpm exec vitest run test/ai/chat/session-machine.test.ts test/components/BChat/session-id-runtime.test.ts test/components/BChat/runtime-compact-context.test.ts test/components/BChat/use-rollback.test.ts
```

Expected: PASS.

---

### Task 9: Extract UI Composition and Shrink BChat

**Files:**
- Create: `src/components/BChat/hooks/useChatComposer.ts`
- Create: `src/components/BChat/hooks/useChatNotifications.ts`
- Create: `src/components/BChat/hooks/useChatViewBindings.ts`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

- [ ] **Step 1: Write failing hook contract tests**

Assert that:

- Composer combines text, image, file drop, paste and voice inputs without owning Session state.
- Notifications map `modelNotConfigured`, preparation errors and Runtime errors to existing Toast/Router behavior.
- View bindings expose template props and actions without AI policy logic.

- [ ] **Step 2: Run hook tests and verify RED**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-chat-composer.test.ts test/components/BChat/use-chat-notifications.test.ts
```

Expected: FAIL because the hooks are missing.

- [ ] **Step 3: Implement UI hooks**

Move prompt refs, input state, image/file/voice composition, model configuration guidance and UI-only computed values into focused hooks. Do not move DOM refs or Toast VNodes into `src/ai`.

- [ ] **Step 4: Reduce BChat to composition**

The final setup should read in this order:

```text
props/emits
UI refs and interaction provider
session actor binding
composer binding
runtime/view binding
template event aliases
lifecycle-only focus/load actions
```

BChat must not import Memory types, AI tool policy constants, Runtime transport conversion, Electron Runtime commands or XState machine definitions directly.

- [ ] **Step 5: Enforce the line and boundary target**

Run:

```bash
wc -l src/components/BChat/index.vue
rg -n "MemorySelection|EDIT_MEMORY_TOOL_NAME|rollbackIgnoredRuntimeIds|beginTask|finishTask|chatRuntimeSend" src/components/BChat/index.vue
```

Expected: total line count is approximately 500 or fewer; the forbidden strategy identifiers have no matches.

- [ ] **Step 6: Run BChat component regressions**

Run:

```bash
pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts test/components/BChat
```

Expected: PASS.

---

### Task 10: Cleanup, Documentation and Full Verification

**Files:**
- Modify/Delete: obsolete files under `src/components/BChat/hooks/`
- Modify: `changelog/2026-07-11.md`
- Modify: `docs/superpowers/plans/2026-07-11-bchat-state-machine.md`

- [ ] **Step 1: Remove obsolete compatibility code**

Delete hooks only after `rg` confirms no imports. Remove stale types, comments and tests that validate deleted implementation details. Preserve public component behavior and existing runtime bridge utilities still used by global event handling.

- [ ] **Step 2: Update changelog**

Add one `Changed` entry describing XState orchestration, BChat slimming and background session execution. Preserve unrelated entries already present in the file.

- [ ] **Step 3: Run all focused tests**

Run:

```bash
pnpm exec vitest run test/ai/chat test/hooks/use-chat-runtime-events.test.ts test/components/BChat
```

Expected: PASS.

- [ ] **Step 4: Run repository checks**

Run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
git diff --check
```

Expected: all commands exit with code 0.

- [ ] **Step 5: Review the final worktree without committing**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the state-machine refactor, dependency files, tests, spec, plan and changelog are changed; no commit is created.
