# 聊天页多标签对抗审计加固设计

## 背景

独立聊天页、多会话顶部标签、共享会话集合和通用标签状态已经实现并通过既有测试。本轮审计不增加产品能力，而是验证路由失败、KeepAlive 生命周期、Runtime 恢复、关闭确认和损坏缓存等异常路径，修复会破坏会话唯一所有权或留下幽灵状态的边界。

## 范围与不变量

- 同一个持久化会话最多由一个可交互 `BChat` 实例持有；直接访问 `/chat/:sessionId` 也必须释放侧栏中的同会话所有权。
- 只有成功导航可以创建或更新顶部标签；中止、取消和重复导航不得创建幽灵目标标签。
- ChatTab Runtime 记录只能由 `ensureTab` 显式创建；绑定、状态、完成和控制器回调不得在标签关闭后复活记录。
- 活动标签判断统一比较 `route.fullPath` 与 `Tab.path`，查询参数不能把可见页面误判为后台页面。
- 标签关闭计划从开始确认到应用期间保持逻辑身份稳定；`chat:new` 不得在关闭确认或终止过程中晋升为另一个标签 ID。
- 批量终止必须等待全部控制器结束后再返回成功或失败。
- Runtime 恢复期间完成的任务只在后台标签产生 `completed`，活动标签恢复为空闲状态。
- `app_tabs` 中的未知、损坏或历史字段不能阻止应用启动，也不能恢复瞬时标签状态。
- 活动标签只有在后继路由成功到达后才能从 Store 和 KeepAlive 集合移除。

## 方案选择

### 采用：现有边界原子化加固

继续由 Router、Chat 页面、ChatTab Store、关闭守卫和 Tabs Store 各自维护当前职责，只增加窄接口：导航失败过滤、侧栏所有权释放、关闭意图、显式 Runtime 记录存在性和恢复时的活动判断。

优点是变更局部、容易用现有测试框架验证，不引入第二套事实源。代价是关闭守卫需要公开结束关闭意图的动作，HeaderTabs 需要在导航失败时调用。

### 不采用：集中式会话所有权协调器

把侧栏、顶部标签、Runtime 和路由全部迁入新协调 Store 可以提供更强事务语义，但会大幅改变已经稳定的入口和测试，超出本轮缺陷修复范围。

### 不采用：全局修正 watcher

监听所有标签、路由和侧栏状态并在冲突后自动修正实现较快，但会产生难以预测的二次导航和状态回写，也违反原设计“明确入口维护所有权”的约束。

## 设计

### 成功导航建签

`src/router/index.ts` 的 `afterEach` 接收 Vue Router 的 `failure` 参数。存在任何导航失败时直接返回，不解析路由标签信息，也不写 Tabs Store。重复导航已经存在当前标签，无需再次写入。

### 页面所有权与活动判断

`src/views/chat/index.vue` 捕获持久化 `initialSessionId` 后，如果侧栏当前持有相同 ID，立即把侧栏切换为草稿态；侧栏持有其他会话时保持不变。页面活动状态统一使用 `route.fullPath === owner.path`，仅在缺少标签对象时才使用无查询参数的回退路径。

### Runtime 记录生命周期

`ensureTab` 是唯一记录创建入口。`bindSession`、`setStatus`、`markCompleted`、`registerController` 和 `promoteTab` 在记录不存在时安静返回。这样来自已卸载页面或关闭后排队 watcher 的迟到回调不会重新创建记录，应用级 Runtime 事件也不会为只属于 ChatSider 的会话污染顶部标签注册表。

### 关闭意图与草稿晋升

ChatTab Store 增加内存 `closingTabIds` 集合和 `markClosing / clearClosing / isClosing` 动作。关闭守卫在任何异步确认前标记本次聊天目标：

1. 运行态在确认期间自然完成时，页面仍写入真实状态，但不会晋升 `chat:new`。
2. 用户取消、终止失败、未保存确认取消或关闭后的导航失败时，守卫或 HeaderTabs 清除关闭意图。
3. 页面监听关闭意图解除；若仍有待晋升会话且 Runtime 已空闲，则恢复晋升。
4. 关闭成功时 `removeTab` 同时清除关闭意图。

`abortTabs` 使用 `Promise.allSettled` 等待全部目标控制器；存在失败时在所有结果结束后抛出首个错误。

草稿标签开始晋升后，活动标签暂时保留 `/chat` 路径，直到 `router.replace` 成功才提交 `/chat/:sessionId`，因此 HeaderTabs 在导航期间仍能识别当前标签。ChatTab Store 额外维护瞬时 `promotingTabIds`：晋升未完成时拒绝并发关闭，并在 SessionHistory 中禁用删除，避免另一次导航取消晋升后让关闭计划或删除事件失去目标。

### 活动标签关闭导航

HeaderTabs 在关闭守卫通过后，若计划会关闭当前活动标签，则先导航到 `nextActivePath` 或 `/welcome`。导航抛错或返回阻断失败时保留原标签并清除关闭意图；导航成功后再应用关闭计划和清理 Runtime。非活动标签仍直接应用计划。

删除会话后的活动标签也遵循相同顺序：先完成回退导航，再移除标签与 Runtime；导航失败时保留当前页面壳，避免当前路由指向已移除的 KeepAlive 项。

普通标签点击使用 `asyncTo` 吸收路由异常，不产生未处理 Promise。

### Runtime 恢复完成态

`recoverRuntimes` 接收可选的 `isTabActive(tabId)` 判定。应用级 `useRuntimeRecovery` 通过当前路由和 Tabs Store 提供实时实现。两次快照之间完成的 Runtime 根据该判定调用 `markCompleted`：活动标签写入 `idle`，后台标签写入 `completed`。

两次查询之间已经被用户关闭的标签不得复用首轮绑定。第二轮同步只有在绑定标签仍存在时才重建状态或控制器；否则只保留 Actor 事实，不复活顶部标签状态。

### Tabs 持久化防御

持久化归一化以 `unknown` 处理每个标签，只接收非空字符串 `id/path`、字符串 `title`，并仅复制字符串 `cacheKey/icon`。损坏条目被过滤；缓存 key 只接收非空字符串；dirty/missing 映射只保留布尔值。历史 `status` 始终丢弃。

聊天侧栏的持久化会话 ID 同样按 `unknown` 校验：仅接受去除首尾空白后的非空字符串，其余值归一化为 `null`。

## 错误处理

- 导航失败：不建签、不移除活动标签，解除关闭意图。
- 终止失败：等待其他终止任务结束，保留所有标签并解除关闭意图。
- 关闭取消：保留标签；已自然完成或已成功终止的草稿恢复正常晋升。
- Runtime 迟到事件：记录不存在时忽略，不能复活已关闭标签。
- 损坏本地缓存：过滤无效字段并以剩余合法标签启动。

所有新增异步流程继续使用 `asyncTo`，不引入异步 `try/catch`。

## 测试策略

- 使用真实内存 Router 证明 aborted navigation 会调用 `afterEach`，但不会新增目标标签。
- Chat 页面覆盖同会话侧栏所有权释放、其他侧栏会话保持、带 query 的活动完成态和关闭期间草稿晋升暂停/恢复。
- ChatTab Store 覆盖迟到状态/控制器/晋升不会复活记录、关闭意图清理、批量终止等待所有结果。
- 关闭守卫覆盖取消与失败时释放关闭意图；HeaderTabs 覆盖活动关闭导航失败时保留标签。
- Runtime 恢复覆盖活动标签完成不产生未读、后台标签仍产生未读。
- Runtime 恢复覆盖两次查询之间关闭标签不会复活绑定。
- Tabs Store 覆盖损坏 `app_tabs` 数据过滤和合法数据保留。
- SessionHistory 覆盖标签晋升期间禁止删除；设置 Store 覆盖损坏侧栏会话 ID。
- 最终执行相关 Vitest、全量 Vitest、ESLint、Stylelint、TypeScript 和 `git diff --check`。

## 非目标与剩余边界

- 不改变不存在会话 ID 的产品展示策略；数据库记录在页面打开后被外部删除仍由现有 BChat 错误处理负责。
- 不为跨窗口数据库删除与 Runtime 启动建立分布式锁。
- 不重构通用持久化助手或引入新的会话协调 Store。
- 不提交代码，由用户统一提交。
