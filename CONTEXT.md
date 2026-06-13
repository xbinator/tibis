## 项目简介

Tibis 是一款基于 Electron + Vue 3 + TypeScript 的桌面端 Markdown 编辑器，将 AI 对话侧边栏与编辑器深度集成，面向"本地优先"的写作与编辑工作流。

**核心能力**：
- 双视图 Markdown 编辑器（富文本 TipTap + 源码 CodeMirror）
- AI 聊天侧边栏（流式对话、工具调用、上下文压缩与用量指示、语音输入）
- 多 AI 服务商支持（OpenAI / Anthropic / Google / DeepSeek / AI Gateway）
- 文件系统操作（读写、工作区监听、未保存草稿管理）
- MCP（Model Context Protocol）工具集成
- 提示词编辑器（斜杠命令 `/`、文件引用 `@`、技能调用）
- 上下文压缩与记忆系统
- 绘图/白板功能（形状创建、连接线、样式面板、无限画布）
- 主题系统（10 套预设主题，支持自定义色彩令牌）
- 本地 SQLite 持久化 + 加密存储

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 41 |
| 前端框架 | Vue 3.5 + Composition API |
| 构建工具 | Vite 8（Rolldown） |
| 语言 | TypeScript 5.9（strict） |
| 包管理 | pnpm 10 |
| 状态管理 | Pinia 3（6 个领域、19 个 store） |
| 路由 | Vue Router 5（Hash + KeepAlive） |
| 富文本编辑器 | TipTap 3（ProseMirror） |
| 源码编辑器 | CodeMirror 6 |
| JSON/代码编辑 | Monaco Editor 0.55 |
| UI 组件库 | Ant Design Vue 4 + B 系列自研组件（28 个） |
| 原子化 CSS | UnoCSS（presetWind3 + presetAttributify） |
| 样式预处理 | Less |
| 拖拽排序 | @atlaskit/pragmatic-drag-and-drop |
| 绘图/白板 | moveable + selecto + vue3-moveable + vue3-infinite-viewer |
| 流程图 | @vue-flow/core（BJsonViewer 图形视图） |
| AI SDK | Vercel AI SDK v6（`ai` + @ai-sdk/*） |
| AI 搜索 | @tavily/ai-sdk |
| MCP 协议 | @modelcontextprotocol/sdk |
| 数据库 | better-sqlite3（主进程本地数据库） |
| 安全存储 | electron-store（API Key 加密存储） |
| 图标 | Iconify（@iconify/vue） |
| 文件监听 | Chokidar 5 |
| 图片处理 | sharp |
| Markdown 渲染 | marked + KaTeX（数学公式）+ Mermaid（图表） |
| Token 估算 | js-tiktoken |
| 离线存储 | localforage |
| Schema 校验 | zod |

---

## 目录结构

```
tibis/
├── src/                              # 渲染进程（Vue 前端）
│   ├── main.ts                       # 应用入口（Pinia + Router + UnoCSS）
│   ├── App.vue                       # 根组件（zhCN + 明暗主题 + RouterView）
│   │
│   ├── views/                        # 页面视图
│   │   ├── editor/                   # 编辑器页面（核心：自动保存、文件监听、会话管理）
│   │   │   ├── index.vue
│   │   │   ├── types.ts
│   │   │   ├── hooks/                # useAutoSave / useBindings / useFileSelection / useFileState / useFileWatcher / useSavePolicy / useSession
│   │   │   └── utils/                # filePath / reconcileFileContent
│   │   ├── drawing/                  # 绘图/白板页面
│   │   ├── settings/
│   │   │   ├── index.vue             # 设置页布局
│   │   │   ├── constants.ts
│   │   │   ├── basic/                # 基础设置
│   │   │   ├── provider/             # AI 服务商管理（列表 + 详情 + 子组件）
│   │   │   ├── service-model/        # 服务模型配置（Chat / Edit / Summary 等能力分配）
│   │   │   ├── speech/               # 语音设置（运行时管理、语音识别配置）
│   │   │   ├── tools/                # 工具设置
│   │   │   │   ├── mcp/              # MCP 服务器管理（ServerCard + ServerEditor + OAuth）
│   │   │   │   ├── memory/           # 记忆管理（MemoryContent + MemoryInput + useMemory）
│   │   │   │   ├── search/           # Tavily 搜索配置
│   │   │   │   └── skill/            # 技能管理（注册、安装、预览、创建）
│   │   │   └── logger/               # 运行日志查看（LogFilterBar + LogTimeline）
│   │   ├── webview/                  # 内嵌浏览器（native + web/DOM 双实现 + shared 共享层）
│   │   ├── welcome/                  # 欢迎页（含 DropZone 文件拖拽）
│   │   │   └── components/DropZone.vue
│   │   └── error/                    # 404 页面
│   │
│   ├── components/                   # B 系列组件（unplugin-vue-components 全局自动注册，28 个）
│   │   ├── BEditor/                  # Markdown 统一编辑器
│   │   │   ├── index.vue             # 入口（双视图路由）
│   │   │   ├── Markdown.vue          # 纯渲染组件
│   │   │   ├── types.ts / constants/
│   │   │   ├── adapters/             # 15 个适配器（选区、导航、搜索、行映射、布局主题等）
│   │   │   ├── components/           # 8 个 UI 组件（AnchorContent、CodeBlock、CurrentBlockMenu、FrontMatterCard、HoverIndicator、LinkPopover、Sidebar、TableView）
│   │   │   ├── extensions/           # 7 个 CodeMirror/TipTap 扩展（AI 高亮、装饰、搜索、表格控件等）
│   │   │   ├── hooks/                # 11 个编辑器 hooks（useAnchors、useContent、useRichEditor、useEditorController、useEditorResolver 等）
│   │   │   ├── panes/                # PaneRichEditor / PaneSourceEditor
│   │   │   ├── shared/               # 7 个共享组件（FindBar、SelectionToolbar、SelectionAIInput、CommentCard 等）
│   │   │   └── utils/                # 6 个工具（editorMarkdown、exportToPdf、mermaidRenderId、richCodeBlockLowlight 等）
│   │   ├── BChatSidebar/             # AI 聊天侧边栏
│   │   │   ├── index.vue / types.ts
│   │   │   ├── components/           # 14 个组件（ConversationView、MessageBubble、SessionHistory、InputToolbar、QuestionCard、ConfirmationSheet、UsagePanel、TodoPanel、FileRefChip、ImagePreview、InteractionContainer 等）
│   │   │   │   ├── InputToolbar/     # ContextUsage / ModelSelector / VoiceInput / VoiceWaveform
│   │   │   │   ├── MessageBubble/    # 7 个子组件（BubblePart、Compression、Text、Thinking、Tool、ToolCode、UserInput）
│   │   │   │   └── InteractionContainer/ # ToastItem 交互反馈
│   │   │   ├── hooks/                # 20 个 hooks（useChatStream、useAutoName、useCompactContext、useVoiceRecorder、useSkillInit、useSlashCommands、useChatHistory、useRollback、useContextUsage 等）
│   │   │   └── utils/                # 15 个工具 + compression/ 子目录（15 个压缩模块）
│   │   │       └── compression/      # compressionMetrics / coordinator / planner / policy / segmentRecall / structuredSummaryGenerator / summaryAdapter / summaryRenderer / tailPolicy / tokenEstimator / topicSegmenter / types 等
│   │   ├── BDrawing/                 # 绘图/白板组件
│   │   │   ├── index.vue / types.ts
│   │   │   ├── components/           # 6 个子组件（InfiniteViewport、Minimap、MoveableLayer、SelectoLayer、StylePanel、Toolbar）
│   │   │   ├── hooks/                # 3 个 hooks（useDrawingBoard、useDrawingInteraction、useDrawingViewport）
│   │   │   ├── renderers/            # 5 个渲染器（Canvas、Connector、CreatePreview、Edge、Node）
│   │   │   └── utils/                # 3 个工具（boardTransforms、drawingGeometry、drawingTextMetrics）
│   │   ├── BPromptEditor/            # 提示词输入框（斜杠命令 `/`、文件引用 `@`、变量插入、6 个 ProseMirror 扩展）
│   │   ├── BMonaco/                  # Monaco Editor 封装
│   │   ├── BPanelSplitter/           # 可拖拽面板分割器（closeThreshold 拖拽关闭）
│   │   ├── BSearchRecent/            # 最近文件搜索弹窗
│   │   ├── BModelIcon/               # 33 个 AI 模型提供商图标（亮/暗色主题）
│   │   ├── BModelSelect/             # AI 模型选择器（模态框搜索、Provider 分组）
│   │   ├── BToolbar/                 # 工具栏菜单
│   │   ├── BBubble/                  # 气泡消息（头像 + 折叠 + Loading）
│   │   ├── BColorPicker/             # 颜色选择器（预设色 + 自定义 + align 布局）
│   │   ├── BDropdown/                # 下拉菜单
│   │   ├── BScrollbar/               # 自定义滚动条
│   │   ├── BTruncateText/            # 文本截断
│   │   ├── BImageViewer/             # 图片查看器（缩放/旋转/拖拽/Carousel 走马灯）
│   │   ├── BJsonViewer/              # JSON 数据查看器（树形 + Vue Flow 图形视图）
│   │   ├── BSuspense/                # 异步组件 Suspense 包装器
│   │   ├── BUpload/                  # 文件上传组件
│   │   ├── BCollapseTransition/      # 折叠过渡动画
│   │   ├── BSettingsPage/            # 设置页布局组件
│   │   ├── BSettingsSection/         # 设置分区组件
│   │   ├── BIcon/                    # 图标组件
│   │   ├── BMessage/                 # 全局消息提示组件
│   │   ├── BButton / BModal / BSelect  # 通用 UI 组件
│   │   └── BTldraw/                  # Tldraw 适配器（开发中）
│   │
│   ├── layouts/default/              # 默认布局（标题栏 + Tab 栏 + RouterView/KeepAlive + 侧边栏）
│   │   ├── index.vue / types.ts
│   │   ├── components/               # HeaderTabs（Pragmatic Drag and Drop 排序）/ HeaderEditorActions / HeaderUpdateNotice / ShortcutsHelp
│   │   ├── hooks/                    # useKeepAlive / useTabDragger / useFileActive / useEditActive / useViewActive / useHelpActive
│   │   └── utils/                    # headerTabsScroll
│   │
│   ├── router/                       # 路由配置
│   │   ├── index.ts                  # createWebHashHistory + import.meta.glob 聚合模块
│   │   ├── cache.ts / type.ts
│   │   └── routes/
│   │       ├── index.ts              # 聚合入口（import.meta.glob('./modules/**.ts'））
│   │       └── modules/              # drawing.ts / editor.ts / settings.ts / webview.ts / welcome.ts
│   │
│   ├── stores/                       # Pinia 状态管理
│   │   ├── ai/                       # provider / serviceModel / skill / toolSettings / memory
│   │   ├── chat/                     # session / todo / toolPermission
│   │   ├── editor/                   # fileSelectionIntent / fileWatch / preferences
│   │   ├── ui/                       # setting / headerToolbar
│   │   ├── workspace/                # files / tabs / recent
│   │   └── helpers/                  # events（事件总线）/ persist（持久化中间件）/ types
│   │
│   ├── ai/                           # AI 子系统
│   │   ├── tools/                    # 工具系统
│   │   │   ├── builtin/              # 15 个内置工具（每工具独立目录）
│   │   │   │   ├── DocumentTool/     # 读取/编辑当前编辑器文档
│   │   │   │   ├── EnvironmentTool/  # 环境信息查询
│   │   │   │   ├── FileEditTool/     # 编辑本地文件（搜索/替换）
│   │   │   │   ├── FileReadTool/     # 读取文件 + 列出目录
│   │   │   │   ├── FileWriteTool/    # 写入文件（支持 unsaved:// 虚拟路径）
│   │   │   │   ├── LogsTool/         # 查询应用运行日志
│   │   │   │   ├── MCPTool/          # MCP 服务器配置读写
│   │   │   │   ├── MemoryTool/       # 记忆管理
│   │   │   │   ├── OpenResourceTool/ # 打开资源
│   │   │   │   ├── QuestionTool/     # 向用户提问（多选/单选）
│   │   │   │   ├── SettingsTool/     # 应用设置读写
│   │   │   │   ├── ShellTool/        # Shell 命令执行
│   │   │   │   ├── SkillTool/        # 技能注册与调用
│   │   │   │   ├── TodoWriteTool/    # 待办列表管理
│   │   │   │   ├── WebpageTool/      # 网页内容抓取与摘要
│   │   │   │   └── index.ts
│   │   │   ├── context/              # 工具上下文（editor.ts / webview.ts）
│   │   │   ├── shared/               # fileErrors / fileTool / types
│   │   │   ├── confirmation.ts       # 用户确认适配器接口
│   │   │   ├── permission.ts         # 权限执行引擎（readonly/ask/autoSafe）
│   │   │   ├── policy.ts             # 模型工具支持策略
│   │   │   ├── results.ts            # 工具结果工厂函数
│   │   │   └── stream.ts             # 工具流式执行适配
│   │   ├── memory/                   # 记忆系统（types / parser / injector）
│   │   └── skill/                    # 技能系统（types / parser / scanner / installer.worker）
│   │
│   ├── theme/                        # 主题系统
│   │   ├── index.ts                  # 主题入口
│   │   ├── core/                     # 核心（apply / derive / factory / registry）
│   │   ├── presets/                  # 10 套预设主题（ayu / catppuccin / default / everforest / gruvbox / kanagawa / matrix / nord / one-dark / tokyonight）
│   │   └── types/                    # 令牌类型（tokens.ts）
│   │
│   ├── shared/                       # 跨组件共享层
│   │   ├── platform/                 # Electron/Web 平台抽象（native/ 双实现）
│   │   ├── storage/                  # 持久化存储适配
│   │   │   ├── base/                 # 通用 KV（BaseStorage、TTL、合并策略）
│   │   │   ├── files/                # 最近文件列表
│   │   │   ├── providers/            # AI 提供商与模型
│   │   │   ├── service-models/       # 服务模型配置
│   │   │   ├── settings/             # 应用设置持久化
│   │   │   ├── tool-settings/        # MCP/搜索工具配置
│   │   │   ├── memories/             # 记忆存储（开发中）
│   │   │   └── utils/                # 数据库连接 + 序列化
│   │   ├── chat/                     # 文件引用事件桥接
│   │   ├── logger/                   # 日志类型与工具
│   │   ├── utils/                    # hash 工具
│   │   └── workspace/                # 路径工具
│   │
│   ├── hooks/                        # 全局组合式函数（13 个）
│   │   ├── useAntdTheme.ts           # Ant Design 明暗主题
│   │   ├── useAutoCollapse.ts        # ResizeObserver 自动折叠
│   │   ├── useChat.ts                # AI 流式聊天（invoke/stream/abort）
│   │   ├── useClipboard.ts           # 剪贴板操作
│   │   ├── useImagePreview.ts        # 图片预览（跨平台：Electron 原生 / Web）
│   │   ├── useMenuAction.ts          # 系统菜单动作注册
│   │   ├── useNavigate.ts            # 统一导航
│   │   ├── useOpenDraft.ts           # 草稿文件打开
│   │   ├── useOpenFile.ts            # 统一文件打开
│   │   ├── useScroller.ts            # DOM 滚动包装
│   │   ├── useShortcuts.ts           # 键盘快捷键（@vueuse/core useMagicKeys）
│   │   ├── useSystem.ts              # 系统信息查询
│   │   └── useWorkspaceRoot.ts       # 工作区根目录
│   │
│   ├── utils/                        # 工具函数（15 个）
│   │   ├── asyncTo.ts / css.ts / emitter.ts / env.ts / is.ts / json.ts
│   │   ├── logger.ts / modal.tsx / namespace.ts / scroll.ts / shortcut.ts
│   │   └── file/                     # icons / reference / title / unsaved
│   │
│   ├── plugins/                      # Vue 插件（index / message / error-handler）
│   ├── directives/                   # 指令（focus）
│   ├── constants/                    # extensions / shortcuts
│   └── assets/styles/                # 全局样式（global / normalize / reset / markdown / scrollbar）
│
├── electron/                         # Electron 主进程 + preload
│   ├── main/
│   │   ├── index.mts                 # 主进程入口（初始化流程：日志→存储→数据库→IPC→菜单→窗口）
│   │   ├── lifecycle.mts             # 生命周期管理
│   │   ├── window.mts                # 窗口管理（无边框、macOS 红绿灯、preload 注入）
│   │   ├── env.mts / types.ts
│   │   └── modules/                  # IPC 模块（17 个注册模块）
│   │       ├── index.mts             # 统一注册入口
│   │       ├── ai/                   # AI 流式/非流式调用（4 个 Provider：openai/anthropic/google/deepseek + errors/）
│   │       ├── chat/                 # 聊天会话持久化（支持单条消息更新）
│   │       ├── database/             # SQLite 操作（execute / select / transaction）
│   │       ├── dialog/               # 原生文件对话框
│   │       ├── export/               # PDF 导出
│   │       ├── file/                 # 文件读写 + 工作区监听（Chokidar）
│   │       ├── image/                # 图片压缩/格式转换（sharp）
│   │       ├── logger/               # 日志系统（文件 + 控制台 + 维护定时器）
│   │       ├── mcp/                  # MCP 运行时（stdio 执行、发现缓存、OAuth 授权、自定义 headers）
│   │       ├── memory/               # 记忆 IPC（开发中）
│   │       ├── shell/                # 系统 Shell（回收站、外部链接、命令执行、安全策略）
│   │       ├── speech/               # 语音服务（运行时安装/下载、录音、whisper.cpp 转写）
│   │       ├── store/                # 安全加密存储（electron-store）
│   │       ├── ui/                   # 窗口控制 + 系统菜单 + 快捷入口 + 图片预览
│   │       ├── updater/              # 应用自动更新
│   │       ├── webview/              # 内嵌 WebView（安全策略隔离、Partition 隔离）
│   │       └── workspace/            # 工作区文件监听
│   └── preload/
│       ├── index.mts                 # contextBridge 安全暴露 electronAPI（30+ 方法）
│       ├── error-collector.mts       # 全局错误收集 preload
│       └── webview.mts               # WebView 页面 preload
│
├── types/                            # 全局 TypeScript 类型声明（9 个 .d.ts 文件）
│   ├── ai.d.ts / chat.d.ts / compression.d.ts / electron-api.d.ts
│   ├── global.d.ts / model.d.ts / webview.d.ts / vite-env.d.ts
│   └── components.d.ts              # 自动生成的组件类型
│
├── test/                             # 测试套件（54 个测试文件，按 src 结构镜像组织）
│   ├── components/                   # BChat（21）、BColorPicker、BDrawing（3）、BMessage
│   ├── electron/                     # 主进程测试（lifecycle、mcp/transport、ui、updater）
│   ├── hooks/                        # useImagePreview
│   ├── layouts/                      # HeaderTabs、useHelpActive 等
│   ├── router/                       # drawing 路由
│   ├── shared/storage/               # files、providers、tool-settings、database
│   ├── stores/                       # session、headerToolbar
│   ├── views/                        # editor、settings/mcp+memory、webview、welcome
│   └── theme/                        # 主题测试
│
├── docs/                             # 项目文档
│   ├── code-wiki/                    # 代码百科（概述/架构/前端/编辑器/Electron/存储/AI/开发指南/依赖地图，10 篇）
│   ├── ai-tools/                     # AI 工具系统分析 + 6 个任务文档
│   ├── web-view/                     # WebView 设计文档
│   ├── speech/                       # 语音功能说明
│   ├── development/                  # 开发问题与注意事项
│   ├── markdown-symbol-highlight/    # Markdown 符号高亮方案
│   └── superpowers/                  # ~194 篇技术文档（92 plans + 95 specs + 7 reviews）
│
├── changelog/                        # 变更日志（按日期 .md，覆盖 2026-03-26 至今，74 篇）
├── scripts/                          # 构建与工具脚本
│   ├── clean-dist-electron.mjs       # 清理 dist-electron
│   └── speech/                       # 语音运行时脚本（dev-runtime / manifest-tool）
├── resources/                        # 应用图标 + 语音清单
└── 配置文件                           # vite.config.ts / tsconfig.json / electron-builder.yml / uno.config.ts / .eslintrc.cjs / .stylelintrc.cjs / prettier.config.cjs 等
```

---

## 核心架构

### 进程模型

```
┌─────────────────────────────────────────────────────────────────┐
│                      渲染进程 (Vue 3)                            │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────┐   │
│  │  BEditor  │  │ BChatSidebar │  │ BDrawing │  │ Settings │   │
│  │ (Markdown)│  │  (AI 聊天)   │  │ (绘图)   │  │(服务商配置)│   │
│  └─────┬─────┘  └──────┬───────┘  └────┬─────┘  └────┬─────┘   │
│        │               │               │              │          │
│        └───────────────┼───────────────┼──────────────┘          │
│                        │               │                         │
│             window.electronAPI                                    │
│          (contextBridge 暴露)                                     │
└────────────────────────┼────────────────────────────────────────┘
                         │  IPC (invoke / on / send)
┌────────────────────────┼────────────────────────────────────────┐
│                    主进程 (Electron)                              │
│                         │                                        │
│   ┌─────────┐  ┌───────┴──────┐  ┌──────────┐  ┌──────────┐   │
│   │ AI 服务  │  │   文件操作    │  │  数据库   │  │   MCP    │   │
│   │(多Provider)│ │ (读写/监听)  │  │ (SQLite) │  │(stdio)   │   │
│   └─────────┘  └──────────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 关键数据流

1. **编辑文件**：渲染进程 → `electronAPI.readFile/writeFile` → IPC → 主进程 file 模块 → 本地文件系统
2. **AI 流式聊天**：渲染进程 → `electronAPI.aiStream` → IPC → 主进程 AI 服务 → Vercel AI SDK → 外部 API → 流式回传（text / thinking / tool-call / tool-input / tool-result / finish / error 事件）
3. **数据持久化**：渲染进程 → `electronAPI.dbExecute/dbSelect` → IPC → 主进程 better-sqlite3
4. **文件监听**：主进程 Chokidar 监听工作区 → 变更事件 → IPC push → 渲染进程 fileWatch store → 编辑器自动重载
5. **MCP 工具调用**：AI 服务识别 tool-call → 渲染进程工具系统 → 需要时回调主进程 MCP 运行时 → stdio 执行 → 结果回传
6. **绘图操作**：渲染进程 BDrawing → moveable/selecto 本地交互 → v-model 双向绑定 → 文档内容同步

### 安全边界

- `contextIsolation: true`，`nodeIntegration: false`
- 所有系统能力通过 preload 的 `contextBridge.exposeInMainWorld` 暴露
- preload 暴露 30+ API 方法，每个对应一个 `ipcRenderer.invoke`
- 渲染侧通过 `src/shared/platform/electron-api.ts` 类型安全封装读取

---

## 应用启动流程

### 主进程启动（electron/main/index.mts）

1. 获取启动快捷入口动作（Dock/Taskbar 最近文件）
2. 初始化日志（控制台）
3. 清理过期日志 → 启动日志维护定时器
4. 初始化 electron-store（加密存储）→ 初始化 SQLite 数据库
5. 注册全部 IPC handler（17 个模块）
6. 设置系统菜单 → 刷新平台快捷入口
7. 创建窗口 → 处理启动时的快捷动作（open-file / second-instance）
8. 生命周期管理（lifecycle.mts 管理应用退出/重启流程）

### 窗口创建（electron/main/window.mts）

- 无边框窗口（`frame: false`），macOS 使用 `titleBarStyle: 'hidden'` + 自定义红绿灯位置
- 预加载脚本注入，开发环境加载 Vite dev server（127.0.0.1:1420），生产环境加载打包 HTML

### 渲染进程入口（src/main.ts）

- 创建 Vue 应用 → Pinia → setupPlugins（Ant Design message） → setupErrorHandler → Router → 挂载到 `#app`
- 全局引入 UnoCSS 虚拟模块、Ant Design ConfigProvider zhCN、Less 全局样式

---

## 路由与导航

### 路由表

| 路径 | 页面 | 说明 |
|------|------|------|
| `/welcome` | 欢迎页 | 入口页面（hideTab） |
| `/editor/:id` | 编辑器 | 核心 Markdown 编辑页面 |
| `/drawing` | 绘图/白板 | 形状创建、连接线、样式面板、无限画布 |
| `/settings/provider` | AI 服务商列表 | 管理 AI Provider |
| `/settings/provider/:provider` | 服务商详情 | 配置模型列表 |
| `/settings/service-model` | 服务模型 | 管理 AI 能力（Chat/Edit/Summary） |
| `/settings/basic` | 基础设置 | 应用基础配置 |
| `/settings/speech` | 语音设置 | 运行时管理和识别配置 |
| `/settings/tools/mcp` | MCP 工具 | MCP 服务器管理 |
| `/settings/tools/memory` | 记忆管理 | AI 记忆配置 |
| `/settings/tools/search` | 搜索工具 | Tavily 搜索配置 |
| `/settings/tools/skill` | 技能设置 | 技能注册与管理 |
| `/settings/logger` | 运行日志 | 系统运行日志查看 |
| `/webview/native` | 网页浏览（Native） | `<webview>` 标签实现 |
| `/webview/web` | 网页浏览（DOM） | DOM iframe 实现 |

路由使用 `createWebHashHistory`（适配 Electron `file://` 加载），通过 `import.meta.glob` 聚合 `routes/modules/*.ts` 子路由。

### Tab 管理

- `router.afterEach` 根据 route meta 自动同步 Tab（hideTab 标记的页面不显示）
- Tab 支持右键菜单（关闭/关闭其他/关闭右侧/关闭已保存/关闭全部）
- 拖拽排序基于 @atlaskit/pragmatic-drag-and-drop
- KeepAlive 页面缓存由 `useKeepAlive` hook 管理

---

## B 系列组件体系

项目采用 `unplugin-vue-components` 实现 B 系列组件全局自动注册，命名规范为 `B` + 功能名，无需手动 import。当前共 28 个组件。

| 组件 | 说明 |
|------|------|
| **BEditor** | Markdown 双视图编辑器（TipTap 富文本 + CodeMirror 源码），含 15 个适配器、11 个 hooks、7 个扩展 |
| **BChatSidebar** | AI 聊天侧边栏（流式对话、工具调用、会话历史、文件引用、语音输入、上下文压缩与用量指示、侧边栏放大覆盖），含 20 个 hooks |
| **BDrawing** | 绘图/白板组件（形状创建/拖拽/旋转/缩放、连接线/贝塞尔曲线/箭头、样式面板、无限画布、小地图），含 6 个子组件、3 个 hooks、5 个渲染器 |
| **BPromptEditor** | 提示词输入框（斜杠命令、@mention 文件引用、变量插入、6 个 ProseMirror 扩展） |
| **BMonaco** | Monaco Editor 封装（JSON/代码编辑） |
| **BPanelSplitter** | 可拖拽面板分割器（支持 closeThreshold 拖拽关闭） |
| **BSearchRecent** | 最近文件搜索弹窗（支持绝对路径打开） |
| **BModelIcon** | AI 模型图标（33 个提供商，亮/暗色主题） |
| **BModelSelect** | AI 模型选择器（搜索、Provider 分组） |
| **BToolbar** | 工具栏菜单（文件/编辑/视图/帮助） |
| **BBubble** | 气泡消息（Avatar + Loading + 折叠） |
| **BColorPicker** | 颜色选择器（预设色 + 自定义 + align 布局） |
| **BTruncateText** | 文本截断 |
| **BScrollbar** | 自定义滚动条 |
| **BImageViewer** | 图片查看器（缩放/旋转/拖拽/Carousel） |
| **BJsonViewer** | JSON 数据查看器（树形 + Vue Flow 图形视图） |
| **BSuspense** | 异步组件 Suspense 包装器 |
| **BUpload** | 文件上传 |
| **BCollapseTransition** | 折叠过渡动画 |
| **BSettingsPage** | 设置页布局 |
| **BSettingsSection** | 设置分区布局 |
| **BIcon** | 图标组件 |
| **BMessage** | 全局消息提示组件 |
| **BButton / BModal / BSelect** | 通用 UI 组件 |
| **BDropdown** | 下拉菜单 |
| **BTldraw** | Tldraw 适配器（开发中） |

---

## 状态管理

Pinia stores 按业务领域分为 6 个目录，19 个 store 文件：

### ai/ — AI 配置

| Store | 职责 |
|-------|------|
| `provider` | AI 服务商配置（API Key、Base URL、模型列表） |
| `serviceModel` | 服务模型绑定（Chat / Edit / Summary 等能力分配模型） |
| `skill` | 技能注册与发现（斜杠命令 /skill 路由） |
| `toolSettings` | 工具设置（MCP 服务器、Tavily 搜索） |
| `memory` | AI 记忆状态管理 |

### chat/ — 聊天

| Store | 职责 |
|-------|------|
| `session` | 聊天会话管理（消息流、会话历史、上下文压缩） |
| `todo` | 聊天待办事项管理 |
| `toolPermission` | AI 工具权限（readonly / ask / autoSafe 模式） |

### editor/ — 编辑器

| Store | 职责 |
|-------|------|
| `fileSelectionIntent` | 文件选区意图（行范围导航跳转） |
| `fileWatch` | 编辑器文件监听（路径 ↔ 文件 ID 映射） |
| `preferences` | 编辑器偏好（视图模式 / 大纲 / 页宽 / 保存策略） |

### ui/ — UI

| Store | 职责 |
|-------|------|
| `setting` | 应用设置（主题、语言、快捷键等） |
| `headerToolbar` | 标题栏工具栏状态 |

### workspace/ — 工作区

| Store | 职责 |
|-------|------|
| `files` | 文件状态管理 |
| `tabs` | 标签页管理（增删改查、排序、缓存） |
| `recent` | 最近打开文件列表 |

### helpers/ — 基础设施

| 模块 | 职责 |
|------|------|
| `events` | 事件总线（mitt，解耦 store 间依赖） |
| `persist` | 持久化中间件（loadPersistedState / persistState，存储路径 `pinia.<storeId>`） |
| `types` | 共享类型（PersistConfig、MigrationStep） |

---

## AI 工具系统

### 工具定义架构

```
src/ai/tools/
├── builtin/              # 15 个内置工具，每工具独立目录
│   ├── DocumentTool/     # 读写当前编辑器文档
│   ├── EnvironmentTool/  # 环境信息查询
│   ├── FileEditTool/     # 编辑本地文件（搜索/替换，支持未保存草稿）
│   ├── FileReadTool/     # 读取文件 + 列出目录
│   ├── FileWriteTool/    # 写入文件（支持 unsaved:// 虚拟路径）
│   ├── LogsTool/         # 查询应用日志
│   ├── MCPTool/          # MCP 服务器配置读写
│   ├── MemoryTool/       # 记忆管理
│   ├── OpenResourceTool/ # 打开资源文件
│   ├── QuestionTool/     # 向用户提问（多选/单选，支持自定义输入）
│   ├── SettingsTool/     # 应用设置读写
│   ├── ShellTool/        # Shell 命令执行
│   ├── SkillTool/        # 技能注册与调用（斜杠命令路由、参数解析）
│   ├── TodoWriteTool/    # 待办列表管理
│   ├── WebpageTool/      # 网页内容抓取与摘要
│   └── index.ts
├── context/              # 工具上下文（editor.ts 编辑器上下文 / webview.ts WebView 上下文）
├── shared/               # fileErrors / fileTool / types
├── confirmation.ts       # 用户确认适配器接口
├── permission.ts         # 权限执行引擎（readonly / ask / autoSafe）
├── policy.ts             # 模型工具支持策略
├── results.ts            # 工具结果工厂函数
└── stream.ts             # 工具流式执行适配
```

### 编辑器上下文

编辑器上下文（当前文档内容、选区、未保存草稿路径等）由 BEditor 内部通过 `useEditorToolContext` 提供，工具通过 `context/editor.ts` 中的注册表获取，确保工具调用能正确操作当前文档。WebView 上下文由 `context/webview.ts` 管理。

### 未保存文档路径

未保存文档使用 `unsaved://` 虚拟路径协议（格式：`unsaved://{id}/{fileName}.{ext}`），通过 `src/utils/file/unsaved.ts` 管理，允许 AI 工具在文档保存前进行读写。

### 权限执行引擎

支持三种模式：
- **readonly**：只读操作自动批准
- **ask**：每次操作请求用户确认
- **autoSafe**：安全操作自动批准，危险操作请求确认

权限在 store 中持久化，支持按工具、按会话级别控制。

---

## 聊天系统

### 流式对话

`useChatStream` hook 管理完整流式对话生命周期：
1. 用户输入 → send 消息
2. 渲染进程 `electronAPI.aiStream` → IPC → 主进程 AI 服务
3. Vercel AI SDK 调用外部 API（按 provider 路由）
4. 流式事件回传（text / thinking / tool-call / tool-input / tool-result / finish / error）
5. 工具调用 → 渲染进程工具执行 → 结果注入 → 继续生成
6. 对话完成 → 自动命名会话（检测无 pending 交互时触发）
7. Assistant 草稿持久化 → 硬中断恢复（interruptedDraftRecovery）

### 上下文压缩（/compact）

- **触发**：`/compact` 斜杠命令手动触发，或发送前根据 token 使用率自动触发
- **策略**：保留最后 2 轮原始消息作锚点，对更早消息生成结构化摘要（目标、约束、决策、事实、文件线索、待办）
- **增量压缩**：基于上次摘要边界继续压缩，支持多段摘要
- **Schema v3**：改进压缩保真度，优化结构化摘要生成
- **持久化**：压缩消息写入 `chat_session_summaries` 表，支持会话恢复

### 上下文用量指示

- **ContextUsage 组件**：输入工具栏中显示当前 token 用量
- **useContextUsage hook**：追踪上下文窗口使用率
- **contextUsageBudget 工具**：基于当前消息切片估算 token 消耗

### 文件引用

聊天输入支持 `{{@fileName:startLine-endLine}}` 格式的 token：
- 粘贴/拖拽文件自动生成 file-ref
- 编辑器选中文本 → 触发文件引用事件 → 插入 token → 自动聚焦
- FileRefChip 组件统一渲染（聊天消息和输入框中复用同一套渲染逻辑）

### 用户确认与交互

- **confirmationController**：管理工具调用确认流程（approve / approve-session / approve-always / cancel）
- **QuestionTool**：向用户提问（产生 pending 状态，影响自动命名触发判断）
- **InteractionContainer**：统一管理 Toast 通知、Confirm 弹窗等交互反馈

### 聊天侧边栏放大覆盖

支持聊天侧边栏放大为全屏覆盖模式，提供更大的对话空间。

### 语音输入

- **前端录音**：PCM → WAV（16kHz 单声道），支持分段录音和静音检测
- **主进程转写**：whisper.cpp 语音识别
- **运行时管理**：按需下载语音运行时，manifest 系统管理版本
- 详见 `docs/speech/`

---

## 编辑器系统

### 双视图架构

BEditor 提供两个视图面板，通过 Tab 切换：

| 视图 | 技术 | 说明 |
|------|------|------|
| 富文本视图 | TipTap 3（ProseMirror） | 所见即所得编辑，支持 28+ 扩展 |
| 源码视图 | CodeMirror 6 | Markdown 源码编辑，语法高亮 |

统一入口 `BEditor/index.vue`，双视图共享适配器层（15 个适配器，统一选区、导航、搜索、行映射等行为）。

### 编辑器 Hooks

| Hook | 职责 |
|------|------|
| `useAnchors` | 大纲/锚点管理 |
| `useContent` | 文档内容读写 |
| `useRichEditor` | 富文本编辑器控制 |
| `useRichEditorLoad` | 富文本编辑器加载 |
| `useEditorController` | 编辑器生命周期控制 |
| `useEditorResolver` | 编辑器解析器 |
| `useEditorToolContext` | AI 工具上下文提供 |
| `useExtensions` | 扩展管理 |
| `useFrontMatter` | Front Matter 解析 |
| `useCommentActions` | 评论操作 |
| `useSelectionAssistant` | 选区辅助 |

### 编辑器扩展

- CodeMirror 扩展：AI 高亮、Markdown 装饰、搜索面板、表格控件
- TipTap 扩展：行内评论、空内容占位、自定义节点
- 共享组件：FindBar、SelectionToolbar、SelectionAIInput、CommentCard

### 页面级功能

编辑器页面（`views/editor/`）通过 hooks 提供：
- **useAutoSave**：自动保存（基于 debounce 策略）
- **useFileWatcher**：外部文件变更监听与冲突处理
- **useFileState**：文件状态管理（已保存/未保存/外部修改）
- **useSession**：编辑器与会话联动

---

## 绘图系统

### BDrawing 组件架构

BDrawing 提供完整的绘图/白板能力，基于 moveable + selecto + vue3-moveable 实现：

| 子组件 | 职责 |
|--------|------|
| DrawingInfiniteViewport | 无限画布视口 |
| DrawingMinimap | 小地图导航 |
| DrawingMoveableLayer | 拖拽/旋转/缩放交互层（moveable 集成） |
| DrawingSelectoLayer | 多选交互层（selecto 集成） |
| DrawingStylePanel | 节点/边样式面板（填充色/描边/字号等） |
| DrawingToolbar | 绘图工具栏（形状选择、图层排序） |

| 渲染器 | 职责 |
|--------|------|
| DrawingCanvas | SVG 画布渲染 |
| DrawingConnector | 连接线渲染（贝塞尔曲线、箭头、锚点） |
| DrawingCreatePreview | 形状创建预览 |
| DrawingEdge | 边渲染 |
| DrawingNode | 节点渲染（矩形、椭圆、文本） |

### 关键特性

- 形状创建（矩形、椭圆、文本节点）
- 拖拽/旋转/缩放（moveable 集成）
- 多选操作（selecto 集成）
- 连接线（贝塞尔曲线、箭头标记、四方向锚点）
- 样式面板（填充色、描边宽度/颜色、文本颜色/字号/对齐）
- 图层排序（前移/后移）
- v-model 双向绑定

---

## 主题系统

### 架构（src/theme/）

```
src/theme/
├── index.ts              # 主题入口
├── core/                 # 核心引擎
│   ├── apply.ts          # 主题应用（CSS 变量注入）
│   ├── derive.ts         # 主题派生（自动生成衍生色）
│   ├── factory.ts        # 主题工厂
│   └── registry.ts       # 主题注册表
├── presets/              # 10 套预设主题
│   ├── ayu / catppuccin / default / everforest / gruvbox
│   ├── kanagawa / matrix / nord / one-dark / tokyonight
│   └── ...
└── types/                # 令牌类型（tokens.ts）
```

### 预设主题

10 套开箱即用的主题预设：ayu、catppuccin、default、everforest、gruvbox、kanagawa、matrix、nord、one-dark、tokyonight。

---

## 存储层

### 主进程数据库

better-sqlite3 在主进程运行，渲染进程通过 `electronAPI.dbExecute/dbSelect` 间接访问。

### 渲染侧存储模块

`src/shared/storage/` 提供按领域的持久化适配：

| 模块 | 职责 |
|------|------|
| `base/` | 通用 KV 存储（BaseStorage 类，TTL、合并策略、自毁标记） |
| `files/` | 最近打开文件列表 |
| `providers/` | AI 提供商与模型配置（含默认值） |
| `service-models/` | 服务模型配置 |
| `settings/` | 应用设置持久化 |
| `tool-settings/` | MCP 服务器和搜索工具配置 |
| `memories/` | 记忆存储（开发中） |
| `utils/` | 数据库连接管理（含初始化竞态重试）、JSON 序列化 |

### Store 持久化

`helpers/persist.ts` 提供持久化中间件，启动时加载 `pinia.<storeId>`，状态变更时自动写回。

### 安全存储

`electron-store` 用于加密存储 API Key 等敏感信息，与 SQLite 存储分离。

---

## IPC 模块一览

主进程按领域模块拆分，各模块在 `electron/main/modules/index.mts` 统一注册（17 个注册模块）：

| 模块 | 职责 |
|------|------|
| `ai` | AI 流式/非流式调用、Provider 路由、工具调用适配 |
| `chat` | 聊天会话持久化 IPC（支持单条消息更新） |
| `database` | SQLite 执行与查询 |
| `dialog` | 原生文件对话框（打开/保存） |
| `export` | PDF 导出 |
| `file` | 文件读写、工作区目录读取、文件变更监听 |
| `image` | 图片压缩与格式转换（sharp） |
| `logger` | 日志记录与查询（控制台 + 文件） |
| `mcp` | MCP 运行时管理（stdio 执行器、发现缓存、OAuth 授权、自定义 headers） |
| `memory` | 记忆 IPC（开发中） |
| `shell` | 系统 Shell（回收站、外部链接、命令执行、安全策略） |
| `speech` | 语音运行时管理（安装/下载、录音、whisper.cpp 转写） |
| `store` | 安全加密存储（electron-store） |
| `ui` | 窗口控制 + 系统菜单 + 快捷入口（Dock/Taskbar）+ 图片预览 |
| `updater` | 应用自动更新 |
| `webview` | 内嵌 WebView 管理（安全策略、Partition 隔离） |
| `workspace` | 工作区文件监听 |

---

## 记忆与技能系统

### AI 记忆（src/ai/memory/）

- `types.ts`：记忆类型定义
- `parser.ts`：记忆解析
- `injector.ts`：记忆注入到对话上下文
- `MemoryTool`：AI 工具接口，支持读写记忆
- `stores/ai/memory`：记忆状态管理 store

### 技能系统（src/ai/skill/）

- `types.ts`：技能类型定义
- `parser.ts`：技能文件解析
- `scanner.ts`：技能目录扫描与发现
- `installer.worker.ts`：技能安装（Web Worker 异步执行）
- `SkillTool`：技能注册与调用（斜杠命令 `/` 路由）
- 设置页面 `settings/tools/skill/`：技能管理 UI（列表、详情、安装、预览、创建）

---

## 构建配置

### 依赖拆包（19 组）

Vite 对第三方依赖做细粒度拆包，提升 Electron 内嵌 Web 首屏性能与缓存命中率：

`vue` / `ant-design-icons` / `ant-design-vue` / `prosemirror` / `tiptap-extensions` / `tiptap-core` / `codemirror` / `monaco` / `markdown` / `katex` / `vueuse` / `lodash` / `dayjs` / `mermaid` / `cytoscape` / `ai-sdk` / `tiktoken` / `localforage` / `pragmatic-drag`

### 项目配置

| 文件 | 用途 |
|------|------|
| `vite.config.ts` | Vite 构建（别名、组件自动注册、拆包、Rolldown、Less 全局注入） |
| `tsconfig.json` | TypeScript 根配置（strict、noUnusedLocals、noUnusedParameters、paths `@/*`） |
| `tsconfig.node.json` | Vite 端 TS 配置（composite） |
| `electron/tsconfig.json` | Electron 主进程 TS 配置（target ES2022、.mts） |
| `electron-builder.yml` | Electron 打包配置（macOS/Windows/Linux、asar、file associations） |
| `uno.config.ts` | UnoCSS 原子化 CSS（presetWind3 + presetAttributify、rem→px 后处理） |
| `.eslintrc.cjs` | ESLint（airbnb-base + vue3 + typescript） |
| `.stylelintrc.cjs` | Stylelint（recess-order） |
| `prettier.config.cjs` | Prettier（printWidth 160、singleQuote） |
| `index.html` | HTML 入口（内联主题检测脚本，防闪烁） |

---

## 测试体系

运行 `pnpm test` 执行 Vitest 测试套件，`test/` 目录按 `src/` 结构镜像组织，包含 54 个测试文件：

| 测试范围 | 说明 |
|----------|------|
| `components/` | BChat（21）、BColorPicker、BDrawing（3）、BMessage |
| `electron/` | 主进程 lifecycle、mcp/transport、ui（image-preview + menu + model）、updater |
| `hooks/` | useImagePreview |
| `layouts/` | HeaderTabs（结构 + 滚动）、useHelpActive |
| `router/` | drawing 路由 |
| `shared/` | 存储层（files、providers、tool-settings、database） |
| `stores/` | session、headerToolbar |
| `views/` | editor、settings（mcp/oauth + memory）、webview（4）、welcome（2） |

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式（Vite dev server + 主进程 watch + Electron 启动） |
| `pnpm build` | 仅构建前端 |
| `pnpm electron:build-main` | 编译主进程 TypeScript |
| `pnpm electron:build` | 完整打包（前端 + 主进程 + electron-builder） |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm lint` | ESLint 检查 + 自动修复 |
| `pnpm lint:style` | Stylelint 样式检查 + 修复 |
| `pnpm preview` | 预览构建结果 |
| `pnpm speech:dev:*` | 语音运行时开发环境相关命令 |

---

## 文档体系

| 目录 | 内容 |
|------|------|
| `docs/code-wiki/` | 项目代码百科（概述、架构、前端、编辑器、Electron、存储、AI、开发指南、依赖地图，10 篇） |
| `docs/superpowers/plans/` | 技术实现计划（92 篇，按日期组织） |
| `docs/superpowers/specs/` | 设计规范文档（95 篇） |
| `docs/superpowers/reviews/` | 代码审查记录（7 篇） |
| `docs/ai-tools/` | AI 工具系统分析与开发指南 + 6 个任务文档 |
| `docs/web-view/` | WebView 功能设计文档 |
| `docs/development/` | 开发问题与注意事项 |
| `docs/speech/` | 语音功能完整说明 |
| `docs/markdown-symbol-highlight/` | Markdown 符号高亮方案 |
| `changelog/` | 变更日志（按日期 .md，覆盖 2026-03-26 至今，74 篇） |
