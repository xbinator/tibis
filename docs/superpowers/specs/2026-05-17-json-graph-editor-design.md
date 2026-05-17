# JSON 可视化编辑器设计

## 背景

Tibis 当前仅支持 Markdown 文件的编辑，BMarkdown 组件提供富文本（TipTap）和源码（CodeMirror 6）两种视图模式。用户打开 `.json` 文件时，只能在源码模式下查看，缺乏结构化的可视化能力。

用户希望新增 JSON 可视化编辑器，以 JSON Crack 风格的**节点图**展示 JSON 结构——左侧 JSON 源码，右侧节点关系图（根节点在左侧，子节点向右展开），支持双向联动定位。

## 目标

- 新增 `BJsonGraph` 组件，提供 JSON 源码 + 节点图分栏视图
- 打开 `.json` 文件时自动触发节点图视图，也可手动切换关闭/打开
- 右侧节点图只读查看，所有编辑操作在左侧源码完成
- 节点图与源码双向联动：点击节点定位源码、悬停高亮源码、源码光标定位节点
- 对象/数组节点可折叠/展开
- AI 工具能感知 JSON 结构化信息（当前选中的 JSON 路径、节点类型等）

## 非目标

- 本次不做节点图内的编辑能力（右键添加/删除节点、拖拽修改值等）
- 本次不做 JSON Schema 校验或自动补全
- 本次不支持 YAML / TOML 等其他结构化文档的节点图（但接口设计预留扩展性）
- 本次不做节点图的键盘导航（Tab 切换节点、方向键移动焦点等无障碍支持）

## 技术选型

| 需求 | 选型 | 理由 |
|------|------|------|
| 节点图引擎 | Vue Flow (`@vue-flow/core`) | 原生 Vue 3 组件，内置拖拽/缩放/平移/小地图，节点可用 Vue 组件自定义 |
| 自动布局 | dagre (`@dagrejs/dagre`) | 经典有向图布局算法，支持 LR（左→右）方向，轻量。PoC 阶段需验证 Vite 下 ESM 兼容性 |
| JSON 源码编辑 | CodeMirror 6 (`@codemirror/lang-json`) | 复用 BMarkdown 源码模式的基础设施 |
| JSON 位置映射 | `json-source-map` | 成熟稳定（95 dependents），提供 JSON Pointer → 源码偏移量映射。虽为 CommonJS，Vite 自动处理 CJS→ESM 转换。项目内补充 `types/json-source-map.d.ts` 类型声明 |
| 面板分割 | `BPanelSplitter` | 复用现有组件 |

## 整体架构

### 组件结构

```
src/components/BJsonGraph/           # 新组件（B 前缀，全局自动注册）
├── index.vue                        # 入口：左右分栏容器
├── JsonSourceEditor.vue             # 左侧 JSON 源码编辑器（CodeMirror 6）
├── JsonNodeGraph.vue                # 右侧 Vue Flow 节点图
├── nodes/                           # 自定义节点组件
│   ├── ObjectNode.vue               # 对象节点 { }
│   ├── ArrayNode.vue                # 数组节点 [ ]
│   └── ValueNode.vue                # 叶子值节点（string/number/bool/null）
├── hooks/
│   ├── useJsonParse.ts              # JSON 源码 → 树结构解析（带位置映射）
│   ├── useGraphLayout.ts            # 树结构 → Vue Flow 节点/边（dagre 布局）
│   └── useSourceSync.ts             # 源码 ↔ 节点图双向定位同步（含防循环）
└── types.ts                         # 类型定义
```

### 与 BMarkdown 的关系

BJsonGraph 是**独立组件**，不是 BMarkdown 的第三种视图模式。原因：

1. BMarkdown 是 Markdown 编辑器，内部逻辑（TipTap、Markdown 解析、大纲）与 JSON 无关
2. JSON 编辑器的源码侧不需要 TipTap，直接用 CodeMirror 6
3. 两者共享 `EditorState` 接口（`content` / `name` / `path` / `id` / `ext`），但渲染逻辑完全独立

### 数据流

```
JSON 源码 (string)
    │
    ├─→ JsonSourceEditor（CodeMirror 6，左侧）
    │       │
    │       ├─→ 编辑内容 → 同步回 fileState.content → 触发自动保存
    │       │
    │       └─→ 光标变化 → 偏移量 → useJsonParse 查找 → JSON Path
    │                                          │
    │                                          ├─→ 通知 JsonNodeGraph 高亮节点
    │                                          └─→ 更新 AIToolContext.structured
    │
    └─→ useJsonParse → 解析树（带位置信息）
            │
            └─→ useGraphLayout → Vue Flow nodes/edges（dagre LR 布局）
                    │
                    └─→ JsonNodeGraph（右侧，只读）
                            │
                            ├─→ 点击节点 → useSourceSync → CodeMirror 定位源码
                            └─→ 悬停节点 → CodeMirror Decoration 高亮源码
```

## 详细设计

### 1. 自定义节点

三种 Vue Flow 自定义节点，通过 Vue 组件实现：

**ObjectNode**（对象节点）
- 标题行：`{ }` 图标 + key 名
- 副标题：子项数量（如 `3 keys`）
- 边框颜色：紫色（`var(--json-node-object)`，默认 `#cba6f7`）
- 可折叠：点击折叠按钮隐藏子节点
- 点击节点：定位左侧源码（选中整个对象区间，即 `startOffset` → `endOffset`）

**ArrayNode**（数组节点）
- 标题行：`[ ]` 图标 + key 名
- 副标题：元素数量（如 `5 items`）
- 边框颜色：橙色（`var(--json-node-array)`，默认 `#fab387`）
- 可折叠
- 点击节点：定位左侧源码（选中整个数组区间）

**ValueNode**（叶子值节点）
- 第一行：key 名
- 第二行：value（按类型着色）
  - string → 绿色（`var(--json-node-string)`，默认 `#a6e3a1`）
  - number → 橙色（`var(--json-node-number)`，默认 `#fab387`）
  - boolean → 蓝色（`var(--json-node-boolean)`，默认 `#89b4fa`）
  - null → 灰色（`var(--json-node-null)`，默认 `#6c7086`）
- 点击节点：定位左侧源码（选中 value 区间，即 `valueStartOffset` → `valueEndOffset`）

### 2. 布局算法

使用 dagre 做 Left-to-Right 自动布局：

```typescript
const g = new dagre.graphlib.Graph();
g.setDefaultEdgeLabel(() => ({}));
g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 });
```

参数：
- `rankdir: 'LR'` — 水平左→右布局
- `nodesep: 40` — 同层节点间距
- `ranksep: 80` — 层级间距

源码变更时重新解析 → 重新布局。使用 `VueFlow.fitView()` 自动适配视口。

### 3. 双向联动

**点击节点 → 定位源码**：

根据节点类型选择不同的选区范围：
- **对象/数组节点**：选中整个节点区间（`startOffset` → `endOffset`），即从 `{` 到 `}` 或从 `[` 到 `]`
- **叶子值节点**：选中 value 区间（`valueStartOffset` → `valueEndOffset`），即值的文本范围（不含 key）

定位操作：
1. 调用 CodeMirror `editor.dispatch({ selection: { anchor, head } })`
2. `scrollIntoView` 滚动到对应位置
3. 设置 `syncOrigin = 'graph'` 标记，防止 CodeMirror selection listener 反向触发节点图定位

**悬停节点 → 高亮源码**：
1. 使用 CodeMirror Decoration 在对应源码区间添加背景高亮 class
2. 鼠标离开节点时清除 Decoration
3. 悬停事件使用 100ms debounce 节流，避免快速划过节点时频繁创建/销毁 Decoration

**源码光标 → 定位节点图**：
1. CodeMirror `updateListener` 监听选区变化
2. 检查 `syncOrigin` 标记：如果当前选区变更来源是 `'graph'`（节点图点击触发），跳过反向定位，避免循环
3. 根据偏移量在解析树中查找对应节点 ID
4. Vue Flow 设置该节点为选中状态
5. **fitView 触发策略**：仅在以下场景触发 `fitView`，避免频繁重置视口导致抖动：
   - 首次加载（`onMounted` 或首次解析成功时）
   - 用户显式点击"定位当前节点"按钮
   - 目标节点完全不在当前视口内时（通过 `getNodesInViewport` 判断）
   - 普通光标移动仅高亮节点，不触发 `fitView`

**防循环机制**：

`useSourceSync` 维护一个 `syncOrigin` 标记，标识当前同步操作的来源：

```typescript
type SyncOrigin = 'graph' | 'editor' | null;
let syncOrigin: SyncOrigin = null;

/** 从节点图触发源码定位时设置标记 */
function locateSourceFromGraph(offset: number) {
  syncOrigin = 'graph';
  codeMirrorEditor.dispatch({ selection: { anchor: offset } });
  requestAnimationFrame(() => { syncOrigin = null; });
}

/** CodeMirror selection listener 中检查标记 */
function onCodeMirrorSelectionUpdate(update: ViewUpdate) {
  if (syncOrigin === 'graph') return; // 跳过反向定位
  // ... 正常处理源码 → 节点图定位
}
```

### 4. 节点折叠/展开

采用三级策略，按复杂度递增：

**Level 1 — PoC 默认：重新布局，接受轻微位移**

1. 维护两个独立的折叠状态集合：
   - `autoCollapsedPaths: Set<string>` — 自动折叠的节点路径（由超大文件策略写入）
   - `userCollapsedPaths: Set<string>` — 用户手动折叠的节点路径
   - `userExpandedPaths: Set<string>` — 用户手动展开的节点路径（覆盖自动折叠）
2. 最终可见性判断：节点被折叠 = `(autoCollapsedPaths.has(path) || userCollapsedPaths.has(path)) && !userExpandedPaths.has(path)`
3. `useGraphLayout` 在生成 Vue Flow 节点/边时，根据上述合并逻辑跳过折叠节点的子树
4. 折叠/展开后 dagre 重新布局，所有节点坐标重新计算
5. 接受轻微位移，使用 `VueFlow.fitView()` 自适应视口

**自动折叠与用户操作的优先级**：

自动折叠仅在以下时机重算 `autoCollapsedPaths`：
- 首次加载（`nodeMap` 首次构建完成时）
- 源码变更导致节点总数跨过阈值（从 ≤500 变为 >500，或反向）

用户手动展开一个被自动折叠的节点时，该路径加入 `userExpandedPaths`，后续自动折叠重算不会将其重新折叠。用户手动折叠一个节点时，该路径加入 `userCollapsedPaths`。源码变更导致节点路径消失时，对应的 `userExpandedPaths` / `userCollapsedPaths` 条目自动清理。

**Level 2 — 优化方案：缓存历史坐标，优先复用**

1. 维护 `previousPositions: Map<string, { x: number; y: number }>` 缓存上一次布局的节点坐标
2. dagre 布局完成后，对每个节点检查：如果上一次布局中存在该节点，优先使用上一次的坐标
3. 仅对新增/移除的节点及其相邻节点使用 dagre 新坐标
4. 减少未受影响节点的位移，显著降低抖动感

**Level 3 — 备选方案：仅隐藏子树，不重新布局**

1. 折叠时保持整图坐标不变，仅设置子树节点的 `hidden: true` 和子边的 `hidden: true`
2. 展开时恢复可见性，坐标不变
3. 折叠后子树区域留白，不回收空间
4. 适用于对抖动零容忍的场景

PoC 阶段从 Level 1 开始，根据实际体验决定是否升级到 Level 2 或 Level 3。

### 5. JSON 解析与位置映射

使用 `json-source-map` 解析 JSON，生成每个节点的位置信息。它返回 JSON Pointer（RFC 6901）格式的路径和对应的源码偏移量。

**路径约定**：JSON Pointer 根路径为空字符串 `""`，子路径格式为 `/key/index`（如 `/author/name`、`/features/0`）。所有 `JsonNodeInfo.path`、Vue Flow `node.id`、`Map<path, JsonNodeInfo>` 查询键统一使用此格式。

```typescript
interface JsonNodeInfo {
  /** JSON Pointer 路径（RFC 6901），根节点为 ""，子路径如 "/author/name" */
  path: string;
  /** 节点类型 */
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  /** 整个节点在源码中的起始偏移（含 key） */
  startOffset: number;
  /** 整个节点在源码中的结束偏移 */
  endOffset: number;
  /** key 在源码中的起始偏移（仅 object 子节点有） */
  keyStartOffset?: number;
  /** key 在源码中的结束偏移（仅 object 子节点有） */
  keyEndOffset?: number;
  /** value 在源码中的起始偏移 */
  valueStartOffset: number;
  /** value 在源码中的结束偏移 */
  valueEndOffset: number;
  /** 如果是 object 的 value，记录 key */
  key?: string;
  /** 值（叶子节点） */
  value?: unknown;
  /** 子节点路径列表 */
  children: string[];
}
```

**偏移量语义与点击行为对应**：

| 节点类型 | 点击时选中的区间 | 说明 |
|---------|----------------|------|
| ObjectNode | `startOffset` → `endOffset` | 选中整个对象，从 `{` 到 `}` |
| ArrayNode | `startOffset` → `endOffset` | 选中整个数组，从 `[` 到 `]` |
| ValueNode | `valueStartOffset` → `valueEndOffset` | 仅选中 value 部分，不含 key |

`keyStartOffset` / `keyEndOffset` 预留用于未来"点击 key 名定位到 key"的增强功能。

解析结果存储为 `Map<path, JsonNodeInfo>`，供 `useGraphLayout` 和 `useSourceSync` 查询。

JSON 语法错误时，右侧节点图显示错误提示，不崩溃。

### 6. AI 结构化上下文

在 `types/ai.d.ts` 的 `AIToolContext` 中新增可选的 `structured` 字段，设计为**文档类型无关**的通用接口，方便后续扩展 YAML / TOML 等格式：

```typescript
interface AIToolContext {
  document: { /* 现有字段不变 */ };
  editor: { /* 现有字段不变 */ };
  /** 结构化文档上下文（仅结构化文档时存在） */
  structured?: StructuredDocumentContext;
}

/** 通用结构化文档上下文 */
interface StructuredDocumentContext {
  /** 文档类型标识：'json' | 'yaml' | 'toml' | ... */
  documentType: string;
  /** 当前光标/选区在文档中的路径 */
  getCurrentPath: () => string | null;
  /** 当前光标所在节点的类型 */
  getCurrentNodeType: () => string | null;
  /** 获取指定路径的值（从缓存的 parsed value 读取，不重新 JSON.parse） */
  getValueAtPath: (path: string) => unknown;
  /** 文档结构摘要 */
  getStructureSummary: () => DocumentStructureSummary;
}

/** 文档结构摘要 */
interface DocumentStructureSummary {
  /** 根节点类型 */
  rootType: string;
  /** 最大嵌套深度 */
  maxDepth: number;
  /** 总节点数 */
  totalNodes: number;
  /** 顶层 key 列表 */
  topLevelKeys: string[];
}
```

**生命周期与注册归属**：

AI 上下文的注册/注销由**页面层**（`src/views/editor/index.vue`）统一管理，与 keep-alive 的 `activated/deactivated` 生命周期绑定。BJsonGraph 组件**不自行注册/注销** `editorToolContextRegistry`，仅通过 `defineExpose` 暴露 `structured` 数据供页面层拼装。

原因：当前上下文生命周期由页面层统一管理，和 keep-alive 的 `activated/deactivated` 绑定在一起；如果内部组件也接管注册，容易出现重复注册、切换组件时把当前活动上下文误删、`activeEditorId` 漂移等问题。

页面层注册示例：

```typescript
// src/views/editor/index.vue
const jsonGraphRef = ref<InstanceType<typeof BJsonGraph> | null>(null);

function registerEditorContext(): void {
  const documentId = fileState.value.id;
  if (!isActive.value || !documentId) return;

  const editorInstance = fileState.value.ext === 'json'
    ? jsonGraphRef.value
    : editorRef.value;

  if (!editorInstance) return;

  editorToolContextRegistry.register(documentId, {
    document: { id, title, path, locator, getContent: () => fileState.value.content },
    editor: {
      getSelection: () => editorInstance.getSelection(),
      insertAtCursor: (content) => editorInstance.insertAtCursor(content),
      replaceSelection: (content) => editorInstance.replaceSelection(content),
      replaceDocument: (content) => editorInstance.replaceDocument(content),
    },
    // JSON 模式时拼装 structured 字段
    ...(fileState.value.ext === 'json' && jsonGraphRef.value
      ? {
          structured: {
            documentType: 'json',
            getCurrentPath: () => jsonGraphRef.value?.getCurrentPath() ?? null,
            getCurrentNodeType: () => jsonGraphRef.value?.getCurrentNodeType() ?? null,
            getValueAtPath: (path: string) => jsonGraphRef.value?.getValueAtPath(path) ?? undefined,
            getStructureSummary: () => jsonGraphRef.value?.getStructureSummary() ?? defaultSummary,
          }
        }
      : {}),
  });
}
```

BJsonGraph 组件通过 `defineExpose` 暴露 `structured` 相关方法，不直接操作 `editorToolContextRegistry`。

`StructuredDocumentContext` 的方法可能被 AI 工具在组件卸载后调用，产生悬空引用。防护措施：

1. 页面层 `onBeforeUnmount` 时调用 `editorToolContextRegistry.unregister(documentId)` 清除注册
2. 每个方法内部增加防御性检查：引用的 `jsonGraphRef` 为空时返回 `null` / 默认值
3. `editorToolContextRegistry.unregister` 实现中确保清除对应 documentId 的全部上下文（含 `structured`）

**`getValueAtPath` 性能安全**：

`getValueAtPath` 从 `useJsonParse` 缓存的 parsed value 中读取，不重新 `JSON.parse(content)`：

1. `useJsonParse` 解析成功后缓存 `parsedValue: unknown` 和 `nodeMap: Map<path, JsonNodeInfo>`
2. `getValueAtPath(path)` 通过 JSON Pointer 路径从 `parsedValue` 中读取对应值（如 `/author/name` → `parsedValue.author.name`）
3. 源码变更 debounce 触发重新解析时，更新 `parsedValue` 缓存
4. JSON 语法错误时 `parsedValue` 为 `null`，`getValueAtPath` 返回 `undefined`

BMarkdown 注册时无 `structured` 字段，现有逻辑不变。

### 7. 编辑器公共协议

BJsonGraph 必须实现与 BMarkdown 相同的 `EditorController` 接口，确保页面层（`useBindings`、`useFileSelection`、`registerEditorContext`）在 JSON 模式下无需区分编辑器类型。

**接口映射**：

| EditorController 方法 | BJsonGraph 实现 | 说明 |
|----------------------|----------------|------|
| `undo()` | 委托 CodeMirror `undo()` | |
| `redo()` | 委托 CodeMirror `redo()` | |
| `canUndo()` | 委托 CodeMirror `history` facet | |
| `canRedo()` | 委托 CodeMirror `history` facet | |
| `focusEditor()` | 委托 CodeMirror `focus()` | |
| `focusEditorAtStart()` | 委托 CodeMirror `dispatch({ selection: { anchor: 0 } })` | |
| `setSearchTerm(term)` | 委托 CodeMirror `openSearchPanel` | |
| `findNext()` | 委托 CodeMirror `search` 扩展 | |
| `findPrevious()` | 委托 CodeMirror `search` 扩展 | |
| `clearSearch()` | 委托 CodeMirror `closeSearchPanel` | |
| `getSelection()` | 委托 CodeMirror `state.selection.main` | |
| `insertAtCursor(content)` | 委托 CodeMirror `dispatch` | |
| `replaceSelection(content)` | 委托 CodeMirror `dispatch` | |
| `replaceDocument(content)` | 委托 CodeMirror `dispatch` | |
| `selectLineRange(start, end)` | 将行号转换为偏移量后 `dispatch` | JSON 模式下按行选中 |
| `getSearchState()` | 从 CodeMirror search 扩展读取 | |
| `scrollToAnchor(anchorId)` | 返回 `false` | JSON 无锚点 |
| `getActiveAnchorId()` | 返回 `''` | JSON 无锚点 |

**实现方式**：

BJsonGraph 的 `defineExpose` 暴露完整的 `EditorController` 接口，内部委托给 `JsonSourceEditor` 的 CodeMirror 实例。页面层将 `editorRef` 的类型从 `BMarkdownPublicInstance` 改为 `EditorController`，通过条件渲染赋值：

```typescript
// src/views/editor/index.vue
const editorRef = ref<EditorController | null>(null);

// BJsonGraph 或 BMarkdown 都赋值给同一个 ref
// BJsonGraph 的 defineExpose 返回 EditorController 兼容对象
```

**类型迁移范围**：

`editorRef` 类型变更后，以下消费方需同步修改参数类型：

| 文件 | 现有类型 | 迁移后类型 | 说明 |
|------|---------|-----------|------|
| `src/views/editor/index.vue` | `Ref<BMarkdownPublicInstance \| null>` | `Ref<EditorController \| null>` | 页面层 ref 定义 |
| `src/views/editor/hooks/useBindings.ts` | `editorInstance?: Ref<BMarkdownPublicInstance \| null>` | `editorInstance?: Ref<EditorController \| null>` | 仅使用 `undo()`/`redo()` |
| `src/views/editor/hooks/useFileSelection.ts` | `editorInstance: Ref<BMarkdownPublicInstance \| null>` | `editorInstance: Ref<EditorController \| null>` | 仅使用 `selectLineRange()` |

迁移原则：
- `useBindings` 和 `useFileSelection` 只依赖 `EditorController` 的方法子集（`undo/redo` 和 `selectLineRange`），不依赖 `BMarkdownPublicInstance` 的任何特有方法
- `BMarkdownPublicInstance` 本身就是 `Omit<EditorController, 'focusEditorAtStart' | 'scrollToAnchor' | 'getActiveAnchorId'>`，是 `EditorController` 的子集
- 因此类型提升是安全的：`BMarkdownPublicInstance` 可以赋值给 `EditorController`（缺失的方法由 BMarkdown 内部实现补齐），`BJsonGraphPublicInstance` 继承 `EditorController` 也可以赋值
- BMarkdown 组件需同步补齐 `focusEditorAtStart`、`scrollToAnchor`、`getActiveAnchorId` 三个方法的 `defineExpose`，使其完全兼容 `EditorController`

**selectLineRange 适配**：

`useFileSelection` 调用 `selectLineRange(startLine, endLine)` 定位到指定行范围。BJsonGraph 需要将行号转换为字符偏移量：

1. 通过 `editorView.state.doc.line(startLine).from` 获取起始偏移
2. 通过 `editorView.state.doc.line(endLine).to` 获取结束偏移
3. `dispatch({ selection: { anchor: from, head: to } })` + `scrollIntoView`

### 8. Vue Flow 交互边界

右侧节点图为只读查看模式，Vue Flow 的交互配置如下：

| 交互能力 | 配置 | 说明 |
|---------|------|------|
| 节点拖拽 | `nodesDraggable: false` | 禁止拖拽节点，节点位置由 dagre 布局决定 |
| 节点连接 | `nodesConnectable: false` | 禁止创建新连接线 |
| 元素选中 | `elementsSelectable: true` | 允许点击选中节点，触发源码定位 |
| 画布平移 | 允许 | 鼠标拖拽画布平移 |
| 画布缩放 | 允许 | 滚轮缩放 |
| 小地图 | 允许 | 右下角小地图导航 |
| 缩放控制 | 允许 | 右下角 +/- 按钮 |

### 8. 编辑器页面集成

**条件渲染**：在 `src/views/editor/index.vue` 中根据 `fileState.ext` 选择渲染组件：

```
ext === 'json' → 渲染 BJsonGraph
ext === 'md'   → 渲染 BMarkdown（现有逻辑）
其他           → 渲染 BMarkdown（源码模式）
```

**工具栏适配**：

| 按钮 | Markdown 模式 | JSON 模式 |
|------|-------------|----------|
| 视图切换 | rich ↔ source | 隐藏 |
| 大纲 | 显示/隐藏 | 隐藏 |
| JSON 视图 | 隐藏 | 显示/隐藏节点图 |
| 保存 | ✅ | ✅ |
| 查找替换 | ✅ | ✅（使用 CodeMirror `@codemirror/search` 扩展） |

**查找替换**：JSON 模式下的查找替换使用 CodeMirror 原生 `@codemirror/search` 扩展（`search` / `replace` 面板），与 BMarkdown 的 TipTap 层查找替换实现不同。CodeMirror 的 JSON 语言包已内置，无需额外配置。

**文件打开流程**：
1. 文件对话框支持选择 `.json` 文件
2. `useFileState` 从文件路径解析扩展名时保留 `.json`
3. `fileState.ext` 正确传递 `'json'`，触发条件渲染

**内容同步与保存**：

BJsonGraph 左侧 CodeMirror 编辑器需要将编辑内容同步回 `fileState.content`，以触发自动保存和 dirty state 判断：

1. CodeMirror `updateListener` 监听文档变更
2. 变更时将 `editor.state.doc.toString()` 同步到 `fileState.content`（通过 `v-model:value` 的 `update:value` 事件）
3. dirty state 判断复用 `useSession/useFileState` 的 `savedContent` 基线（`fileState.content !== savedContent`），**不直接读取 `fileState.savedContent`**（该字段不存在于 `EditorFile` 上，`savedContent` 由 `useFileState` 内部维护）
4. 保存流程不变：`Ctrl+S` → `useSession.onSave` → `native.writeFile` → `fileStateActions.markCurrentContentSaved()` → 更新 `savedContent` 基线

### 9. 样式与主题适配

**Vue Flow 核心样式**：

Vue Flow 需要引入核心 CSS（`@vue-flow/core/dist/style.css`）和基础主题 CSS（`@vue-flow/core/dist/theme-default.css`），在 `JsonNodeGraph.vue` 中导入。

**Tibis 主题变量接入**：

节点颜色不硬编码，而是通过 CSS 变量映射到 Tibis 的主题系统，支持明暗主题切换：

```css
/* 亮色主题 */
:root {
  --json-node-object: #7c3aed;
  --json-node-array: #ea580c;
  --json-node-string: #16a34a;
  --json-node-number: #d97706;
  --json-node-boolean: #2563eb;
  --json-node-null: #6b7280;
  --json-node-border: #e5e7eb;
  --json-node-bg: #ffffff;
  --json-node-text: #1f2937;
  --json-edge: #d1d5db;
}

/* 暗色主题 */
html.dark {
  --json-node-object: #cba6f7;
  --json-node-array: #fab387;
  --json-node-string: #a6e3a1;
  --json-node-number: #fab387;
  --json-node-boolean: #89b4fa;
  --json-node-null: #6c7086;
  --json-node-border: #45475a;
  --json-node-bg: #1e1e2e;
  --json-node-text: #cdd6f4;
  --json-edge: #585b70;
}
```

这些变量在 `src/assets/styles/` 中定义，与现有主题变量体系一致。自定义节点组件通过 `var(--json-node-*)` 引用颜色，确保明暗主题下视觉协调。

### 10. 新增依赖

```
@vue-flow/core                  — Vue Flow 核心（含核心 CSS）
@vue-flow/core/dist/style.css   — Vue Flow 核心样式（必须引入）
@vue-flow/core/dist/theme-default.css — Vue Flow 默认主题（必须引入）
@vue-flow/background            — 网格背景（懒加载）
@vue-flow/minimap               — 小地图（懒加载）
@vue-flow/controls              — 缩放控制（懒加载）
@dagrejs/dagre                  — 自动布局
json-source-map                 — JSON 源码位置映射
```

`@vue-flow/minimap` 和 `@vue-flow/controls` 体积较大，使用 `defineAsyncComponent` 懒加载，减少初始 bundle 体积。

## 可维护性与扩展性

为避免 `src/views/editor/index.vue` 随文件类型增加而不断膨胀，本次设计将编辑器页面定位为**壳层（shell）**，具体文件类型能力通过“编辑器驱动注册表”扩展。

### 1. 编辑器驱动接口

新增 `EditorDriver` 概念，每种文件类型对应一个驱动对象，负责声明“何时匹配、渲染什么组件、提供哪些页面能力”：

```typescript
interface EditorDriver {
  /** 驱动唯一标识 */
  id: string;
  /** 是否匹配当前文件 */
  match: (file: EditorFile) => boolean;
  /** 要渲染的编辑器组件 */
  component: Component;
  /** 生成页面层工具上下文 */
  createToolContext: (input: CreateToolContextInput) => AIToolContext;
  /** 工具栏能力配置 */
  toolbar: EditorToolbarConfig;
  /** 是否显示大纲 */
  supportsOutline: boolean;
}
```

其中：
- `markdownDriver` 负责 `.md` 文件，渲染 `BMarkdown`
- `jsonDriver` 负责 `.json` 文件，渲染 `BJsonGraph`
- 后续新增 `yamlDriver`、`csvDriver`、`tomlDriver` 时，仅新增驱动模块，不在页面层继续堆 `if/else`

### 2. 驱动注册表

在 `src/views/editor/drivers/` 下维护驱动注册表：

```
src/views/editor/drivers/
├── index.ts              # 导出 drivers 列表与 resolveEditorDriver()
├── markdown.ts           # Markdown 驱动
├── json.ts               # JSON 驱动
└── types.ts              # EditorDriver / toolbar 配置类型
```

`resolveEditorDriver(fileState)` 按顺序查找首个匹配驱动，未命中时回退到 `markdownDriver` 的源码模式或 `plainTextDriver`。

### 3. 页面层职责收敛

`src/views/editor/index.vue` 只保留以下职责：

1. 读取 `fileState`
2. 调用 `resolveEditorDriver(fileState)` 获取当前驱动
3. 使用动态组件渲染驱动声明的编辑器组件
4. 将公共生命周期（`activated` / `deactivated` / `beforeUnmount`）接到统一的工具上下文注册逻辑
5. 根据驱动提供的 `toolbar` 配置渲染工具栏

页面层**不直接按扩展名分支业务行为**，即不出现持续膨胀的：

```typescript
if (ext === 'json') { ... }
else if (ext === 'yaml') { ... }
else if (ext === 'csv') { ... }
```

### 4. 工具栏配置下沉

工具栏显示/隐藏规则由驱动声明，而不是写死在页面组件中：

```typescript
interface EditorToolbarConfig {
  showViewModeToggle: boolean;
  showOutlineToggle: boolean;
  showStructuredViewToggle: boolean;
  showSearch: boolean;
}
```

示例：
- `markdownDriver.toolbar`：显示 rich/source 切换、显示大纲、不显示 structured toggle
- `jsonDriver.toolbar`：隐藏 rich/source、隐藏大纲、显示 JSON 图视图 toggle

这样新增文件类型时，只需在驱动内调整能力描述，不需要继续修改页面模板条件分支。

### 5. AI 上下文扩展点

AI 工具上下文也由驱动负责拼装：

- Markdown 驱动只返回基础 `document` / `editor`
- JSON 驱动在基础字段之上附加 `structured`
- 后续 YAML / TOML 驱动可复用相同的 `StructuredDocumentContext` 接口

页面层只调用：

```typescript
const context = activeDriver.createToolContext({
  fileState,
  editorInstance,
  isActive,
});
```

避免 `registerEditorContext()` 自己了解每种文件类型的上下文差异。

### 6. 新增文件类型的接入流程

以后新增一个文件类型时，接入步骤固定为：

1. 新建对应编辑器组件，如 `BYamlGraph`
2. 实现 `EditorController` 兼容接口
3. 新增 `yamlDriver.ts`，声明 `match/component/createToolContext/toolbar`
4. 在 `drivers/index.ts` 注册驱动
5. 补充该驱动对应的测试

`src/views/editor/index.vue` 无需再增加新的扩展名分支。

## 错误处理

- **JSON 语法错误**：右侧节点图显示错误提示卡片（含错误行号和消息），不崩溃。源码编辑器通过 CodeMirror lint 实时标注错误位置
- **超大 JSON 文件**：解析后先统计节点总数，若超过阈值（500），在布局前裁剪可见节点，避免首次布局卡顿。策略为 BFS 遍历，优先折叠深度 ≥ 3 的对象/数组节点：
  1. `useJsonParse` 解析完成后统计 `nodeMap.size`
  2. 若 `nodeMap.size > 500`，BFS 遍历所有节点，记录每个节点的深度
  3. 从最深层的对象/数组节点开始加入 `autoCollapsedPaths`（不是 `collapsedPaths`），直到可见节点数 ≤ 500
  4. 同深度节点按路径字母序折叠（保证折叠结果确定性）
  5. 自动折叠仅在首次加载或节点数跨过阈值时重算，不会覆盖 `userExpandedPaths` 中用户已手动展开的节点
  6. `useGraphLayout` 根据 `(autoCollapsedPaths ∪ userCollapsedPaths) \ userExpandedPaths` 合并逻辑判断可见性
  7. 右上角显示提示"节点过多，已自动折叠 N 个节点"
- **解析性能**：源码变更时使用 debounce（300ms）延迟重新解析和布局，避免频繁重绘

## PoC 验证项

以下风险点需在 PoC 阶段优先验证：

1. **dagre ESM 兼容性**：`@dagrejs/dagre` 在 Vite 下可能需要 `optimizeDeps.include` 配置。PoC 需确认打包流程无需额外配置，或记录所需配置
2. **折叠动画抖动**：验证 Level 1（重新布局）的实际效果，如果抖动显著，升级到 Level 2（缓存历史坐标）或 Level 3（不重新布局留白）
3. **json-source-map CJS 兼容性**：确认 Vite 自动 CJS→ESM 转换无问题，`import { parse } from 'json-source-map'` 可正常工作
4. **json-source-map 偏移量粒度**：验证 `json-source-map` 返回的 pointers 是否包含 key 区间和 value 区间的独立偏移量。如果不包含，需要基于 `startOffset` 和 JSON 源码文本自行推算 key/value 区间

## 测试要点

- JSON 解析正确性：合法 JSON、非法 JSON、空文件、超大文件
- 节点图渲染：对象、数组、嵌套、混合类型的正确展示
- 双向联动：点击节点定位源码、悬停高亮、源码光标定位节点
- 防循环：点击节点 → 源码定位 → 不会反向触发节点图 fitView
- 折叠/展开：虚拟折叠正确隐藏/恢复子树，抖动在可接受范围内
- AI 上下文：`structured` 字段正确注册和注销，组件卸载后方法调用返回 null 而非崩溃
- `getValueAtPath` 性能：不重新 JSON.parse，从缓存读取
- 条件渲染：`.json` 文件打开 BJsonGraph，`.md` 文件打开 BMarkdown
- 错误容忍：非法 JSON 不崩溃，显示错误提示
- 内容同步：CodeMirror 编辑内容正确同步到 fileState，dirty state 判断正确
- 查找替换：JSON 模式下 CodeMirror search 扩展正常工作
- 主题适配：明暗主题切换时节点颜色正确变化
- 交互边界：节点不可拖拽/连接，画布可平移/缩放
