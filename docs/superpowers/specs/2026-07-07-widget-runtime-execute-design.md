# BWidget Runtime Execute Refactor Design

## Goal

This refactor makes the widget runtime easier to reason about by separating three concerns that are currently mixed together:

- tool execution: `onExecute`
- widget display lifecycle: `onMounted`
- chat message sending: `$sendMessage`

The change does not keep historical compatibility. Old names and old runtime contracts should be removed instead of shimmed.

## Mental Model

The runtime should follow one linear story:

1. The model calls `open_widget`.
2. The widget script optionally runs `onExecute`.
3. The tool result records whether execution succeeded or failed.
4. The widget is displayed.
5. The widget script runs `onMounted`.
6. User interactions may call `$sendMessage`, but sending is allowed only after the current assistant stream has ended.

`$sendMessage` must not finish the widget, unmount the widget, mark execution done, or carry hidden lifecycle meaning. It only requests a chat message send.

## Public Script API

`createWidgetInteractionScriptDefaultCode` should emit a widget script with:

- optional `async onExecute()`
- optional `onMounted()`
- interaction methods such as `confirm()`

`mounted` is renamed to `onMounted`.

`unmounted` is removed.

`this.$input` is removed.

`this.$execute` is added:

```ts
this.$execute.input
this.$execute.output
```

`this.$execute` is read-only, and its nested `input` and `output` values are also read-only from user script. User code should not be able to mutate it by assigning `this.$execute.output`, mutating nested fields, or replacing `this.$execute`.

`this.$execute.input` comes from the `open_widget` tool input.

`this.$execute.output` is automatically set to the fulfilled return value of `onExecute`. If `onExecute` does not exist, returns `undefined`, or throws, `this.$execute.output` remains `undefined`.

## Tool Result Contract

`open_widget` always returns a successful tool envelope when a widget can be displayed, even if `onExecute` failed. The model still learns about execution failure through the payload.

Payload on execution success:

```ts
{
  sessionId,
  widgetId,
  value,
  renderContext: {
    execute: {
      input,
      output
    },
    data
  },
  execution: {
    status: 'success',
    output
  }
}
```

Payload when `onExecute` is missing:

```ts
{
  sessionId,
  widgetId,
  value,
  renderContext: {
    execute: {
      input,
      output: undefined
    },
    data
  },
  execution: {
    status: 'success',
    output: undefined
  }
}
```

Payload when `onExecute` throws:

```ts
{
  sessionId,
  widgetId,
  value,
  renderContext: {
    execute: {
      input,
      output: undefined
    },
    data
  },
  execution: {
    status: 'failure',
    error: {
      code: 'EXECUTION_FAILED',
      message
    }
  }
}
```

No `kind: 'widget_display'` field should remain. Widget tool parts are identified by:

- `part.type === 'tool'`
- `part.toolName === 'open_widget'`
- `part.result.status === 'success'`
- payload shape

The model-visible tool result should be trimmed to:

```ts
{
  sessionId,
  widgetId,
  execution
}
```

The full `value` and `renderContext` stay renderer-side.

## Runtime Context

`WidgetRenderContext` should use `execute` instead of `input`:

```ts
{
  execute: {
    input,
    output
  },
  data,
  isMounted?
}
```

Template bindings and variable panels should use `$execute.input` and `$execute.output` instead of `$input`.

Direct data bindings keep the existing low-friction behavior for widget data fields.

## `$sendMessage`

`$sendMessage` should only normalize and request a message send. It should not decide whether the runtime is finished.

The actual send gate belongs in the BChat layer. For this refactor, the simple rule is:

- if the assistant stream is still active, reject the send request in the BChat submit path;
- if the assistant stream has ended, send normally.

This keeps widget runtime code free from chat-stream policy and leaves room for a future send queue.

User code may call `$sendMessage` inside `onExecute`, but BChat still decides whether it can be sent. `onExecute` completion state should be tracked internally so runtime behavior is explicit rather than inferred from `$sendMessage`.

## Error Handling

`onExecute` errors must not be written into `$execute.output`.

`onExecute` errors must be visible to the model through `execution.status === 'failure'`.

Display still proceeds after `onExecute` failure, and `onMounted` still runs. This lets the widget show a recovery or fallback UI while the model also sees the execution failure.

## Main Files

Expected implementation areas:

- `src/components/BWidget/utils/widgetExecuteMethod.ts`
- `src/views/widget/constants/methodScriptExtraLib.ts`
- `types/widget.d.ts`
- `src/shared/widget/protocol.ts`
- `src/ai/tools/builtin/WidgetTool/index.ts`
- `src/components/BWidget/utils/widgetRuntime/index.ts`
- `src/components/BWidget/Runtime.vue`
- `src/components/BWidget/utils/widgetBindings.ts`
- `src/components/BWidget/hooks/useElementVariables.ts`
- `src/components/BWidget/utils/widgetLoop.ts`
- `src/components/BWidget/utils/widgetDataSchema.ts`
- `src/components/BChat/hooks/useRuntimeTools.ts`
- `src/components/BChat/hooks/useChatRuntime.ts`
- `src/components/BChat/hooks/useChatSubmitter.ts`
- `src/components/BChat/utils/messageHelper.ts`
- `src/components/BChat/components/MessageBubble/BubblePartWidget/index.vue`
- `electron/main/modules/chat/runtime/context/model-message.mts`
- `electron/main/modules/chat/runtime/stream/index.mts`

## Test Strategy

Update existing tests rather than preserve old behavior:

- widget runtime lifecycle: `onExecute` before `onMounted`, no `unmounted`
- optional `onExecute` returns success with `output: undefined`
- failed `onExecute` returns payload execution failure and still mounts
- `$execute` is deeply read-only
- `$input` is removed from runtime, bindings, variable panel, and extra lib
- `kind: 'widget_display'` is removed from renderer and main-process protocol checks
- model-visible `open_widget` result includes `execution` and excludes full display payload
- `$sendMessage` is gated by BChat stream state

Final verification should run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```
