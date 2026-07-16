# Runtime API Reference

Use this reference when writing `execute.code`, lifecycle methods, button handlers, HTTP requests, messages, or logger calls.

## Class Protocol

`execute.code` should export one default class that extends `Widget`:

```js
export default class WeatherCard extends Widget {
  async onExecute() {
    return {}
  }
}
```

`Widget` is a host-injected global symbol provided by the runtime. Do not `import` it; do not redeclare it locally. The validator checks this statically. It does not execute the script.

## Context Fields

Inside the class:

- `this.$input` is the readonly input object derived from `inputSchema`.
- `this.$output` is the readonly successful `onExecute` return value, or `undefined`.
- `this.$http` is the hosted HTTP client.
- `this.$sendMessage(...)` sends a user-visible message during display interactions.
- `this.$logger` writes persistent logs.

Direct instance fields are mirrored into `renderContext.data` and can be used by element bindings:

```js
export default class WeatherCard extends Widget {
  city = ''
  condition = ''
  temperature = ''
  loading = false

  async onExecute() {
    await this.refresh()
    return {
      city: this.city,
      condition: this.condition,
      temperature: this.temperature
    }
  }

  async refresh() {
    this.loading = true
    try {
      this.city = this.$input.city
      const response = await this.$http.get('https://api.example.com/weather', {
        query: { city: this.city }
      })
      this.condition = String(response.data.condition ?? '')
      this.temperature = String(response.data.temperature ?? '')
    } finally {
      this.loading = false
    }
  }
}
```

Declare matching `dataSchema.properties` for fields rendered with bare bindings such as `{{ condition }}` or `{{ loading }}`.

## Lifecycle

`onExecute` runs when the model opens the Widget and may return an output object. `onMounted` runs when the Widget is displayed. Button actions and custom events call methods on the same Widget instance in a live display session.

Use persistent fields for facts that must survive rendering and history restore. Use private instance state only for temporary cache in the current live session.

## Button Methods

Button actions call methods by name:

```json
{ "actions": [{ "method": "refresh", "args": [] }] }
```

The class must declare `refresh()` or `async refresh()`. Do not rely on a default placeholder method.

## HTTP, Messages, And Logs

Use `this.$http.get/post/put/patch/delete` instead of browser globals for network calls. Use `this.$sendMessage` for interaction results that should flow back into chat. Use `this.$logger.info/warn/error` for durable logs.

Runtime payloads cross a worker boundary. Inputs, outputs, data, and method arguments should be JSON-safe. Do not pass DOM events, functions, Vue proxies, or other non-cloneable objects as business data.
