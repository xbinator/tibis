# Skill 系统设计

## 概述

为 Tibis 引入 Skill 系统，允许用户通过 SKILL.md 文件定义可复用的领域专用指令，LLM 在聊天中自动判断何时加载并执行 skill。参考 OpenCode 的 Skill 实现，适配 Tibis 的 Electron + Vue 3 + Vercel AI SDK 架构。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 实现架构 | 渲染进程全栈实现 | 与现有 9 个内置工具模式一致，无需新增主进程模块 |
| 触发方式 | LLM 自动判断 | 注册 skill 工具，LLM 根据 description 自主决定何时调用 |
| 注入方式 | 仅通过工具注入 | 不新建 system prompt，skill 内容通过工具执行结果注入 |
| 文件格式 | SKILL.md 标准 | 兼容 OpenCode/Claude Code 生态 |
| 目录监听 | 扩展 FileWatchService | 实时响应 skill 文件变化，用户体验好 |
| UI 展示 | 设置页管理 + 聊天提示 | 设置页查看/管理 skill，聊天侧边栏显示已加载 skill |
| 工具集成 | Getter 方案 | `AIToolDefinition.description` 改为 `string \| (() => string)`，零侵入 |
| 启动时序 | Promise 初始化 | `init()` 返回 Promise，未初始化时排除 skill 工具 |
| 项目 Skill 信任 | v1 跟随本地工具权限模型 | skill 仅注入指令，不直接越过已有工具权限；后续可增加工作区信任确认 |

## Skill 文件格式与发现机制

### SKILL.md 格式

每个 skill 是一个目录，包含 `SKILL.md` 入口文件：

```
.agents/skills/
├── react-patterns/
│   └── SKILL.md
├── api-design/
│   ├── SKILL.md
│   └── templates/
│       └── rest-api.yaml      # skill 可附带资源文件
└── git-workflow/
    └── SKILL.md
```

SKILL.md 格式（frontmatter + body）：

```markdown
---
name: react-patterns
description: Use when building React components with hooks, state management, or component composition patterns.
---

# React Patterns

When building React components, follow these guidelines:

1. Prefer composition over inheritance
2. Use custom hooks for reusable logic
...
```

- `name`：必填，skill 唯一标识
- `description`：必填，简要描述触发场景（LLM 据此判断何时加载）
- body：完整指令内容，LLM 调用 skill 工具后注入对话

### 发现来源

1. **项目目录**：仅扫描当前工作区根目录下的 `.agents/skills/*/SKILL.md`
2. **用户配置路径**：设置页中用户可配置额外 skill 目录（支持 `~/` 展开、相对/绝对路径）

### 扫描时机

- 应用启动时扫描一次
- 设置页手动刷新
- 工作区切换时重新扫描
- 目录监听触发增量更新

### 去重与覆盖

扫描顺序：**项目目录 → 用户配置路径**（用户路径后扫描，优先级更高）。同名 skill 用户配置路径覆盖项目目录，记录警告日志。

### 路径规范化

在 `scanner.ts` 中实现路径规范化工具函数，统一处理三种路径格式：

- `~/` 展开：通过 preload API 获取 `os.homedir()` 替换；如果无法获取 homeDir，则保持原始 `~/` 路径并跳过不可读目录
- 相对路径：基于工作区根目录解析为绝对路径
- 绝对路径：直接使用

### 目录监听

扩展主进程 `FileWatchService`，新增独立方法 `watchDirectory`：

- 不使用现有 `this.watchers` Map（key 语义不匹配），使用独立的 `directoryWatchers` Map
- `chokidar.watch(dirPath, { depth: 3, ignored: '**/node_modules/**' })` 监听 skill 目录，默认仅广播 `**/SKILL.md` 变化
- 收到变更事件后，通过 IPC 广播 `skill:changed` 事件（独立事件，不复用 `file:changed`）
- 事件 payload：`{ type: 'change' | 'add' | 'unlink', filePath: string }`
- 渲染进程收到事件后，先过滤非 `SKILL.md` 路径，再**增量解析**受影响的单个 SKILL.md，更新或移除对应记录（非全量重扫）

### IPC 全链路

| 层 | 文件 | 变更 |
|----|------|------|
| 主进程 Service | `electron/main/modules/file/service.mts` | 新增 `watchDirectory` / `unwatchDirectory` 方法 |
| 主进程 IPC | `electron/main/modules/file/ipc.mts` | 新增 `fs:watchDirectory` / `fs:unwatchDirectory` handler |
| Preload | `electron/preload/index.mts` | 新增 `watchDirectory` / `unwatchDirectory` / `onSkillChanged` 方法 |
| 类型 | `types/electron-api.d.ts` | 新增 `ElectronAPI` 接口字段 |

Preload `onSkillChanged` 注册方式（参考现有 `onFileChanged`）：

```typescript
onSkillChanged: (callback: (data: { type: string; filePath: string }) => void) => {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on('skill:changed', handler);
  return () => { ipcRenderer.removeListener('skill:changed', handler); };
}
```

## Skill 工具注册与执行流程

### skill 工具定义

作为第 10 个内置工具注册，与其他 9 个工具模式一致：

```
工具名：skill
参数：{ name: string }  // 要加载的 skill 名称
```

### 动态 description 生成

skill 工具的 description 根据当前可用 skill 列表动态生成：

```
Load a skill by name to get specialized instructions. Available skills:
- react-patterns: Use when building React components with hooks, state management, or component composition patterns.
- api-design: Use when designing REST/GraphQL APIs, defining endpoints, or writing API documentation.
- git-workflow: Use when performing git operations, branching strategies, or writing commit messages.

Call this tool with the skill name to load its full instructions.
```

每次 skill 列表变化时，重新生成 description 并更新工具定义。description 设置 4,000 字符上限，超过时保留前部列表并追加省略提示，避免大量 skill 挤占上下文。

### 工具集成方式

采用 **Getter 方案**：

- `AIToolDefinition.description` 类型改为 `string | (() => string)`
- `SkillTool.definition.description` 使用 getter 函数，实时读取 store 生成
- `toTransportTools()` 中兼容处理：`typeof desc === 'function' ? desc() : desc`
- 其他 9 个工具不受影响（仍使用静态 string）

### 执行流程

```
1. LLM 判断需要某个 skill → 调用 skill({ name: "react-patterns" })
2. SkillTool.execute() 从 skill store 中查找 name 匹配的 skill
3. 返回 skill body 内容，以 <skill_content> 包裹：
   <skill_content name="react-patterns">
   ... SKILL.md body 内容 ...
   </skill_content>
4. LLM 收到内容后，按 skill 指令执行后续操作
```

### 错误处理

- skill 不存在：返回 "Skill '{name}' not found. Available skills: ..."
- skill 列表为空：工具 description 提示 "No skills available"
- skill 解析失败：移除该 skill（不保留 stale cache），记录到 `parseErrors`，设置页标记警告

### Skill body 长度限制

默认 10,000 字符（可通过 `SkillScanConfig.maxContentLength` 配置）。超长时截断并在末尾附加：

```
[Content truncated at 10000 chars, full content at: /path/to/SKILL.md]
```

## 数据模型与代码组织

### 核心类型

```typescript
/** SKILL.md 解析结果 */
interface SkillDefinition {
  /** skill 唯一标识，来自 frontmatter name 字段 */
  name: string
  /** 触发场景描述，来自 frontmatter description 字段 */
  description: string
  /** 完整指令内容（SKILL.md body 部分） */
  content: string
  /** SKILL.md 文件绝对路径 */
  filePath: string
  /** skill 目录绝对路径 */
  dirPath: string
  /** 来源：builtin（内置）| project（项目目录）| user（用户配置路径） */
  source: 'builtin' | 'project' | 'user'
  /** 是否启用 */
  enabled: boolean
  /** 解析时间戳，用于 UI 展示"上次解析时间" */
  parsedAt: number
  /** 解析失败时的错误信息 */
  parseError?: string
}

/** Skill 扫描配置 */
interface SkillScanConfig {
  /** 项目工作区根路径 */
  workspaceRoot: string
  /** 用户自定义 skill 目录路径列表 */
  customPaths: string[]
  /** skill body 最大字符数，默认 10000 */
  maxContentLength?: number
}
```

### 代码组织

```
src/ai/
├── tools/
│   └── builtin/
│       └── SkillTool/
│           ├── index.ts          # 工具注册入口
│           ├── definition.ts     # 工具定义（动态 description，使用 getter）
│           └── executor.ts       # 工具执行逻辑
├── skill/
│   ├── scanner.ts               # Skill 发现与扫描（含路径规范化）
│   ├── parser.ts                # SKILL.md 解析（frontmatter + body）
│   ├── types.ts                 # 类型定义
│   └── index.ts                 # Skill 服务统一出口

src/stores/
└── ai/
    └── skill.ts                 # Pinia store（skill 列表、启用状态、扫描配置、解析错误）

electron/main/modules/file/
├── service.mts                  # 扩展 watchDirectory / unwatchDirectory 方法
└── ipc.mts                      # 新增 fs:watchDirectory / fs:unwatchDirectory IPC

electron/preload/
└── index.mts                    # 新增 onSkillChanged 事件监听

types/
└── electron-api.d.ts            # 新增 ElectronAPI 接口字段
```

### Pinia Store 职责

`useSkillStore`：

- `skills: SkillDefinition[]` — 已发现的所有 skill
- `parseErrors: Map<string, string>` — 解析失败的 skill 及错误信息
- `scanConfig: SkillScanConfig` — 扫描配置
- `initialized: boolean` — 是否已完成初始化扫描
- `initPromise: Promise<void>` — 初始化 Promise，用于等待扫描完成
- `scanSkills()` — 触发扫描
- `getSkillByName(name)` — 按名称查找
- `toggleSkill(name)` — 启用/禁用
- `getEnabledSkills()` — 获取启用的 skill 列表（供工具 description 使用）
- `waitForInit()` — 等待初始化完成（聊天流使用）

### 持久化

- skill 列表：内存缓存（启动时扫描重建）
- 解析错误：内存缓存（启动时重建）
- 启用/禁用状态：`localStorage`（key: `skill.disabledNames`）
- 用户自定义路径：`localStorage`（key: `skill.customPaths`）

## UI 设计

### 设置页 — Skill 管理

在设置页新增 "Skills" 标签页：

```
┌─────────────────────────────────────────────┐
│  Skills                                      │
├─────────────────────────────────────────────┤
│                                              │
│  Skill 搜索路径                              │
│  ┌─────────────────────────────┐ [+添加路径] │
│  │ ~/my-skills                 │  [删除]     │
│  │ /projects/shared-skills     │  [删除]     │
│  └─────────────────────────────┘             │
│                                              │
│  已发现的 Skills                 [刷新]       │
│  ┌─────────────────────────────────────────┐ │
│  │ ● react-patterns          [启用/禁用]    │ │
│  │   Use when building React components... │ │
│  │   来源: 项目  路径: .agents/skills/...  │ │
│  ├─────────────────────────────────────────┤ │
│  │ ⚠ bad-skill               [启用/禁用]    │ │
│  │   解析失败: frontmatter 缺少 name 字段  │ │
│  │   来源: 用户  路径: ~/my-skills/...     │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  [点击展开查看 SKILL.md 正文]                 │
│  [点击路径打开文件位置]                        │
└─────────────────────────────────────────────┘
```

功能：

- 搜索路径管理：添加/删除自定义目录
- Skill 列表：展示名称、描述、来源、路径
- 解析失败标记：警告图标 + 错误信息
- 启用/禁用开关
- 刷新按钮（手动触发重新扫描）
- 点击展开查看 SKILL.md 正文
- 路径可点击，调用 `shell:showItemInFolder` 打开文件位置

### 聊天侧边栏 — Skill 提示

在聊天输入区域上方，当有 skill 被加载时，显示轻量提示：

```
┌─────────────────────────────────────────────┐
│  [react-patterns] [api-design]              │
├─────────────────────────────────────────────┤
│  [聊天消息区域...]                           │
└─────────────────────────────────────────────┘
```

- 仅在 LLM 调用 skill 工具后显示
- 同一 skill 去重，不重复显示
- 多个 skill 并列标签形式
- 鼠标悬停 tooltip 展示 skill description
- 关闭后不再显示（当前对话）

## 完整数据流

### 启动流程

```
1. 应用启动 → useSkillStore.init() 返回 Promise
2. 读取 localStorage 获取 scanConfig（customPaths、disabledNames），通过 preload 获取 homeDir 处理 `~/`
3. 调用 scanner.scanSkills(scanConfig) 扫描所有来源（项目目录 → 用户配置路径）
4. 解析 SKILL.md → 构建 SkillDefinition[]，解析失败记录到 parseErrors
5. 存入 store.skills，标记 initialized = true
6. 通过 IPC 调用 fs:watchDirectory 监听 skill 目录变化
7. 收到 skill:changed 事件 → 增量解析受影响的单个 SKILL.md
```

### 聊天流程

```
1. 用户发送消息
2. useChatStream 构建工具列表
3. 检查 skill store.initialized：
   - 已初始化：包含 skill 工具（description 由 store.getEnabledSkills() 动态生成）
   - 未初始化：排除 skill 工具
4. LLM 判断需要 skill → 调用 skill({ name: "react-patterns" })
5. SkillTool.execute() 从 store 获取 skill content（超长截断）
6. 返回 <skill_content> 包裹的指令
7. LLM 按指令执行，聊天侧边栏显示 skill 标签提示
```

### 设置变更流程

```
1. 用户添加/删除搜索路径 → 更新 localStorage
2. 触发重新扫描 → 更新 store.skills
3. 更新目录监听（取消旧监听、注册新监听）
4. skill 工具 description 自动更新（响应式）
```

### 目录监听增量更新流程

```
1. chokidar 检测到 .agents/skills/ 下 SKILL.md 变化（非 SKILL.md 资源文件不触发 skill 重新解析）
2. 主进程广播 skill:changed 事件（含 type 和 filePath）
3. 渲染进程收到事件：
   - add/change → 重新解析该 SKILL.md，更新 store 中对应记录
   - unlink → 从 store 中移除对应记录
4. skill 工具 description 自动更新
```

## 未来考量

- **Skill 与权限系统交互**：v1 不新增专门权限，但不绕过现有工具权限。未来可在权限确认 UI 中展示"当前已加载 skill 列表"，帮助用户理解 LLM 的行为依据，并可加入工作区级 skill 信任确认
- **内置 Skill**：`source` 类型已预留 `'builtin'`，未来可随应用分发内置 skill
- **远程 Skill**：未来可支持从远程 URL 拉取 skill
