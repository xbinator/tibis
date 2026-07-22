# 聊天会话集合单一数据源设计

## 背景

`SessionHistory` 当前独立维护会话列表、分页游标和加载状态。聊天页通过 `useChatSessionStore` 创建或修改会话后，这份组件局部数据不会同步更新，只能由 `ChatSider` 通过组件实例调用 `refreshSessions`。

这造成了两类问题：

- 会话数据存在 Store 返回值和组件局部列表两份状态，更新时机容易遗漏。
- `ChatSider` 必须了解 `SessionHistory` 的内部加载方法，聊天页也无法自然同步历史列表。

## 目标

- `useChatSessionStore` 成为会话集合、分页状态和加载状态的唯一数据源。
- 聊天侧栏与独立聊天页复用 Store 的同一套初始化逻辑。
- 聊天页创建、分支、改名或删除会话后，`SessionHistory` 自动显示最新数据。
- `SessionHistory` 不再请求首屏数据、不维护分页副本，也不再暴露 `refreshSessions`。
- 保留历史列表的分页加载、日期分组、忙碌会话禁止删除和删除失败提示行为。

## 非目标

- 不在独立聊天页新增历史会话按钮或其他 UI。
- 不改变聊天路由、顶部标签归属、草稿晋升或 Runtime 状态模型。
- 不引入新的全局事件同步会话集合。
- 不提交或暂存代码，由用户后续统一处理 Git 提交。

## 方案

采用有状态的 `useChatSessionStore`。Store 负责持有会话集合和分页元数据，组件只消费响应式状态并发起用户操作。

不采用全局刷新事件，因为事件只能通知组件重新请求，仍然保留多份状态和刷新时序。不额外创建会话集合 Composable，因为 Pinia Store 已经提供跨宿主共享和响应式更新能力。

## Store 设计

### 响应式状态

`useChatSessionStore` 新增以下状态：

- `sessions: ChatSession[]`：已加载和当前运行期创建的会话集合。
- `sessionsLoading: boolean`：是否正在加载首屏或下一页。
- `sessionsLoaded: boolean`：是否完成过首次加载；空列表也视为已经加载。
- `sessionsHasMore: boolean`：服务端是否还有下一页。
- `sessionsNextCursor?: SessionCursor`：下一页游标。

Store 提供按 ID 查询当前会话的 Getter，`ChatSider` 不再依赖 `SessionHistory` 回传当前会话对象。

### 加载动作

- `ensureSessions()`：两个宿主挂载时调用。首次调用加载第一页，已加载或正在加载时不重复请求。
- `loadMoreSessions()`：历史列表滚动到底时调用；正在加载或没有下一页时直接返回。
- 加载成功后按会话 ID 合并去重，保留运行期间刚创建但不在请求快照中的会话，并更新服务端返回的游标和 `hasMore`。
- 加载失败时保留现有集合和游标，使后续操作可以重试；错误继续抛给调用方，由宿主决定静默处理或展示反馈。

原有 `getSessions` 的数据库读取细节收敛在 Store 内部，不再由 `SessionHistory` 组合分页参数或处理结果合并。

### 集合自动同步

持久化动作成功后同步更新 Store 集合：

- `createSession`：将新会话插入集合并按最近活动时间排序。
- `branchSession`：将分支会话插入集合。
- `updateSessionTitle`：更新集合中同 ID 会话的标题。
- `deleteSession`：从集合移除会话；失败时不修改集合。
- 新增持久化消息并更新服务端 `lastMessageAt` 后，同步对应会话的最近活动时间和排序。

集合更新使用统一的 Store 内部辅助方法完成，避免每个 action 重复查找、去重和排序逻辑。

## 组件职责

### SessionHistory

移除以下职责：

- `displayedSessions`、`nextCursor`、`hasMore`、`loading` 等局部数据状态。
- 首次挂载加载和 `activeSessionId` 变化后的刷新监听。
- `loadSessions`、`refreshSessions` 以及 `defineExpose`。
- `update:currentSession` 事件。

组件直接渲染 Store 中的 `sessions` 和 `sessionsLoading`。滚动到底无条件发布 `load-more` 事件，不重复判断 `sessionsHasMore` 或 `sessionsLoading`；防重和分页结束判断统一由 Store 的 `loadMoreSessions` 负责。删除仍调用 Store 的删除 action；Store 成功更新集合后，组件再发布现有的 `delete-session` 事件，让宿主处理侧栏选择和顶部标签清理。

### ChatSider

- 挂载时调用 `chatStore.ensureSessions()`。
- 响应 `SessionHistory` 的 `load-more` 事件并调用 `chatStore.loadMoreSessions()`。
- `useChatSession` 通过活动会话 ID 和 Store Getter 暴露只读的 `currentSession` 计算属性，当前标题由该计算属性推导。
- 移除 `sessionHistoryRef`、`v-model:current-session`、手动 `setCurrentSession` 和所有 `refreshSessions` 调用。
- 新建会话、自动命名和手动改名无需刷新；对应 Store action 成功后集合会自动更新。

现有 `useChatSession` 保留侧栏会话 ID 的切换、草稿和删除后选择状态，并返回直接读取 Store 的 `currentSession` 计算属性；它不维护第二份会话对象。

### 独立聊天页

- 挂载时通过 `asyncTo(chatStore.ensureSessions())` 静默触发加载，与 ChatSider 共用幂等的首次加载逻辑，不额外展示加载失败提示。
- 不新增历史列表 UI。
- 会话创建、分支和标题更新继续走现有 BChat/Store action；Store action 自动同步集合，聊天页无需发布刷新事件或感知 `SessionHistory`。

## 数据流

```text
ChatSider / ChatPage mounted
        │
        └── chatStore.ensureSessions()
                    │
                    └── sessions（唯一集合）
                              │
                              └── SessionHistory 响应式渲染

ChatPage 中的 BChat
        │
        ├── createSession / branchSession ── 插入 sessions
        ├── updateSessionTitle ───────────── 更新 sessions
        └── addSessionMessage ────────────── 更新排序时间
```

## 并发与错误处理

- `sessionsLoading` 阻止 ChatSider 和 ChatPage 同时挂载时发起重复请求。
- 首次请求期间创建的新会话通过合并去重保留，不被稍后返回的旧请求快照覆盖。
- 所有持久化动作先等待数据库成功，再修改内存集合，避免 UI 显示未成功保存的数据。
- 异步调用继续使用 `asyncTo` 归一化错误；ChatPage 的后台初始化保持静默，ChatSider 和 SessionHistory 仅在用户直接操作需要反馈时展示错误。
- 加载失败不会清空已有集合，也不会错误地将 `sessionsLoaded` 标记为成功。

## 测试设计

### Store 测试

- `ensureSessions` 首次加载并保存分页状态，重复调用不重复请求。
- `loadMoreSessions` 追加、去重并更新游标。
- 首次加载进行中创建会话时，最终集合仍保留新会话。
- 创建、分支、改名、删除和新增消息成功后正确同步集合。
- 持久化失败时不提前修改集合。

### SessionHistory 测试

- 渲染 Store 中的会话集合和加载状态。
- 滚动加载无条件发布 `load-more`，不直接读取服务端数据或重复 Store 的分页保护。
- 不再暴露 `refreshSessions`，也不再发布 `update:currentSession`。
- 保留忙碌会话禁止删除和删除失败行为。

### 宿主测试

- ChatSider 和聊天页挂载时调用同一个幂等初始化 action。
- `useChatSession.currentSession` 和 ChatSider 标题直接响应 Store 集合中的创建和改名结果。
- 聊天页创建会话后，SessionHistory 使用的 Store 集合立即包含新会话。
- ChatSider 不再持有 SessionHistory 组件实例或调用刷新方法。

## 验收标准

- 聊天页创建新会话后，无需关闭或刷新侧栏，历史列表立即出现该会话。
- 会话标题变化和删除同样实时反映到历史列表。
- SessionHistory 中不存在首屏请求、分页集合副本和 `refreshSessions` 暴露接口。
- 两个宿主同时存在时不会重复加载第一页。
- 原有聊天标签、会话切换、分页加载和忙碌会话保护测试保持通过。
