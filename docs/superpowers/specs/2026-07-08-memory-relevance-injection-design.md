<!--
  @file 2026-07-08-memory-relevance-injection-design.md
  @description 记忆相关性注入设计文档：普通对话按当前请求召回相关记忆，减少无关记忆对回答的干扰。
-->

# 记忆相关性注入设计

## 背景

当前全局记忆通过 `src/stores/ai/memory.ts` 加载 `MEMORY.md`，再由 `src/ai/memory/injector.ts` 构造成 `<user_memory>` 注入聊天 runtime 的 system prompt。现有实现默认发送所有非空分区，只有超过字符预算时才按分区优先级裁剪。

这种方式简单可靠，但当记忆增长后会带来两个问题：

- 无关记忆会进入当前对话，影响模型对本轮意图的判断。
- 裁剪以整分区为单位，粒度较粗，相关条目可能被不相关条目挤掉。

本设计优先解决“提高回答相关性，避免无关记忆影响当前回答”。降低 token 成本是附带收益，但不是第一优先目标。

## 目标

- 未暴露 `edit_memory` 的普通回答请求不再无条件注入完整记忆。
- 根据当前用户消息、引用文件和工作区信息选择相关记忆条目。
- 保留少量全局核心记忆，避免模型完全失去稳定的用户偏好和规则。
- 在无相关命中时只注入核心记忆，不强行注入其他分区。
- 保持现有 `MEMORY.md` 格式、设置页展示和磁盘读写行为不变。
- 不引入 embedding、向量索引或网络依赖。
- 保护 `edit_memory` 当前“分区完整覆盖”语义，避免模型只看到部分记忆后误删未注入条目。

## 非目标

- 不改变 `MEMORY.md` 的 Markdown 格式。
- 不新增数据库、缓存文件或向量索引。
- 不在第一版实现语义 embedding 召回。
- 不在第一版重写 `edit_memory` 为 patch 语义。
- 不新增用户可见的记忆管理 UI。
- 不改变记忆开关 `memoryEnabled` 的含义。
- 不重新排序现有预算裁剪优先级 `PRUNE_PRIORITY`，除非后续有单独决策。

## 设计概览

在 `src/ai/memory` 增加一个轻量选择层，位于解析和注入之间：

```text
MemoryDoc
  │
  ▼
selectRelevantMemorySections(doc, context)
  │
  ▼
buildSystemPromptContext(selectedDoc)
  │
  ▼
<user_memory>...</user_memory>
```

`parser.ts` 继续负责 `MEMORY.md` 与 `MemoryDoc` 的互转。`injector.ts` 负责构建最终 prompt，并调用选择层完成普通对话的相关性筛选。`stores/ai/memory.ts` 负责接收 runtime 传入的选择上下文。

## 核心类型

新增类型放在 `src/ai/memory/types.ts` 或独立的 `selector.ts` 中，具体落点以实现时避免循环依赖为准。

```ts
/** 记忆注入模式。 */
type MemoryInjectionMode = 'relevant' | 'full';

/** 记忆选择上下文。 */
interface MemorySelectionContext {
  /** 当前用户消息文本。 */
  userMessage: string;
  /** 当前消息引用的文件路径或资源路径。 */
  references: string[];
  /** 当前工作区根目录，仅用于提取项目名等关键词。 */
  workspaceRoot?: string;
  /** 记忆注入模式，默认 relevant。 */
  mode?: MemoryInjectionMode;
}

/** 构建 system prompt 记忆上下文的选项。 */
interface BuildMemoryContextOptions {
  /** 最大注入字符数。 */
  maxChars?: number;
  /** 当前请求的选择上下文。 */
  selection?: MemorySelectionContext;
}
```

`mode: 'full'` 用于需要完整记忆的路径，例如本轮暴露 `edit_memory` 工具时使用。当传入 `selection` 但未声明 `mode` 时，默认模式是 `relevant`。当旧调用完全不传 options 时，保持当前完整注入行为，避免隐藏破坏已有调用方。首版以回答相关性为优先目标，因此普通回答轮可以选择 `mode: 'relevant'` 并从实际发送的工具集中移除 `edit_memory`；需要让模型管理记忆的轮次则使用 `mode: 'full'` 并暴露 `edit_memory`。

注入器签名需要兼容现有 `maxChars` 行为：

```ts
/**
 * 构建要注入到 System Prompt 的记忆上下文。
 * @param doc - 记忆文档
 * @param options - 记忆注入选项，不传时等价于当前完整注入和默认预算
 * @returns 注入到 system prompt 的字符串，无记忆时返回空字符串
 */
export function buildSystemPromptContext(doc: MemoryDoc, options?: BuildMemoryContextOptions): string;
```

`options.maxChars` 取代原第二参数，缺省仍为 `4000`。`src/stores/ai/memory.ts` 的 `memoryStore.buildSystemPromptContext()` 包装方法同步接受并透传 `options`。旧调用不传 options 时必须完全等价于当前行为：完整注入，最大字符数为 `4000`。

## 选择策略

### 核心分区

`Instructions` 是最高优先级分区，默认参与注入。它通常包含长期规则，和单轮问题不一定有关键词重合，但对回答约束有稳定价值。核心分区仍然受总预算约束；如果 `Instructions` 自身超过预算，也需要按条目裁剪，而不是突破 `maxChars`。

`Preferences` 分区采用混合策略：

- 命中关键词的偏好条目优先注入。
- 当没有命中时，最多保留 3 条短偏好作为核心偏好。
- 核心偏好计入同一个注入预算，避免偏好分区重新变成全量注入。

### 相关分区

`Current Context`、`Projects`、`Facts`、`Habits` 默认按条目打分。分数大于 0 的条目才进入候选集合。

关键词来源：

- 当前用户消息内容。
- 当前消息的 `Message.references`，取 `references.map((reference) => reference.path)` 后使用完整路径和 basename。
- 当前 workspace root 的目录名。
- 重新生成时，从 `sourceMessages` 中最后一条 `role === 'user'` 的消息提取 `content` 和 `references`。

`files?: ChatMessageFile[]` 是附件列表，不作为第一版记忆召回的引用来源。文件引用召回只使用 `Message.references`，这样用户通过 `@文件` 引用时可以稳定命中。

关键词提取规则保持简单可测：

- 查询文本和记忆条目文本都经过同一个 `normalizeMemoryText()`。
- 统一转小写。
- 将标点替换为空格，但路径拆词阶段会额外按 `/`、`.`、`-`、`_` 拆分。
- 保留中文、英文和数字。
- 英文词长度至少 2。
- 中文保持连续字串，并允许中文字面子串命中。例如记忆条目包含“经济学”，用户消息包含“经济”时应命中。
- 引用路径额外拆分完整路径和 basename，得到更具体的文件名关键词。

打分规则：

- 条目文本包含关键词时加分。
- 分区可有基础权重，`Current Context` 和 `Projects` 略高于 `Facts` 与 `Habits`。
- 引用文件名命中可提高分数，因为它通常比普通自然语言关键词更具体。
- 同分时保持原始分区顺序和条目顺序，保证输出稳定。

这里的基础权重只用于相关性排序，发生在预算裁剪之前。现有 `src/ai/memory/injector.ts` 的 `PRUNE_PRIORITY` 是预算裁剪优先级，两者是不同维度。本设计不默认修改 `PRUNE_PRIORITY`。

## 注入预算

现有 `DEFAULT_MAX_CHARS = 4000` 可以保留。相关性选择发生在预算裁剪之前：

1. 先按相关性得到候选条目。
2. 再按优先级和分数填充预算。
3. 如果候选为空，只注入核心分区。

裁剪粒度建议从“整分区”细化为“条目”。这样某个分区很长时，不会因为少数不相关条目导致整块被丢弃。

条目级裁剪先生成带分数的候选条目，再按预算填充并恢复分区结构：

```ts
/**
 * 按预算选择候选记忆条目。
 * @param candidates - 已包含分区、原始顺序、相关性分数的候选条目
 * @param maxChars - 最大注入字符数
 * @returns 预算内的分区列表
 */
function pruneItemsToBudget(candidates: MemoryCandidate[], maxChars: number): MemorySection[] {
  const sorted = candidates.sort(byPriorityThenScoreThenOriginalOrder);
  const kept: MemoryCandidate[] = [];
  let remaining = maxChars - estimatePromptOverhead();

  for (const candidate of sorted) {
    const itemCost = estimateItemCost(candidate);
    if (itemCost > remaining) continue;
    kept.push(candidate);
    remaining -= itemCost;
  }

  return regroupCandidatesByMemoryCategoryOrder(kept);
}
```

`byPriorityThenScoreThenOriginalOrder` 使用预算裁剪优先级、相关性分数和原始顺序共同排序；分数只在同一预算优先级内影响取舍。输出时仍按 `MEMORY_CATEGORIES` 的分区顺序组织。

输出仍按分区组织，避免改变模型读取记忆的方式：

```xml
<user_memory>
以下是关于该用户的已知信息。内容已按当前请求筛选，请自然参考，不要刻意说明“根据记忆”。

# Instructions
- ...

# Projects
- ...
</user_memory>
```

## Runtime 数据流

当前 `src/components/BChat/hooks/useRuntimeConfig.ts` 的 `resolveRuntimeSystemPrompt()` 不接收当前消息。需要把当前请求上下文传入。

调整后的数据流：

```text
src/components/BChat/index.vue
  │ sendRuntimeUserMessage: input.userMessage
  │ startRuntimeRegenerate: sourceMessages 最后一条 user 消息
  ▼
resolveChatRuntimeRequestConfig(selectionSource)
  │ 先计算 candidateTools，再根据记忆模式得到 finalTools
  ▼
useRuntimeConfig.resolveRuntimeSystemPrompt(selectionContext)
  │
  ▼
memoryStore.buildSystemPromptContext({ selection })
  │
  ▼
buildSystemPromptContext(doc, options)
```

`src/components/BChat/index.vue` 负责在构建 `ChatRuntimeRequestConfig` 时传入本轮用户消息上下文。`sendRuntimeUserMessage()` 已持有 `input.userMessage`，应把它传给 `resolveChatRuntimeRequestConfig(input.userMessage)`。`startRuntimeRegenerate()` 没有独立的新消息，应从 `sourceMessages` 中取最后一条 user 消息构造 selection，确保重新生成与首次生成使用同一类记忆召回上下文。

`resolveChatRuntimeRequestConfig()` 需要先计算一次候选工具列表 `candidateTools`，再根据本轮记忆模式得到最终发送给模型的 `finalTools`。`finalTools` 必须同时用于 system prompt 安全判断和 `toTransportTools(finalTools)`，避免 system prompt 判断的工具集与实际发送的工具集不一致。`useRuntimeConfig` 仍只做 runtime 配置聚合，不承担记忆打分细节。

## edit_memory 安全边界

`src/ai/tools/builtin/MemoryTool/index.ts` 当前工具语义是“传入某个分区的完整条目列表，工具直接覆盖该分区”。这要求模型知道目标分区已有的完整内容。

因此第一版必须增加 turn 级安全门：

- 如果本轮实际发送给模型的工具集中包含 `edit_memory`，本轮 system 记忆强制使用 `mode: 'full'`。
- 如果本轮 system 记忆使用 `mode: 'relevant'`，本轮不能向模型暴露 `edit_memory`。
- `resolveChatRuntimeRequestConfig()` 负责从候选工具列表得到最终工具列表，并用同一个 `finalTools` 同时决定 `mode` 和最终 `tools`，避免判断与发送不一致。

本设计的首版推荐取舍是：普通回答轮优先 `mode: 'relevant'`，并从该轮工具列表中过滤 `edit_memory`；显式记忆管理轮或后续记忆维护流程才使用 `mode: 'full'` 和 `edit_memory`。如果实现时决定保持当前默认工具列表不变，因为 `edit_memory` 当前属于默认写工具，那么大多数工具可用轮次会自动落入 full 模式，相关性优化覆盖面会明显变小。

这条规则会让“相关性注入”和“当前整分区覆盖式记忆编辑”不能在同一轮同时启用。若后续希望工具可用时仍保持 relevant 注入，需要先做其中一种改造：

- 将 `edit_memory` 改成 patch 语义，例如 append、update、delete by exact content。
- 或让 `edit_memory` 第一次调用只返回目标分区的权威完整内容，并要求模型基于该权威状态重新提交覆盖列表。

第一版的实现重点是普通回答的注入质量，不把 `edit_memory` 语义重构混入同一改动。

## 错误处理与降级

- 记忆未加载时，继续沿用 `memoryStore.loadMemory()` 的懒加载行为。
- 旧调用不传 options 时保持完整记忆注入。
- 普通聊天传入空选择上下文时，退化为核心记忆注入，而不是全量注入。
- `mode: 'full'` 时沿用当前完整注入和预算裁剪策略。
- 本轮工具集包含 `edit_memory` 时，无论 selection 是否存在，都强制使用 `mode: 'full'`。
- 本轮选择 `mode: 'relevant'` 时，必须从最终发送给模型的工具集中排除 `edit_memory`。
- 打分过程不抛出业务错误；异常输入只会得到更少的关键词。
- 记忆开关关闭时继续返回空字符串。

## 测试计划

新增或扩展测试覆盖以下场景：

- `Instructions` 在普通相关注入中默认保留。
- `Preferences` 命中关键词时优先保留命中条目。
- `Projects`、`Facts`、`Habits`、`Current Context` 只有命中关键词时才注入。
- 引用文件 basename 可以召回相关项目或事实条目。
- `Message.references` 的路径参与召回，`files` 附件不参与第一版召回。
- 中文字面子串可以命中，例如“经济”命中“经济学”。
- 无关键词命中时只注入核心记忆。
- 超预算时按条目稳定裁剪，并保留高优先级条目。
- `Instructions` 自身超预算时也按条目裁剪。
- `mode: 'full'` 保持当前完整记忆注入行为。
- `useRuntimeConfig.resolveRuntimeSystemPrompt()` 能把当前消息上下文传递给 memory store。
- `sendRuntimeUserMessage()` 使用 `input.userMessage` 构造 selection。
- `startRuntimeRegenerate()` 使用 `sourceMessages` 最后一条 user 消息构造 selection。
- 本轮工具集包含 `edit_memory` 时强制 full 模式，避免 relevant 模式下整分区覆盖造成数据丢失。
- 本轮选择 relevant 模式时，最终 transport tools 中不包含 `edit_memory`。

## 分阶段实施

### 第一阶段：选择层与直接单测

- 新增记忆关键词提取、条目打分和分区重组逻辑。
- 扩展 `buildSystemPromptContext()` 支持 `BuildMemoryContextOptions`。
- 保持旧调用兼容，不传 options 时仍使用完整注入；普通聊天接入后必须显式传入 `selection` 才启用相关性注入。

### 第二阶段：Runtime 接入

- 修改 `resolveRuntimeSystemPrompt()` 接收选择上下文。
- 在 `src/components/BChat/index.vue` 构造当前用户消息、引用和 workspace root。
- 调整 `resolveChatRuntimeRequestConfig()`，让发送路径传入 `input.userMessage`，重新生成路径传入 `sourceMessages` 最后一条 user 消息。
- 在 `resolveChatRuntimeRequestConfig()` 中先计算一次 `candidateTools`，再得到符合安全门的 `finalTools`，并复用 `finalTools` 生成 transport tools。
- 普通回答轮选择 relevant 模式时过滤 `edit_memory`；若产品行为要求本轮保留 `edit_memory`，则改用 full 模式。
- 保持空上下文和关闭记忆开关时的现有行为。

### 第三阶段：完整模式边界

- 为 `mode: 'full'` 增加测试，确保需要完整记忆的路径有明确入口。
- 增加 `edit_memory` 工具安全门测试，确保暴露该工具时不会使用 relevant 注入。
- 不在本阶段改变 `edit_memory` schema。

## 风险与取舍

- 关键词召回可能漏掉语义相关但字面不相同的记忆。第一版接受这个取舍，以换取实现简单、可预测和无外部依赖。
- 核心偏好保留过多会削弱相关性优化效果，因此应限制数量和预算。
- 如果当前用户消息很短，召回结果会偏少。这种情况下只注入核心记忆是可接受行为。
- 短追问例如“继续”“为什么”可能关键词不足。可选增强是在 selection 的 `userMessage` 中拼接最近 1 到 2 条用户消息，但第一版只要求重新生成路径稳定取最后一条 user 消息。
- `edit_memory` 的完整覆盖语义会限制相关性注入在工具可用轮次中的覆盖面。第一版用 turn 级安全门保证不丢数据，后续若要让二者并存，需要改工具语义或增加权威状态回显流程。

## 验收标准

- 未暴露 `edit_memory` 的普通回答轮 system prompt 不再默认包含所有非空记忆分区。
- 当前问题明确提到某个项目、文件或偏好时，相关条目会进入 `<user_memory>`。
- 与当前问题无关的项目、事实或习惯不会进入 `<user_memory>`。
- 记忆为空或关闭时行为不变。
- 完整记忆模式可用于保留当前 `edit_memory` 的安全前提。
- 暴露 `edit_memory` 的轮次不会使用 relevant 子集去执行整分区覆盖。
- relevant 轮次不会向模型暴露 `edit_memory`。
- 重新生成路径使用最后一条 user 消息构造 selection，避免重试时丢失召回上下文。
- 相关核心逻辑有直接单元测试覆盖。
