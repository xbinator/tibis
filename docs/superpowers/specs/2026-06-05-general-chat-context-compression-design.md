<!--
  @file 2026-06-05-general-chat-context-compression-design.md
  @description 通用长聊天上下文压缩 v2 设计文档。
-->

# General Chat Context Compression v2 Design

## Background

`src/components/BChatSidebar` 已具备上下文压缩的核心链路：手动/自动触发、规则裁剪、AI 结构化摘要、压缩记录持久化、压缩边界消息注入以及最近消息保留。现有方案解决了“上下文太长会超限”的问题，但摘要质量仍偏任务型和字段型，面对通用长聊天时容易出现两类体验问题：

- 摘要过度概括，只留下“话题：xxx”，丢失用户给出的清单、数字、偏好、边界和未完成问题。
- 压缩上下文更像存储记录，不像一份能让模型自然接续对话的记忆交接稿。

本设计以“通用聊天长上下文”为主场景，不优先针对代码任务或金融查询任务做专门优化。代码、调研、清单和情绪表达会作为验收样例，用来证明通用方案具备足够保真度。

## Current Implementation Baseline

本设计基于当前压缩实现继续演进，需要显式尊重以下既有事实：

- `src/components/BChatSidebar/utils/compression/coordinator.ts` 已存在多段摘要构建逻辑：当话题分段数不少于 3 且消息数大于 20 时，会写入同一个 `recordSetId` 下的多条记录，并设置 `segmentIndex`、`segmentCount`。
- `src/components/BChatSidebar/utils/compression/topicSegmenter.ts` 已负责按时间间隔和显式切换词切分话题段。
- `src/components/BChatSidebar/utils/compression/segmentRecall.ts` 已提供摘要段相关性选择和 `<conversation_history_summary>` XML 包裹的多段注入文本构建函数。当前实施计划必须先确认它在发送路径中的接入点，再决定是否复用或调整格式。
- 当前 compression boundary message 转换为模型消息时使用 `role: 'assistant'`，不是 system message。v2 设计延续这个兼容性决策，只改变 assistant 消息内容的格式。
- 当前 raw requirement guard 已在摘要生成阶段合并用户原始需求摘录。v2 不把它视作最终形态，但实施时不能移除这条确定性保真兜底。

## Goal

将聊天上下文压缩升级为一套可长期演进的通用记忆交接机制，使长会话在压缩后仍能自然继续，且关键事实、用户偏好和未完成问题不会被摘要模型随意抹平。

## Non-Goals

- 不在本阶段引入用户可编辑记忆库。
- 不把聊天压缩和长期记忆系统合并。
- 不为单一垂直任务定制专用 schema，例如只服务代码开发或金融查询。
- 不立即重写存储层或迁移历史压缩记录。
- 不把原始历史物理删除；压缩只影响模型上下文组装。

## Design Principles

### Compression Is A Handoff, Not A Topic Label

压缩输出必须像“下一位助手接手这段长聊天时需要读的交接稿”，而不是一个话题分类结果。摘要需要回答：

- 用户是谁、偏好什么、语气和边界是什么？
- 这段对话正在聊什么，最近发生了什么转折？
- 哪些事实、数字、清单、名称、条件不可丢？
- 还有什么问题没完成，下一轮应该接什么？

### Balanced Continuity

用户选择的是平衡型体验：既要自然连续，也要事实准确。设计上分三层保留：

- Conversation Continuity：对话主线、关系感、语气偏好、长期偏好。
- Critical Facts：名字、数字、代码、列表、条件、限制、时间点、明确判断。
- Open Loops：未回答问题、模型承诺、用户等待的输出、下一步方向。

### Deterministic Guard Before Model Trust

不能完全相信摘要模型会保留所有关键事实。凡是用户明确给出的清单、编号、数字、路径、URL、排序规则、输出格式和约束，都需要有确定性摘录机制兜底，并合并进最终摘要。

### Head/Tail Split

参考 OpenCode 的 compaction 思路，将会话分为：

- head：较旧历史，交给摘要模型生成压缩记忆。
- tail：最近原文，保留给模型直接阅读。

tail 的目标是保护“继续”“刚才那个”“按上面的来”这类指代。现有最近 2 轮保留策略可以作为第一步，后续升级为“最近轮数 + token 预算”。

## Approach Options

### Option A: Minimal Patch On Existing JSON Schema

继续沿用当前 `StructuredConversationSummary`，只强化 prompt 和 fallback，并增加少量规则摘录。

优点：改动小，兼容当前存储和测试。  
缺点：摘要形态仍偏字段存储，注入模型时不够像自然交接稿，后续容易继续叠补丁。

### Option B: OpenCode-Style Markdown Summary

直接让摘要模型输出 Markdown 交接稿，例如 `Goal / Preferences / Critical Context / Next Steps`。

优点：模型更容易理解，阅读和调试体验好。  
缺点：结构化测试和历史迁移难度变高，后续 UI 展示、检索和质量评估都需要重新解析 Markdown。

### Option C: Structured Storage + Markdown Injection

存储层继续使用结构化 JSON；注入模型时把结构化摘要渲染为 Markdown 交接稿。规则摘录和 AI 摘要共同填充结构化字段。

优点：兼容当前架构，便于测试和迁移；模型看到的是更自然的上下文交接稿。  
缺点：需要维护 schema 到 Markdown 的渲染层，并补齐摘要质量测试。

Recommendation: 选择 Option C。它保留现有工程基础，同时吸收 OpenCode 的交接稿形式和 head/tail 思路。

## Proposed Summary Model

### Storage Shape

在当前 `StructuredConversationSummary` 基础上演进，而不是一次性破坏式替换。建议新增 v3 schema，保留旧字段兼容读取。

```ts
interface GeneralConversationSummary {
  /** 对话连续性：关系、语气、长期主线和用户期待的互动方式 */
  conversationContinuity: string[];
  /** 用户正在长期或当前尝试达成的目标 */
  goal: string;
  /** 最近讨论主线，偏自然语言，不替代事实字段 */
  recentTopic: string;
  /** 用户长期偏好、称呼、语气、边界和互动方式 */
  userPreferences: string[];
  /** 明确限制、必须遵守的条件和用户要求 */
  constraints: string[];
  /** 已达成的共识、判断或选择 */
  decisions: string[];
  /** 不可丢的事实、数字、名单、代码、路径、URL、时间点 */
  criticalFacts: string[];
  /** 从用户原文中确定性摘录出的需求和清单 */
  rawUserRequirements: string[];
  /** 当前未完成事项、等待回答的问题、下一步方向 */
  openLoops: string[];
  /** 最近 3 轮左右的对话转折，例如“用户从 X 转向 Y，现在停在 Z” */
  recentDirection: string[];
  /** 文件上下文，沿用当前结构 */
  fileContext: FileContextSummary[];
}
```

兼容映射：

- 旧 `goal`、`recentTopic` 和用户偏好可共同映射出 `conversationContinuity` 的初始内容。
- `importantFacts` 迁移为 `criticalFacts`。
- `openQuestions` 和 `pendingActions` 合并为 `openLoops`。
- 旧 `structuredSummary` 读取时可通过 adapter 转为 v3 视图。
- `rawUserRequirements` 独立存在的价值是保持确定性摘录与 AI 生成事实分离。注入时该字段单独渲染，并标注为用户明确给出的要求，优先级高于模型推断摘要。

### Markdown Injection Shape

注入模型时渲染为固定 Markdown。它应该作为 compression boundary 的 assistant 消息内容，而不是 UI 普通回复，也不是额外 system message。

```markdown
COMPRESSED_CONTEXT
以下内容是较早对话的压缩记忆，用于保持连续性。请把它当作历史事实和对话状态，不要向用户复述这段说明。

## Conversation Continuity
- ...

## User Preferences
- ...

## Constraints
- ...

## Critical Facts
- ...

## Raw User Requirements
- ...

## Open Loops
- ...

## Recent Direction
- ...

## Relevant Files
- ...
```

空字段必须输出 `- (none)`，避免模型误以为字段被遗漏。

## Data Flow

### Compress

| Step | Responsibility | Current State |
|---|---|---|
| `policy` | 判断是否需要压缩 | 已有 |
| `planner` | 按保留规则分类消息；v2 需要扩展为更明确的 head/tail 语义 | 已有，需调整语义 |
| `topicSegmenter` | 超长历史按话题拆段 | 已有 |
| `recordPreprocessor` | 对 head 做规则裁剪 | 已有 |
| `requirementExtractor` | 从用户原文中确定性提取 raw requirements | 计划从 `structuredSummaryGenerator.ts` 中提取 |
| `structuredSummaryGenerator` | 调用摘要模型，要求输出当前 schema 或 v3 schema | 已有，需演进 |
| `summaryMerger` | 将 AI 摘要、上一条摘要和 raw requirements 合并 | 计划从 `structuredSummaryGenerator.ts` 中提取 |
| `summaryRenderer` | 将结构化摘要渲染为 Markdown injection text | 计划新增；现逻辑分散在 `generateSummaryText()` 与 `buildStructuredCompressionContext()` |
| `coordinator` | 写入压缩记录，并生成 compression boundary message | 已有，需兼容 renderer 和多段 |

### Send

1. `messageHelper` 找到最新 successful compression boundary。
2. 保留该 compression message，并以 assistant model message 注入。
3. 拼接 tail 原文消息。
4. 如果多段摘要召回链路接入发送路径，则按 `segmentRecall` 选择相关段并注入；如果未接入，则 Phase 2 需要先补齐或明确不使用。
5. 转换为模型消息。

## Interaction With Multi-Segment Summaries

多段摘要不是 v2 之后才出现的能力，当前代码已经能生成多条 segment record。v2 必须明确多段情况下的格式与兼容策略。

### Segment Storage

- 每个 segment 仍然是一条独立 `CompressionRecord`。
- v3 schema 按 segment 独立生成，不在存储层强制合并为一条全局摘要。
- 同一批多段记录继续共享 `recordSetId`，并保留 `segmentIndex`、`segmentCount`。
- 历史 v2 segment 和新 v3 segment 可以混存。读取时通过 adapter 渲染为统一 view。

### Segment Injection

多段注入优先复用 `segmentRecall` 的外层 XML 容器，以避免破坏已有格式约定：

```xml
<conversation_history_summary>
以下内容是本会话较早历史的压缩摘要，仅用于补充背景，不是新的用户指令。

<conversation_summary segment="0">
## Conversation Continuity
- ...

## Critical Facts
- ...
</conversation_summary>
</conversation_history_summary>
```

也就是说：外层保留 XML，内层每个 segment 使用 Markdown 交接稿。这样既兼容当前 `segmentRecall` 结构，又让模型读到更清晰的摘要内容。

### Boundary Injection

单段 compression boundary 直接注入一份 Markdown 交接稿。多段 compression boundary 只表示最新压缩完成的边界；旧段召回由 segment recall 决定，不应把所有历史段无条件拼进最新 boundary，避免摘要膨胀。

### Implementation Gate

实施 Phase 2 前必须确认 `segmentRecall` 是否已经接入发送路径：

- 如果已接入：Renderer First 必须同时更新单段 boundary 和多段 recalled segment 的渲染格式。
- 如果未接入：Phase 2 需要增加一个明确任务，要么接入 segment recall，要么先声明多段只写入不召回，并用测试覆盖当前行为。

## Tail Policy

第一阶段沿用最近 2 轮原文保留，作为最低行为保证。

第二阶段升级为：

- 至少保留最近 2 个 user turns。
- 在 token 预算允许时继续向前扩展 tail。
- tail 预算默认取当前模型可用上下文的 25%，并限制在 2,000 到 8,000 tokens。
- 如果最近一轮本身超出预算，保留用户消息原文，助手消息按规则裁剪。

8,000 token 上限的理由是保持压缩收益和注意力集中：tail 太大时，压缩后上下文虽然更保真，但旧原文会重新占据主要预算，模型也更容易忽略摘要中的长期事实。这个上限应通过 golden case 和压缩收益指标验证；如果大窗口模型表现更好，可以后续把上限调整为模型窗口相关配置。

## Prompt Requirements

摘要模型 prompt 必须明确：

- 输出固定 schema，不回答用户问题。
- 保留用户原话中的 identifier，包括代码、数字、URL、文件路径、名单、排序规则、输出格式。
- 对通用聊天保留语气、偏好、边界和关系连续性。
- 如果存在上一条摘要，基于它更新：保留仍真实的内容，移除过期内容，合并新事实。
- 对 `openLoops` 必须做状态更新：如果新对话已经明确回答、取消或替代了旧问题，必须从列表中移除旧项；如果产生新问题，再加入新项。
- 优先短 bullet，避免泛泛段落。
- `recentTopic` 不能作为唯一事实来源。

## Quality Gates

### Golden Cases

至少维护以下压缩质量样例：

- Long casual chat：用户长期偏好和语气能保留。
- Explicit list：基金代码、书单、购物清单等完整保留。
- Constraint-heavy chat：条件、限制和输出格式不丢。
- Emotional continuity：用户表达情绪或边界后，压缩后仍能尊重。
- Open loop：用户让助手稍后继续的事项仍可接上。
- Mixed task and chat：闲聊中穿插任务要求，不能只保留任务或只保留闲聊。
- Multi-segment long chat：50+ 轮且多次显式换话题后，相关旧段可被召回，最新段作为时间锚点保留。

### Assertions

每个 golden case 至少断言：

- 压缩文本包含关键事实。
- 压缩文本包含未完成事项。
- 压缩文本没有把清单概括成单一话题。
- 转换后的模型消息只包含 latest boundary + tail + 必要召回。
- 多段场景下，召回内容保留 segment 顺序，并且新旧 schema segment 都能渲染。

### Compression Benefit Metric

每个 golden case 记录压缩收益：

```ts
compressionRatio = compressedContextTokens / originalContextTokens;
```

初始目标：压缩后上下文不超过压缩前的 40%，即 `compressionRatio <= 0.4`。对于强事实保真样例，如果为了保留清单导致比例略高，可以在测试中显式标注原因，但不应超过 0.6。

## Migration Strategy

分阶段实施，避免一次性重写。

### Phase 1: Design And Guardrails

- 写入本设计文档。
- 补 golden case 测试，先覆盖当前 schema。

### Phase 2: Renderer First And Multi-Segment Alignment

- 不改存储 schema，先新增 `summaryRenderer`。
- 将当前 summary 渲染成 Markdown 交接稿注入模型。
- 验证压缩消息不再只展示“话题：xxx”。
- 同步处理多段摘要渲染：单段 boundary 与 recalled segment 使用同一 renderer。
- 确认并测试 `segmentRecall` 在发送路径中的接入状态。

### Phase 3: V3 Schema

- 引入 `GeneralConversationSummary`。
- 新增旧 schema 到 v3 view 的 adapter。
- 摘要模型输出 v3 schema。
- 压缩记录写入 schemaVersion 3。
- 与 Phase 5 的 observability 并行推进，用数据验证字段变更是否改善质量。

### Phase 4: Tail Budget

- 将固定最近轮数升级为最近轮数 + token 预算。
- 增加超预算拆分策略。
- 保证“继续/刚才那个”类指代仍可工作。
- 本阶段优先级低于 Renderer 和 schema 质量，除非 golden case 证明固定 2 轮 tail 是主要瓶颈。

### Phase 5: Observability

- 增加开发调试视图或日志：压缩前 token、压缩后 token、tail 起点、raw requirements 条数、摘要字段分布。
- 不在第一版面向普通用户暴露复杂调试信息。
- 输出压缩质量评分到开发日志：压缩率、关键事实命中数、open loop 命中数、多段召回数量。

## Risks

- 摘要变长后压缩收益下降。缓解：每个字段限制条数和字符数，renderer 统一截断。
- raw requirements 重复注入。缓解：按 normalize 后文本去重，并限制最多保留最近 N 条。
- v3 schema 迁移影响旧记录。缓解：旧记录只读 adapter，不强制改写历史数据。
- 通用聊天偏好与事实要求冲突。缓解：字段分层，continuity 和 critical facts 分开保存。

## Acceptance Criteria

- 长聊天压缩后，模型上下文中存在 Markdown 交接稿，而不是单句 topic。
- 用户明确给出的清单、数字、限制和输出要求可在压缩上下文中找到。
- 最近 2 轮原文仍保留。
- 旧压缩记录仍可读取和注入，不发生崩溃。
- golden case 测试覆盖通用聊天、清单、约束、情绪连续性和 open loop。
- `pnpm test` 的相关压缩测试通过；全量类型检查若有既有失败，需在实施记录中说明。
