# BChat 状态机瘦身设计

## 状态

- 日期：2026-07-11
- 状态：已确认
- 范围：BChat renderer 交互编排、AI 策略下沉、多会话后台运行与 Primary Agent 边界

## 背景

`src/components/BChat/index.vue` 当前同时承担模板绑定、输入组合、会话生命周期、Runtime 请求构建、Memory 选择、工具过滤、消息发送、重新生成、取消、回退、压缩、错误恢复和 IPC 事件适配等职责。

现有 hooks 已拆出部分能力，但核心流程仍由组件中的条件分支和 `try/finally` 串联。`useChatTaskRuntime` 仅表达 `idle | chat | compact` 互斥状态，无法完整描述准备请求、流式生成、等待用户选择、取消确认、回退恢复、多会话后台运行和未来子 Agent 并发等生命周期。

本次设计采用 XState v5，将聊天交互流程建模为应用级 Actor 系统。目标不是简单移动代码，而是建立明确的状态所有权、事件协议和取消边界。

## 目标

- 将 `src/components/BChat/index.vue` 收敛为模板绑定、DOM refs、UI 事件转接和 hooks 组装层。
- 将纯 AI 决策策略迁移到 `src/ai/chat/`，禁止依赖 Vue、Pinia、Router、组件和 DOM。
- 使用 XState v5 显式表达合法状态转移、异步任务、错误和取消路径。
- 支持不同会话并行运行；切换会话或卸载 BChat 后，原会话继续在后台生成。
- 当前 Turn 只持有一个 Primary Agent，避免为尚未实现的子 Agent 调度维护无效抽象。
- 保持 Electron ChatRuntime 的模型执行、工具循环和消息持久化职责不变。
- 迁移期间保持现有消息格式、IPC 协议和用户可见行为兼容。

## 非目标

- 本次不实现子 Agent 产品功能；未来需要独立设计并发、父子关系和聚合语义。
- 本次不新增多会话运行状态的完整 UI，只暴露可供会话列表订阅的 selectors。
- 本次不支持 Electron 主进程或应用整体重启后自动恢复未完成模型流。
- 本次不迁移聊天消息正文到 XState context。
- 本次不替换 Pinia 的持久状态管理职责。
- 本次不重写 Electron ChatRuntime 的模型流式执行和工具循环。

## 技术选型

新增依赖：

- `xstate`：状态机、状态图和 Actor 系统。
机器使用 XState v5 的 `setup(...)` 定义强类型 context、events、actors、actions 和 guards。Vue hook 只订阅当前 Session snapshot，并将必要状态投影为 computed refs。

不采用单一 `useBChatController`。该方案虽然能快速减少组件行数，但会把现有复杂度搬到另一个巨型 hook，无法改善状态合法性和未来多会话扩展。

## 状态所有权

### Renderer Actor 系统

负责：

- 聊天交互生命周期和合法状态转移。
- 请求准备、Runtime 启动、取消、回退和压缩的编排。
- 多会话和 Primary Agent Actor 生命周期。
- Runtime 事件地址校验和路由。
- 当前流程错误、取消目标和恢复目标。

不负责：

- 持久化完整消息正文。
- 直接执行模型、工具或压缩算法。
- 保存 Provider、Skill、Widget、Memory 等持久配置。

### Electron ChatRuntime

继续负责：

- 模型请求和流式输出。
- 工具循环及 renderer bridge 请求。
- 消息创建、增量更新和最终持久化。
- Runtime 中止和主进程资源释放。

### Pinia Store

继续负责：

- 会话与消息数据访问。
- Provider、Memory、工具设置、Skill 和 Widget 状态。
- 最近文件和工作区状态。

### BChat

仅负责：

- 绑定模板所需 refs 和 computed selectors。
- 将用户交互转换为 Actor events。
- 连接 DOM、Router、Toast 和组件 emits。
- 组装输入、文件、图片和语音 UI 能力。

## Actor 层级

```text
ChatSupervisorActor
├─ ChatSessionActor(session-A)
│  └─ ChatTurnActor(turn-1)
│     └─ AgentActor(primary)
└─ ChatSessionActor(session-B)
   └─ ChatTurnActor(turn-8)
      └─ AgentActor(primary)
```

### ChatSupervisorActor

生命周期属于应用，而不是 BChat 组件。

职责：

- 按 `sessionId` 创建、缓存和停止 Session actor。
- 维护 `runtimeId` 到 Actor 地址的路由表。
- 将全局 Runtime IPC 事件发送到目标 Agent actor。
- 聚合全局运行数量、后台任务和待用户处理状态。
- 删除会话时停止对应 Session actor 及所有后代。

Supervisor 不保存消息正文。切换路由或卸载 BChat 只解除 UI 订阅，不停止 Supervisor 或 Session actor。

Actor system 在 machine context 之外维护按 `runtimeId` 注册的 renderer capability registry。它冻结 Runtime 启动时允许使用的工具、编辑器文档定位、Bridge 处理器和交互提交能力，避免后台 Runtime 错误使用切换后的当前编辑器或 BChat 实例。

### ChatSessionActor

每个会话拥有独立 Session actor。

职责：

- 保证同一会话的用户 Turn 串行。
- 管理提交、重新生成、用户选择、取消、回退和压缩入口。
- 创建当前 Turn actor。
- 暴露会话级 `busy`、`waitingForUser`、`canRollback` 和 `canCompact` selectors。
- 在 UI 切换到其他会话后继续后台运行。

不同 Session actor 可以并行运行。同一 Session actor 默认拒绝第二个并发用户 Turn。

### ChatTurnActor

一个 Turn 对应一次用户请求及其 Primary Agent。

职责：

- 准备 Runtime 请求。
- 创建 Primary Agent actor。
- 汇总 Primary Agent 的错误、待确认和完成结果。
- Turn 取消时停止 Primary Agent。

### AgentActor

一个 Agent actor 对应唯一的 `agentId + runtimeId`。

状态：

```text
starting -> running -> waiting
           |       |      |
           |       |      -> running
           |       -> cancelling -> cancelled
           -> completed
           -> failed
```

当前只创建固定 `agentId: "primary"`。未来新增子 Agent 时重新设计 Turn context，不复用伪动态 Map。

`waiting` context 必须标记交互类型：

- `userChoice`：模型主动等待用户回答。
- `confirmation`：renderer 工具等待批准。

两者都可由会话列表 selector 暴露为待处理状态，但提交协议不同。

## Session 状态模型

```text
idle
├─ submit / regenerate / userChoice
│  └─ preparing
│     ├─ running
│     │  ├─ waitingForUser
│     │  ├─ cancelling
│     │  ├─ idle
│     │  └─ failed
│     └─ failed
├─ compact
│  └─ compacting -> idle
└─ rollback
   └─ rollingBack
      ├─ cancellingActiveRuntime
      ├─ applyingRollback
      └─ idle
```

请求准备阶段通过 context 中的 intent 区分发送、重新生成和用户选择：

```ts
type ChatIntent =
  | { type: 'submit'; input: ChatSubmitInput }
  | { type: 'regenerate'; targetMessageId: string }
  | { type: 'continue'; answer: AIUserChoiceAnswerData }
```

`loading`、`canSubmit`、`canRollback`、`canCompact` 和 `abortable` 使用 state tags 或 selectors 派生，不再通过组件中的多个布尔值组合判断。

建议 tags：

- `busy`：`preparing`、`running`、`cancelling`、`compacting`、`rollingBack`。
- `acceptsInput`：`idle`、`waitingForUser`。
- `abortable`：`running`、`waitingForUser`、`compacting`。
- `backgroundActive`：当前 Session 未被 UI 订阅且仍处于 `busy`。

## Actor Context

Context 只保存流程数据：

- `sessionId`、`turnId`、`agentId` 和 `runtimeId`。
- 当前 intent。
- 待发送消息 ID 或必要的不可变输入快照。
- 回退目标消息 ID。
- 当前错误分类和错误恢复目标。
- 子 Actor refs 与 Runtime 路由信息。

禁止放入 context：

- 完整会话消息列表。
- Vue refs、组件实例和 DOM 元素。
- Pinia Store 实例。
- Router、Toast 和工具实例。
- 可从 Store 或主进程重新读取的持久配置。

## Actor 地址与事件协议

所有 Runtime 事件统一携带 Actor 地址：

```ts
interface ChatActorAddress {
  sessionId: string
  turnId: string
  agentId: string
  runtimeId: string
}
```

事件只有地址全部匹配时才能写入目标 Actor。第一阶段可以在 renderer 内为现有 IPC 事件补齐 `turnId` 和 `agentId`，不要求立即改变所有持久消息结构。

核心事件分类：

- `session.submit`
- `session.regenerate`
- `session.userChoiceSubmitted`
- `session.compactRequested`
- `session.rollbackRequested`
- `session.cancelRequested`
- `runtime.started`
- `runtime.messageCreated`
- `runtime.messageUpdated`
- `runtime.userChoiceRequired`
- `runtime.completed`
- `runtime.failed`
- `runtime.cancelled`
- `agent.completed`
- `agent.failed`

## Runtime 事件路由

Supervisor 维护：

```text
runtimeId -> sessionId / turnId / agentId
```

路由规则：

1. Renderer 预分配 `runtimeId`，在调用主进程前注册映射和 capabilities。
2. IPC 事件先按 `runtimeId` 查找地址。
3. 地址与事件携带字段一致时发送到目标 Agent actor。
4. Agent、Turn 被取消或完成后立即注销映射。
5. 未知、重复或迟到事件只记录 debug 日志，不修改消息或 UI。

该机制替代 `BChat/index.vue` 中的 `rollbackIgnoredRuntimeIds`。回退不再维护无限增长的组件内 ID 集合。

## Runtime Capability Registry

Runtime IPC 发出前，Actor system 同时注册不可序列化的 renderer 能力：

```ts
interface RuntimeExecutionCapabilities {
  tools: AIToolExecutor[]
  getToolContext: () => AIToolContext | undefined
  handleBridgeRequest: (event: ChatRuntimeBridgeRequestEvent) => Promise<unknown>
}
```

约束：

- Registry 存在于 `actorSystem.ts` 的运行时服务中，不进入 machine context 和持久化数据。
- 工具列表和目标文档 ID 在 Runtime 启动时确定；`getToolContext` 必须按该 ID 从全局 registry 读取，禁止调用 `getCurrentContext()` 回退到当前活动编辑器。
- Bridge handler 由应用级 capability factory 创建，禁止闭包引用可能已卸载的 BChat 组件实例。
- 工具确认请求先检查持久授权；无法自动批准时进入对应 Agent 的 `waiting.confirmation`，等待该会话 UI 提交决定。
- Bridge 请求通过 Runtime 注册的 handler 执行，不使用当前路由页面临时创建的 handler。
- Runtime 完成、失败、取消或回退失效后立即删除 capabilities。
- 找不到 capabilities 时返回明确的 stale/unavailable 错误，不猜测当前上下文。
- 工具需要读取待用户问题时必须查询 Session/Turn actor，不得闭包读取某个 BChat 的本地消息 ref。

## Session UI Event Bus

Actor system 提供按 `sessionId` 订阅的轻量事件总线，用于当前可见 BChat 接收消息增量、上下文用量和待交互通知：

```ts
interface ChatSessionUIEventMap {
  messageCreated: ChatRuntimeMessageEvent
  messageUpdated: ChatRuntimeMessageEvent
  messageDeleted: ChatRuntimeMessageDeletedEvent
  contextUsageUpdated: ChatRuntimeContextUsageEvent
  confirmationRequested: ChatRuntimeConfirmationRequestEvent
}
```

- UI event bus 只转发事件，不缓存完整消息。
- 当前 BChat 订阅活跃 `sessionId` 并更新本地可见消息。
- 隐藏会话没有 UI subscriber 时不需要 renderer 消息镜像；Electron 主进程仍持续持久化。
- 切回会话时先从主进程加载最新消息，再订阅后续增量。
- BChat 卸载只移除 event bus 订阅，不影响 Runtime 和 Actor。

## 一次发送的数据流

1. BChat 将当前输入转换为不可变输入快照，发送 `session.submit`。
2. Supervisor 找到或创建对应 Session actor。
3. Session 验证当前状态并创建 Turn actor。
4. Turn 调用 `prepareRuntimeRequest` actor：
   - 同步 Skill 和 Widget。
   - 构建 Memory 选择上下文。
   - 过滤本轮工具。
   - 解析 system prompt、Tavily 和 MCP 配置。
   - 确保存在可持久化 Session。
5. Turn 创建 Primary Agent actor。
6. Renderer 分配 `runtimeId`，注册 Actor 路由和 capabilities，再调用 Electron ChatRuntime。
7. 全局 Runtime 事件监听器接收 IPC 事件并交给 Supervisor 路由。
8. Actor system 使用 Runtime capability registry 处理 renderer 工具和 Bridge 请求。
9. Electron ChatRuntime 持久化消息；Actor 只更新流程状态。
10. 当前 BChat 通过 selector 订阅 Session actor，并通过 session UI event bus 接收可见消息增量。
11. 切换会话时只更换订阅，原 Session actor 继续后台运行。

## 模块边界

```text
src/ai/chat/
├─ machine/
│  ├─ supervisorMachine.ts
│  ├─ sessionMachine.ts
│  ├─ turnMachine.ts
│  ├─ agentMachine.ts
│  ├─ events.ts
│  ├─ context.ts
│  └─ selectors.ts
├─ policies/
│  ├─ memorySelection.ts
│  ├─ runtimeRequest.ts
│  ├─ regeneration.ts
│  └─ rollback.ts
├─ actorSystem.ts
├─ runtimeCapabilities.ts
└─ sessionEvents.ts

src/hooks/
├─ useChatActorSystem.ts
└─ useChatRuntimeEvents.ts

src/components/BChat/hooks/
├─ useChatSessionActor.ts
├─ useChatComposer.ts
├─ useChatViewBindings.ts
└─ useChatNotifications.ts
```

### `src/ai/chat/machine`

只包含 machine definitions、事件类型、context 类型、guards、selectors 和 Actor 协议。禁止导入 Vue、Pinia、组件、Router 和 DOM。

### `src/ai/chat/policies`

包含可独立测试的纯策略：

- Memory 编辑意图识别和引用提取。
- 相关 Memory 模式下的工具过滤。
- Runtime 请求数据组装。
- 重新生成消息边界计算。
- 回退截断和迟到事件失效判断。

### `src/ai/chat/actorSystem.ts`

负责创建应用级 Supervisor actor，并通过明确依赖接口注入 IO actors。该模块不直接读取组件状态。

### `src/hooks`

负责应用级 Vue 接入：

- 启动和停止 Actor 系统。
- 提供 Actor system injection key。
- 全局订阅 Electron Runtime 事件。
- 将 IPC 事件转换为领域事件。

`useChatActorSystem` 必须挂载在应用根级或不会随聊天页面切换销毁的持久 owner。只有应用退出时才能停止 Supervisor；BChat、会话页面和设置页面卸载均不得停止 Actor system。

### `src/components/BChat/hooks`

负责 BChat UI 适配：

- 当前会话 Actor 订阅。
- 输入框、文件、图片和语音组合。
- Actor selectors 到模板 props 的映射。
- Toast、Router 和 UI 错误展示。

## 多会话行为

- 不同会话允许并行运行。
- 同一会话默认只允许一个活跃用户 Turn。
- 切换会话后原任务继续运行。
- 卸载 BChat 不取消后台任务。
- 切回会话后从主进程持久消息加载最新内容，并从 Session actor 读取当前流程状态。
- Supervisor 暴露全局运行和待处理 selectors，供未来会话列表展示。
- 删除会话时停止对应 Session actor 及其所有后代。

## 子 Agent 扩展边界

当前 renderer Actor 只支持 Primary Agent。子 Agent 需要先明确并发 Runtime 锁、父子关系、确认队列、结果聚合和取消范围，再以独立设计扩展；本次不保留无生产入口的 `agent.spawned`、动态 Agent Map 或父 Agent 字段。

## 取消语义

取消必须等待底层 Runtime 确认，不允许 UI 提前显示空闲：

```text
running -> cancelling -> runtime.cancelled -> idle
```

所有可取消 IO actors 接收 `AbortSignal`。对于 Electron ChatRuntime，取消 actor 必须调用显式 Runtime abort API，并等待主进程完成消息最终状态持久化。

取消范围：

- 取消 Agent：停止当前 Primary Agent。
- 停止当前回答：取消当前 Turn 和 Primary Agent。
- 取消压缩：只取消当前 Session 的压缩 actor。
- 切换会话：不取消。
- 卸载 BChat：不取消。
- 删除会话：停止 Session actor 和所有后代。
- 应用退出：交由主进程完成中断和资源清理。

若取消超时或失败，状态进入 `cancelFailed`，保留 Runtime 地址并允许重试，不能静默转入 `idle`。

## 错误分类

### `preparationFailed`

模型配置、资源同步或请求组装失败。不得创建 Runtime，并按 intent 恢复：

- `submit`：保留输入草稿，Session 返回 `idle`。
- `regenerate`：恢复被临时截断的消息，Session 返回 `idle`。
- `continue`：保留待用户选择状态，Session 返回 `waitingForUser`。

### `runtimeStartFailed`

Runtime 未成功启动。复用现有错误消息持久化策略，并按 intent 使用与 `preparationFailed` 相同的恢复目标。

### `runtimeFailed`

流式生成或工具循环失败。主进程完成消息错误态持久化，Agent 进入 `failed`，Turn 聚合后结束。

### `protocolError`

收到缺少地址、地址不匹配、非法状态或未知 Runtime 的事件。不得猜测目标，不修改其他会话状态。

每个异步状态都必须定义成功、失败和取消出口，禁止存在只能依靠组件 `finally` 恢复的永久 busy 状态。

## 持久化与重启

- 消息和工具结果继续以 Electron 主进程持久化数据为事实源。
- Actor snapshot 只描述流程状态，不复制完整消息。
- 正常应用运行期间支持多会话后台任务。
- Electron 主进程或应用整体重启后，未完成任务标记为中断。
- Electron 主进程仍存活时支持 renderer rebuild 恢复；整个应用退出后 Runtime 随主进程结束，不承诺跨进程持久化。

## Runtime 恢复边界

- 主进程通过 `chat:runtime:list-active` 暴露活跃 Runtime、capability 描述符和待处理 renderer 请求的可克隆投影。
- 快照不得包含 system prompt、Provider/MCP 凭据、Promise resolver、定时器、AbortController 或函数闭包。
- renderer 启动时先注册全局事件 listener，再执行两轮快照查询；第二轮用于吸收查询期间创建或完成的 Runtime。
- 恢复出的 Session、Turn 和 Agent 使用 `recover` 意图，不伪造用户提交事件，并按待确认状态直接进入 running 或 waiting。
- capability 描述符只保存 renderer 工具名和启动时文档 ID。BChat 未挂载时使用明确降级能力；会话挂载后按工具名升级执行器，并继续锁定原文档 ID。
- 无法恢复原文档上下文时返回稳定失败，不允许回退到另一个当前活跃文档。
- 待处理确认可在会话 UI 重新订阅后恢复；reload 前未完成的本地工具和 Bridge 请求返回明确失败，使主进程模型循环继续而不是静默超时。

## 迁移策略

迁移采用逐段替换，不允许旧流程和新状态机同时执行同一副作用。

### 阶段一：行为固化

- 为发送、重新生成、用户选择、中止、回退和压缩补齐 characterization tests。
- 固化当前 IPC 事件顺序、消息持久化责任和错误展示行为。
- 不改变用户可见行为。

### 阶段二：建立领域层

- 安装 `xstate`。
- 创建 Supervisor、Session、Turn 和 Agent machines。
- 迁移 Memory 选择、工具过滤、重新生成和回退纯策略。
- 为 machine、guards、selectors 和 policies 添加纯测试。

### 阶段三：接管发送主链路

- 应用级启动 Supervisor。
- 全局监听并路由 Runtime 事件。
- 状态机接管请求准备、发送、Runtime 启动和完成。
- 第一阶段仅创建 Primary Agent actor。
- 删除 `useChatTaskRuntime` 和 `useChatSubmitter` 中已被替代的控制逻辑。

### 阶段四：迁移复杂流程

- 依次迁移用户选择、中止、重新生成、回退和上下文压缩。
- 每迁移一条流程就删除对应旧分支。
- 验证切换会话不会停止原 Session actor。

### 阶段五：组件收口

- 将输入、文件、图片和语音组合迁入 `useChatComposer`。
- 当前会话订阅统一进入 `useChatSessionActor`。
- Toast、Router 和 DOM refs 保留在 Vue hooks 或组件边缘。
- 删除失去职责的旧 hooks 和 utils。

## 测试策略

### 纯 Machine 测试

- 合法状态转移。
- 非法并发提交被拒绝。
- 所有异步状态的成功、失败和取消出口。
- tags 和 selectors 的派生结果。
- Turn 取消级联停止 Agent。

### Supervisor 测试

- 不同会话并行运行。
- 切换订阅后后台 Session 继续运行。
- Runtime 事件按地址路由。
- 迟到、重复和未知事件被忽略。
- 删除会话回收完整 Actor 子树。

### Policy 测试

- Memory 编辑意图和引用提取。
- 工具过滤。
- Runtime 请求数据组装。
- 重新生成边界。
- 回退截断和失效判定。

### Vue Hook 测试

- 当前会话 actor 切换订阅。
- selector 到 Vue refs 的映射。
- UI action 到领域事件的转换。
- BChat 卸载只解除订阅，不停止后台任务。
- renderer rebuild 后按主进程快照重建 actor 路由与待确认交互。

### 组件与回归测试

- 保留关键发送、取消、重新生成、回退和用户选择组件流程。
- 既有消息格式和 Runtime IPC 回归测试继续通过。
- BChat 组件测试不再重复验证 AI 纯策略细节。

## 验收标准

- `src/components/BChat/index.vue` 总行数控制在约 500 行以内。
- BChat 不直接包含 Memory、工具过滤、Runtime 转移、重新生成截断和回退失效策略。
- BChat 不维护 Runtime 忽略集合和任务状态布尔组合。
- 切换会话后原任务继续运行，切回后显示最新持久消息和 Actor 状态。
- 同一会话拒绝并发用户 Turn，不同会话允许并行运行。
- Turn 取消停止 Primary Agent，Agent 失败不串到其他会话。
- 回退后迟到 Runtime 事件不能修改已回退会话。
- 每个异步状态都有完成、失败和取消出口。
- Electron ChatRuntime 的持久化职责和现有消息格式保持兼容。
- 主进程存活期间 renderer rebuild 不会重复启动、误停或遗失活跃 Runtime 路由。
- 现有用户可见行为和测试保持通过。

## 参考资料

- XState v5 文档：https://stately.ai/docs
- XState `setup(...)`：https://stately.ai/docs/setup
- XState Vue 集成：https://stately.ai/docs/xstate-vue
- XState Actor 模型：https://stately.ai/docs/actor-model
- XState 动态 Actor：https://stately.ai/docs/spawn
