# AI Runtime 可靠性收尾设计

## 目标

完成 AI SDK 7 迁移后的运行边界收口：统一 Node.js 版本声明，移除旧流事件兼容层，明确单步与累计 Token 用量，并用不可配置的内部策略限制工具循环和模型请求时长。

## 环境约束

- `package.json` 继续声明 Node.js `>=22`。
- `README.md` 与 `docs/code-wiki/08-development.md` 同步声明 Node.js `>=22`。
- `.nvmrc` 固定为 Node.js 22，用于本地和自动化环境验证最低支持版本。
- `.github/workflows/release.yml` 不再使用已停止维护的奇数版本 Node.js 25，改为 Node.js 22。

## 流式类型边界

`types/ai.d.ts` 直接使用 AI SDK 7 的 `AsyncIterableStream<TextStreamPart<ToolSet>>` 描述完整事件流。`electron/main/modules/chat/runtime/stream/index.mts` 不再把流强制转换为 `AsyncIterable<unknown>`。

`electron/main/modules/chat/runtime/stream/chunks.mts` 只接受 AI SDK 7 的 `TextStreamPart<ToolSet>`：

- `tool-input-start` 与 `tool-input-end` 使用 SDK 的 `id`。
- `tool-input-delta` 使用 SDK 的 `id` 与 `delta`。
- `tool-call` 和 `tool-result` 使用 SDK 的 `toolCallId`。
- `tool-result` 只读取 SDK 7 的 `output`。
- 删除 `tool-input-available` 旧事件及对应 Runtime 类型。

Tibis 内部仍统一使用 `toolCallId` 与 `inputTextDelta`，映射只发生在 SDK 事件规范化边界。

## Usage 语义

AI 服务边界同时暴露两种用量：

- `stepUsage`：最后一个模型步骤的用量。
- `totalUsage`：一次 AI SDK 调用中所有步骤的累计用量。

同步调用从 `finalStep.usage` 和顶层 `usage` 分别读取两种值。流式调用从最后一个 `finish-step.usage` 和最终 `finish.totalUsage` 分别读取两种值。

Chat Runtime 的 `ChatMessageRecord.usage` 保持现有业务语义：整条 assistant 回复的累计用量。若 Runtime 因 Renderer 工具发起多次模型请求，则累加每次请求的 `totalUsage`。数据库结构不变。

## 固定运行策略

策略由 `electron/main/modules/ai/tool-loop-policy.mts` 集中维护，不进入设置页，也不允许渲染进程请求覆盖：

- 总调用超时：300 秒。
- 单模型步骤超时：120 秒。
- 流 chunk 停滞超时：90 秒。
- SDK 托管工具超时：60 秒。
- 总生成步骤上限：5。

主聊天由 Chat Runtime 作为唯一工具续轮控制者。每次 SDK 调用只生成一个模型步骤，Runtime 在跨调用边界累计步骤、任务剩余时间和工具调用快照；第五步或连续两个步骤出现同名且输入相同的调用时，下一次模型调用固定使用 `toolChoice: 'none'` 生成最终回答。一次用户任务的 300 秒时限会换算为每次 SDK 调用的剩余超时，避免多次续轮分别获得完整的 300 秒。

非 Chat Runtime 的直接 AI 调用仍由 AI SDK 托管 Tavily 与 MCP 多步循环，使用相同的五步上限、重复调用收口和固定超时。Renderer、本地主进程、Tavily 与 MCP 在主聊天中不再形成嵌套的两套循环。

Runtime 只有在最终 `finishReason` 为 `tool-calls`、确实得到可继续的工具结果且尚未进入最终步骤时才发起下一次模型调用。`stop` 等结束原因不会因流中曾出现工具结果而误触发额外续轮。

## 错误与日志

模型超时沿用 AI 服务现有错误归一化边界，不记录 prompt、消息正文、工具输入或工具输出。停止策略只记录脱敏原因和步骤计数；本轮不引入用户可配置项或新的持久化字段。

AI SDK 7 的 `tool-error`、`tool-output-denied`、审批拒绝与 `abort` 会转换为明确的 Runtime 终态或错误。`file` 与 `reasoning-file` 在尚未具备应用载荷协议前保留为显式 unsupported 事件；事件联合使用穷举分支，使后续 SDK 增加事件类型时触发类型检查，而不是静默丢弃。

## 测试范围

- AI 服务测试覆盖固定超时、SDK 五步硬上限、Runtime 接管续轮和最终步骤禁用工具。
- 工具循环策略测试覆盖正常继续、最后一步收口、跨轮重复调用收口和任务剩余时间。
- 流式规范化测试覆盖 SDK 7 的 `id`、`delta`、`output`、`finish-step` 与 `finish`。
- Chat Runtime 测试验证任务最多五个模型步骤、重复调用提前收口、`finishReason` 续轮判断，以及消息只累计 `totalUsage`。
- 完整执行 ESLint、Stylelint、TypeScript、Vitest 与构建检查。
