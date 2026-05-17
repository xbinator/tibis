# Monaco JSON 编辑器设计

## 背景

Tibis 当前的编辑器体系以 Markdown 为中心：`.md` 文件通过 `BMarkdown` 提供富文本（TipTap）与源码（CodeMirror 6）双模式编辑，编辑页通过 `src/views/editor/drivers/` 做文件类型分流。现状下，非 Markdown 文件没有独立的编辑器实现，`.json` 文件也无法获得更适合结构化文本的源码编辑体验。

用户希望在**复用现有编辑器页与接口层**的前提下，为 `.json` 文件新增 `Monaco Editor` 实现。上层调用方式、文件保存、AI 工具上下文、标签页与路由不应因为内部编辑器替换而发生变化。

## 目标

- 为 `.json` 文件新增基于 `Monaco Editor` 的编辑器实现
- 继续复用现有编辑器页、路由、文件状态与保存流程
- 新编辑器对外保持与现有编辑器一致的实例接口，兼容 `EditorController`
- `.json` 文件自动切换到 `Monaco`，`.md` 文件保持当前 `BMarkdown` 行为不变
- 保留基础源码编辑能力：内容同步、选区读取、插入替换、全文替换、查找、撤销重做、聚焦、失焦事件

## 非目标

- 本次不做 JSON Schema 自动补全、远程 schema 拉取或基于 `$schema` 的动态配置
- 本次不支持除 `.json` 以外的其他文本类型
- 本次不做 diff editor、minimap、高级代码动作、格式化服务接入
- 本次不把 `Monaco` 混入 `BMarkdown` 的 Markdown 富文本/大纲/锚点体系
- 本次不调整编辑页路由、Tab 体系或 AI 工具协议

## 技术选型

| 需求 | 选型 | 理由 |
|------|------|------|
| JSON 源码编辑器 | `monaco-editor` | 提供成熟的文本模型、查找、撤销重做、选区与诊断能力，适合作为未来非 Markdown 文本编辑器的基础设施 |
| 文件类型分流 | 现有 `src/views/editor/drivers` | 当前编辑器页已经支持按文件类型切换驱动，新增 `.json` 驱动的侵入性最小 |
| 对外实例协议 | 复用 `EditorController` | 上层 `useBindings`、`useFileSelection`、AI tool context 都依赖这套接口，保持不变可降低连锁修改 |

## 整体架构

### 设计原则

这次接入不把 `Monaco` 放进 `BMarkdown` 内部，而是新增一个**JSON 专用编辑器组件**并通过 driver 分流接入。原因：

1. `BMarkdown` 明确是 Markdown 编辑器，内部耦合了 TipTap、大纲、锚点、选区工具条等 Markdown 语义
2. `.json` 只需要稳定的源码编辑，不需要 Markdown 专属能力
3. 编辑页已经具备 `driver -> component -> toolContext` 的扩展点，直接复用最稳

### 组件结构

```text
src/views/editor/drivers/
├── index.ts
├── markdown.ts
└── json.ts                    # 新增：JSON 文件驱动

src/components/BEditor/        # 若当前项目实际目录仍为 BMarkdown，则落在等价编辑器目录
└── components/
    └── PaneJsonEditor.vue     # 新增：Monaco JSON 编辑器实现
```

> 说明：用户口头目标是“新增 BEditor 里面使用 Monaco”。如果仓库当前仍以 `BMarkdown` 作为编辑器组件目录，则实现落点保持与现有实际目录一致，但职责上视为 `BEditor` 的 JSON 子实现。

### 数据流

```text
最近文件 / 磁盘文件 -> fileState(ext=json)
         -> resolveEditorDriver(fileState)
         -> jsonDriver.component
         -> PaneJsonEditor(Monaco)
         -> v-model:value 同步 fileState.content
         -> useSession 自动保存 / 保存到磁盘
         -> createToolContext 继续暴露文档与编辑能力给 AI 工具层
```

## 详细设计

### 1. 新增 JSON Driver

新增 `src/views/editor/drivers/json.ts`：

- `id: 'json'`
- `match(file)`：仅匹配 `file.ext === 'json'`
- `component`：指向新的 `PaneJsonEditor`（或一个更上层的 `BEditor` JSON 容器）
- `createToolContext(...)`：复用现有通用文档上下文构造逻辑
- `toolbar.showSearch = true`
- `toolbar.showViewModeToggle = false`
- `toolbar.showOutlineToggle = false`
- `toolbar.showStructuredViewToggle = false`
- `supportsOutline = false`

`src/views/editor/drivers/index.ts` 中注册顺序为 `[jsonDriver, markdownDriver]`，确保 `.json` 优先命中，其他文件仍回退到现有 Markdown 驱动或默认行为。

### 2. 新增 Monaco JSON 编辑组件

新增 `PaneJsonEditor.vue`，职责只做 JSON 文本编辑，不承担文件编排职责。

组件职责：

- 创建/销毁 `Monaco` 编辑器实例
- 根据 `props.editable` 同步只读状态
- 根据 `v-model:value` 同步文本内容
- 在用户编辑时回写 `editorContent`
- 对外暴露与 `EditorController` 等价的实例方法
- 统一转发 `editor-blur`

组件输入：

- `value`：当前文件文本内容
- `editable`：是否可编辑
- `editorState`：当前文件元信息（至少用于后续语言标识、埋点或工具上下文）

组件输出：

- `update:value`
- `editor-blur`
- `defineExpose<EditorController>(...)`

### 3. EditorController 对齐策略

为了保证外层零感知，新组件必须实现现有 `EditorController` 协议。接口映射如下：

| 协议 | Monaco 实现 |
|------|-------------|
| `undo` / `redo` | 调用编辑器 action 或 model undo/redo |
| `canUndo` / `canRedo` | 基于 Monaco 支持的命令能力或本地状态缓存判断 |
| `focusEditor` | `editor.focus()` |
| `focusEditorAtStart` | 设置光标到模型起始位置并聚焦 |
| `setSearchTerm` | 使用 Monaco find controller 设置搜索词 |
| `findNext` / `findPrevious` | 调用 find controller 导航 |
| `clearSearch` | 清空当前搜索词并关闭查找状态 |
| `getSelection` | 从 `editor.getSelection()` + model range 读取文本 |
| `insertAtCursor` | 用当前光标位置执行 `executeEdits` |
| `replaceSelection` | 用当前选区执行 `executeEdits` |
| `replaceDocument` | 整体替换 model 全文 |
| `selectLineRange` | 根据行号构造 range 并选中滚动 |
| `getSearchState` | 最小实现；若 Monaco 无现成公开状态，则返回当前 term 与保守计数 |
| `scrollToAnchor` / `getActiveAnchorId` | JSON 不支持锚点，返回固定空值 / false |

这里有一个关键约束：虽然 JSON 驱动不会使用 Markdown 大纲与锚点，但为了类型兼容，仍然需要实现“空语义”的占位方法，避免上层判空分支扩散。

### 4. 内容同步策略

需要避免外部 `v-model` 更新和编辑器内部变更互相打架。同步规则如下：

1. 首次挂载时，用 `value` 初始化 Monaco model
2. 用户在编辑器中输入时，监听 model content change，回写到 `editorContent`
3. 监听外部 `value` 变化
   - 若外部值与当前 model 文本一致，不处理
   - 若不一致，执行一次受控更新到 model
4. 受控更新时设置内部标记，避免更新监听器把同一次外部同步又回写一遍

这样可以兼容：

- 自动保存后的无差异回写
- 磁盘重载后的外部内容覆盖
- AI 工具执行 `replaceDocument` 后的内容同步

### 5. 查找与工具栏能力

`.json` 文件保留“查找”能力，但不展示 Markdown 专属控制项。

具体表现：

- 编辑页顶部仍使用现有工具栏体系
- JSON driver 声明仅支持 `showSearch`
- `view-mode` 切换按钮对 `.json` 文件隐藏
- 大纲按钮对 `.json` 文件隐藏
- `FindBar` 仍复用现有交互入口，但底层调用改由 `Monaco` 的 `find` 能力完成

### 6. AI 工具上下文兼容

AI 工具层只依赖以下能力：

- 文档内容读取
- 当前选区读取
- 光标插入/替换
- 全文替换

因此 `jsonDriver.createToolContext(...)` 可以沿用现有 `createBaseToolContext` 思路，只要 `PaneJsonEditor` 暴露的实例符合 `EditorController` 即可。这样：

- `read` / `write` 类工具无需针对 JSON 单独分支
- 现有聊天侧边栏、工具权限和确认流程无需改协议
- 后续如果再扩展 `yaml/ts/js`，仍可复用同一套 tool context 模式

### 7. Monaco 集成边界

首次集成仅包含让 JSON 编辑稳定可用的最小配置：

- 语言模式：`json`
- 主题：跟随现有应用明暗主题做基础切换
- 自动布局：开启，适应编辑区尺寸变化
- 只读切换：跟随 `editable`
- 关闭本次不需要的高级能力：如 minimap

本次不接入：

- 自定义 worker 分发优化
- schema diagnostics
- 远程补全源
- 额外右键菜单增强

如果 `monaco-editor` 在 Vite/Electron 环境下需要额外 worker 配置，则把这部分控制在单独的适配文件或组件内部初始化逻辑中，不让业务层感知。

## 错误处理

- Monaco 初始化失败时，组件显示可感知的降级空态，而不是静默白屏
- 若初始化失败，保留最小错误日志，便于在 `logger` 中排查
- 查找、替换、选区读取等接口在实例未就绪时返回安全空值，不抛异常
- 外部传入非法 JSON 文本时，编辑器仍允许展示与编辑，仅依赖 Monaco 自身语法诊断提示错误，不阻断输入

## 测试策略

新增测试以“接口兼容”和“分流正确”为核心：

1. driver 测试
   - `.json` 命中 `jsonDriver`
   - `.md` 仍命中 `markdownDriver`

2. 组件测试
   - 初始值正确写入编辑器
   - 编辑器输入能回写 `v-model:value`
   - 外部值变化能同步到编辑器
   - `editable` 切换能同步只读状态
   - `editor-blur` 能正确向外转发

3. 协议测试
   - `getSelection / replaceSelection / replaceDocument / insertAtCursor` 行为正确
   - `undo / redo / focusEditor / focusEditorAtStart` 可调用
   - `selectLineRange` 对有效行号返回成功，对越界行号返回失败

4. 编辑页集成测试
   - 打开 `.json` 文件时渲染 Monaco 分支
   - JSON 文件隐藏 Markdown 专属工具栏能力

## 风险与取舍

### 风险 1：Monaco 与现有测试环境的兼容性

`Monaco` 在单元测试里通常需要 mock。解决方式是把编辑器实例创建逻辑包在小型适配层里，测试里 mock 这层，而不是直接在每个测试里手搓完整 Monaco API。

### 风险 2：查找状态与现有 `EditorSearchState` 不完全对等

现有接口是围绕 CodeMirror/BMarkdown 设计的，Monaco 的 find controller 未必暴露完全相同的公开状态。第一版允许 `getSearchState` 做最小兼容实现，只保证工具栏与交互不报错；如果后续 UI 需要精确命中数，再补强适配层。

### 风险 3：未来多语言扩展时组件命名可能受限

虽然本次只做 JSON，但若直接命名为 `MonacoJsonEditor`，后续扩展到更多文本类型可能需要再抽象。这里接受短期命名带来的局部重复，优先让第一步清晰落地。

## 实施顺序

1. 安装并接入 `monaco-editor`
2. 新增 `PaneJsonEditor.vue` 与必要的 Monaco 适配辅助
3. 让组件暴露 `EditorController` 兼容接口
4. 新增 `jsonDriver` 并接入编辑器页分流
5. 调整 JSON 文件工具栏能力显示
6. 补齐 driver / 组件 / 集成测试

## 验收标准

- 打开 `.json` 文件时，编辑页渲染 `Monaco` JSON 编辑器
- 保存、自动保存、AI 工具写入仍能正常工作
- 上层无需知道内部编辑器从 CodeMirror 换成了 Monaco
- `.md` 文件行为无回归
- JSON 文件的编辑页不再暴露 Markdown 专属能力
