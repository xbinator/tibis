# BChat 长会话上下文压缩设计

## 背景

BChat 同时承担普通对话和带工具调用的 Agent 长任务。随着消息、文件内容和工具结果持续累积，发送给模型的上下文会逐渐接近模型窗口上限，最终导致请求失败、输出空间不足或任务中断。

本设计为 BChat 引入由 Tibis 管理的滚动上下文压缩：在保留数据库原始消息的前提下，用结构化 checkpoint 替换发给模型的旧上下文投影，并在对话流中显示“上下文压缩中…”和“上下文已压缩”。

## 目标

- 同时支持普通聊天和 Coding/Agent 长任务。
- 所有 Provider 使用 Tibis 客户端托管的统一压缩逻辑。
- 达到可用输入预算约 80% 时，在下一次模型请求前同步压缩。
- 在一次长 Agent 任务的每次工具续轮前重新检查预算。
- 支持手动 `/compact`。
- 使用当前会话选中的模型生成结构化摘要。
- 压缩后把模型输入控制在可用输入预算约 55%。
- 压缩状态消息只展示生命周期文案，不展示摘要、Token 数量或压缩前后比例；输入工具栏可独立查看当前上下文用量。
- 原始消息始终保存在现有 `chat_messages.parts_json` 中。
- 不新增数据库表，不维护独立压缩记录表。
- 文件移动或重命名后仍能通过稳定 artifact ID 关联同一产物。
- 分支、回滚和重新生成后保持完整的 Part 拓扑。

## 非目标

- 不使用 Provider 原生 compaction 作为核心实现。
- 不做后台预压缩。
- 压缩状态消息不展示 `82K → 24K` 等前后对比指标；工具栏只展示当前模型输入投影用量。
- 不把摘要正文展示给用户。
- 不建立向量检索、多段摘要检索或独立 Agent 状态账本。
- 不删除或覆盖数据库中的原始聊天内容。
- 不尝试关联没有文件 ID、工具事件或路径迁移证据的外部文件移动。

## 厂商方案参考

- [OpenAI Compaction](https://developers.openai.com/api/docs/guides/compaction) 使用阈值触发，并以新的 compaction item 表达可继续使用的上下文状态。
- [Anthropic Compaction](https://platform.claude.com/docs/en/build-with-claude/compaction) 在达到阈值后生成 compaction block，后续请求忽略被替代的旧内容。
- [Anthropic Context Editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) 和 [Claude Code](https://code.claude.com/docs/en/how-claude-code-works) 会优先清理旧工具结果，再对较早上下文做摘要。
- [Gemini Long Context](https://ai.google.dev/gemini-api/docs/long-context) 与 [Context Caching](https://ai.google.dev/gemini-api/docs/caching) 更偏向长窗口和缓存，不等价于客户端滚动压缩。

Tibis 采用“滚动单 checkpoint + 保留近期原始 tail + 投影层工具结果裁剪”。这一方案跨 Provider 一致、可离线审计，并能复用现有消息 Part 持久化。

## 总体架构

上下文压缩由主进程 `ChatRuntime` 负责，Renderer 只负责命令入口和状态展示。

```text
Renderer
├─ /compact 命令
├─ compaction part 状态渲染
└─ InputToolbar 上下文用量入口

ChatRuntime
├─ ContextProjector
├─ BudgetMeter
├─ CompactionPlanner
├─ CompactionExecutor
├─ FingerprintBuilder
└─ PartTopologyValidator

chat_messages.parts_json
├─ 原始 text/tool/file/widget parts
└─ 自包含 compaction parts
```

各模块职责如下：

- `ContextProjector`：从原始消息、最新成功 checkpoint 和 boundary 后的原始 tail 构建模型输入，不修改持久化消息。
- `BudgetMeter`：按当前模型窗口、输出预留和安全预留估算请求占用。
- `CompactionPlanner`：确定是否压缩、不可压缩内容、摘要预算、原始 tail 预算和安全 boundary。
- `CompactionExecutor`：持有会话写入租约，冻结输入、生成摘要、校验并提交 compaction part。
- `FingerprintBuilder`：生成包含源拓扑、schema、模型和预算维度的稳定指纹。
- `PartTopologyValidator`：校验 boundary、parent checkpoint、证据 Part 和工具/交互生命周期的依赖闭包。

现有旧工具结果裁剪应从“回写数据库”改为“仅影响模型投影”。完整工具结果继续保留在原始消息中。

## 预算与触发规则

### 预算公式

对当前选中模型定义：

```text
W = 模型 context window
R = request.maxOutputTokens ?? model.defaultOutputTokens ?? 8192
O = clamp(R, 1024, floor(W × 0.25))
S = max(1024, ceil(W × 0.05))
U = W - O - S
T = floor(U × 0.80)
C = floor(U × 0.55)
H = U
```

- `O`：输出预留。
- `S`：安全预留，覆盖 Token 估算误差、Provider 包装和压缩提示词变化。
- `U`：可用输入预算。
- `T`：自动压缩阈值。
- `C`：压缩后的目标输入预算。
- `H`：保留输出和安全空间后的硬限制。

压缩规划继续定义：

```text
F = 不可压缩内容 Token
A = max(0, C - F)
Qcap = min(16384, max(2048, floor(U × 0.15)))
Q = min(Qcap, floor(A × 0.40))
L = max(0, A - Q)
```

- `F` 包含 system、工具 schema、当前用户消息、未完成交互、预算允许时的当前轮最新完整工具结果和其他必须原样保留的内容。
- `Q` 是结构化摘要最大输出预算。
- `L` 是 boundary 后原始 tail 的最大预算。
- 成功压缩后必须满足 `F + actualSummaryTokens + actualTailTokens <= C`。

如果 `Q < 1024`，先对旧工具结果做仅投影裁剪并重新规划。单个 Agent 任务跨越大量工具续轮时，先裁剪当前用户轮次中较早、已经完整结束的大型工具结果，并优先保留最新完整工具结果；如果最新结果单独就导致摘要容量不足，则最后裁剪其结果正文，但仍保留整个工具 Part、调用输入、artifact identity 和确定性摘要。当前用户消息与未完成工具始终保持原文。仍无法满足时，以不可压缩上下文过大结束，不发起必然溢出的模型请求。

摘要请求本身还必须满足：

```text
sourceTokens + compactionPromptTokens + Q <= W - S
```

不满足时，只对摘要请求的旧工具输出执行确定性投影裁剪，不改写数据库原文。

### 自动触发点

统一在模型请求边界执行预算检查：

1. 用户消息持久化后、首次模型请求前。
2. 每个完整工具结果持久化后、下一次模型续轮前。

达到 `T` 时同步压缩。没有 `compactionDeferred` 状态：如果当前没有安全边界就直接返回，工具完成后的下一次模型请求边界会自然重新检查。

### 手动触发

`/compact` 由 Renderer 拦截，不作为普通用户消息发送给模型。命令只允许在会话空闲时执行，并复用与自动压缩完全相同的规划和执行器。

没有足够内容可压缩时，写入 `skipped` part，并显示“当前上下文无需压缩”。

## 安全 Boundary

`boundaryPartId` 必须指向当前 compaction part 之前的 immutable part，并代表被压缩范围内最后一个完整 Part。

当前触发模型请求的用户消息属于不可压缩内容，boundary 必须位于该用户消息之前。特别长的旧工具结果可以在投影层裁剪；当前 Agent 轮次中较早且已经结束的大型工具结果只在达到压缩阈值后允许裁剪。最新完整工具结果优先保留，只有它单独导致预算或硬限制无法满足时才裁剪结果正文，且不能拆分 Part。如果当前用户消息、system、工具 schema 和未完成交互本身已经超过硬限制，则停止请求并提示上下文不可压缩，不能擅自摘要或截断当前任务。

以下情况不能作为 boundary，也不能开始压缩：

- text 仍在 streaming；
- tool input 仍在 streaming；
- tool call 处于 executing；
- tool result 尚未完整持久化；
- pending confirmation；
- awaiting user choice；
- 已有 compaction 正在执行。

immutable part 必须满足：

- 有稳定 ID；
- 内容和状态已经终态；
- 后续只允许在所在 message 尾部追加新 Part，不能再修改该 Part；
- 成功的 compaction part 在提交后也成为 immutable part。

## Compaction Part 数据契约

```ts
interface CompactionModelSnapshot {
  providerType: AIProviderType
  providerId: string
  modelId: string
  contextWindow?: number
  maxOutputTokens?: number
}

interface CompactionBudgetSnapshot {
  outputReserve: number
  safetyReserve: number
  usableInputTokens: number
  triggerTokens: number
  targetTokens: number
  summaryMaxTokens: number
  rawTailMaxTokens: number
}

interface ChatMessageCompactionPart {
  id: string
  type: 'compaction'
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'skipped'
  trigger: 'automatic' | 'manual'
  boundaryPartId?: string
  parentCheckpointId?: string
  sourceFingerprint?: string
  modelSnapshot?: CompactionModelSnapshot
  budgetSnapshot?: CompactionBudgetSnapshot
  summary?: StructuredContextSummary
  errorCode?: string
  validationErrorCode?: 'INVALID_SHAPE' | 'INVALID_REFERENCE' | 'INVALID_OBJECTIVE_RELATION'
  createdAt: number
  completedAt?: number
}
```

字段约束：

- `boundaryPartId` 不得指向 compaction part 自身或它之后的 Part。
- `parentCheckpointId` 只引用上一个成功的 compaction part。
- `summary` 只允许存在于 `success` part。
- `validationErrorCode` 只允许与 failed 状态的 `SCHEMA_INVALID` 同时存在，且不得包含原始模型输出。
- `modelSnapshot` 是脱敏快照，禁止包含 API key。
- `contextWindow` 即使不参与恢复也要保存，用于未来排查模型切换和预算问题。
- `pending` 可以原子更新为终态；一旦成为 `success` 就不可再修改。

## 结构化摘要

所有会话使用同一份结构化摘要，不区分普通聊天和 Agent 模式。

```ts
interface StructuredContextSummary {
  schemaVersion: 1
  activeObjectiveId?: string
  objectives: ObjectiveState[]
  facts: ContextFact[]
  artifacts: ArtifactState[]
  completedActions: ContextAction[]
  pendingActions: ContextAction[]
  openQuestions: OpenQuestion[]
  failures: ContextFailure[]
}

interface ObjectiveState {
  id: string
  description: string
  status: 'active' | 'completed' | 'blocked' | 'superseded' | 'abandoned'
  successCriteria: string[]
  parentId?: string
  supersededById?: string
  sourcePartIds: string[]
}

interface ContextOwner {
  type: 'user' | 'assistant' | 'tool' | 'external'
  id?: string
}

interface ContextAction {
  id: string
  description: string
  owner: ContextOwner
  sourcePartIds: string[]
}

interface OpenQuestion {
  id: string
  question: string
  owner: ContextOwner
  sourcePartIds: string[]
}

interface ContextFact {
  id: string
  type:
    | 'requirement'
    | 'preference'
    | 'constraint'
    | 'decision'
    | 'critical_fact'
    | 'conversation_continuity'
  content: string
  sourcePartIds: string[]
}

interface ContextFailure {
  id: string
  description: string
  resolved: boolean
  sourcePartIds: string[]
}

interface ArtifactState {
  id: string
  path?: string
  purpose: string
  status: 'read' | 'created' | 'modified' | 'deleted'
  keyChanges: string[]
  shouldReload: boolean
  sourcePartIds: string[]
}
```

### 目标漂移

- 用户细化同一目标时更新原 `ObjectiveState`。
- 用户明确替换目标时，将旧目标标记为 `superseded`，新建目标并通过 `supersededById` 连接。
- `activeObjectiveId` 只能指向 `status === 'active'` 的目标。
- `successCriteria` 用于判断任务是否完成，不能只保留模糊自然语言目标。

### Owner 语义

- `pendingActions.owner` 表示下一步应由谁执行。
- `openQuestions.owner` 表示下一步应由谁回答。
- 工具或外部系统责任通过 `type` 和可选 `id` 表达。

## Artifact 稳定身份

`ArtifactState.id` 表示稳定身份，`path` 只是当前可变位置。

身份解析优先级如下：

1. 已进入 Tibis 文档系统的文件使用现有 `StoredDocumentRecord.id`。
2. `read_current_document` 和 `create_document` 继续沿用已有文档 ID。
3. 普通工作区文件第一次被读取或修改时，由 Runtime 分配 `artifactId` 并写入 tool result part。
4. `read_file`、`write_file` 和 `edit_file` 后续返回同一个 `artifactId`。
5. 移动或重命名结果返回相同 `artifactId`、`previousPath` 和新 `path`。
6. 删除后在同一路径新建文件时分配新的 artifact ID，不能按路径复用旧身份。

Runtime 的 artifact 映射从最新成功 checkpoint、boundary 后 tool result parts 和现有文件记录重建，不新增存储表。

如果文件在 Tibis 外部移动，且没有文件 ID、工具事件或旧路径到新路径的显式证据，系统不得仅靠文件名或相似内容猜测关联。

## Source Fingerprint

fingerprint 的输入包含源拓扑、schema、模型和实际预算维度：

```ts
interface CompactionFingerprintInput {
  fingerprintVersion: 1
  summarySchemaVersion: 1
  projectorVersion: 2
  compactionPolicyVersion: 3
  modelSnapshot: CompactionModelSnapshot
  budgetSnapshot: CompactionBudgetSnapshot
  parentCheckpointId?: string
  boundaryPartId: string
  sources: Array<{
    messageId: string
    partId: string
    type: ChatMessagePart['type']
    contentHash: string
  }>
}
```

计算方式：

```text
sourceFingerprint = sha256(stableStringify(fingerprintInput))
```

以下任一变化都必须产生不同 fingerprint：

- 消息、Part、checkpoint ID 或源内容；
- boundary 或 parent checkpoint；
- 摘要 schema、投影算法或压缩策略版本；
- Provider、模型、`contextWindow` 或最大输出限制；
- 输出预留、安全预留、触发阈值、目标预算、摘要预算或 tail 预算。

分支时不得复制 fingerprint。完成 ID 重建、引用重写和拓扑校验后，必须根据分支实际内容重新计算。

## 原子执行与并发控制

### 执行顺序

```text
0 acquire session write lease
1 capture immutable source snapshot
2 calculate boundary, budget and sourceFingerprint
3 insert compaction(pending)
4 generate summary from captured snapshot
5 validate schema and references
6 verify lease, boundary and sourceFingerprint
7 atomically write compaction(success)
8 release lease
```

摘要输入必须在插入 `pending` 之前冻结：

```ts
interface CompactionSourceSnapshot {
  parentCheckpoint?: StructuredContextSummary
  sourceParts: ImmutableChatPart[]
  boundaryPartId: string
  sourceFingerprint: string
}
```

摘要模型只接收冻结 snapshot，不重新读取当前消息列表，也不包含 `compaction(pending)` 自身。摘要请求禁用所有工具，并使用结构化输出 schema。

### 会话写入租约

- 自动压缩复用当前 ChatRuntime 已持有的 session 写入锁。
- 手动 `/compact` 在插入任何消息前获取同一把锁。
- 从 `pending` 插入到终态提交期间始终持锁。
- 同会话的新消息、编辑、回滚和重新生成返回 `SESSION_BUSY`，不得写入数据库。
- 用户仍可编辑下一条草稿、切换其他会话或为下一轮切换模型。
- 模型切换不影响已经冻结的 `modelSnapshot`，从下一次请求起生效。

## 上下文投影

每次模型请求前执行：

1. 查找最新、拓扑有效且 `status === 'success'` 的 compaction part。
2. 将结构化摘要转换为内部 synthetic context。
3. 忽略该 checkpoint boundary 之前的普通消息投影。
4. 追加 boundary 之后的完整原始 tail。
5. 对超大的旧工具结果执行仅投影裁剪。
6. `pending`、`failed`、`cancelled` 和 `skipped` part 不替换上下文。

滚动压缩以“上一个 checkpoint 摘要 + 上次 boundary 后的新原始内容”为输入，生成一个新的自包含 checkpoint。数据库中的旧 checkpoint 和原始消息均保留，模型只使用最新有效 checkpoint。

## Agent 长任务中的 Part 顺序

压缩 Part 可以插入当前 assistant message，不拆分长任务：

```text
assistant message
├─ text part
├─ tool-call/result part
├─ compaction part: pending → success
├─ tool-call/result part
└─ text part
```

只有工具结果完整持久化后，compaction part 才能追加。后续 Part 只追加到 message 尾部，不修改已有成功 checkpoint。

手动 `/compact` 可以创建一条只包含 compaction part 的 assistant message。

## Part 拓扑与截断

Parts 构成有向依赖图：

```text
compaction
├─ boundaryPartId ─────────→ immutable source part
├─ parentCheckpointId ─────→ previous compaction part
└─ summary.sourcePartIds ──→ evidence parts

tool result ────────────────→ corresponding tool call
user choice result ────────→ corresponding question
confirmation result ───────→ corresponding confirmation
```

分支、回滚、重新生成和任何持久化截断都必须保持依赖闭包完整：保留一个节点时，必须同时保留其全部依赖。

上下文投影不是持久化截断。它可以在同一 assistant message 的 immutable Part 边界构造“checkpoint + message 后缀”，但后缀中的工具和交互语义单元仍必须完整，数据库原 message 不发生变化。

禁止：

- 从 streaming text 中间截断；
- 拆开 tool call 和 tool result；
- 拆开 confirmation 请求和结果；
- 拆开 user choice 问题和回答；
- 保留缺少 boundary、parent 或 evidence Part 的 checkpoint。

某个 checkpoint 依赖缺失时，移除该 checkpoint，以及所有把它作为 parent 的后续 checkpoint。

### 会话分支

现有分支逻辑会重新生成全部 message ID 和 part ID，因此流程必须调整为：

1. 截取到完整的目标 assistant message。
2. 克隆 messages 和 parts。
3. 建立 `messageIdMap` 和 `partIdMap`。
4. 重写 `boundaryPartId`、`parentCheckpointId` 和所有 `sourcePartIds`。
5. 校验完整依赖闭包。
6. 移除依赖不完整的 checkpoint 链。
7. 使用每个 checkpoint 已保存的 `modelSnapshot`、`budgetSnapshot` 和版本字段，结合分支新拓扑重新计算 fingerprint；不得改用创建分支时当前选中的模型或预算。
8. 在单一事务中写入分支。

Artifact ID、objective ID 等业务身份不随 Part ID 重建。

### 回滚与重新生成

继续采用完整 message 截断：

- 截断点之后的 compaction part 随消息删除。
- 截断点之前、源依赖未变化的 checkpoint 继续有效。
- 不能只保留同一 assistant message 中的部分 Part。
- 截断后必须运行拓扑校验。
- 覆盖范围发生变化时移除旧 checkpoint，不能修改旧 fingerprint 冒充原检查点。

## UI 设计

Renderer 复用现有 `BubblePartStatus` 渲染 compaction part，以无图标的中性状态行展示：

```text
上下文压缩中…
上下文已压缩
上下文压缩失败
上下文压缩已取消
当前上下文无需压缩
```

显示规则：

- `pending`：上下文压缩中…
- `success`：上下文已压缩
- `failed`：上下文压缩失败
- `cancelled`：上下文压缩已取消
- `skipped`：当前上下文无需压缩

压缩状态行不得显示摘要、Token、压缩比例、boundary、fingerprint、模型或错误详情。状态变化使用 `aria-live="polite"`。

`InputToolbar` 在模型选择器左侧显示中性环形用量入口，悬浮文案格式为 `5.5% · 54.7K / 1000.0K 上下文已使用`。打开已有会话时先由主进程按持久化 checkpoint 与 raw tail 生成只读初始估算；Runtime 启动后，使用 `ContextProjector` 在模型请求前和回复完成后的完整输入投影覆盖该值。工具续轮和手动压缩完成后必须刷新。不得使用 Provider 累计计费 usage 代替当前上下文占用，切换会话或模型时清除旧快照。

压缩进行时，输入框可以继续编辑草稿，但当前会话的发送、历史编辑、回滚和重新生成不可用。

## 错误处理与恢复

- 用户停止自动压缩：将 part 标记为 `cancelled`，同时停止当前 Agent runtime。
- 用户停止手动压缩：将 part 标记为 `cancelled`，原上下文不变。
- 模型调用失败：标记 `failed`，旧 checkpoint 继续有效。
- 首次 schema 或语义校验失败：使用相同冻结源和当前模型，根据脱敏子错误码定向重新生成一次完整摘要；不把无效原始输出写入数据库或日志。
- 修复重试仍未通过：标记 `failed`，保留稳定的 `SCHEMA_INVALID` 和 `INVALID_SHAPE`、`INVALID_REFERENCE` 或 `INVALID_OBJECTIVE_RELATION` 子错误码；UI 不展示错误详情。
- 应用重启发现遗留 `pending`：标记 `failed`，下次请求重新评估。
- 成功 part 已完整写入后异常退出：该 checkpoint 可直接恢复。
- 提交前发现写入租约、boundary 或 fingerprint 不一致：标记 `failed`，错误码为源已变化。

摘要生成过程中的单次定向修复属于同一次压缩事务，不创建额外 part，也不绕过以下自动失败防循环规则：

- 相同 `sourceFingerprint` 自动失败一次后不再自动重试。
- 源、schema、模型或预算变化后 fingerprint 改变，可重新尝试。
- 手动 `/compact` 允许强制重试相同 fingerprint。
- 压缩失败但当前投影低于 `H` 时，本轮可以继续使用原上下文。
- 当前投影达到或超过 `H` 且无法压缩时，停止模型请求并显示明确错误。

## 测试策略

### 单元测试

- `BudgetMeter`：80% 触发、55% 目标、输出和安全预留、摘要与 tail 分配。
- `BoundaryPlanner`：拒绝 streaming、executing、confirmation、user choice 和非 immutable Part。
- `FingerprintBuilder`：确定性、schema/model/budget/source 变化、分支后重算。
- `PartTopologyValidator`：boundary、parent、evidence、tool 和交互依赖闭包。
- `ContextProjector`：最新成功 checkpoint、原始 tail、无效状态忽略、旧工具与当前长 Agent 轮次的仅投影裁剪。
- `StructuredContextSummary`：目标漂移、owner、artifact 移动和 schema 校验。

### Runtime 集成测试

1. 首次请求达到 80%，压缩后才调用主模型。
2. 长工具结果在下一次模型续轮前触发压缩。
3. 工具 executing 时不插入 pending。
4. pending 期间同会话再次发送返回 `SESSION_BUSY`，数据库不新增消息。
5. 取消、失败、重启恢复和旧 checkpoint 回退。
6. 相同 fingerprint 失败后不形成自动重试循环。
7. 模型切换保存正确 `modelSnapshot.contextWindow` 并按新预算计算。
8. `/compact` 的成功、跳过、失败和取消。
9. 分支引用重建、拓扑校验和 fingerprint 重算。
10. 回滚、重新生成和硬限制保护。

### UI 测试

- 压缩状态行只显示状态文案，不显示 Token 或摘要。
- 输入工具栏环形入口按一位小数展示比例和 K 级 Token，并接收当前会话的 Runtime 投影快照。
- compaction part 位于真实 Part 顺序中。
- 长 Agent 任务不拆分 assistant message。
- pending 时允许编辑草稿，但不能修改当前会话历史。
- `aria-live` 正确报告状态变化。

### 摘要质量回归

使用固定长会话样本覆盖目标替换、不同 owner 的待办与问题、文件创建/移动/删除、超长工具结果和多轮滚动压缩。

确定性断言包括：

- active objective 和 success criteria 不丢失；
- superseded 目标不会重新激活；
- pending action 和 open question owner 正确；
- artifact 路径变化后 ID 保持稳定；
- 所有 `sourcePartIds` 可解析；
- 压缩投影满足目标预算；
- 最新用户消息和未完成任务保持原文。

## 内部日志

记录脱敏诊断信息，但不向用户展示：

```ts
interface CompactionDiagnosticLog {
  runtimeId: string
  sessionId: string
  checkpointId?: string
  trigger: 'automatic' | 'manual'
  status: 'success' | 'skipped' | 'failed' | 'cancelled'
  fingerprintPrefix?: string
  estimatedTokens?: number
  targetTokens?: number
  projectedTokens?: number
  durationMs: number
  modelSnapshot: CompactionModelSnapshot
  errorCode?: string
  validationErrorCode?: 'INVALID_SHAPE' | 'INVALID_REFERENCE' | 'INVALID_OBJECTIVE_RELATION'
  repairAttempted?: boolean
}
```

日志禁止包含 API key、原始消息内容、完整摘要或文件正文。

## 验收标准

- 不新增数据库表。
- 使用当前会话选中的模型。
- 80% 同步触发，压缩目标约 55%。
- active tool 期间不压缩。
- 成功 checkpoint 自包含、可验证、可恢复且提交后 immutable。
- `boundaryPartId` 只指向 compaction part 之前的 immutable part。
- compaction part 与 Agent 输出位于同一 assistant message。
- 用户只看到压缩状态。
- pending 期间不能在同会话插入新消息。
- 分支重算 fingerprint，回滚和截断保持 Part 拓扑完整。
- artifact 移动后保持稳定身份。
- 压缩失败不破坏原始上下文，也不产生重试死循环。
