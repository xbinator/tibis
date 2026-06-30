# 2026-06-29 Widget Skill 设计

## 概要

这个设计把 Widget 文档扩展成一种类似 Skill 的可视化能力：它可以被聊天发现、被 AI 路由选中，并以交互式Widget卡片的形式展示给用户。Widget本身仍然是 `WidgetData` 文档，不新增顶层 `runtime` 字段。Skill 发现相关信息放在 `WidgetData.metadata.skill` 下；执行入口使用 `WidgetData.execute`，不放入 `metadata.skill.methods`；动态展示使用元素自己的模板字段，例如 `metadata.content = "天气：{{ state.weather.temperature }}"`；交互逻辑放在元素自己的 `metadata.handlers` 中，并由 `src/components/BWidget/elements/**/Setter.vue` 和 `src/components/BWidget/elements/**/index.vue` 分别负责编辑和渲染。

第一条纵向闭环应支持天气或咖啡Widget：

- 用户输入“查天气”或“喝咖啡”。
- 聊天从工作区Widget和全局Widget能力库中找到匹配的 Widget Skill。
- 高置信度匹配自动启动；候选模糊时让用户选择。
- Widget在聊天中作为一次会话展示，而不是打开编辑器页面。
- 元素根据会话的 `input`、`state`、`output` 解析模板字段。
- 元素事件关联Widget方法，Widget方法是受控环境中执行的完整函数。
- HTTP、AI、权限确认、取消、失败和等待用户输入统一返回同一种执行结果模型。

当前已经完成第一段基础能力：文本元素可以通过 `{{ input.x }}`、`{{ state.y }}` 等模板读取Widget渲染上下文；模板读写、变量候选和渲染上下文已抽离为 hooks。编辑期的 `state.*` 变量候选不再依赖手写状态声明，而是从 execute 方法代码里的 `setState` 调用推导。下一步只做运行态只读Widget渲染，让聊天可以先展示一张带 session 上下文的Widget。

## 目标

- 让 Widget 文档可以在聊天中作为可视化 Skill 使用。
- 保持现有 Widget 编辑器架构不被破坏。
- 避免引入一个庞大的顶层 `runtime` 对象。
- 让每个Widget元素自己拥有动态字段和交互能力。
- 允许Widget作者为Widget方法编写完整函数，并在元素事件中关联这些方法。
- 复用现有 AI 工具执行结果结构，作为Widget方法和事件处理结果。
- 同时支持工作区Widget发现，以及未来的全局Widget能力库。
- 先交付一个最小可体验的运行态Widget容器，再逐步接入路由、方法执行和 HTTP 权限。

## 非目标

- 第一版不实现完整市场或能力商店。
- 第一版不要求所有Widget元素都动态化。
- 下一步不实现 AI 路由、脚本执行器、HTTP 代理或权限弹窗。
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

这个结构很适合承载动态元素能力。文本元素可以声明自己支持 `content` 模板字段；未来按钮元素可以声明自己支持 `click` 事件关联方法；未来列表元素可以声明自己支持 `items` 模板字段和列表项选择事件关联方法。

## 数据模型

### WidgetData

`WidgetData` 保持现有形态：

```ts
interface WidgetData {
  name: string
  description: string
  inputSchema: ObjectJsonSchema
  stateSchema: ObjectJsonSchema
  outputSchema: ObjectJsonSchema
  execute?: WidgetExecuteMethod
  metadata: WidgetMetadata
  elements: WidgetElement[]
  viewport: WidgetViewport
}
```

`inputSchema` 和 `outputSchema` 后续应与 AI 结构化输出使用同一种对象 JSON Schema 类型。Widget 页面仍然可以提供受限的编辑体验，但持久化时不应丢弃合法 JSON Schema 字段，例如 `enum`、`default`、`additionalProperties`、`items`、`minimum`、`maxLength` 等。

`state` 不作为用户需要手写维护的 schema 配置。编辑器通过 `buildWidgetStateSchema` 静态分析 Widget 方法代码中的 `setState(path, value)` / `ctx.setState(path, value)` 调用，生成可绑定的 `state.*` 变量候选。第一版只推导静态字符串路径、对象字面量、基础字面量，以及可对应到 `inputSchema` 的 `input.x` / `ctx.input.x` 类型；动态路径或复杂表达式不强行猜测。

### Widget Skill 发现与执行入口

Skill 发现信息放在 `WidgetData.metadata.skill` 下；执行入口放在 `WidgetData.execute` 下。第一版只支持一个入口函数，不兼容旧的 `metadata.skill.methods.execute`，也不做旧数据迁移：

```ts
interface WidgetSkillMetadata {
  enabled: boolean
  aliases?: string[]
  triggers?: string[]
  permissions?: WidgetSkillPermissions
}

interface WidgetSkillPermissions {
  http?: WidgetSkillHttpPermission[]
  defaultHttpPolicy?: 'confirm' | 'deny'
}

type WidgetHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface WidgetSkillHttpPermission {
  /** 允许访问的 origin，支持精确 origin 或受限子域通配符，例如 https://api.example.com、https://*.example.com */
  origin: string
  /** 可选路径前缀或路径模式；不配置时表示该 origin 下所有路径 */
  paths?: string[]
  /** 允许的 HTTP method；不配置时默认只允许 GET */
  httpMethods?: WidgetHttpMethod[]
  /** 允许脚本显式携带的敏感 header 名称；未列出的敏感 header 需要确认或拒绝 */
  sensitiveHeaders?: string[]
  /** 命中该规则时是否仍需要用户确认 */
  requireConfirmation?: boolean
}

interface WidgetExecuteMethod {
  /** 方法是否启用，默认 true */
  enabled?: boolean
  /** 方法说明，用于编辑器提示、AI 路由解释和权限确认文案 */
  description?: string
  /** 方法执行超时时间，单位毫秒；不配置时使用系统默认值 */
  timeout?: number
  inputSchema?: ObjectJsonSchema
  outputSchema?: ObjectJsonSchema
  /** 完整函数代码，函数内部完成读取上下文、调用能力、写入状态和返回结果 */
  code: string
}
```

`name`、`description`、`aliases`、`triggers` 用于 Skill 路由。`execute` 是 Widget 唯一执行入口，方法代码应是一个完整函数，函数内部完成闭环：读取上下文、调用 HTTP/AI、写入 session state，并返回统一 `ExecutionResult`。

方法执行控制规则：

- `enabled` 缺省视为 `true`；禁用后不会被路由或元素事件触发。
- `description` 用于编辑器提示、权限确认和调试记录，不参与执行逻辑。
- `timeout` 只允许缩短系统默认超时；超过系统上限时按系统上限处理。
- 第一版不提供 `ctx.methods`，因此不存在方法间递归调用问题。后续如引入多方法，需要重新定义调用深度和循环检测。

### 元素级动态元信息

每个元素自己声明可模板化字段，并把字段值直接存放在 `element.metadata` 中。字段值本身可以包含简单模板。第一版 Text 元素直接把模板写在 `metadata.content` 中：

```ts
metadata: {
  content: "{{ input.city }} 当前 {{ state.weather.temperature }}°C"
}
```

这条规则是为了减少组件开发者和Widget作者的心智负担：一个字段只有一个来源，不再拆成两个字段来源。如果未来列表、表单、按钮等元素需要模板能力，也应沿用同样模式，例如 `metadata.items`、`metadata.label`、`metadata.defaultValue`，而不是增加第二套模板存储。

事件到方法的关联关系存放在 `element.metadata.handlers` 中：

```ts
interface WidgetElementHandler {
  /** 事件触发时执行 Widget 顶层 execute */
  action: 'execute'
}
```

`handlers` 默认只负责把元素事件连接到顶层 `execute`：

```ts
metadata: {
  handlers: {
    click: {
      action: 'execute'
    }
  }
}
```

模板展示保持声明式，因为它只是简单展示逻辑。事件不再配置一段复杂流程，而是触发顶层 `execute`。复杂分支、API 调用、状态写入和结果返回都放在 `execute` 函数中完成。

### 模板表达式语法

模板表达式使用 `{{ ... }}` 插值语法。第一版只支持路径读取，不支持任意 JavaScript、函数调用、过滤器、管道或复杂表达式。

支持的上下文根：

- `input`：Widget启动入参，例如 `{{ input.city }}`。
- `state`：Widget会话运行状态，例如 `{{ state.weather.temperature }}`。
- `output`：Widget最终输出，例如 `{{ output.summary }}`。
- `event`：仅在未来事件方法执行期间可用；当前渲染模板实现不支持 `event`，普通渲染模板中也不可用。

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

Widget Skill 应复用并泛化 `types/ai.d.ts` 中现有的 AI 工具执行结果模型。

```ts
type ExecutionResult<TResult = unknown> =
  | { toolName: string; status: 'success'; data: TResult }
  | { toolName: string; status: 'failure'; error: ExecutionError }
  | { toolName: string; status: 'cancelled'; error: ExecutionError }
  | { toolName: string; status: 'awaiting_user_input'; data: AwaitingUserChoiceQuestion }
```

实现初期可以直接别名现有类型：

```ts
type ExecutionResult<TResult = unknown> = AIToolExecutionResult<TResult>
```

Widget特有上下文记录在结果外层：

```ts
interface WidgetMethodExecutionRecord {
  sessionId: string
  widgetId: string
  methodName: string
  elementId?: string
  result: ExecutionResult
  startedAt: number
  finishedAt?: number
}
```

这样 AI 工具、Widget方法、HTTP 调用、元素事件触发结果、取消、失败和等待用户输入都使用同一个状态模型。

## Skill 发现

Skill 路由器从两个来源构建轻量索引：

- 工作区内的 `.tibis` Widget文件。
- 未来的全局Widget能力库。

工作区Widget优先于全局能力库。索引条目只包含路由所需元信息：

```ts
interface WidgetSkillIndexEntry {
  widgetId: string
  source: 'workspace' | 'library'
  name: string
  description: string
  aliases: string[]
  triggers: string[]
  inputSchema: ObjectJsonSchema
  outputSchema: ObjectJsonSchema
}
```

完整Widget文件只在候选被选中后加载。

## 聊天路由

用户发送聊天消息时，聊天流程先运行 Widget Skill 路由器，再决定是否回落到普通回答。

路由器结合 aliases、triggers、description、当前聊天上下文，以及可选的 AI 结构化分类，生成候选结果：

```ts
interface WidgetSkillRouteCandidate {
  widgetId: string
  source: 'workspace' | 'library'
  confidence: number
  extractedInput: Record<string, unknown>
  missingFields: string[]
}
```

启动规则：

- 最高候选超过置信度阈值且没有明显冲突时，自动启动。
- 置信度低或多个候选接近时，在聊天中展示候选列表让用户选择。
- 必填入参缺失时，可以通过聊天追问，也可以渲染Widget里的表单元素。

## Widget Skill 会话

启动Widget Skill 会在聊天中创建一次会话，不会修改来源Widget模板。

```ts
interface WidgetSkillSession {
  sessionId: string
  widgetId: string
  source: 'workspace' | 'library'
  input: Record<string, unknown>
  state: Record<string, unknown>
  output?: unknown
  status: 'idle' | 'running' | 'awaiting_user_input' | 'success' | 'failure' | 'cancelled'
}
```

这个 session 是运行时数据载体。来源 `WidgetData` 是模板，不应被 session 状态直接修改。运行态容器从 session 派生 `WidgetRenderContext`，再通过 `useRenderContext` 注入给元素渲染层。

状态转换：

```text
idle
  -> running
running
  -> success
  -> failure
  -> cancelled
  -> awaiting_user_input
awaiting_user_input
  -> running
  -> cancelled
success | failure | cancelled
  -> idle（重新启动同一Widget会话或创建新会话时）
```

并发和重入规则：

- 同一个 session 同一时间只允许一个方法执行。
- `running` 状态下触发的新事件默认排队；如果事件来自同一个元素同一种事件，可以合并或忽略，具体由元素类型决定。
- `awaiting_user_input` 状态下只允许处理当前等待问题对应的回答、取消或确认事件；其他元素事件应被禁用或返回 `ACTION_NOT_SUPPORTED`。
- 用户取消等待输入时返回 `status: 'cancelled'`、code 为 `USER_CANCELLED`，session 进入 `cancelled`。
- 权限确认弹窗被关闭但用户没有明确选择时返回 `status: 'failure'`、code 为 `CONFIRMATION_DISMISSED`。
- 用户明确拒绝权限时返回 `status: 'failure'`、code 为 `PERMISSION_DENIED`。

## 元素渲染

元素渲染统一从 `useRenderContext` 读取上下文：

```ts
interface WidgetRenderContext {
  input: Record<string, unknown>
  state: Record<string, unknown>
  output?: unknown
}
```

编辑器场景由 `BWidget` 从 `WidgetData.metadata.previewContext` 读取设计期预览上下文并 provide；运行态场景由后续 `BWidgetRuntime` 接收 `WidgetData` 和 session 上下文并 provide。中间层组件不逐级透传 `renderContext` prop。

元素视图组件只解析自己支持的字段：

- `Text/index.vue`：支持在 `metadata.content` 中直接写 `{{ ... }}` 模板。
- `Rect/index.vue`：后续可支持可见性或样式模板字段。
- 未来 `Button/index.vue`：支持 label 模板字段和 click 事件关联方法。
- 未来 `List/index.vue`：支持 items 模板字段和 item 事件关联方法。
- 未来 `Form/index.vue`：支持输入模板字段和 submit 事件关联方法。

公共 helper 避免每个元素重复实现解析逻辑：

```ts
useElementTemplate(element, 'content')
useElementDisplayContent(element, 'content')
resolveWidgetTemplateFieldText(metadata, 'content', context)
```

事件执行 helper 后续再补，第一段运行态只负责渲染，不处理点击事件。

### 下一步：运行态只读容器

下一步新增一个最小 `BWidgetRuntime`，只解决“聊天里展示Widget”的问题。运行态不使用无限Widget，不读取编辑态 `viewport.center` / `viewport.zoom` 作为展示视口，而是把所有节点的渲染后边界当成内容容器边界：

```ts
interface BWidgetRuntimeProps {
  dataItem: WidgetData
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
- 复用现有元素视图和几何计算，验证 Text 模板可以在聊天消息里按 session 数据更新。
- 不修改传入的 `dataItem`，session state 更新由外层聊天/Skill 会话管理。
- 第一版不处理元素事件、方法执行、权限确认或 HTTP。

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
- 变量候选来自Widget input/output schema 和设计期预览 state。
- Setter 只读写自己声明的模板字段，不读取其它来源字段。

未来交互元素可以各自扩展：

- Button setter：按钮文案、文案模板、点击事件关联的方法。
- List setter：items 模板字段、展示字段映射、列表项点击关联的方法。
- Form setter：字段配置、默认值、提交事件关联的方法。

这样配置入口保持在元素类型内部，不需要新增一个通用但复杂的事件配置器。

## 脚本执行

脚本以 Widget 顶层 `execute` 为唯一入口：

- Widget 执行入口：来自 `WidgetData.execute`，方法代码是完整函数。
- 元素级事件处理器：来自 `element.metadata.handlers`，默认只触发顶层 `execute`。

方法代码运行在受控上下文中。推荐写成一个完整函数，一次完成闭环：

```ts
export async function execute(ctx: WidgetScriptContext): Promise<ExecutionResult> {
  const { input, http, setState, result } = ctx
  const response = await http.get('https://api.example.com/weather', {
    query: { city: input.city }
  })

  setState('weather', response.data)
  return result.success(response.data)
}
```

运行时会向函数传入受控上下文：

```ts
interface WidgetScriptContext {
  input: Record<string, unknown>
  state: Record<string, unknown>
  output?: unknown
  event?: unknown
  http: WidgetHttpClient
  ai: WidgetAIClient
  setState: (path: string, value: unknown) => void
  emit: (eventName: string, payload?: unknown) => void
  result: ExecutionResultFactory
}
```

脚本不能直接访问 `window`、Electron API、Node 文件系统 API、`process` 或不受限制的 import。

轻量纯表达式求值可以在渲染进程执行。调用 `http`、`ai` 或长耗时工作的代码，应在主进程 worker 或等价隔离边界中执行。所有脚本执行都需要超时、取消、异常捕获和结果归一化。

如果方法函数返回普通值，执行器自动包装为 `result.success(value)`。如果方法内部写入了 state，但没有显式返回结果，执行器可以返回 `result.success(null)` 并记录 state diff。

## HTTP 与权限

脚本只能通过注入的 `http` 客户端发起请求。第一版不允许Widget方法直接使用 `fetch`、`XMLHttpRequest` 或第三方 HTTP 客户端绕过权限层。

```ts
metadata: {
  skill: {
    permissions: {
      defaultHttpPolicy: 'confirm',
      http: [
        {
          origin: 'https://api.example.com',
          paths: ['/weather'],
          httpMethods: ['GET'],
          sensitiveHeaders: [],
          requireConfirmation: false
        }
      ]
    }
  }
}
```

权限粒度：

- `origin`：请求 URL 的协议、主机和端口。执行器使用标准 `URL` 解析后比较，禁止用字符串前缀匹配完整 URL。
- `paths`：可选路径前缀或路径模式；不配置时表示该 origin 下所有路径。权限匹配不依赖 query，query 只参与请求参数和审计记录。
- `httpMethods`：这条权限规则允许哪些 HTTP method；不配置时默认只允许 `GET`。
- `sensitiveHeaders`：允许脚本显式携带的敏感 header 名称，例如 `authorization`、`cookie`、`x-api-key`。未声明的敏感 header 应按 `defaultHttpPolicy` 确认或拒绝。
- `requireConfirmation`：即使命中规则也要求用户确认，适合付款、下单、发消息等有副作用操作。

通配符规则：

- 不支持全局 `*`，持久化Widget不能声明“允许任意网络访问”。
- 支持受限子域通配符，例如 `https://*.example.com`。
- 子域通配符只匹配子域，不匹配顶级域本身；如果要允许 `https://example.com`，必须单独声明。
- 通配符只允许出现在 hostname 的最左侧一段，不支持 `https://api.*.com`、`https://*` 或路径中的通配任意跨域能力。

代理策略：

- 所有Widget HTTP 请求统一走主进程代理或等价隔离服务。
- 渲染进程只发送结构化请求意图，主进程负责权限匹配、确认弹窗、header 过滤、redirect 复核、超时和审计。
- redirect 后的新 URL 必须重新校验 origin、path、HTTP method 和敏感 header；不允许通过重定向绕过白名单。
- 主进程应剥离未允许的敏感 header，并在需要确认时展示 origin、路径、HTTP method、Widget方法名和敏感 header 摘要。

权限结果：

- 命中允许规则且不需要确认时，请求直接执行。
- 未命中规则时，根据 `defaultHttpPolicy` 决定弹确认框或直接拒绝；不配置时建议默认 `confirm`，但全局设置可以改为更严格的 `deny`。
- 用户明确点击“拒绝”时返回 `status: 'failure'`，code 为 `PERMISSION_DENIED`。
- 用户关闭确认框或点击“不再处理/取消”这类没有授予或拒绝含义的操作时返回 `status: 'failure'`，code 为 `CONFIRMATION_DISMISSED`。
- 用户取消当前正在执行的Widget动作或等待输入时返回 `status: 'cancelled'`，code 为 `USER_CANCELLED`。
- 网络错误、HTTP 解析错误或代理异常返回 `status: 'failure'`，code 为 `EXECUTION_FAILED`，并附带标准化错误信息。

## 数据流示例

天气：

1. 用户输入“查上海天气”。
2. 路由器选中天气Widget。
3. 抽取入参 `{ city: '上海' }`。
4. 会话启动并调用 `loadWeather`。
5. `loadWeather` 调用已允许的天气 API。
6. 成功结果写入 `state.weather`。
7. Text 元素渲染 `{{ state.weather.temperature }}` 和 `{{ state.weather.condition }}`。

咖啡：

1. 用户输入“喝咖啡”。
2. 路由器选中咖啡Widget。
3. 会话以位置、偏好等可选 input 启动。
4. Widget方法搜索咖啡选项。
5. List 元素通过模板字段读取 `state.coffeeList`。
6. 用户选择某个列表项。
7. item 事件触发关联方法，方法写入 `state.selectedCoffee`，或返回 `awaiting_user_input` 继续选择杯型和定制项。

## 错误处理

- 缺少必填入参：路由创建用户问题，或渲染Widget表单。
- 模板路径不存在：渲染 fallback，并可在编辑器模式显示非阻塞提示。
- 脚本语法错误：允许保存；运行时返回 `failure`。
- 脚本超时：返回 code 为 `TOOL_TIMEOUT` 的 `failure`。
- 权限明确拒绝：返回 code 为 `PERMISSION_DENIED` 的 `failure`。
- 权限确认被关闭或取消：返回 code 为 `CONFIRMATION_DISMISSED` 的 `failure`。
- 用户取消当前Widget动作或等待输入：返回 code 为 `USER_CANCELLED` 的 `cancelled`。
- `awaiting_user_input` 期间触发无关事件：返回 code 为 `ACTION_NOT_SUPPORTED` 的 `failure`，或在 UI 层禁用该事件入口。
- HTTP 错误：返回带标准化消息的 `failure`。
- 等待用户输入：session 状态变为 `awaiting_user_input`，聊天等待用户回答或元素交互。

## 测试

已完成的基础能力测试：

- 模板表达式解析、上下文隔离、数组路径、fallback、`null` 值和非法表达式。
- 模板表达式不执行过滤器、函数调用或复杂 JavaScript。
- `Text/index.vue` 的 `metadata.content` 模板渲染。
- `Text/Setter.vue` 通过一个 `BPromptEditor` 编辑静态内容和动态模板。
- `useElementTemplate`、`useElementDisplayContent`、`useElementVariables`、`useRenderContext` hooks。
- 编辑期 `metadata.previewContext` 的读写和错误提示回填。

下一步运行态只读容器应包含以下测试：

- `BWidgetRuntime` 根据传入 `renderContext` 渲染模板字段。
- `BWidgetRuntime` 使用节点渲染后边界作为内容容器边界，不使用无限Widget。
- `BWidgetRuntime` 等比缩放内容舞台到容器宽度，并按缩放比例计算容器高度。
- `BWidgetRuntime` 不展示编辑器工具栏、Setter、元素库、无限Widget、选中态编辑入口。
- `BWidgetRuntime` 不修改来源 `WidgetData`。
- `renderContext` 更新后，Text 元素展示内容同步更新。

后续 Skill 执行阶段再补以下测试：

- Widget skill metadata 归一化。
- `WidgetExecuteMethod.enabled`、`description`、`timeout` 的默认值、展示和执行控制。
- 创建 session 时不修改源 `WidgetData`。
- 脚本执行结果归一化。
- 第一版不提供 `ctx.methods`，不做多方法递归兼容。
- HTTP 权限按 origin、路径、HTTP method、敏感 header 匹配。
- HTTP 通配符、redirect 复核、主进程代理、确认、关闭确认、拒绝和失败路径。
- Session 状态转换，以及 `running`、`awaiting_user_input` 下的并发和重入行为。
- `ExecutionResult` 与现有聊天工具结果处理兼容。

## 建议实现顺序

推荐实现顺序：

1. 收口设计文档，确保协议只保留模板字段单来源。
2. 新增 `BWidgetRuntime`，支持传入 `WidgetData` 和 `WidgetRenderContext`，按节点内容边界缩放为只读卡片。
3. 在聊天消息里接入一个 mock Widget session，先手动展示天气或咖啡Widget。
4. 建立 Widget skill session 模型和状态字段，但暂不执行脚本。
5. 从已加载或已索引Widget中做简单 Skill 发现。
6. 天气或咖啡路由纵向闭环。
7. 共享 schema 与执行结果别名。
8. Widget skill metadata 类型、顶层 `execute` 执行控制字段和归一化。
9. 带结果归一化和超时控制的脚本执行器。
10. HTTP 主进程代理和细粒度权限检查。

这个顺序可以先交付可用的纵向闭环，同时保持与更丰富元素类型和全局Widget能力库兼容。
