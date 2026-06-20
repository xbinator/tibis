# 2026-06-20 Chat Message File Part Design

## Goal

将聊天用户消息重构为完全 part 化结构，让文件引用在发送时固化为 `type: 'file'` part，并在后续重生成、继续对话、上下文压缩和模型请求中复用同一份快照。

## Background

当前 BChat 输入使用 `{{#...}}` token 表示文件引用，`src/components/BChat/utils/messageHelper.ts` 会在 renderer 侧构建 `references`。但主进程 ChatRuntime 的真实发送链只持久化 `content` 和图片 `files`，`electron/main/modules/chat/runtime/context/model-message.mts` 转换模型消息时也不会读取 renderer 临时 `references`。结果是文件引用更像 UI/旧估算数据，未成为主进程 runtime 的一等消息结构。

本设计参考 opencode 的 file mention 思路，但采用 Tibis 现有 ChatRuntime 架构：内部消息 part 保存完整快照，发给模型时映射为 AI SDK 6 原生 `ModelMessage` content part。

## Data Model

`ChatMessagePart` 增加用户消息可用的 `file` part。该 part 表示“发送时固化的文件快照”，而不是实时文件引用。

需要区分 renderer 发送前的输入形态和主进程持久化后的消息形态，避免 `snapshot` 必填字段和发送输入发生类型冲突。

```ts
export interface ChatMessageFilePartInput {
  /** 片段类型 */
  type: 'file';
  /** 文件 part 唯一 ID，用于 UI key 与测试断言 */
  id: string;
  /** 展示文件名，如 foo.ts */
  filename: string;
  /** MIME 类型，如 text/plain、image/png、application/pdf */
  mime: string;
  /** 规范化资源 URL，如 file:///abs/foo.ts?start=10&end=20 或 unsaved://id/foo.ts?start=10&end=20 */
  url: string;
  /** 用户输入来源路径，普通文件路径或 unsaved://... 虚拟路径 */
  path: string;
  /** 用户原始输入中的引用文本及位置 */
  sourceText: {
    /** token 在原始输入中的起始 offset */
    start: number;
    /** token 在原始输入中的结束 offset */
    end: number;
    /** 原始 token 文本，如 {{#src/foo.ts 10-20}} */
    value: string;
  };
}

export interface ChatMessageFilePart extends ChatMessageFilePartInput {
  /** 发送时固化的文件内容快照 */
  snapshot: {
    /** 实际固化并可发送给模型的内容 */
    content: string;
    /** 快照内容起始行号，始终 >= 1 */
    startLine: number;
    /** 快照内容结束行号，始终 >= startLine */
    endLine: number;
    /** 文件总行数，用于展示和模型提示 */
    totalLines: number;
    /** 快照内容哈希 */
    contentHash: string;
    /** 快照创建时间 */
    capturedAt: string;
    /** 内容是否因过长被截断 */
    truncated?: boolean;
  };
}
```

约束：

- 不使用外层 `token`、`startLine`、`endLine` 字段。
- 不使用 `source.type` 区分普通文件和未保存文件；未保存文件通过 `path` 的 `unsaved://` 协议识别。
- `url` 是 canonical resource identifier，用于后续支持 `file:`、`data:`、`unsaved:` 与资源 URL；`path` 保留用户输入来源路径，便于展示和兼容旧 token。
- renderer 发送给主进程的是 `ChatMessageFilePartInput`，不包含 `snapshot`。
- 进入聊天历史的是 `ChatMessageFilePart`，必须包含 `snapshot`。
- 用户未显式写行号时，发送时补齐为 `snapshot.startLine = 1`、`snapshot.endLine = snapshot.totalLines`。
- 空文件按 `totalLines = 1`、`startLine = 1`、`endLine = 1`、`content = ''` 固化。

## Message Flow

### Renderer Parsing

输入框继续显示现有 `{{#...}}` chip，用户体验不大改。

点击发送时，renderer 只解析输入并切分有序 input parts，不读取文件内容：

```ts
[
  { type: 'text', text: 'fix ' },
  {
    type: 'file',
    id: 'file-part-id',
    filename: 'foo.ts',
    mime: 'text/plain',
    url: 'file:///workspace/src/foo.ts?start=10&end=20',
    path: 'src/foo.ts',
    sourceText: { start: 4, end: 25, value: '{{#src/foo.ts 10-20}}' }
  }
]
```

`chatRuntime.send()` 将 `ChatMessageFilePartInput` 形态的 `parts` 传给主进程。`content` 继续保留原始输入文本，用于搜索、复制、兼容旧 UI，不作为新消息发送给模型的唯一来源。

### Main Process Snapshot

主进程创建 user message 前遍历 `type: 'file'` part 并补齐 `snapshot`：

- `path` 为 `unsaved://...`：通过 renderer bridge 读取当前未保存文件或 recent file 内容。
- 普通路径：先通过 renderer bridge 读取已打开编辑器内容；如果该文件已保存但存在未保存修改，快照必须使用编辑器里的最新内容。
- renderer bridge 无可用打开文档时，工作区内普通路径由主进程读取磁盘内容，按行号截取。
- 工作区外普通路径：按现有路径安全策略请求确认，用户拒绝则阻止发送。

文件读取失败时，第一版直接阻止发送并让 renderer 显示错误 toast，不保存缺失 `snapshot` 的失败 part。这样用户不会误以为模型已经看到了文件。

快照会持久化到聊天历史，但模型发送时临时生成的 synthetic/text/file content 不额外持久化，避免同一份文件内容在数据库里重复存储。第一阶段需要设置单个 file snapshot 的大小上限，超出时保存截断后的 `snapshot.content` 并设置 `snapshot.truncated = true`。

### Persistence

主进程持久化完整 `parts`，其中 `file` part 已由 `ChatMessageFilePartInput` 收窄为带 `snapshot` 的 `ChatMessageFilePart`。后续重生成、继续对话、上下文压缩、上下文用量估算都只读取这个快照，不重新读磁盘或 renderer store。

## Model Message Rendering

内部 `ChatMessageFilePart` 和发给 AI SDK 的 `FilePart` 分层处理：

- Tibis 消息：保存 `path`、`sourceText`、`snapshot` 等完整事实。
- AI SDK `ModelMessage`：使用 content array，优先映射为原生 `type: 'file'` part。

文本文件默认模型形态使用 AI SDK 原生 `type: 'file'` 承载文件内容，不额外生成包含相同内容的 text part：

```ts
{
  role: 'user',
  content: [
    { type: 'text', text: 'fix ' },
    {
      type: 'file',
      filename: '@src/foo.ts#L10-L20',
      mediaType: 'text/plain',
      data: new TextEncoder().encode(snapshot.content)
    }
  ]
}
```

非文本文件的目标形态也走同一 `file` part 映射：

```ts
{
  type: 'file',
  filename: '@spec.pdf',
  mediaType: 'application/pdf',
  data: binaryData
}
```

兼容性策略：

- 支持 AI SDK `file` part 的 provider 使用原生 `type: 'file'`。
- AI SDK 6 的 file part 使用 `data: DataContent | URL` 字段表达文件内容或 URL；不得使用自定义 `url` 字段。
- `file` part 不是 metadata-only，必须携带 `data`。路径、行号等元信息只通过 `filename` 和 Tibis 持久化 part 表达。
- 若某 provider 对 `text/plain` file part 表现不稳定，再 fallback 为 `type: 'text'` 文件上下文块，并省略对应 AI SDK `file` part。
- 不同时发送同一份文件内容的 text 版本和 file 版本，避免模型重复接收内容。
- provider 无法读取本地 `file://` 或 `unsaved://` URL；非文本本地文件后续接入时必须先转换为 base64/data content 或 Uint8Array，再填入 `data`。

## Compatibility

旧消息不做批量迁移：

- 没有 `file` part 的旧 user message 继续按现有文本行为转换。
- 旧 renderer 临时 `references` 展示逻辑可短期保留，但新发送不再依赖它。
- 新消息从发送入口开始生成 part 化结构，并由主进程固化快照。

## Components

- `src/utils/file/reference.ts`：继续负责解析 `{{#...}}` token，可扩展为输出 sourceText 与可选行号。
- `src/components/BChat/utils/messageHelper.ts`：拆出“输入文本到有序 parts”的纯函数，逐步移除 `references` 生成职责。
- `types/chat.d.ts`：新增 `ChatMessageFilePart`，并纳入 `ChatMessagePart` union。
- `types/chat-runtime.d.ts`：`ChatRuntimeSendInput` 接收 renderer 解析后的 `ChatMessageFilePartInput` user parts。
- `electron/main/modules/chat/runtime/messages/factory.mts`：创建 user message 前固化 file snapshot。
- `electron/main/modules/chat/runtime/context/model-message.mts`：从 message parts 渲染 AI SDK `ModelMessage` content array。
- `electron/main/modules/chat/runtime/tools/paths.mts` 与 renderer bridge：复用现有路径边界和未保存文件读取能力。

## Testing

需要覆盖以下行为：

- 输入 `{{#src/foo.ts}}` 解析为 `text` + `file` parts。
- file part 同时包含 canonical `url` 和用户来源 `path`。
- 输入 `{{#src/foo.ts 10-20}}` 固化为 `snapshot.startLine = 10`、`snapshot.endLine = 20`。
- 未显式行号时固化为 `1..totalLines`，不出现 `0..0`。
- `unsaved://...` 通过 bridge 固化。
- 已打开且有未保存修改的普通文件通过 bridge 固化编辑器内容，而不是读取磁盘旧内容。
- 读取失败时阻止发送，不持久化缺失 snapshot 的 file part。
- `toRuntimeModelMessages()` 使用 parts 渲染 content array，并将文本文件映射成携带 `data` 的 AI SDK `type: 'file'`。
- provider fallback 时，同一文件只发送 text fallback，不再发送 AI SDK `file` part。
- 重生成和 continue 复用已持久化 snapshot，不重新读取文件。
- 旧消息没有 file part 时保持当前文本转换行为。

## Explicit Decisions

- 本次重构的第一阶段聚焦 `{{#...}}` 文件引用；现有图片上传可以继续保留在 `files` 字段，后续再迁移为 `type: 'file'` part。
- 第一阶段只要求文本文件引用完整可用。图片、PDF、二进制文件沿用同一数据模型，但实现可以在后续任务中接入 base64 与大小控制。
- 第一阶段持久化发送时快照，这是产品决策；但不持久化模型转换时生成的重复 synthetic 内容。
- provider fallback 集中在 model-message 转换层，不扩散到消息持久化结构。
