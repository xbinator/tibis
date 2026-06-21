# BEditor Inline Completion Design

## Goal

为 BEditor Markdown 编辑器增加语义级内联补全能力。用户在编辑停顿后，AI 在光标后方显示灰色 ghost text；用户按 `Tab` 接受，按 `Esc` 忽略，继续输入、移动光标、失焦或切换视图时自动取消。

v1 采用 Rich 优先实现，再接入 Source。两种 pane 必须通过同一套 `InlineCompletionAdapter` 协议接入，状态机、请求编排、上下文提取、prompt 组装与观测逻辑不得分叉。

## Scope

- 第一阶段实现 Rich 模式，落点为 `src/components/BEditor/panes/PaneRichEditor.vue` 与 TipTap/ProseMirror extension。
- 第二阶段实现 Source 模式，落点为 `src/components/BEditor/panes/PaneSourceEditor.vue` 与 CodeMirror extension。
- 内联补全使用 AI 一次性 `invoke`，完整结果返回后统一 sanitize 再渲染 ghost text。
- v1 不做逐字流式显示，不做 RAG chunks，不做多候选切换，不做用户自定义 prompt 模板，不做跨文件上下文。
- 现有 `invoke` 通道暂不支持真正 abort。v1 使用 request token、docVersion、cursor position 与 timeout 丢弃过期结果，后续再增强 `ai:invoke` abort。

## Architecture

内联补全拆成四层：

1. `src/components/BEditor/hooks/useInlineCompletion.ts`
   - 持有唯一状态机。
   - 处理 debounce、IME 冻结、触发条件、request token、timeout、过期结果丢弃、接受和取消。
   - 只依赖 adapter 协议，不直接依赖 TipTap 或 CodeMirror。

2. `src/components/BEditor/adapters/inlineCompletionAdapter.ts`
   - 定义 Rich 和 Source 共用协议。
   - 暴露读取光标、读取文档版本、显示/清理 ghost text、接受 ghost text、绑定用户交互、销毁资源等能力。

3. `src/components/BEditor/extensions/richInlineCompletion.ts`
   - 提供 TipTap/ProseMirror plugin。
   - 通过 decoration 在当前光标后渲染 ghost text。
   - 拦截 `Tab` 和 `Esc`，优先处理正在显示的 ghost text。
   - 使用单个 ProseMirror transaction 接受补全文本，保证进入 undo/redo 历史栈。

4. `src/components/BEditor/extensions/sourceInlineCompletion.ts`
   - 第二阶段提供 CodeMirror ViewPlugin 与 decoration。
   - 实现同一 adapter 协议，复用状态机和上下文层。

`src/components/BEditor/Markdown.vue` 继续只负责 Rich/Source 互斥挂载和上层浮层编排，不持有 inline completion 状态机。每个 pane instance 自己创建 adapter 与状态机，并在 unmount 时销毁。

## Adapter Contract

```ts
/**
 * 内联补全所在编辑器视图。
 */
export type InlineCompletionPane = 'rich' | 'source';

/**
 * 光标位置快照。
 */
export interface InlineCompletionCursorPosition {
  /** 编辑器内绝对位置 */
  absolutePosition: number;
}

/**
 * 一次补全请求的稳定令牌。
 */
export interface InlineCompletionRequestToken {
  /** 本轮请求 ID */
  requestId: string;
  /** 请求发起时的文档版本 */
  docVersion: number;
  /** 请求发起时的光标位置 */
  cursorPosition: InlineCompletionCursorPosition;
}

/**
 * 用户与编辑器交互类型。
 */
export type InlineCompletionUserInteraction = 'input' | 'cursor' | 'blur' | 'compositionStart' | 'compositionEnd';

/**
 * Pane 级内联补全适配器。
 */
export interface InlineCompletionAdapter {
  /** 当前 pane 类型 */
  readonly pane: InlineCompletionPane;
  /** 读取当前光标位置 */
  getCursorPosition(): InlineCompletionCursorPosition;
  /** 读取当前文档版本 */
  getDocVersion(): number;
  /** 读取当前完整文档文本 */
  getDocumentText(): string;
  /** 在指定令牌对应的位置显示 ghost text */
  showGhost(text: string, requestToken: InlineCompletionRequestToken): void;
  /** 清理当前 ghost text */
  hideGhost(): void;
  /** 接受当前 ghost text，并写入编辑器历史栈 */
  acceptGhostText(text: string): Promise<void>;
  /** 绑定输入、光标、失焦与 IME 交互事件 */
  onUserInteraction(callback: (type: InlineCompletionUserInteraction) => void): () => void;
  /** 销毁 adapter 资源 */
  destroy(): void;
}
```

## State Machine

状态集合：

- `idle`：无补全活动。
- `triggering`：debounce 结束，准备提取上下文与发起请求。
- `loading`：已发起 AI 请求，等待完整响应。
- `showing`：ghost text 已渲染，等待用户接受或取消。
- `accepting`：用户接受，正在将 ghost text 写入文档。
- `cancelling`：正在清理 ghost text 与请求状态。
- `error`：请求失败，本轮结束并记录原因。

关键规则：

- `loading` 状态不允许并发进入 `triggering`。新输入必须先取消当前轮。
- `accepting` 与 `cancelling` 是瞬时状态，必须同步完成 ghost 清理和状态复位。
- Rich 与 Source 各自每个 editor instance 只允许一个状态机。
- unmount、pane 切换、失焦、IME composition start 均强制进入 cancelling。

## Request Flow

1. 用户输入后进入 debounce，默认 700ms。
2. debounce 结束后状态机进入 `triggering`，校验是否可编辑、是否有可用 polish 服务、是否处于 IME 冻结期、是否满足最小上下文条件。
3. 状态机生成 `requestId`、`docVersion` 与 `cursorPosition`，进入 `loading`。
4. `inlineCompletionContext.ts` 基于 adapter 读取文档和光标，提取 prefix、suffix、heading path 与 metadata。
5. 使用 `useServiceModelStore.getAvailableServiceConfig('polish')` 获取模型配置，再通过 `useChat({ providerId }).agent.invoke` 发起一次性请求。
6. 结果返回后校验 request token。requestId、docVersion、cursor position 或状态任一不匹配，结果直接丢弃。
7. 有效结果先 sanitize，再按最小长度、最大长度、重复度规则判断是否显示。
8. 显示后用户按 `Tab` 接受，按 `Esc`、继续输入、移动光标、失焦或 IME 开始则取消。

## Prompt Contract

Prompt 使用结构化 block，输出只允许补全文本：

```text
You are a writing assistant. Continue the user's markdown document exactly at the cursor position.

## Document metadata
- Filename: {{filename}}
- File type: {{fileType}}
- Writing mode: {{writingMode}}

## Current heading path
{{headingPath}}

## Text before cursor
{{prefix}}<cursor>

## Text after cursor
{{suffix}}

## Rules
- Continue directly after `<cursor>`. Do not repeat any text already before `<cursor>`.
- Do not output the literal string `<cursor>`.
- Do not wrap the output in markdown code blocks.
- Do not expand lists unless the cursor is already inside a list item.
- Keep the same writing style, tone, and markdown formatting.
- Output only the continuation text.
```

上下文预算：

- prefix 约 500 tokens，优先在段落或句子边界截断。
- suffix 约 200 tokens，失败时置空。
- heading path 最多 6 级。
- max output tokens 默认 150，短行场景可降至 50。

## Rich First Implementation

Rich adapter 基于 TipTap editor 与 ProseMirror plugin 实现：

- `getCursorPosition()` 使用 `editor.state.selection.from`，只在空选区触发内联补全。
- `getDocVersion()` 使用 `editor.state.doc.nodeSize`，与现有 Rich selection adapter 保持一致。
- ghost text 使用 ProseMirror decoration widget 渲染，不写入 document。
- `acceptGhostText()` 使用 `insertContentAt({ from, to }, text, { contentType: 'markdown' })` 或等价 transaction 写入文档。
- 快捷键优先级为 IME composition、已有 ghost、编辑器默认行为。显示 ghost 时 `Tab` 接受、`Esc` 取消；未显示 ghost 时保留现有 Tab 缩进、列表、表格和 undo/redo 逻辑。
- 大文档 Rich loading 或 failed 阶段禁止触发补全。

Rich 阶段需要特别验证：

- 与 `CurrentBlockMenu`、选区工具栏、`SelectionAIInput` 的 Esc 行为不互相关闭多层 UI。
- 在 table、codeBlock、listItem 内保留现有 Tab 行为，除非 ghost text 正在 showing 且 IME 未激活。
- composition start 立即清理 ghost 并冻结 debounce。

## Source Follow-Up

Source adapter 基于 CodeMirror 实现同一协议：

- `getCursorPosition()` 使用 `view.state.selection.main.from`，仅空选区触发。
- `getDocVersion()` 使用 `view.state.doc.length`。
- ghost text 使用 CodeMirror decoration widget 或 replace decoration 渲染。
- `acceptGhostText()` 使用单次 `view.dispatch({ changes, selection })` 写入文档并进入历史栈。
- Source 接入不得修改 `useInlineCompletion.ts` 的核心状态机，只补 adapter 与 extension。

## Error Handling And Degradation

- 服务不可用、模型未配置或 provider 未启用时静默回到 `idle`。
- 请求失败进入 `error` 后立即回到 `idle`，不显示用户弹窗。
- 连续失败 3 次后本 pane 本次生命周期内降级关闭 inline completion，并记录原因。
- 请求超过 8s 视为超时，丢弃结果并回到 `idle`。
- 当前 `invoke` 不能真正 abort，因此 timeout 与取消只更新本地 token；迟到结果必须被 token 校验拦截。

## Observability

每轮补全生成 `traceId = crypto.randomUUID()`，使用现有 logger 记录调试事件：

- `inline_completion.triggered`：cursor、docVersion、上下文长度。
- `inline_completion.requested`：provider、model、traceId。
- `inline_completion.received`：耗时、输出长度、usage。
- `inline_completion.accepted`：接受文本长度。
- `inline_completion.rejected`：Esc、input、cursorMove、blur、stale、timeout。
- `inline_completion.error`：错误 code 与 message。

观测只写日志，不新增用户可见面板。

## Testing

- 状态机单元测试覆盖 idle、triggering、loading、showing、accepting、cancelling、error 的主要转换。
- 竞态测试模拟旧请求晚返回，验证 requestId、docVersion、cursor position 不匹配时丢弃。
- prompt 契约测试验证 block 结构、prefix/suffix 截断、code block 包装清理和最小展示长度。
- Rich extension 测试验证 ghost text decoration 渲染、Tab 接受、Esc 取消、输入取消、光标移动取消。
- IME 测试模拟 compositionstart/update/end，验证冻结 debounce 与恢复触发。
- Source 阶段补充 CodeMirror adapter 测试，复用状态机测试夹具。
- 验证命令包括 BEditor 相关测试、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm lint:style`。

## Rollout

1. Rich 阶段默认只在 polish 服务可用、编辑器可编辑、空选区、非 IME 状态下触发。
2. Source 阶段复用 Rich 阶段稳定后的状态机。
3. 后续增强再考虑为 `ai:invoke` 增加 requestId 和 abort 通道。

## Commit Policy

本 spec 只确认设计，不包含实现代码。实现计划与代码改动在用户确认 spec 后进入下一阶段。
