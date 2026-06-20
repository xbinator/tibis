# 2026-06-20 Chat Runtime Stream Executor Refactor Design

## Summary

将 `electron/main/modules/chat/runtime/stream-executor.mts` 拆分为 `electron/main/modules/chat/runtime/stream/` 目录，并按职责划分到多个 focused 文件。旧 `stream-executor.mts` 文件将被完全删除，消费者统一从新的目录入口导入。

本次拆分顺带修复上一轮 code review 中发现的 4 个行为问题：多工具调用状态覆盖、JSON 增量解析闪烁、未注册工具无反馈、兜底请求丢失多模态内容，以及 1 处类型安全改进（错误码集合绑定到联合类型）。

## Goals

- 降低 `stream-executor.mts` 的维护负担，将 chunk 规范化、工具执行、消息片段写入、请求构建、主循环拆到独立文件。
- 保持对外公共 API 不变：`createRuntimeStreamExecutor` 与 `RuntimeStreamText` 类型仍通过 `stream/index.mts` 导出。
- 修复多工具调用时 `continue/stop` 状态被最后一个工具结果覆盖的正确性 bug。
- 修复流式 JSON 增量解析失败时 `input` 被清空导致的 UI 闪烁。
- 修复模型调用未注册工具时无任何失败反馈、前端工具卡片一直卡在 `executing` 的问题。
- 修复 `sourceMessages` 为空时，`userMessage` 的多模态内容（图片文件）在模型请求中丢失的问题。
- 将 `TOOL_EXECUTION_ERROR_CODES` 从 `Set<string>` 改为 `ReadonlySet<AIToolExecutionError['code']>`，提升类型安全。

## Non-Goals

- 不改变 `ChatRuntimeStreamExecutor` 的函数签名与返回语义。
- 不修改 `types/ai` 或 `types/chat` 中的类型定义。
- 不改动 model resolver、tool runtime、context budget 等相邻模块。
- 不引入新的外部依赖。

## New File Structure

```
electron/main/modules/chat/runtime/stream/
├── index.mts          # 对外导出 createRuntimeStreamExecutor / RuntimeStreamText
├── types.mts          # RuntimeStreamChunk 联合类型、RuntimeStreamExecutorDependencies 等接口
├── chunks.mts         # toRuntimeStreamChunk、normalizeToolResult、normalizeUsage 等 chunk 规范化逻辑
├── tools.mts          # 工具分类（isMainProcessTool / isRendererManagedTool）、安全执行、失败/超时结果工厂
├── message-parts.mts  # appendTextDelta / appendReasoningDelta / appendToolInput* / appendToolCall / appendToolResult / finishAssistantMessage
├── request.mts        # createRuntimeStreamRequest（含多模态兜底修复）
└── executor.mts       # createRuntimeStreamExecutor 主循环（含多工具状态累积修复）
```

### 职责边界

- `types.mts`：所有内部类型，避免循环依赖；`executor.mts` 和 `tools.mts` 等只消费类型。
- `chunks.mts`：只负责把 AI SDK 原始 chunk 转换为 runtime 可消费的 union type，不接触消息状态。
- `tools.mts`：只负责“工具能不能执行、怎么执行、执行失败怎么表达”，不接触消息状态。
- `message-parts.mts`：只负责把 chunk / tool result 写入 `ChatMessageRecord`，不发起执行。
- `request.mts`：只负责组装 `AIRequestOptions`。
- `executor.mts`：负责编排主循环，把上述模块连接起来。

## Bug Fixes Mapping

| 问题 | 所在文件 | 修复方式 |
|---|---|---|
| 多工具调用时 `continue/stop` 被覆盖 | `executor.mts` | 引入 `executedToolCount`、`allToolsContinueable`、`anyToolStopped`；`continue` 用 `&&` 累积，`stop` 用 `\|\|` 累积；最终 `shouldContinue` 要求 `executedToolCount > 0` |
| 流式 JSON parse 失败清空 `input` | `message-parts.mts` | `catch` 分支不再赋 `null`，保留上一次成功解析值 |
| 未注册工具无失败反馈 | `tools.mts` + `executor.mts` | 新增 `createUnknownToolFailureResult(toolName)`，错误码为 `'TOOL_NOT_FOUND'`；`tool-call` 分支 `else` 兜底写入失败结果 |
| 兜底请求丢失多模态 | `request.mts` | `messages: toRuntimeModelMessages(sourceMessages?.length ? sourceMessages : [userMessage])` |
| 错误码集合类型弱 | `tools.mts` | `const TOOL_EXECUTION_ERROR_CODES: ReadonlySet<AIToolExecutionError['code']> = new Set([...])` |

## Public API Changes

唯一变更的是导入路径：

- `electron/main/modules/chat/runtime/service.mts`
  - `import { createRuntimeStreamExecutor } from './stream-executor.mjs'`
  - → `import { createRuntimeStreamExecutor } from './stream/index.mjs'`

- `test/electron/main/modules/chat/runtime/stream-executor.test.ts`
  - 迁移到 `test/electron/main/modules/chat/runtime/stream/executor.test.ts`，并按模块拆分出：
    - `stream/chunks.test.ts`
    - `stream/tools.test.ts`
    - `stream/message-parts.test.ts`
    - `stream/request.test.ts`
    - `stream/executor.test.ts`
  - 如测试拆分工作量过大，可先整体迁移 `stream-executor.test.ts` → `stream/executor.test.ts`，后续再按模块细化。

## Test Plan

- 现有 `stream-executor.test.ts` 中的用例全部迁移/拆分后必须继续通过。
- 新增用例：
  - 同一流内多个工具调用，其中一个返回 `cancelled`，验证第二个工具不再执行且返回 `{}`。
  - 同一流内多个工具调用全部成功且 `finishReason === 'tool-calls'`，验证返回 `{ usage, shouldContinue: true }`。
  - 未注册工具调用后，`assistantMessage.parts` 中对应 tool part 状态变为 `done`，`result` 为 `TOOL_NOT_FOUND` 失败结果。
  - 流式工具输入增量在未闭合前 `input` 不闪烁（可检查中间状态不为 `null`）。
  - `sourceMessages` 为空且 `userMessage.files` 包含图片时，`streamText` 收到的 `messages` 包含 image content。

## Risks & Verification

- **路径变更风险**：`service.mts` 是 `stream-executor` 的唯一运行时消费者，迁移路径后需确认构建能解析到 `stream/index.mjs`。
- **行为回归风险**：多工具状态累积逻辑改变后，需重点验证“取消后停止当前流”与“全部成功后续跑”两个场景。
- **类型检查**：拆分后模块间 import 增加，需运行 `pnpm exec tsc --noEmit` 确认无循环依赖和类型错误。
- **验证命令**：
  - `pnpm test test/electron/main/modules/chat/runtime/stream`
  - `pnpm lint`
  - `pnpm exec tsc --noEmit`
