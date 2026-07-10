# Widget Runtime Lifecycle

## One-Line Model

Widget runtime 是一个组件实例运行时，不是“执行一段代码”的工具函数。

开发时应优先思考：当前操作是否发生在同一个 Widget 实例上？这个实例什么时候创建、复用、失效和销毁？`onMounted`、按钮点击、自定义事件只是挂在这个实例运行时上的不同入口。

## Core Contract

显示期运行态的主 API 是 `createWidgetRuntimeSession`：

```ts
const session = createWidgetRuntimeSession(snapshot, host)

await session.mounted()
await session.run('buttonByClick')
await session.run('customEventName', payload)
await session.runInteraction('legacyInteractionCode()')

session.dispose()
```

这个 API 对应 Vue 组件实例的心智模型：先创建实例，再执行生命周期，再响应事件。不要为 `onMounted`、点击事件、自定义事件继续扩散成多套 `runLifecycle`、`runInteraction`、`runCustomEvent` 风格的调用入口。

## Execution Phases

| 阶段 | 入口 | 运行位置 | 主要约束 |
| --- | --- | --- | --- |
| 模型执行期 | `executeWidgetRuntime` / `onExecute` | `src/components/BChat/hooks/useRuntimeTools.ts` 发起 `open_widget` 时 | 大模型还在执行中，不能把 `$sendMessage` 当成真实业务消息发出去；需要按工具执行契约转成模型可见的执行结果或失败。 |
| 显示业务期 | `createWidgetRuntimeSession` / `mounted` / `run` | `src/components/BWidget/Runtime.vue` | 业务层自己触发，`$sendMessage` 可以作为用户交互后的上行消息。 |
| 兼容交互期 | `createWidgetRuntimeInstance().runInteraction` | 旧交互脚本兼容入口 | 这是 one-shot API，不承诺跨调用复用实例；需要共享实例时使用 `createWidgetRuntimeSession`。 |

`onExecute` 和显示业务期都可以暴露同名宿主能力，但语义不同。不要只按 API 名字判断行为，必须先判断当前处在哪个执行阶段。

## Instance Identity

一次 live display session 定义一个 Widget 实例身份：

- 同一个 `WidgetRuntimeSession` 内，`mounted()`、`run('buttonByClick')`、`runInteraction()` 必须复用同一个脚本实例。
- 脚本源码或执行开关变化后，旧 session 必须销毁，新脚本必须创建新 session。
- `Runtime.vue` 中同组件实例切换脚本时，需要清理旧 session、本地运行态快照和 patch preview，避免按钮事件继续执行旧脚本。
- 异步任务完成时必须确认脚本版本仍然有效。旧脚本的 HTTP、timer、promise 结果不能覆盖新脚本状态。
- 沙箱 session 超时后必须终止 Worker 并标记销毁，后续调用应明确失败。

当前相关实现位置：

- `src/components/BWidget/utils/widgetRuntime/index.ts`
- `src/components/BWidget/Runtime.vue`
- `src/utils/sandbox/index.ts`
- `src/utils/sandbox/worker/index.ts`

## State Boundaries

Widget 状态分两层：

| 状态类型 | 示例 | 是否持久 | 说明 |
| --- | --- | --- | --- |
| `renderContext.data` | `this.message = '123'`、`this.weather = {...}` | 是 | 通过 patch 或最终结果写回宿主，可用于模板渲染和历史恢复。 |
| 实例内存状态 | `private cache = new Map()`、函数闭包、不可序列化对象 | 否 | 只存在于当前 live session。dispose、刷新、历史恢复、脚本切换后都会丢失。 |
| 输入输出快照 | `this.$input`、`this.$output` | 只读快照 | 用于初始化和读取执行上下文，不应被业务脚本直接修改。 |

因此，事件方法若需要跨刷新或历史恢复仍然可用，必须把必要数据写入 `renderContext.data`。`private` 字段适合缓存、临时计算和同一显示会话内的短期状态，不适合承载持久业务事实。

传给 Worker 的脚本载荷只承诺 JSON 快照语义。`input`、`output`、`data` 和方法参数会在 Widget runtime 边界转成 JSON-safe 数据，避免 Vue proxy、DOM Event、函数或其他不可结构化克隆对象触发 `DataCloneError`。事件方法需要业务参数时，应传业务数据本身，而不是浏览器原始事件对象。

通用 sandbox 也遵循同一类跨线程约束：`SandboxRunPayload.arguments` 和 host function 返回值在进入 Worker 或回传 Worker 前会转换为可传输快照。业务代码不要依赖跨 Worker 保留 Proxy、函数、DOM 对象或其他宿主引用。

## Mounted And Restore

`renderContext.isMounted` 表示宿主已经保存过 mounted 结果。恢复历史消息时可以跳过 `onMounted`，避免重复请求和重复副作用。

这个策略也意味着：恢复后的新 session 不会自动拥有上一次 `onMounted` 里构建的 `private cache`、`Map`、连接对象或函数闭包。按钮事件如果依赖这些实例内存，恢复后可能表现不同。

未来如果要让恢复后的事件继续依赖私有内存，应新增明确的 hydrate 策略，而不是让 `onMounted` 是否重跑变成偶然行为。

## Event Method Calls

元素事件推荐调用 Widget 实例方法名：

```ts
runtime.value?.run('buttonByClick')
```

业务脚本显式定义方法：

```ts
export default class MovieOnList extends Widget {
  message = ''

  async onExecute() {
    this.message = '123'
  }

  onMounted() {
    console.log(this.message)
  }

  buttonByClick() {
    console.log(this.message)
  }
}
```

按钮点击、自定义事件、本质上都是 `session.run(methodName, ...args)`。不要为每一种事件类型增加独立调度类型；事件名就是方法名，参数就是方法参数。

旧的 `interactionCode` 只作为兼容层保留。它可以继续在 session 内执行，但新的事件能力优先走方法名。

## Default Script Template

默认脚本模板只提供生命周期骨架，不再注入空 `confirm()` 方法。

如果按钮要调用 `confirm`、`buttonByClick` 或其他业务事件，业务脚本必须显式声明对应方法。这样可以避免默认方法造成“看起来能调用，但没有任何业务语义”的误导。

模板生成位置：

- `src/components/BWidget/utils/widgetExecuteMethod.ts`

## Design Rules

1. 先判断执行阶段，再判断宿主能力语义。
2. 长期共享实例只使用 `WidgetRuntimeSession`。
3. 兼容入口保持 one-shot，不让调用方无感持有 Worker。
4. 脚本身份变化必须销毁旧 session。
5. 异步结果写回前必须检查当前脚本版本。
6. 可持久业务状态写入 `renderContext.data`。
7. 实例内存状态只承诺当前 live session 内有效。
8. 新事件能力优先用 `session.run(methodName, ...args)`，不要扩散新的 `kind` 或生命周期枚举。

## Practical Debugging Guide

| 症状 | 优先检查 |
| --- | --- |
| `onMounted` 写入的私有状态按钮读不到 | 是否使用了 one-shot API，或是否经历了 dispose/恢复历史消息。 |
| 按钮点击仍执行旧脚本 | `Runtime.vue` 是否在脚本 identity 变化时销毁旧 session。 |
| 旧 HTTP 请求回来覆盖新脚本数据 | 是否用脚本版本守卫丢弃 stale async result。 |
| Worker 超时后后续交互卡死 | `createSandboxSession` 超时分支是否 terminate 并标记 disposed。 |
| Worker 报 `DataCloneError` | 是否把 Vue proxy、DOM Event、函数等不可克隆对象传入脚本；Widget payload 边界应先转 JSON 快照。 |
| 恢复历史消息后事件依赖丢失 | 事件是否依赖不可持久化的实例内存状态。 |
| 默认按钮事件无效果 | 默认模板不注入业务方法，需要脚本显式定义。 |
