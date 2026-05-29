# 2026-05-28 BEditor Rich Large Document Loading Design

## 背景

`src/components/BEditor` 的 Markdown 富文本模式当前基于 Tiptap。打开或切回 Rich 模式时，`src/components/BEditor/hooks/useRichEditor.ts` 会通过 `contentType: 'markdown'` 把整篇 Markdown 同步交给 Tiptap；后续外部内容变化时，`src/components/BEditor/hooks/useContent.ts` 也会调用整文 `setContent`。

对大文档来说，这条路径会在主线程上连续完成三件事：

1. Markdown 词法解析和 Tiptap JSON 构建。
2. JSON 转换为 ProseMirror document。
3. ProseMirror view 整文替换并创建对应 DOM / NodeView。

临时诊断结果显示，一个约 18 万字符、约 1.2 万行、约 1.8 万节点的 Markdown 文档中，Markdown 解析约 1.5 秒，JSON 装入编辑器约 0.8 秒，整次 `setContent(markdown)` 约 2.4 秒。`getMarkdown()` 回写只占几十毫秒，因此主要瓶颈是 Rich 加载，而不是保存序列化。

这组数字只作为方向性证据，不作为阈值依据。正式实现前需要补一轮性能基线：

- 记录运行环境，例如机型、系统、Electron/Chromium 版本、是否 CPU throttle。
- 对同一 fixture 至少运行多次，记录 P50 / P95，而不是只看单次结果。
- 分别记录 Markdown parse、JSON 装载、DOM / NodeView 创建、单帧峰值阻塞和总耗时。
- 对比分帧 transaction 与一次性 transaction，确认是否真的降低单帧峰值且总耗时可接受。

## 问题定义

不能只把大文档默认切到 Source 模式，因为用户手动切回 Rich 时仍然会卡顿。真正要处理的是 Rich 模式加载大文档时的主线程阻塞、加载期间内容一致性，以及取消/回写/撤销历史等竞态。

## 目标

1. 切回 Rich 模式时，不让 UI 长时间完全冻结。
2. 加载期间禁止用户编辑，避免分帧装载和用户输入交错。
3. 加载事务不触发对外内容回写，不污染保存状态。
4. 加载事务不进入 undo/redo 历史。
5. 文件切换、模式切换、外部内容变化时，可以取消旧加载。
6. 加载完成后，Rich 模式保持现有编辑、选区工具、评论、查找、源码行号映射能力。
7. 小文档路径尽量保持现状，避免引入不必要延迟。
8. 初始只对超过阈值的大文档启用异步/分帧加载，避免小文档退化。

## 非目标

1. 不在本轮实现真正的虚拟 Rich 编辑器。
2. 不重写 Tiptap / ProseMirror 的文档模型。
3. 不移除 Source 模式。
4. 不改变 Markdown 持久化格式。
5. 不改变现有 `EditorController` 对外协议，除非加载状态需要暴露给内部 UI。

## 根因分析

Tiptap/ProseMirror 不是虚拟滚动编辑器。只要 Rich 模式承载整篇文档，就必须在某个时刻拥有完整 ProseMirror document。即使把加载拆成多帧，总耗时也不会凭空消失；能改善的是主线程连续阻塞时间、用户感知卡死，以及加载期间的可取消性。

当前最大风险点是 `setContent(markdown)` 的同步整文路径。它既会占用主线程，也会直接走 Tiptap update 机制。若简单改成多次 `insertContent`，会引出新的问题：

- 每个分片都可能触发 `onUpdate`。
- 每个分片可能进入 undo history。
- 用户在加载中编辑会和后续分片竞争同一份 document。
- 外部 model 变化后，旧分片可能继续写入过期文档。
- 大纲、源码行号、标题 ID 可能在未完成状态下被读取。
- ProseMirror plugin state 每次 transaction 都会重新计算，分片过细可能使总耗时高于一次性装载。

需要注意，跨块依赖必须基于完整 Markdown 解析结果处理。脚注、引用定义、链接定义等结构可能由前文引用、后文定义共同组成，因此不能按原始 Markdown 字符串切片后分别解析。分帧只能发生在完整 Tiptap JSON 生成之后。

## 方案对比

### 方案 A：加载期锁编辑 + 分阶段/分帧装载

切回 Rich 时进入 loading 状态，禁止编辑。Markdown 解析和 ProseMirror 装载拆成可取消任务。加载事务打上内部 meta，跳过对外回写和历史记录。加载完成后一次性记录导入快照并恢复编辑。

优点：

- 保留现有 Rich 编辑器能力。
- 改动集中在 Rich 内容加载层。
- 能解决用户感知的长时间卡死和竞态。

缺点：

- 总加载耗时仍然存在。
- ProseMirror 仍需完整 document。
- 分帧插入需要仔细处理事务 meta、标题 ID、源码行号和加载完成快照。

### 方案 B：Worker 预解析 + 主线程装载

Worker 只负责 Markdown -> Tiptap JSON，主线程仍负责 JSON -> ProseMirror EditorView。不能把完整 Tiptap 编辑器搬进 Worker，因为 ProseMirror view、Vue NodeView、DOM 都只能在主线程。

优点：

- 能移走耗时最大的解析阶段（约 1.5s）。
- 主线程冻结时间减少明显。
- 比分块 ProseMirror 装载更容易控制一致性。

缺点：

- 仍有 JSON 装入 ProseMirror 的同步阻塞（约 0.8s）。
- Worker 中复用 Tiptap MarkdownManager 需要拆分扩展依赖（Vue NodeView 不可 Worker 化）。
- Vue NodeView 不应进入 Worker，只能解析 JSON，不能创建 view。

### 方案 C：虚拟 Rich / 局部块编辑

整篇文档用轻量 Markdown 渲染或虚拟列表展示，只对当前编辑块创建 Tiptap 实例。

优点：

- 真正适合超大文档。
- 避免单个 Tiptap 实例承载整篇文档。

缺点：

- 架构改动大。
- 选区跨块、评论、AI 引用、表格、代码块、源码行号映射都需要重设边界。
- 不适合作为当前问题的第一阶段修复。

## 推荐方案

方案 A 提供加载状态机、取消令牌、事务 meta、加载期禁写和测试边界；方案 B 解决 Markdown parse 的主线程阻塞。两者互补——方案 B 接入方案 A 的状态机，共享同一套取消/事务 meta/加载完成快照机制。

> 三个核心原则：
> 1. `useRichEditorLoad` 管加载状态和取消；`useContent` 只管内容快照和受控 dispatch helper。
> 2. 大文档 loading 期间外部内容变化必须取消并重启，不能跳过。
> 3. 所有 ProseMirror 直接 dispatch 的位置和 Fragment 操作必须先用单元测试打穿，再接入 UI。

## 整体架构

### 模块关系图

```
                             ┌────────────────────┐
                             │  PaneRichEditor.vue │ ─── 展示 loading/failed 状态
                             └────────┬───────────┘
                                      │ loadState, startLoad(), cancelLoad()
                                      │
                    ┌─────────────────▼────────────────────┐
                    │       useRichEditorLoad.ts            │
                    │  ┌─ RichLoadState 状态机              │
                    │  ├─ currentLoadToken (Symbol 取消令牌) │
                    │  ├─ startLoad(markdown): Promise<void> │
                    │  │   ├─ parseMarkdownForRichLoad()     │
                    │  │   ├─ 校验 loadToken                 │
                    │  │   └─ 分帧 dispatchLoadChunk()      │
                    │  ├─ cancelLoad(reason)                 │
                    │  └─ retryLoad()                        │
                    └──────┬──────────────┬─────────────────┘
                           │              │
              ┌────────────▼──┐   ┌──────▼──────────────────┐
              │ richMarkdown  │   │   useRichEditor.ts      │
              │ Parser.ts     │   │   (改造)                 │
              │ (Promise接口)  │   │   ├─ 大文档: 空JSON初始化│
              └──────┬────────┘   │   ├─ 提供 dispatch 入口  │
                     │            │   └─ 小文档: 保持现状    │
                     │            └──────────┬──────────────┘
                     │                       │
         ┌───────────▼──────────┐  ┌─────────▼─────────────┐
         │ (未来)               │  │  useContent.ts        │
         │ richMarkdownParser   │  │  (改造)               │
         │ .worker.ts           │  │  ├─ 识别加载事务 meta  │
         └──────────────────────┘  │  ├─ 延迟快照到加载完成  │
                                   │  └─ 加载事务不写回 model│
                                   └───────────────────────┘
```

### 大文档 Rich 加载完整数据流

```
用户切回 Rich / 外部内容变化 (字符数 > 30,000)
  │
  ├─ 1. PaneRichEditor 调用 useRichEditorLoad.startLoad(markdown)
  │      ├─ 状态: idle → loading
  │      ├─ 创建 currentLoadToken = Symbol('rich-load')
  │      ├─ editor.setEditable(false)
  │      └─ 清空 editor 为空占位文档 (clearEditorToEmptyPlaceholder)
  │
  ├─ 2. useRichEditorLoad 调用 parseMarkdownForRichLoad(markdown)
  │      └─ 当前: 主线程同步解析 → Promise<JSONContent>
  │         (未来: Worker 解析 → Promise<JSONContent>)
  │
  ├─ 3. 校验 currentLoadToken ≠ 发起时的 token → 丢弃结果，return
  │
  ├─ 4. 分帧装载 JSON 顶层 node 到 editor
  │      ├─ 每帧 12ms 时间预算或 N 个 block
  │      ├─ 每帧前校验 currentLoadToken
  │      ├─ 每个 transaction: { preventUpdate, addToHistory: false, bEditorRichLoad }
  │      └─ 最后一帧完成后执行步骤 5
  │
  ├─ 5. 装载完成
  │      ├─ assignHeadingIds(editor, { silent: true })  ← 也不进 history、不写回
  │      ├─ rememberImportedContent(markdown)  ← 统一快照
  │      ├─ editor.setEditable(editable.value)
  │      ├─ 状态: loading → ready
  │      └─ 恢复大纲、搜索、选区工具
  │
  └─ 6. 如果中途 cancelLoad()
         ├─ currentLoadToken 更新为新的 Symbol()
         ├─ 取消已排队的下一帧（scheduler 返回取消函数）
         ├─ 旧任务检查到 token 不匹配 → 停止 dispatch
         ├─ 清空 editor 为空占位文档
         └─ 状态: loading → idle
```

## 加载状态机

### 类型定义

```typescript
/**
 * Rich 编辑器加载阶段
 */
type RichLoadPhase = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * 分帧阶段
 */
type RichLoadStage = 'parsing' | 'mounting';

/**
 * 取消原因
 */
type RichLoadCancelReason =
  | 'switch-file'
  | 'switch-source'
  | 'external-change'
  | 'unmount'
  | 'retry';

/**
 * 加载状态（暴露给 UI）
 */
interface RichLoadState {
  /** 当前阶段 */
  phase: RichLoadPhase;
  /** 首次加载还是重新加载 */
  isReload: boolean;
  /** 当前子阶段 */
  stage?: RichLoadStage;
  /** 分帧装载进度：parsing 阶段为 indeterminate，mounting 阶段为 0.05→1 */
  progress: number;
  /** 失败时的错误信息，仅 failed 阶段有值 */
  errorMessage?: string;
}

/**
 * 解析接口返回结果
 */
interface RichParseResult {
  json: JSONContent;
  stats: {
    durationMs: number;
    nodeCount: number;
  };
}

/**
 * 加载完成 payload
 */
interface RichLoadCompletePayload {
  rawMarkdown: string;
  json: JSONContent;
  stats: RichParseResult['stats'];
}
```

### 状态转移

```
        ┌─────────┐
        │  idle   │◄─────────────────────┐
        └────┬────┘                       │
     startLoad()                  cancelLoad()
    (空→占位)                  (switch-source/unmount
             │                   /switch-file)
             ▼                       │
        ┌─────────┐                  │
        │ loading │─────────────────►│
        └────┬────┘  cancelLoad()    │
             │                       │
        ┌────┴────┐                  │
        │         │                  │
   parse失败   装载完成              │
        │         │                  │
        ▼         ▼                  │
   ┌────────┐ ┌───────┐             │
   │ failed │ │ ready │──► loading   │
   └───┬────┘ └───┬───┘  (外部变化)  │
       │           │                  │
  retryLoad()      │                  │
       │    switchToSource()         │
       └──────────►┼─────────────────┘
                    │
                    ▼
              componentUnmount()
              switchFile()
```

### 状态守卫规则

唯一可编辑状态：`loadState.phase === 'ready' && editable.value`

```
canEdit = loadState.phase === 'ready' && editable.value
```

| 状态 | editable | 写命令 | onEditorUpdate 写回 | undo/redo | 大纲/搜索 | AI/评论/替换 |
|------|----------|--------|---------------------|-----------|-----------|-------------|
| idle | false | 拒绝 | 拒绝 | 禁用 | 返回空/pending | 拒绝+提示 |
| loading | false | 拒绝 | 拒绝 | 禁用 | 返回空/pending | 拒绝+提示 |
| ready | true (受 props 控制) | 允许 | 允许 | 允许 | 正常 | 正常 |
| failed | false | 拒绝 | 拒绝 | 禁用 | 返回空 | 拒绝+提示 |

### `useRichEditorLoad` 函数签名

```typescript
interface UseRichEditorLoadParams {
  /** 获取当前 editor 实例 */
  getEditor: () => Editor | undefined;
  /** 加载完成回调（记录导入快照/恢复状态） */
  onLoadComplete: (payload: RichLoadCompletePayload) => void;
  /** 加载失败回调 */
  onLoadFailed: (error: string) => void;
  /** 可配置的加载超时时间 ms（默认 30,000） */
  loadTimeoutMs?: number;
  /** 分帧调度器（默认 requestAnimationFrame），返回取消函数 */
  scheduler?: (fn: () => void) => () => void;
}

interface UseRichEditorLoadResult {
  /** 当前加载状态（响应式） */
  loadState: Readonly<Ref<RichLoadState>>;
  /** 启动加载 */
  startLoad: (markdown: string, options?: { isReload?: boolean }) => Promise<void>;
  /** 取消当前加载 */
  cancelLoad: (reason: RichLoadCancelReason) => void;
  /** 重试加载 */
  retryLoad: () => Promise<void>;
  /** 判断 transaction 是否为加载事务 */
  isLoadTransaction: (transaction: Transaction) => boolean;
  /** 检查当前 token 是否匹配 */
  isCurrentToken: (token: symbol) => boolean;
  /** 获取当前加载的原始 markdown */
  getLoadSource: () => string | null;
}
```

### 取消令牌

- 内部使用 `currentLoadToken: symbol` 作为 per-instance 版本标识
- 每次 `startLoad()` 创建新 `Symbol('rich-load')`
- 每次 `cancelLoad()` 创建新 `Symbol('rich-load-canceled')` 作废旧 token
- 所有异步步骤和分帧回调在提交前必须校验 `isCurrentToken(token)`
- Worker `requestId` 另用 `string`（Symbol 不能结构化克隆）

### 调度器接口

```typescript
type RichLoadScheduler = (fn: () => void) => () => void;

// 默认实现
const DEFAULT_SCHEDULER: RichLoadScheduler = (fn) => {
  const handle = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(handle);
};

// 降级实现
const TIMEOUT_SCHEDULER: RichLoadScheduler = (fn) => {
  const handle = setTimeout(fn, 0);
  return () => clearTimeout(handle);
};

// 测试用同步实现
const SYNC_SCHEDULER: RichLoadScheduler = (fn) => {
  fn();
  return () => {};
};
```

## 事务 Meta 约定

### 加载事务 meta

所有 Rich 加载事务必须统一设置以下 transaction meta：

```
bEditorRichLoad: true       # 标识当前 transaction 属于加载流程
preventUpdate: true         # 阻止 Tiptap emit update 事件
addToHistory: false         # 禁止进入 undo/redo history
```

### 写入路径区分

| 场景 | 路径 | 事务 meta 设置方式 |
|------|------|-------------------|
| 小文档（≤ 30,000 字符）| `editor.commands.setContent(text, { emitUpdate: false })` | Tiptap command 内置 |
| 大文档分帧装载 | `editor.view.dispatch(tr.setMeta(...))` | 显式 ProseMirror transaction |
| 装载完成标题ID校正 | `assignHeadingIds(editor, { silent: true })` | 函数内部设置 |
| 清空为占位文档 | `editor.view.dispatch(tr.setMeta(...))` | 显式 ProseMirror transaction |
| 装载失败恢复 | `editor.view.dispatch(tr.setMeta(...))` | 显式 ProseMirror transaction |

大文档加载路径禁止使用 `setContent`——必须直接操作 ProseMirror transaction 以确保 `addToHistory: false` 真正生效。`emitUpdate: false` 只作为阻止 update 事件的辅助机制，不能作为 history/plugin 隔离的保证。

### 副作用隔离

`preventUpdate` 不会阻止 `transaction` 事件、ProseMirror plugin state 更新、selection update 或 NodeView position check。需要逐一处理：

- `src/components/BEditor/components/CurrentBlockMenu.vue` 监听 `transaction`，loading 状态下避免重算可交互菜单。
- `src/components/BEditor/extensions/editorSearch.ts` 等 plugin state 随 transaction 更新，loading 期间清空搜索或暂停搜索高亮。
- `src/components/BEditor/adapters/richSelectionAssistant.ts` 监听 selection update，loading 期间隐藏工具栏并跳过选区事件。

## 内容快照策略

当前 `useContent` 通过 `lastImportedRawContent` 和 `lastImportedCanonicalContent` 判断外部内容是否等价。异步加载后调整为：

1. 加载开始时不更新导入快照。
2. 分帧过程中不调用 `rememberImportedContent`。
3. 加载完成后，根据最终 editor document 计算 canonical Markdown。
4. 一次性记录：
   - `lastImportedRawContent = 原始 Markdown`
   - `lastImportedCanonicalContent = getPersistedMarkdown(editor)`
5. 只有加载完成后，外部内容 watcher 才允许用该快照判断等价。

这样可以避免半加载文档被当作真实用户编辑内容回写。

Tiptap Markdown 序列化不保证与原始 Markdown 字符串完全幂等。canonical 比较必须明确使用 parse -> serialize 后的形式：`lastImportedCanonicalContent` 表示"富文本当前文档的持久化形式"，`lastImportedRawContent` 表示"原始外部内容"。加载完成后，如果 canonical 与 raw 有细微差异，也不能立即把文档标脏；外部 watcher 应通过这对快照识别"这是刚导入的等价内容"。测试计划中必须加入加载完成后 `isDirty` 或等价保存状态仍为 false 的用例。

## 模块改造方案

### `src/components/BEditor/hooks/useRichEditor.ts`

**大文档阈值常量：**

```typescript
const LARGE_DOCUMENT_THRESHOLD = 30_000;
```

**初始化分支：**

- `bodyContent.value.length <= LARGE_DOCUMENT_THRESHOLD`：保持现状，`content: normalizeEditorContent(bodyContent.value), contentType: 'markdown'`
- `bodyContent.value.length > LARGE_DOCUMENT_THRESHOLD`：`content: EMPTY_PARAGRAPH_JSON`，不设置 `contentType`，`editable: false`

```typescript
const EMPTY_PARAGRAPH_JSON: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};
```

**`watch(bodyContent)` 改造：**

- 小文档：保持现有 `isEquivalentToImportedContent` 比较逻辑 + `setEditorContent`
- 大文档 loading 状态：
  - `content !== getLoadSource()`：`cancelLoad('external-change')` 后 `startLoad(content, { isReload: true })`
  - 相同：忽略
- 大文档 ready 状态且 external content 不等价：`startLoad(content, { isReload: true })`
- 大文档 failed 状态且 external content 变化：
  - 新内容 < 阈值：退出 loader，走小文档同步路径
  - 新内容 >= 阈值：自动 cleanup failed，启动新加载

**`handleKeyDown` 改造：**

增加 `canEdit` 守卫，非 ready 状态下只处理模式切换快捷键，不处理编辑类快捷键（Tab、undo/redo、Ctrl+A 等）。

**扩展函数签名：**

```typescript
interface UseRichEditorResult {
  editorInstance: ReturnType<typeof useEditor>;
  editorInstanceRef: Ref<Editor | undefined>;
  setContent: (text: string) => void;
  /** 判断当前文档是否为大文档 */
  isLargeDocument: ComputedRef<boolean>;
  /** 加载状态（大文档使用） */
  loadState: Readonly<Ref<RichLoadState>>;
  /** 启动 Rich 加载 */
  startLoad: (markdown: string, options?: { isReload?: boolean }) => Promise<void>;
  /** 取消当前加载 */
  cancelLoad: (reason: RichLoadCancelReason) => void;
  /** 判断 transaction 是否为加载事务 */
  isLoadTransaction: (transaction: Transaction) => boolean;
  /** 获取加载源 markdown */
  getLoadSource: () => string | null;
}
```

### `src/components/BEditor/hooks/useContent.ts`

**`onEditorUpdate` 签名变更：**

```typescript
// 原签名
onEditorUpdate: ({ editor }: { editor: Editor }) => void

// 新签名（Tiptap v3 的 Transaction 类型来自 @tiptap/pm/state）
onEditorUpdate: ({ editor, transaction }: { editor: Editor; transaction: Transaction }) => void
```

**`onEditorUpdate` 增加双重守卫（仅大文档路径传入参数时生效）：**

```typescript
onEditorUpdate({ editor, transaction }) {
  // 加载事务 → 不写回，不触发 onContentChange
  if (isLoadTransaction && isLoadTransaction(transaction)) return;
  // loading/failed/idle 状态 → 不写回（小文档不传 loadPhase 时，undefined 不走这个分支）
  if (loadPhase !== undefined && loadPhase() !== 'ready') return;
  // 现有逻辑：assignHeadingIds, getPersistedMarkdown, editorContent.value = markdown
}
```

**新增参数（可选传入，仅大文档使用）：**

```typescript
interface UseEditorContentParams {
  // ... 现有参数
  /** 判断 transaction 是否为加载事务（大文档路径传入） */
  isLoadTransaction?: (transaction: Transaction) => boolean;
  /** 当前加载阶段（大文档路径传入，小文档不传则不做守卫） */
  loadPhase?: () => RichLoadPhase;
}

interface UseEditorContentResult {
  // ... 现有方法
  /** 小文档：通过 setContent 同步装载（现有路径 + emitUpdate: false） */
  setEditorContent: (text: string, emitUpdate?: boolean) => void;
  /** 大文档：直接 dispatch ProseMirror transaction 装载 chunk（分帧用） */
  dispatchLoadChunk: (blockNodes: ProseMirrorNode[]) => void;
  /** 大文档：一次性 dispatch ProseMirror transaction 装载完整 JSON */
  dispatchLoadContent: (json: JSONContent) => void;
  /** 装载完成后记录快照 */
  onLoadComplete: (rawMarkdown: string) => void;
  /** 清空 editor 为空占位文档（带 silent meta） */
  clearEditorToEmptyPlaceholder: () => void;
}
```

**`dispatchLoadContent` 实现：**

```typescript
dispatchLoadContent(json: JSONContent) {
  const editor = getEditorInstance();
  if (!editor) return;

  const nextDoc = editor.schema.nodeFromJSON(json);
  const tr = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, nextDoc.content)
    .setMeta('preventUpdate', true)
    .setMeta('addToHistory', false)
    .setMeta('bEditorRichLoad', true);
  editor.view.dispatch(tr);
}
```

**`dispatchLoadChunk` 实现（供分帧调用，由 loader 控制调用时机）：**

```typescript
dispatchLoadChunk(blockNodes: ProseMirrorNode[]) {
  const editor = getEditorInstance();
  if (!editor) return;

  let tr = editor.state.tr;
  for (const node of blockNodes) {
    tr = tr.insert(tr.doc.content.size, node);
  }
  tr.setMeta('preventUpdate', true)
    .setMeta('addToHistory', false)
    .setMeta('bEditorRichLoad', true);
  editor.view.dispatch(tr);
}
```

注意：循环内使用 `tr.doc.content.size`（因为每次 insert 后 doc 会变），不能使用 `editor.state.doc.content.size`。

**`clearEditorToEmptyPlaceholder`：**

```typescript
clearEditorToEmptyPlaceholder() {
  const editor = getEditorInstance();
  if (!editor) return;
  const tr = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, editor.schema.nodeFromJSON(EMPTY_PARAGRAPH_JSON).content)
    .setMeta('preventUpdate', true)
    .setMeta('addToHistory', false)
    .setMeta('bEditorRichLoad', true);
  editor.view.dispatch(tr);
}
```

### `src/components/BEditor/panes/PaneRichEditor.vue`

**新增 UI 状态展示：**

- **loading 状态：** editor 上方展示 loading 蒙层
  - 首次加载文案："正在加载富文本视图"
  - 重新加载文案："正在重新生成富文本视图，当前暂不可编辑"
- **failed 状态：** editor 区域展示失败提示 + 重试按钮 + 切换回 Source 入口
  - 切换回 Source 通过 `emit('request-source-mode')` 通知父组件，不由 pane 直接改 store
- **editable 联动：** `canEdit = loadState.phase === 'ready' && props.editable`

**EditorController 写命令守卫：**

```typescript
function guardEdit(): Editor {
  const editor = getEditor();
  if (loadState.value.phase !== 'ready' || !props.editable) {
    throw new Error(
      loadState.value.phase === 'failed'
        ? '富文本加载失败，请重试或切换回源码模式'
        : '富文本正在加载，请稍后或切换到源码模式'
    );
  }
  if (!editor) throw new Error('编辑器未初始化');
  return editor;
}

// 异步写方法统一 throw（insertAtCursor, replaceSelection, replaceDocument）
async function insertAtCursor(content: string): Promise<void> {
  const editor = guardEdit();
  // ... 现有逻辑
}

async function replaceSelection(content: string): Promise<void> {
  const editor = guardEdit();
  // ... 现有逻辑
}

async function replaceDocument(content: string): Promise<void> {
  const editor = guardEdit();
  // ... 现有逻辑
}
```

- 写方法 `throw` 错误码 `RICH_EDITOR_NOT_READY`
- 快捷键返回 `true/false`（不 throw）但通过 `canEdit` 守卫跳过编辑
- 调用方若捕获 throw，应 toast 提示用户

**暴露加载状态：**

```typescript
defineExpose({
  // 现有 EditorController 方法
  undo, redo, canUndo, canRedo, focusEditor, focusEditorAtStart,
  setSearchTerm, findNext, findPrevious, clearSearch,
  getSelection, insertAtCursor, replaceSelection, replaceDocument,
  selectLineRange, getSearchState, scrollToAnchor, getActiveAnchorId,
  // 新增加载状态
  richLoadState: computed(() => loadState.value),
});
```

`richLoadState` 类型不污染 `EditorController` 核心协议，按 local expose 类型定义。

### `src/components/BEditor/Markdown.vue`

- loading 状态下禁用选区工具、评论卡片和 AI 输入入口
- 监听 `PaneRichEditor` 的 `request-source-mode` 事件，切换 viewMode

## 扩展拆分：Schema 扩展 vs Runtime 扩展

### 拆分原则

- `createRichMarkdownSchemaExtensions(editorInstanceId)`：所有 node/mark schema + Markdown parse/render 逻辑，不含 Vue NodeView、不含 DOM/Window 引用、不含运行时 Plugin。既给 Worker parse 用，也给主线程 editor 用。
- `createRichEditorRuntimeOnlyExtensions(editorInstanceId, options?)`：Search、Placeholder、AISelectionHighlight 这类只影响交互/decoration/plugin 的扩展，以及 CodeBlock/Table 的 Vue NodeView 增强。
- `useExtensions(editorInstanceId, options?) = schemaExtensions + runtimeOnlyExtensions`：保持现有调用方兼容。

**核心约束：** 同一 node/mark 的 name、attrs、schema 必须在两组扩展中完全一致。否则 Worker JSON 进主线程 schema 会失败。

### 扩展归属

| 扩展 | Schema 组 | Runtime 组 | 说明 |
|------|-----------|------------|------|
| StarterKit 子扩展（不含 History） | ✅ | ✅ | History 仅在 Runtime 组 |
| Markdown (@tiptap/markdown) | ✅ | - | 纯 Markdown 转换 |
| Heading（自定义） | ✅（parseMarkdown/schema） | ✅（ID anchor） | |
| Paragraph（自定义） | ✅（parseMarkdown/renderMarkdown） | ✅ | |
| Code/CodeBlock（自定义） | ✅（parseMarkdown/schema） | ✅（Vue NodeView） | NodeView 仅 Runtime 组 |
| ListItem（自定义） | ✅（parseMarkdown） | - | |
| MarkdownTable | ✅（parseMarkdown/schema） | ✅（Vue NodeView） | NodeView 仅 Runtime 组 |
| InlineCommentMark | ✅（parseMarkdown/schema） | ✅ | |
| HtmlComment | ✅ | - | 纯 parseMarkdown |
| LinkDefinitionAsText | ✅ | - | 纯 parseMarkdown |
| Search | - | ✅ | 纯运行时 plugin |
| AISelectionHighlight | - | ✅ | 纯运行时 plugin |
| Image | ✅（schema） | ✅ | 标准扩展 |
| TaskList/TaskItem | ✅（schema） | ✅ | 标准扩展 |
| Highlight/Strike/Underline/Color/Typography | ✅（schema） | ✅ | 标准扩展 |
| Mathematics | ✅（schema） | ✅ | 标准扩展 |
| MarkdownLink | ✅（schema） | ✅ | 标准扩展 |
| Placeholder | - | ✅ | 纯运行时 |

### 函数签名

```typescript
import type { Extension } from '@tiptap/core';

/**
 * 创建仅用于 Markdown Schema 解析的扩展集合
 * 可在 Worker 中使用（无 DOM/NodeView 依赖）
 */
function createRichMarkdownSchemaExtensions(
  editorInstanceId: string,
): Extension[];

/**
 * 创建运行时扩展集合（含 Vue NodeView、Plugin 等）
 * 仅主线程使用
 */
function createRichEditorRuntimeOnlyExtensions(
  editorInstanceId: string,
  options?: { onSearchMatchFocus?: (ctx: SearchScrollContext) => void },
): Extension[];

/**
 * 创建完整扩展集合 = Schema 组 + Runtime 组
 * 保持现有 useExtensions() 兼容性，不影响小文档路径
 */
function useExtensions(
  editorInstanceId: Ref<string>,
  options?: { onSearchMatchFocus?: (ctx: SearchScrollContext) => void },
): UseEditorExtensionsResult;
```

## 解析接口设计

### `src/components/BEditor/hooks/richMarkdownParser.ts`

**统一异步解析接口。第一阶段：主线程同步解析。第二阶段：切 Web Worker 解析。调用方永远只依赖这个 Promise 接口。**

```typescript
/**
 * @file richMarkdownParser.ts
 * @description Rich 编辑器 Markdown 解析统一异步接口
 */

interface RichParseResult {
  json: JSONContent;
  stats: {
    durationMs: number;
    nodeCount: number;
  };
}

/**
 * 解析 Markdown 为 Tiptap JSON
 *
 * @param markdown - 原始 Markdown 字符串
 * @param editorInstanceId - 编辑器实例 ID（用于 heading ID 前缀等）
 * @param requestId - 请求 ID（用于取消校验，与 loadToken 分开）
 * @param signal - AbortSignal（解析前后检查，主线程同步路径不能中途打断）
 * @returns 解析结果
 */
async function parseMarkdownForRichLoad(
  markdown: string,
  editorInstanceId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<RichParseResult> {
  // 解析前检查取消
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const startTime = performance.now();

  // 第一阶段：主线程同步解析
  const parseExtensions = createRichMarkdownSchemaExtensions(editorInstanceId);
  const json = parseMarkdownOnMainThread(markdown, parseExtensions);

  // 解析后再次检查取消
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  return {
    json,
    stats: {
      durationMs: performance.now() - startTime,
      nodeCount: countNodes(json),
    },
  };
}
```

**主线程解析实现：**

```typescript
function parseMarkdownOnMainThread(
  markdown: string,
  extensions: Extension[],
): JSONContent {
  // 使用 Tiptap 的 MarkdownManager 解析
  // 注意：Tiptap v3 中 MarkdownManager 的构造函数签名需要验证
  const manager = new MarkdownManager({
    indentation: { style: 'space', size: 2 },
    extensions,
  });
  return manager.parse(markdown);
}
```

第一步测试必须验证 `MarkdownManager` 是否可以直接使用自定义扩展集合解析且结果与主线程 editor path 一致。

### Worker 预留：消息协议

```typescript
/**
 * Worker 解析请求/响应类型
 * 本轮仅定义类型，不实现 Worker 文件
 */

interface RichParseRequestMessage {
  type: 'rich-parse-request';
  requestId: string;
  markdown: string;
  editorInstanceId: string;
}

interface RichParseSuccessMessage {
  type: 'rich-parse-response';
  requestId: string;
  ok: true;
  json: JSONContent;
  stats: { durationMs: number; nodeCount: number };
}

interface RichParseFailureMessage {
  type: 'rich-parse-response';
  requestId: string;
  ok: false;
  error: string;
}

type RichParseWorkerMessage =
  | RichParseRequestMessage
  | RichParseSuccessMessage
  | RichParseFailureMessage;
```

主线程收到 Worker response 后必须检查 `requestId` 和 `currentLoadToken` 是否匹配。旧结果直接丢弃。如果连续切换导致 Worker 拥堵，可以 `worker.terminate()` 后重建。

Worker 内禁止创建 `Editor`（会创建 ProseMirror view 需要 DOM）。只能用 `MarkdownManager` 解析 JSON。若 MarkdownManager 在 Worker 中不可用，备选方案是保留主线程 parse（不接入 Worker），而不是在 Worker 内创建 Editor。

## 分帧装载算法

### 算法选择

实现前先做基准对比，对同一份 JSON 文档测试：

- 一次性 `setContent(json)`
- 10 个顶层 node 为一组的多 transaction
- 50 个顶层 node 为一组的多 transaction
- 12ms 时间预算的动态分片

选择标准：单帧峰值阻塞优先，其次总耗时。基准指标分拆：
- `buildMs`：JSON→Node + transaction 构建时间
- `dispatchMs`：`view.dispatch()` 执行时间
- `frameTotalMs`：本帧总耗时

### 时间预算分片算法（推荐首选）

```
输入: JSONContent (完整解析结果), editor, currentLoadToken
输出: 全部装载完成或中途取消

1. blocks = json.content ?? []
2. totalBlocks = blocks.length
3. cursor = 0

4. scheduleNextChunk():
   a. if (!isCurrentToken(token)) return  // 已取消
   b. frameStart = performance.now()
   c. let tr = editor.state.tr  // 新 transaction 链
   d. while (cursor < totalBlocks):
      - block = blocks[cursor]
      - node = editor.schema.nodeFromJSON(block)
      - tr = tr.insert(tr.doc.content.size, node)
      - cursor++
      - if (performance.now() - frameStart >= TIME_BUDGET) break
   e. // 设置 meta
      tr.setMeta('preventUpdate', true)
        .setMeta('addToHistory', false)
        .setMeta('bEditorRichLoad', true);
   f. editor.view.dispatch(tr)
   g. update progress = cursor / totalBlocks
   h. if (cursor < totalBlocks):
        scheduledFrameCancel = scheduler(scheduleNextChunk)
      else:
        // 装载完成 → 清理占位 → heading ID 校正 → 快照 → ready

5. 首帧替换占位段落：
   - 首个顶层 node 替换占位 paragraph
   - helper: getPlaceholderRange(editor.state.doc) → { from, to }
   - tr.replaceWith(from, to, firstNode)
   - 后续帧正常 append to tr.doc.content.size
```

### 关键细节

**首帧占位替换：** 空占位文档 `{ type: 'doc', content: [{ type: 'paragraph' }] }`。首帧用 `tr.replaceWith(0, firstChild.nodeSize, firstNode)` 替换占位段落，后续帧 append。通过 helper `getPlaceholderRange(doc)` 计算占位节点范围，用单元测试验证。

**position：** 每帧插入位置 = 当前 `tr.doc.content.size`（文档末尾）。同一帧内多次 insert 后 doc 会变，必须用 `tr.doc.content.size` 而非 `editor.state.doc.content.size`。

**每帧单次 dispatch：** 每个 block 单独 dispatch → 过多 plugin state 更新，总耗时大幅增加。每帧累积多个 block 的 insert 到同一个 transaction 链，最后一并 dispatch。

**进度语义：**

| 阶段 | progress | stage |
|------|----------|-------|
| 解析中 | indeterminate（不展示确定进度） | `parsing` |
| 装载中 | 0.05 + 0.9 × (cursor / totalBlocks) | `mounting` |
| 装载完成（标题校正、快照） | 1.0 | `mounting` |

**完成步骤：**

1. 最后一帧 dispatch 完成后
2. `assignHeadingIds(editor, { silent: true })` — 标题 ID 校正也设置 `addToHistory: false`、`preventUpdate: true`
3. `rememberImportedContent(rawMarkdown)` — 一次性快照
4. `editor.setEditable(editable.value)`
5. 状态切换 `ready`，`progress = 1`
6. 恢复大纲、搜索、选区工具

## 错误处理与恢复策略

### 错误分类

| 错误类型 | 阶段 | 表现 | 恢复策略 |
|----------|------|------|----------|
| Markdown 解析失败 | `parsing` | 解析器抛异常 | 进入 `failed`，保留原始 markdown，允许重试 |
| JSON schema 不匹配 | `mounting` | `nodeFromJSON` 抛异常、schema 不兼容 | 进入 `failed`，清空 editor 为空占位 |
| 分帧 dispatch 失败 | `mounting` | `view.dispatch` 抛异常 | 进入 `failed`，标记半成品位置，允许重试 |
| `assignHeadingIds` 失败 | 完成 | ID 校正出错 | 降级：跳过 ID 校正，仍标记 `ready`，大纲/锚点功能禁用（`capabilities.headingAnchorsReady = false`） |
| 分帧超时 | `mounting` | 超过可配置超时时间仍未见完成 | 进入 `failed`，提示超时 |
| Worker 崩溃（未来） | `parsing` | `worker.onerror` 触发 | 进入 `failed`，可选降级到主线程解析重试 |

### 失败状态行为

进入 `failed` 状态后：

1. 停止所有分帧（当前 `loadToken` 作废）
2. `editor.setEditable(false)`
3. 清理 editor：
   - 首次加载失败（无 `previousReadyDocJson`）：清空为空占位文档
   - 重新加载失败（有 `previousReadyDocJson`）：恢复上一个 ready doc 为只读 + failed overlay
4. `loadState.phase = 'failed'`，`loadState.errorMessage` 为用户可读描述
5. 不修改 persistent 层内容（`editorContent` 不变）
6. `isDirty` 或等价保存状态不变
7. 提供重试入口 + 切回 Source 入口（通过 emit `request-source-mode`）
8. 旧 `loadToken` 不再 dispatch

### 错误信息文案

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  PARSE_FAILED: '富文本加载失败：文档解析错误，请切换回源码模式检查内容',
  SCHEMA_MISMATCH: '富文本加载失败：文档结构不兼容，请切换回源码模式检查内容',
  LOAD_TIMEOUT: '富文本加载超时，文档过大，建议在源码模式下编辑',
  WORKER_CRASH: '富文本加载失败：解析器异常',
  DISPATCH_FAILED: '富文本加载失败：内容写入错误',
  UNKNOWN: '富文本加载失败，请重试或切换回源码模式',
};
```

### 重试路径

```typescript
async function retryLoad() {
  if (loadState.value.phase !== 'failed') return;

  const source = getLoadSource();
  if (!source) {
    loadState.value.phase = 'idle';
    return;
  }

  // startLoad 内部统一取消旧任务、清理占位、进入 loading
  // 不调用 cancelLoad 避免中间 idle 闪烁
  await startLoad(source, { isReload: true });
}
```

### 取消时的清理

```typescript
function cancelLoad(reason: RichLoadCancelReason) {
  // 1. 作废旧版本
  currentLoadToken = Symbol('rich-load-canceled');

  // 2. 取消已排队的下一帧
  scheduledFrameCancel?.();
  scheduledFrameCancel = null;

  // 3. 清理 editor（除 retry 外的情况）
  //    switch-source/unmount/switch-file：可选清空（Rich 即将离开）
  //    external-change/retry：startLoad 会立即创建新占位
  const editor = getEditor();
  if (editor && !editor.isDestroyed && reason !== 'retry') {
    clearEditorToEmptyPlaceholder(editor); // 带 silent meta
  }

  // 4. 状态归位
  loadState.value.phase = 'idle';
  loadState.value.errorMessage = undefined;

  // 5. 不修改 editorContent
  // 6. 不调用 onContentChange
}
```

### 外部内容在加载失败后变化

```
failed 状态下 watch(bodyContent) 检测到内容变化：
  → 新内容 < 阈值：退出 loader，走小文档同步路径
  → 新内容 >= 阈值：自动 cleanup failed，启动新加载
  → 如果用户切回 Source 编辑了新内容再切回 Rich
  → loadSource 更新为新内容的 markdown
```

## 测试计划

### 行为测试

1. 大文档切回 Rich 时，加载期间不触发 `update:value`。
2. 加载期间 `insertAtCursor` / `replaceSelection` / `replaceDocument` throw `RICH_EDITOR_NOT_READY`。
3. 加载事务设置 `addToHistory: false`，通过 history state 或 undo 行为验证未进入 undo history。
4. 首次打开文件加载完成后，第一次 undo 不会把文档清空；若无用户编辑，undo 应不可用或不改变文档。
5. 外部内容变化会取消旧加载，旧加载不能覆盖新内容。
6. 组件卸载后旧加载不再 dispatch。
7. 加载完成后 `getPersistedMarkdown` 与 canonical 快照保持稳定。
8. 加载完成后立即检查 `isDirty` 或等价保存状态，预期为 false。
9. 小文档仍能正常进入 Rich 并编辑（Markdown round-trip、mount 回归测试）。
10. 加载失败时不回写半成品。
11. 大纲、搜索、选区工具在 loading 状态下不会读取半成品文档。
12. `assignHeadingIds` 失败时仍 `ready` 但 `headingAnchorsReady = false`。
13. 重新加载失败时恢复 `previousReadyDocJson` 为只读 + failed overlay。
14. Web Worker 解析结果与主线程解析结果 structurally equal。
15. Worker JSON → main thread editor → `getPersistedMarkdown()` round-trip 稳定。
16. `dispatchLoadChunk` 各 position 行为通过单元测试验证（首帧替换、后续 append、循环内 `tr.doc.content.size` 正确性）。

### 性能验证

- 构造约 10 万到 20 万字符的 Markdown fixture。
- 记录 P50 / P95、单帧最长阻塞时间（buildMs + dispatchMs + frameTotalMs）和总加载时间。
- 对比不同分帧粒度（一次性、10 block/帧、50 block/帧、12ms 时间预算），确定最优策略。
- 验证 UI 在加载期间能响应模式切换或取消操作。

## 风险与处理

### 风险：分片插入破坏 Markdown 结构

处理：只对已经完整解析出的 Tiptap JSON 顶层 node 分片，不对原始 Markdown 字符串切片。

### 风险：加载 update 被误认为用户编辑

处理：加载事务统一 meta，`onEditorUpdate` 双重检查 meta 和 loading 状态。`transaction` 监听者和 plugin state 监听者在 loading 状态下不产生用户可见副作用。

### 风险：加载历史污染 undo

处理：大文档加载事务显式设置 `addToHistory: false`（通过 `editor.view.dispatch(tr.setMeta(...))`），并增加 undo 测试。小文档保持现有路径不变。

### 风险：加载中用户写入

处理：加载期间 `canEdit = loadState.phase === 'ready' && editable.value`，所有写方法统一经过 `guardEdit()` 守卫，非 ready 状态 throw `RICH_EDITOR_NOT_READY`。

### 风险：旧任务覆盖新文档

处理：所有异步边界和每帧 dispatch 前检查 `isCurrentToken(token)`。取消后清空为占位文档，不保留半截内容。

### 风险：源码行号映射偏移

处理：源码行号 attrs 来自完整 Markdown parse。加载完成前 `selectLineRange` 等依赖完整映射的能力拒绝执行。

### 风险：Worker 解析复用扩展困难

处理：扩展拆分为 `createRichMarkdownSchemaExtensions()`（纯 schema/Markdown 解析，无 DOM/NodeView）和 `createRichEditorRuntimeOnlyExtensions()`（主线程专用）。同一 node/mark 的 name、attrs、schema 在两组中完全一致。

### 风险：Schema 组和 Runtime 组不一致导致 JSON 装载失败

处理：CodeBlock/Table 等扩展的 parse 组和 runtime 组必须保持完全相同的 name、attrs、schema 定义。此为硬性约束，需要单元测试验证。

### 风险：小文档进入异步路径产生额外延迟

处理：字符数 ≤ 30,000 走现有同步路径。小文档也走状态机框架但跳过"分帧装载"步骤（直接一次性 `setContent` + `emitUpdate: false`）。阈值随性能基线调整。

### 风险：Tiptap MarkdownManager 不可直接使用自定义扩展

处理：实现前第一步测试验证 `MarkdownManager` 的构造函数签名和扩展集合可用性。若不可行，用 `Editor.create({ extensions, content: markdown, editable: false })` 导出 JSON 作为备选（不推荐用于 Worker 但主线程可用）。

## 文件清单

### 新增文件

```
src/components/BEditor/hooks/
├── useRichEditorLoad.ts           # 加载状态机（核心）
├── richMarkdownParser.ts          # 统一异步解析接口（Promise 封装）

src/components/BEditor/workers/
└── richMarkdownParser.worker.ts   # Worker 解析（本轮仅定义类型，暂不实现）
```

### 改造文件

```
src/components/BEditor/hooks/
├── useRichEditor.ts               # 分支初始化、watch 改造、keyDown 守卫
├── useContent.ts                  # isLoadTransaction/loadPhase 参数、dispatchLoadChunk/Content
├── useExtensions.ts               # 拆分为 schema 组 + runtime 组

src/components/BEditor/panes/
└── PaneRichEditor.vue             # loading/failed UI、guardEdit、defineExpose

src/components/BEditor/
└── Markdown.vue                   # loading 禁用交互

src/components/BEditor/components/
└── CurrentBlockMenu.vue           # loading 状态下暂停重算

src/components/BEditor/extensions/
└── editorSearch.ts                # loading 状态下清空/暂停搜索

src/components/BEditor/adapters/
├── richSelectionAssistant.ts      # loading 状态下隐藏工具栏
└── types.ts                       # RichLoadState 等类型定义
```

## 落地顺序

1. **扩展拆分** — `createRichMarkdownSchemaExtensions()` + `createRichEditorRuntimeOnlyExtensions()` + 验证 MarkdownManager 可用性 + 等价测试
2. **解析接口** — `richMarkdownParser.ts`（主线程同步实现，Promise 接口）
3. **加载状态机** — `useRichEditorLoad.ts`（状态机 + 分帧算法 + 取消 + 错误处理） + 单元测试
4. **模块接入** — 改造 `useRichEditor.ts`、`useContent.ts`、`PaneRichEditor.vue`、`Markdown.vue`
5. **副作用隔离** — `CurrentBlockMenu`、`editorSearch`、`richSelectionAssistant` loading 守卫
6. **Worker 接入**（后续 PR）— `richMarkdownParser.worker.ts` + 接入 `parseMarkdownForRichLoad` + main/worker parse 等价测试
7. **性能调优** — 基准测试确定分帧粒度、阈值调整
