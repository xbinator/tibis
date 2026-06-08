# 2026-06-08 AI Created File Click Open Design

## 背景

AI 通过 `write_file` 创建或写入文件后，聊天工具结果目前只显示静态摘要：

- `src/components/BChatSidebar/utils/toolResultSummary.ts` 将结果格式化为“已创建文件 / 已写入文件”和“文件：xxx”。
- `src/components/BChatSidebar/components/MessageBubble/BubblePartTool.vue` 只把摘要 tag 渲染成不可点击的文本 chip。
- 项目已有 `src/hooks/useNavigate.ts` 和 `src/hooks/useOpenFile.ts`，能按文件路径打开编辑器标签页并复用已打开标签。

这导致用户看到 AI 已创建文件后，仍需要手动找到路径或再让 AI 打开，交互上断了一步。

## 目标

- 用户点击工具结果摘要中的文件 chip 后，可直接打开对应文件。
- 首期覆盖 `write_file` 的“已创建文件 / 已写入文件”结果。
- 同步覆盖已有相同“文件：xxx”摘要语义的 `edit_file` 与 `open_resource` 文件结果，让同类 UI 行为一致。
- 复用现有文件打开链路，不新增工具协议或模型上下文字段。
- 保持原始数据展开、工具标题、失败结果展示等现有行为不变。

## 非目标

- 不改变 `write_file`、`edit_file`、`open_resource` 的执行结果协议。
- 不让整块工具摘要都可点击，只让文件 chip 可点击。
- 不增加行号定位；工具结果目前只提供文件路径，没有稳定行号语义。
- 不处理网页、外部链接或系统文件管理器定位，只处理应用内文件打开。

## 方案对比

### 方案一：摘要 tag 携带 UI action（推荐）

在 `ToolSummaryTag` 上增加可选字段，用于表达“这个 tag 可以打开文件”：

```ts
action?: 'openFile'
path?: string
```

`toolResultSummary.ts` 继续负责从工具结果中提取路径；`BubblePartTool.vue` 根据 tag 的 action 渲染成可点击按钮并调用 `useNavigate().openFile({ filePath })`。

优点：

- 数据边界清楚，工具协议保持纯净。
- UI 组件不用理解每个工具结果的细节。
- 后续其他文件类工具可以复用同一 tag 行为。

缺点：

- 需要轻微扩展摘要 tag 类型。

### 方案二：在 BubblePartTool 中按 toolName 特判

`BubblePartTool.vue` 直接判断 `part.toolName === 'write_file'`，再从 `part.result.data.path` 取路径。

优点：

- 改动点少。

缺点：

- UI 组件会耦合工具结果结构。
- 扩展到 `edit_file`、`open_resource` 时会继续堆特判。

### 方案三：工具结果增加 UI 专用字段

让工具执行结果直接返回某种可点击资源元数据。

优点：

- 前端解析简单。

缺点：

- 工具结果会进入模型上下文，不适合塞 UI 专用字段。
- 会扩大协议变更面。

## 设计

采用方案一。

### 摘要数据

扩展 `ToolSummaryTag`：

```ts
export type ToolSummaryTagAction = 'openFile'

export interface ToolSummaryTag {
  label: string
  value: string
  action?: ToolSummaryTagAction
  path?: string
}
```

生成规则：

- `write_file` 成功且 `data.path` 是字符串时，文件 tag 使用文件名作为 `value`，完整路径放入 `path`，`action` 设置为 `openFile`。
- `edit_file` 成功且 `data.path` 是字符串时，同样生成可打开文件 tag。
- `open_resource` 仅当 `resourceType === 'file'` 且有 `path` 时生成可打开文件 tag。
- 没有路径或失败结果时仍按现有静态展示降级。

### UI 行为

`BubblePartTool.vue` 渲染摘要 tag 时：

- 有 `action: 'openFile'` 和 `path` 的 tag 渲染为 button。
- 点击后调用 `useNavigate().openFile({ filePath: tag.path })`。
- 键盘 Enter/Space 由原生 button 支持。
- 静态 tag 保持现有 div/span 展示。

打开失败时复用 `useNavigate().openFile()` 现有提示，不在工具气泡里重复实现错误弹窗。

### 样式

可点击 tag 仍沿用现有 chip 尺寸和颜色，增加：

- `cursor: pointer`
- hover/focus 状态，提高可发现性
- button 默认样式重置，避免破坏工具结果布局

样式类名写完整选择器，避免 Less 中使用 `&__xxx` 省略类名。

## 测试

优先补充工具摘要纯函数测试：

- `write_file` 创建文件时生成 `openFile` action 和完整路径。
- `edit_file` 修改文件时生成 `openFile` action。
- `open_resource` 打开文件时生成 `openFile` action。
- `open_resource` 打开网页或外部链接时不生成 `openFile` action。

如现有组件测试设施适合，再补充 `BubblePartTool.vue` 行为测试：

- 可点击文件 tag 被点击后调用文件打开逻辑。
- 静态 tag 不渲染成按钮。

## 风险与回滚

- 主要风险是按钮样式影响 chip 排版；通过样式复用现有尺寸控制。
- 文件不存在时会走现有 `openFileByPath` 失败提示和最近记录清理逻辑。
- 回滚只需移除 `ToolSummaryTag` 的 action 字段和 `BubblePartTool.vue` 的按钮渲染分支。
