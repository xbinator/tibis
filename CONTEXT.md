## 项目简介

Tibis 是一款基于 Electron + Vue 3 + TypeScript 的桌面端应用，面向"本地优先"的 Markdown 写作与编辑工作流。项目将 AI 对话侧边栏与编辑器深度集成，支持多 AI 服务商（OpenAI / Anthropic / Google / DeepSeek 等），并提供文件读写、工作区浏览、会话历史、工具调用确认等能力。

## 技术栈概览

| 层级 | 技术选型 |
|------|----------|
| 桌面框架 | Electron 41 |
| 前端框架 | Vue 3.5 + Composition API |
| 构建工具 | Vite 8（使用 Rolldown 拆包） |
| 包管理 | pnpm 10 |
| 状态管理 | Pinia 3 |
| 路由 | Vue Router 5（带 KeepAlive 页面缓存） |
| 富文本编辑器 | TipTap 3（基于 ProseMirror） |
| 源码编辑器 | CodeMirror 6 |
| UI 组件库 | Ant Design Vue 4 + B 系列自研组件 |
| 原子化 CSS | UnoCSS |
| 样式预处理 | Less |
| AI SDK | Vercel AI SDK v6（`ai` 包） |
| 数据库 | better-sqlite3（主进程本地数据库） |
| 安全存储 | electron-store（API Key 等敏感信息加密存储） |
| 图标 | Iconify（`@iconify/vue`） |
| 文件监听 | Chokidar 5 |
| Markdown 渲染 | marked + KaTeX（数学公式）+ Mermaid（图表） |

## 目录结构总览

```
texti/
├── src/                          # 渲染进程（前端 UI）
│   ├── main.ts                   # Vue 应用入口（Pinia + Router + UnoCSS）
│   ├── App.vue                   # 根组件（Antd ConfigProvider 包裹 RouterView）
│   ├── views/
│   │   ├── editor/               # 编辑器页面（核心功能：自动保存、文件监听、会话管理）
│   │   │   ├── hooks/            # useAutoSave / useBindings / useFileSelection / useFileState / useFileWatcher / useSession
│   │   │   └── utils/            # filePath / reconcileFileContent
│   │   ├── settings/
│   │   │   ├── provider/         # AI 服务商管理（列表 + 详情 + 模型配置）
│   │   │   ├── service-model/    # 服务模型配置（Chat / Edit / Summary 等能力分配）
│   │   │   ├── speech/           # 语音设置（运行时管理、语音识别配置）
│   │   │   └── logger/           # 运行日志查看（LogFilterBar + LogTimeline）
│   │   ├── webview/              # 内嵌浏览器页面（AddressBar + useWebView hook）
│   │   ├── welcome/              # 欢迎页
│   │   └── error/                # 404 页面
│   ├── components/               # B 系列通用组件（通过 unplugin-vue-components 全局自动注册）
│   │   ├── BMarkdown/              # Markdown 编辑器（双视图：富文本 TipTap + 源码 CodeMirror）
│   │   ├── BChatSidebar/         # AI 聊天侧边栏（流式对话、工具调用、会话历史、文件引用）
│   │   ├── BPromptEditor/        # 提示词输入框（支持变量插入、文件引用粘贴）
│   │   ├── BPanelSplitter/       # 可拖拽面板分割器
│   │   ├── BSearchRecent/        # 最近文件搜索弹窗
│   │   ├── BModelIcon/           # 30+ AI 模型提供商图标（亮/暗色）
│   │   ├── BModelSelect/         # AI 模型选择器
│   │   ├── BToolbar/             # 工具栏菜单
│   │   ├── BBubble/              # 气泡消息（头像 + 折叠）
│   │   ├── BDropdown/            # 下拉菜单
│   │   ├── BScrollbar/           # 自定义滚动条
│   │   ├── BTruncateText/        # 文本截断
│   │   ├── BImageViewer/         # 图片查看器（含 Carousel 走马灯）
│   │   ├── BUpload/              # 文件上传组件
│   │   └── BButton/BModal/BMessage/BSelect  # 通用 UI 组件
│   ├── constants/
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
│   │   ├── is.ts                 # 类型判断工具
│   │   ├── json.ts               # JSON 解析/序列化
│   │   ├── logger.ts             # 前端日志工具
│   │   ├── modal.tsx             # 模态框 JSX 工具
│   │   ├── namespace.ts          # CSS BEM 命名空间工具
│   │   ├── recentFile.ts         # 最近文件列表操作
│   │   ├── scroll.ts             # 滚动工具
│   │   ├── shortcut.ts           # 快捷键格式化
│   │   └── fileReference/        # 文件引用解析（parseToken, types）
│   ├── ai/tools/                 # AI 工具系统
│   │   └── builtin/              # 内置工具（读写文件、环境查询、设置、ask-user-choice 等）
│   ├── layouts/default/          # 默认布局（Header Tabs + 工具栏 + 聊天侧边栏）
│   │   ├── index.vue             # 布局主组件（标题栏、Tab 栏、RouterView/KeepAlive、侧边栏）
│   │   ├── components/
│   │   │   ├── HeaderTabs.vue    # 顶部标签页栏
│   │   │   └── ShortcutsHelp.vue # 快捷键帮助弹窗
│   │   └── hooks/               # useKeepAlive / useFileActive / useEditActive / useViewActive / useHelpActive / useTabDragger
│   ├── router/                   # 路由配置（聚合 modules/*.ts 子路由）
│   ├── stores/                   # Pinia 状态管理
│   │   ├── chat.ts               # 聊天会话管理
│   │   ├── editorFileWatch.ts    # 编辑器文件监听（路径→文件ID 映射）
│   │   ├── files.ts              # 文件状态
│   │   ├── fileSelectionIntent.ts # 文件选区意图（行范围导航跳转）
│   │   ├── provider.ts           # AI 提供商配置
│   │   ├── serviceModel.ts       # 服务模型配置（Chat/Edit 等能力绑定）
│   │   ├── setting.ts            # 应用设置
│   │   └── tabs.ts               # 标签页管理
│   ├── shared/
│   │   ├── platform/             # Electron/Web 平台能力抽象层（electronAPI 读取）
│   │   ├── storage/              # 本地存储适配（chats / files / providers / service-models）
│   │   ├── chat/                 # 聊天共享工具（文件引用事件桥接）
│   │   └── logger/               # 日志共享类型与工具
│   ├── hooks/                    # 全局组合式函数
│   │   ├── useAntdTheme.ts       # Ant Design 明暗主题计算（暗色/亮色算法 + 自定义 token）
│   │   ├── useAutoCollapse.ts    # 容器宽度不足时自动折叠（ResizeObserver）
│   │   ├── useChat.ts            # AI 流式聊天（invoke/stream/abort，含 provider 解析）
│   │   ├── useClipboard.ts       # 剪贴板操作封装（含成功 Toast 提示）
│   │   ├── useMenuAction.ts      # 系统菜单动作注册（文件/编辑/视图/主题等）
│   │   ├── useNavigate.ts        # 统一导航（链接点击 / 文件打开 / 行范围跳转）
│   │   ├── useOpenFile.ts        # 统一文件打开（按 ID / 路径 / 原生对话框 / 新建）
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
│   │       ├── ai/               # AI 服务（多 Provider、流式/非流式调用、工具调用适配、错误处理）
│   │       ├── database/         # SQLite 数据库操作（execute / select）
│   │       ├── store/            # 安全加密存储（electron-store）
│   │       ├── file/             # 文件读写 + 工作区监听
│   │       ├── logger/           # 日志系统（文件 + 控制台 + 维护定时器）
│   │       ├── menu/             # 系统菜单（跨平台）
│   │       ├── webview/          # WebView 管理（内嵌浏览器）
│   │       ├── shell/            # 系统 Shell 操作（回收站、外部链接、相对路径）
│   │       ├── dialog/           # 原生对话框（打开/保存文件）
│   │       ├── window/           # 窗口控制（最小化/最大化/全屏/标题）
│   │       ├── image/            # 图片处理（压缩、格式转换）
│   │       ├── speech/           # 语音服务（运行时安装、录音、识别）
│   │       └── shortcuts/        # 系统快捷入口（Dock/Taskbar 最近文件）
│   └── preload/
│       ├── index.mts             # contextBridge 安全暴露 electronAPI 到渲染进程
│       ├── error-collector.mts   # 全局错误收集 preload
│       └── webview.mts           # WebView 页面 preload
│
├── docs/                         # 项目文档
│   ├── code-wiki/                # 代码百科（架构/前端/编辑器/Electron/存储/AI/开发指南）
│   └── superpowers/              # 技术方案与设计文档（plan + spec，按日期组织）
├── changelog/                    # 变更日志（按日期，每日记录）
├── types/                        # 全局 TypeScript 类型声明
└── resources/                    # 应用图标资源（app.icns / app.png / app.ico）
```

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    渲染进程 (Vue 3)                          │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐              │
│  │  Editor   │  │ BChatSidebar│  │  Settings  │              │
│  │ (BMarkdown) │  │ (AI聊天)   │  │ (服务商配置)│              │
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
2. **AI 聊天**：渲染进程 → `electronAPI.aiStream` → IPC → 主进程 AI 服务 → Vercel AI SDK → 外部 API → 流式回传（text/thinking/tool-call/finish/error 事件）
3. **数据持久化**：渲染进程 → `electronAPI.dbExecute/dbSelect` → IPC → 主进程 better-sqlite3

## 应用启动与进程边界

### 主进程启动流程

1. **获取启动快捷入口动作** → 2. **初始化日志（控制台）** → 3. **清理过期日志** → 4. **启动日志维护定时器** → 5. **初始化 store** → 6. **初始化数据库** → 7. **注册全部 IPC handler** → 8. **设置系统菜单** → 9. **刷新平台快捷入口** → 10. **创建窗口** → 11. **处理启动时的快捷动作**

关键入口：[electron/main/index.mts](./electron/main/index.mts#L63-L87)

### 窗口创建

- 无边框窗口（`frame: false`），macOS 使用 `titleBarStyle: 'hidden'` + 自定义红绿灯位置
- 预加载脚本注入，`contextIsolation: true`，`nodeIntegration: false`
- 开发环境加载 Vite dev server 并打开 DevTools，生产环境加载打包后的 index.html
- 关键入口：[electron/main/window.mts](./electron/main/window.mts#L46-L83)

### 渲染进程入口

- 创建 Vue 应用 → 注册 Pinia → 注册 Router → 挂载到 #app
- 全局引入 UnoCSS 虚拟模块、Ant Design 重置样式、Less 全局样式
- 关键入口：[src/main.ts](./src/main.ts#L1-L16)

### 安全通信边界

- 所有渲染层对系统能力的访问都通过 `window.electronAPI`
- preload 通过 `contextBridge.exposeInMainWorld` 暴露 API，每个方法对应一个 `ipcRenderer.invoke`
- 渲染侧通过 `src/shared/platform/electron-api.ts` 的类型安全封装读取：[electron-api.ts](./src/shared/platform/electron-api.ts#L14-L26)
- preload API 总览：[electron/preload/index.mts](./electron/preload/index.mts#L25-L283)

## IPC 模块化组织

主进程按"领域模块"拆分，每个模块提供 `ipc.mts` 注册各自的 handler，在总入口统一注册：[modules/index.mts](./electron/main/modules/index.mts#L13-L26)

已注册的 IPC 模块（13 个）：
- `dialog`：文件对话框（打开/保存）
- `file`：文件读写、工作区目录读取、文件变更监听（Chokidar）
- `window`：窗口控制（最小化/最大化/全屏/标题设置）
- `database`：SQLite 执行与查询
- `store`：安全存储（electron-store）
- `shell`：系统 Shell（回收站、外部链接打开、相对路径计算）
- `ai`：AI 流式/非流式调用、流式中止
- `logger`：日志记录与查询（控制台 + 文件）
- `menu`：系统菜单动作派发与菜单项更新
- `shortcuts`：系统快捷入口（Dock/Taskbar 最近文件同步）
- `webview`：内嵌 WebView 管理
- `image`：图片压缩与格式转换
- `speech`：语音运行时管理（安装、录音、语音识别）

## 路由与 Tab/KeepAlive 机制

### 路由结构

| 路径 | 页面 | 说明 |
|------|------|------|
| `/welcome` | 欢迎页 | 入口页面（隐藏 Tab） |
| `/editor/:id` | 编辑器 | 核心 Markdown 编辑页面 |
| `/settings/provider` | AI 服务商列表 | 管理 AI Provider（API Key、Base URL 等） |
| `/settings/provider/:provider` | 服务商详情 | 配置单个 Provider 的模型列表 |
| `/settings/service-model` | 服务模型 | 管理 AI 能力（Chat / Edit / Summary 等） |
| `/settings/speech` | 语音设置 | 管理语音运行时和识别配置 |
| `/settings/logger` | 运行日志 | 查看系统运行日志 |
| `/webview` | 网页浏览 | 内嵌浏览器 |

路由入口将 `routes/modules/*.ts` 通过 `import.meta.glob` 聚合为子路由，然后挂到默认布局下：[routes/index.ts](./src/router/routes/index.ts#L7-L21)

### Tab 管理

`router.afterEach` 会根据路由 meta 设置窗口标题，并把"可展示的页面"同步到 tabs store：[router/index.ts](./src/router/index.ts#L16-L34)

页面是否出现在顶部 Tab 取决于 route meta 的 `hideTab` 标记以及 `resolveRouteTabInfo` 的 tabId/cacheKey 规则。

## 存储层与数据落地策略

渲染侧把各类持久化能力集中在 `src/shared/storage/*`，由统一出口 re-export：[storage/index.ts](./src/shared/storage/index.ts#L1-L4)

存储子模块：
- `chats/`：聊天会话与消息的 SQLite 持久化
- `chat-compression-records/`：聊天上下文压缩记录的存储与查询
- `files/`：最近打开文件列表（recent.ts）
- `providers/`：AI 提供商与模型配置（含默认值 defaults.ts）
- `service-models/`：服务模型配置（Chat / Edit / Summary 等能力绑定）
- `base/`：通用 KV 存储抽象层（BaseStorage 类，支持 TTL、合并策略、自毁标记）
- `utils/`：数据库连接管理（含初始化竞态重试）、JSON 序列化工具

底层通过 `electronAPI.dbExecute/dbSelect` 走主进程 better-sqlite3，确保 schema 统一与迁移可控。

Chat 侧边栏读取当前聊天使用的服务模型也走这里：[BChatSidebar 使用 serviceModelsStorage](./src/components/BChatSidebar/index.vue#L76-L166)

## AI 工具系统

### 工具定义

渲染侧工具定义集中在 `src/ai/tools`，其中 `builtin` 是内置工具集合，`tools/` 目录下是核心基础设施：
- `confirmation.ts` — 用户确认适配器接口（confirm、执行生命周期回调）
- `editor-context.ts` — 编辑器上下文注册表（register/getCurrentContext/getContext）
- `permission.ts` — 权限执行引擎（支持 readonly/ask/autoSafe 模式，检查权限授予）
- `policy.ts` — 模型工具支持策略、默认工具集选择
- `results.ts` — 工具结果工厂函数（success/failure/cancelled/awaitingUserInput）
- `stream.ts` — 工具流式执行适配（toTransportTools、executeToolCall、createToolResultMessages）

**builtin 内置工具（9 个）**：
- `read.ts` — 读取当前编辑器文档内容
- `write.ts` — 编辑操作（插入光标、替换选区、替换全文）
- `read-file.ts` — 读取本地文件 + 列出目录
- `ask-user-choice.ts` — 向用户提问（多选/单选）
- `catalog.ts` — 工具清单与权限分类（只读/可写/危险）
- `environment.ts` — 环境信息查询
- `settings.ts` — 设置读写
- `logs.ts` — 查询应用运行日志
- `index.ts` — 统一工厂函数 `createBuiltinTools`

### 工具初始化流程

Chat Sidebar 初始化工具时：
1. 调用 `createBuiltinTools` 创建内置工具实例，挂上"确认适配器"和"pending question"查询
2. 按策略过滤只开放低风险默认工具（避免默认暴露替换类操作）
3. 将工具列表传给 `useChatStream`

[BChatSidebar tools 构建](./src/components/BChatSidebar/index.vue#L167-L186)

### 工具上下文

编辑器上下文（当前编辑的文档、选区等）由 `editorToolContextRegistry.getCurrentContext` 提供给 chat stream，确保工具调用能正确操作当前文档：[BChatSidebar chatStream 初始化](./src/components/BChatSidebar/index.vue#L257-L266)

## 聊天确认与用户选择

### 确认机制

`confirmationController` 管理工具调用需要用户确认的流程，通过 adapter 注入到工具系统。用户可选：
- `approve` — 单次批准
- `approve-session` — 会话内批准
- `approve-always` — 始终批准
- `cancel` — 取消操作

[BChatSidebar confirmationController](./src/components/BChatSidebar/index.vue#L125-L202)

### Ask User Choice

"向用户提问"这类交互会产生 pending 状态，影响自动命名触发判断（避免用户还没答完就自动生成会话标题）：[useAutoName 的 pending 判断](./src/components/BChatSidebar/index.vue#L130-L151)

## 编辑器与聊天联动（文件引用）

Chat 输入支持插入 `{{file-ref:id|fileName|startLine|endLine}}` 格式的 token：
- 支持粘贴/拖拽文件自动生成 file-ref：[onPasteFiles](./src/components/BChatSidebar/index.vue#L87-L95)
- 来自编辑器侧的"插入文件引用"事件通过 `onChatFileReferenceInsert` 共享事件桥接进来：[handleFileReferenceInsert](./src/components/BChatSidebar/index.vue#L350-L368)

流程：编辑器选中文本 → 触发文件引用事件 → 侧边栏打开 → 插入 token 到输入框 → 自动聚焦

## 前端构建与组件自动注册

### unplugin-vue-components 自动注册

- 限定在 `src/components` 及若干子目录（`BChat/BPanelSplitter/BPromptEditor/BMarkdown` 等），目录作为 namespace
- 解析器使用 `AntDesignVueResolver({ importStyle: false })`
- B 开头组件无需手动 import，全局可用

[vite.config.ts 组件注册配置](./vite.config.ts#L91-L107)

### 依赖拆包分组

对第三方依赖做了细粒度拆包，提升 Electron 内嵌 Web 的首屏性能与缓存命中率：
- `vue` — vue/vue-router/pinia
- `ant-design-icons` / `ant-design-vue`
- `prosemirror` — ProseMirror 核心
- `tiptap-extensions` / `tiptap-core`
- `codemirror` — CodeMirror + Lezer
- `markdown` — marked/js-yaml/lowlight
- `katex` / `vueuse` / `lodash` / `dayjs`

[VENDOR_CHUNK_GROUPS](./vite.config.ts#L34-L89)

## B 系列组件体系

项目采用 `unplugin-vue-components` 实现 B 系列组件的全局自动注册，命名规范为 `B` + 功能名：

| 组件 | 功能 |
|------|------|
| `BMarkdown` | Markdown 双视图编辑器（富文本 TipTap + 源码 CodeMirror） |
| `BChatSidebar` | AI 聊天侧边栏（对话流、工具调用、文件引用） |
| `BPromptEditor` | 提示词输入编辑器（支持变量插入、file-ref 粘贴） |
| `BPanelSplitter` | 可拖拽面板分割器 |
| `BSearchRecent` | 最近文件搜索弹窗 |
| `BButton / BModal / BMessage / BSelect` | 通用 UI 组件 |
| `BDropdown` | 下拉菜单（Button + Menu 子组件） |
| `BModelIcon` | AI 模型图标展示（30+ 提供商，亮/暗色） |
| `BModelSelect` | AI 模型选择器下拉框 |
| `BToolbar` | 工具栏菜单（文件/编辑/视图/帮助） |
| `BBubble` | 气泡消息（Avatar + Loading + 折叠） |
| `BTruncateText` | 文本截断 |
| `BScrollbar` | 自定义滚动条 |
| `BImageViewer` | 图片查看器（含 Carousel 走马灯子组件） |
| `BUpload` | 文件上传组件 |

## 项目配置文件

| 文件 | 用途 |
|------|------|
| `vite.config.ts` | Vite 构建配置（组件自动注册、依赖拆包、别名） |
| `vitest.config.ts` | Vitest 测试配置 |
| `uno.config.ts` | UnoCSS 原子化 CSS 配置 |
| `electron-builder.yml` | Electron 打包与分发配置 |
| `tsconfig.json` | TypeScript 根配置 |
| `tsconfig.node.json` | Node/Electron 端 TypeScript 配置 |
| `electron/tsconfig.json` | Electron 主进程专用 TS 配置 |
| `package.json` | 依赖与脚本（pnpm 10） |
| `pnpm-lock.yaml` | 依赖锁定文件 |
| `index.html` | Vite HTML 入口 |
| `.editorconfig` | 编辑器统一配置 |
| `.env` | 环境变量 |
| `.eslintrc.cjs` / `.eslintignore` | ESLint 配置与忽略规则 |
| `.stylelintrc.cjs` | Stylelint 样式检查配置 |
| `prettier.config.cjs` | Prettier 格式化配置 |
| `.npmrc` | npm/pnpm 配置 |
| `.gitignore` | Git 忽略规则 |

## 测试体系

项目使用 Vitest 作为测试框架，test/ 目录包含约 115 个测试文件，覆盖以下层级：

- **组件测试**：BMarkdown、BChatSidebar、BPromptEditor、BBubble 等 B 系列组件
- **Store 测试**：Pinia 状态管理单元测试
- **Hook 测试**：组合式函数测试
- **Electron 测试**：主进程模块与服务测试
- **AI 工具测试**：内置工具正确性与权限策略验证

运行 `pnpm test` 执行完整测试套件。

## 文档体系

| 目录 | 内容 |
|------|------|
| `docs/code-wiki/` | 项目代码百科（概述、架构、前端、编辑器、Electron、存储、AI、开发指南、依赖地图） |
| `docs/superpowers/plans/` | 技术实现计划（36 个，按日期 `YYYY-MM-DD-<主题>.md` 组织） |
| `docs/superpowers/specs/` | 设计规范文档（42 个，与 plans 对称组织） |
| `docs/ai-tools/` | AI 工具系统分析与开发指南（含 tasks 任务分解） |
| `docs/web-view/` | WebView 功能设计文档 |
| `docs/development/` | 开发问题与注意事项（如原生模块版本问题） |
| `docs/markdown-symbol-highlight/` | Markdown 符号高亮方案 |
| `docs/speech/` | 语音功能说明 |
| `changelog/` | 变更日志（按日期 `.md` 每日记录，覆盖 2026-03-26 至今） |

## 全局类型与脚本

- **`types/`**（根目录）：全局 `.d.ts` 类型声明文件，定义 `AI`、`Chat`、`Model`、`ElectronAPI` 等跨模块共享类型接口
- **`scripts/speech/`**：语音运行时脚本（`dev-runtime.mjs` 开发环境、`manifest-tool.mjs` 清单工具）
- **`.dev-resources/`**：语音运行时二进制文件
- **`resources/`**：应用图标（`app.icns`、`app.png`）和语音清单（`speech/manifest.json`）
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
