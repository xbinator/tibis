# 通用文件控制器设计

## 背景

编辑器与 Widget 页面目前分别维护文件加载、草稿持久化、保存基线、标签脏状态、磁盘写入策略、文件监听以及首次保存等流程。`src/hooks/useFileAutoSave.ts` 只负责最近文件草稿，`src/hooks/useSavePolicy.ts` 只负责按偏好触发磁盘写入，页面会话仍需要自行拼装其余状态。这导致同一份文件生命周期逻辑在 `src/views/editor/hooks/useSession.ts` 与 `src/views/widget/hooks/useSession.ts` 中重复，并且不同页面对并发保存、监听抑制和加载冲突的处理不一致。

本次新增 `src/hooks/useFileController.ts`，统一管理一个文件会话的完整生命周期。Editor 和 Widget 只通过 `events` 提供文件类型相关能力，不再各自维护另一套保存状态机。

## 目标

- 在公共 hook 中统一管理文件状态、业务数据、保存基线和标签脏状态。
- 始终将草稿自动保存到最近文件存储；保存策略只决定是否自动写入磁盘。
- 对外只暴露“已保存”和“未保存”两个保存状态。
- 统一协调加载、磁盘与草稿冲突、文件监听、自写入抑制、首次保存、另存为和重命名。
- 使用会话版本和内容修订号隔离异步结果，避免旧任务污染当前文件。
- 通过泛型数据与 `events` 适配普通文本文件和 Widget JSON，不使用 `recordType` 分支。

## 非目标

- 不改变 `HeaderTabs.vue` 的星号呈现方式，仍由 `tabsStore.isDirty(item.id)` 决定。
- 不把标签标题、路由跳转、KeepAlive `cacheKey` 或复制路径等页面行为放进控制器。
- 不增加“保存中”或“保存失败”等第三种公开保存状态。
- 不改变现有最近文件记录的数据结构和保存策略枚举 `off | onBlur | onChange`。
- 不在本次改造中实现跨窗口的文件锁。

## 核心决策

### 单一状态所有者

`useFileController` 是以下状态的唯一写入者：

- `fileState`：文件 ID、名称、扩展名、路径和序列化内容。
- `data`：页面实际编辑的泛型业务数据。
- `savedContent`：最近一次成功读取或写入磁盘的精确字符串快照。
- 标签 `dirty` 与 `missing` 状态。
- 加载、写入、监听以及自写入抑制的内部状态。

`events` 只接收不可变上下文并返回结果，不得直接修改上述状态，也不得直接修改标签脏状态。控制器验证事件结果仍属于当前会话后，才可以应用结果。

### 两态公开、细粒度内部状态

公开保存状态为 `isSaved: Ref<boolean>`：

- 没有序列化错误且 `fileState.content === savedContent` 时为已保存。
- 两者不相等或当前业务数据无法序列化时为未保存。
- 磁盘写入进行期间保持未保存。
- 写入失败、序列化失败或写入期间再次编辑后保持未保存。
- 只有精确快照成功写入，并且当前内容仍等于该快照时，才切换为已保存。

控制器内部仍维护 `sessionVersion`、`contentRevision`、`isLoading`、`isSaving`、`pendingSave`、`loadError`、`serializationError`、`saveError` 和 `disposed`。这些状态用于协调并发，但不会扩展公开保存状态的枚举。

### 自动保存语义

控制器内部读取 `useEditorPreferencesStore().saveStrategy`：

- `off`：继续防抖保存本地草稿，只禁止自动写入磁盘；手动 `onSave` 和 `onSaveAs` 仍可写盘。
- `onBlur`：保存草稿，并在 `onBlur` 时将已有路径的未保存内容写盘。
- `onChange`：保存草稿，并在内容变化后防抖写入已有路径。
- `path === null`：任何自动策略都不得弹出保存对话框；首次磁盘保存必须由用户手动触发。

设置页中“关闭”的说明同步改为“关闭自动写入磁盘，草稿仍会自动保存”，避免把关闭误解为关闭草稿保护。

## 公共接口

公共入口只保留 `src/hooks/useFileController.ts`。实现辅助模块放在 `src/hooks/file-controller/`，页面不得直接依赖内部模块。

```ts
interface FileControllerOptions<TData> {
  /** 响应式文件 ID。 */
  fileId: Ref<string>
  /** 文件类型相关事件。 */
  events: FileControllerEvents<TData>
}

interface FileControllerEvents<TData> {
  /** 创建没有最近记录和磁盘内容时的默认会话。 */
  onCreate: (context: FileCreateContext) => FileControllerSnapshot<TData>
  /** 加载最近记录、磁盘候选内容和文件类型元信息。 */
  onLoad: (context: FileLoadContext) => Promise<FileLoadCandidates>
  /** 将选定的字符串内容解析为页面业务数据。 */
  onParse: (context: FileParseContext) => TData
  /** 将页面业务数据序列化为稳定字符串。 */
  onSerialize: (context: FileSerializeContext<TData>) => string
  /** 构建需要写入最近文件存储的具体记录。 */
  onBuildRecord: (context: FileRecordContext<TData>) => StoredDocumentRecord
  /** 将精确内容快照写入已有路径。 */
  onWriteFile: (context: FileWriteContext) => Promise<void>
  /** 打开保存对话框并返回实际保存路径；取消时返回 null。 */
  onSaveAs: (context: FileSaveAsContext) => Promise<string | null>
  /** 执行重命名交互与文件系统操作；取消时返回 null。 */
  onRename: (context: FileRenameContext) => Promise<FileRenameResult | null>
  /** 处理草稿和磁盘同时变化时的用户决策。 */
  onResolveConflict: (context: FileConflictContext) => Promise<FileConflictDecision>
}

interface FileLoadCandidates {
  /** 最近文件中的草稿；没有记录时为 null。 */
  draft: FileDraftCandidate | null
  /** 当前磁盘内容；没有路径或读取不到时为 null。 */
  disk: FileDiskCandidate | null
  /** 读取失败时保留的错误，供控制器进入可重试状态。 */
  error: Error | null
}

interface FileDraftCandidate {
  /** 最近文件中的文件状态。 */
  fileState: FileSessionState
  /** 最近一次磁盘同步的内容；历史记录缺少时为 null。 */
  savedContent: string | null
}

interface FileDiskCandidate {
  /** 磁盘文件对应的元信息和原始字符串。 */
  fileState: FileSessionState
}

interface FileControllerResult<TData> {
  /** 当前文件状态。 */
  fileState: Ref<FileSessionState>
  /** 当前业务数据。 */
  data: Ref<TData>
  /** 最近一次磁盘同步的精确内容。 */
  savedContent: Ref<string>
  /** 当前内容是否与磁盘保存基线一致。 */
  isSaved: ComputedRef<boolean>
  /** 当前磁盘文件是否丢失。 */
  isMissing: ComputedRef<boolean>
  /** 是否正在加载会话。 */
  isLoading: Ref<boolean>
  /** 加载或解析错误。 */
  loadError: Ref<Error | null>
  /** 文件公共动作。 */
  actions: FileControllerActions
}

interface FileControllerActions {
  /** 手动保存。 */
  onSave: () => Promise<void>
  /** 手动另存为。 */
  onSaveAs: () => Promise<void>
  /** 重命名。 */
  onRename: () => Promise<void>
  /** 编辑区域失焦。 */
  onBlur: () => Promise<void>
  /** 重新加载当前文件。 */
  onReload: () => Promise<void>
  /** 删除当前最近记录并释放文件会话资源。 */
  onDelete: () => Promise<void>
  /** 立即补写草稿并等待当前写盘任务结束。 */
  onFlush: () => Promise<void>
  /** 让当前会话停止接收异步结果并释放资源。 */
  onDispose: () => Promise<void>
}
```

所有回调和公开动作均使用 `on` 前缀；响应式状态字段不使用 `on` 前缀。异步事件统一通过 `asyncTo()` 归一化错误，JSON 解析和序列化等同步逻辑可以使用同步错误处理。

`onBuildRecord` 取代 `recordType`。普通编辑器适配器返回 `type: 'file'` 的记录，Widget 适配器返回 `type: 'widget'` 的记录，控制器不包含按文件类型判断的分支。

## 状态与数据同步

### 业务数据到字符串

页面修改 `data` 后，控制器调用 `onSerialize` 得到新的字符串。序列化成功才更新 `fileState.content`、递增 `contentRevision`、清除 `serializationError`、同步标签脏状态并调度草稿保存和磁盘策略。序列化失败时保留上一个合法字符串，设置 `serializationError` 并保持未保存，不得写入损坏或不完整的内容。标签脏状态按 `!isSaved` 同步，因此序列化失败不会因为旧字符串恰好等于保存基线而错误清除星号。

普通文本编辑器的适配器可以让 `TData` 为 `string`，解析和序列化均返回原字符串。Widget 的适配器负责 `parseWidgetJson` 和稳定格式的 `JSON.stringify`。

### 字符串到业务数据

加载、外部文件重载或冲突选择磁盘内容后，控制器先调用 `onParse`。解析成功后，在暂停双向监听的范围内同时替换 `fileState.content` 与 `data`，避免反向序列化再次产生一次用户编辑。解析失败时设置 `loadError`、暂停自动写盘并保留可重试状态。

### 标签状态

控制器在内容或保存基线变化后同步 `tabsStore`：

- 内容等于基线时调用 `clearDirty(fileId)`。
- 内容不等于基线时调用 `setDirty(fileId)`。
- 全局监听发现文件被删除时保留当前草稿并设置 `missing`。
- 保存恢复成功、另存为成功或磁盘文件重新出现并完成协调后清除 `missing`。

`HeaderTabs.vue` 继续读取 `tabsStore.isDirty(item.id)` 显示 `*`，无需新增另一套状态来源。

## 加载与冲突协调

每次 `onReload` 或 `fileId` 变化都开启新会话版本并执行以下流程：

1. 递增 `sessionVersion`，使旧加载、保存和监听任务失效。
2. 暂停数据同步、草稿保存和磁盘自动写入。
3. 调用 `onLoad` 获取最近记录、磁盘候选内容和文件元信息；没有候选内容时调用 `onCreate`。
4. 使用现有调和规则判断采用草稿、将草稿标记为已保存、应用磁盘内容或进入真实冲突。
5. 真实冲突调用 `onResolveConflict`，只接受“保留草稿”或“使用磁盘内容”。
6. 对最终字符串调用 `onParse`，成功后原子替换 `fileState`、`data` 和 `savedContent`。
7. 通过 `onBuildRecord` 持久化最终状态，注册当前路径监听，恢复同步并更新标签状态。

任何一步返回时都必须验证其捕获的会话版本仍有效。加载或解析失败时设置 `loadError`，停止后续持久化和写盘；用户可以通过 `onReload` 重试。

## 异步版本隔离

每次异步加载、写盘、另存为、重命名和监听协调都捕获操作快照：

```ts
interface FileOperationSnapshot {
  /** 操作所属文件。 */
  fileId: string
  /** 操作所属会话版本。 */
  sessionVersion: number
  /** 操作开始时的内容修订号。 */
  contentRevision: number
  /** 操作目标路径。 */
  path: string | null
  /** 操作使用的精确字符串。 */
  content: string
}
```

应用结果前必须同时验证文件 ID、会话版本和操作目标。规则如下：

- `fileId` 切换、重新加载、另存为成功、重命名成功和 `onDispose` 都会使不再适用的旧操作失效。
- 写盘成功只把操作快照中的 `content` 设为保存基线，不能直接读取完成时的最新内容。
- 写盘期间如果 `contentRevision` 已变化，当前状态继续未保存，并在 `onChange` 策略下补发一次最新快照写盘。
- 旧路径监听事件不得更新另存为或重命名后的新会话。
- 已销毁控制器不得应用任何事件结果或修改标签状态。

这是防止快速切换 Tab、KeepAlive 复用以及慢磁盘操作造成跨文件覆盖的硬约束。

## 磁盘保存流程

### 已有路径

`onSave`、`onBlur` 或 `onChange` 触发写盘时，控制器先捕获操作快照，再登记自写入抑制签名，最后调用 `onWriteFile`。成功后只提交该快照对应的保存基线并持久化最近记录；失败时清理未命中的抑制签名、保留未保存状态并记录内部错误。

同一会话最多同时存在一个写盘任务。写盘期间的新请求合并为一个 `pendingSave`，当前任务结束后以最新修订重新判断是否需要补写。

### 首次保存与另存为

- 自动策略在 `path === null` 时只保存草稿，不调用 `onSaveAs`。
- 用户调用 `onSave` 且没有路径时，转入 `onSaveAs` 流程。
- 显式 `onSaveAs` 总是调用事件，并传入精确内容快照和默认路径建议。事件负责完成保存对话框和该快照的实际写入，成功后返回最终路径。
- 用户取消时不改变路径、保存基线或脏状态。
- 成功时控制器应用返回路径、更新名称和扩展名、使旧路径任务失效、切换监听、清除 `missing`，并只提交实际保存的内容快照。

### 重命名

`onRename` 事件负责文件类型相关的交互和平台操作，返回新名称与可选新路径。控制器验证会话版本后应用结果，持久化最近记录并切换监听。已有路径的重命名会使旧路径上的抑制签名和未完成操作失效；没有路径的文件只更新本地名称。

### 丢失文件

手动保存丢失文件时，控制器优先尝试恢复原路径。原路径已经出现其他文件时由事件层完成覆盖确认；恢复失败后才进入另存为流程。成功恢复后清除标签 `missing`。

## 文件监听与自写入抑制

控制器统一注册和注销全局文件监听，并保证每个会话只跟踪当前路径。自写入抑制使用“会话版本 + 路径 + 内容快照 + 过期时间”签名，而不是无条件忽略下一次事件：

- 只有路径和内容都匹配的 change 事件才会被吞掉。
- 同一次平台写入产生的重复同内容事件在短时间内都可被吞掉。
- 内容不同的外部事件立即终止抑制并进入外部变化协调。
- 签名超时、写入失败、路径切换、会话切换和销毁时必须清理。

外部 change 到达时，如果当前未保存，进入冲突决策；如果当前已保存，直接解析并应用磁盘内容。外部 unlink 只设置 `missing`，不得删除内存草稿或最近记录。

同一路径不能拥有两个独立写入者。打开文件时优先复用已有 Tab；若历史状态仍产生重复会话，后注册的控制器只读监听，不自动写盘，并记录可诊断错误，避免两个控制器相互覆盖。本次不引入复杂的跨窗口锁协议。

## 生命周期

- `onActivated`：恢复当前路径监听，并根据保存策略恢复自动写盘调度。
- `onDeactivated`：停止当前页面的事件订阅，但保留全局 missing 监听和本地草稿；不把停用等同于销毁。
- `onFlush`：取消草稿防抖并立即持久化最新记录，然后等待当前写盘任务结束；如果结束后仍有待补写内容，则按当前策略完成或明确保留未保存状态。
- `onDispose`：先执行 `onFlush`，再递增会话版本、清理定时器、监听、抑制签名和回调，最后禁止旧异步结果落地。
- Tab 关闭和应用退出应在释放会话前调用 `onFlush`。是否弹出未保存确认继续以 `tabsStore.isDirty` 为准。

草稿持久化失败不得被静默吞掉；异步释放路径使用 `asyncTo()` 记录错误，同时避免未处理的 Promise rejection。

## 错误处理

- 加载或读取失败：设置 `loadError`，保留安全的当前状态，暂停保存，允许 `onReload` 重试。
- 解析失败：不替换为部分数据，不更新保存基线，不启动写盘。
- 序列化失败：保留上一个合法字符串，当前会话保持未保存，禁止写盘。
- 写盘失败：保持未保存，保留最新草稿，允许手动重试或下一次策略触发重试。
- 另存为取消：视为正常取消，不设置错误。
- 重命名失败：保持原名称、路径和监听不变。
- 过期异步结果：静默丢弃，不覆盖当前错误状态。

公开的 `loadError` 只服务于页面加载失败展示。保存类错误保留为内部状态并沿用现有消息机制反馈，避免把错误种类混入两态保存状态。

## 文件组织与迁移

```text
src/hooks/
├── useFileController.ts
└── file-controller/
    ├── types.ts
    ├── useDraftPersistence.ts
    ├── useDiskSave.ts
    └── useFileWatch.ts
```

- `useFileController.ts`：唯一公共入口和生命周期编排。
- `types.ts`：公共事件、结果、快照和内部状态类型。
- `useDraftPersistence.ts`：最近记录防抖保存与 flush。
- `useDiskSave.ts`：保存策略、串行写盘和修订号提交。
- `useFileWatch.ts`：路径注册、外部变化和自写入抑制。

迁移顺序：

1. 为控制器核心状态、草稿保存和版本隔离建立测试。
2. 接入磁盘策略、监听、首次保存、另存为和重命名。
3. 将 Editor 会话改为文本适配器，保留复制、定位、复制副本、路由和标题等页面动作。
4. 将 Widget 会话改为 JSON 适配器，保留 Widget Store 与页面绑定逻辑。
5. 删除被完全吸收的 `src/hooks/useFileAutoSave.ts`、`src/hooks/useSavePolicy.ts`、`src/views/editor/hooks/useFileState.ts`、`src/views/editor/hooks/useFileWatcher.ts` 和兼容转发层；仅在确认没有其他调用方后删除。
6. 更新设置说明、项目上下文和当日 changelog。

## 测试策略

公共控制器至少覆盖：

- `off` 始终写草稿但不自动写磁盘。
- `onBlur` 和 `onChange` 在已有路径时按策略写盘。
- 没有路径时自动策略不打开对话框，手动保存才进入首次保存。
- 内容与保存基线变化正确同步 `isSaved` 和 Tab 星号。
- 写盘期间继续编辑时，旧快照成功也不会清除最新修改的脏状态。
- 写盘失败后仍未保存，草稿保留且可以重试。
- 快速切换 `fileId` 时丢弃旧加载和旧写盘结果。
- 另存为、重命名后丢弃旧路径事件和旧操作结果。
- 加载、解析、序列化失败时暂停危险写盘并提供恢复入口。
- 草稿与磁盘同时变化时执行冲突决策。
- 自写入 change 被抑制，不同内容的外部 change 不被误吞。
- unlink 设置 missing，成功恢复或另存为后清除 missing。
- `onFlush` 立即落下防抖草稿，`onDispose` 后异步结果不再生效。
- 同一路径重复会话不会产生两个自动写入者。
- Editor 字符串适配器和 Widget JSON 适配器分别通过集成测试。

验证命令包括相关 Vitest 用例、`pnpm exec tsc --noEmit`、`pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx` 和 `pnpm exec stylelint 'src/**/*.{vue,less,css}'`。

## 验收标准

- Editor 与 Widget 通过同一个 `useFileController` 管理保存基线、草稿、磁盘策略、监听和标签状态。
- 设置为关闭时只禁止自动写盘，重新打开页面仍能恢复最新草稿。
- 公开保存状态只有 `isSaved`，Tab 星号与其反向一致。
- 自动保存不会触发首次保存对话框。
- 任何过期加载、写盘、监听、另存为或重命名结果都不能修改新的文件会话。
- 文件写入失败或进程中的再次编辑不会错误显示为已保存。
- 页面释放前可以可靠 flush 草稿，并且不会留下监听、定时器或未处理异步错误。
