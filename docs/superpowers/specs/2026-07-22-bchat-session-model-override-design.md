# BChat 会话级模型临时切换设计

> [!NOTE]
> 本文记录的会话内存临时模型方案已废弃。当前实现采用可恢复的 session metadata，见 [BChat Session Model Metadata Design](2026-07-22-bchat-session-model-metadata-design.md)。

## 背景

`BChat` 当前通过 `useModelSelection` 从 `useServiceModelStore.chatModel` 读取选中模型。用户在 `InputToolbar` 切换模型后，`onModelChange` 总是调用 `serviceModelStore.setChatModel`，同时更新 Pinia 状态并把模型持久化为 chat 场景的全局默认配置。

这会导致已有会话切换模型时覆盖全局默认模型，继而影响其他会话和之后创建的新会话。与此同时，主进程 ChatRuntime 当前也从全局 chat 模型配置解析实际调用模型；如果只把已有会话的下拉框改为局部状态，会出现 UI 显示的新模型与实际请求模型不一致。

## 目标

- 没有活动 `sessionId` 的草稿切换模型时，继续更新并持久化全局 chat 默认模型。
- 已有活动 `sessionId` 的会话切换模型时，只在当前会话内存状态中生效，不更新 Pinia store，不写入持久化配置。
- 工具栏下拉框与 `/model` 命令面板复用同一切换入口，不能从命令面板绕过会话隔离规则。
- 已有会话后续发送、续轮和手动上下文压缩均使用该会话当前选择的临时模型。
- 不同已有会话的临时模型互相隔离；切回仍处于同一 `BChat` 生命周期内的会话时恢复其临时选择。
- 主进程校验并使用 renderer 随 Runtime 请求提供的模型标识，确保 UI 与实际调用一致。
- 应用重启或对应 `BChat` 卸载后不恢复会话临时模型；没有临时选择时使用全局默认模型。

## 非目标

- 不给 `ChatSession` 增加模型字段，不迁移聊天会话数据库。
- 不把会话临时模型放入新的 Pinia store 或现有 session store。
- 不改变模型下拉框的视觉样式和交互方式。
- 不改变设置页中 chat 默认模型的配置行为。
- 不持久化已有会话最后使用的模型。

## 方案比较

### 会话内存覆盖并随 Runtime 请求传递

在 `BChat` 模型选择 hook 中按 `sessionId` 保存临时模型，并把当前有效模型作为 Runtime 请求快照传给主进程。主进程优先解析请求模型，没有请求模型时回退全局默认配置。

该方案不污染全局状态，能够保证界面与真实请求一致，并保留旧调用方的默认模型回退行为，是本次采用的方案。

### 请求前临时替换全局模型

发送前把会话模型写入全局配置，Runtime 启动后再恢复原配置。该方案会触发持久化和全局更新事件，并且多个会话并发请求时可能互相覆盖模型，因此不采用。

### 将模型持久化到 ChatSession

给会话表增加模型字段，可在应用重启后恢复每个会话的模型。该方案需要数据库迁移，且违反“已有会话切换不保存”的要求，因此不采用。

## Renderer 状态设计

### 模型选择状态

`useModelSelection` 接收当前 `activeSessionId`，内部维护仅属于当前 `BChat` 实例的会话模型映射：

- `activeSessionId` 为空时，当前模型来自 `serviceModelStore.chatModel`。
- `activeSessionId` 存在且该会话已有临时选择时，当前模型来自会话模型映射。
- `activeSessionId` 存在但没有临时选择时，当前模型回退到 `serviceModelStore.chatModel`。

`selectedModel`、`supportsVision` 和 `contextWindow` 均从上述当前模型派生，确保图片能力、上下文窗口和工具栏展示同步切换。

模型切换动作按活动会话 ID 分流：

- 草稿态调用 `serviceModelStore.setChatModel(model)`，保持现有乐观更新和持久化行为。
- 已有会话只更新当前 `BChat` 的会话模型映射，不调用任何 service model store 写入 action。

判断边界统一使用 `useChatSessionRuntime.activeSessionId`，而不是只读取外部 `props.sessionId`。这样首条消息创建会话后，即使宿主尚未完成路由或标签晋升，后续模型切换也会被识别为已有会话操作。

### 组件协调

`InputToolbar` 和 `ModelSelector` 继续只发布 `model-change` 事件，不感知 session 或 store。

`BChat/index.vue` 负责把 `activeSessionId` 接入模型选择状态，并继续向工具栏传递统一的 `selectedModel`。为解除 composer 初始化与 session runtime 之间的现有依赖环，使用一个由 `activeSessionId` 同步的局部会话 ID ref 作为模型选择 hook 的输入；该 ref 不承担持久化职责。

全局 `BCommandPanel` 的模型 scope 支持由打开方提供可选的“当前模型读取”和“模型切换”回调。`BChat` 通过 `/model` 或缺少模型提示打开命令面板时，传入 `selectedModel` 与 `onModelChange`；命令面板从其他全局入口打开且没有调用方回调时，继续读取和更新 `serviceModelStore.chatModel`。运行时回调保存在 command panel store 的模块闭包中，关闭面板后立即清理，不写入 Pinia state。

`useChatServiceConfig` 改为根据当前选中模型解析工具支持能力，不再为已有会话重新读取全局 chat 模型作为本轮模型来源。

## Runtime 请求模型快照

新增仅包含 `providerId` 和 `modelId` 的 Runtime 模型选择类型，并在以下输入中携带可选模型快照：

- `ChatRuntimeSendInput`
- `ChatRuntimeContinueInput`
- `ChatRuntimeCompactInput`
- `ChatRuntimeSubmitUserChoiceInput`

renderer 构建 Runtime 请求配置时写入当前 `selectedModel`。请求准备完成后，该模型随本轮配置冻结；用户随后切换下拉框不会改变已经启动的 Runtime。

草稿请求也显式携带当前模型。虽然草稿切换仍会保存全局默认配置，但显式快照可以避免持久化尚未完成时主进程读取到旧模型。

模型快照不包含 API Key、Base URL 或其他 Provider 密钥信息。敏感配置继续由主进程根据 `providerId` 读取。

## 主进程模型解析

ChatRuntime 模型解析器支持一个可选的请求模型：

1. 请求包含模型时，使用请求中的 `providerId` 和 `modelId`。
2. 请求没有模型时，读取现有全局 chat 默认配置，保持向后兼容。
3. 两种来源都通过主进程 Provider 配置校验服务商和模型是否启用。
4. 校验成功后再生成 `AICreateOptions`，renderer 不参与密钥解析。

每次发送或续轮启动 Runtime 时，都冻结当时的会话模型；正在运行的流式调用及其自动上下文压缩使用同一个模型解析结果，不受后续下拉框切换影响。手动压缩则使用 `ChatRuntimeCompactInput` 在发起压缩时携带的当前会话模型。

## 数据流

```text
模型下拉框切换
      │
      ├── activeSessionId 为空
      │       └── setChatModel ── 更新 Store + 持久化全局默认模型
      │
      └── activeSessionId 存在
              └── sessionModelMap[sessionId] = model
                          │
                          ├── UI / supportsVision / contextWindow
                          └── Runtime 请求 model 快照
                                      │
                                      └── 主进程校验 Provider 与模型
                                                  │
                                                  └── 实际模型调用
```

切换会话时，模型来源按目标 `sessionId` 重新计算。目标会话没有临时模型时显示全局默认模型，但不会因此向 store 写入任何内容。

## 错误与并发处理

- 草稿模型持久化沿用 `setChatModel` 的乐观更新和版本保护。
- 已有会话的局部切换是同步内存更新，不产生异步持久化错误。
- 主进程对请求模型进行权威校验；模型或 Provider 已被禁用时沿用现有“缺少可用模型”错误路径，不回退到另一个模型静默发送。
- 每个 Runtime 在准备阶段冻结模型，多个会话并发请求不会共享可变模型状态。
- 会话模型映射仅存在于对应 `BChat` 实例中，不会跨组件实例串用。

## 测试设计

### 模型选择 hook

- 草稿态切换调用 `setChatModel` 并更新当前模型。
- 已有会话切换不调用 `setChatModel`，但更新 `selectedModel`、视觉能力和上下文窗口。
- 两个 session ID 的临时选择互相隔离，切换回来后恢复各自选择。
- 从已有会话回到草稿态时重新读取全局默认模型。
- Provider 或模型禁用时不向 UI 暴露无效的临时模型。
- 从 `BChat` 打开的 `/model` 命令面板读取当前会话模型并调用会话级切换回调；普通全局打开仍使用 service model store。

### Runtime 请求配置

- 发送、普通续轮、用户选择续跑和手动压缩输入均携带当前模型快照。
- 模型快照只包含 `providerId` 和 `modelId`。
- 请求准备完成后切换 UI 模型不会修改已冻结的请求配置。

### 主进程模型解析

- 请求模型有效时优先于全局默认模型。
- 请求模型缺失时回退全局默认模型。
- 请求 Provider 不存在、被禁用或模型被禁用时拒绝解析。
- 并发 Runtime 分别使用各自的模型快照。
- 自动压缩、续轮和手动压缩使用对应 Runtime 或请求的模型。

## 验收标准

- 新会话草稿切换模型后，之后创建的新会话默认使用该模型。
- 已有会话从模型 A 切换到模型 B 后，工具栏显示模型 B，后续真实请求也使用模型 B。
- 上述切换不改变 `serviceModelStore.chatModel`，其他会话和新草稿仍使用模型 A。
- 两个已有会话可以在同一应用运行期间分别选择不同模型，互不影响。
- 重启应用后，已有会话临时选择不会恢复，并重新显示全局默认模型。
- 现有未携带模型的 Runtime 调用仍能通过全局默认配置工作。
