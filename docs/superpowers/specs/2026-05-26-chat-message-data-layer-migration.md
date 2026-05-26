# 聊天消息数据层下移到主进程 — 技术设计文档

> 版本: v2.1 | 日期: 2026-05-26 | 状态: Draft | 审查: 第二轮深度审查

## 目录

1. [TL;DR — 本次做什么，未来做什么](#tldr--本次做什么未来做什么)
2. [动机与背景](#1-动机与背景)
3. [当前架构诊断](#2-当前架构诊断)
4. [目标架构](#3-目标架构)
5. [Phase 1 详细设计](#4-phase-1-详细设计)
6. [后续阶段概览](#5-后续阶段概览)
7. [风险与缓解](#6-风险与缓解)
8. [实施步骤](#7-实施步骤)

---

## TL;DR — 本次做什么，未来做什么

### 本次（Phase 1）：数据层下移

> **一句话：把聊天数据的"存和取"从渲染进程搬到主进程，渲染进程不再直接写 SQL。**

具体范围：

- **新建** `electron/main/modules/chat/` 模块，在主进程实现 `ChatSessionManager`，封装会话 + 消息 + 压缩记录的全部持久化逻辑
- **新增** 12 个 `chat:*` IPC 通道（5 个会话 + 3 个消息 + 4 个压缩记录），替代渲染进程调用 `db:execute/db:select`
- **删除** `src/shared/storage/chats/`（~500 行）和 `src/shared/storage/chat-compression-records/`（~322 行），去掉所有双路径 SQLite/localStorage 分支
- **修改** Pinia store，把 `chatStorage.xxx()` 替换为 `electronAPI.chatXxx()`
- **利用 better-sqlite3 事务**：`setSessionMessages`、`deleteSession`、`addMessage` 级联操作改为原子事务
- **不动** 任何流式、UI 逻辑——store 公开接口完全不变，调用方零改动

```
Before:  渲染进程 → chatStorage → dbExecute IPC → 主进程 SQLite（3 次 IPC = 1 条消息）
         渲染进程 → chatCompressionRecordsStorage → dbExecute IPC → 主进程 SQLite

After:   渲染进程 → chat:* IPC → 主进程 ChatSessionManager → SQLite（同步 + 事务）
```

### 未来（Phase 2 + Phase 3）：业务逻辑下移

> **一句话：把"怎么流式生成、怎么压缩、怎么命名"从渲染进程搬到主进程。**

| 阶段 | 做什么 | 渲染进程会消失什么 |
|------|--------|-------------------|
| **Phase 2** 流式编排下移 | 工具循环（ToolLoopGuard）、parts 拼接（`append.*`）、续轮判断、确认流程移到主进程 `StreamOrchestrator` | `useChatStream`（775 行）、`toolLoopGuard`、`toolCallTracker` |
| **Phase 3** 智能功能下移 | 上下文压缩编排、自动命名、Message→ModelMessage 转换、Token 估算移到主进程 | `useCompactContext`、`useAutoName`、消息转换逻辑 |

```
未来目标架构：

┌─ 主进程（Chat Backend Service）─────────────┐
│  ChatSessionManager  StreamOrchestrator      │
│  ContextCompressor   AutoNamer               │
│  MessageConverter                            │
└──────────────────────────────────────────────┘
                    │ IPC
┌─ 渲染进程（View Layer）──────────────────────┐
│  ConversationView  MessageBubble             │
│  InputToolbar      8 个 BubblePart           │
│  → 只剩 UI，零业务逻辑                        │
└──────────────────────────────────────────────┘
```

---

## 1. 动机与背景

Tibis 的聊天功能（BChatSidebar）当前将绝大部分业务逻辑放在渲染进程，主进程只做 AI SDK 代理透传和 SQL 执行。随着功能增长（上下文压缩、工具调用确认、自动命名、Token 估算等），渲染进程日益臃肿。此次重构的长期目标是**让主进程成为聊天后端服务，渲染进程退化为纯展示层**，分三个阶段渐进式完成。

本文档聚焦 **Phase 1：数据层下移**，即将消息和压缩记录的持久化从渲染进程移到主进程。

---

## 2. 当前架构诊断

### 2.1 进程职责分布

```
┌──────────────────────────────────────────────────────────┐
│ 主进程（薄 — 约 200 行聊天相关代码）                      │
│                                                          │
│  AIService.streamText()          ← AI SDK 代理           │
│  dbExecute / dbSelect            ← SQL 执行器            │
│  MCP 工具执行                    ← stdio 子进程管理       │
│  Tavily 搜索                     ← SDK 托管工具          │
│                                                          │
│  ✗ 不知道消息数据结构                                  │
│  ✗ 不理解 parts 类型含义                                │
│  ✗ 不参与工具循环编排                                    │
│  ✗ 不参与持久化决策                                      │
│  ✗ 不知道压缩记录的存在                                  │
└──────────────────────────────────────────────────────────┘
                          │ IPC (invoke/send/on)
┌──────────────────────────────────────────────────────────┐
│ 渲染进程（厚 — 约 3500+ 行聊天业务代码）                  │
│                                                          │
│  useChatStream (775 行)          ← 流式编排 + 工具循环    │
│  useChatHistory                   ← 消息列表状态 + 分页   │
│  useCompactContext                ← 上下文压缩编排        │
│  useAutoName                      ← 自动命名             │
│  useContextUsage                  ← Token 估算           │
│  messageHelper.ts                 ← parts 拼接/转换       │
│  confirmationController           ← 确认流程状态机        │
│  chatStorage (500 行)             ← 双路径持久化          │
│  chatCompressionRecordsStorage (322 行) ← 压缩记录持久化  │
│  useChatSessionStore              ← 空心 facade store    │
│  ConversationView.vue             ← 消息渲染             │
│  MessageBubble.vue + 8 个 part 组件 ← 结构化片段渲染     │
│                                                          │
│  messages: Ref<Message[]> 是所有逻辑的中心枢纽             │
└──────────────────────────────────────────────────────────┘
```

### 2.2 具体问题

#### 问题 1：Pinia Store 是空心壳

`useChatSessionStore` 位于 `src/stores/chat/session.ts` (144 行)：
- **零响应式状态** — 没有 `state`，没有 `getters`
- **纯 async action 袋子** — 每个 action 只做参数转换 + 委托 `chatStorage`
- 真正的消息状态（`messages: Ref<Message[]>`）在 `useChatHistory` composable 中
- Store 和 Composable 职责分裂，新开发者难以理解数据归属

```ts
// 当前 store — 只是一个 pass-through
export const useChatSessionStore = defineStore('chat', {
  actions: {
    async getSessionMessages(sessionId, cursor?) {
      const messages = await chatStorage.getMessages(sessionId, cursor)
      return messages.map(m => ({ ...m, finished: true }))
    },
    // ... 其他 8 个方法，每个都是 chatStorage.xxx() 的薄包装
  }
})
```

#### 问题 2：渲染进程直接操作 SQL

调用链：`index.vue` → `useChatHistory` → `useChatSessionStore` → `chatStorage` → `dbExecute/dbSelect` → `ipcRenderer.invoke('db:execute')` → 主进程 SQLite

渲染进程知道：
- 完整的 SQL 语句（**12 条** SQL 常量在 `sqlite.ts` 中定义）
- 表结构（row mapper 负责 snake_case↔camelCase 转换）
- 游标分页逻辑（`sliceMessagesByCursor`、`isBeforeHistoryCursor`）
- JSON 序列化策略（`parts_json`、`files_json`、`usage_json` 等）

同样地，`chatCompressionRecordsStorage`（322 行）也使用同构的 `dbSelect`/`dbExecute` + `isDatabaseAvailable()` 双路径模式，存在完全相同的问题。

#### 问题 3：双路径 Fallback 的维护负担

`chatStorage` 和 `chatCompressionRecordsStorage` 的 **每个方法** 都有 `isDatabaseAvailable()` 分支：

```ts
async addMessage(message: ChatMessageRecord): Promise<void> {
  if (!isDatabaseAvailable()) {
    // localStorage fallback — 50 行逻辑
    const messages = loadFallbackMessages()
    // ...
    saveFallbackMessages(messages)
    return
  }
  // SQLite 路径 — 10 行
  await dbExecute(UPSERT_MESSAGE_SQL, [...])
}
```

- 两个模块合计约 **822 行**，其中约 **400 行是 fallback 逻辑**
- 在 Electron 环境下 `isDatabaseAvailable()` 始终为 `true`
- localStorage fallback 仅在浏览器 dev 环境触发，但 dev 时通常没有真实数据
- 两套实现需要保持行为一致，是测试和 bug 的温床

#### 问题 4：IPC 接口过于底层 + 安全隐患

当前渲染进程通过通用的 `db:execute` / `db:select` IPC 访问数据库：

```
Renderer: electronAPI.dbSelect("SELECT ... FROM chat_messages WHERE session_id = ?", [id])
Main:     dbSelect(sql, params) → better-sqlite3 → rows
```

问题是：
- 主进程对聊天数据**完全不可见** — 它只是执行 SQL 字符串
- 后续要想在主进程做消息相关操作（压缩、命名），需要先"把数据拿回来"
- **任何渲染进程代码都可以执行任意 SQL**，缺乏领域边界约束
- 即使 Phase 1 迁移完成后，其他 storage 模块（providers、service-models、tool-settings）仍在使用通用 SQL 通道，渲染进程仍然可以绕过 `ChatSessionManager` 直接操作 chat 表

#### 问题 5：非原子操作的数据风险

当前 `setSessionMessages` 的实现：

```ts
await dbExecute(DELETE_MESSAGES_BY_SESSION_SQL, [sessionId])  // 第 1 次 IPC
await upsertSessionMessages(messages)                          // N 次 IPC（逐条 INSERT）
```

在渲染进程这是**完全非原子**的——任何一步 IPC 失败，数据就处于半删半插状态。同样 `addSessionMessage` 需要 3 次 IPC（addMessage → updateLastMessageAt → addSessionUsage），中间任何一步失败都会导致数据不一致。

#### 问题 6：渲染进程 Crash 风险

`messages: Ref<Message[]>` 存在于渲染进程内存。如果渲染进程 crash（Electron webContents crash）：
- 当前轮次的未保存消息全部丢失
- 流式生成中的部分内容丢失
- 确认状态丢失

### 2.3 数据流全景

```
用户输入
    │
    ▼
index.vue: handleChatSubmit()
    │
    ├─ compactBeforeSendIfNeeded()    ← 渲染进程: 上下文压缩
    ├─ create.userMessage()            ← 渲染进程: 构造消息对象
    ├─ messages.value.push()           ← 渲染进程: 更新本地状态
    │
    ▼
useChatStream.streamMessages()
    │
    ├─ buildChatMessageReferences()    ← 渲染进程: 文件引用解析
    ├─ convert.toCachedModelMessages() ← 渲染进程: 消息→ModelMessage
    │
    ▼
useChat.agent.stream()  ────IPC──→  主进程 AIService.streamText()
    │                                        │
    │                                    AI SDK fullStream
    │                                        │
    ◄──IPC text delta───────────────────────┘
    │
    ├─ append.textPart()               ← 渲染进程: parts 拼接
    ├─ messages[n-1].content +=         ← 渲染进程: 就地修改
    │
    ◄──IPC tool-call────────────────────────┘
    │
    ├─ append.toolCallPart()           ← 渲染进程
    ├─ toolLoopGuard.recordToolCall()  ← 渲染进程: 循环保护
    ├─ executeToolCall()               ← 渲染进程: 工具执行
    ├─ append.toolResultPart()         ← 渲染进程
    │
    ◄──IPC finish───────────────────────────┘
    │
    ├─ messages[n-1].usage =           ← 渲染进程
    ├─ onComplete()                     ← 渲染进程: 触发持久化
    │
    ▼
chatStore.addSessionMessage()          ← 3 次 IPC: 消息 + lastMessageAt + usage
```

**关键观察**：整个流式过程中，主进程只参与 AI SDK 调用和最后的 SQL INSERT。所有中间状态管理、错误处理、工具编排都在渲染进程。

---

## 3. 目标架构

### 3.1 三阶段路线图

```
Phase 1 (本文档)             Phase 2                    Phase 3
数据层下移                    流式编排下移                智能功能下移
══════════                    ════════════               ════════════
                              ┌─────────────────┐       ┌─────────────────┐
┌─────────────────┐           │ StreamOrchestrator│       │ ContextCompressor│
│ ChatSessionManager│          │ - 工具循环管理   │       │ AutoNamer        │
│ - 会话 CRUD     │           │ - parts 拼接     │       │ MessageConverter │
│ - 消息 CRUD     │           │ - 续轮判断       │       │ - ModelMessage   │
│ - 压缩记录 CRUD │           │ - 确认流程       │       │ - 压缩边界检测   │
│ - 事务包装      │           └─────────────────┘       └─────────────────┘
└─────────────────┘
        │
        ▼
   chatStorage 删除
   chatCompressionRecordsStorage 删除
   Store 改为 IPC 调用
```

**Phase 1 的核心原则**：
- 主进程成为聊天数据的 canonical owner
- 渲染进程保留流式实时状态（延迟敏感）
- 持久化由主进程在流式完成后统一处理
- 保持 Store 公开接口不变，调用方无需修改
- 压缩记录存储同步下移，不遗留半成品

### 3.2 Phase 1 完成后架构

```
┌──────────────────────────────────────────────────────────┐
│ 主进程                                                    │
│                                                          │
│  ┌────────────────────────────────────────────┐          │
│  │ ChatSessionManager (新增)                   │          │
│  │                                            │          │
│  │  - 直接调用 dbExecute/dbSelect (同步)       │          │
│  │  - 封装 16 条 SQL 语句（会话 7 + 消息 5 + 压缩 4）│          │
│  │  - 事务包装: setSessionMessages/deleteSession│         │
│  │  - 级联更新: addMessage → lastMessageAt + usage│       │
│  │  - Row mapping (snake_case → camelCase)    │          │
│  │  - 游标分页逻辑                              │          │
│  │  - 无 localStorage fallback                │          │
│  │                                            │          │
│  │  暴露 12 个 IPC handler:                     │          │
│  │  chat:session:* (5 个)                      │          │
│  │  chat:message:* (3 个)                      │          │
│  │  chat:compression:* (4 个)                  │          │
│  └────────────────────────────────────────────┘          │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐            │
│  │ AIService │  │ Database │  │ MCP Runtime  │           │
│  │ (已有)    │  │ (已有)   │  │ (已有)       │           │
│  └──────────┘  └──────────┘  └─────────────┘            │
└──────────────────────────────────────────────────────────┘
                          │ IPC
┌──────────────────────────────────────────────────────────┐
│ 渲染进程                                                  │
│                                                          │
│  ┌────────────────────────────────────────────┐          │
│  │ useChatSessionStore (修改)                  │          │
│  │  chatStorage.xxx() → electronAPI.chatXxx() │          │
│  │  公开接口签名不变!                           │          │
│  └────────────────────────────────────────────┘          │
│                                                          │
│  ┌────────────────────────────────────────────┐          │
│  │ useCompactContext (修改 — 仅替换 storage import)│      │
│  │  chatCompressionRecordsStorage             │          │
│  │       ↓ 替换为                              │          │
│  │  electronAPI.chatCompressionXxx()           │          │
│  └────────────────────────────────────────────┘          │
│                                                          │
│  ┌────────────────────────────────────────────┐          │
│  │ 流式相关 (不变)                              │          │
│  │  useChatStream     useChatHistory           │          │
│  │  messageHelper     confirmationController   │          │
│  │  useContextUsage   useAutoName              │          │
│  └────────────────────────────────────────────┘          │
│                                                          │
│  ┌────────────────────────────────────────────┐          │
│  │ UI 组件 (完全不变)                           │          │
│  │  ConversationView  InputToolbar             │          │
│  │  MessageBubble     SessionHistory           │          │
│  │  8 个 BubblePart   ConfirmationCard         │          │
│  │  SkillIndicator    UsagePanel               │          │
│  └────────────────────────────────────────────┘          │
```

---

## 4. Phase 1 详细设计

### 4.1 新增模块 `electron/main/modules/chat/`

目录结构：

```
electron/main/modules/chat/
  service.mts    — ChatSessionManager 类 + 单例导出（~300 行）
  ipc.mts        — registerChatHandlers()（~70 行）
```

#### 4.1.1 `service.mts` 设计

**SQL 常量**（从渲染进程搬运，共计 16 条，无去重）：

会话（7 条）：
```
SELECT_SESSIONS_BY_TYPE_SQL
SELECT_SESSIONS_BY_CURSOR_SQL
UPSERT_SESSION_SQL
UPDATE_SESSION_LAST_MESSAGE_AT_SQL
UPDATE_SESSION_TITLE_SQL
SELECT_SESSION_USAGE_SQL
UPDATE_SESSION_USAGE_SQL
```

消息（5 条）：
```
SELECT_MESSAGES_BY_SESSION_SQL
SELECT_MESSAGES_BEFORE_CURSOR_SQL
UPSERT_MESSAGE_SQL
DELETE_SESSION_SQL
DELETE_MESSAGES_BY_SESSION_SQL
```

压缩记录（4 条）：
```
SELECT_LATEST_VALID_RECORD_SQL      -- 来自 chatCompressionRecordsStorage
INSERT_RECORD_SQL                   -- 来自 chatCompressionRecordsStorage
UPDATE_RECORD_STATUS_SQL            -- 来自 chatCompressionRecordsStorage
SELECT_ALL_RECORDS_SQL              -- 来自 chatCompressionRecordsStorage
```

**ChatSessionManager 类 API**：

```ts
class ChatSessionManager {
  // ======== Session ========
  getSessionsByType(type, pagination?) → PaginatedSessionsResult
  createSession(session) → void
  updateSessionTitle(sessionId, title) → void
  getSessionUsage(sessionId) → AIUsage | undefined
  // updateSessionLastMessageAt、addSessionUsage、updateSessionUsage
  // 不作为独立 IPC 暴露，而是在 addMessage/setSessionMessages 内部级联处理

  // ======== Message ========
  getMessages(sessionId, cursor?) → ChatMessageRecord[]
  addMessage(message) → void
  //   内部级联: updateSessionLastMessageAt + addSessionUsage
  setSessionMessages(sessionId, messages) → void
  //   内部级联: DELETE all + 批量 INSERT + updateSessionUsage
  //   使用 db.transaction() 保证原子性

  // ======== Delete ========
  deleteSession(sessionId) → void
  //   使用 db.transaction() 保证原子性: DELETE messages + DELETE session

  // ======== Compression Records ========
  getLatestValidRecord(sessionId) → CompressionRecord | undefined
  createRecord(record) → CompressionRecord
  updateRecordStatus(id, status, invalidReason?) → void
  getAllRecords(sessionId) → CompressionRecord[]
}
```

**事务安全性**（迁移的重要收益）：

**前置**：在 `electron/main/modules/database/service.mts` 中新增 `transaction()` 导出（`dbExecute` 已是 `db.prepare(sql).run(params)` 的薄包装，操作同一个 `db` 实例，放在 `transaction()` 回调中即可确保原子性）：

```ts
// database/service.mts 新增
export function transaction<T>(fn: () => T): T {
  if (!db) throw new Error('Database not initialized')
  return db.transaction(fn)()
}
```

实现：

```ts
import { dbExecute, dbSelect, transaction } from '../database/service.mjs'

// setSessionMessages — 原子替换（DELETE + 批量 INSERT + usage + lastMessageAt 在同一事务）
setSessionMessages(sessionId: string, messages: ChatMessageRecord[]): void {
  transaction(() => {
    dbExecute(DELETE_MESSAGES_BY_SESSION_SQL, [sessionId])
    for (const msg of messages) {
      dbExecute(UPSERT_MESSAGE_SQL, [
        msg.id, msg.sessionId, msg.role, msg.content,
        stringifyJson(msg.parts), msg.thinking ?? null,
        stringifyJson(msg.files), stringifyJson(msg.usage),
        stringifyJson(msg.compression), msg.createdAt
      ])
    }
    if (messages.length > 0) {
      dbExecute(UPDATE_SESSION_LAST_MESSAGE_AT_SQL, [messages[messages.length - 1].createdAt, sessionId])
    }
    const totalUsage = messages.reduce((sum, m) => addUsage(sum, m.usage), undefined)
    dbExecute(UPDATE_SESSION_USAGE_SQL, [stringifyJson(totalUsage), sessionId])
  })
}

// deleteSession — 原子删除
deleteSession(sessionId: string): void {
  transaction(() => {
    dbExecute(DELETE_MESSAGES_BY_SESSION_SQL, [sessionId])
    dbExecute(DELETE_SESSION_SQL, [sessionId])
  })
}

// addMessage — 原子写入 + 级联更新（消息 + lastMessageAt + usage 在同一事务）
addMessage(message: ChatMessageRecord): void {
  transaction(() => {
    dbExecute(UPSERT_MESSAGE_SQL, [
      message.id, message.sessionId, message.role, message.content,
      stringifyJson(message.parts), message.thinking ?? null,
      stringifyJson(message.files), stringifyJson(message.usage),
      stringifyJson(message.compression), message.createdAt
    ])
    dbExecute(UPDATE_SESSION_LAST_MESSAGE_AT_SQL, [message.createdAt, message.sessionId])
    if (message.usage) {
      const rows = dbSelect<{ usage_json: string | null }>(SELECT_SESSION_USAGE_SQL, [message.sessionId])
      const current = parseJson<AIUsage>(rows[0]?.usage_json ?? null)
      dbExecute(UPDATE_SESSION_USAGE_SQL, [stringifyJson(addUsage(current, message.usage)), message.sessionId])
    }
  })
}
```

**关键**：`transaction()` 内全部使用 `dbExecute`/`dbSelect`（它们操作模块级 `db` 单例），无需 `getDb()` 或手动 `db.prepare()`，代码风格统一。

**与旧实现的对比**：

| 方面 | 旧（渲染进程） | 新（主进程） |
|------|--------------|------------|
| 数据库访问 | `await dbSelect(...)` 异步 IPC | `dbSelect(...)` 同步 better-sqlite3 |
| 可用性检查 | 每个方法 `if (!isDatabaseAvailable())` | 无 — 主进程始终可用 |
| Fallback | ~400 行 localStorage 逻辑 | 无 — 移除 |
| 事务 | 无，多次 IPC 调用非原子 | `transaction()` 包装，原子化 |
| 批量写入 | `Promise.all(msgs.map(m => dbExecute(...)))` 逐条 IPC | `transaction()` 内循环 `dbExecute` |
| `addMessage` 级联 | 渲染进程调 3 次 IPC | 主进程 1 次事务内完成 |

#### 4.1.2 `ipc.mts` 设计

**统一 Result 模式**（全部 12 个 handler 用 `wrapHandler` 包装）：

理由：
- 渲染进程读调用如果遇到 SQLite corruption，raw throw 会变成 Unhandled Promise Rejection
- 两种错误处理模式（读 throw、写 Result）共存会让调用方混淆——Store 层需要同时维护 try-catch 和 `if (!result.ok)` 两套逻辑
- 统一 Result 后，Store 层只需检查 `result.ok`，错误处理路径唯一

```ts
import { ipcMain } from 'electron'
import { chatSessionManager } from './service.mjs'

type HandlerResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string }

function wrapHandler<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => HandlerResult<T> {
  return (...args: unknown[]) => {
    try {
      const result = fn(...args)
      return { ok: true, data: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = error instanceof Error && 'code' in error ? (error as { code: string }).code : 'UNKNOWN'
      return { ok: false, error: message, code }
    }
  }
}

export function registerChatHandlers(): void {
  // ── Session (5 个) ──
  ipcMain.handle('chat:session:list', wrapHandler((_event, type, pagination?) => {
    return chatSessionManager.getSessionsByType(type, pagination)
  }))
  ipcMain.handle('chat:session:create', wrapHandler((_event, session) => {
    chatSessionManager.createSession(session)
  }))
  ipcMain.handle('chat:session:updateTitle', wrapHandler((_event, sessionId, title) => {
    chatSessionManager.updateSessionTitle(sessionId, title)
  }))
  ipcMain.handle('chat:session:delete', wrapHandler((_event, sessionId) => {
    chatSessionManager.deleteSession(sessionId)
  }))
  ipcMain.handle('chat:session:usage:get', wrapHandler((_event, sessionId) => {
    return chatSessionManager.getSessionUsage(sessionId)
  }))

  // ── Message (3 个) ──
  ipcMain.handle('chat:message:list', wrapHandler((_event, sessionId, cursor?) => {
    return chatSessionManager.getMessages(sessionId, cursor)
  }))
  ipcMain.handle('chat:message:add', wrapHandler((_event, message) => {
    chatSessionManager.addMessage(message)
  }))
  ipcMain.handle('chat:message:setAll', wrapHandler((_event, sessionId, messages) => {
    chatSessionManager.setSessionMessages(sessionId, messages)
  }))

  // ── Compression Records (4 个) ──
  ipcMain.handle('chat:compression:getLatest', wrapHandler((_event, sessionId) => {
    return chatSessionManager.getLatestValidRecord(sessionId)
  }))
  ipcMain.handle('chat:compression:create', wrapHandler((_event, record) => {
    return chatSessionManager.createRecord(record)
  }))
  ipcMain.handle('chat:compression:updateStatus', wrapHandler((_event, id, status, invalidReason?) => {
    chatSessionManager.updateRecordStatus(id, status, invalidReason)
  }))
  ipcMain.handle('chat:compression:getAll', wrapHandler((_event, sessionId) => {
    return chatSessionManager.getAllRecords(sessionId)
  }))
}
```

**`updateSessionUsage` 不出现在 IPC 中**：不作为独立 IPC handler，在 `addMessage`/`setSessionMessages` 内部级联处理。

**类型注意事项**：`wrapHandler` 包装后，所有返回值变为 `HandlerResult<T>`。渲染侧 Store 和 adapter 需要解包：检查 `result.ok`，取 `result.data`，失败时抛出或提示。

### 4.2 Preload 变更

在 `electron/preload/index.mts` 的 `electronAPI` 对象中新增 12 个方法：

```ts
// Chat Session (5 个)
chatSessionList: (type, pagination?) => ipcRenderer.invoke('chat:session:list', type, pagination),
chatSessionCreate: (session) => ipcRenderer.invoke('chat:session:create', session),
chatSessionUpdateTitle: (sessionId, title) => ipcRenderer.invoke('chat:session:updateTitle', sessionId, title),
chatSessionDelete: (sessionId) => ipcRenderer.invoke('chat:session:delete', sessionId),
chatSessionUsageGet: (sessionId) => ipcRenderer.invoke('chat:session:usage:get', sessionId),

// Chat Message
chatMessageList: (sessionId, cursor?) => ipcRenderer.invoke('chat:message:list', sessionId, cursor),
chatMessageAdd: (message) => ipcRenderer.invoke('chat:message:add', message),
chatMessageSetAll: (sessionId, messages) => ipcRenderer.invoke('chat:message:setAll', sessionId, messages),

// Chat Compression Records
chatCompressionGetLatest: (sessionId) => ipcRenderer.invoke('chat:compression:getLatest', sessionId),
chatCompressionCreate: (record) => ipcRenderer.invoke('chat:compression:create', record),
chatCompressionUpdateStatus: (id, status, invalidReason?) => ipcRenderer.invoke('chat:compression:updateStatus', id, status, invalidReason),
chatCompressionGetAll: (sessionId) => ipcRenderer.invoke('chat:compression:getAll', sessionId),
```

### 4.3 类型定义变更

在 `types/electron-api.d.ts` 的 `ElectronAPI` 接口中新增 12 个方法签名：

**前置**：`CompressionRecord`、`CompressionRecordStatus`、`CompressionRecordStorage` 当前定义在 `src/components/BChatSidebar/utils/compression/types.ts`（组件级文件），`types/electron-api.d.ts` 不应从组件目录 import。需先将这三个类型提取到 `types/compression.d.ts`，原文件 re-export 保持兼容。

```ts
// types/electron-api.d.ts 新增 import
import type {
  ChatSession, ChatSessionType, ChatMessageRecord,
  ChatMessageHistoryCursor, PaginatedSessionsResult, SessionPaginationParams
} from './chat'
import type { CompressionRecord, CompressionRecordStatus } from './compression'

// 统一 Result 包装类型（与主进程 wrapHandler 对应）
type HandlerResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string }

export interface ElectronAPI {
  // ... 已有方法 ...

  // Chat Session (新增，全部返回 HandlerResult)
  chatSessionList(type: ChatSessionType, pagination?: SessionPaginationParams): Promise<HandlerResult<PaginatedSessionsResult>>
  chatSessionCreate(session: ChatSession): Promise<HandlerResult<void>>
  chatSessionUpdateTitle(sessionId: string, title: string): Promise<HandlerResult<void>>
  chatSessionDelete(sessionId: string): Promise<HandlerResult<void>>
  chatSessionUsageGet(sessionId: string): Promise<HandlerResult<AIUsage | undefined>>

  // Chat Message (新增，全部返回 HandlerResult)
  chatMessageList(sessionId: string, cursor?: ChatMessageHistoryCursor): Promise<HandlerResult<ChatMessageRecord[]>>
  chatMessageAdd(message: ChatMessageRecord): Promise<HandlerResult<void>>
  chatMessageSetAll(sessionId: string, messages: ChatMessageRecord[]): Promise<HandlerResult<void>>

  // Chat Compression Records (新增，全部返回 HandlerResult)
  chatCompressionGetLatest(sessionId: string): Promise<HandlerResult<CompressionRecord | undefined>>
  chatCompressionCreate(record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<HandlerResult<CompressionRecord>>
  chatCompressionUpdateStatus(id: string, status: CompressionRecordStatus, invalidReason?: string): Promise<HandlerResult<void>>
  chatCompressionGetAll(sessionId: string): Promise<HandlerResult<CompressionRecord[]>>
}
```

### 4.4 Store 变更

`src/stores/chat/session.ts` — 替换 import 和调用：

**保留**（纯数据转换，不涉及 I/O）：
- `toRecordMessage()` — Message → ChatMessageRecord 转换
- `sumMessagesUsage()` — Usage 汇总
- `nanoid()` 和 `dayjs()` 调用 — ID/时间戳生成在渲染侧

**替换**（I/O 操作）：

```ts
// import { chatStorage } from '@/shared/storage'  ← 删除
import { getElectronAPI } from '@/shared/platform/electron-api'

// 轻量 Result 解包 helper（Store 内部使用）
function unwrap<T>(result: HandlerResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.data
}

export const useChatSessionStore = defineStore('chat', {
  actions: {
    async getSessionMessages(sessionId, cursor?) {
      const result = await getElectronAPI().chatMessageList(sessionId, cursor)
      const messages = unwrap(result)
      return messages.map((message) => ({ ...message, finished: true }))
    },
    async getSessions(type, pagination?) {
      const result = await getElectronAPI().chatSessionList(type, pagination)
      return unwrap(result)
    },
    async getSessionUsage(sessionId) {
      const result = await getElectronAPI().chatSessionUsageGet(sessionId)
      return unwrap(result)
    },
    async createSession(type, { title = '新会话' } = {}) {
      const now = dayjs().toISOString()
      const session = { id: nanoid(), type, title, createdAt: now, updatedAt: now, lastMessageAt: now }
      const result = await getElectronAPI().chatSessionCreate(session)
      unwrap(result)
      return session
    },
    async addSessionMessage(sessionId, message) {
      if (!sessionId || !is.persistableMessage(message)) return
      const record = toRecordMessage(sessionId, message)
      // 单次 IPC，级联更新（lastMessageAt + usage）在主进程事务内完成
      const result = await getElectronAPI().chatMessageAdd(record)
      unwrap(result)
    },
    async setSessionMessages(sessionId, messages) {
      if (!sessionId) return
      const persistable = messages.filter(is.persistableMessage)
      const records = persistable.map(m => toRecordMessage(sessionId, m))
      // 单次 IPC，DELETE + INSERT + usage/lastMessageAt 在主进程事务内原子完成
      const result = await getElectronAPI().chatMessageSetAll(sessionId, records)
      unwrap(result)
    },
    async updateSessionTitle(sessionId, title) {
      const result = await getElectronAPI().chatSessionUpdateTitle(sessionId, title)
      unwrap(result)
    },
    async deleteSession(sessionId) {
      const result = await getElectronAPI().chatSessionDelete(sessionId)
      unwrap(result)
    }
  }
})
```

**行为变更（明确标注）**：

| 操作 | 旧行为 | 新行为 | 影响 |
|------|--------|--------|------|
| `addSessionMessage` | 3 次 IPC（addMessage + updateLastMessageAt + addSessionUsage），任一步失败可导致不一致 | 1 次 IPC，主进程事务内完成，全成功或全回滚 | **改进**：原子化，消除竞态。但如果事务抛异常，整条消息不保存（旧行为下消息可能保存成功但 usage 更新失败） |
| `setSessionMessages` | DELETE IPC + N 次 INSERT IPC + updateUsage IPC，非原子 | 1 次 IPC，主进程事务内完成 | **改进**：原子化，且批量 INSERT 性能提升 |
| `deleteSession` | 2 次 IPC（DELETE messages + DELETE session），非原子 | 1 次 IPC，主进程事务内完成 | **改进**：原子化 |
| **新增** `unwrap()` helper | — | 所有 `electronAPI.chat*` 调用返回 `HandlerResult<T>`，Store 内部通过 `unwrap()` 解包，`!ok` 时 throw | **新增**：统一错误处理路径，调用方（useChatHistory 等）只需 try-catch |

### 4.5 `useCompactContext` 变更

`src/components/BChatSidebar/hooks/useCompactContext.ts` — 将 `chatCompressionRecordsStorage` 替换为基于 `electronAPI` 的 adapter。

`createCompressionCoordinator` 已经接受 `CompressionRecordStorage` 接口，只需在 `useCompactContext` 中创建 adapter 替换原来的 `chatCompressionRecordsStorage` import：

```ts
// Before
import { chatCompressionRecordsStorage } from '@/shared/storage/chat-compression-records'
// ... coordinator = createCompressionCoordinator({ storage: chatCompressionRecordsStorage, ... })

// After
import { getElectronAPI } from '@/shared/platform/electron-api'

function unwrap<T>(result: HandlerResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const electronAPIAdapter: CompressionRecordStorage = {
  async getLatestValidRecord(sessionId) {
    const result = await getElectronAPI().chatCompressionGetLatest(sessionId)
    return unwrap(result)
  },
  async createRecord(record) {
    const result = await getElectronAPI().chatCompressionCreate(record)
    return unwrap(result)
  },
  async updateRecordStatus(id, status, invalidReason?) {
    const result = await getElectronAPI().chatCompressionUpdateStatus(id, status, invalidReason)
    unwrap(result)
  },
  async getAllRecords(sessionId) {
    const result = await getElectronAPI().chatCompressionGetAll(sessionId)
    return unwrap(result)
  }
}

// coordinator = createCompressionCoordinator({ storage: electronAPIAdapter, ... })
```

**关键点**：`unwrap()` 将 `HandlerResult<T>` 转回 `T` 或 throw，保持 `CompressionRecordStorage` 接口语义不变。coordinator 内部完全不感知 IPC 层。

### 4.6 删除的文件

| 文件 | 行数 | 原因 |
|------|------|------|
| `src/shared/storage/chats/sqlite.ts` | ~500 | 全部逻辑移入 `ChatSessionManager` |
| `src/shared/storage/chats/index.ts` | 1 | 不再需要 re-export |
| `src/shared/storage/chat-compression-records/sqlite.ts` | ~322 | 全部逻辑移入 `ChatSessionManager` |
| `src/shared/storage/chat-compression-records/index.ts` | ~5 | 不再需要 re-export |

### 4.7 修改 `src/shared/storage/index.ts`

删除两行：
```ts
export * from './chats'                    // ← 删除
export * from './chat-compression-records' // ← 删除
```

### 4.8 `src/shared/storage/utils/` 去留分析

迁移后 `database.ts` 仍被以下模块使用：
- `providers/` — AI 提供商配置
- `service-models/` — 服务模型配置
- `tool-settings/` — MCP 和搜索工具配置
- `files/` — 最近文件列表

这些模块规模较小（每个 ~50-100 行），且与聊天领域无关。它们留在渲染进程是可接受的，在后续重构中可以各自独立迁移。`isDatabaseAvailable` 分支逻辑在这些模块中仍然存在，但 Phase 1 的聊天数据迁移已消除最大的 fallback 维护负担（~400 行 → 剩余的 ~100 行）。

**技术债标注**：`database.ts` 的 `isDatabaseAvailable()` 分支和重试逻辑是通用基础设施，应在所有 storage 模块都迁移到主进程后再移除。通用 `db:execute/db:select` IPC 通道在 Phase 1 后仍然存在，长期应考虑限制或移除，所有数据访问走领域 IPC。

### 4.9 注册到 `electron/main/modules/index.mts`

```ts
import { registerChatHandlers } from './chat/ipc.mjs'

export function registerAllIpcHandlers() {
  // ... 已有 handlers ...
  registerChatHandlers()  // ← 新增，放在 registerAIHandlers() 之前
  registerAIHandlers()
  // ...
}
```

### 4.10 不变部分（明确排除）

以下文件在 Phase 1 中**完全不修改**：

| 文件 | 原因 |
|------|------|
| `useChatStream.ts` | 流式编排仍在渲染进程（Phase 2） |
| `useChatHistory.ts` | `messages` ref 管理仍在渲染进程 |
| `messageHelper.ts` | parts 拼接/转换仍在渲染进程 |
| `useAutoName.ts` | 自动命名仍在渲染进程（Phase 3） |
| `confirmationController.ts` | 确认流程仍在渲染进程（Phase 2） |
| `useContextUsage.ts` | Token 估算仍在渲染进程（Phase 3） |
| 全部 UI 组件 | 通过 Store 间接访问数据，Store 接口不变 |
| `compression/coordinator.ts` 等核心逻辑 | 压缩编排逻辑不变（Phase 3），仅替换 storage adapter |

---

## 5. 后续阶段概览

### Phase 2 — 流式编排下移

将 `useChatStream` (775 行) 核心逻辑移到主进程 `StreamOrchestrator`：

- 工具循环（ToolLoopGuard）→ 主进程
- Parts 拼接（`append.textPart/thinkingPart/toolCallPart/toolResultPart`）→ 主进程
- 确认流程 → 主进程暂停/恢复流，渲染进程仅展示 UI
- 渲染进程通过 `chat:stream:partAppended` 增量事件更新 UI
- 删除渲染侧的 `useChatStream`、`toolLoopGuard`、`toolCallTracker`

### Phase 3 — 智能功能下移

- 上下文压缩编排 → 主进程（触发决策 + 摘要生成，此时 `ChatSessionManager` 已有压缩记录 CRUD）
- 自动命名 → 主进程（首轮完成后自动触发）
- Message → ModelMessage 转换 → 主进程（带签名缓存）
- Token 估算 → 主进程（与压缩策略联动）
- 清理渲染进程残留的 `useCompactContext`、`useAutoName` 业务逻辑

### Phase 3+ (远期)

- 移除通用 `db:execute/db:select` IPC 通道，所有数据访问走领域 IPC
- 移除 `isDatabaseAvailable()` 和 localStorage fallback 基础设施
- 移除渲染侧 `database.ts` 的启动重试逻辑

---

## 6. 风险与缓解

### 6.1 行为变更：addMessage 级联原子化

**风险**：原来 `addSessionMessage` 的 3 次 IPC 中，如果 addMessage 成功但 addSessionUsage 失败，消息已保存但 usage 未更新。新行为下，事务内任何一步失败都会导致整条消息不保存——这意味着偶发的 usage 更新失败现在会导致消息丢失。

**缓解**：
- 这是从"部分不一致"到"全有或全无"的改进，正确性更高
- 事务内操作的失败概率极低（同步 better-sqlite3，无网络 I/O）
- 如果后续确实出现写入失败，错误会通过 `{ ok: false, error, code }` 返回渲染进程，可以提示用户重试
- 可在渲染侧增加重试逻辑：写操作失败时提示用户"保存失败，点击重试"

### 6.2 IPC 调用增加

**风险**：新增 12 个 `chat:*` IPC 通道，IPC handler 注册代码增加。

**缓解**：每次业务操作的 IPC 调用次数减少了（如 addSessionMessage 从 3 次减为 1 次）。总 IPC 流量减少。

### 6.3 Store action 签名保持

**风险**：store 内部实现从 `chatStorage.foo()` 改为 `getElectronAPI().chatFoo()`，如果遗漏某个调用点会导致编译错误。

**缓解**：TypeScript 编译检查 + 全量测试套件覆盖。

### 6.4 向后兼容

**风险**：删除 `chatStorage` 和 `chatCompressionRecordsStorage` 后，如果有其他消费者 import 会编译失败。

**缓解**：已通过 `grep` 验证只有 `session.ts` 和 `useCompactContext.ts` 两个消费者。

### 6.5 主进程同步 SQL 阻塞

**风险**：better-sqlite3 是同步 API，大量数据查询可能阻塞主进程事件循环。

**缓解**：
- 聊天消息查询有 `LIMIT 30` 限制，单次返回 < 50KB
- 会话列表分页 `LIMIT 20`
- `setSessionMessages` 批量写入通常 < 100 条
- 事务包装使得批量操作在单次事件循环 tick 中完成，反而减少了总开销
- 如果后续发现瓶颈，可以改用 Worker 线程

### 6.6 运行时数据库错误

**风险**：§4.1.1 说"DB 初始化在 bootstrap 阶段保证"，但运行时仍可能发生磁盘满、SQLite corruption 等错误。

**缓解**：
- 全部 12 个 handler 通过 `wrapHandler` 统一返回 `{ ok: false, error, code }`，读/写错误处理路径一致
- Store 层通过 `unwrap()` helper 统一解包，`!ok` 时 throw，调用方只需 try-catch
- 后续可增加主进程健康检查 + 自动恢复机制

### 6.7 通用 SQL 通道的安全隐患（技术债）

**风险**：迁移后，渲染进程仍可通过 `db:execute`/`db:select` 直接操作 chat 表，绕过 `ChatSessionManager`。

**缓解**：标记为技术债。Phase 1 暂时保留通用 SQL 通道（其他 storage 模块仍需使用），在 Phase 3+ 所有 storage 模块迁移完成后移除。在此期间，代码 review 确保新增代码不使用通用 SQL 通道访问聊天数据。

---

## 7. 实施步骤

### Step 1: 创建主进程 Chat 模块

**文件**：`electron/main/modules/chat/service.mts`（新建）

1. 从 `../database/service.mjs` import `{ dbExecute, dbSelect }` + 获取 `db` 实例用于事务
2. 搬运 16 条 SQL 常量（7 条会话 + 5 条消息 + 4 条压缩记录）
3. 搬运 Row 接口、Row mapper、排序/游标工具函数
4. 实现 `ChatSessionManager` 类（14 个方法）
5. `setSessionMessages`、`deleteSession`、`addMessage` 使用 `db.transaction()` 包装
6. 批量写入使用 prepared statement 循环，而非逐条 `dbExecute`
7. 导出单例 `chatSessionManager`

**文件**：`electron/main/modules/chat/ipc.mts`（新建）

1. 实现 `wrapHandler` 错误包装工具
2. 注册 12 个 `ipcMain.handle()` 通道（全部通过 `wrapHandler` 包装）

### Step 2: 注册模块 + Preload

**文件**：`electron/main/modules/index.mts`（修改）

1. Import `registerChatHandlers`
2. 在 `registerAllIpcHandlers()` 中调用

**文件**：`electron/preload/index.mts`（修改）

1. 新增 12 个 `contextBridge` 方法

**文件**：`types/electron-api.d.ts`（修改）

1. 新增 `types/compression.d.ts`，提取 CompressionRecord 等类型（从组件级文件移到共享类型目录）
2. 新增 import（ChatSession、CompressionRecord 等类型）
3. 在 `ElectronAPI` 接口中新增 12 个方法签名（全部返回 `HandlerResult<T>`）

### Step 3: 渲染进程适配

**文件**：`src/stores/chat/session.ts`（修改）

1. 删除 `import { chatStorage } from '@/shared/storage'`
2. 新增 `import { getElectronAPI } from '@/shared/platform/electron-api'`
3. 替换 9 处 `chatStorage.xxx()` 为 `getElectronAPI().chatXxx()`
4. `addSessionMessage` 简化 — 移除 `updateSessionLastMessageAt` 和 `addSessionUsage` 调用
5. `setSessionMessages` 简化 — 移除 `updateSessionUsage` 调用

**文件**：`src/components/BChatSidebar/hooks/useCompactContext.ts`（修改）

1. 删除 `import { chatCompressionRecordsStorage } from '@/shared/storage/chat-compression-records'`
2. 修改 coordinator 创建方式，使用基于 `electronAPI` 的 adapter

**文件**：`src/shared/storage/index.ts`（修改）

1. 删除 `export * from './chats'`
2. 删除 `export * from './chat-compression-records'`

**删除文件**：
- `src/shared/storage/chats/sqlite.ts`
- `src/shared/storage/chats/index.ts`
- `src/shared/storage/chat-compression-records/sqlite.ts`
- `src/shared/storage/chat-compression-records/index.ts`

### Step 4: 更新测试

**测试文件需要修改**（5 个文件引用了被删除的模块）：

| 文件 | 修改内容 |
|------|---------|
| `test/stores/chat.test.ts` | Mock `electronAPI.chat*` 替代 `chatStorage` |
| `test/stores/chat.compression-message.test.ts` | Mock `electronAPI.chat*` |
| `test/shared/storage/chat-compression-records.test.ts` | 迁移为主进程侧集成测试，或改为 mock `electronAPI` |
| `test/components/BChatSidebar/chat-slash-commands.test.ts` | 检查是否间接依赖 `chatStorage`，如果仅通过 store 访问则无需修改 |
| `test/electron/chat-storage-sqlite.test.ts` | 迁移为主进程侧测试，直接 import `ChatSessionManager` |

**新增测试**：
- `test/electron/chat-session-manager.test.ts` — 主进程侧单元测试，直接测试 `ChatSessionManager` 的事务安全性

### Step 5: 验证

1. **编译检查**：`pnpm build` 前端 + `pnpm electron:build-main` 主进程，确保无 TS 错误
2. **测试套件**：`pnpm test` 全量通过
3. **功能验证**（启动 `pnpm dev`）：
   - [ ] 创建新会话 → 会话列表显示
   - [ ] 发送消息 → 流式响应正常
   - [ ] 刷新窗口 → 消息恢复
   - [ ] 切换会话 → 历史消息正确加载
   - [ ] 删除会话 → 会话消失
   - [ ] 加载更多历史（30+ 条消息）→ 向上滚动触发
   - [ ] 自动命名 → 标题自动生成
   - [ ] 压缩消息（/compact 或自动）→ 存储和恢复正常
   - [ ] 压缩记录写入 → 查询 → 状态更新 全链路正常
   - [ ] Usage 面板 → Token 统计正确
4. **验证数据隔离**：确认以下目录不存在或为空：
   - `src/shared/storage/chats/`
   - `src/shared/storage/chat-compression-records/`
5. **验证 IPC 调用**：渲染进程不再直接调用 `db:execute` / `db:select` 操作 chat_sessions / chat_messages / chat_session_compression_records 表

---

## 变更文件总览

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `electron/main/modules/chat/service.mts` | ChatSessionManager 类（~300 行，含事务包装） |
| 新建 | `electron/main/modules/chat/ipc.mts` | 12 个 IPC handler + wrapHandler（~70 行） |
| 修改 | `electron/main/modules/index.mts` | +2 行 import + 调用 |
| 修改 | `electron/preload/index.mts` | +12 个 contextBridge 方法 |
| 修改 | `types/electron-api.d.ts` | +3 个 import + 12 个方法签名（全部返回 HandlerResult&lt;T&gt;） |
| 新建 | `types/compression.d.ts` | 从组件级文件提取 CompressionRecord 等类型 |
| 修改 | `src/stores/chat/session.ts` | 替换 import 和 9 处调用，简化级联逻辑 |
| 修改 | `src/components/BChatSidebar/hooks/useCompactContext.ts` | 替换 storage import 为 electronAPI adapter |
| 修改 | `src/shared/storage/index.ts` | -2 行 export |
| 删除 | `src/shared/storage/chats/sqlite.ts` | ~500 行 |
| 删除 | `src/shared/storage/chats/index.ts` | 1 行 |
| 删除 | `src/shared/storage/chat-compression-records/sqlite.ts` | ~322 行 |
| 删除 | `src/shared/storage/chat-compression-records/index.ts` | ~5 行 |
| 修改 | `test/stores/chat.test.ts` | Mock 更新 |
| 修改 | `test/stores/chat.compression-message.test.ts` | Mock 更新 |
| 修改 | `test/shared/storage/chat-compression-records.test.ts` | 迁移或重写 |
| 修改 | `test/electron/chat-storage-sqlite.test.ts` | 迁移为主进程侧 |
| 新增 | `test/electron/chat-session-manager.test.ts` | 主进程事务安全性测试 |

**合计**：4 新建 + 10 修改 + 4 删除 = 18 个文件变更
