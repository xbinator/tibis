# Widget 编辑器 AI 工具设计

## 背景

当前 Widget 内置工具包含：

- `widget`：按已启用小组件 ID 读取运行契约。
- `open_widget`：在聊天中打开已启用小组件并执行可选运行逻辑。

这两个工具面向全局小组件目录和聊天运行态，不能读取或编辑 `src/views/widget/index.vue` 中正在设计、尚未保存的当前文件。Widget 编辑页已经通过 `useFileSession<WidgetData>` 持有唯一的页面内存状态，并通过 `onActivated`、`onDeactivated` 区分当前活跃标签页。

## 目标

- 用户当前激活 `src/views/widget/index.vue` 时，向聊天动态注入 `get_widget` 和 `edit_widget`。
- Widget 页面未打开、处于后台 KeepAlive 或已经卸载时，不暴露这两个工具。
- `get_widget` 返回当前页面内存中的完整 `WidgetData`，包括尚未落盘的修改。
- `edit_widget` 使用结构化 Patch 修改当前页面内存状态，不要求模型提交完整 `WidgetData`。
- 修改继续走 `useFileSession` 已有的 dirty、自动保存和手动保存策略，工具本身不绕过会话直接写磁盘。
- 写操作遵循聊天现有工具权限模式，并在确认期间切换页面时拒绝写入过期上下文。

## 非目标

- 不替代现有 `widget` 和 `open_widget`。
- 不按小组件 ID 编辑全局 `.tibis/widgets` 目录中的任意文件。
- 不新增独立的 Widget 保存协议或文件写入实现。
- 不在第一版支持 undo/redo 工具、选区级工具或批量编辑多个 Widget 标签页。
- 不让后台 Widget 页面成为“最近一个可用上下文”。

## 工具语义

### `get_widget`

`get_widget` 不接收业务参数，返回当前活跃 Widget 文件快照：

```ts
interface WidgetDocumentSnapshot {
  file: {
    id: string
    name: string
    ext: string
    path: string | null
    title: string
  }
  value: WidgetData
}
```

返回值必须深拷贝，避免工具结果持有 Vue 响应式对象或随后被页面修改。

工具定义：

- `riskLevel: 'read'`
- `permissionCategory: 'document'`
- `requiresActiveDocument: false`

`requiresActiveDocument` 设为 `false` 是因为该工具使用独立的 Widget 上下文，而不是 `AIToolContext` 编辑器文档上下文。

### `edit_widget`

`edit_widget` 接收一个非空 Patch 数组：

```ts
type WidgetDocumentPathSegment = string | number

type WidgetDocumentPatch =
  | {
      op: 'set'
      path: WidgetDocumentPathSegment[]
      value: unknown
    }
  | {
      op: 'delete'
      path: WidgetDocumentPathSegment[]
    }

interface EditWidgetInput {
  patches: WidgetDocumentPatch[]
}
```

路径从 `WidgetData` 根开始。例如：

```json
{
  "patches": [
    { "op": "set", "path": ["name"], "value": "天气卡片" },
    { "op": "set", "path": ["elements", 0, "style", "color"], "value": "#111827" },
    { "op": "delete", "path": ["metadata", "legacy"] }
  ]
}
```

Patch 规则：

- 每次调用至少 1 个、最多 100 个操作。
- 路径不能为空，第一段必须是 `WidgetData` 顶层字段。
- 顶层只允许 `name`、`description`、`inputSchema`、`outputSchema`、`dataSchema`、`execute`、`metadata`、`elements`。
- 禁止 `__proto__`、`prototype`、`constructor` 路径片段，避免原型污染。
- `set` 的父路径必须已经存在；对象末级字段可以新增。
- 数组 `set` 只允许现有索引或等于数组长度的追加索引。
- `delete` 的目标必须存在；删除数组索引使用 `splice` 语义。
- 禁止删除 WidgetData 必需的顶层字段。
- 所有操作先应用到深拷贝，完整校验通过后再一次性替换页面值，保证原子性。
- 最终结果必须保持有效的 WidgetData 契约，包括 schema、execute、metadata、元素结构和元素 ID 唯一性。

成功结果返回修改后的完整 `WidgetDocumentSnapshot`，让模型可以基于确定的新状态继续工作。非法 Patch 返回 `INVALID_INPUT`，页面状态保持不变。

### WidgetData 校验策略

Patch 使用严格校验，不使用 `normalizeWidgetDataContract` 或 `createWidgetDataSnapshot` 作为写入前处理。它们的职责是容错归一化：缺失或错误字段会被替换为默认值、无法识别的元素可能被丢弃；这不符合结构化编辑应当“要么精确修改、要么明确失败”的语义。

新增 `src/components/BWidget/utils/widgetDataValidation.ts`，提供不修改输入的校验函数：

```ts
interface WidgetDataValidationFailure {
  valid: false
  path: Array<string | number>
  message: string
}

type WidgetDataValidationResult = { valid: true } | WidgetDataValidationFailure

function validateWidgetData(value: unknown): WidgetDataValidationResult
```

校验器必须检查：

- 根对象包含且仅包含 `WidgetData` 的八个顶层字段。
- `name`、`description` 为字符串；`inputSchema`、`outputSchema`、`dataSchema` 递归校验全部允许字段、字段类型和嵌套结构，不接受契约外字段。
- `execute` 为普通对象，`code` 为字符串，`enabled` 与 `description` 缺省或分别为 boolean、string。
- `metadata` 与元素 `metadata` 为普通对象；元素 `style` 只接受 `WidgetElementStyle` 声明的字段及其精确值类型。
- 元素名称必须是 `group` 或当前元素注册表中存在渲染器的名称，避免写入空白节点。
- `elements` 为数组；每个元素及其 `children` 递归包含有效的 ID、名称、展示字段、有限数值的 position/size/rotation 和完整 loop 配置。
- 元素只包含 `WidgetShapeElement` 契约字段，且只有 `group` 元素可以携带 `children`，避免画布归一化静默丢弃字段或隐藏子元素。
- 所有元素 ID 在整棵树内唯一。

校验失败时返回首个错误的路径和说明；Patch 工具映射为 `INVALID_INPUT`，不写回页面数据。现有 JSON 解析和画布同步继续使用原有归一化器，不改变它们对历史或不完整数据的容错行为。因而，已在编辑器中加载的非规范旧数据仍可读取，但 AI Patch 会明确拒绝，直到数据先被页面现有编辑流程修正。

Patch 的结构和路径在弹出确认前校验；确认完成后，工具重新读取当前 WidgetData，在这份最新数据上应用 Patch 并严格校验后才替换。这样不会用确认前的全量快照覆盖用户在确认期间进行的编辑；若路径已不再存在，调用以 `INVALID_INPUT` 失败。

工具定义：

- `riskLevel: 'write'`
- `permissionCategory: 'document'`
- `requiresActiveDocument: false`

写入通过 renderer 侧 `executeWithPermission` 执行。默认询问模式与自动安全模式都显示确认；只读模式拒绝。该工具不声明 `safeAutoApprove`，因为 Patch 可修改 `execute.code`、schema 和 metadata，不能被自动安全模式静默执行。确认文案必须包含当前 Widget 文件标题，并在存在磁盘路径时展示路径。确认开始前和实际写入前都要检查上下文是否仍活跃。

## Widget 上下文

新增 `src/ai/tools/context/widget.ts`，定义独立于富文本编辑器的上下文：

```ts
interface WidgetToolContext {
  id: string
  getSnapshot: () => WidgetDocumentSnapshot
  replaceValue: (value: WidgetData) => Promise<void> | void
}
```

注册表参照 `webviewToolContextRegistry`，明确区分“已注册”与“当前激活”：

```ts
interface WidgetToolContextRegistry {
  register(id: string, context: WidgetToolContext): void
  unregister(id: string): void
  setCurrent(id: string): void
  clearCurrent(id: string): void
  getCurrentContext(): WidgetToolContext | undefined
}
```

`register` 只维护可用上下文，不改变当前项；`setCurrent` 只接受已注册 ID；`clearCurrent` 仅在 ID 匹配时清空当前项；`unregister` 删除上下文，且目标恰为当前项时一并清空。注册表绝不回退到其他已注册页面，防止后台 Widget 被误认为活跃页面。

`src/views/widget/index.vue` 负责 Widget 工具上下文的完整生命周期。`isWidgetSessionLoaded` 由页面观察 `useFileSession` 首次替换 `fileState` 得出，因此无需扩大通用文件会话 API：

- 页面注册 Widget 上下文，但不隐式标记当前；仅 `isActive && isPageMounted && isWidgetSessionLoaded` 同时满足时调用 `setCurrent(widgetId)`，失活时调用 `clearCurrent(widgetId)`。
- 页面卸载时调用 `unregister(widgetId)`，覆盖未经过 KeepAlive deactivation 的卸载路径。
- `getSnapshot` 从页面的响应式文件描述和 `session.data` 读取最新值并深拷贝。
- `replaceValue` 调用 BWidget 暴露的普通 `replaceDocumentValue` 事务；该事务先通过 `board.replaceElements` 让元素树替换进入画布历史，再回写完整 v-model 数据。页面仍通过现有 `@update:value` 和 `useFileSession` 处理 dirty、序列化与保存。第一版仅保证元素树修改能进入既有画布 Undo，`name`、schema、`execute`、metadata 等文档字段不新增独立 undo/redo 能力。

## 动态注入

`src/components/BChat/hooks/useRuntimeTools.ts` 每次执行 `getActiveTools()` 时读取 `widgetToolContextRegistry.getCurrentContext()`。

- 有活跃上下文时，创建并追加 `get_widget`、`edit_widget`。
- 无活跃上下文时，不创建也不暴露这两个工具。
- 原有 `widget`、`open_widget` 仍只由启用的小组件列表控制，与 Widget 编辑页是否打开无关。

工具创建时捕获当前上下文，并传入 `isCurrent` 谓词，比较 `widgetToolContextRegistry.getCurrentContext() === capturedContext`。执行前，以及写入工具经过权限确认后，都再次检查该谓词；如果用户在模型获得工具定义后切换页面，旧工具返回 `STALE_CONTEXT`，不能改到新标签页或后台标签页。

ChatRuntime 不传递 Widget 页面身份，也不在请求协议里增加 `widgetId`。renderer 在 `send`、`continueTurn`、`submitUserChoice` 入口解析一次当前 renderer 工具，并按本轮传给模型的 transport tool schema 过滤，随后以 `runtimeId` 绑定这份执行器快照。tool-request 到达时只使用对应 `runtimeId` 的快照，不再重新读取“当下”的 Widget 页面。这样用户在 Widget A 发起请求后切到 Widget B，模型迟到调用 `edit_widget` 时仍会命中 A 工具实例，并因 `isCurrent` 不匹配返回 `STALE_CONTEXT`，而不是误写 B。

`src/ai/tools/builtin/index.ts` 将：

- `get_widget` 加入条件只读工具白名单。
- `edit_widget` 加入条件写入工具白名单。
- 重新导出两个工具名称。

它们不加入 `createBuiltinTools()` 的静态结果，确保只能由 Widget 页面上下文动态创建。

## 错误处理

- 工具创建后页面已失活：`STALE_CONTEXT`；tool-request 找不到对应 `runtimeId` 的 renderer 工具快照时返回工具不可用结果。
- Patch 为空、数量超限、结构非法、路径非法或目标不存在：`INVALID_INPUT`。
- Patch 后 WidgetData 严格校验失败：`INVALID_INPUT`，错误消息指出首个非法字段，绝不以默认值替代错误值。
- 权限模式不允许写入：`PERMISSION_DENIED`。
- 用户拒绝确认：`USER_CANCELLED`。
- 工具执行期间不直接调用 `session.actions.onSave()`；磁盘保存错误仍由现有文件会话负责呈现。

## 测试策略

- Widget 上下文注册表：注册不改变当前项；setCurrent 后可读；clearCurrent 后为空；unregister 当前项后为空且不回退后台上下文。
- Patch 应用：支持对象字段设置、数组追加、数组删除和嵌套删除；拒绝原型污染、越界索引、必需根字段删除、重复元素 ID 和非法 schema；失败时不改变原对象。
- Widget 工具：`get_widget` 返回深拷贝；`edit_widget` 通过权限确认后原子替换并返回新快照；失活上下文返回 `STALE_CONTEXT`；自动安全模式仍会请求确认。
- Runtime 动态工具：仅活跃 Widget 上下文存在时包含 `get_widget`、`edit_widget`，不影响原有 `widget`、`open_widget`。
- ChatRuntime 工具解析：发送/续跑入口按本轮 transport tool schema 绑定 renderer executor 快照；tool-request 不重新解析当前 Widget 上下文，不传输或保存 Widget 页面 ID。
- Widget 页面上下文：注册不隐式激活；只有 mounted、activated、文件会话首次回填完成三项同时成立时设为当前；失活时清除当前；卸载时注销；上下文读取实时 `session.data` 与文件描述。
- BWidget 文档替换：页面通过公开的 `replaceDocumentValue` 调用元素树历史事务，再回写完整 v-model。
- 内置工具索引：两个名称进入正确的条件白名单，且不进入静态 `createBuiltinTools()`。

## Changelog

实现完成后在 `changelog/2026-07-10.md` 的 `Added` 区域记录：Widget 编辑页激活时动态提供 `get_widget` 和结构化 Patch `edit_widget` 工具。
