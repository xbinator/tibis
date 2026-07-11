# Chat 多会话与多 Agent 接入指南

## 文档定位

本文描述 Chat 在未来接入多会话并行和多 Agent 协作时的推荐演进路径。它是扩展约束，不代表这些能力已经全部实现。

当前架构事实以 [ChatRuntime 架构图](chat-runtime-architecture-map.md) 为准。扩展时应保留当前已经稳定的边界：

- 主进程拥有 Runtime 执行、消息持久化、同会话写锁、工具执行和等待中的请求。
- 渲染进程拥有 Actor 状态、UI 订阅、用户决策和只能从界面获取的能力。
- Runtime 启动前，渲染进程先分配 `runtimeId`，再注册 Actor 地址与 capability，最后发起 IPC。
- Runtime 事件只由应用级监听器接收，再按 `runtimeId` 路由到 Session、Turn 和 Agent。
- 切换会话或卸载 `BChat` 不等于取消任务。

## 当前基线

当前 Actor 层级是：

```mermaid
flowchart TD
  Supervisor["Supervisor<br/>renderer 内唯一"] --> SessionA["Session A"]
  Supervisor --> SessionB["Session B"]
  SessionA --> TurnA["当前 Turn"]
  SessionB --> TurnB["当前 Turn"]
  TurnA --> PrimaryA["Primary Agent"]
  TurnB --> PrimaryB["Primary Agent"]
  PrimaryA --> RuntimeA["Main Runtime"]
  PrimaryB --> RuntimeB["Main Runtime"]
```

当前能力和限制如下：

| 范围         | 当前行为                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------- |
| Supervisor   | 可以持有多个 Session actor。                                                                |
| Session      | 同一时间只持有一个活动 Turn。                                                               |
| Turn         | 只持有一个 `primaryAgentRef`。                                                              |
| Agent        | 同一 Agent 生命周期只关联一个活动 Runtime。                                                 |
| 主进程并发   | 不同 Session 可以并行；`send`、`continue` 和用户选择续跑在同一 Session 内受写锁保护。       |
| Runtime 路由 | `runtimeId` 映射到 `{ sessionId, turnId, agentId }`。                                       |
| Runtime 恢复 | 可以恢复活动 Runtime 和待处理请求，但当前恢复时会创建新的 Turn，并把 Agent 视为 `primary`。 |
| UI 订阅      | 应用级监听器始终接收 Runtime 事件；可见 `BChat` 只订阅所属 Session 的 UI 事件。             |

这意味着多会话的底层隔离已经存在，但会话列表状态、后台任务提示和删除策略仍需产品层接入。多 Agent 则仍缺少调度、结果聚合和可恢复的层级协议。

## 不变式

未来扩展必须继续满足以下不变式：

1. **主进程是执行和消息持久化的事实来源。** Renderer 不创建一套并行的 Runtime 消息真相。
2. **所有异步事件都按稳定地址路由。** 不允许根据“当前打开的会话”猜测事件归属。
3. **Runtime capability 按 `runtimeId` 隔离。** 工具、文档上下文和 bridge 能力在启动时冻结，恢复后只能按描述符安全升级。
4. **会话切换不终止后台任务。** 只有明确的取消命令可以停止 Runtime。
5. **同一消息只能有一个写入者。** 子 Agent 不直接修改 Primary 正在流式更新的 assistant 消息。
6. **并发写入必须先有冲突模型。** 在锁粒度、分支和合并策略明确前，不允许同一 Session 内多个写 Runtime 并行。

## 多会话接入

### 目标体验

多会话接入不是简单地多开几个 `BChat`。用户需要在不切换页面的情况下知道后台会话正在做什么，并能可靠地取消、恢复或删除它们。

会话列表至少应显示：

- `idle`：可输入。
- `preparing` 或 `running`：正在执行。
- `waitingForUser`：等待确认或用户选择。
- `cancelling`：正在取消。
- `failed`：最近一次 Turn 失败。

后台会话完成、等待用户或失败时，可以更新列表状态或系统通知，但不应自动切换当前会话。

### 状态来源

会话列表不要订阅每一条消息的完整事件。推荐从 Supervisor 中的 Session actor 快照派生轻量摘要：

```ts
/** 未来建议的会话运行摘要，不是当前已存在的类型。 */
interface ChatSessionRuntimeSummary {
  sessionId: string;
  status: 'idle' | 'preparing' | 'running' | 'waitingForUser' | 'cancelling' | 'failed';
  activeRuntimeId?: string;
  waitingReason?: 'userChoice' | 'confirmation';
  updatedAt: string;
  errorMessage?: string;
}
```

消息列表仍由会话数据存储负责；Actor 摘要只表达流程状态，不复制消息内容。

### 创建与切换

1. 创建持久化会话后，调用 `actorSystem.ensureSession(sessionId)` 创建或取得 Session actor。
2. `BChat` 切换到该会话时，只替换 Session UI 事件订阅和消息数据源。
3. 全局 Runtime 事件监听保持不变，不能随 `BChat` 挂载和卸载重复注册。
4. 命令始终显式携带 `sessionId` 或 `runtimeId`，不能依赖全局 `activeSessionId` 推导后台任务目标。

### 并发规则

当前主进程写锁以 `sessionId` 为粒度，因此：

- Session A 和 Session B 可以同时运行。
- 普通发送、继续生成和用户选择续跑不能在同一 Session 内重叠，冲突时主进程返回 `SESSION_BUSY`。
- 手动压缩当前会登记活动 Runtime，但没有复用 Session 写锁。接入后台多会话前，应明确“运行中禁止手动压缩”或让 compact 进入同一锁协议。
- UI 收到 `SESSION_BUSY` 时，应刷新错误所属 Session 的状态，而不是把错误归到当前可见会话。

### 删除会话

删除带活动 Runtime 的会话必须是显式策略，推荐流程是：

1. 查询该 Session 是否存在活动 Runtime。
2. 提示用户“取消任务并删除”，或阻止删除。
3. 逐个取消该 Session 的 Runtime，并等待主进程释放锁。
4. 清理 Runtime 路由、capability、Session actor 和持久化数据。

不应只移除侧边栏项目而让主进程 Runtime 继续写入一个已删除会话。

### Renderer 重载恢复

应用启动时继续通过 `src/hooks/useChatRuntimeRecovery.ts` 获取活动 Runtime。多会话恢复应遵循：

- 按 `sessionId` 独立创建 Session actor。
- 先恢复 Actor 地址和降级 capability，再重放待处理 renderer 请求。
- 可见 `BChat` 挂载后，只升级属于该会话且描述符匹配的 capability。
- 同一 Session 若返回多个活动写 Runtime，应视为主进程约束被破坏并记录错误，不能静默覆盖。

## 多 Agent 接入

### 第一阶段选择

第一版推荐实现**同一 Turn 内串行子 Agent**，而不是立即允许并行写入：

- Primary 负责规划、派发和最终回复。
- Child Agent 每次只运行一个，完成后把结构化结果交回协调器。
- Child Agent 默认不直接生成用户可见消息。
- Primary 消费结果后继续执行或形成最终回答。

这与当前同 Session 单写锁一致，也能先验证 Agent 生命周期、权限隔离、取消和恢复协议。

### 推荐 Actor 层级

不要为了未来可能存在的子 Agent，立即把当前 `primaryAgentRef` 改回通用 Map。启用多 Agent 后，可以按需增加协调器：

```mermaid
flowchart TD
  Session["Session"] --> Turn["Turn"]
  Turn --> Primary["Primary Agent"]
  Turn --> Coordinator["Agent Coordinator<br/>按需创建"]
  Coordinator --> ChildA["Child Agent A"]
  Coordinator --> ChildB["Child Agent B"]
  Primary --> PrimaryRuntime["Primary Runtime"]
  ChildA --> ChildRuntimeA["Child Runtime A"]
  ChildB --> ChildRuntimeB["Child Runtime B"]
```

职责划分：

| Actor             | 职责                                         |
| ----------------- | -------------------------------------------- |
| Session           | 一个会话的输入门禁、当前 Turn、取消和回滚。  |
| Turn              | 一个用户意图的总生命周期，决定何时整体完成。 |
| Primary Agent     | 用户可见的主要推理和最终回答。               |
| Agent Coordinator | 创建子 Agent、排队、收集结果、执行失败策略。 |
| Child Agent       | 执行一个边界清楚的子任务，输出结构化结果。   |

Coordinator 只有在首个子 Agent 被派发时才创建。未启用多 Agent 的普通聊天继续保持当前简单路径。

### Runtime 地址协议

当前 Renderer 地址已有 `sessionId`、`turnId`、`agentId` 和 `runtimeId`，主进程 Runtime 已有 `agentId` 与 `parentRuntimeId`。多 Agent 恢复前，需要把层级元数据补齐到跨进程快照：

```ts
/** 未来建议的完整 Runtime 地址，不是当前已存在的共享类型。 */
interface ChatRuntimeAddress {
  sessionId: string;
  turnId: string;
  agentId: string;
  runtimeId: string;
  parentAgentId?: string;
  parentRuntimeId?: string;
  rootRuntimeId: string;
  role: 'primary' | 'child';
}
```

字段语义：

- `turnId`：把重载前后的 Runtime 放回同一个 Turn。
- `agentId`：Agent 在 Turn 内的稳定标识。
- `parentAgentId`：Actor 层级关系。
- `parentRuntimeId`：执行派生关系，表示哪个 Runtime 发起了当前 Runtime。
- `rootRuntimeId`：快速聚合同一次 Turn 的 Runtime 树。
- `role`：决定消息可见性和默认权限策略。

`parentRuntimeId` 不能替代 `parentAgentId`。Agent 可能续跑多个 Runtime，Renderer 重载后也不能仅靠当前活动 Runtime 推断稳定 Actor 父子关系。

### 启动顺序

子 Agent 与 Primary 使用相同的竞态保护：

1. Coordinator 分配 `agentId` 和 `runtimeId`。
2. 创建 Child Agent actor。
3. 注册完整 Runtime 地址和 capability。
4. 向 Agent 发送 `runtime.started`，进入运行态。
5. 最后调用主进程 IPC。
6. IPC 同步失败时，向该 Agent 发送启动失败事件并注销路由。

不能先调用 IPC 再注册路由，否则首批流式事件可能找不到所属 Agent。

### 结果与消息归属

子 Agent 默认返回结果信封，而不是直接向用户消息流追加 assistant 消息：

```ts
/** 未来建议的子 Agent 结果，不是当前已存在的类型。 */
interface ChatAgentResult {
  agentId: string;
  runtimeId: string;
  status: 'completed' | 'cancelled' | 'failed';
  output?: unknown;
  artifacts?: Array<{ kind: string; reference: string }>;
  errorMessage?: string;
}
```

建议的可见性规则：

- Primary 的 user/assistant 消息属于正常聊天历史。
- Child 的过程消息默认内部可见，可存成独立 Agent 记录或带明确可见性元数据的消息。
- Child 结果由 Coordinator 交给 Primary，Primary 决定摘要、引用或继续派发。
- 若产品要展示“子 Agent 工作台”，它读取 Agent 记录，不复用主聊天气泡作为调度协议。

### 工具与 capability

每个 Runtime 必须拥有独立 capability 快照：

- Child 不能隐式使用当前可见编辑器的上下文。
- 文档能力必须绑定明确的 `documentId`，磁盘工具必须绑定明确的工作区和权限。
- Child 只获得完成子任务所需的工具，不继承 Primary 的全部工具。
- Renderer 重载后的 capability 升级必须同时匹配 Runtime 描述符、文档和 Agent 角色。
- 需要用户确认的操作始终携带 `runtimeId`，决策返回原 Runtime。

当前确认控制器适合串行流程。允许同一 Session 内 Agent 并行后，需要把“单个当前确认”升级为按 Runtime 排队的请求集合，并在 UI 中显示请求来自哪个会话和 Agent。

### 取消与失败

需要区分三种取消：

| 操作               | 推荐语义                                                      |
| ------------------ | ------------------------------------------------------------- |
| 取消 Child Agent   | 只中止该 Child Runtime，由 Coordinator 决定重试、降级或继续。 |
| 取消 Turn          | 级联取消 Primary 和所有未完成 Child，然后等待全部终止。       |
| 删除或关闭 Session | 不自动取消；只有明确的“取消任务并删除”才级联终止。            |

Child 任务在派发时应声明 `required` 或 `optional`：

- `required` 失败会使 Turn 失败，或由 Primary 明确重试。
- `optional` 失败会作为结构化结果返回，Primary 可以继续回答。
- Turn 只有在 Primary 完成且所有 required Child 已进入终态后才能完成。

## 真正并行前的前置条件

并行只读 Child Agent 可以较早开放，但同 Session 并行写入必须先完成以下设计：

1. 将主进程锁从单一 Session 写锁细化为可表达读写意图的锁协议。
2. 为文档或工作区写入定义冲突域，不能只比较工具名。
3. 为多个 Agent 的消息、文件和编辑结果定义分支与合并策略。
4. 确认请求、bridge 请求和 renderer 工具请求能按 Runtime 并发排队和恢复。
5. 定义父 Agent 提前完成、失败或取消时对子 Runtime 的级联规则。

在这些条件完成前，可以并行执行完全隔离、无副作用的读取或分析任务；任何写工具仍需串行。

## 分阶段实施

### 阶段 0：补齐多会话产品层

- 会话列表接入 Session actor 摘要。
- 显示后台运行、等待确认、失败和完成状态。
- 会话切换不影响全局监听和 Runtime 生命周期。
- 删除活动会话执行明确的取消策略。

### 阶段 1：串行子 Agent

- 增加按需创建的 Agent Coordinator。
- 定义 Child Agent 请求和 `ChatAgentResult`。
- 使用当前 Session 写锁串行启动 Child Runtime。
- Primary 聚合 Child 结果并生成唯一用户可见回复。

### 阶段 2：可恢复层级与交互

- Runtime 输入、事件和恢复快照补充 `turnId`、`parentAgentId`、`rootRuntimeId` 与 `role`。
- 恢复时重建原 Turn、Coordinator 和 Agent 树，不再把所有 Runtime 归为 `primary`。
- 待确认、bridge 和 renderer 工具请求按 Runtime 恢复。

### 阶段 3：并行只读 Agent

- Coordinator 支持有限并发和最大子任务数。
- capability 标注读写级别，并只并行无副作用工具。
- 处理乱序完成、局部失败、取消和超时。

### 阶段 4：受控并行写入

- 引入资源级锁或隔离分支。
- 提供冲突检测、合并和回滚。
- UI 明确展示待合并变更及其 Agent 来源。

## 测试清单

### 多会话

- 不同 Session 的 Runtime 可以同时运行，事件不会串会话。
- 同一 Session 的第二个 send、continue 或用户选择续跑 Runtime 被稳定拒绝。
- 手动 compact 与活动生成的并发策略有明确测试，不会同时改写同一会话历史。
- 切换或卸载 `BChat` 后后台 Runtime 继续，重新进入后状态正确。
- Renderer 重载后，各 Session 的活动 Runtime 和待确认请求分别恢复。
- 删除活动会话不会遗留 Runtime、路由、capability 或写锁。

### 多 Agent

- Child Runtime 在 IPC 前完成地址和 capability 注册。
- Child 完成顺序变化不会改变结果归属。
- Primary 不会被 Child 事件误标为完成或失败。
- Turn 取消会级联到所有未完成 Child。
- optional Child 失败不阻断 Turn，required Child 失败遵守策略。
- capability 不会跨 Agent、文档或 Runtime 泄漏。
- 重载后能恢复原 `turnId`、父子 Agent 和待处理请求。
- 同 Session 并行写入在功能开放前始终被拒绝。

## 禁止的捷径

- 不在组件中新增第二套全局 Runtime 事件监听。
- 不用当前可见 `sessionId`、编辑器或 Tab 推断后台 Runtime 上下文。
- 不让 Child Agent 直接修改 Primary 的 assistant 草稿。
- 不共享可变工具数组或动态“当前文档”闭包作为跨 Runtime capability。
- 不仅凭 `parentRuntimeId` 重建 Agent 树。
- 不在缺少冲突与合并协议时绕过 Session 写锁。
- 不为了尚未实现的并行能力提前把简单的 Primary 路径抽象成通用调度框架。

## 相关文件

- `src/ai/chat/actorSystem.ts`
- `src/ai/chat/machine/supervisorMachine.ts`
- `src/ai/chat/machine/sessionMachine.ts`
- `src/ai/chat/machine/turnMachine.ts`
- `src/ai/chat/machine/agentMachine.ts`
- `src/hooks/useChatRuntimeEvents.ts`
- `src/hooks/useChatRuntimeRecovery.ts`
- `src/components/BChat/hooks/useChatRuntimeLauncher.ts`
- `electron/main/modules/chat/runtime/service.mts`
- `electron/main/modules/chat/runtime/infrastructure/locks.mts`
- `types/chat-runtime.d.ts`
