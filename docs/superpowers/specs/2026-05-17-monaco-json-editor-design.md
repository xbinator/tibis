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
└── editor.ts                  # 新增：Monaco 通用编辑驱动（首期仅支持 JSON）

src/components/BEditor/        # 若当前项目实际目录仍为 BMarkdown，则落在等价编辑器目录
├── components/
│   └── PaneJsonEditor.vue     # 新增：Monaco JSON 编辑器实现
└── utils/
    └── createMonacoEditor.ts  # 新增：Monaco 实例创建适配层，供组件与测试复用
```

> 说明：用户口头目标是“新增 BEditor 里面使用 Monaco”。如果仓库当前仍以 `BMarkdown` 作为编辑器组件目录，则实现落点保持与现有实际目录一致，但职责上视为 `BEditor` 的 JSON 子实现。

### 数据流

```text
最近文件 / 磁盘文件 -> fileState(ext=json)
         -> resolveEditorDriver(fileState)
         -> editorDriver.component
         -> PaneJsonEditor(Monaco)
         -> v-model:value 同步 fileState.content
         -> useSession 自动保存 / 保存到磁盘
         -> createToolContext 继续暴露文档与编辑能力给 AI 工具层
```

## 详细设计

### 1. 新增 Monaco 文本 Driver

新增 `src/views/editor/drivers/editor.ts`：

- `id: 'editor'`
- `match(file)`：首期仅匹配 `file.ext === 'json'`
- `component`：指向新的 `PaneJsonEditor`（后续如支持多语言，可演进为更通用的 `PaneCodeEditor`）
- `createToolContext(...)`：复用现有通用文档上下文构造逻辑
- `resolveLanguage(file)`：首期返回 `json`，后续可扩展 `yaml`、`javascript`、`typescript` 等语言映射
- `toolbar.showSearch = true`
- `toolbar.showViewModeToggle = false`
- `toolbar.showOutlineToggle = false`
- `toolbar.showStructuredViewToggle = false`
- `supportsOutline = false`

`src/views/editor/drivers/index.ts` 中注册顺序为 `[editorDriver, markdownDriver]`，确保首期 `.json` 优先命中，其他文件仍回退到现有 Markdown 驱动或默认行为。这里依赖当前 `resolveEditorDriver(fileState)` 的实现语义：调用 `editorDrivers.find(...)`，命中第一个 `match(fileState) === true` 的 driver 后立即返回。

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

当前接口定义位于 [src/components/BMarkdown/adapters/types.ts](src/components/BMarkdown/adapters/types.ts)，精简版如下：

```ts
interface EditorSearchState {
  currentIndex: number;
  matchCount: number;
  term: string;
}

interface EditorSelection {
  from: number;
  to: number;
  text: string;
}

interface EditorController {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  focusEditor: () => void;
  focusEditorAtStart: () => void;
  setSearchTerm: (term: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearSearch: () => void;
  getSelection: () => EditorSelection | null;
  insertAtCursor: (content: string) => Promise<void>;
  replaceSelection: (content: string) => Promise<void>;
  replaceDocument: (content: string) => Promise<void>;
  selectLineRange: (startLine: number, endLine: number) => boolean | Promise<boolean>;
  getSearchState: () => EditorSearchState;
  scrollToAnchor: (anchorId: string) => boolean;
  getActiveAnchorId: (scrollContainer: HTMLElement, thresholdPx: number) => string;
}
```

为了保证外层零感知，新组件必须实现现有 `EditorController` 协议。接口映射如下：

| 协议 | Monaco 实现 |
|------|-------------|
| `undo` / `redo` | 调用编辑器 action 或 model undo/redo |
| `canUndo` / `canRedo` | 实施前先核实 Monaco 公开 API；若无稳定公开状态，第一版通过适配层维护保守可用状态 |
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

这里有一个关键约束：虽然首期 `.json` 不会使用 Markdown 大纲与锚点，但为了类型兼容，仍然需要实现“空语义”的占位方法，避免上层判空分支扩散。

### 4. 内容同步策略

需要避免外部 `v-model` 更新和编辑器内部变更互相打架。同步规则如下：

1. 首次挂载时，用 `value` 初始化 Monaco model
2. 用户在编辑器中输入时，监听 model content change，回写到 `editorContent`
3. 监听外部 `value` 变化
   - 若外部值与当前 model 文本一致，不处理
   - 若不一致，执行一次受控更新到 model
4. 受控更新时使用**同步生命周期的忽略标记**，避免更新监听器把同一次外部同步又回写一遍

标记约定如下：

- 在调用 `model.setValue(...)` 前设置 `ignoreModelChange = true`
- `setValue(...)` 返回后立即恢复 `ignoreModelChange = false`
- `onDidChangeModelContent` 内部首先检查该标记；若为 `true`，直接跳过本次回写

这里不使用 `nextTick`、微任务或异步清理，避免在 `Monaco` 同步触发的变更回调中出现竞态窗口

这样可以兼容：

- 自动保存后的无差异回写
- 磁盘重载后的外部内容覆盖
- AI 工具执行 `replaceDocument` 后的内容同步

关于高频输入的取舍：

- `onDidChangeModelContent` 仍然按实际变更逐次回写 `editorContent`
- 编辑器层**不对内容回写做 debounce**
- 原因是 debounce 会让外层状态滞后，容易影响撤销语义、脏状态判断、AI 工具读取当前文本的一致性
- 如果字符计数、保存状态提示、自动保存等上层副作用存在性能压力，应由这些副作用各自做节流、去重或延迟处理，而不是在编辑器内容源头做模糊同步

### 5. 大文件场景约束

JSON 文件可能远大于普通配置文件，因此首版需要明确性能边界：

- `replaceDocument` 只有在外部文本与当前 model 文本不一致时才执行，避免无意义整文替换
- `setValue(...)` 属于高开销操作，不能作为常规同步路径；仅用于外部内容确实覆盖当前编辑器文本的场景
- 自动保存、保存状态回写等正常路径不应触发整文替换
- 若后续发现超大 JSON 文件在首版体验明显退化，需要在实现计划中补充阈值策略

首版先不引入复杂的大文件专属分支，但文档明确接受以下保守边界：

- 不承诺超大 JSON 文件的输入体验与普通配置文件等价
- 若实现阶段验证到明显卡顿，可新增“文件过大，编辑性能可能下降”的非阻断提示
- 如需进一步优化，优先关闭非核心增强项，而不是改变基础编辑语义

### 6. 查找与工具栏能力

`.json` 文件保留“查找”能力，但不展示 Markdown 专属控制项。

具体表现：

- 编辑页顶部仍使用现有工具栏体系
- `editorDriver` 声明仅支持 `showSearch`
- `view-mode` 切换按钮对 `.json` 文件隐藏
- 大纲按钮对 `.json` 文件隐藏
- `FindBar` 仍复用现有交互入口，但底层调用改由 `Monaco` 的 `find` 能力完成

### 7. AI 工具上下文兼容

AI 工具层只依赖以下能力：

- 文档内容读取
- 当前选区读取
- 光标插入/替换
- 全文替换

因此 `editorDriver.createToolContext(...)` 可以沿用现有 `createBaseToolContext` 思路，只要 `PaneJsonEditor` 暴露的实例符合 `EditorController` 即可。这样：

- `read` / `write` 类工具无需针对 JSON 单独分支
- 现有聊天侧边栏、工具权限和确认流程无需改协议
- 后续如果再扩展 `yaml/ts/js`，仍可复用同一套 tool context 模式

### 8. Monaco 集成边界

首次集成仅包含让 JSON 编辑稳定可用的最小配置：

- 语言模式：`json`
- 主题：跟随现有应用明暗主题做基础切换
- 自动布局：开启，适应编辑区尺寸变化
- 只读切换：跟随 `editable`
- 按需加载：仅在命中 `editorDriver` 且需要渲染 Monaco 分支时加载相关代码
- 关闭本次不需要的高级能力：如 minimap

本次不接入：

- 自定义 worker 分发优化
- schema diagnostics
- 远程补全源
- 额外右键菜单增强

如果 `monaco-editor` 在 Vite/Electron 环境下需要额外 worker 配置，则把这部分控制在 `createMonacoEditor.ts` 这类适配文件中，不让业务层感知。

关于加载与冷启动的明确决策：

- 不接受为了首版省事而把 Monaco 整包同步并入主编辑页首屏
- 优先采用按需加载 + worker 独立配置的方案
- 如果 worker 方案在当前 `Vite + Electron` 环境下暂时无法稳定跑通，需要先确认“延迟加载但功能可用”的保底方案，再进入正式实现
- 不把“接受明显冷启动阻塞”作为默认兜底决策

### 9. 主题切换方案

Monaco 主题切换不依赖 CSS 自动继承，而是显式跟随项目现有主题状态。

具体方案：

- 以 `settingStore.resolvedTheme` 作为唯一主题信号源
- 初始化阶段注册两套基础主题，例如 `tibis-light` 与 `tibis-dark`
- 创建编辑器实例后根据当前 `resolvedTheme` 调用 `monaco.editor.setTheme(...)`
- 监听 `settingStore.resolvedTheme` 变化，在主题切换时再次调用 `setTheme(...)`

这样可以与现有应用级主题状态保持一致，也避免直接依赖 `matchMedia` 或 DOM 属性做重复判断。

约束说明：

- `monaco.editor.setTheme(...)` 是全局调用，会影响当前页面内所有 Monaco 实例
- 首版编辑页可接受每个实例在监听到主题变化后重复调用一次 `setTheme(...)`，因为当前场景实际只有单实例
- 如果未来同页出现多个 Monaco 实例，应把主题切换上提到共享层统一处理，避免每个实例各自触发全局主题更新

### 10. 生命周期与资源释放

Monaco 实例和 model 都需要明确释放策略，避免频繁切换文件时内存累积。

首版约定：

- 组件卸载时调用 `editor.dispose()`
- 如果 model 由组件自行创建，则在组件卸载时同时调用 `model.dispose()`
- 如果未来改为共享 model 池，则由 model 所有权层统一负责释放，组件只释放 editor 实例
- 所有由 `createMonacoEditor.ts` 创建并返回的资源，其所有权必须在适配层接口文档中说明清楚

## 实施前 Spike

在正式实现前，先做一个很小的接入验证，确认以下问题：

1. `monaco-editor` 在当前 `Vite + Electron` 环境下的 worker 加载方案
2. `canUndo / canRedo` 是否能通过稳定的公开 API 获取
3. `FindBar` 所需的搜索状态，Monaco 是否能直接提供，还是需要适配层维护最小状态
4. Monaco 按需加载后对编辑页冷启动时间的影响是否可接受
5. `editor.dispose()` 与 `model.dispose()` 的所有权边界在当前实现中是否清晰

Spike 结论要在进入正式实现前回填到实现计划中。

## 错误处理

- Monaco 初始化失败时，组件显示可感知的降级空态，而不是静默白屏
- 若初始化失败，保留最小错误日志，便于在 `logger` 中排查
- 查找、替换、选区读取等接口在实例未就绪时返回安全空值，不抛异常
- 外部传入非法 JSON 文本时，编辑器仍允许展示与编辑，仅依赖 Monaco 自身语法诊断提示错误，不阻断输入

降级空态的最小交互定义：

- 顶部显示内联错误提示，说明 Monaco 初始化失败
- 主体区域展示一个只读 `textarea`，用于查看原始 JSON 文本，避免整页白屏
- 该降级态不提供编辑能力，只作为问题暴露与内容保底查看方案

## 测试策略

新增测试以“接口兼容”和“分流正确”为核心：

1. driver 测试
   - `.json` 命中 `editorDriver`
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

Monaco mock 粒度：

- 不直接在每个测试里 mock 整个 `monaco-editor`
- 统一 mock `createMonacoEditor.ts` 暴露的工厂函数与最小实例接口
- 组件测试验证“组件如何使用编辑器适配层”，而不是重复验证 Monaco 本身

## 风险与取舍

### 风险 1：Monaco 与现有测试环境的兼容性

`Monaco` 在单元测试里通常需要 mock。解决方式是把编辑器实例创建逻辑包在 `createMonacoEditor.ts` 这类小型适配层里，测试只 mock 这层，而不是直接在每个测试里手搓完整 Monaco API。

### 风险 2：查找状态与现有 `EditorSearchState` 不完全对等

现有接口是围绕 CodeMirror/BMarkdown 设计的，Monaco 的 find controller 未必暴露完全相同的公开状态。第一版允许 `getSearchState` 做最小兼容实现，只保证工具栏与交互不报错；如果后续 UI 需要精确命中数，再补强适配层。

### 风险 3：未来多语言扩展时组件命名可能受限

虽然本次只做 JSON，但若直接命名为 `MonacoJsonEditor`，后续扩展到更多文本类型可能需要再抽象。可接受的后续演进路径是：先保留 JSON 专用命名，等第二种非 Markdown 文本类型接入时，再把 Monaco 适配层上提为通用 `PaneCodeEditor`，driver 只透传语言参数。这里接受短期命名带来的局部重复，换取第一步实现的清晰边界。

### 风险 4：Monaco Worker 接入可能成为首个落地阻塞点

`Vite + Electron` 下的 Monaco worker 加载方式经常是首个真实阻塞点。如果 spike 不能在当前工程里稳定跑通 worker，则需要在实现计划中显式拆出“先完成无 worker 基础接入，再补 worker 方案”或“先引入已验证插件方案”的决策分支，而不是在正式开发时临时处理。

## 实施顺序

1. 安装并接入 `monaco-editor`
2. 新增 `PaneJsonEditor.vue` 与必要的 Monaco 适配辅助
3. 让组件暴露 `EditorController` 兼容接口
4. 新增 `editorDriver` 并接入编辑器页分流
5. 调整 JSON 文件工具栏能力显示
6. 补齐 driver / 组件 / 集成测试

## 验收标准

- 打开 `.json` 文件时，编辑页渲染 `Monaco` JSON 编辑器
- 保存、自动保存、AI 工具写入仍能正常工作
- 上层无需知道内部编辑器从 CodeMirror 换成了 Monaco
- `.md` 文件行为无回归
- JSON 文件的编辑页不再暴露 Markdown 专属能力
