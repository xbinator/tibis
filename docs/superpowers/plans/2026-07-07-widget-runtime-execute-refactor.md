# BWidget Runtime Execute Refactor Plan

> Updated after the final API decision: Widget scripts use `this.$input` and `this.$output` directly. No `$execute` compatibility layer is kept.

## Checklist

- [x] Add `onExecute` before display and keep `onMounted` as the display lifecycle.
- [x] Remove historical script `mounted` / `unmounted` lifecycle support.
- [x] Remove `kind: 'widget_display'` from `open_widget` display payloads.
- [x] Keep `open_widget` tool envelope successful when the widget can display, while reporting `onExecute` failure through `execution`.
- [x] Keep `onExecute` failure output as `undefined` and still run `onMounted`.
- [x] Trim model-visible `open_widget` tool result to `{ sessionId, widgetId, execution }`.
- [x] Keep `onExecute` `$sendMessage` calls isolated from Chat.
- [x] Gate display/interaction `$sendMessage` in BChat while an assistant stream is active.
- [x] Replace public script context with read-only `this.$input` and `this.$output`.
- [x] Flatten `WidgetRenderContext` to `{ input, output, data, isMounted? }`.
- [x] Update bindings, variable candidates, loop sources, preview context, schema inference, and editor extra lib to `$input` / `$output`.
- [x] Expand the default Widget script template with lifecycle/tooling comments and examples.
- [x] Update tests and fixtures for the new protocol.
- [x] Final verification: `pnpm lint`, `pnpm lint:style`, `pnpm exec tsc --noEmit`, `pnpm test`.

## Final API

```ts
export default class Example extends Widget {
  async onExecute() {
    return { ok: true }
  }

  onMounted() {
    this.message = String(this.$input.message ?? '')
    this.result = this.$output
  }

  confirm() {
    this.$sendMessage(this.message)
  }
}
```

## Runtime Payload

```ts
{
  sessionId,
  widgetId,
  value,
  renderContext: {
    input,
    output,
    data,
    isMounted?
  },
  execution
}
```
