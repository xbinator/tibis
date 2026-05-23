# Skill 系统设计评审

> 评审日期：2026-05-24
> 评审人：Claude Code
> 设计文档：[../specs/2026-05-24-skill-system-design.md](../specs/2026-05-24-skill-system-design.md)

## 整体评价

设计文档整体架构方向正确（渲染进程全栈实现、LLM 自动触发、兼容 OpenCode 生态），与项目现有模式一致。以下按问题严重程度逐一分析，前 4 个为关键问题，建议在编码前明确方案。

## 关键问题

### 1. `FileWatchService` 不支持目录级 + glob 模式监听

当前 `electron/main/modules/file/service.mts` 的 `FileWatchService.watch(filePath)` 按单个文件路径做 chokidar 监听，内部用 `Map<string, FileWatcher>` 管理。设计提出的 `watchDirectory(dirPath, globPattern)` 是一个新抽象，需要仔细设计：

- chokidar 本身支持目录+glob 监听，但需要 `depth` 参数控制扫描深度（skill 目录下可能有子目录如 `templates/`、`examples/`，不需要递归监听）
- 需要建立**事件路径 → skill 实例**的映射，避免每次收到事件都全量重扫
- skill 目录新增/删除时如何增量更新

**建议**：在 `service.mts` 中新增独立方法，不使用 `this.watchers` Map（其 key 是文件路径，语义不匹配）。新方法用 `chokidar.watch(dirPath, { depth: ..., ignored: ... })` 监听 `.agents/skills/` 目录，返回清理函数。收到变更事件后通过 IPC 将受影响的文件路径传给渲染进程，渲染进程做**增量解析**（解析单个文件的 SKILL.md，更新或移除对应记录）而非全量重扫。

渲染进程需要监听新 IPC 事件 `skill:changed`。这里有两种 IPC 设计：
- a) 新增独立的 `skill:changed` 事件（语义清晰，推荐）
- b) 复用现有 `file:changed` 事件（少一个事件通道，但渲染层需自行过滤路径）

**推荐 a**，因为 skill 变更的语义与文件变更不同，未来可能有不同的处理逻辑。

### 2. `createBuiltinTools` 集成方式未定义

设计文档没有说明 skill 工具如何融入现有的 `createBuiltinTools` 工厂函数（`src/ai/tools/builtin/index.ts:125`）。skill 工具有两个特殊之处：

1. **动态 description**：其 `definition.description` 依赖 skill store 中已启用 skill 列表，每次列表变化都需要更新
2. **运行时注入**：`execute` 方法从 store 实时读取 skill body 内容

目前所有内置工具的 `definition` 在创建时固化（如 `EnvironmentTool/index.ts`），没有动态更新机制。`toTransportTools()`（`stream.ts:59`）读取 `item.definition.description` 构建传输工具列表。

三种可行方案：

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| a. Getter 方案 | `SkillTool.definition.description` 改为 getter，读取 store 实时生成 | 零侵入、现有模式改动最小 | `AIToolDefinition` 接口需改 `description: string` 为 `string | (() => string)` |
| b. 工厂注入方案 | `createBuiltinTools` 接受 skill store，内部用 computed 包装 | 不修改类型接口 | 工厂签名膨胀，skill 工具和其他 9 个工具耦合 |
| c. 独立注册方案 | skill 工具不从 `createBuiltinTools` 产出，在聊天流构建 tool 列表时单独注入 | 完全解耦 | 工具注册逻辑分散在两处 |

**推荐方案 a**。改动最小——只需在 `AIToolDefinition` 中将 `description` 改为 `string | (() => string)` 并在 `toTransportTools` 中兼容处理，同时不影响其他 9 个工具。

### 3. 启动时序——skill 扫描必须在首次聊天之前完成

skill 扫描是异步 I/O（遍历目录、读取 SKILL.md 文件）。如果用户在扫描完成前发送消息，聊天流构建 tool 列表时 skill 列表为空，LLM 将看不到任何 skill。

**建议**：`useSkillStore.init()` 返回一个 Promise，标记为 `initialized` 状态。在聊天流中，如果 store 尚未初始化，在 tool 列表构建时排除 skill 工具。或提供一个 `waitForInit()` 方法，聊天流在发送前 `await` 该 Promise。

这与 MCP discovery 的初始化时序类似，可以参考 MCP 模块的处理方式。

### 4. 目录监听的 IPC、preload、类型定义需要全链路对齐

新增目录监听的完整链路涉及 4 层：

| 层 | 文件 | 变更 |
|----|------|------|
| 主进程 Service | `electron/main/modules/file/service.mts` | 新增 `watchDirectory` / `unwatchDirectory` 方法 |
| 主进程 IPC | `electron/main/modules/file/ipc.mts` | 新增 `fs:watchDirectory` / `fs:unwatchDirectory` handler |
| Preload | `electron/preload/index.mts` | 新增 `watchDirectory` / `unwatchDirectory` / `onSkillChanged` 方法 |
| 类型 | `types/electron-api.d.ts` | 新增 `ElectronAPI` 接口字段 |

设计文档提到了 IPC 通道 `fs:watchDirectory` / `fs:unwatchDirectory`，但没有详细说明事件回调 (`onSkillChanged`) 的 preload 注册方式。参考现有 `onFileChanged` 的模式：

```typescript
// preload 中
onSkillChanged: (callback) => {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on('skill:changed', handler);
  return () => { ipcRenderer.removeListener('skill:changed', handler); };
}
```

## 设计细节问题

### 5. 缺少 skill body 长度限制

当前 `.agents/skills/writing-skills/SKILL.md` 有 400+ 行。作为 tool result 注入 LLM 上下文时可能挤占上下文窗口。

**建议**：增加配置项（可写在 `SkillScanConfig` 中），默认 10,000 字符，超长时截断并在末尾附加 `[Content truncated, full content at: {filePath}]` 提示。

### 6. `parsedAt` 时间戳用途不明确

`SkillDefinition.parsedAt: number` 字段没有说明用途。如果用于缓存失效判断，应注明阈值；如果仅用于 UI 展示（"上次解析时间"），也应注明。

**建议**：在注释中明确用途。如果是 UI 展示，建议额外提供 `parseError?: string` 字段，在解析失败时记录错误信息。

### 7. 去重覆盖规则的语义与实际效果矛盾

文档说"同名 skill 后发现者覆盖先发现者"，同时"扫描顺序：用户配置路径 → 项目目录"。

两者组合后的实际效果是：**项目路径覆盖用户路径**（项目后扫 → 项目 skill 覆盖用户自定义同名 skill）。这很可能不符合预期——通常直觉是用户自定义路径优先级更高。

**建议**：将扫描顺序反转为"项目目录 → 用户配置路径"，或者在 UI/文档中明确说明优先级规则。

### 8. `source` 类型过于狭窄

`SkillDefinition.source: 'project' | 'user'` 在当前够用，但如果将来 skill 有更多来源（built-in 内置 skill、MCP-provided skill 等），需要扩展。

**建议**：类型改为 `'builtin' | 'project' | 'user'`，为内置 skill 预留空间。

### 9. 缺少 skill 与其他工具的交互考量

skill 加载后 LLM 行为可能变化（更激进地编辑、或遵循特定安全约束），但现有权限系统 (`permission.ts`) 和策略系统 (`policy.ts`) 对已加载 skill 无感知。

**建议**：v1 暂不处理此问题。未来可在权限确认 UI 中展示"当前已加载 skill 列表"，帮助用户理解 LLM 的行为依据。

## 缺失的考量

### 10. 解析失败的容错策略

文档提到"解析失败：跳过该 skill"，但没有说明：
- 之前已成功加载的 skill 在文件被破坏后是否保留在 store 中（stale cache）
- 前端是否需要展示解析错误信息

**建议**：解析失败时**移除**该 skill（不保留 stale cache，避免 LLM 加载过期内容）。在 store 中新增 `parseErrors: Map<string, string>` 记录错误信息，设置页 UI 中对应条目标记警告图标。

### 11. 设置页缺少 skill 详情/预览

当前 mockup 只展示名称和描述的列表。用户在不点开文件的情况下无法了解 skill 具体内容。

**建议**：增加点击展开查看 SKILL.md 正文的能力（可复用 BMonaco 做只读 Markdown 预览），或将 skill 路径做成可点击链接（使用 `shell:openExternal` 或 `shell:showItemInFolder` 打开）。

### 12. 聊天侧边栏 skill 提示的交互细节

当前设计展示 "📎 react-patterns 已加载"，以下场景需要明确：
- 同一对话多次加载同一 skill：是否重复显示？→ 建议去重
- 多个 skill 同时加载：是堆叠还是轮播？→ 建议并列标签形式
- 是否展示 skill 的 description 摘要而非仅名称？→ 建议 tooltip 展示 description

### 13. 用户自定义路径的路径展开

设计提到"支持 `~/` 展开、相对/绝对路径"。`~/` 展开需要在渲染进程实现（使用 `os.homedir()` 或 preload API），相对路径需要基于工作区根目录解析。

**建议**：在 `scanner.ts` 中实现路径规范化工具函数，统一处理三种路径格式。

## 值得肯定的设计

- **渲染进程全栈实现** — 与现有 9 个内置工具模式一致，不需要新增主进程模块
- **仅通过工具注入，不修改 system prompt** — 避免 prompt 膨胀，skill 内容按需加载
- **SKILL.md 格式兼容 OpenCode/Claude Code 生态** — 可直接复用 `.agents/skills/` 中已有 17 个 skill
- **目录监听实时响应** — 开发/调试 skill 时无需重启应用
- **Pinia store 结构清晰** — `scanSkills`、`getSkillByName`、`getEnabledSkills` 职责分明
- **持久化方案最小化** — 仅存配置（disabledNames + customPaths），skill 内容启动时重建，无需维护缓存一致性
- **`<skill_content>` XML 包裹** — 帮助 LLM 结构化解析注入内容

## 建议实现顺序

| 阶段 | 内容 | 依赖 |
|------|------|------|
| 1 | 类型定义 (`types.ts`) → 解析器 (`parser.ts`) → 扫描器 (`scanner.ts`) | 无 |
| 2 | `useSkillStore` Pinia store + electron-store 持久化 | 阶段 1 |
| 3 | `SkillTool`（依赖 store + getter 描述）→ 集成到 `createBuiltinTools` | 阶段 2 |
| 4 | 扩展 `FileWatchService` → 目录监听 → `skill:changed` IPC → preload → 类型 | 阶段 2 |
| 5 | 设置页 "Skills" 标签页 + 聊天侧边栏提示 | 阶段 3, 4 |
| 6 | 端到端测试 + 边界情况（空目录、格式错误、大文件） | 阶段 5 |
