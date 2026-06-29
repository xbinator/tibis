# 2026-06-29 画布 Skill 设计

## 概要

这个设计把 Drawing 文档扩展成一种类似 Skill 的可视化能力：它可以被聊天发现、被 AI 路由选中，并以交互式画布卡片的形式展示给用户。画布本身仍然是 `DrawingData` 文档，不新增顶层 `runtime` 字段。Skill 发现相关信息放在 `DrawingData.metadata.skill` 下；动态展示使用元素自己的模板字段，例如 `metadata.content = "天气：{{ state.weather.temperature }}"`；交互逻辑放在元素自己的 `metadata.handlers` 中，并由 `src/components/BDrawing/elements/**/Setter.vue` 和 `src/components/BDrawing/elements/**/index.vue` 分别负责编辑和渲染。

第一条纵向闭环应支持天气或咖啡画布：

- 用户输入“查天气”或“喝咖啡”。
- 聊天从工作区画布和全局画布能力库中找到匹配的 Drawing Skill。
- 高置信度匹配自动启动；候选模糊时让用户选择。
- 画布在聊天中作为一次会话展示，而不是打开编辑器页面。
- 元素根据会话的 `input`、`state`、`output`、`lastResult` 解析模板字段。
- 元素事件关联画布方法，画布方法是受控环境中执行的完整函数。
- HTTP、AI、权限确认、取消、失败和等待用户输入统一返回同一种执行结果模型。

当前已经完成第一段基础能力：文本元素可以通过 `{{ input.x }}`、`{{ state.y }}` 等模板读取画布渲染上下文；编辑期通过 `DrawingData.metadata.previewContext` 预览动态内容；模板读写、变量候选和渲染上下文已抽离为 hooks。下一步只做运行态只读画布渲染，让聊天可以先展示一张带 session 上下文的画布。

## 目标

- 让 Drawing 文档可以在聊天中作为可视化 Skill 使用。
- 保持现有 Drawing 编辑器架构不被破坏。
- 避免引入一个庞大的顶层 `runtime` 对象。
- 让每个画布元素自己拥有动态字段和交互能力。
- 允许画布作者为画布方法编写完整函数，并在元素事件中关联这些方法。
- 复用现有 AI 工具执行结果结构，作为画布方法和事件处理结果。
- 同时支持工作区画布发现，以及未来的全局画布能力库。
- 先交付一个最小可体验的运行态画布容器，再逐步接入路由、方法执行和 HTTP 权限。

## 非目标

- 第一版不实现完整市场或能力商店。
- 第一版不要求所有画布元素都动态化。
- 下一步不实现 AI 路由、脚本执行器、HTTP 代理或权限弹窗。
- 不允许画布脚本访问不受限制的浏览器、Electron、Node 或文件系统 API。
- 不把运行时状态写回原始 `.tibis` 文件，除非用户明确编辑或保存模板。
- 不替换现有 AI tools、MCP tools 或 chat runtime；画布 Skill 在需要时与它们集成。

## 当前上下文

当前 Drawing 页面主要围绕 `src/views/drawing/index.vue`、`src/components/BDrawing/index.vue` 和 `src/components/BDrawing/elements` 下的元素注册体系展开。

现有元素结构：

- `src/components/BDrawing/elements/index.ts` 注册元素 schema、视图组件和 setter 组件。
- `src/components/BDrawing/elements/Text/index.vue` 渲染文本元素。
- `src/components/BDrawing/elements/Text/Setter.vue` 编辑文本元素专属 metadata。
- `src/components/BDrawing/elements/Rect/index.vue` 渲染矩形元素。
- `src/components/BDrawing/elements/Rect/Setter.vue` 编辑矩形元素专属属性。

这个结构很适合承载动态元素能力。文本元素可以声明自己支持 `content` 模板字段；未来按钮元素可以声明自己支持 `click` 事件关联方法；未来列表元素可以声明自己支持 `items` 模板字段和列表项选择事件关联方法。

## 数据模型

### DrawingData

`DrawingData` 保持现有形态：

```ts
interface DrawingData {
  name: string
  description: string
  inputSchema: ObjectJsonSchema
  outputSchema: ObjectJsonSchema
  metadata: DrawingMetadata
  elements: DrawingElement[]
  viewport: DrawingViewport
}
```

`inputSchema` 和 `outputSchema` 后续应与 AI 结构化输出使用同一种对象 JSON Schema 类型。Drawing 页面仍然可以提供受限的编辑体验，但持久化时不应丢弃合法 JSON Schema 字段，例如 `enum`、`default`、`additionalProperties`、`items`、`minimum`、`maxLength` 等。

### 画布级 Skill 元信息

Skill 发现、权限和方法定义放在 `DrawingData.metadata.skill` 下：

```ts
interface DrawingSkillMetadata {
  enabled: boolean
  aliases?: string[]
  triggers?: string[]
  permissions?: DrawingSkillPermissions
  methods?: Record<string, DrawingSkillMethod>
}

interface DrawingSkillPermissions {
  http?: DrawingSkillHttpPermission[]
  defaultHttpPolicy?: 'confirm' | 'deny'
}

type DrawingHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface DrawingSkillHttpPermission {
  /** 允许访问的 origin，支持精确 origin 或受限子域通配符，例如 https://api.example.com、https://*.example.com */
  origin: string
  /** 可选路径前缀或路径模式；不配置时表示该 origin 下所有路径 */
  paths?: string[]
  /** 这条规则适用的画布方法名；不配置时表示所有方法 */
  methodNames?: string[]
  /** 允许的 HTTP method；不配置时默认只允许 GET */
  httpMethods?: DrawingHttpMethod[]
  /** 允许脚本显式携带的敏感 header 名称；未列出的敏感 header 需要确认或拒绝 */
  sensitiveHeaders?: string[]
  /** 命中该规则时是否仍需要用户确认 */
  requireConfirmation?: boolean
}

interface DrawingSkillMethod {
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

`name`、`description`、`aliases`、`triggers` 用于 Skill 路由。`methods` 是可被元素事件处理器复用的代码方法。方法代码应是一个完整函数，函数内部完成闭环：读取上下文、调用 HTTP/AI/其他方法、写入 session state，并返回统一 `ExecutionResult`。

方法执行控制规则：

- `enabled` 缺省视为 `true`；禁用方法不会被路由、元素事件或其他方法调用。
- `description` 用于编辑器提示、权限确认和调试记录，不参与执行逻辑。
- `timeout` 只允许缩短系统默认超时；超过系统上限时按系统上限处理。
- 方法可以通过 `ctx.methods.otherMethod()` 调用其他方法。
- 允许方法间非循环调用，例如 `loadWeather` 调用 `normalizeWeather`。
- 禁止方法同步或异步调用自身；执行器发现当前方法再次出现在调用栈时，返回 `status: 'failure'`、code 为 `EXECUTION_FAILED` 的结果。
- 间接递归同样通过调用栈检测阻止，例如 `A -> B -> A`；另外设置全局调用深度上限，第一版建议默认 8 层，超过后返回 `TOOL_TIMEOUT` 或 `EXECUTION_FAILED`。

### 元素级动态元信息

每个元素自己声明可模板化字段，并把字段值直接存放在 `element.metadata` 中。字段值本身可以包含简单模板。第一版 Text 元素直接把模板写在 `metadata.content` 中：

```ts
metadata: {
  content: "{{ input.city }} 当前 {{ state.weather.temperature }}°C"
}
```

这条规则是为了减少组件开发者和画布作者的心智负担：一个字段只有一个来源，不再拆成两个字段来源。如果未来列表、表单、按钮等元素需要模板能力，也应沿用同样模式，例如 `metadata.items`、`metadata.label`、`metadata.defaultValue`，而不是增加第二套模板存储。

事件到方法的关联关系存放在 `element.metadata.handlers` 中：

```ts
interface DrawingElementHandler {
  /** 事件触发时调用的画布级方法名 */
  methodName: string
}
```

`handlers` 默认只负责把元素事件连接到某个画布级方法：

```ts
metadata: {
  handlers: {
    click: {
      methodName: 'loadWeather'
    }
  }
}
```

模板展示保持声明式，因为它只是简单展示逻辑。事件不再配置一段复杂流程，而是触发一个完整方法函数。复杂分支、API 调用、状态写入和结果返回都放在方法函数中完成。

### 模板表达式语法

模板表达式使用 `{{ ... }}` 插值语法。第一版只支持路径读取，不支持任意 JavaScript、函数调用、过滤器、管道或复杂表达式。

支持的上下文根：

- `input`：画布启动入参，例如 `{{ input.city }}`。
- `state`：画布会话运行状态，例如 `{{ state.weather.temperature }}`。
- `output`：画布最终输出，例如 `{{ output.summary }}`。
- `lastResult`：最近一次执行结果，例如 `{{ lastResult.status }}`。
- `event`：仅在未来事件方法执行期间可用；当前渲染模板实现不支持 `event`，普通渲染模板中也不可用。

支持的路径格式：

```ts
{{ input.city }}
{{ state.weather.temperature }}
{{ state.coffeeList[0].name }}
{{ lastResult.data.message }}
```

解析规则：

- 模板字符串可以包含多个插值，例如 `{{ input.city }} 当前 {{ state.weather.temperature }}°C`。
- 如果整个字段值只有一个插值，解析结果保留原始类型；例如 `{{ state.count }}` 可以得到 number。
- 如果字段值包含普通文本和插值，最终结果转为字符串。
- 路径不存在、值为 `undefined` 或表达式非法时，字段保持自己的原始模板文本作为 fallback，用于编辑期可见性和运行期降级展示。
- `null` 是有效值，不触发 fallback；是否显示为空由元素渲染器决定。
- 第一版不支持 `{{ state.x | default("无") }}` 这类过滤器；需要默认值时应在方法函数里写入 state 默认值，或保留元素静态 fallback。

## 执行结果

画布 Skill 应复用并泛化 `types/ai.d.ts` 中现有的 AI 工具执行结果模型。

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

画布特有上下文记录在结果外层：

```ts
interface DrawingMethodExecutionRecord {
  sessionId: string
  drawingId: string
  methodName: string
  elementId?: string
  result: ExecutionResult
  startedAt: number
  finishedAt?: number
}
```

这样 AI 工具、画布方法、HTTP 调用、元素事件触发结果、取消、失败和等待用户输入都使用同一个状态模型。

## Skill 发现

Skill 路由器从两个来源构建轻量索引：

- 工作区内的 `.tibis` 画布文件。
- 未来的全局画布能力库。

工作区画布优先于全局能力库。索引条目只包含路由所需元信息：

```ts
interface DrawingSkillIndexEntry {
  drawingId: string
  source: 'workspace' | 'library'
  name: string
  description: string
  aliases: string[]
  triggers: string[]
  inputSchema: ObjectJsonSchema
  outputSchema: ObjectJsonSchema
}
```

完整画布文件只在候选被选中后加载。

## 聊天路由

用户发送聊天消息时，聊天流程先运行 Drawing Skill 路由器，再决定是否回落到普通回答。

路由器结合 aliases、triggers、description、当前聊天上下文，以及可选的 AI 结构化分类，生成候选结果：

```ts
interface DrawingSkillRouteCandidate {
  drawingId: string
  source: 'workspace' | 'library'
  confidence: number
  extractedInput: Record<string, unknown>
  missingFields: string[]
}
```

启动规则：

- 最高候选超过置信度阈值且没有明显冲突时，自动启动。
- 置信度低或多个候选接近时，在聊天中展示候选列表让用户选择。
- 必填入参缺失时，可以通过聊天追问，也可以渲染画布里的表单元素。

## 画布 Skill 会话

启动画布 Skill 会在聊天中创建一次会话，不会修改来源画布模板。

```ts
interface DrawingSkillSession {
  sessionId: string
  drawingId: string
  source: 'workspace' | 'library'
  input: Record<string, unknown>
  state: Record<string, unknown>
  output?: unknown
  lastResult?: ExecutionResult
  status: 'idle' | 'running' | 'awaiting_user_input' | 'success' | 'failure' | 'cancelled'
}
```

这个 session 是运行时数据载体。来源 `DrawingData` 是模板，不应被 session 状态直接修改。运行态容器从 session 派生 `DrawingRenderContext`，再通过 `useRenderContext` 注入给元素渲染层。

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
  -> idle（重新启动同一画布会话或创建新会话时）
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
interface DrawingRenderContext {
  input: Record<string, unknown>
  state: Record<string, unknown>
  output?: unknown
  lastResult?: ExecutionResult
}
```

编辑器场景由 `BDrawing` 从 `DrawingData.metadata.previewContext` 读取设计期预览上下文并 provide；运行态场景由后续 `BDrawingRuntimeView` 接收 `DrawingData` 和 session 上下文并 provide。中间层组件不逐级透传 `renderContext` prop。

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
resolveDrawingTemplateFieldText(metadata, 'content', context)
```

事件执行 helper 后续再补，第一段运行态只负责渲染，不处理点击事件。

### 下一步：运行态只读容器

下一步新增一个最小 `BDrawingRuntimeView`，只解决“聊天里展示画布”的问题：

```ts
interface BDrawingRuntimeViewProps {
  drawingData: DrawingData
  renderContext: DrawingRenderContext
}
```

它的职责：

- 只读渲染画布元素，不展示左侧元素库、右侧 Setter、顶部编辑工具栏或选中态编辑交互。
- 通过 `provideRenderContext` 把 `renderContext` 提供给元素。
- 复用现有元素视图和几何计算，验证 Text 模板可以在聊天消息里按 session 数据更新。
- 不修改传入的 `drawingData`，session state 更新由外层聊天/Skill 会话管理。
- 第一版不处理元素事件、方法执行、权限确认或 HTTP。

## Setter 扩展

每个元素的 `Setter.vue` 拥有自己的动态配置 UI。

第一版 `Text/Setter.vue` 使用一个 `BPromptEditor` 编辑 `metadata.content`：

- 普通文本直接作为静态内容。
- 输入 `{{` 时展示变量候选，例如 `input.city`、`state.weather.temperature`。
- 变量候选来自画布 input/output schema 和设计期预览 state。
- Setter 只读写自己声明的模板字段，不读取其它来源字段。

未来交互元素可以各自扩展：

- Button setter：按钮文案、文案模板、点击事件关联的方法。
- List setter：items 模板字段、展示字段映射、列表项点击关联的方法。
- Form setter：字段配置、默认值、提交事件关联的方法。

这样配置入口保持在元素类型内部，不需要新增一个通用但复杂的事件配置器。

## 脚本执行

脚本以画布级方法为主：

- 画布级方法：来自 `metadata.skill.methods`，方法代码是完整函数。
- 元素级事件处理器：来自 `element.metadata.handlers`，默认只把事件转发给某个画布级方法。

方法代码运行在受控上下文中。推荐写成一个完整函数，一次完成闭环：

```ts
async function loadWeather(ctx: DrawingScriptContext): Promise<ExecutionResult> {
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
interface DrawingScriptContext {
  input: Record<string, unknown>
  state: Record<string, unknown>
  output?: unknown
  event?: unknown
  methods: Record<string, (inputOverride?: Record<string, unknown>) => Promise<ExecutionResult>>
  http: DrawingHttpClient
  ai: DrawingAIClient
  setState: (path: string, value: unknown) => void
  emit: (eventName: string, payload?: unknown) => void
  result: ExecutionResultFactory
}
```

脚本不能直接访问 `window`、Electron API、Node 文件系统 API、`process` 或不受限制的 import。

轻量纯表达式求值可以在渲染进程执行。调用 `http`、`ai`、敏感方法或长耗时工作的代码，应在主进程 worker 或等价隔离边界中执行。所有脚本执行都需要超时、取消、异常捕获和结果归一化。

如果方法函数返回普通值，执行器自动包装为 `result.success(value)`。如果方法内部写入了 state，但没有显式返回结果，执行器可以返回 `result.success(null)` 并记录 state diff。

## HTTP 与权限

脚本只能通过注入的 `http` 客户端发起请求。第一版不允许画布方法直接使用 `fetch`、`XMLHttpRequest` 或第三方 HTTP 客户端绕过权限层。

```ts
metadata: {
  skill: {
    permissions: {
      defaultHttpPolicy: 'confirm',
      http: [
        {
          origin: 'https://api.example.com',
          paths: ['/weather'],
          methodNames: ['loadWeather'],
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
- `methodNames`：这条权限规则允许哪些画布方法使用；不配置时表示所有画布方法。
- `httpMethods`：这条权限规则允许哪些 HTTP method；不配置时默认只允许 `GET`。
- `sensitiveHeaders`：允许脚本显式携带的敏感 header 名称，例如 `authorization`、`cookie`、`x-api-key`。未声明的敏感 header 应按 `defaultHttpPolicy` 确认或拒绝。
- `requireConfirmation`：即使命中规则也要求用户确认，适合付款、下单、发消息等有副作用操作。

通配符规则：

- 不支持全局 `*`，持久化画布不能声明“允许任意网络访问”。
- 支持受限子域通配符，例如 `https://*.example.com`。
- 子域通配符只匹配子域，不匹配顶级域本身；如果要允许 `https://example.com`，必须单独声明。
- 通配符只允许出现在 hostname 的最左侧一段，不支持 `https://api.*.com`、`https://*` 或路径中的通配任意跨域能力。

代理策略：

- 所有画布 HTTP 请求统一走主进程代理或等价隔离服务。
- 渲染进程只发送结构化请求意图，主进程负责权限匹配、确认弹窗、header 过滤、redirect 复核、超时和审计。
- redirect 后的新 URL 必须重新校验 origin、path、HTTP method 和敏感 header；不允许通过重定向绕过白名单。
- 主进程应剥离未允许的敏感 header，并在需要确认时展示 origin、路径、HTTP method、画布方法名和敏感 header 摘要。

权限结果：

- 命中允许规则且不需要确认时，请求直接执行。
- 未命中规则时，根据 `defaultHttpPolicy` 决定弹确认框或直接拒绝；不配置时建议默认 `confirm`，但全局设置可以改为更严格的 `deny`。
- 用户明确点击“拒绝”时返回 `status: 'failure'`，code 为 `PERMISSION_DENIED`。
- 用户关闭确认框或点击“不再处理/取消”这类没有授予或拒绝含义的操作时返回 `status: 'failure'`，code 为 `CONFIRMATION_DISMISSED`。
- 用户取消当前正在执行的画布动作或等待输入时返回 `status: 'cancelled'`，code 为 `USER_CANCELLED`。
- 网络错误、HTTP 解析错误或代理异常返回 `status: 'failure'`，code 为 `EXECUTION_FAILED`，并附带标准化错误信息。

## 数据流示例

天气：

1. 用户输入“查上海天气”。
2. 路由器选中天气画布。
3. 抽取入参 `{ city: '上海' }`。
4. 会话启动并调用 `loadWeather`。
5. `loadWeather` 调用已允许的天气 API。
6. 成功结果写入 `state.weather`。
7. Text 元素渲染 `{{ state.weather.temperature }}` 和 `{{ state.weather.condition }}`。

咖啡：

1. 用户输入“喝咖啡”。
2. 路由器选中咖啡画布。
3. 会话以位置、偏好等可选 input 启动。
4. 画布方法搜索咖啡选项。
5. List 元素通过模板字段读取 `state.coffeeList`。
6. 用户选择某个列表项。
7. item 事件触发关联方法，方法写入 `state.selectedCoffee`，或返回 `awaiting_user_input` 继续选择杯型和定制项。

## 错误处理

- 缺少必填入参：路由创建用户问题，或渲染画布表单。
- 模板路径不存在：渲染 fallback，并可在编辑器模式显示非阻塞提示。
- 脚本语法错误：允许保存；运行时返回 `failure`。
- 脚本超时：返回 code 为 `TOOL_TIMEOUT` 的 `failure`。
- 权限明确拒绝：返回 code 为 `PERMISSION_DENIED` 的 `failure`。
- 权限确认被关闭或取消：返回 code 为 `CONFIRMATION_DISMISSED` 的 `failure`。
- 用户取消当前画布动作或等待输入：返回 code 为 `USER_CANCELLED` 的 `cancelled`。
- 方法递归循环：返回 code 为 `EXECUTION_FAILED` 的 `failure`；如果已经触发全局超时，则返回 code 为 `TOOL_TIMEOUT` 的 `failure`。
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

- `BDrawingRuntimeView` 根据传入 `renderContext` 渲染模板字段。
- `BDrawingRuntimeView` 不展示编辑器工具栏、Setter、元素库、选中态编辑入口。
- `BDrawingRuntimeView` 不修改来源 `DrawingData`。
- `renderContext` 更新后，Text 元素展示内容同步更新。

后续 Skill 执行阶段再补以下测试：

- Drawing skill metadata 归一化。
- `DrawingSkillMethod.enabled`、`description`、`timeout` 的默认值、展示和执行控制。
- 创建 session 时不修改源 `DrawingData`。
- 脚本执行结果归一化。
- `ctx.methods` 方法调用、禁用方法、直接递归、间接递归和调用深度上限。
- HTTP 权限按 origin、路径、画布方法名、HTTP method、敏感 header 匹配。
- HTTP 通配符、redirect 复核、主进程代理、确认、关闭确认、拒绝和失败路径。
- Session 状态转换，以及 `running`、`awaiting_user_input` 下的并发和重入行为。
- `ExecutionResult` 与现有聊天工具结果处理兼容。

## 建议实现顺序

推荐实现顺序：

1. 收口设计文档，确保协议只保留模板字段单来源。
2. 新增 `BDrawingRuntimeView`，支持传入 `DrawingData` 和 `DrawingRenderContext` 做只读渲染。
3. 在聊天消息里接入一个 mock Drawing session，先手动展示天气或咖啡画布。
4. 建立 Drawing skill session 模型和状态字段，但暂不执行脚本。
5. 从已加载或已索引画布中做简单 Skill 发现。
6. 天气或咖啡路由纵向闭环。
7. 共享 schema 与执行结果别名。
8. Drawing skill metadata 类型、方法执行控制字段和归一化。
9. 带结果归一化、超时和递归检测的脚本方法执行器。
10. HTTP 主进程代理和细粒度权限检查。

这个顺序可以先交付可用的纵向闭环，同时保持与更丰富元素类型和全局画布能力库兼容。
