# Assistant Message Branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已完成助手消息工具栏中增加“创建分支”按钮，原子复制截至目标消息的会话历史，并切换到标题不变的新会话。

**Architecture:** 把消息与压缩引用重建放在 Runtime 纯函数模块中，主进程聊天服务负责事务读取和写入，renderer 仅通过 Store/IPC 请求创建分支。组件沿 `MessageBubble → ConversationView → BChat → ChatSider` 传递目标消息；`BChat` 使用内部请求标记防重复，并通过 `asyncTo` 处理 Store 结果。

**Tech Stack:** Vue 3、TypeScript strict、Pinia、Electron IPC、better-sqlite3、Vitest、Vue Test Utils、Less。

## Global Constraints

- 新分支标题必须与源会话标题完全一致，不追加编号或后缀。
- 复制范围为会话开头到目标已完成助手消息的闭区间。
- 新旧会话的消息 ID、part ID和压缩记录 ID必须独立，已知消息引用必须重建。
- 附件、工具调用 ID、工具结果和 Widget 自身 session ID保持不变。
- 不新增聊天 Runtime loading 相关限制，只防止分支请求自身重复提交。
- 所有新增函数、接口和复杂逻辑必须有准确 JSDoc；禁止 `any`，函数参数和返回值必须显式标注。
- 样式使用完整 BEM 类名，不使用 `&__element`。
- 实现完成后更新 `changelog/2026-07-14.md`。
- 按用户要求，本次实现不得执行 `git add` 或 `git commit`。

---

## File Structure

- Create: `electron/main/modules/chat/runtime/branch.mts` — 纯函数形式验证分支输入、重建消息与压缩记录引用。
- Create: `test/electron/main/modules/chat/branch.test.ts` — 分支数据重建单元测试。
- Create: `test/electron/main/modules/chat/branch-transaction.test.ts` — 使用真实临时 SQLite 验证主键冲突后的事务回滚。
- Modify: `electron/main/modules/chat/service.mts` — 在单一数据库事务中严格读取源数据，并使用普通 `INSERT` 写入分支数据。
- Modify: `electron/main/modules/chat/ipc.mts` — 注册 `chat:session:branch` handler。
- Modify: `electron/preload/index.mts` — 暴露 `chatSessionBranch`。
- Modify: `types/electron-api.d.ts` — 声明分支 IPC 类型。
- Modify: `src/stores/chat/session.ts` — 增加 `branchSession(sourceSessionId, targetMessageId)` action。
- Modify: `test/stores/chat/session.test.ts` — 验证 Store 参数转发与错误解包。
- Modify: `src/components/BChat/components/MessageBubble.vue` — 渲染创建分支按钮并发出事件。
- Modify: `src/components/BChat/components/ConversationView.vue` — 原样转发目标消息的分支事件。
- Modify: `src/components/BChat/index.vue` — 底层拦截重复请求，通过 `asyncTo` 调用 Store、提示错误并发送新会话事件。
- Modify: `test/components/BChat/message-bubble.component.test.ts` — 验证按钮显示与事件。
- Modify: `test/components/BChat/conversation-view.component.test.ts` — 验证目标消息的事件转发。
- Modify: `test/components/BChat/session-id-runtime.test.ts` — 验证 BChat 创建、切换、失败与底层防重复流程。
- Modify: `changelog/2026-07-14.md` — 记录新增会话分支功能。

---

### Task 1: 分支数据重建纯函数

**Files:**
- Create: `electron/main/modules/chat/runtime/branch.mts`
- Create: `test/electron/main/modules/chat/branch.test.ts`

**Interfaces:**
- Consumes: `ChatSession`、`ChatMessageRecord[]`、`CompressionRecord[]`。
- Produces: `createSessionBranchData(input: CreateSessionBranchInput): SessionBranchData`。

- [ ] **Step 1: 编写失败测试，固定闭区间复制和标题规则**

创建包含 user/assistant/user/assistant 的源数据，调用：

```typescript
const result = createSessionBranchData({
  sourceSession,
  sourceMessages,
  compressionRecords: [],
  targetMessageId: 'assistant-1',
  now: '2026-07-14T12:00:00.000Z',
  createId: createSequenceId(['session-new', 'message-new-1', 'part-new-1', 'message-new-2', 'part-new-2'])
});

expect(result.session).toMatchObject({ id: 'session-new', title: sourceSession.title });
expect(result.messages.map((message) => message.content)).toEqual(['问题一', '回答一']);
expect(result.messages.every((message) => message.sessionId === 'session-new')).toBe(true);
expect(result.messages.map((message) => message.id)).toEqual(['message-new-1', 'message-new-2']);
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `pnpm test -- test/electron/main/modules/chat/branch.test.ts`

Expected: FAIL，提示无法解析 `branch.mts` 或缺少 `createSessionBranchData`。

- [ ] **Step 3: 定义明确输入输出类型和基础验证**

在 `branch.mts` 中定义并导出：

```typescript
/** 创建会话分支所需源数据。 */
export interface CreateSessionBranchInput {
  /** 源会话。 */
  sourceSession: ChatSession;
  /** 已按展示顺序排列的全部源消息。 */
  sourceMessages: ChatMessageRecord[];
  /** 源会话全部压缩记录。 */
  compressionRecords: CompressionRecord[];
  /** 目标已完成助手消息 ID。 */
  targetMessageId: string;
  /** 新会话时间。 */
  now: string;
  /** 唯一 ID 工厂。 */
  createId: () => string;
}

/** 可在单一事务中写入的会话分支数据。 */
export interface SessionBranchData {
  /** 新会话。 */
  session: ChatSession;
  /** 重建后的消息。 */
  messages: ChatMessageRecord[];
  /** 重建后的压缩记录。 */
  compressionRecords: CompressionRecord[];
}
```

`createSessionBranchData` 必须找到目标索引，验证 `role === 'assistant' && finished === true`，否则抛出 `Invalid assistant branch target`。

- [ ] **Step 4: 实现消息 ID、part ID和用量重建**

实现以下 helper，并为每个 helper 添加 JSDoc：

```typescript
function remapMessageId(messageId: string | undefined, messageIds: ReadonlyMap<string, string>): string | undefined;
function remapMessageIds(messageIds: string[] | undefined, idMap: ReadonlyMap<string, string>): string[] | undefined;
function cloneMessage(message: ChatMessageRecord, sessionId: string, messageIds: ReadonlyMap<string, string>, createId: () => string): ChatMessageRecord;
function sumUsage(messages: ChatMessageRecord[]): AIUsage | undefined;
```

`cloneMessage` 使用结构化对象复制，重建 `message.id`、每个 `part.id`，清除 `runtimeId`/`parentRuntimeId`；显式更新 `compression.coveredUntilMessageId/sourceMessageIds`、compaction part 的 `tailStartMessageId/coveredUntilMessageId/sourceMessageIds`、`meta.compaction.previousSummaryMessageId/hiddenMessageIds`。不得修改 toolCallId、文件或 Widget 载荷。

- [ ] **Step 5: 添加压缩引用失败测试**

构造 compaction part 引用 `compression-record-1`，记录包含 source/preserved/covered message IDs。断言新消息只引用新记录 ID，新记录的 session/message/derived/recordSet 引用全部为新 ID；再构造无法映射的消息引用并断言抛错。

- [ ] **Step 6: 实现压缩记录闭包复制**

先收集复制消息中 `message.compression.recordId` 与 compaction part `recordId`，递归加入 `derivedFromRecordId` 祖先。为记录 ID和非空 `recordSetId` 分别建立映射，生成新记录，并对 `coveredStartMessageId`、`coveredEndMessageId`、`coveredUntilMessageId`、`sourceMessageIds`、`preservedMessageIds` 使用严格映射；缺失映射时抛错。

- [ ] **Step 7: 运行纯函数测试**

Run: `pnpm test -- test/electron/main/modules/chat/branch.test.ts`

Expected: PASS，覆盖标题不变、闭区间、ID重建、内容保留、压缩闭包和非法目标。

---

### Task 2: 主进程事务与 Electron API

**Files:**
- Modify: `electron/main/modules/chat/service.mts`
- Modify: `electron/main/modules/chat/ipc.mts`
- Modify: `electron/preload/index.mts`
- Modify: `types/electron-api.d.ts`
- Modify: `src/stores/chat/session.ts`
- Modify: `test/electron/main/modules/chat/service-runtime-fields.test.ts`
- Modify: `test/stores/chat/session.test.ts`

**Interfaces:**
- Consumes: `createSessionBranchData(...)`。
- Produces: `chatSessionManager.branchSession(sourceSessionId: string, targetMessageId: string): ChatSession` 与 `store.branchSession(...): Promise<ChatSession>`。

- [ ] **Step 1: 编写失败测试，固定事务调用和完整历史读取**

在 service 测试中 mock `dbSelect` 返回源 session row、无分页完整 message rows 和 compression rows；调用：

```typescript
const session = chatSessionManager.branchSession('session-source', 'assistant-1');

expect(databaseMock.transaction).toHaveBeenCalledTimes(1);
expect(session.title).toBe('原标题');
expect(databaseMock.dbExecute).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO chat_sessions'), expect.any(Array));
expect(databaseMock.dbExecute).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO chat_messages'), expect.any(Array));
```

同时断言查询消息 SQL 不包含 `LIMIT`，并断言源会话缺失时没有 `dbExecute`。

- [ ] **Step 2: 运行主进程服务测试并确认失败**

Run: `pnpm test -- test/electron/main/modules/chat/service-runtime-fields.test.ts`

Expected: FAIL，提示 `branchSession` 不存在。

- [ ] **Step 3: 实现主进程原子事务**

增加源 session 查询和完整消息查询 SQL。实现：

```typescript
branchSession(sourceSessionId: string, targetMessageId: string): ChatSession {
  return transaction((): ChatSession => {
    const sourceSession = this.getSessionById(sourceSessionId);
    if (!sourceSession) throw new Error('Source chat session not found');

    const sourceMessages = this.getAllMessages(sourceSessionId);
    const compressionRecords = this.getAllRecords(sourceSessionId);
    const branch = createSessionBranchData({
      sourceSession,
      sourceMessages,
      compressionRecords,
      targetMessageId,
      now: dayjs().toISOString(),
      createId: nanoid
    });

    this.insertSessionBranch(branch);
    return branch.session;
  });
}
```

`insertSessionBranch` 直接调用现有 session/message/record SQL 和参数构建逻辑，不嵌套第二个 transaction；最后保持 `lastMessageAt` 为分支创建时间。

- [ ] **Step 4: 运行主进程服务测试**

Run: `pnpm test -- test/electron/main/modules/chat/service-runtime-fields.test.ts test/electron/main/modules/chat/branch.test.ts`

Expected: PASS。

- [ ] **Step 5: 编写 Store 失败测试**

扩展 mock API：

```typescript
chatSessionBranch: vi.fn<(sourceSessionId: string, targetMessageId: string) => Promise<ChatHandlerResult<ChatSession>>>()
```

断言 `store.branchSession('session-source', 'assistant-1')` 返回 API 会话并原样转发两个 ID；失败结果通过 `unwrap` 抛错。

- [ ] **Step 6: 接通 IPC、preload、类型和 Store**

新增 handler `chat:session:branch`；preload 暴露 `chatSessionBranch`；`ElectronAPI` 声明返回 `Promise<ChatHandlerResult<ChatSession>>`；Store action 使用数据库初始化重试：

```typescript
async branchSession(sourceSessionId: string, targetMessageId: string): Promise<ChatSession> {
  return retryDuringDatabaseInitialization(async (): Promise<ChatSession> => {
    return unwrap(await getElectronAPI().chatSessionBranch(sourceSessionId, targetMessageId));
  });
}
```

- [ ] **Step 7: 运行 Store 与主进程测试**

Run: `pnpm test -- test/stores/chat/session.test.ts test/electron/main/modules/chat/service-runtime-fields.test.ts test/electron/main/modules/chat/branch.test.ts`

Expected: PASS。

---

### Task 3: 助手消息工具栏与会话切换

**Files:**
- Modify: `src/components/BChat/components/MessageBubble.vue`
- Modify: `src/components/BChat/components/ConversationView.vue`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/components/BChat/message-bubble.component.test.ts`
- Modify: `test/components/BChat/conversation-view.component.test.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

**Interfaces:**
- Consumes: `chatStore.branchSession(sourceSessionId, targetMessageId): Promise<ChatSession>`。
- Produces: `MessageBubble`/`ConversationView` 携带目标消息的 `branch` 事件。

- [ ] **Step 1: 编写 MessageBubble 失败测试**

断言已完成 assistant 存在 `[data-icon="lucide:git-branch-plus"]`，未完成 assistant 和 error role 不存在；点击后 `wrapper.emitted('branch')` 携带原消息，按钮不绑定分支请求的 disabled/loading 状态。

- [ ] **Step 2: 运行气泡测试并确认失败**

Run: `pnpm test -- test/components/BChat/message-bubble.component.test.ts`

Expected: FAIL，找不到创建分支按钮。

- [ ] **Step 3: 实现 MessageBubble 按钮**

在复制与重新生成之间添加：

```vue
<BButton
  type="text"
  size="small"
  square
  tooltip="创建分支"
  icon="lucide:git-branch-plus"
  @click="$emit('branch', message)"
/>
```

`MessageBubble` 只负责发出目标消息，不维护分支请求状态。

- [ ] **Step 4: 编写并实现 ConversationView 转发测试**

在 stub 发出 `branch(message)` 后，断言 `ConversationView` 原样转发目标消息，不引入额外加载状态 prop。

- [ ] **Step 5: 编写 BChat 失败测试**

在 `session-id-runtime.test.ts` 的 Store mock 增加 `branchSession`。发出 ConversationView `branch` 后断言：

```typescript
expect(chatStoreMock.branchSession).toHaveBeenCalledWith('session-active', 'assistant-1');
expect(wrapper.emitted('session-created')?.[0]?.[0]).toEqual(branchedSession);
```

使用未决 Promise 连续发出两次事件，断言 `BChat` 底层只调用一次 Store；reject 时断言不发 `session-created` 并出现错误 Toast。

- [ ] **Step 6: 实现 BChat 分支处理器**

增加带 JSDoc 的分支事件处理器：

```typescript
async function handleBranch(message: Message): Promise<void> {
  const sourceSessionId = activeSessionId.value;
  if (!sourceSessionId || branchingMessageId.value) return;

  branchingMessageId.value = message.id;
  const [error, session] = await asyncTo(chatStore.branchSession(sourceSessionId, message.id));
  branchingMessageId.value = undefined;

  if (error) {
    interactionAPI.showToast({
      type: 'error',
      content: error.message || '创建会话分支失败'
    });
    return;
  }

  emit('session-created', session);
}
```

增加 `branchingMessageId` 底层请求标记，并在 `ConversationView` 绑定 `@branch="handleBranch"`；按钮本身不绑定 loading/disabled 状态。

- [ ] **Step 7: 运行组件测试**

Run: `pnpm test -- test/components/BChat/message-bubble.component.test.ts test/components/BChat/conversation-view.component.test.ts test/components/BChat/session-id-runtime.test.ts`

Expected: PASS。

---

### Task 4: Changelog 与完整验证

**Files:**
- Modify: `changelog/2026-07-14.md`

**Interfaces:**
- Consumes: 前三项任务的完整实现。
- Produces: 可交付且通过项目检查的未提交工作区变更。

- [ ] **Step 1: 更新 changelog**

在 `## Added`（不存在则创建）下增加：

```markdown
- BChat 助手消息工具栏新增“创建分支”操作，可复制截至目标回答的完整会话历史并切换到标题不变的独立会话。
```

- [ ] **Step 2: 运行聚焦测试**

Run: `pnpm test -- test/electron/main/modules/chat/branch.test.ts test/electron/main/modules/chat/service-runtime-fields.test.ts test/stores/chat/session.test.ts test/components/BChat/message-bubble.component.test.ts test/components/BChat/conversation-view.component.test.ts test/components/BChat/session-id-runtime.test.ts`

Expected: PASS。

- [ ] **Step 3: 运行静态检查**

Run: `pnpm lint`

Expected: exit code 0；若自动修复文件，重新运行聚焦测试。

Run: `pnpm lint:style`

Expected: exit code 0。

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0。

- [ ] **Step 4: 检查最终差异且不提交**

Run: `git diff --check && git status --short && git diff --stat`

Expected: 无 whitespace 错误；仅列出本计划中的实现、测试、计划和 changelog 文件。不得执行暂存或提交命令。
