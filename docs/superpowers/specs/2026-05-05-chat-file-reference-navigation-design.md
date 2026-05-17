# 2026-05-05 Chat File Reference Navigation Design

## 背景

当前聊天侧边栏里的文件引用已经能以 chip 形式展示，但仍然停留在“静态展示”阶段：

- `src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue` 会把用户消息中的 `{{#filePath start-end|renderStart-renderEnd}}` 解析成内联 chip。当前 `FileRefSegment` 仅保存 `lineText` 字符串（如 `"3-5"`），**未解析出数值型 `startLine`/`endLine`**，需要扩展。
- `src/components/BChatSidebar/utils/chipResolver.ts` 会把输入框中的 `{{#...}}` 渲染成 CodeMirror widget。其 `parseFileRef()` 已被移除，统一使用 `parseFileReferenceToken()` 解析。
- 两处都没有统一的点击导航能力。

这导致用户在聊天中引用了某段文档后，无法直接从 chip 回到原文件并定位到对应范围，引用与编辑之间仍然是断开的。

## 目标

- 支持点击聊天消息中的文件引用 chip，打开对应文件。
- 支持点击输入框中的文件引用 chip，打开对应文件。
- 打开文件后自动滚动到引用范围，并选中高亮对应行。
- 统一兼容已保存文件与 `unsaved://id/fileName` 未保存草稿引用。
- 复用现有 `src/hooks/useOpenFile.ts` 打开链路，避免重复编排 `filesStore + router`。
- 将“点击引用”和“编辑器选中行范围”解耦，避免聊天侧边栏直接依赖编辑器内部实现。

## 非目标

- 本阶段不改变文件引用 token 的格式。
- 本阶段不改造助手消息的 Markdown 引用渲染方式，只覆盖用户消息 bubble 与输入框 chip。
- 本阶段不实现多次导航历史、前进后退或 URL 持久化。
- 本阶段不设计新的系统级“打开任意资源”协议，只处理聊天文件引用。

## 设计结论

采用“统一文件引用导航器 + 编辑器消费一次性导航意图”的方案：

1. 点击入口统一调用一个共享导航函数。
2. 导航函数通过 `useOpenFile.ts` 打开目标文件。
3. 打开成功后写入一次性的待跳转范围。
4. editor 页面在目标文件就绪后消费这条范围信息，并执行“滚动 + 选中 + 高亮”。

这样可以避免：

- `BubblePartUserInput.vue` 自己关心 router 和文件 store。
- `chipResolver.ts` 直接操作 editor 实例。
- rich/source 双模式的选区逻辑外泄到聊天模块。

## 方案对比

### 方案一：统一导航器 + editor 消费待跳转范围（推荐）

点击入口只提供“我要去哪个文件、哪几行”，真正的文件打开与选区操作分两段完成。

优点：

- 入口统一，`BubblePartUserInput.vue` 和 `chipResolver.ts` 行为一致。
- 打开文件和选区高亮职责分离，边界清晰。
- rich/source 双模式可以在 editor 内部分别实现，不污染调用方。
- 未来扩展到助手消息引用、搜索结果、最近记录跳转时可直接复用。

缺点：

- 需要新增一层轻量导航状态。

### 方案二：点击入口直接打开文件并尝试控制 editor

优点：

- 看起来改动路径更短。

缺点：

- 聊天模块会直接耦合 editor 生命周期。
- 路由切换与 editor 挂载存在异步时序问题。
- rich/source 双模式差异会泄漏到调用方。

### 方案三：通过 URL query 传递行号

优点：

- 实现直观。

缺点：

- 一次性 UI 意图不适合放进 URL。
- 刷新、回退、重复进入时需要额外清理。
- `unsaved://` 草稿引用不自然。

## 核心设计

### 1. 统一的文件引用导航目标

新增一个供 UI 层使用的导航目标结构：

```ts
/**
 * 文件引用导航目标
 */
export type FileReferenceTargetKind = 'saved' | 'unsaved'

export interface FileReferenceNavigationTarget {
  /** 原始引用路径，如 `/a/b.md` 或 `unsaved://id/name.md`，方便错误日志和 toast */
  rawPath: string;
  /** 引用类型 */
  kind: FileReferenceTargetKind;
  /** 绝对路径；未保存草稿时为 null */
  filePath: string | null;
  /** 文件 ID；未保存草稿必填，已保存文件可选 */
  fileId: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 起始行号（1-based） */
  startLine: number;
  /** 结束行号（1-based） */
  endLine: number;
}
```

来源规则：

- 已保存文件：`filePath` 有值，`fileId` 可空，`kind = 'saved'`。
- 未保存草稿：从 `unsaved://id/fileName` 中解析出 `fileId`，同时令 `filePath = null`，`kind = 'unsaved'`。

`kind` 字段可以避免后续大量 `if (filePath) else if (fileId)` 的隐式判断，`rawPath` 方便调试和错误提示。

### 行号语义说明

文件引用 token 中包含两组行号，语义不同，导航时必须使用 `startLine/endLine`（源码行号）：

| 字段 | 语义 | 来源 |
|------|------|------|
| `startLine` / `endLine` | 源文件中的实际行号（1-based），基于换行符 `\n` 计数 | 生成引用时从原始 Markdown 源码计算 |
| `renderStartLine` / `renderEndLine` | 渲染后的显示行号，基于 ProseMirror 文档的块级换行计数 | 由编辑器内部在渲染时计算 |

**导航行为必须基于 `startLine/endLine`（源码行号）**，原因：
1. 编辑器的 source 模式直接操作源码文本，源码行号与编辑器光标位置一一对应。
2. Rich 模式通过 `sourceLineMapping.ts` 将源码行号映射到 ProseMirror 位置，该映射也是基于源码行号。
3. `renderStartLine/renderEndLine` 仅在显示层面有意义，不适合作为跳转依据。

`renderStartLine/renderEndLine` 在本阶段不参与导航逻辑，保留在数据结构中以备后续显示优化使用（如渲染行号提示）。

### 2. 统一导航模块

导航入口应落在通用 hooks 层，而不是继续新增一个仅服务聊天引用的 composable。原因是这条能力后续不仅会被 `BChatSidebar` 使用，也会自然扩展到搜索结果、日志定位、命令面板等入口。

建议模块路径：

```
src/utils/fileReference/
  types.ts                      # 类型定义
  parseToken.ts                 # 纯解析函数，不依赖任何运行时上下文
src/hooks/useNavigate.ts        # 通用导航入口，新增 openFile(options)
src/views/editor/hooks/useFileSelection.ts # editor 页面消费一次性定位意图
src/stores/fileSelectionIntent.ts          # 一次性定位意图状态
```

#### 2a. 统一解析入口

现有代码中 `BubblePartUserInput.vue` 和 `chipResolver.ts` 各自维护了一套解析逻辑，这是后续 bug 的高发点。必须统一抽取：

```ts
// src/utils/fileReference/parseToken.ts

/**
 * 文件引用 token 解析结果，两处入口共用。
 */
export interface ParsedFileReference {
  /** 原始引用路径，如 `/a/b.md` 或 `unsaved://id/name.md` */
  rawPath: string;
  /** 解析后的文件路径；unsaved 草稿时为 null */
  filePath: string | null;
  /** 文件 ID；unsaved 草稿从 id 解析，已保存文件可选 */
  fileId: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 源码起始行号，1-based */
  startLine: number;
  /** 源码结束行号，1-based */
  endLine: number;
  /** 渲染起始行号，1-based */
  renderStartLine: number;
  /** 渲染结束行号，1-based */
  renderEndLine: number;
  /** 原始行号文本展示，如 "3-5"，仅用于展示回退 */
  lineText: string;
  /** 是否为未保存草稿引用 */
  isUnsaved: boolean;
}

/**
 * 解析文件引用 token，兼容真实路径与 unsaved 引用。
 * 纯函数，不依赖 Vue 上下文或 store，便于单元测试。
 *
 * 格式: #filePath startLine-endLine|renderStartLine-renderEndLine
 *       或 unsaved://id/fileName startLine-endLine
 *
 * @param tokenContent - token 内部内容，不含 {{...}} 包裹符
 * @returns 解析结果；格式不合法时返回 null
 */
export function parseFileReferenceToken(tokenContent: string): ParsedFileReference | null
```

`BubblePartUserInput.vue` 和 `chipResolver.ts` 都改为调用该统一函数：
- `BubblePartUserInput` 的 `parseSegments()` 内部用 `parseFileReferenceToken()`
- `chipResolver.ts` 的 `parseFileRef()` 已移除，改用 `parseFileReferenceToken()`

`lineText` 字段仅负责展示，**不作为导航数据源**。导航使用 `startLine`/`endLine` 数值字段。

#### 2b. 通用导航 Hook

通用入口直接收口到 `src/hooks/useNavigate.ts`。该 hook 已经承载 Markdown/富文本链接跳转，继续在这里补充“打开文件，可选附带行范围定位”最自然，也能避免引入新的专用 composable。

建议扩展为：

```ts
// src/hooks/useNavigate.ts

/**
 * 文件选区范围
 */
export interface FileSelectionRange {
  /** 起始行号（1-based） */
  startLine: number;
  /** 结束行号（1-based） */
  endLine: number;
}

/**
 * 打开文件参数
 */
export interface OpenFileOptions {
  /** 文件绝对路径；已保存文件优先使用 */
  filePath?: string | null;
  /** 文件 ID；未保存草稿或已知文件记录时使用 */
  fileId?: string | null;
  /** 展示用文件名，便于日志或错误提示 */
  fileName?: string;
  /** 打开后可选定位到的源码行范围 */
  range?: FileSelectionRange;
}

export function useNavigate() {
  // 现有 onLink(event) ...

  /**
   * 打开文件；如提供 range，则在 editor 就绪后补一次选区定位。
   * @param options - 打开文件参数
   */
  async function openFile(options: OpenFileOptions): Promise<void> {
    // 1. 通过 filePath / fileId 打开文件
    // 2. 如存在 range，则写入一次性 fileSelectionIntent
    // 3. 失败时统一 toast
  }

  return {
    onLink,
    openFile,
  }
}
```

#### 2c. 两处入口的集成方式

**`BubblePartUserInput.vue`**（Vue 组件上下文）：
```ts
const { openFile } = useNavigate()

function onChipClick(rawPath: string, startLine: number, endLine: number) {
  const target = buildNavigationTarget(rawPath, startLine, endLine)
  if (!target) return

  openFile({
    filePath: target.filePath,
    fileId: target.fileId,
    fileName: target.fileName,
    range: {
      startLine: target.startLine,
      endLine: target.endLine,
    },
  })
}
```

**`chipResolver.ts`**（CodeMirror widget，非 Vue 上下文）：
```ts
// 不要直接在 widget 中处理 router/filesStore
// 改为通过参数注入，在 Vue 层传入：

export function createFileRefExtension(options: {
  onOpenFile: (target: FileReferenceNavigationTarget) => void
}) {
  // FileRefWidget.toDOM() 中通过闭包调用 options.onOpenFile
}
```

Vue 层初始化时注入：
```ts
const { openFile } = useNavigate()
const extension = createFileRefExtension({
  onOpenFile: (target) => openFile({
    filePath: target.filePath,
    fileId: target.fileId,
    fileName: target.fileName,
    range: {
      startLine: target.startLine,
      endLine: target.endLine,
    },
  }),
})
```

这样 widget 不直接依赖 Vue 运行时上下文，边界干净。

#### 2d. 点击入口统一调用链

```
点击 chip → parseFileReferenceToken(tokenContent)
         → 组装 FileReferenceNavigationTarget（rawPath, kind, filePath, fileId, startLine, endLine）
         → useNavigate.openFile({ filePath, fileId, fileName, range })
           → useOpenFile.openFileByPath(path) 或 useOpenFile.openFileById(id)
           → fileSelectionIntentStore.setIntent({ intentId, fileId, startLine, endLine })
```

### 3. useOpenFile 收口打开行为

文件打开的底层链路仍必须复用 `src/hooks/useOpenFile.ts`，避免每个调用点自行拼装 `filesStore + router`。`useNavigate.ts` 只负责对外统一入口，不重复实现打开逻辑。

建议在 `useOpenFile.ts` 中新增：

```ts
/**
 * 通过磁盘路径打开文件。
 * @param path - 文件绝对路径
 * @returns 打开的文件记录；失败时返回 null
 */
openFileByPath: (path: string) => Promise<StoredFile | null>;
```

行为规则：

- 有 `filePath` 时，调用 `openFileByPath(path)`。
- 只有 `fileId` 时，调用 `openFileById(id)`。
- 两者都没有时，视为非法引用并提示错误。

这样聊天模块、搜索模块等调用方都只依赖 `useNavigate().openFile()`，而 `useNavigate` 内部再依赖 `useOpenFile`。

#### 实现细节

`openFileByPath` 需保持与现有 `openNativeFile` 一致的时序：先 touch 文件记录，再 push 路由。

```ts
/**
 * 通过磁盘路径打开文件。
 *
 * 返回前保证：
 * 1. StoredFile 已进入 filesStore
 * 2. 路由跳转已完成（或至少已发起）
 * 3. 返回的 `StoredFile.id` 可直接用于写入文件选区意图
 *
 * @param path - 文件绝对路径
 * @returns 打开的文件记录；失败时返回 null
 */
async function openFileByPath(path: string): Promise<StoredFile | null> {
  const openedFile = await filesStore.openOrCreateByPath(path)
  if (!openedFile) return null

  await router.push({ name: 'editor', params: { id: openedFile.id } })
  return openedFile
}
```

`filesStore.openOrCreateByPath(path)` 内部有 `inflightPaths` 去重机制：如果同一路径正在打开中，后续调用会直接返回。当用户快速连续点击同一个文件引用 chip 时，第二次点击在第一次尚未完成前触发，`openOrCreateByPath` 会返回 `null`。**这种行为是正确的**——无需额外重试，因为第一次导航已经生效。

### 4. 一次性文件选区意图状态

需要一个轻量、一次性消费的定位状态，建议新增独立 store 或模块级状态，例如：

```ts
/**
 * 待消费的文件选区意图
 */
export interface FileSelectionIntent {
  /** 本次意图唯一标识，防止同值不同次的 watch 遗漏 */
  intentId: string;
  /** 目标文件 ID */
  fileId: string;
  /** 起始行号（1-based） */
  startLine: number;
  /** 结束行号（1-based） */
  endLine: number;
}
```

`intentId` 用于防止用户连续点击同一文件同一行号时，watch 因值相同而不触发的问题。每次写入意图时生成新 ID。

状态语义：

- 只保留一条最近的待消费意图。
- 打开文件成功后写入。
- editor 页面命中对应 `fileId` 且处理完成后立即清空。
- 如果文件打开失败，不写入该状态。

推荐原因：

- 导航意图不需要跨刷新持久化。
- 这是短生命周期 UI 状态，不适合进入 URL 或 recent storage。

### 竞争处理

当用户快速连续点击不同文件的 chip 时，存在一次性意图被覆盖的风险：

- 点击文件 A → 写入 `{ fileId: A, ... }` → 路由跳转中
- 点击文件 B → 覆盖为 `{ fileId: B, ... }` → 路由跳转
- 文件 A 的 editor 挂载 → 当前 `intent.fileId` 已是 B，不匹配，**A 的跳转意图丢失**

**方案**：在 `useNavigate().openFile()` 中引入轻量锁，当前打开流程未完成时忽略新的请求。实现方式：

```ts
let navigating = false

export async function openFile(options: OpenFileOptions): Promise<void> {
  if (navigating) return // 忽略连续点击
  navigating = true
  try {
    // ... 打开文件、写入 fileSelectionIntent
  } finally {
    navigating = false
  }
}
```

选择加锁而非队列的理由：
- 文件引用导航是一次性 UI 意图，用户连续点击不同 chip 大概率是误操作，排队反而会让 editor 异常跳转两次。
- 加锁实现极简，无需处理队列清空、超时等边缘场景。
- `navigating` 锁的持有时间很短（openOrCreateByPath + router.push），用户体感上几乎感知不到。

### 5. editor 页面消费文件选区意图

消费逻辑不应散落在 `src/views/editor/index.vue` 中，而应封装为 editor 页面专属 hook，保持与 `src/views/editor/hooks` 现有风格一致。建议新增 `src/views/editor/hooks/useFileSelection.ts`，在其中负责 watch 与消费。**重要**：editor 页面在 `<keep-alive>` 中缓存，`onMounted` 仅触发一次，不能在其中消费意图。应使用 `watch` 监听条件变化：

```ts
// src/views/editor/hooks/useFileSelection.ts
// 同时监听：当前文件 ID、intentId、editor ready 状态、editorRef 实例
watch(
  [
    () => fileState.value?.id,
    () => fileSelectionIntent.value?.intentId,
    () => isEditorReady.value,
    editorRef,
  ],
  async ([currentFileId, intentId, editorReady, editorInstance]) => {
    const intent = fileSelectionIntent.value

    if (!intent) return
    if (!editorReady) return
    if (!editorInstance) return
    if (currentFileId !== intent.fileId) return

    // 等待 DOM 更新，确保 editor 内部已完成渲染
    await nextTick()

    const consumed = await editorInstance.selectLineRange(
      intent.startLine,
      intent.endLine,
    )

    if (consumed) {
      // 按 intentId 清除，避免误清用户后续点击产生的新意图
      clearFileSelectionIntent(intent.intentId)
    }
  },
  { immediate: true },
)
```

消费需同时满足：

- 当前 editor 的 `fileState.id` 等于 `intent.fileId`
- `isEditorReady` 为 true（BMarkdown 已 emit ready 事件）
- `fileSelectionIntent.value.intentId` 已变化（watch 依赖 intentId 确保同值重入也能触发）
- `nextTick()` 后再调用 `selectLineRange`，确保 CodeMirror/Tiptap 内部 DOM 已就绪

消费动作：

```ts
editorRef.value?.selectLineRange(intent.startLine, intent.endLine)
```

消费完成后立即按 `intentId` 清空状态，避免：

- 组件重渲染时重复选中
- tab keepalive 激活时再次触发
- 用户已经开始编辑后又被旧意图打断
- 误清除用户后续点击新文件产生的新意图

## BMarkdown 公共接口设计

为避免 editor 页面直接感知 rich/source 差异，需要在 `src/components/BMarkdown/index.vue` 暴露统一方法，并补充到 `src/components/BMarkdown/adapters/types.ts`：

```ts
export interface BMarkdownPublicInstance {
  // 现有方法...

  /**
   * 按源码行号选中并滚动到对应范围。
   * @param startLine - 起始行号（1-based）
   * @param endLine - 结束行号（1-based）
   * @returns true 表示选区成功设置，false 表示映射失败（此时 editor 保留原有状态）
   */
  selectLineRange: (startLine: number, endLine: number) => boolean | Promise<boolean>;
}
```

返回布尔值的目的：editor 页面需要知道文件选区意图是否已被成功消费。Rich 模式映射失败时返回 `false`，由消费方决定是否保留该意图以便重试。

`BMarkdown` 内部只负责分发：

- source 模式委托给 `PaneSourceEditor`
- rich 模式委托给 `PaneRichEditor`

**注意**：`BMarkdown/index.vue` 中有两处需要同步更新：
- `editorPublicInstance` computed（第 244 行）— 提供给子组件使用的公共实例，需要加入 `selectLineRange`
- `defineExpose`（第 261 行）— 暴露给父组件的公共方法，需要加入 `selectLineRange`
- `createNoopEditorController()` — 需要补齐 `selectLineRange` 的 noop 实现

## Source 模式选区策略

`PaneSourceEditor.vue` 基于 CodeMirror 实现，最直接。

### 选区步骤

1. 将 `startLine/endLine` 裁剪到文档有效范围。
2. 通过 `view.state.doc.line(lineNumber)` 取得首尾行。
3. 将选区范围设为：
   - `from = startLine.from`
   - `to = endLine.to`
4. `dispatch` 时同时设置：
   - `selection: EditorSelection.range(from, to)`
   - `scrollIntoView: true`
5. 调用 `view.focus()`

### 高亮语义

source 模式直接使用真实选区作为可见高亮，不需要额外装饰层。

如果后续发现主题下选中不够明显，再考虑复用 `sourceSelectionAssistant.ts` 的 decoration 方案，但本阶段不额外引入第二套高亮来源。

**空行场景**：当目标行为空行时 `line.from === line.to`，选区为零宽，视觉高亮可能不明显。当前阶段接受这一局限，记录为已知风险。如需解决，可在后续引入轻量 line decoration。

## Rich 模式选区策略

`PaneRichEditor.vue` 需要把源码行号映射到富文本文档范围。

### 映射原则

- 外部传入的 `startLine/endLine` 始终以源码行号为准。
- rich 模式内部需要把源码行号转换为 ProseMirror `from/to`。
- 转换成功后，再设置真实选区并显示高亮。

### ⚠️ 反向映射缺失与实现方案

当前 `src/components/BMarkdown/adapters/sourceLineMapping.ts` 仅提供**正向映射**（ProseMirror 位置 → 源码行号），包括：
- `getNodeSourceLineRange(node)` — 从节点 attrs 读取源码行号
- `getSelectionSourceLineRange(doc, from, to)` — 选区聚合源码行号
- `getSelectionSourceLineRangeFromMarkdown(doc, from, to, markdown)` — 基于 Markdown lexer 的行号映射

**这些函数都是 ProseMirror 位置 → 源码行号方向，不存在反向（源码行号 → ProseMirror 位置）映射**。Rich 模式导航需要的是反向映射，必须从零实现。

#### 建议新增的反向映射结果类型

```ts
interface LineRangeMappingResult {
  /** ProseMirror 文档起始位置 */
  from: number;
  /** ProseMirror 文档结束位置 */
  to: number;
  /** 是否精确覆盖了完整的行号范围 */
  exact: boolean;
}
```

#### 建议新增的反向映射函数

```ts
/**
 * 根据源码行号范围，在 ProseMirror 文档中查找对应的位置范围。
 *
 * @param doc - 当前 ProseMirror 文档
 * @param startLine - 源码起始行号（1-based）
 * @param endLine - 源码结束行号（1-based）
 * @returns 映射结果；完全无法定位时返回 null
 */
export function mapSourceLineRangeToProseMirrorRange(
  doc: ProseMirrorNode,
  startLine: number,
  endLine: number
): LineRangeMappingResult | null
```

返回值语义：
- 返回 `{ from, to, exact: true }`：精确覆盖完整行号范围，可直接设置选区。
- 返回 `{ from, to, exact: false }`：无法精确覆盖，但找到了最近可达的块级位置（回退 + 聚焦）。
- 返回 `null`：完全无法定位到任何位置。

#### 消费策略（`selectLineRange` 内部）

```ts
const result = mapSourceLineRangeToProseMirrorRange(doc, startLine, endLine)

if (!result) {
  return false // 完全失败，不可消费
}

setTextSelection(result.from, result.to)
scrollIntoView()
setAISelectionHighlight(result.from, result.to)
focus()

return true // 成功消费（即使用了 exact: false 的回退）
```

#### 实现思路

1. 遍历 `doc` 的顶层块节点（`doc.forEach`），通过 `getNodeSourceLineRange(node)` 读取每个节点的 `sourceLineStart`/`sourceLineEnd`。
2. 找到 `sourceLineStart <= endLine && sourceLineEnd >= startLine`（有交集）的所有节点。
3. 对命中的节点，计算精确的文档内偏移：
   - 块内起始偏移 = `(startLine - blockSourceStartLine)` 行对应的块内位置
   - 块内结束偏移 = `(endLine - blockSourceStartLine)` 行对应的块内位置
   - 最终 `from = nodePos + 1 + blockLocalFrom`，`to = nodePos + 1 + blockLocalTo`
4. 对连续命中的节点做范围合并，返回最终的 `{ from, to }`。
5. 如果没有节点命中，返回 `null`，回落处理。

#### 风险点

- **复杂块结构**（代码块、表格、嵌套列表）：块内换行计数可能与源码行号不完全一致。
- **Front matter**：如果 front matter 被解析为独立节点但未正确设置 `sourceLineStart`/`sourceLineEnd`，会影响对齐。
- **隐式空段落**：由 Markdown 空行生成的隐式 `paragraph` 节点可能没有源码行号属性，会影响行号偏移计算。

**建议**：将反向映射实现拆为独立前置任务，在实现步骤中作为 Rich 模式实现的前置步骤，并编写充分的单元测试覆盖边界场景。

### 选区步骤

1. 将源码行号裁剪到有效范围。
2. 基于现有行号映射能力，找到覆盖该源码行范围的文档位置。
3. 调用 Tiptap `TextSelection.create(state.doc, from, to)` 设置选区。
4. 滚动到可见区域。
5. 调用 `setAISelectionHighlight` 或等价能力，增强视觉高亮。
6. `editor.commands.focus()`

### 为什么 rich 模式不只依赖原生选区

rich 模式当前已经有“真实选区”和“AI 高亮”两套视觉语义。直接只依赖原生选区，可能在某些节点结构下不够稳定，也不利于与当前选区工具行为保持一致。因此本次建议：

- 真实选区负责语义上的选中范围
- `AISelectionHighlight` 负责稳定的视觉高亮

高亮清理规则：

- 导航完成后先保留高亮。
- 高亮由 `AISelectionHighlight` 管理，其现有行为是：用户下一次主动更改选区或编辑内容时，其他调用点（如 AI 回复流）会调用 `clearAISelectionHighlight()` 清除。**本阶段复用该现有清理机制，不新增清理逻辑**。

## 入口改造

### BubblePartUserInput.vue

当前组件 `FileRefSegment` 仅有 `fullPath`、`fileName`、`lineText`（如 `"3-5"` 字符串），改造需三步：

1. **`parseSegments()` 改用统一解析函数** `parseFileReferenceToken()`，不再从 `lineText` 字符串反推行号。`lineText` 仅用于展示回退。
2. **扩展 `FileRefSegment` 类型**，新增数值字段和 `fileId`（见下方类型定义）。
3. **chip 点击时调用通用入口** `useNavigate().openFile(options)`。

新类型定义：

```ts
interface FileRefSegment {
  type: 'fileRef';
  /** 完整路径；未保存草稿时为 null */
  fullPath: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 原始行号文本（如 "3-5"，保留用于显示回退，不作为导航数据源） */
  lineText: string;
  /** 源码起始行号（1-based） */
  startLine: number;
  /** 源码结束行号（1-based） */
  endLine: number;
  /** 文件 ID，仅 unsaved:// 草稿引用有值 */
  fileId: string | null;
  /** 是否为未保存草稿引用 */
  isUnsaved: boolean;
}
```

集成方式（Vue 组件上下文）：

```ts
const { openFile } = useNavigate()

function onChipClick(segment: FileRefSegment) {
  const target = buildNavigationTargetFromSegment(segment)
  if (!target) return

  openFile({
    filePath: target.filePath,
    fileId: target.fileId,
    fileName: target.fileName,
    range: {
      startLine: target.startLine,
      endLine: target.endLine,
    },
  })
}
```

交互要求：

- 鼠标 hover 显示可点击态（`cursor: pointer`，替换当前的 `cursor: default`）
- 使用 `button` 语义或补齐键盘可访问性（`tabindex="0"`、`role="button"`、`Enter/Space` 触发导航）
- 保留 `title` 展示完整路径

### chipResolver.ts

`FileRefWidget` 也要复用同一个通用打开函数，但**不能直接在 widget 内处理路由与文件存储**。

采用参数注入方式：

```ts
// chipResolver.ts 改造：通过闭包接收导航回调
export function createFileRefChipResolver(onOpenFile: (target: FileReferenceNavigationTarget) => void): ChipResolver {
  return (content) => {
    if (!content.startsWith('#')) return null

    const parsed = parseFileReferenceToken(content)
    if (!parsed) return null

    return {
      widget: new FileRefWidget({
        location: parsed,
        onNavigate: () => {
          const target = buildNavigationTarget(parsed)
          if (target) onOpenFile(target)
        }
      })
    }
  }
}
```

Vue 层初始化时注入：
```ts
const { openFile } = useNavigate()
const extension = createFileRefChipResolver((target) => openFile({
  filePath: target.filePath,
  fileId: target.fileId,
  fileName: target.fileName,
  range: {
    startLine: target.startLine,
    endLine: target.endLine,
  },
}))
```

注意点：

- CodeMirror widget 不在 Vue 模板内，需要在 `toDOM()` 里绑定点击与键盘事件。
- `ignoreEvent()` 必须继续返回 `false`，确保 widget 可以接收交互。
- **事件策略**：`mousedown` 需要 `preventDefault()` 防止 CodeMirror 把光标移入 widget 附近；`click` 负责执行导航逻辑。
  ```ts
  dom.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  dom.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    await onOpenFile(target)
  })
  ```
- **键盘可访问性**：widget 也需补齐，与 `BubblePartUserInput` 保持一致。
  ```ts
  dom.tabIndex = 0
  dom.setAttribute('role', 'button')
  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenFile(target)
    }
  })
  ```
- 不允许在 widget 内直接写 router/filesStore 逻辑，只调用共享打开入口 `onOpenFile`（通过参数注入，见第 2 节）

## 错误处理

**错误反馈由通用打开入口统一负责**，遵循以下原则：

- **可恢复的用户错误**（文件不存在、草稿丢失）→ `useNavigate().openFile()` 中 toast 提示，不抛异常。
- **降级场景**（行号越界、映射失败）→ 静默降级，不 toast。这些场景下文件已成功打开，用户可以看到目标文件，只是选区未精确命中。
- **编程错误**（非法参数）→ `resolveFileReferenceTarget` 返回 null，调用方据此判断。

内部错误码建议：

```ts
type FileReferenceNavigationError =
  | 'INVALID_REFERENCE'     // 非法引用格式，无法解析
  | 'FILE_NOT_FOUND'        // filePath 指向的磁盘文件不存在
  | 'UNSAVED_FILE_NOT_FOUND' // unsaved:// 草稿已被清理
  | 'OPEN_FAILED'           // openOrCreateByPath 失败（非预期）
  | 'LINE_MAPPING_FAILED'   // 行号到文档位置映射完全失败
```

用户侧 toast 简化提示：
- 文件不存在 → `未找到引用文件`
- 草稿丢失 → `未找到引用草稿`
- 打开失败 → `打开引用文件失败`
- 其他错误 → 静默处理（用于 console 日志排查）

### 文件不存在或草稿丢失

场景：

- `filePath` 指向的磁盘文件已不存在
- `unsaved://id/fileName` 对应的 recent 记录已被清理

处理：

- 不写入文件选区意图
- 通过统一 toast 提示“未找到引用文件”

### 行号异常

场景：

- `startLine <= 0`
- `endLine < startLine`
- 行号超过当前文档总行数

处理：

- 导航入口先做基础规范化：
  - `startLine = Math.max(1, startLine)`
  - `endLine = Math.max(startLine, endLine)`
- editor 端再按当前文档总行数裁剪

### editor 映射失败

主要是 rich 模式可能无法把源码行号精确映射到文档范围。

处理建议：

- 优先回退到“定位到最近可用位置并聚焦”
- 不因为映射失败影响文件打开本身
- 保持 toast 静默，除非完全无法定位

## 实现步骤

1. **抽取统一文件引用解析器** `parseFileReferenceToken()`，覆盖 saved path 和 `unsaved://id/fileName`，替代 `BubblePartUserInput.vue` 和 `chipResolver.ts` 各自维护的解析逻辑。
2. **新增 `fileSelectionIntent` 状态**，带 `intentId`，支持按 ID 精确清空。
3. 在 `useOpenFile.ts` 中补充 `openFileByPath()`，明确返回语义（路由跳转完成后 `StoredFile.id` 可直接用于定位意图）。
4. **扩展 `useNavigate.ts`**，新增通用 `openFile(options)`，内部调用 `useOpenFile()` 和 `fileSelectionIntent`，封装完整的“打开文件 → 写入意图 → 错误 toast”流程。
5. 改造 `BubblePartUserInput.vue`：`parseSegments()` 改用统一解析器，chip 点击调用 `openFile(options)`。
6. 改造 `chipResolver.ts`：通过参数注入 `onOpenFile`，widget 绑定 `mousedown` / `click` / `keydown` 事件。
7. （前置）在 `sourceLineMapping.ts` 中新增反向映射函数 `mapSourceLineRangeToProseMirrorRange()`，返回 `LineRangeMappingResult | null`，区分精确覆盖和回退定位。
8. 为 `BMarkdown` 暴露 `selectLineRange(startLine, endLine): boolean | Promise<boolean>` 公共方法，同步更新 `types.ts`、`editorPublicInstance` computed、`defineExpose` 和 `createNoopEditorController()`。
9. Source 模式实现 CodeMirror 行号选区和滚动。
10. Rich 模式基于步骤 7 的反向映射，实现源码行号到 ProseMirror range 的转换、真实选区设置与 AI 高亮。**强依赖步骤 7 的输出，应在反向映射通过单元测试后再开始**。
11. **新增 `src/views/editor/hooks/useFileSelection.ts`**，在其中 watch 当前文件 ID、`intentId`、editor ready 状态，通过 `nextTick()` 后调用 `selectLineRange`，成功消费后按 `intentId` 清空。
12. 补充交互与回归测试。

## 测试建议

- 点击用户消息中的已保存文件 chip，能打开目标文件并选中对应行。
- 点击输入框中的已保存文件 chip，能打开目标文件并选中对应行。
- 点击 `unsaved://` 草稿 chip，能打开对应草稿并选中对应行。
- 行号超出范围时，能裁剪到最后一行且不报错。
- rich/source 两种模式下都能正确滚动到可见区域。
- 消费一次文件选区意图后，再次切回同文件不会重复触发定位。
- 打开失败时只提示错误，不会错误路由到其他文件。
- **（新增）`parseFileReferenceToken` 单元测试**：覆盖 saved path、`unsaved://id/fileName`、非法格式等边界用例。
- **（新增）`mapSourceLineRangeToProseMirrorRange` 单元测试**：验证在普通段落、代码块、front matter、嵌套列表、空行等场景下返回正确的 LineRangeMappingResult。

## 影响范围

- `src/hooks/useNavigate.ts` — 新增通用 `openFile(options)` 文件打开入口
- `src/hooks/useOpenFile.ts` — 新增 `openFileByPath`
- `src/utils/fileReference/`（新增目录）
  - `types.ts` — 类型定义
  - `parseToken.ts` — 统一解析器
- `src/stores/fileSelectionIntent.ts` — 一次性文件选区意图状态
- `src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue`
- `src/components/BChatSidebar/utils/chipResolver.ts`
- `src/views/editor/hooks/useFileSelection.ts`
- `src/views/editor/index.vue`
- `src/components/BMarkdown/adapters/types.ts`
- `src/components/BMarkdown/adapters/sourceLineMapping.ts`
- `src/components/BMarkdown/index.vue`
- `src/components/BMarkdown/components/PaneSourceEditor.vue`
- `src/components/BMarkdown/components/PaneRichEditor.vue`

## 风险与后续

### 风险

1. **🔴 高：Rich 模式反向映射缺失** — `sourceLineMapping.ts` 当前仅有正向映射，反向映射 `mapSourceLineRangeToProseMirrorRange` 需从零实现。这是整个特性中工作量最大、风险最高的部分。复杂块结构（代码块、表格、嵌套列表）和 front matter 场景下可能存在行号对齐偏差。
2. **🟡 中：输入框 widget 焦点干扰** — CodeMirror widget 的事件处理（mousedown preventDefault + click 导航）需要验证点击后编辑器焦点和光标行为正常。
3. **🟡 中：keep-alive 下的意图消费时序** — 需确保 `watch` 依赖 `intentId`、`isEditorReady`、`nextTick()` 后的 `selectLineRange` 调用能在页面激活和 editor 实例就绪时正确消费。
4. **🟡 中：Source 模式空行高亮不明显** — 当目标行为空行时，CodeMirror 选区为零宽（`line.from === line.to`），视觉高亮可能不可见。当前阶段接受此限制，后续可引入行级 decoration 解决。
5. **🟢 低：inflightPaths 重复点击** — `filesStore.openOrCreateByPath` 的去重机制使快速连续点击同一文件时第二次调用返回 `null`，`useNavigate().openFile()` 的 `navigating` 锁进一步保证串行，无需额外处理。

### 后续可扩展方向

- 让助手消息中的文件引用渲染也复用同一导航入口。
- 将“导航到文件引用”抽象为通用资源导航能力，服务搜索结果、日志定位等其他入口。
- 允许在打开后以临时高亮装饰代替真实选区，减少对用户当前 selection 的侵入。
