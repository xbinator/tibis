# 2026-05-18 BEditor Unification Design

## 背景

当前编辑器入口能力分散在多个层级：

- `src/views/editor/index.vue` 负责根据文件状态选择 driver。
- `src/components/BMarkdown` 承担 Markdown 编辑器入口、富文本/源码双模式编排，以及部分公共交互层。
- `src/components/BEditor` 当前仅承载 Monaco/JSON 分支，尚未成为统一编辑器入口。

这种结构已经具备“统一接口”的雏形，但统一入口仍停留在页面层，而不是组件层。后续继续扩展文件类型、统一交互能力或清理工具上下文时，页面、driver、组件三层职责会继续耦合。

本设计的目标是把编辑器能力和入口统一收口到 `BEditor`，彻底移除 `BMarkdown` 的组件边界和目录组织语义，将其全部实现直接并入 `BEditor` 体系，并把 Monaco 实现拆为更底层的实现模块。

## 目标

本次重构聚焦以下目标：

1. 页面层只感知 `BEditor`，不再承担编辑器兼容判断。
2. `BEditor` 成为唯一编辑器入口和唯一类型出口。
3. `BEditor` 根据 `fileState.ext` 选择 Markdown 或 Monaco 实现。
4. 统一对外暴露编辑器能力接口，覆盖：
   - `undo/redo`
   - 聚焦
   - 查找
   - 选区读取
   - 插入 / 替换
   - 整篇替换
   - 按行选中
   - 选区工具栏
   - AI 改写入口
   - 引用插入
   - 搜索高亮相关交互
5. `BMarkdown` 不再作为独立组件边界或独立组织域存在，其实现全部直接迁入 `BEditor` 域内。

## 非目标

本次重构不处理以下内容：

- 不统一底层编辑器技术栈。Markdown 仍可继续使用 TipTap / CodeMirror，代码类文本继续使用 Monaco。
- 不将 Markdown 专属的大纲、锚点、当前标题定位纳入统一编辑器协议。
- 不在本轮引入新的 `lang` 字段，文件类型分流仍以 `fileState.ext` 为准。
- 不在本轮重新设计 Markdown 的 rich/source 模式产品交互，仅迁移并重组职责边界。

## 总体方案

### 方案概述

将 `BEditor` 升级为编辑器域的唯一根组件，负责：

- 接收 `EditorState`
- 根据 `fileState.ext` 解析编辑器实现类型
- 挂载具体实现
- 宿主公共交互层
- 对外暴露统一 `EditorController`
- 统一注册工具上下文

`BMarkdown` 不再保留独立外壳，也不保留一套等价的独立目录组织，而是将其现有的 `components/hooks/adapters/extensions/utils` 直接按职责并入 `BEditor` 的公共目录结构。

`BEditor` 当前的 Monaco 分支进一步下沉为独立的 `BMonaco` 组件，使统一入口和底层实现职责解耦。

### 推荐目录结构

```text
src/components/BMonaco/
├── index.vue
└── utils/
    └── createMonacoEditor.ts

src/components/BEditor/
├── index.vue
├── types.ts
├── constants/
│   └── resolver.ts
├── hooks/
│   ├── useEditorController.ts
│   ├── useEditorResolver.ts
│   └── useEditorToolContext.ts
│   ├── useMarkdownContent.ts
│   ├── useMarkdownExtensions.ts
│   └── useMarkdownSelectionAssistant.ts
├── shared/
│   ├── FindBar.vue
│   ├── QuickActions.vue
│   ├── SelectionAIInput.vue
│   ├── SelectionToolbar/
│   └── selectionAssistant/
├── panes/
│   ├── PaneMarkdownRich.vue
│   └── PaneMarkdownSource.vue
├── adapters/
│   ├── editorController.ts
│   ├── selectionAssistant.ts
│   ├── richSelectionAssistant.ts
│   ├── sourceSelectionAssistant.ts
│   ├── sourceEditorSearch.ts
│   └── ...
├── extensions/
│   ├── editorSearch.ts
│   ├── aiRangeHighlight.ts
│   ├── editorDecorations.ts
│   └── ...
└── utils/
    ├── editorMarkdown.ts
    └── ...
```

该结构强调两件事：`BEditor` 内部不再保留一套“Markdown 子系统”外壳；Monaco 低层实现则单独抽为 `BMonaco`，由 `BEditor` 统一调度。

## 统一入口设计

### 页面层职责

`src/views/editor/index.vue` 未来只负责：

- 获取 `fileState`
- 绑定页面级 session、shortcut、selection 等业务 hook
- 挂载 `BEditor`

页面层不再直接调用：

- `resolveEditorDriver`
- 动态 `<component :is="...">`
- 基于不同 driver 的兼容判断

### BEditor 入口职责

`src/components/BEditor/index.vue` 负责：

1. 接收统一 `EditorState`
2. 根据 `fileState.ext` 解析实现类型
3. 渲染 Markdown 或 Monaco 实现组件
4. 宿主公共 UI：
   - `FindBar`
   - `QuickActions`
   - 选区工具栏
   - AI 改写输入层
5. 统一向外转发公共事件：
   - `editor-blur`
   - `rename-file`
   - `save`
   - `save-as`
   - `copy-path`
   - `show-in-folder`
6. 向外暴露统一 `EditorController`
7. 统一提供工具上下文出口

## 文件类型分流设计

### 分流依据

文件类型解析统一使用 `fileState.ext`，不新增 `lang` 字段。

### 初始映射规则

第一阶段建议在 `src/components/BEditor/constants/resolver.ts` 中维护静态映射：

- `md`、`markdown` -> `markdown`
- `json` -> `monaco`
- 其他后续需要 Monaco 的扩展名在同一处扩展

### 设计原则

- 页面层不再关心文件类型兼容逻辑。
- 具体实现选择逻辑只允许出现在 `BEditor` 内部。
- 后续新增扩展名只改 resolver，不改页面层。

## 统一类型设计

### 统一类型出口

所有编辑器域公共类型统一迁移到 `src/components/BEditor/types.ts`，作为后续唯一出口。

### 核心状态

```ts
export interface EditorState {
  content: string
  name: string
  path: string | null
  id: string
  ext: string
}
```

### 核心能力接口

```ts
export interface EditorSearchState {
  currentIndex: number
  matchCount: number
  term: string
}

export interface EditorSelection {
  from: number
  to: number
  text: string
}

export interface EditorController {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  focusEditor: () => void
  focusEditorAtStart: () => void
  setSearchTerm: (term: string) => void
  findNext: () => void
  findPrevious: () => void
  clearSearch: () => void
  getSelection: () => EditorSelection | null
  insertAtCursor: (content: string) => Promise<void>
  replaceSelection: (content: string) => Promise<void>
  replaceDocument: (content: string) => Promise<void>
  selectLineRange: (startLine: number, endLine: number) => boolean | Promise<boolean>
  getSearchState: () => EditorSearchState
}
```

### 交互层统一原则

选区工具栏、AI 改写入口、引用插入、搜索高亮等交互，不再由 Markdown 或 Monaco 外壳分别持有，而由 `BEditor` 宿主统一编排。

底层实现负责：

- 返回选区
- 执行替换 / 插入
- 提供搜索状态
- 提供交互定位所需的底层能力

宿主层负责：

- 是否显示工具栏
- 何时打开 AI 输入层
- 调用引用插入动作
- 控制搜索展示与状态同步

## 实现层设计

### Markdown 实现

`BMarkdown` 现有能力不再迁移成一个等价的 `markdown` 子域，而是直接拆散后并入 `BEditor`。

迁移范围包括：

- 富文本 pane
- 源码 pane
- front matter 处理
- Markdown 专属 hooks
- selection assistant 适配
- extensions
- adapters
- Markdown utils

Markdown 仍保留 rich/source 双模式，但模式编排的公共宿主职责从原 `BMarkdown` 壳层上提到 `BEditor` 体系，并以 `BEditor` 的统一目录结构承载。

### Monaco 实现

当前 `BEditor` 的 Monaco 分支迁移为独立的 `src/components/BMonaco/index.vue` 与 `src/components/BMonaco/utils/createMonacoEditor.ts`。

Monaco 实现负责：

- 编辑器初始化与释放
- 语言和主题配置
- 搜索、高亮、查找切换
- 统一实现 `EditorController`

Monaco 不再承担统一入口职责，只作为 `BEditor` 选择的一种底层实现。`BEditor` 命中代码类文本时直接渲染 `BMonaco`。

## 工具上下文设计

当前页面层通过 `resolveEditorDriver(fileState).createToolContext(...)` 注册编辑器工具上下文。

统一入口后，这部分不应继续停留在页面层。建议新增 `useEditorToolContext`，由 `BEditor` 负责：

- 基于当前实现提供标准化工具上下文
- 向外暴露统一工具上下文接口
- 在实现切换时处理注册与注销

页面层只需与 `BEditor` 提供的统一上下文能力对接，不再感知 driver。

## 迁移计划

### 阶段一：建立新边界

目标：先建立 `BEditor` 新目录和统一类型出口，不改现有行为。

内容：

- 新建 `src/components/BEditor/types.ts`
- 新建 `src/components/BEditor/constants/resolver.ts`
- 新建 `src/components/BEditor/hooks/useEditorResolver.ts`
- 补齐未来结构目录

### 阶段二：抽离 Monaco 实现

目标：把当前 `BEditor` 中 Monaco 实现降为底层模块。

内容：

- 创建 `src/components/BMonaco/index.vue`
- 将 `PaneMonacoEditor.vue` 重构为 `BMonaco`
- 将 `createMonacoEditor.ts` 迁入 `src/components/BMonaco/utils`
- 让 `BEditor/index.vue` 成为统一入口壳层

### 阶段三：迁移 Markdown 实现

目标：移除 `BMarkdown` 组件边界，保留其内部实现能力。

内容：

- 将 `src/components/BMarkdown/components/*` 按职责拆分迁入 `BEditor/panes` 与 `BEditor/shared`
- 将 `src/components/BMarkdown/hooks/*` 迁入 `BEditor/hooks`
- 将 `src/components/BMarkdown/adapters/*` 迁入 `BEditor/adapters`
- 将 `src/components/BMarkdown/extensions/*` 迁入 `BEditor/extensions`
- 将 `src/components/BMarkdown/utils/*` 迁入 `BEditor/utils`

本阶段以“消除 `BMarkdown` 组织、保持行为”为主，避免在迁移中顺带大改产品逻辑。

### 阶段四：上提共享交互层

目标：把共用交互能力沉淀为 `BEditor` 宿主能力。

内容：

- 提取公共 `FindBar`
- 提取公共 `SelectionAIInput`
- 提取公共 `SelectionToolbar`
- 提取公共引用插入编排
- 收口搜索高亮相关宿主逻辑

这一步完成后，Markdown 和 Monaco 只保留实现层能力，公共交互由 `BEditor` 宿主管理。

### 阶段五：替换页面入口并清理旧代码

目标：页面层只保留 `BEditor`。

内容：

- 修改 `src/views/editor/index.vue`，固定渲染 `BEditor`
- 移除 `resolveEditorDriver`
- 移除页面层对不同实现的兼容判断
- 删除 `BMarkdown` 目录及其出口
- 清理旧类型出口和旧引用路径

## 风险与应对

### 风险一：引用路径迁移范围大

`BMarkdown` 内部存在大量 `hooks/adapters/extensions` 相互引用，迁移路径修改会比较密集。

应对：

- 第一阶段先建立稳定的新类型出口
- 分批迁移目录，避免一次性大改所有 import
- 每阶段完成后运行类型检查

### 风险二：交互层职责拆分不彻底

如果只搬文件、不上提交互宿主，最终会形成“新目录下的旧分叉”。

应对：

- 明确 `BEditor` 是交互宿主
- 实现层只提供能力，不重复持有完整交互壳子

### 风险三：页面层虽然只挂 `BEditor`，但仍保留 driver 概念

如果 `createToolContext` 等逻辑不一起收口，页面仍会隐式依赖旧模型。

应对：

- 同步规划 `useEditorToolContext`
- 在入口替换阶段一并移除 driver 依赖

## 验证策略

每个阶段至少执行以下验证：

1. TypeScript 类型检查通过
2. ESLint 检查通过
3. Markdown 文件可正常进入 rich/source 模式
4. JSON 文件可正常通过 Monaco 打开和编辑
5. 以下能力在迁移后行为保持：
   - `undo/redo`
   - 查找与搜索高亮
   - 选区读取
   - 插入 / 替换
   - 整篇替换
   - 按行选中
   - AI 改写入口
   - 引用插入

## 决策结论

最终采用以下方案：

- `BEditor` 作为唯一统一入口
- 文件类型分流依据 `fileState.ext`
- `BMarkdown` 组件边界与组织语义一并取消，能力全部并入 `BEditor`
- Monaco 作为 `BEditor` 下的更底层实现
- 页面层的兼容判断和 driver 逻辑迁出，统一收口到 `BEditor`

该方案在不强行统一底层编辑器技术栈的前提下，最大化统一了入口、能力协议和交互宿主，适合作为后续编辑器域持续演进的基础结构。
