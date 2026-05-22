# 2026-05-22 Main Process Chat Persistence Design

## Summary

当前聊天会话与消息的实际 SQLite 写入发生在 Electron 主进程，但业务编排仍由渲染进程触发：`useChatSessionStore` 将组件消息转换为记录，然后通过 `src/shared/storage/chats/sqlite.ts` 调用通用 `db:execute` / `db:select` IPC 执行业务 SQL。

本设计将聊天持久化升级为主进程领域服务。主进程提供 `chat:*` 业务 IPC，统一负责会话、消息、usage 与事务一致性；渲染进程保留 Pinia store 作为 UI 状态与调用适配层，不再直接拼接或持有聊天业务 SQL。

这不是一次简单的文件搬迁，而是一次边界收口：

- 主进程负责持久化事实、事务、数据库兼容与后续后台任务写入。
- 渲染进程负责输入、展示、流式 UI 状态、确认交互与滚动等短生命周期状态。
- 第一阶段不迁移 `useChatStream` 流式状态机，不改变聊天 UI 的对外行为。

## Background

项目正在向更复杂的 AI 对话能力演进：工具调用、MCP、Tavily、文件引用、图片输入、用户确认、上下文压缩、自动命名、后台流式任务等能力都围绕聊天会话与消息展开。

当前代码的职责分布是：

- `src/components/BChatSidebar/index.vue` 组合聊天 UI、输入、工具、上下文压缩和流式对话。
- `src/components/BChatSidebar/hooks/useChatStream.ts` 管理流式消息、工具续轮、用户选择与重新生成。
- `src/stores/chat/session.ts` 管理会话读取、创建、追加消息、替换消息、usage 汇总。
- `src/shared/storage/chats/sqlite.ts` 在渲染进程侧封装聊天 SQL，并通过通用数据库 IPC 执行。
- `electron/main/modules/database/service.mts` 持有真实 SQLite 连接。

这个模式短期可用，但长期会放大三个问题：

1. 渲染进程知道聊天数据库结构与 SQL 语义，领域边界偏薄。
2. 复合写入不是一个主进程事务，例如追加消息后还要更新会话时间与 usage。
3. 未来主进程 AI 任务、后台压缩、多窗口或恢复逻辑需要写聊天数据时，会绕回渲染进程或复制同一套规则。

## Goals

- 将聊天会话和消息持久化收口到主进程领域服务。
- 渲染进程不再通过通用数据库 IPC 执行聊天业务 SQL。
- 保持 `useChatSessionStore` 对组件的现有调用接口基本不变，降低迁移面。
- 将 `addSessionMessage`、`setSessionMessages`、`deleteSession` 等复合写入改为主进程事务。
- 为未来主进程 AI 流式任务、后台自动命名、自动压缩和多窗口同步提供稳定写入入口。
- 保留现有消息结构：`parts`、`thinking`、`files`、`usage`、`compression`。
- 保留现有历史分页语义：按 `createdAt` 和 `id` 游标读取更早消息。
- 在第一阶段不改变 UI 行为、不改变数据库表结构、不迁移流式状态机。

## Non-Goals

- 第一阶段不把 `useChatStream` 整体迁移到主进程。
- 第一阶段不让应用退出后继续运行未完成的 AI 流式任务。
- 第一阶段不设计云同步、多设备同步或远程协作。
- 第一阶段不重构所有 SQLite 存储模块，只处理聊天领域。
- 第一阶段不移除通用 `db:execute` / `db:select`，只停止聊天存储路径继续依赖它。
- 第一阶段不改变 `chat_sessions` 和 `chat_messages` 表结构。
- 第一阶段不引入 ORM。

## Design Principle

长期边界采用以下原则：

| 层级 | 主要职责 | 不负责 |
|------|----------|--------|
| 主进程 Chat Service | 会话、消息、usage、事务、数据库兼容、领域级校验 | UI 滚动、输入框、消息动画、确认卡片展示 |
| 渲染进程 Store | UI 可消费的状态、调用主进程 chat API、把 record 映射为组件消息 | SQL、事务、数据库 fallback、跨窗口写入协调 |
| BChatSidebar Hooks | 流式 UI 状态、工具续轮、本地确认、上下文压缩触发 | 直接写数据库、处理数据库事务 |
| Database Service | SQLite 连接、迁移、底层执行能力 | 聊天业务规则 |

核心判断标准：如果一段逻辑表达“什么数据是真实的”，它应该进入主进程；如果一段逻辑表达“用户当前看到什么、正在操作什么”，它应该留在渲染进程。

## Current Problems

### Renderer Knows Business SQL

`src/shared/storage/chats/sqlite.ts` 存放了聊天表 SQL、row mapper、分页规则、usage 累加、fallback 存储。虽然真实 SQLite 在主进程，但渲染进程仍然拥有领域 SQL。

这让主进程无法直接复用聊天写入规则。未来如果 `electron/main/modules/ai` 想在流式完成后直接写 assistant 消息，必须重新实现同样的记录转换、usage 维护和时间更新逻辑。

### Composite Writes Are Not Atomic

`addSessionMessage` 现在包含多步：

1. 写入 `chat_messages`
2. 更新 `chat_sessions.last_message_at`
3. 如果有 usage，累加 `chat_sessions.usage_json`

任一步失败都可能留下不一致状态。`setSessionMessages` 也有类似风险：先删除会话消息，再批量写入，再更新 usage 和 lastMessageAt。

### Generic DB IPC Is Too Broad

`db:execute` 和 `db:select` 对渲染进程暴露任意 SQL 执行能力。作为内部桌面应用短期可接受，但可持续架构应该逐步把业务访问迁移到领域 IPC。

### Fallback Is Mixed With Desktop Runtime Logic

聊天存储里有 `localStorage` fallback。它对测试或 Web 运行可能有价值，但 Electron 桌面主路径不应由渲染端 fallback 决定。迁移后需要明确 fallback 的归属：生产 Electron 使用主进程 SQLite，非 Electron 环境使用 renderer adapter 或测试 mock。

## Target Architecture

新增主进程聊天模块：

```text
electron/main/modules/chat/
├── ipc.mts            # 注册 chat:* IPC handler
├── service.mts        # ChatService：领域操作、事务、业务校验
├── repository.mts     # ChatRepository：SQL 与 row mapper
├── mapper.mts         # JSON 字段、row -> record、record -> params
└── types.mts          # 主进程内部输入输出类型
```

渲染进程新增或替换聊天 client：

```text
src/shared/storage/chats/
├── index.ts           # 导出 chatStorage
├── electron.ts        # 调用 window.electronAPI.chat*
└── memory.ts          # 可选：非 Electron / 测试 fallback
```

Pinia store 仍在：

```text
src/stores/chat/session.ts
```

它继续提供当前组件依赖的 action：

- `getSessionMessages`
- `getSessions`
- `getSessionUsage`
- `createSession`
- `addSessionMessage`
- `setSessionMessages`
- `updateSessionTitle`
- `deleteSession`

但这些 action 不再负责数据库事务；它们只负责：

- 生成 UI 层需要的默认字段。
- 过滤不可持久化消息。
- 将主进程返回的 record 补为组件消息，例如 `finished: true`。
- 在必要时保持旧调用方兼容。

## IPC API

主进程提供领域 IPC，命名使用 `chat:` 前缀。

### Session APIs

```ts
interface ChatCreateSessionInput {
  session: ChatSession;
}

interface ChatListSessionsInput {
  type: ChatSessionType;
  pagination?: SessionPaginationParams;
}

interface SessionCursor {
  /** 当前页最后一个会话的最后消息时间。 */
  lastMessageAt: string;
  /** 当前页最后一个会话的创建时间。 */
  createdAt: string;
}

interface SessionPaginationParams {
  /** 每页数量。 */
  limit?: number;
  /** 上一页返回的游标。 */
  cursor?: SessionCursor;
}

interface ChatUpdateSessionTitleInput {
  sessionId: string;
  title: string;
}

interface ChatDeleteSessionInput {
  sessionId: string;
}
```

IPC：

```ts
chat:sessions:create(input: ChatCreateSessionInput): Promise<ChatSession>
chat:sessions:list(input: ChatListSessionsInput): Promise<PaginatedSessionsResult>
chat:sessions:update-title(input: ChatUpdateSessionTitleInput): Promise<void>
chat:sessions:delete(input: ChatDeleteSessionInput): Promise<void>
chat:usage:get(input: { sessionId: string }): Promise<AIUsage | undefined>
```

### Message APIs

```ts
interface ChatListMessagesInput {
  sessionId: string;
  cursor?: ChatMessageHistoryCursor;
}

interface ChatAddMessageInput {
  sessionId: string;
  message: ChatMessageRecord;
}

interface ChatSetMessagesInput {
  sessionId: string;
  messages: ChatMessageRecord[];
}
```

IPC：

```ts
chat:messages:list(input: ChatListMessagesInput): Promise<ChatMessageRecord[]>
chat:messages:add(input: ChatAddMessageInput): Promise<void>
chat:messages:set(input: ChatSetMessagesInput): Promise<void>
```

### Why Domain Inputs Instead Of SQL

领域输入让主进程可以维护不变量：

- `sessionId` 不能为空。
- `message.sessionId` 必须与输入 `sessionId` 一致。
- `message.role` 必须属于允许集合。
- `addMessage` 必须验证 session 存在，避免产生孤儿消息。
- JSON 字段统一序列化。
- usage 只能通过消息 usage 或 set messages 汇总更新。
- 删除会话必须同时删除消息。

这些规则不应该散落在渲染进程和 SQL 调用点。

## Main Process Service Contract

主进程 `ChatService` 提供下列方法：

```ts
class ChatService {
  listSessions(input: ChatListSessionsInput): PaginatedSessionsResult;
  createSession(input: ChatCreateSessionInput): ChatSession;
  updateSessionTitle(input: ChatUpdateSessionTitleInput): void;
  deleteSession(input: ChatDeleteSessionInput): void;
  getSessionUsage(sessionId: string): AIUsage | undefined;
  listMessages(input: ChatListMessagesInput): ChatMessageRecord[];
  addMessage(input: ChatAddMessageInput): void;
  setMessages(input: ChatSetMessagesInput): void;
}
```

`service.mts` 负责事务与业务编排，`repository.mts` 只负责 SQL。`listMessages` 的返回顺序必须与现有行为一致：按 `createdAt ASC, id ASC` 返回，避免历史加载、重新生成和上下文转换出现顺序回退。

## Transaction API

`better-sqlite3` 是同步数据库 API，事务也应保持在主进程同步调用栈内完成。第一阶段不设计 `db:transaction` IPC，也不允许通过 IPC 传递回调函数。

数据库服务暴露同步事务包装：

```ts
export function runTransaction<T>(operation: () => T): T {
  if (!db) throw new Error('Database not initialized');
  return db.transaction(operation)();
}
```

`ChatService` 方法保持同步，并在 `chat:*` IPC handler 内作为一个完整领域操作被调用：

```ts
ipcMain.handle('chat:messages:add', (_event, input: ChatAddMessageInput) => {
  chatService.addMessage(input);
});
```

这样 `addMessage` 可以在一个事务内完成 `SELECT session`、写消息、读取当前 usage、计算新 usage、更新 session；`setMessages` 也可以在一个事务内完成删除、批量写入、usage 重算和会话时间更新。

### Transaction Rules

`addMessage` 必须在一个事务中完成：

```text
BEGIN
  SELECT chat_sessions WHERE id = ?
  IF session does not exist:
    THROW
  INSERT OR REPLACE INTO chat_messages
  UPDATE chat_sessions.last_message_at
  IF message.usage:
    SELECT current usage_json
    UPDATE chat_sessions.usage_json
COMMIT
```

`setMessages` 必须在一个事务中完成：

```text
BEGIN
  DELETE chat_messages WHERE session_id = ?
  INSERT OR REPLACE each message
  UPDATE chat_sessions.last_message_at to latest message createdAt, if messages non-empty
  UPDATE chat_sessions.usage_json to sum(messages.usage)
  IF messages is empty:
    UPDATE chat_sessions.usage_json to NULL
COMMIT
```

`deleteSession` 必须在一个事务中完成：

```text
BEGIN
  DELETE chat_messages WHERE session_id = ?
  DELETE chat_sessions WHERE id = ?
COMMIT
```

`createSession` 第一阶段接受渲染端生成的完整 `ChatSession`，并执行单条 `INSERT OR REPLACE`。这样可以保持 `useChatSessionStore.createSession()` 的现有行为和返回语义不变，降低迁移风险。未来 AI task 需要主进程创建会话时，再新增主进程生成 ID 的独立 API 或扩展输入。

## Data Mapping

数据库表结构保持不变：

```text
chat_sessions(
  id,
  type,
  title,
  created_at,
  updated_at,
  last_message_at,
  usage_json
)

chat_messages(
  id,
  session_id,
  role,
  content,
  parts_json,
  thinking,
  files_json,
  usage_json,
  compression_json,
  created_at
)
```

主进程 mapper 负责：

- `usage_json` <-> `AIUsage`
- `parts_json` <-> `ChatMessagePart[]`
- `files_json` <-> `ChatMessageFile[] | undefined`
- `compression_json` <-> `ChatCompressionMeta | undefined`
- snake_case row <-> camelCase record

渲染进程不再知道这些列名。

## Renderer Store Compatibility

`useChatSessionStore` 的调用方不应在第一阶段大改。store 继续保留当前 action 名称。

### createSession

迁移前：

```ts
const now = dayjs().toISOString();
const session: ChatSession = {
  id: nanoid(),
  type,
  title,
  createdAt: now,
  updatedAt: now,
  lastMessageAt: now
};
await chatStorage.createSession(session);
return session;
```

迁移后：

```ts
await chatStorage.createSession(session);
return session;
```

第一阶段保留渲染端生成 `id`、`createdAt`、`updatedAt`、`lastMessageAt`。主进程负责校验和写入，不改动调用方对返回值的预期。主进程生成会话 ID 属于后续 AI task 集成阶段的扩展，不进入本阶段。

### addSessionMessage

store 仍负责过滤组件消息：

```ts
if (!sessionId) return;
if (!is.persistableMessage(message)) return;
await chatStorage.addMessage(sessionId, toRecordMessage(sessionId, message));
```

usage 累加和 lastMessageAt 更新迁到主进程。

### setSessionMessages

store 仍负责：

- 过滤 `is.persistableMessage`
- 将组件消息转成 `ChatMessageRecord[]`

主进程负责：

- 删除旧消息
- 批量 `INSERT OR REPLACE`
- 重新计算 usage
- 更新 lastMessageAt

主进程必须重新计算 usage，避免渲染端与主进程出现两套汇总规则。第一阶段将 `sumMessagesUsage` 迁到主进程。

迁移后的 `sumMessagesUsage` 接收 `ChatMessageRecord[]`，不再接收组件层的 `PersistableMessage[]`。它放在主进程 mapper/usage helper 中，由 `service.mts` 调用，只读取 record 上的 `usage` 字段：

```ts
function sumMessageRecordsUsage(messages: ChatMessageRecord[]): AIUsage | undefined
```

### Removed Storage Methods

以下旧 `chatStorage` 方法不再作为独立领域 API 暴露，它们被合并进事务性操作：

| 旧 `chatStorage` 方法 | 归宿 |
|-----------------------|------|
| `updateSessionLastMessageAt` | 合并进 `chat:messages:add` 和 `chat:messages:set` 事务 |
| `addSessionUsage` | 合并进 `chat:messages:add` 事务 |
| `updateSessionUsage` | 合并进 `chat:messages:set` 事务 |

渲染端 store 不再直接调用这些方法。

## Electron API Typing

`types/electron-api` 需要新增 typed API：

```ts
interface ElectronAPI {
  chatCreateSession(input: ChatCreateSessionInput): Promise<ChatSession>;
  chatListSessions(input: ChatListSessionsInput): Promise<PaginatedSessionsResult>;
  chatUpdateSessionTitle(input: ChatUpdateSessionTitleInput): Promise<void>;
  chatDeleteSession(input: ChatDeleteSessionInput): Promise<void>;
  chatGetSessionUsage(input: { sessionId: string }): Promise<AIUsage | undefined>;
  chatListMessages(input: ChatListMessagesInput): Promise<ChatMessageRecord[]>;
  chatAddMessage(input: ChatAddMessageInput): Promise<void>;
  chatSetMessages(input: ChatSetMessagesInput): Promise<void>;
}
```

`electron/preload/index.mts` 只暴露这些领域方法，不暴露 SQL 细节。

## Error Handling

主进程聊天服务错误分三类：

| 类型 | 示例 | 处理 |
|------|------|------|
| 输入错误 | 缺少 sessionId、无效 role | 抛出带明确 message 的 `Error` |
| 数据库错误 | SQLite 写入失败、事务失败 | 记录主进程日志并抛出 |
| 兼容错误 | JSON 解析失败、旧数据字段异常 | 使用安全默认值并记录 warning |

第一阶段不需要新增复杂错误码；但错误消息要可定位，例如：

```text
[ChatService] Cannot add message: sessionId is empty
[ChatService] Cannot set messages: message sessionId mismatch
```

渲染端继续由调用方决定是否 toast。聊天历史读取失败不应静默吞掉，避免用户误以为消息丢失。

## Fallback Strategy

迁移后建议采用双 adapter：

```ts
const chatStorage = hasElectronAPI()
  ? electronChatStorage
  : memoryChatStorage;
```

`memoryChatStorage` 只用于测试、Storybook 或非 Electron 调试，不承担桌面生产 fallback。它可以复用当前 fallback 的排序和分页逻辑，但不应影响 Electron 主路径。

adapter 选择只在模块初始化时发生一次。Electron adapter 内部不再逐次调用 `isDatabaseAvailable()`，也不包含 localStorage 降级逻辑。Electron 环境下数据库不可用应作为错误暴露，而不是静默切换到另一份数据源。

原因：

- Electron 桌面环境数据库不可用时，继续写 renderer localStorage 会制造两份事实来源。
- 数据库初始化竞态应在主进程启动顺序和 IPC 层解决，而不是通过渲染端降级为另一套存储。

## Migration Phases

### Phase 1: Add Main Process Chat Service

新增 `electron/main/modules/chat/`：

- 搬迁聊天 SQL 常量与 row mapper。
- 接入 `electron/main/modules/database/service.mts` 的 SQLite 实例能力。
- 在 database service 暴露同步 `runTransaction<T>(operation: () => T): T`。
- 注册 `chat:*` IPC。
- preload 暴露 typed chat API。

验收标准：

- 主进程测试能直接 create/list/update/delete session。
- 主进程测试能 add/list/set messages。
- 事务失败时不会留下半写状态。

### Phase 2: Switch Renderer Store To Domain API

调整渲染端聊天存储：

- `src/shared/storage/chats/electron.ts` 调用 `electronAPI.chat*`。
- `src/stores/chat/session.ts` 保持 action 名称不变。
- `src/shared/storage/chats/sqlite.ts` 不再作为 Electron 主路径使用。
- 保留测试或非 Electron 所需 memory adapter。

验收标准：

- `BChatSidebar` 不需要大面积改动。
- 会话历史、发送消息、重新生成、删除会话、usage 面板行为保持一致。
- `rg "chatStorage.*dbExecute|dbSelect"` 不再出现聊天路径直接数据库调用。

### Phase 3: Tighten Generic Database Access

在聊天路径迁移完成后，审查通用数据库 IPC 的使用范围：

- provider、service-model、tool-settings、files 等模块仍可逐步迁移。
- 短期不删除 `db:*`，避免扩大本次升级范围。
- 新增 lint 或架构约定：业务模块新增存储能力时优先使用领域 IPC。

验收标准：

- 聊天模块不再依赖 `db:*`。
- 新增文档说明 `db:*` 只作为底层兼容能力，不推荐业务直接使用。

### Phase 4: Future Integration With AI Tasks

等主进程 chat service 稳定后，再考虑让主进程 AI task 直接写入 assistant 消息或事件日志。

这一步需要另行设计，因为它会涉及：

- 流式事件恢复。
- 前端本地工具结果回写。
- 用户确认等待状态。
- 多窗口订阅。
- 应用退出后的任务恢复边界。

本次设计只为它预留写入入口，不提前迁移流式状态机。

## Testing Strategy

### Unit Tests

主进程 ChatService：

- `createSession` 写入渲染端传入的完整 session，并保留默认 title `新会话`。
- `listSessions` 按 `lastMessageAt`、`updatedAt`、`createdAt` 排序。
- `listSessions` cursor 分页稳定。
- `addMessage` 写入消息并更新 `lastMessageAt`。
- `addMessage` 对不存在的 session 抛错，不产生孤儿消息。
- `addMessage` 带 usage 时累加会话 usage。
- `setMessages` 替换旧消息并重算 usage。
- `setMessages` 空数组时清空消息，并将 `usage_json` 设为 `NULL`。
- `deleteSession` 同时删除 session 与 messages。
- 无效 role、sessionId mismatch 会抛错。

Repository / Mapper：

- JSON 字段缺失时返回安全默认值。
- 旧数据中 role 异常时按现有逻辑兜底或抛错，策略保持一致。
- 消息排序同现有 `sortMessages`。

### Integration Tests

渲染 store：

- `getSessionMessages` 返回带 `finished: true` 的组件消息。
- `addSessionMessage(null, message)` 不调用主进程。
- 不可持久化消息不会写入。
- `setSessionMessages` 只传可持久化消息。

聊天侧边栏流程：

- 新会话首条消息发送后创建 session 并写入 user message。
- assistant 完成后写入 assistant message。
- 重新生成会替换当前会话消息且保留未加载历史。
- 删除当前会话后清空当前消息状态。

### Regression Tests

- 上下文压缩消息 `role: 'compression'` 仍可持久化。
- 图片消息 `files` 字段仍可 round-trip。
- 工具调用 `parts` 与 `tool-result` 仍可 round-trip。
- usage 面板读取累计 usage 正确。
- 历史分页不会重复或跳过同时间戳消息。

## Rollout Plan

推荐按小步合并：

1. 只新增主进程 chat service 与测试，不接 UI。
2. preload 与类型补齐，仍不切换 store。
3. 切换 `chatStorage` 到 electron adapter，跑现有聊天测试。
4. 删除或降级旧 renderer SQL 实现的 Electron 主路径。
5. 补文档与 changelog。

这样每一步都能独立验证，失败时也容易回滚。

## Explicit Decisions

### Session ID Ownership

第一阶段保留渲染端生成 session ID 和时间戳，`chat:sessions:create` 接收完整 `ChatSession`。这保持现有 UI 行为和 store 返回语义不变。主进程生成 session 属于后续 AI task 集成阶段，不在本次迁移中改变。

### Empty setMessages Usage

空的 `chat:messages:set` 必须将 `usage_json` 设为 `NULL`。这与当前 `setSessionMessages` 调用 `updateSessionUsage(sessionId, undefined)` 的行为一致，避免 usage 面板显示已删除消息的旧统计。

### Generic DB IPC Deprecation

本次不删除 `db:*`。但迁移完成后，应在开发文档中标记：新增业务存储不应直接使用 `db:*`，优先新增主进程领域服务。

## Risks

### Risk: Migration Touches Many Call Sites

缓解：保持 `useChatSessionStore` action 不变，把改动限制在 storage adapter 和主进程模块。

### Risk: Transaction Helper Requires Database Service Change

缓解：在 database service 暴露最小同步 `runTransaction<T>(operation: () => T): T`，只供主进程领域服务使用，不通过 IPC 暴露事务回调。

### Risk: Tests Depend On Renderer Fallback

缓解：保留 memory adapter，并让测试显式选择 adapter；Electron 主路径不再使用 localStorage fallback。

### Risk: Future AI Task Persistence Needs More Than Message Writes

缓解：本次只承接 session/message/usage，不提前把 stream event log 塞进 chat service。AI task event 持久化应作为独立设计。

## Success Criteria

- 聊天业务 SQL 不再位于渲染进程主路径。
- 渲染端聊天 store 仍能支持现有 UI，无大规模组件改动。
- 追加消息、替换消息、删除会话具备事务一致性。
- 现有聊天历史、usage、压缩消息、工具消息、图片消息行为不回退。
- 主进程拥有可复用的聊天写入入口，为后台 AI 任务和多窗口演进打基础。
