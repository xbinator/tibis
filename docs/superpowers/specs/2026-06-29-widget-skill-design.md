# 2026-06-29 Widget Skill 设计

## 概要

这个设计把 Widget 文档扩展成一种类似 Skill 的可视化能力：它可以由聊天运行时通过 `widget` / `open_widget` 工具按需打开，并以交互式 Widget 卡片的形式展示给用户。Widget 本身仍然是 `WidgetData` 文档，不新增顶层 `runtime` 字段，也不再使用 `metadata.skill`。工具暴露只使用必要的 Widget 契约信息；执行入口使用 `WidgetData.execute`；动态展示使用元素自己的模板字段，例如 `metadata.content = "天气：{{ state.weather.temperature }}"`；交互脚本使用 `defineConfig({ mounted, unmounted, methods })` 声明生命周期和可选用户辅助函数。

第一条纵向闭环应支持通过工具打开天气或咖啡Widget：

- 模型根据对话需要调用 `widget` 读取可用 Widget 契约。
- 模型调用 `open_widget` 打开指定 Widget，并传入可选 `input`。
- Widget 在聊天中作为一次会话展示，而不是打开编辑器页面。
- 元素根据会话的 `input`、`state` 解析模板字段。
- Widget 消息创建后进入独立运行态，`mounted` 可以读取 input、调用托管 request、写入 state。
- Widget 运行态提交时执行 `unmounted`；如果脚本调用 `this.$sendMessage`，则向聊天上行文本消息并结束当前 Widget 交互。
- HTTP 请求统一走底层 `request` 能力，Widget 作者不配置 origin 白名单或权限弹窗。

当前已经完成第一段可用闭环：文本元素可以通过 `{{ input.x }}`、`{{ state.y }}` 等模板读取 Widget 渲染上下文；模板读写、变量候选和渲染上下文已抽离为 hooks；编辑期的 `state.*` 变量候选从交互脚本里的 `this.$setState` 调用推导；聊天消息可以从 `open_widget` 工具结果派生 Widget part，并用 `BWidgetRuntime` 在消息气泡中展示和持久化消息内 state。

## 目标

- 让 Widget 文档可以在聊天中作为可视化 Skill 使用。
- 保持现有 Widget 编辑器架构不被破坏。
- 避免引入一个庞大的顶层 `runtime` 对象。
- 让每个Widget元素自己拥有动态字段和交互能力。
- 允许Widget作者用受控脚本声明生命周期和可选用户辅助函数，元素事件只保存自己的交互表达式。
- Widget 提交结果向现有工具结果结构靠近，但不伪装成 `role: tool` 消息。
- 通过现有 AI tool registry 暴露工作区 Widget，并由 `open_widget` 创建聊天内 Widget 消息。
- 先交付一个最小可体验的运行态Widget容器，再逐步丰富元素级交互执行能力。

## 非目标

- 第一版不实现完整市场或能力商店。
- 不实现自然语言 Widget Skill 路由器、置信度排序、自动启动或候选选择。
- 第一版不实现全局Widget能力库。
- 第一版不要求所有Widget元素都动态化。
- 第一版不实现用户可配置的 HTTP 权限白名单、origin/path/method/header 配置或确认弹窗。
- 不允许Widget脚本访问不受限制的浏览器、Electron、Node 或文件系统 API。
- 不把运行时状态写回原始 `.tibis` 文件，除非用户明确编辑或保存模板。
- 不替换现有 AI tools、MCP tools 或 chat runtime；Widget Skill 在需要时与它们集成。

## 当前上下文

当前 Widget 页面主要围绕 `src/views/widget/index.vue`、`src/components/BWidget/index.vue` 和 `src/components/BWidget/elements` 下的元素注册体系展开。

现有元素结构：

- `src/components/BWidget/elements/index.ts` 注册元素 schema、视图组件和 setter 组件。
- `src/components/BWidget/elements/Text/index.vue` 渲染文本元素。
- `src/components/BWidget/elements/Text/Setter.vue` 编辑文本元素专属 metadata。
- `src/components/BWidget/elements/Rect/index.vue` 渲染矩形元素。
- `src/components/BWidget/elements/Rect/Setter.vue` 编辑矩形元素专属属性。

这个结构很适合承载动态元素能力。文本元素可以声明自己支持 `content` 模板字段；未来按钮元素可以声明自己支持 `click` 交互表达式；未来列表元素可以声明自己支持 `items` 模板字段和列表项选择交互表达式。

## 数据模型

### WidgetData

`WidgetData` 保持现有形态：

```ts
interface WidgetData {
  name: string
  description: string
  inputSchema: ObjectJsonSchema
  stateSchema: ObjectJsonSchema
  execute?: WidgetExecuteMethod
  metadata: WidgetMetadata
  elements: WidgetElement[]
  viewport: WidgetViewport
}
```

`inputSchema` 后续应与 AI 结构化输入使用同一种对象 JSON Schema 类型。Widget 页面仍然可以提供受限的编辑体验，但持久化时不应丢弃合法 JSON Schema 字段，例如 `enum`、`default`、`additionalProperties`、`items`、`minimum`、`maxLength` 等。

`state` 不作为用户需要手写维护的 schema 配置。编辑器通过 `buildWidgetStateSchema` 静态分析 Widget 方法脚本中的 `this.$setState(path, value)` 调用，生成可绑定的 `state.*` 变量候选。第一版只推导静态字符串路径、对象字面量、基础字面量，以及可对应到 `inputSchema` 的 `this.$input.x` 类型；动态路径或复杂表达式不强行猜测。

### Widget 工具契约与执行入口

聊天运行时通过 `widget` 工具读取 Widget 契约，并通过 `open_widget` 工具打开指定 Widget。工具描述与工具结果只暴露必要的契约信息，不引入独立的自然语言路由索引。交互脚本配置放在 `WidgetData.execute` 下。第一版脚本使用 `defineConfig({ mounted, unmounted, methods })`，不兼容更早的 `execute(ctx)` 草稿，也不做旧数据迁移：

```ts
interface WidgetData {
  /** Widget 名称，用于列表展示和工具描述 */
  name: string
  /** Widget 用途说明，用于列表展示和工具描述 */
  description: string
  /** AI 调用 Widget 时需要填写的输入结构 */
  inputSchema: ObjectJsonSchema
  /** 由交互脚本代码推导的运行态状态结构 */
  stateSchema: ObjectJsonSchema
  /** Widget 交互脚本配置 */
  execute?: WidgetExecuteMethod
  /** 元素私有扩展信息 */
  metadata: WidgetMetadata
  /** Widget 元素列表 */
  elements: WidgetElement[]
  /** 编辑器视口 */
  viewport: WidgetViewport
}

interface WidgetExecuteMethod {
  /** 方法是否启用，默认 true */
  enabled?: boolean
  /** 方法说明，用于编辑器提示和调试记录 */
  description?: string
  /** defineConfig 脚本代码，声明生命周期与 methods */
  code: string
}
```

`name`、`description` 用于工具列表和契约说明，也是模型判断是否需要打开 Widget 的主要文本依据。`execute.code` 是 Widget 的交互脚本，脚本通过 `this.$input` 读取入参，通过 `this.$setState` 写入当前聊天消息内的 Widget 运行态 state，通过 `this.$http` 调用托管 request，通过 `this.$sendMessage` 上行聊天消息。

脚本执行控制规则：

- `enabled` 缺省视为 `true`；禁用后不执行 `mounted`、`unmounted` 或元素交互表达式。
- `description` 用于编辑器提示和调试记录，不参与执行逻辑。
- 交互脚本本身不维护 timeout 配置；网络请求超时、队列和响应大小限制统一由底层 `request` 能力处理。
- `methods` 只作为 Widget 作者可选的用户辅助函数集合，不是系统运行态协议；元素保存并运行自己的交互表达式。
- 第一版只允许元素交互表达式顶层调用一个用户辅助函数，辅助函数调用参数会按受控表达式求值后绑定到形参，辅助函数内部不继续递归调用其它辅助函数，避免循环和重入风险。
- 交互表达式没有触发 `this.$setState(...)` 或 `this.$sendMessage(...)` 时保持原 Widget part 不变。

### 元素级动态元信息

每个元素自己声明可模板化字段，并把字段值直接存放在 `element.metadata` 中。字段值本身可以包含简单模板。第一版 Text 元素直接把模板写在 `metadata.content` 中：

```ts
metadata: {
  content: "{{ input.city }} 当前 {{ state.weather.temperature }}°C"
}
```

这条规则是为了减少组件开发者和Widget作者的心智负担：一个字段只有一个来源，不再拆成两个字段来源。如果未来列表、表单、按钮等元素需要模板能力，也应沿用同样模式，例如 `metadata.items`、`metadata.label`、`metadata.defaultValue`，而不是增加第二套模板存储。

元素交互后续也应由元素自己声明和编辑，不新增一个全局复杂事件配置器。当前已落地的运行态只把节点 `submit` 事件向上透传，由 `BubblePartWidget` 统一转换为 `widget_result` 或执行 `unmounted` 后的 `$sendMessage`。未来 Button、List、Form 等元素可以在自己的 `metadata` 中保存事件交互表达式，例如 `metadata.onClick = "this.$sendMessage('确认下单')"` 或 `metadata.onClick = "submitOrder()"`，再通过 `useWidgetRuntime().value?.runInteraction(metadata.onClick)` 触发当前 Widget 实例交互。平台不关心业务函数名，也不读取函数返回值；唯一会结束 Widget 的信号是脚本调用 `this.$sendMessage(...)`。

模板展示保持声明式，因为它只是简单展示逻辑。事件不配置一段复杂流程；复杂分支、API 调用、状态写入和上行消息都放在 `execute.code` 的生命周期、交互表达式或用户辅助函数中完成。

### 模板表达式语法

模板表达式使用 `{{ ... }}` 插值语法。第一版只支持路径读取，不支持任意 JavaScript、函数调用、过滤器、管道或复杂表达式。

支持的上下文根：

- `input`：Widget启动入参，例如 `{{ input.city }}`。
- `state`：Widget会话运行状态，例如 `{{ state.weather.temperature }}`。
- `event`：仅在未来元素交互执行期间可用；当前渲染模板实现不支持 `event`，普通渲染模板中也不可用。

支持的路径格式：

```ts
{{ input.city }}
{{ state.weather.temperature }}
{{ state.coffeeList[0].name }}
```

解析规则：

- 模板字符串可以包含多个插值，例如 `{{ input.city }} 当前 {{ state.weather.temperature }}°C`。
- 如果整个字段值只有一个插值，解析结果保留原始类型；例如 `{{ state.count }}` 可以得到 number。
- 如果字段值包含普通文本和插值，最终结果转为字符串。
- 路径不存在、值为 `undefined` 或表达式非法时，字段保持自己的原始模板文本作为 fallback，用于编辑期可见性和运行期降级展示。
- `null` 是有效值，不触发 fallback；是否显示为空由元素渲染器决定。
- 第一版不支持 `{{ state.x | default("无") }}` 这类过滤器；需要默认值时应在方法函数里写入 state 默认值，或保留元素静态 fallback。

## 执行结果

Widget Skill 的结果结构向 `types/ai.d.ts` 中现有的 AI 工具执行结果靠近，但不作为真正的 tool result 消息发送给模型。

```ts
type WidgetSubmitResult =
  | { status: 'success'; data: Record<string, string> }
  | { status: 'failure'; error: { code: string; message: string } }
```

小组件提交结果作为 `widget_result` 用户消息片段进入聊天上下文，模型侧看到的是普通 user text content part，而不是 `role: tool` 消息。

Widget特有上下文记录在结果外层：

```ts
interface WidgetInteractionExecutionRecord {
  sessionId: string
  widgetId: string
  elementId?: string
  eventName?: string
  result: WidgetSubmitResult
  startedAt: number
  finishedAt?: number
}
```

这样 AI 工具、Widget交互、HTTP 调用、元素事件触发结果、取消、失败和等待用户输入都使用同一个状态模型。

## 工具打开流程

聊天不在用户消息发送前运行独立的 Widget Skill 路由器，也不维护 `aliases`、`triggers`、置信度候选或自动启动规则。Widget 的打开由现有 AI 工具链完成：

1. `widget` 工具在 description 中列出已启用的工作区 Widget，并允许模型按 ID 读取契约。
2. `open_widget` 工具接收 Widget ID 和可选 `input`，返回一份用于 UI 渲染的 Widget 快照。
3. 聊天消息渲染层把 `open_widget` 工具结果派生成 Widget part，并交给 `BWidgetRuntime` 展示。
4. 后续元素交互和脚本生命周期只作用于当前消息内的 Widget part，不修改来源 Widget 模板。

缺少必填入参时，由模型继续追问或调用 `open_widget` 时只传入已知 input；Widget 内表单元素后续也可以收集缺失字段。

## Widget 消息运行态

`open_widget` 结果会在聊天渲染层派生 Widget part 展示项，不会修改来源Widget模板。每条 Widget 消息都是一个独立运行时：同一个 Widget 模板可以在多条消息里同时存在，每条消息拥有自己的 `input`、`state` 和生命周期记录。运行态 ID 直接使用所在聊天消息的 `Message.id`，不额外引入 `runtimeId`。

```ts
interface ChatMessageWidgetPart {
  id: string
  type: 'widget'
  sessionId: string
  widgetId: string
  status: 'created' | 'mounted' | 'finished' | 'failure' | 'cancelled'
  value: WidgetData
  renderContext: {
    input: Record<string, unknown>
    state: Record<string, unknown>
  }
  lifecycle: {
    mountedAt?: string
    unmountedAt?: string
  }
}
```

这个 Widget part 是运行时数据载体。来源 `WidgetData` 是模板，不应被运行态状态直接修改。运行态容器从 Widget part 的 `renderContext` 派生 `WidgetRenderContext`，再通过 `useRenderContext` 注入给元素渲染层。`this.$setState(...)` 的最终结果写回当前消息的 Widget part，并随聊天消息一起持久化；历史消息重新加载时直接使用消息里的 state 快照渲染。

状态转换：

```text
created
  -> mounted
mounted
  -> finished
  -> failure
  -> cancelled
```

并发和重入规则：

- `mounted` 表示小组件正在展示，也表示仍可继续等待用户操作。
- 元素交互执行时不额外写入持久化的 `running` 状态；UI 层需要防重复点击时使用组件内部临时状态处理。
- 元素交互触发 `this.$sendMessage` 后进入 `finished`；未触发时保持 `mounted`，并保留本次 `this.$setState` 写入的状态。
- 用户中止当前聊天生成或取消小组件时，未完成的小组件进入 `cancelled`。

## 元素渲染与运行态容器

元素渲染统一从 `useRenderContext` 读取上下文：

```ts
interface WidgetRenderContext {
  input: Record<string, unknown>
  state: Record<string, unknown>
}
```

编辑器场景由 `BWidget` 从 `WidgetData.metadata.previewContext` 读取设计期预览上下文并 provide；运行态场景由 `BWidgetRuntime` 接收 `WidgetData` 和当前消息 Widget part 的上下文并 provide。中间层组件不逐级透传 `renderContext` prop。

元素视图组件只解析自己支持的字段：

- `Text/index.vue`：支持在 `metadata.content` 中直接写 `{{ ... }}` 模板。
- `Rect/index.vue`：后续可支持可见性或样式模板字段。
- 未来 `Button/index.vue`：支持 label 模板字段和 click 交互表达式。
- 未来 `List/index.vue`：支持 items 模板字段和 item 交互表达式。
- 未来 `Form/index.vue`：支持输入模板字段和 submit 交互表达式。

公共 helper 避免每个元素重复实现解析逻辑：

```ts
useElementTemplate(element, 'content')
useElementDisplayContent(element, 'content')
resolveWidgetTemplateFieldText(metadata, 'content', context)
```

事件执行 helper 后续再补，当前运行态已支持把节点提交事件交给聊天气泡统一处理。

### 运行态容器

`BWidgetRuntime` 解决“聊天里展示 Widget”的问题。运行态不使用无限 Widget，不读取编辑态 `viewport.center` / `viewport.zoom` 作为展示视口，而是把所有节点的渲染后边界当成内容容器边界：

```ts
interface BWidgetRuntimeProps {
  value: WidgetData
  renderContext: WidgetRenderContext
}
```

它的职责：

- 只读渲染Widget元素，不展示左侧元素库、右侧 Setter、顶部编辑工具栏、无限Widget或选中态编辑交互。
- 使用所有节点的 `position` 和实际渲染尺寸计算内容边界：`minX`、`minY`、`maxX`、`maxY`。
- 内容容器尺寸 = 节点边界尺寸 + padding。
- 节点在运行态舞台内整体平移 `-minX + padding`、`-minY + padding`，让最左上节点从 padding 后开始显示。
- 运行态舞台等比缩放到 chat 消息可用宽度，保证整张Widget完整展示，不出现横向滚动。
- 容器高度根据缩放比例自动计算。
- 通过 `provideRenderContext` 把 `renderContext` 提供给元素。
- 复用现有元素视图和几何计算，验证 Text 模板可以在聊天消息里按当前消息 Widget part 的 state 更新。
- 不修改传入的 `value`，运行态 state 更新写回当前聊天消息的 Widget part。
- 透传节点 `submit` 事件，由 `BubblePartWidget` 在聊天消息层补充 session 信息、执行 `unmounted`、写回 Widget part 或发送 `widget_result`。
- 不提供 Widget 级权限确认；HTTP 只通过脚本运行态注入的 `$http` 进入底层 request。

运行态布局计算可以抽成纯工具函数，供组件和测试共同验证：

```ts
interface WidgetRuntimeLayout {
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    width: number
    height: number
  }
  contentSize: WidgetSize
  offset: WidgetPoint
}
```

空Widget第一版返回一个最小内容尺寸，例如 `1 x 1`，运行态组件可以渲染为空内容区域。是否展示空状态文案留到 chat 接入阶段再决定。

## Setter 扩展

每个元素的 `Setter.vue` 拥有自己的动态配置 UI。

第一版 `Text/Setter.vue` 使用一个 `BPromptEditor` 编辑 `metadata.content`：

- 普通文本直接作为静态内容。
- 输入 `{{` 时展示变量候选，例如 `input.city`、`state.weather.temperature`。
- 变量候选来自Widget input schema 和 execute 代码推导出的 state schema。
- Setter 只读写自己声明的模板字段，不读取其它来源字段。

未来交互元素可以各自扩展：

- Button setter：按钮文案、文案模板、点击交互表达式。
- List setter：items 模板字段、展示字段映射、列表项点击交互表达式。
- Form setter：字段配置、默认值、提交交互表达式。

这样配置入口保持在元素类型内部，不需要新增一个通用但复杂的事件配置器。

## 脚本执行

脚本使用 `defineConfig` 声明生命周期和可选用户辅助函数：

```ts
defineConfig({
  async mounted() {
    this.$setState('loaded', true)
  },

  async unmounted() {
    // 小组件运行完成后执行一次。
  },

  methods: {
    async submitOrder() {
      await this.$sendMessage({
        content: [{ type: 'text', text: '确认下单' }]
      })
    }
  }
})
```

运行时会把受控上下文注入到 `this`：

```ts
interface WidgetThisContext {
  $input: Record<string, unknown>
  $state: Record<string, unknown>
  $setState: (path: string, value: unknown) => void
  $sendMessage: (message: WidgetSendMessageInput) => Promise<void>
  $http: WidgetHttpClient
}

type WidgetSendMessageInput =
  | string
  | Array<{ type: 'text'; text: string }>
  | { content: string | Array<{ type: 'text'; text: string }>; isError?: boolean }
```

脚本不能直接访问 `window`、Electron API、Node 文件系统 API、`process` 或不受限制的 import。

当前脚本运行态是受控解释器，不执行任意 JavaScript。第一版只解析有限语句：局部常量声明、`this.$setState(...)`、`this.$sendMessage(...)`、`await this.$http.get/post/put/patch/delete(...)`，以及字面量、对象字面量、数组字面量、`this.$input.*`、`this.$state.*`、局部变量属性读取。元素交互表达式可以顶层调用一个 `defineConfig.methods` 中的用户辅助函数，例如 `submitOrder()` 或 `selectCoffee('latte', this.$input.city)`；调用参数会按同一套受控表达式求值并绑定到辅助函数形参。辅助函数内部继续调用其它辅助函数、复杂表达式、循环、任意全局 API 都不会执行。

调用 `this.$sendMessage(...)` 表示当前小组件交互结束，并向聊天上行一条文本消息。未调用 `$sendMessage` 时，小组件保持等待用户交互状态。

## HTTP 与权限

脚本只能通过注入的 `$http` 客户端发起请求。第一版不允许 Widget 方法直接使用 `fetch`、`XMLHttpRequest` 或第三方 HTTP 客户端，也不提供用户可配置的 HTTP 权限白名单。

```ts
const weather = await this.$http.get('https://api.example.com/weather', {
  query: { city: this.$input.city }
})
```

`$http` 方法最终调用通用 `ElectronAPI.request(input)`，主进程 request 层统一处理：

- 只允许 `http:` / `https:` URL。
- 支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`。
- `GET` 不发送 body。
- 字符串、`Blob`、`FormData`、`ReadableStream`、`URLSearchParams`、`ArrayBuffer` 作为特殊 body 原样传给 fetch。
- 普通 JSON 值自动 `JSON.stringify` 并设置 `content-type: application/json`。
- 请求默认超时由底层 `request` 常量控制。
- 主进程队列只限制并发，不限制等待队列长度。
- 响应体按流式读取累计大小，超过上限立即取消读取。
- JSON 响应返回解析后的数据，其他响应返回文本。

第一版不支持脚本自定义 header，也不做 per-widget origin/path/method/sensitive-header 权限配置。后续如果要接入高风险网络能力，应作为产品级集成或全局平台策略设计，而不是放进 Widget 作者配置面板。

## 数据流示例

天气：

1. 用户输入“查上海天气”。
2. 模型读取可用 Widget 契约，决定调用天气 Widget。
3. 模型调用 `open_widget`，传入 `{ city: '上海' }`。
4. Widget part 创建后进入运行态，并在 `mounted` 中调用 `this.$http.get(...)`。
5. 底层 `request` 执行天气 API 请求。
6. 成功结果写入 `state.weather`。
7. Text 元素渲染 `{{ state.weather.temperature }}` 和 `{{ state.weather.condition }}`。

咖啡：

1. 用户输入“喝咖啡”。
2. 模型读取可用 Widget 契约，决定调用咖啡 Widget。
3. 模型调用 `open_widget`，传入位置、偏好等可选 input。
4. Widget `mounted` 或后续元素交互搜索咖啡选项。
5. List 元素通过模板字段读取 `state.coffeeList`。
6. 用户选择某个列表项。
7. item 事件后续可触发元素自己的交互表达式，交互写入 `state.selectedCoffee`，并保持 `mounted` 继续选择杯型和定制项；调用 `this.$sendMessage` 后结束。

## 错误处理

- 缺少必填入参：模型继续追问，或渲染Widget表单。
- 模板路径不存在：渲染 fallback，并可在编辑器模式显示非阻塞提示。
- 脚本语法错误：允许保存；运行时返回 `failure`。
- 交互表达式没有匹配到受支持语句：保持当前 Widget part 不变。
- 用户取消当前Widget动作或等待输入：返回 code 为 `USER_CANCELLED` 的 `cancelled`。
- 小组件已 `finished`、`failure` 或 `cancelled` 后触发事件：返回 code 为 `ACTION_NOT_SUPPORTED` 的 `failure`，或在 UI 层禁用该事件入口。
- HTTP URL 非法、超时、响应过大或解析失败：返回带标准化消息的 `failure`。
- 等待用户输入：当前消息的 Widget part 保持 `mounted`，聊天等待用户继续操作小组件。

## 测试

已完成的基础能力测试：

- 模板表达式解析、上下文隔离、数组路径、fallback、`null` 值和非法表达式。
- 模板表达式不执行过滤器、函数调用或复杂 JavaScript。
- `Text/index.vue` 的 `metadata.content` 模板渲染。
- `Text/Setter.vue` 通过一个 `BPromptEditor` 编辑静态内容和动态模板。
- `useElementTemplate`、`useElementDisplayContent`、`useElementVariables`、`useRenderContext` hooks。
- 编辑期 `metadata.previewContext` 的读写和错误提示回填。
- `BWidgetRuntime` 根据传入 `renderContext` 渲染模板字段。
- `BWidgetRuntime` 使用节点渲染后边界作为内容容器边界，不使用无限Widget。
- `BWidgetRuntime` 等比缩放内容舞台到容器宽度，并按缩放比例计算容器高度。
- `BWidgetRuntime` 不展示编辑器工具栏、Setter、元素库、无限Widget、选中态编辑入口。
- `BWidgetRuntime` 不修改来源 `WidgetData`。
- `renderContext` 更新后，Text 元素展示内容同步更新。
- `widget` / `open_widget` 工具只从已启用且解析成功的小组件列表中命中。
- `open_widget` 工具入参只包含 `id` 和可选 `input`，不接收 state 或 output。
- `open_widget` 工具结果可派生聊天内 Widget part，并在 `MessageBubble` 中渲染 `BWidgetRuntime`。
- `WidgetExecuteMethod.enabled`、`description`、`defineConfig` 类型提示和状态 schema 推导。
- `mounted`、`unmounted`、元素交互表达式、用户辅助函数、缺失交互、`this.$setState`、`this.$sendMessage` 和 `$http` 受控执行。
- 托管 request 的协议校验、query 拼接、GET body 忽略、特殊 body 直传、超时、并发队列和响应大小流式中止。
- `WidgetSubmitResult` 与现有聊天工具结果结构保持相近，但不伪装成 tool result 消息。

## 剩余事项

当前主链路已经可以通过 `widget` / `open_widget` 在聊天里展示 Widget，并让消息内运行态保存 `input`、`state`、生命周期和 `$sendMessage` 结果。后续剩余工作主要集中在元素交互和体验闭环。

1. 元素级交互还没有产品化。

   底层已经存在 `useWidgetRuntime().value?.runInteraction(...)` 通道，但还没有实际元素把自己的交互配置接进去。下一步应先做最小 `Button` 元素：按钮文案使用 `metadata.label`，点击交互表达式使用 `metadata.onClick`，元素自己在点击时调用运行态交互。平台不关心业务函数名，也不提供 `callMethod('xxx')` 这类系统协议；业务方想写 `submitOrder()`、`selectCoffee()` 或直接写 `this.$sendMessage(...)` 都是元素交互表达式自己的内容。

2. 交互 `event` 上下文还没有接入。

   文档里已经预留 `event`，但当前受控脚本执行上下文主要是 `this.$input`、`this.$state`、局部变量、`this.$http`。未来 List/Form 这类元素需要把“点击了哪一项”“表单提交了哪些字段”等数据作为交互事件上下文注入，否则元素无法把用户操作带给脚本。第一版可以先只支持元素传入的普通对象事件，例如 `event.value`、`event.item`、`event.form`。

3. Button/List/Form 等交互元素还没有完成。

   Text 元素已经完成模板展示闭环；咖啡、表单选择、确认下单等场景还需要交互元素承载。建议顺序是先做 Button 验证点击与 `$sendMessage` 闭环，再做 List 验证列表项选择与 `state` 更新，最后做 Form 验证缺少 input 时由 Widget 内部收集字段。

4. Widget 运行态交互状态还需要 UI 收口。

   当前数据模型已经有 `created`、`mounted`、`finished`、`failure`、`cancelled`，但具体元素还需要根据状态处理禁用、加载、失败提示和防重复点击。已经 `finished`、`failure` 或 `cancelled` 的 Widget 不应继续触发交互。

5. 脚本解释器只覆盖了第一版最小语句。

   当前受控执行器适合简单的 `this.$setState(...)`、`this.$sendMessage(...)`、`this.$http.*(...)` 和局部常量读取。后续如果真实 Widget 需要更多表达式能力，可以按场景小步增加，但仍不应该开放任意 JavaScript、全局对象、import、DOM、Node 或 Electron API。

6. 缺少 input 时的 Widget 内收集体验还没有完成。

   现在模型可以选择继续追问，也可以用已有 input 打开 Widget。后续如果 Widget 自带表单，应允许 `open_widget` 只传 `id` 或部分 `input`，再由 Form 元素收集缺失字段，并通过 `$setState` 或 `$sendMessage` 完成闭环。

## 建议实现顺序

推荐下一步实现顺序：

1. 新增最小 `Button` 元素，让 `metadata.label` 支持模板，`metadata.onClick` 支持交互表达式，点击后调用 `useWidgetRuntime().value?.runInteraction(metadata.onClick)`。
2. 为元素交互补充 `event` 上下文，让后续 List/Form 可以把用户操作数据传给脚本。
3. 新增 `List` 元素，支持从模板字段读取列表数据，并在 item 点击时触发自己的交互表达式。
4. 新增 `Form` 元素，支持 Widget 内部收集缺失 input，并把提交结果交给交互表达式处理。
5. 补齐运行态交互 UI 状态：防重复点击、结束后禁用、失败状态提示和必要测试。
6. 按真实用例扩展受控脚本解释器的表达式能力，但仍避免任意 JavaScript 和全局 API。
7. 如需要高风险网络、凭据或第三方账号能力，再设计产品级集成和全局平台策略，不放进 Widget 作者配置面板。

这个顺序可以在已经可用的工具调用纵向闭环上继续增加交互能力，同时保持与更丰富元素类型兼容。
