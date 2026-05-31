<!--
  @file 2026-05-31-memory-system-design.md
  @description 记忆系统设计文档 — AI 从对话中提取并记住用户偏好与习惯，跨会话提供个性化回应。
-->

# 记忆系统设计

## 概述

为 Tibis 引入记忆系统，允许 AI 从对话中自动提取并记住用户偏好、习惯和重要事实，存储在 `~/.tibis/MEMORY.md`，在后续对话中自动注入 system prompt，实现"越用越懂你"的个性化体验。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 实现架构 | 渲染进程全栈实现 | 记忆系统本质是"读文件 → 调 AI → 写文件"的管道，与 `useCompactContext` 模式一致，复用现有 IPC 通道 |
| 存储格式 | Markdown 单文件 | 本地优先理念，用户可直接打开编辑，透明可控 |
| 存储位置 | `~/.tibis/MEMORY.md` | 与项目工作区根目录 `~/.tibis/` 一致，全局共享 |
| 提取方式 | 对话完成后 AI 提取 | 提取质量最高，能真正识别用户偏好和习惯 |
| 注入方式 | System Prompt 预注入 | 简单可靠，不依赖模型主动调用工具，与 MCP 指令注入模式一致 |
| 去重策略 | AI action + 字符串相似度双重检查 | AI 的 remove/update 无条件执行，AI 的 add 做相似度安全检查 |
| 作用域 | 全局单文件 | 当前只做用户级全局记忆，项目级记忆后续扩展 |

## 非目标

- 不做项目级记忆（`{project}/.tibis/MEMORY.md`），后续扩展
- 不做云同步记忆，Tibis 无服务端
- 不做 AI 工具按需读取（`read_memory` 工具），当前记忆量小无需按需
- 不做用户手动 @引用记忆
- 不做记忆版本历史

## 记忆文件格式

`~/.tibis/MEMORY.md`：

```markdown
# Instructions
- 始终使用 TypeScript，不要使用 JavaScript
- 代码注释使用中文
- 优先使用 lodash-es 而非手写工具函数

# Preferences
- 偏好函数式编程风格
- 喜欢简洁的代码，避免过度抽象
- 输出代码时附带简短解释

# Habits
- 经常在晚上工作
- 习惯先写测试再写实现
- 喜欢用 git worktree 隔离功能开发

# Facts
- 项目 tibis 使用 Vue 3 + Pinia + Electron 41
- 工作目录在 /Users/zhangbin/code/ai/tibis
- 团队有 3 个前端开发

# Projects
- tibis: 本地优先的 Markdown 写作与 AI 编辑器，技术栈 Vue 3 + Electron 41

# Current Context
- 正在开发记忆系统功能
- 最近在重构 AI 工具权限模块
```

### 分区说明

| 分区 | 含义 | 稳定性 | 裁剪优先级 | 示例 |
|------|------|--------|-----------|------|
| Instructions | 长期规则，AI 必须遵守的约束 | 极高 | 1（最优先保留） | "始终使用 TypeScript" |
| Preferences | 输出偏好，AI 应倾向的风格 | 高 | 2 | "偏好函数式编程风格" |
| Current Context | 近期事项，当前正在进行的工作 | 低 | 3 | "正在开发记忆系统功能" |
| Facts | 长期事实，关于用户/环境的客观信息 | 中 | 4 | "项目使用 Vue 3 + Pinia" |
| Habits | 工作习惯，AI 应适应的模式 | 中 | 5 | "习惯先写测试再写实现" |
| Projects | 长期项目，用户参与的项目描述 | 中 | 6（最先裁剪） | "tibis: 本地优先的 AI 编辑器" |

> **稳定性 ≠ 裁剪优先级**：Current Context 虽然稳定性最低（随时可能过时），但价值最高（直接影响当前对话质量），因此裁剪时优先保留。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                    渲染进程 (Vue 3)                       │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                    │
│  │ BChatSidebar  │    │  Settings    │                    │
│  │ 对话完成回调   │    │  记忆开关+列表 │                    │
│  └──────┬───────┘    └──────┬───────┘                    │
│         │                   │                            │
│         │  ①对话完成后       │  ③读取/删除记忆              │
│         │  触发记忆提取      │                            │
│         │                   │                            │
│         └─────────┬─────────┘                            │
│                   │                                      │
│          MemoryStore (Pinia)                             │
│          ┌────────┼────────┐                             │
│          │        │        │                             │
│   extractor  merger  injector                            │
│          │        │        │                             │
│          └────────┼────────┘                             │
│                   │                                      │
│          window.electronAPI                              │
│       (fs:readFile / fs:writeFile / ai:invoke)           │
└───────────────────┼──────────────────────────────────────┘
                    │  IPC（复用现有通道）
┌───────────────────┼──────────────────────────────────────┐
│                   │        主进程 (Electron)              │
│                   │                                      │
│   ┌───────────────▼───────────────┐                      │
│   │    现有 IPC handlers           │                      │
│   │  - fs:readFile                │                      │
│   │  - fs:writeFile               │                      │
│   │  - fs:ensureDir               │                      │
│   │  - ai:invoke                  │                      │
│   └───────────────┬───────────────┘                      │
│                   │                                      │
│                   ▼                                      │
│          ~/.tibis/MEMORY.md                              │
└──────────────────────────────────────────────────────────┘
```

## 模块拆分

| 位置 | 文件 | 职责 |
|------|------|------|
| `src/ai/memory/` | `types.ts` | 记忆类型定义 |
| `src/ai/memory/` | `parser.ts` | MEMORY.md 解析与序列化 |
| `src/ai/memory/` | `extractor.ts` | AI 提取 prompt 构建 |
| `src/ai/memory/` | `merger.ts` | 去重合并逻辑 |
| `src/ai/memory/` | `injector.ts` | 记忆注入到 system prompt |
| `src/stores/ai/` | `memory.ts` | 记忆 Store（调度中心） |
| `src/views/settings/` | `memory/index.vue` | 记忆设置页 |
| `src/views/settings/` | `constants.ts` | 新增 memory 菜单项 |
| `src/router/modules/` | 现有路由 | 新增 /settings/memory 路由 |
| `src/components/BChatSidebar/hooks/` | `useChatStream.ts` | 修改：注入 system prompt |

**不需要新增**：主进程模块、preload API、IPC 通道

### 模块间数据流

```
对话完成
  │
  ▼
MemoryStore.extractFromConversation(messages)
  │
  ├── extractor.buildExtractionPrompt(messages)    ← 构建 prompt
  │
  ├── electronAPI.aiInvoke(...)                    ← 调用 AI 提取
  │
  ├── parser.parseMemoryDoc(existingText)           ← 解析现有记忆
  │
  ├── merger.mergeMemory(current, extracted)        ← 去重合并
  │
  └── electronAPI.fsWriteFile(...)                  ← 写回文件

新对话开始
  │
  ▼
MemoryStore.loadMemory()
  │
  ├── electronAPI.fsReadFile(...)                   ← 读取文件
  │
  ├── parser.parseMemoryDoc(text)                   ← 解析
  │
  └── injector.buildSystemPromptContext(doc)        ← 构建注入内容
      │
      ▼
  agent.stream({ ..., system: memoryContext })      ← 注入 system prompt
```

## 核心接口

### types.ts

```typescript
/** 记忆分区名称 */
type MemoryCategory =
  | 'Instructions'
  | 'Preferences'
  | 'Habits'
  | 'Facts'
  | 'Projects'
  | 'Current Context'

/** 单条记忆 */
interface MemoryItem {
  content: string
}

/** 记忆分区 */
interface MemorySection {
  category: MemoryCategory
  items: MemoryItem[]
}

/** 完整记忆文档 */
interface MemoryDoc {
  sections: MemorySection[]
}

/** AI 提取结果中的单条操作 */
interface ExtractedMemoryItem {
  action: 'add' | 'update' | 'remove'
  section: MemoryCategory
  content: string
  reason: string
}

/** AI 提取结果 */
interface ExtractedMemory {
  items: ExtractedMemoryItem[]
}

/** 提取用消息（对话消息的精简视图，避免依赖具体聊天类型） */
interface ExtractionMessage {
  role: 'user' | 'assistant'
  content: string
}
```

### parser.ts

```typescript
/**
 * 将 MEMORY.md 文本解析为 MemoryDoc 结构
 * @param text - MEMORY.md 原始文本
 * @returns 解析后的记忆文档
 */
function parseMemoryDoc(text: string): MemoryDoc

/**
 * 将 MemoryDoc 序列化为 MEMORY.md 文本
 * @param doc - 记忆文档结构
 * @returns 序列化后的 Markdown 文本
 */
function serializeMemoryDoc(doc: MemoryDoc): string
```

### extractor.ts

```typescript
/**
 * 构建发送给 AI 的记忆提取 prompt
 * @param messages - 本次对话的用户和助手消息
 * @param existingMemory - 当前已有的记忆文档（供 AI 参考，避免重复提取）
 * @returns 完整的 prompt 字符串
 */
function buildExtractionPrompt(
  messages: ExtractionMessage[],
  existingMemory: MemoryDoc
): string
```

### merger.ts

```typescript
/**
 * 将 AI 提取的记忆合并到现有记忆文档中
 *
 * 合并优先级：
 * - AI 的 remove/update → 无条件执行（AI 做了语义判断）
 * - AI 的 add → 做字符串相似度安全检查（相似度 > 0.8 才拦截）
 *
 * @param current - 当前记忆文档
 * @param extracted - AI 提取的记忆操作列表
 * @returns 合并后的记忆文档
 */
function mergeMemory(current: MemoryDoc, extracted: ExtractedMemory): MemoryDoc

/**
 * 检查两条记忆是否相似
 * @param newItem - 新记忆内容
 * @param existingItem - 已有记忆内容
 * @param threshold - 相似度阈值，默认 0.8
 * @returns 是否相似
 */
function isSimilar(newItem: string, existingItem: string, threshold?: number): boolean

/**
 * 从文本中提取关键词（分词 + 去停用词）
 * @param text - 输入文本
 * @returns 关键词数组
 */
function extractKeywords(text: string): string[]

/**
 * 计算两个数组的交集
 * @param a - 数组 a
 * @param b - 数组 b
 * @returns 交集元素数组
 */
function intersection<T>(a: T[], b: T[]): T[]
```

### injector.ts

```typescript
/**
 * 构建要注入到 System Prompt 的记忆上下文
 *
 * 格式：<user_memory>...</user_memory>
 * 包含所有分区内容，控制在 token 预算内
 *
 * @param doc - 记忆文档
 * @param maxChars - 最大字符数，默认 4000
 * @returns 注入到 system prompt 的字符串，无记忆时返回空字符串
 */
function buildSystemPromptContext(doc: MemoryDoc, maxChars?: number): string
```

### memory.ts (Pinia Store)

```typescript
/**
 * 记忆状态 Store，作为记忆系统的调度中心
 */
interface MemoryStore {
  /** 记忆开关（持久化） */
  enabled: boolean
  /** 当前加载的记忆文档缓存 */
  doc: MemoryDoc | null
  /** 上次提取时间戳（ms） */
  lastExtractedAt: number
  /** 累计对话轮数（全局计数器） */
  accumulatedTurns: number
  /** 是否正在提取中 */
  extracting: boolean

  /**
   * 从对话中提取记忆
   * 检查触发条件（累计轮数 ≥ 2 + 时间窗口），满足则调用 AI 提取并合并
   * @param messages - 本次对话的消息列表
   */
  extractFromConversation(messages: ExtractionMessage[]): Promise<void>

  /**
   * 加载记忆文件到缓存
   * 读取 ~/.tibis/MEMORY.md 并解析为 MemoryDoc
   */
  loadMemory(): Promise<void>

  /**
   * 构建 system prompt 注入内容
   * 基于缓存的 doc 构建，若 doc 为空则先 loadMemory
   * @returns 注入字符串，记忆关闭或无记忆时返回空字符串
   */
  buildSystemPromptContext(): Promise<string>

  /**
   * 删除指定分区的指定记忆条目
   * @param category - 分区名称
   * @param index - 条目索引
   */
  deleteItem(category: MemoryCategory, index: number): Promise<void>

  /**
   * 清空所有记忆
   */
  clearAll(): Promise<void>

  /**
   * 切换记忆开关
   * @param value - 开关状态
   */
  setEnabled(value: boolean): void
}
```

## 记忆提取流程

### 触发条件

采用**累计轮数 + 时间驱动**的混合策略，避免跨会话记忆永不更新的边界情况：

```
触发条件：累计轮数 ≥ 2 AND (距上次提取 > 2小时 OR 强制触发)
```

| 触发点 | 行为 | 条件 |
|--------|------|------|
| 对话流式完成 | 自动提取记忆 | 记忆开关开启 + 累计轮数 ≥ 2 + 距上次提取 > 2h |
| 用户手动触发 | `/memory extract` 斜杠命令 | 记忆开关开启 |
| 应用启动 | 加载记忆到缓存 | 记忆开关开启 |
| 设置页操作 | 读取/删除/清空 | 无条件 |

**为什么累计轮数 ≥ 2**：单轮对话信息量太少，提取价值低且浪费 AI 调用。

**为什么加时间驱动**：用户可能在会话 A 中对话 1 轮就关闭，会话 B 又对话 1 轮。如果按会话级计数，可能永远不会触发自动提取。全局累计计数器 + 时间窗口确保记忆最终会被更新。

### 提取 prompt 设计

```typescript
const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Analyze the conversation and extract user information that should be remembered for future conversations.

Categories:
- Instructions: Long-term rules the user wants AI to always follow (e.g., "always use TypeScript")
- Preferences: Output style preferences (e.g., "prefer functional programming style")
- Habits: Work habits and patterns (e.g., "writes tests before implementation")
- Facts: Long-term facts about the user or their environment (e.g., "project uses Vue 3 + Pinia")
- Projects: Long-term project descriptions the user is involved in
- Current Context: Recent or ongoing work items

Existing memory summary (avoid duplicating these):
{existing_memory_summary}

Conversation to analyze:
{conversation}

${OUTPUT_FORMAT}`
```

> **注意**：`{existing_memory_summary}` 不注入完整记忆文本，只传各分区摘要（分区名 + 条目数 + 首条摘要），减少提取 prompt 的 token 消耗。例如：`- Instructions: 3 items (e.g., "使用 TypeScript")`。

### 严格输出格式约束

```typescript
const OUTPUT_FORMAT = `Output ONLY valid JSON array. Each item must have:
- "action": "add" | "update" | "remove"
- "section": "Instructions" | "Preferences" | "Habits" | "Facts" | "Projects" | "Current Context"
- "content": string (single line, no markdown formatting)
- "reason": string (brief explanation, for debugging)

Example:
[
  {"action": "add", "section": "Facts", "content": "用户正在开发记忆系统功能", "reason": "对话中明确提及"},
  {"action": "update", "section": "Preferences", "content": "偏好使用中文注释", "reason": "替代旧的英文注释偏好"}
]

Do NOT wrap in markdown code blocks. Output raw JSON array only.
If nothing worth remembering, output empty array: []`
```

### JSON 解析降级

在 `merger.ts` 中增加 JSON 解析失败的降级处理：

```typescript
function parseExtractionResult(raw: string): ExtractedMemory {
  // 1. 尝试直接解析
  try {
    return JSON.parse(raw)
  } catch {}

  // 2. 尝试从 markdown code block 中提取
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1])
    } catch {}
  }

  // 3. 尝试正则提取 JSON 数组
  const arrayMatch = raw.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0])
    } catch {}
  }

  // 4. 全部失败 → 跳过本次提取（不破坏现有记忆）
  return { items: [] }
}
```

## 去重合并策略

### 合并优先级

```
AI 的 remove → 无条件删除匹配项
AI 的 update → 无条件替换匹配项
AI 的 add   → isSimilar 做安全检查，相似度 > 0.8 才拦截
```

**核心原则**：AI 的 remove/update 隐含了语义判断（"我知道这是旧的/错误的"），无条件执行；AI 的 add 是"我发现了新东西"，适合做规则级二次确认。

### 相似度判断

```typescript
function isSimilar(newItem: string, existingItem: string, threshold = 0.8): boolean {
  // 1. 完全相同
  if (newItem === existingItem) return true

  // 2. 一个包含另一个（语义包含）
  if (newItem.includes(existingItem) || existingItem.includes(newItem)) return true

  // 3. 关键词重叠率
  const newKeywords = extractKeywords(newItem)
  const existingKeywords = extractKeywords(existingItem)
  const overlap = intersection(newKeywords, existingKeywords)
  return overlap.length / Math.max(newKeywords.length, existingKeywords.length) > threshold
}
```

## 记忆注入机制

### 注入方式

System Prompt 预注入。在 `useChatStream.ts` 的 `agent.stream()` 调用中传入 `system` 字段：

```typescript
// useChatStream.ts - handleStreamMessages 中
const memoryContext = memoryStore.buildSystemPromptContext()

agent.stream({
  messages: continuedMessages,
  modelId: config.modelId,
  providerId: config.providerId,
  tools: transportTools,
  system: memoryContext,
  tavily: toolSettingsStore.tavily,
  mcp: resolveMcpRequestConfig()
})
```

### 注入内容格式

```xml
<user_memory>
以下是关于该用户的已知信息，请在回应中自然地参考这些信息，不要刻意提及"根据记忆..."。

# Instructions
- 始终使用 TypeScript，不要使用 JavaScript

# Preferences
- 偏好函数式编程风格

# Habits
- 习惯先写测试再写实现

# Facts
- 项目 tibis 使用 Vue 3 + Pinia + Electron 41

# Projects
- tibis: 本地优先的 Markdown 写作与 AI 编辑器

# Current Context
- 正在开发记忆系统功能
</user_memory>
```

### Token 预算控制

| 策略 | 值 | 说明 |
|------|-----|------|
| 最大字符数 | 4000 chars | 约 1000 tokens，占上下文窗口比例小 |
| 超限裁剪优先级 | Instructions(1) > Preferences(2) > Current Context(3) > Facts(4) > Habits(5) > Projects(6) | 编号对应分区说明表中的裁剪优先级列 |
| 裁剪方式 | 按分区整块裁剪，不截断单条记忆 | 保持语义完整 |

## 设置页 UI

在设置页侧边栏新增「记忆」菜单项：

```
功能配置
  ├── 通用
  ├── 记忆      ← 新增
  ├── MCP
  ├── 技能
  └── 网络搜索
```

### 记忆设置页内容

1. **开关**：启用/禁用记忆功能（默认开启）
2. **记忆列表**：只读展示 MEMORY.md 中的所有记忆条目，按分区分组显示
3. **删除**：每条记忆右侧有删除按钮
4. **清空**：一键清空所有记忆（需二次确认）
5. **打开文件**：按钮直接在编辑器中打开 `~/.tibis/MEMORY.md`，用户可手动编辑

## 与现有系统的关系

| 系统 | 关系 |
|------|------|
| 压缩系统（`useCompactContext`） | 独立运作，不依赖压缩。提取记忆时复用压缩模型的 AI 调用通道（`ai:invoke`） |
| SettingsTool | 记忆开关不通过 AI 工具修改（属于隐私敏感设置），仅在设置页手动操作 |
| 文件系统 | 复用现有 `fs:readFile` / `fs:writeFile` / `fs:ensureDir` IPC |
| AI 调用 | 复用现有 `ai:invoke` IPC，使用摘要模型配置 |
| Skill 系统 | 独立，记忆不注册为 skill |
| MCP 工具 | 独立，记忆不注册为 MCP 工具 |
