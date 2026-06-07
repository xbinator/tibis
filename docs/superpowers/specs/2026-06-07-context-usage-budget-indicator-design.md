<!--
  @file 2026-06-07-context-usage-budget-indicator-design.md
  @description 聊天输入栏上下文用量指示器按可用输入预算展示的设计说明。
-->

# Context Usage Budget Indicator Design

## Background

`src/components/BChatSidebar/components/InputToolbar/ContextUsage.vue` 当前以 `usedTokens / contextWindow` 展示上下文用量。这个口径把完整模型窗口当作可用预算，没有扣除本轮输出预留和安全边界，因此会让输入栏显示偏乐观：用户看到仍有空间，但发送前压缩策略可能已经触发。

本次重构只聚焦输入栏上下文用量指示器和它的上游预算计算，不重构 provider usage、持久化累计 usage 或 `/usage` 面板。

## Goal

- 输入栏指示器展示“扣除输出预留后的真实可用输入预算占用”。
- UI 展示口径与自动压缩阈值复用同一套预算计算。
- `ContextUsage.vue` 只负责展示，不内嵌预算规则。
- 保留现有轻量环形指示器和 hover/dropdown 交互。

## Non-Goals

- 不引入 OpenCode 级别的完整 provider usage schema。
- 不改变 `AIUsage` 的持久化格式。
- 不修改压缩摘要生成流程。
- 不重做输入栏视觉布局。

## Proposed Design

新增一个上下文预算快照模型，由 hook 或纯 util 生成：

```ts
interface ContextUsageBudgetSnapshot {
  /** 当前模型消息切片估算 token 数。 */
  usedTokens: number;
  /** 模型完整上下文窗口。 */
  contextWindow: number;
  /** 预留给输出的 token 数。 */
  reservedOutputTokens: number;
  /** 安全边界 token 数。 */
  safetyMarginTokens: number;
  /** 扣除预留后的真实可用输入预算。 */
  usableInputTokens: number;
  /** usedTokens / usableInputTokens，范围 0-100。 */
  usagePercent: number;
  /** 剩余可用输入预算。 */
  remainingInputTokens: number;
  /** 视觉状态。 */
  status: 'safe' | 'warning' | 'danger';
}
```

预算公式与现有压缩策略保持一致：

```ts
reservedOutputTokens = min(4096, floor(contextWindow * 0.5))
safetyMarginTokens = min(1024, floor(contextWindow * 0.15))
usableInputTokens = max(1, contextWindow - reservedOutputTokens - safetyMarginTokens)
```

`ContextUsage.vue` 接收快照或等价 props，只渲染：

- `估算已用`
- `可用输入预算`
- `输出预留`
- `剩余输入`

环形进度和进度条使用 `usagePercent`。颜色按 `status` 分级：

- `safe`: 小于 65%
- `warning`: 65% 到 90%
- `danger`: 大于等于 90%

## Data Flow

1. `useContextUsage` 继续负责把当前消息切片转换为模型消息并估算 `usedTokens`。
2. 预算 util 根据 `contextWindow` 计算 `reservedOutputTokens`、`safetyMarginTokens` 和 `usableInputTokens`。
3. `useContextUsage` 输出完整 budget snapshot。
4. `BChatSidebar/index.vue` 将 snapshot 传给 `InputToolbar`。
5. `InputToolbar` 将 snapshot 传给 `ContextUsage.vue`。
6. 自动压缩策略复用同一个预算 util，避免 UI 与发送前压缩判断使用不同分母。

## Error Handling

- `contextWindow <= 0` 时，`usableInputTokens` 回退为 1，百分比按 0 处理，避免除零。
- `usedTokens` 小于 0 或非有限数时按 0 处理。
- `usedTokens` 超过 `usableInputTokens` 时，百分比显示封顶 100%，剩余输入显示 0。

## Testing

- 新增纯 util 测试，覆盖输出预留、安全边界、可用输入预算和状态分级。
- 扩展 `useContextUsage` 测试，确认返回值使用 `usableInputTokens` 计算百分比和剩余输入。
- 增加 `ContextUsage.vue` 组件测试或最小渲染测试，确认面板展示“可用输入预算”和“输出预留”。

## Rollout

本次变更不需要数据迁移。现有 `usedTokens` 估算逻辑保留，唯一用户可见变化是输入栏上下文用量的分母从完整 `contextWindow` 改为可用输入预算。
