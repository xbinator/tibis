## 项目简介

Tibis 是一款基于 Electron + Vue 3 + TypeScript 的桌面端应用，面向"本地优先"的 Markdown 写作与编辑工作流。项目将 AI 对话侧边栏与编辑器深度集成，支持多 AI 服务商（OpenAI / Anthropic / Google / DeepSeek 等），并提供文件读写、工作区浏览、会话历史、工具调用确认、MCP 工具、语音输入、上下文压缩等能力。

## 技术栈概览

| 层级 | 技术选型 |
|------|----------|
| 桌面框架 | Electron 41 |
| 前端框架 | Vue 3.5 + Composition API |
| 构建工具 | Vite 8（使用 Rolldown 拆包） |
| 包管理 | pnpm 10 |
| 状态管理 | Pinia 3（按业务领域组织：ai/chat/editor/ui/workspace/helpers） |
| 路由 | Vue Router 5（带 KeepAlive 页面缓存） |
| 富文本编辑器 | TipTap 3（基于 ProseMirror） |
| 源码编辑器 | CodeMirror 6 |
| JSON/代码编辑器 | Monaco Editor 0.55 |
| 拖拽 | @atlaskit/pragmatic-drag-and-drop |
| UI 组件库 | Ant Design Vue 4 + B 系列自研组件 |
| 原子化 CSS | UnoCSS（presetWind3 + presetAttributify） |
| 样式预处理 | Less |
| AI SDK | Vercel AI SDK v6（`ai` 包 + @ai-sdk/openai/anthropic/google/deepseek） |
| AI 搜索 | @tavily/ai-sdk |
| 数据库 | better-sqlite3（主进程本地数据库） |
| 安全存储 | electron-store（API Key 等敏感信息加密存储） |
| 图标 | Iconify（`@iconify/vue`） |
| 文件监听 | Chokidar 5 |
| 图片处理 | sharp |
| Markdown 渲染 | marked + KaTeX（数学公式）+ Mermaid（图表） |
| Token 估算 | js-tiktoken |
| 离线存储 | localforage |

## 目录结构总览

```
tibis/
├── src/                          # 渲染进程（前端 UI）
│   ├── main.ts                   # Vue 应用入口（Pinia + Router + UnoCSS）
│   ├── App.vue                   # 根组件（Antd AConfigProvider zhCN 包裹 RouterView）
│   ├── views/
│   │   ├── editor/               # 编辑器页面（核心功能：自动保存、文件监听、会话管理）
│   │   │   ├── hooks/            # useAutoSave / useBindings / useFileSelection / useFileState / useFileWatcher / useSavePolicy / useSession
│   │   │   └── utils/            # filePath / reconcileFileContent
│   │   ├── settings/
│   │   │   ├── index.vue          # 设置页布局
│   │   │   ├── provider/         # AI 服务商管理（列表 + 详情 + 9 个子组件）
│   │   │   ├── service-model/    # 服务模型配置（Chat / Edit / Summary 等能力分配）
│   │   │   ├── editor/           # 编辑器偏好设置（视图模式/大纲/页宽/保存策略）
│   │   │   ├── speech/           # 语音设置（运行时管理、语音识别配置）
│   │   │   ├── tools/            # 工具设置（MCP 服务器管理 + Tavily 搜索配置）
│   │   │   └── logger/           # 运行日志查看（LogFilterBar + LogTimeline）
│   │   ├── webview/              # 内嵌浏览器页面（双实现：native + web/DOM）
│   │   ├── welcome/              # 欢迎页（含 DropZone 组件）
│   │   └── error/                # 404 页面
│   ├── components/               # B 系列通用组件（通过 unplugin-vue-components 全局自动注册）
│   │   ├── BEditor/              # Markdown 编辑器（统一入口，双视图：富文本 TipTap + 源码 CodeMirror）
│   │   │   ├── adapters/         # 15 个编辑器适配器（选区、导航、搜索、行映射、布局主题等）
│   │   │   ├── components/       # 8 个 UI 组件（AnchorContent、CodeBlock、FrontMatterCard、TableView 等）
│   │   │   ├── extensions/       # 6 个 CodeMirror/TipTap 扩展（AI 高亮、装饰、搜索等）
│   │   │   ├── hooks/            # 9 个编辑器 hooks（useAnchors、useContent、useRichEditor 等）
│   │   │   ├── panes/            # 2 个编辑器面板（PaneRichEditor、PaneSourceEditor）
│   │   │   ├── shared/           # 6 个共享组件（FindBar、SelectionToolbar、SelectionAIInput 等）
│   │   │   └── utils/            # 编辑器工具函数
│   │   ├── BChatSidebar/         # AI 聊天侧边栏（流式对话、工具调用、会话历史、文件引用、语音输入、上下文压缩）
│   │   │   ├── components/       # 10+ 子组件（Bubble、ConfirmationCard、InputToolbar、SessionHistory 等）
│   │   │   ├── hooks/            # 18 个 hooks（useChatStream、useAutoName、useCompactContext、useVoiceRecorder 等）
│   │   │   └── utils/            # 12 个工具模块（compression、confirmationController、toolCallTracker 等）
│   │   ├── BPromptEditor/        # 提示词输入框（支持斜杠命令、变量插入、文件引用粘贴）
│   │   ├── BMonaco/              # Monaco Editor 封装（JSON/代码编辑，从 BEditor 提取独立）
│   │   ├── BPanelSplitter/       # 可拖拽面板分割器（支持拖拽关闭 closeThreshold）
│   │   ├── BSearchRecent/        # 最近文件搜索弹窗（支持绝对路径打开）
│   │   ├── BModelIcon/           # 30+ AI 模型提供商图标（亮/暗色主题）
│   │   ├── BModelSelect/         # AI 模型选择器（模态框搜索、Provider 分组）
│   │   ├── BToolbar/             # 工具栏菜单
│   │   ├── BMonaco/              # Monaco 编辑器封装
│   │   ├── BBubble/              # 气泡消息（头像 + 折叠）
│   │   ├── BDropdown/            # 下拉菜单
│   │   ├── BScrollbar/           # 自定义滚动条
│   │   ├── BTruncateText/        # 文本截断
│   │   ├── BImageViewer/         # 图片查看器（含 Carousel 走马灯，支持缩放/旋转/拖拽）
│   │   ├── BUpload/              # 文件上传组件
│   │   ├── BSettingsPage/        # 设置页布局组件
│   │   ├── BSettingsSection/     # 设置分区组件
│   │   └── BButton/BModal/BMessage/BSelect  # 通用 UI 组件
│   ├── constants/
│   │   ├── extensions.ts         # 文件扩展名常量
│   │   └── shortcuts.ts          # 快捷键常量定义
│   ├── directives/
│   │   └── focus.ts              # 自动聚焦指令
│   ├── plugins/
│   │   ├── index.ts              # Vue 插件安装入口
│   │   ├── error-handler.ts      # 全局 Vue 错误处理插件
│   │   └── message.ts            # 消息提示插件
│   ├── utils/
│   │   ├── asyncTo.ts            # 异步错误包装
│   │   ├── css.ts                # CSS 工具函数
│   │   ├── emitter.ts            # 事件总线（mitt）
│   │   ├── env.ts                # 环境判断工具
│   │   ├── file/                 # 文件工具（引用解析、标题提取、未保存文件处理）
│   │   ├── is.ts                 # 类型判断工具
│   │   ├── json.ts               # JSON 解析/序列化
│   │   ├── logger.ts             # 前端日志工具
│   │   ├── modal.tsx             # 模态框 JSX 工具
│   │   ├── namespace.ts          # CSS BEM 命名空间工具
│   │   ├── scroll.ts             # 滚动工具
│   │   └── shortcut.ts           # 快捷键格式化
│   ├── ai/tools/                 # AI 工具系统
│   │   ├── builtin/              # 9 个内置工具（每工具独立目录）：AskUserQuestionTool / DocumentTool / EnvironmentTool / FileEditTool / FileReadTool / FileWriteTool / LogsTool / MCPSettingsTool / SettingsTool
│   │   ├── shared/               # 共享工具层（fileErrors、fileTool、pathUtils、types）
│   │   ├── confirmation.ts       # 用户确认适配器接口
│   │   ├── editor-context.ts     # 编辑器上下文注册表
│   │   ├── permission.ts         # 权限执行引擎（readonly/ask/autoSafe）
│   │   ├── policy.ts             # 模型工具支持策略
│   │   ├── results.ts            # 工具结果工厂函数
│   │   └── stream.ts             # 工具流式执行适配
│   ├── layouts/default/          # 默认布局（Header Tabs + 工具栏 + 聊天侧边栏）
│   │   ├── index.vue             # 布局主组件（标题栏、Tab 栏、RouterView/KeepAlive、侧边栏）
│   │   ├── components/
│   │   │   ├── HeaderTabs.vue    # 顶部标签页栏（Pragmatic Drag and Drop 拖拽排序）
│   │   │   └── ShortcutsHelp.vue # 快捷键帮助弹窗
│   │   └── hooks/               # useKeepAlive / useFileActive / useEditActive / useViewActive / useHelpActive / useTabDragger
│   ├── router/                   # 路由配置（聚合 modules/*.ts 子路由）
│   ├── stores/                   # Pinia 状态管理（按业务领域组织，6 个域）
│   │   ├── ai/
│   │   │   ├── provider.ts       # AI 提供商配置
│   │   │   ├── serviceModel.ts   # 服务模型配置（Chat/Edit 等能力绑定）
│   │   │   └── toolSettings.ts   # 工具设置（MCP 服务器、搜索配置）
│   │   ├── chat/
│   │   │   ├── session.ts        # 聊天会话管理（原 useChatStore，已重命名）
│   │   │   └── toolPermission.ts # AI 工具权限管理（从 setting 拆出）
│   │   ├── editor/
│   │   │   ├── fileSelectionIntent.ts # 文件选区意图（行范围导航跳转）
│   │   │   ├── fileWatch.ts      # 编辑器文件监听（路径↔文件ID 映射）
│   │   │   └── preferences.ts    # 编辑器偏好（视图模式/大纲/页宽/保存策略）
│   │   ├── ui/
│   │   │   └── setting.ts        # 应用设置
│   │   ├── workspace/
│   │   │   ├── files.ts          # 文件状态
│   │   │   └── tabs.ts           # 标签页管理
│   │   └── helpers/
│   │       ├── events.ts         # 事件总线（解耦 store 间依赖）
│   │       ├── persist.ts        # 持久化中间件（loadPersistedState/persistState）
│   │       └── types.ts          # 共享类型（PersistConfig、MigrationStep）
│   ├── shared/
│   │   ├── platform/             # Electron/Web 平台能力抽象层（含 native/ 双实现）
│   │   ├── storage/              # 本地存储适配（base / chats / files / providers / service-models / tool-settings / chat-compression-records）
│   │   ├── chat/                 # 聊天共享工具（文件引用事件桥接）
│   │   └── logger/               # 日志共享类型与工具
│   ├── hooks/                    # 全局组合式函数（10 个）
│   │   ├── useAntdTheme.ts       # Ant Design 明暗主题计算
│   │   ├── useAutoCollapse.ts    # 容器宽度不足时自动折叠（ResizeObserver）
│   │   ├── useChat.ts            # AI 流式聊天（invoke/stream/abort，含 provider 解析）
│   │   ├── useClipboard.ts       # 剪贴板操作封装
│   │   ├── useMenuAction.ts      # 系统菜单动作注册
│   │   ├── useNavigate.ts        # 统一导航
│   │   ├── useOpenDraft.ts       # 草稿文件打开
│   │   ├── useOpenFile.ts        # 统一文件打开
│   │   ├── useScroller.ts        # DOM 元素滚动包装
│   │   └── useShortcuts.ts       # 键盘快捷键注册（@vueuse/core useMagicKeys）
│   └── assets/styles/            # 全局样式 + 主题变量（明/暗）
│
├── electron/                     # Electron 主进程 + preload
│   ├── main/
│   │   ├── index.mts             # 主进程入口（初始化流程：日志→存储→数据库→IPC→菜单→窗口）
│   │   ├── window.mts            # 窗口管理（无边框、macOS 红绿灯、preload 注入）
│   │   ├── env.mts               # 环境变量读取
│   │   ├── types.ts              # 主进程通用类型定义
│   │   └── modules/
│   │       ├── index.mts          # 统一 IPC handler 注册入口
│   │       ├── ai/               # AI 服务（4 个 Provider：openai/anthropic/google/deepseek，流式/非流式调用、工具调用适配、MCP 工具注册）
│   │       ├── database/         # SQLite 数据库操作（execute / select）
│   │       ├── store/            # 安全加密存储（electron-store）
│   │       ├── file/             # 文件读写 + 工作区监听（Chokidar）
│   │       ├── logger/           # 日志系统（文件 + 控制台 + 维护定时器）
│   │       ├── menu/             # 系统菜单（跨平台）
│   │       ├── mcp/              # MCP 运行时（本地 stdio 执行、发现缓存、工具注册）
│   │       ├── webview/          # WebView 管理（内嵌浏览器，安全策略隔离）
│   │       ├── shell/            # 系统 Shell 操作（回收站、外部链接、相对路径）
│   │       ├── dialog/           # 原生对话框（打开/保存文件）
│   │       ├── window/           # 窗口控制（最小化/最大化/全屏/标题）
│   │       ├── image/            # 图片处理（压缩、格式转换）
│   │       ├── speech/           # 语音服务（运行时安装/下载、录音、whisper.cpp 转写）
│   │       └── shortcuts/        # 系统快捷入口（Dock/Taskbar 最近文件）
│   └── preload/
│       ├── index.mts             # contextBridge 安全暴露 electronAPI 到渲染进程（30+ 方法）
│       ├── error-collector.mts   # 全局错误收集 preload
│       └── webview.mts           # WebView 页面 preload
│
├── docs/                         # 项目文档
│   ├── code-wiki/                # 代码百科（架构/前端/编辑器/Electron/存储/AI/开发指南/依赖地图）
│   ├── ai-tools/                 # AI 工具系统分析与开发指南（含 tasks 任务分解）
│   ├── web-view/                 # WebView 功能设计文档（双实现方案）
│   ├── speech/                   # 语音功能完整说明
│   ├── development/              # 开发问题与注意事项
│   ├── markdown-symbol-highlight/ # Markdown 符号高亮方案
│   └── superpowers/              # 技术方案与设计文档（plans 59 篇 + specs 63 篇，按日期组织）
├── changelog/                    # 变更日志（按日期，50 条记录，覆盖 2026-03-26 至今）
├── test/                         # 测试套件（~115 个测试文件，按 src 结构镜像组织）
├── types/                        # 全局 TypeScript 类型声明（ai.d.ts / chat.d.ts / 等 8 个文件）
├── scripts/                      # 构建与工具脚本（speech 语音运行时脚本）
└── resources/                    # 应用图标资源（app.icns / app.png / app.ico）+ 语音清单
```

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    渲染进程 (Vue 3)                          │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐              │
│  │  BEditor  │  │ BChatSidebar│  │  Settings  │              │
│  │ (Markdown) │  │ (AI聊天)   │  │ (服务商配置)│              │
│  └─────┬─────┘  └─────┬─────┘  └─────┬──────┘              │
│        │              │              │                       │
│        └──────────────┼──────────────┘                       │
│                       │                                      │
│              window.electronAPI                              │
│           (contextBridge 暴露)                               │
└───────────────────────┼─────────────────────────────────────┘
                        │  IPC (invoke / on / send)
┌───────────────────────┼─────────────────────────────────────┐
│                    主进程 (Electron)                         │
│        ┌──────────────┼──────────────┐                      │
│        │              │              │                      │
│   ┌────▼────┐  ┌──────▼──────┐ ┌────▼─────┐               │
│   │ AI 服务  │  │  文件操作    │ │ 数据库   │               │
│   │(多Provider)│ │(读写/监听)  │ │(SQLite)  │               │
│   └─────────┘  └─────────────┘ └──────────┘               │
└─────────────────────────────────────────────────────────────┘
```

**关键数据流**：

1. **编辑文件**：渲染进程 → `electronAPI.readFile/writeFile` → IPC → 主进程文件模块
2. **AI 聊天**：渲染进程 → `electronAPI.aiStream` → IPC → 主进程 AI 服务 → Vercel AI SDK → 外部 API → 流式回传（text/thinking/tool-call/tool-input/tool-result/finish/error 事件）
3. **数据持久化**：渲染进程 → `electronAPI.dbExecute/dbSelect` → IPC → 主进程 better-sqlite3

## 应用启动与进程边界

### 主进程启动流程

1. **获取启动快捷入口动作** → 2. **初始化日志（控制台）** → 3. **清理过期日志** → 4. **启动日志维护定时器** → 5. **初始化 store** → 6. **初始化数据库** → 7. **注册全部 IPC handler** → 8. **设置系统菜单** → 9. **刷新平台快捷入口** → 10. **创建窗口** → 11. **处理启动时的快捷动作**

关键入口：[electron/main/index.mts](./electron/main/index.mts)

### 窗口创建

- 无边框窗口（`frame: false`），macOS 使用 `titleBarStyle: 'hidden'` + 自定义红绿灯位置
- 预加载脚本注入，`contextIsolation: true`，`nodeIntegration: false`
- 开发环境加载 Vite dev server（host 默认 127.0.0.1），生产环境加载打包后的 index.html
- 关键入口：[electron/main/window.mts](./electron/main/window.mts)

### 渲染进程入口

- 创建 Vue 应用 → 注册 Pinia → 注册 Router → 挂载到 #app
- 全局引入 UnoCSS 虚拟模块、Ant Design AConfigProvider zhCN 包裹、Less 全局样式
- 关键入口：[src/main.ts](./src/main.ts)

### 安全通信边界

- 所有渲染层对系统能力的访问都通过 `window.electronAPI`
- preload 通过 `contextBridge.exposeInMainWorld` 暴露 30+ API 方法，每个方法对应一个 `ipcRenderer.invoke`
- 渲染侧通过 `src/shared/platform/electron-api.ts` 的类型安全封装读取
- preload API 总览：[electron/preload/index.mts](./electron/preload/index.mts)

## IPC 模块化组织

主进程按"领域模块"拆分，每个模块提供 `ipc.mts` 注册各自的 handler，在总入口统一注册：[modules/index.mts](./electron/main/modules/index.mts)

已注册的 IPC 模块（16 个）：
- `dialog`：文件对话框（打开/保存）
- `file`：文件读写、工作区目录读取、文件变更监听（Chokidar，含 unlink debounce + add 恢复）
- `window`：窗口控制（最小化/最大化/全屏/标题设置）
- `database`：SQLite 执行与查询
- `store`：安全存储（electron-store）
- `shell`：系统 Shell（回收站、外部链接打开、相对路径计算）
- `ai`：AI 流式/非流式调用、流式中止、MCP 工具注册与过滤
- `mcp`：MCP 运行时管理（本地 stdio 执行器、发现缓存、工具查询）
- `logger`：日志记录与查询（控制台 + 文件）
- `menu`：系统菜单动作派发与菜单项更新
- `shortcuts`：系统快捷入口（Dock/Taskbar 最近文件同步）
- `webview`：内嵌 WebView 管理（含 webviewTag 安全策略、Partition 隔离）
- `image`：图片压缩与格式转换（sharp）
- `speech`：语音运行时管理（安装下载、录音、whisper.cpp 转写）
- `pdf`：PDF 模块（预留）

## 路由与 Tab/KeepAlive 机制

### 路由结构

| 路径 | 页面 | 说明 |
|------|------|------|
| `/welcome` | 欢迎页 | 入口页面（隐藏 Tab） |
| `/editor/:id` | 编辑器 | 核心 Markdown 编辑页面（直接渲染 BEditor） |
| `/settings/provider` | AI 服务商列表 | 管理 AI Provider（API Key、Base URL 等） |
| `/settings/provider/:provider` | 服务商详情 | 配置单个 Provider 的模型列表 |
| `/settings/service-model` | 服务模型 | 管理 AI 能力（Chat / Edit / Summary 等） |
| `/settings/editor` | 编辑器设置 | 视图模式/大纲/页宽/保存策略配置 |
| `/settings/speech` | 语音设置 | 管理语音运行时和识别配置 |
| `/settings/tools/mcp` | MCP 工具设置 | MCP 服务器管理（增删改查、发现状态） |
| `/settings/tools/search` | 搜索工具设置 | Tavily 搜索配置（启用/API Key/默认参数） |
| `/settings/logger` | 运行日志 | 查看系统运行日志 |
| `/webview/native` | 网页浏览（Native） | 内嵌浏览器（`<webview>` 标签实现） |
| `/webview/web` | 网页浏览（DOM） | 内嵌浏览器（DOM iframe 实现） |

路由入口将 `routes/modules/*.ts` 通过 `import.meta.glob` 聚合为子路由，然后挂到默认布局下：[routes/index.ts](./src/router/routes/index.ts)

### Tab 管理

`router.afterEach` 会根据路由 meta 设置窗口标题，并把"可展示的页面"同步到 tabs store：[router/index.ts](./src/router/index.ts)

页面是否出现在顶部 Tab 取决于 route meta 的 `hideTab` 标记以及 `resolveRouteTabInfo` 的 tabId/cacheKey 规则。

Tab 支持右键菜单操作（关闭/关闭其他/关闭右侧/关闭已保存/关闭全部），拖拽排序基于 @atlaskit/pragmatic-drag-and-drop。

## 存储层与数据落地策略

渲染侧把各类持久化能力集中在 `src/shared/storage/*`，由统一出口 re-export：[storage/index.ts](./src/shared/storage/index.ts)

存储子模块（7 个）：
- `base/`：通用 KV 存储抽象层（BaseStorage 类，支持 TTL、合并策略、自毁标记）
- `chats/`：聊天会话与消息的 SQLite 持久化
- `chat-compression-records/`：聊天上下文压缩记录的存储与查询
- `files/`：最近打开文件列表（recent.ts）
- `providers/`：AI 提供商与模型配置（含默认值 defaults.ts）
- `service-models/`：服务模型配置（Chat / Edit / Summary 等能力绑定）
- `tool-settings/`：MCP 服务器和搜索工具的配置存储
- `utils/`：数据库连接管理（含初始化竞态重试）、JSON 序列化工具

底层通过 `electronAPI.dbExecute/dbSelect` 走主进程 better-sqlite3，确保 schema 统一与迁移可控。

### Store 持久化中间件

stores 采用 `helpers/persist.ts` 中的持久化中间件模式，提供：
- `loadPersistedState()`：应用启动时自动加载持久化状态
- `persistState()`：状态变更时自动写回数据库（路径: `pinia.<storeId>`）

`helpers/events.ts` 提供事件总线用于解耦 store 间依赖（如 fileWatch ↔ tabs 解耦）。

## AI 工具系统

### 工具定义

渲染侧工具定义集中在 `src/ai/tools`，`builtin` 为内置工具集合，每个工具独立目录：
- `confirmation.ts` — 用户确认适配器接口（confirm、执行生命周期回调）
- `editor-context.ts` — 编辑器上下文注册表（register/getCurrentContext/getContext）
- `permission.ts` — 权限执行引擎（支持 readonly/ask/autoSafe 模式，检查权限授予）
- `policy.ts` — 模型工具支持策略、默认工具集选择
- `results.ts` — 工具结果工厂函数（success/failure/cancelled/awaitingUserInput）
- `stream.ts` — 工具流式执行适配（toTransportTools、executeToolCall、createToolResultMessages）
- `shared/` — 共享工具层（文件错误处理 fileErrors.ts、文件工具基类 fileTool.ts、路径工具 pathUtils.ts、类型 types.ts）

**builtin 内置工具（9 个）**：
- `AskUserQuestionTool/` — 向用户提问（多选/单选，支持自定义文本输入）
- `DocumentTool/` — 读取/编辑当前编辑器文档内容
- `EnvironmentTool/` — 环境信息查询
- `FileReadTool/` — 读取本地文件 + 列出目录
- `FileEditTool/` — 编辑本地文件（搜索/替换，支持未保存草稿）
- `FileWriteTool/` — 写入本地文件（支持 unsaved:// 虚拟路径）
- `LogsTool/` — 查询应用运行日志
- `MCPSettingsTool/` — MCP 服务器配置读写
- `SettingsTool/` — 应用设置读写

### 编辑器上下文

编辑器上下文（当前编辑的文档内容、选区、未保存草稿路径等）由 `BEditor` 内部通过 `useEditorToolContext` 提供，工具通过 `editorToolContextRegistry.getCurrentContext` 获取，确保工具调用能正确操作当前文档。

### 未保存文档路径系统

未保存文档使用 `unsaved://` 虚拟路径协议（格式：`unsaved://{id}/{fileName}.{ext}`），通过 `src/utils/file/unsaved.ts` 工具模块管理（构建/检查/解析），允许 AI 工具在文档保存前也能进行读写操作。

## 聊天确认与用户选择

### 确认机制

`confirmationController` 管理工具调用需要用户确认的流程，通过 adapter 注入到工具系统。用户可选：
- `approve` — 单次批准
- `approve-session` — 会话内批准
- `approve-always` — 始终批准
- `cancel` — 取消操作

`BChatSidebar` 还集成了 `InteractionContainer` 组件，统一管理 Toast 通知、Confirm 弹窗等交互反馈。

### Ask User Question

"向用户提问"这类交互会产生 pending 状态，影响自动命名触发判断（避免用户还没答完就自动生成会话标题）。

## 上下文压缩（/compact）

`BChatSidebar` 实现了完整的上下文压缩管线：

1. **触发方式**：通过 `/compact` 斜杠命令手动触发，或在发送前根据 token 使用率自动触发
2. **压缩策略**：保留最后 2 轮原始消息作上下文锚点，对更早的消息生成结构化摘要（目标、约束、决策、事实、文件线索、待办）
3. **增量压缩**：基于上次摘要边界继续压缩，支持多段摘要（summarySetId/segmentCount）
4. **重复防护**：检测是否自上次压缩后无新消息，避免重复压缩
5. **持久化**：压缩消息写入 `chat_session_summaries` 表，支持会话恢复

## 编辑器与聊天联动（文件引用）

Chat 输入支持插入 `{{@fileName:startLine-endLine}}` 格式的 token：
- 支持粘贴/拖拽文件自动生成 file-ref
- 来自编辑器侧的"插入文件引用"事件通过 `onChatFileReferenceInsert` 共享事件桥接进来
- FileRefChip 组件统一渲染文件引用标签（聊天消息和输入框中复用同一套渲染逻辑）

流程：编辑器选中文本 → 触发文件引用事件 → 侧边栏打开 → 插入 token 到输入框 → 自动聚焦

## 语音输入

项目集成了完整的语音输入管线：
- **前端录音**：PCM → WAV（16kHz 单声道），支持分段录音和静音检测
- **主进程转写**：通过 whisper.cpp 进行语音识别
- **运行时管理**：支持按需下载语音运行时，通过 manifest 系统管理版本
- **开发环境**：提供 `speech:dev:*` 系列脚本，支持本地语音运行时服务
- 详见 [docs/speech/README.md](./docs/speech/README.md)

## 前端构建与组件自动注册

### unplugin-vue-components 自动注册

- 限定在 `src/components` 及 19 个子目录，目录作为 namespace
- 解析器使用 `AntDesignVueResolver({ importStyle: false })`
- B 开头组件无需手动 import，全局可用
- `webview` 标签配置为 `isCustomElement`，由 Electron 宿主原生处理

[vite.config.ts 组件注册配置](./vite.config.ts)

### 依赖拆包分组

对第三方依赖做了细粒度拆包（19 组），提升 Electron 内嵌 Web 的首屏性能与缓存命中率：
- `vue` — vue/vue-router/pinia
- `ant-design-icons` / `ant-design-vue`
- `prosemirror` — ProseMirror 核心
- `tiptap-extensions` / `tiptap-core`
- `codemirror` — CodeMirror + Lezer
- `monaco` — Monaco Editor
- `markdown` — marked/js-yaml/lowlight
- `katex` / `vueuse` / `lodash` / `dayjs`
- `mermaid` / `cytoscape`
- `ai-sdk` — ai / @ai-sdk/*
- `tiktoken` / `localforage`
- `pragmatic-drag` — @atlaskit/pragmatic-drag-and-drop

## B 系列组件体系

项目采用 `unplugin-vue-components` 实现 B 系列组件的全局自动注册，命名规范为 `B` + 功能名：

| 组件 | 功能 |
|------|------|
| `BEditor` | Markdown 双视图编辑器（富文本 TipTap + 源码 CodeMirror），统一入口，含 15 个适配器、9 个 hooks、6 个扩展 |
| `BChatSidebar` | AI 聊天侧边栏（流式对话、工具调用、会话历史、文件引用、语音输入、上下文压缩），含 18 个 hooks、12 个工具模块 |
| `BPromptEditor` | 提示词输入编辑器（斜杠命令、变量插入、file-ref 粘贴） |
| `BMonaco` | Monaco Editor 封装（JSON/代码编辑，从 BEditor 提取独立） |
| `BPanelSplitter` | 可拖拽面板分割器（支持拖拽关闭 closeThreshold） |
| `BSearchRecent` | 最近文件搜索弹窗（支持绝对路径打开） |
| `BButton / BModal / BMessage / BSelect` | 通用 UI 组件 |
| `BDropdown` | 下拉菜单（Button + Menu 子组件） |
| `BModelIcon` | AI 模型图标展示（30+ 提供商，亮/暗色主题） |
| `BModelSelect` | AI 模型选择器模态框（搜索、Provider 分组、v-model 绑定） |
| `BToolbar` | 工具栏菜单（文件/编辑/视图/帮助） |
| `BBubble` | 气泡消息（Avatar + Loading + 折叠） |
| `BTruncateText` | 文本截断 |
| `BScrollbar` | 自定义滚动条 |
| `BImageViewer` | 图片查看器（缩放/旋转/拖拽/键盘快捷键/Carousel 走马灯） |
| `BUpload` | 文件上传组件 |
| `BSettingsPage` | 设置页布局组件 |
| `BSettingsSection` | 设置分区组件 |

## 项目配置文件

| 文件 | 用途 |
|------|------|
| `vite.config.ts` | Vite 构建配置（组件自动注册、19 组依赖拆包、别名、Rolldown） |
| `vitest.config.ts` | Vitest 测试配置 |
| `uno.config.ts` | UnoCSS 原子化 CSS 配置（presetWind3 + presetAttributify） |
| `electron-builder.yml` | Electron 打包与分发配置（macOS/Windows/Linux） |
| `tsconfig.json` | TypeScript 根配置（strict、noUnusedLocals、noUnusedParameters） |
| `tsconfig.node.json` | Node/Vite 端 TypeScript 配置（composite） |
| `electron/tsconfig.json` | Electron 主进程专用 TS 配置（target ES2022、.mts 扩展名） |
| `package.json` | 依赖与脚本（pnpm 10） |
| `pnpm-lock.yaml` | 依赖锁定文件 |
| `index.html` | Vite HTML 入口 |
| `.editorconfig` | 编辑器统一配置 |
| `.env` | 环境变量（DEV_SERVER_HOST/PORT） |
| `.eslintrc.cjs` / `.eslintignore` | ESLint 配置与忽略规则 |
| `.stylelintrc.cjs` | Stylelint 样式检查配置 |
| `prettier.config.cjs` | Prettier 格式化配置（printWidth: 160、singleQuote: true） |
| `.npmrc` | npm/pnpm 配置 |
| `.gitignore` | Git 忽略规则 |

## 测试体系

项目使用 Vitest 作为测试框架，`test/` 目录按 `src/` 结构镜像组织，包含约 115 个测试文件，覆盖以下层级：

- **组件测试**：BEditor（41 个测试文件，最全面）、BChatSidebar（22+ 个）、BPromptEditor、BBubble、BModelSelect、BSearchRecent 等
- **AI 工具测试**：所有 9 个内置工具 + policy / permission / results / stream / editor-context
- **Store 测试**：chat/session、chat/toolPermission、editor/fileWatch、ui/setting、workspace/tabs、helpers/persist 等
- **Electron 测试**：主进程 AI 服务、文件监听、MCP 运行时、语音服务、WebView 安全策略等
- **View 测试**：editor（5 个）、settings（9 个）、webview（5 个）
- **Hook/Layout/Router 测试**：useChatStream、HeaderTabs、useKeepAlive、useTabDragger 等

运行 `pnpm test` 执行完整测试套件。

## 文档体系

| 目录 | 内容 |
|------|------|
| `docs/code-wiki/` | 项目代码百科（概述、架构、前端、编辑器、Electron、存储、AI、开发指南、依赖地图，9 篇） |
| `docs/superpowers/plans/` | 技术实现计划（59 篇，按日期 `YYYY-MM-DD-<主题>.md` 组织） |
| `docs/superpowers/specs/` | 设计规范文档（63 篇，与 plans 对称组织） |
| `docs/ai-tools/` | AI 工具系统分析与开发指南（含 tasks 任务分解） |
| `docs/web-view/` | WebView 功能设计文档（双实现方案，3 篇） |
| `docs/development/` | 开发问题与注意事项（如原生模块版本问题） |
| `docs/markdown-symbol-highlight/` | Markdown 符号高亮方案 |
| `docs/speech/` | 语音功能完整说明 |
| `changelog/` | 变更日志（按日期 `.md` 每日记录，50 条，覆盖 2026-03-26 至今） |

## 全局类型与脚本

- **`types/`**（根目录）：全局 `.d.ts` 类型声明文件（8 个），定义 `AI`、`Chat`、`Model`、`ElectronAPI`、`WebView` 等跨模块共享类型接口
- **`scripts/speech/`**：语音运行时脚本（`dev-runtime.mjs` 开发环境、`manifest-tool.mjs` 清单工具）
- **`.dev-resources/`**：语音运行时二进制文件
- **`resources/`**：应用图标（`app.icns`、`app.png`、`app.ico`）和语音清单（`speech/manifest.json`）
- **`.vscode/`**：VS Code 推荐扩展与工作区设置

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式（Vite + 主进程 TypeScript watch + Electron 运行） |
| `pnpm build` | 仅构建前端 |
| `pnpm electron:build-main` | 编译主进程 TypeScript |
| `pnpm electron:build` | 完整打包（前端 + 主进程 + electron-builder） |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm lint` | ESLint 检查 + 自动修复 |
| `pnpm lint:style` | Stylelint 样式检查 + 修复 |
| `pnpm preview` | 预览构建结果 |
| `pnpm speech:dev:*` | 语音运行时开发环境相关命令 |
