# Widget Format Reference

Use this reference for package layout, `widget.json`, schemas, import limits, and validation. Current source files:

- `src/components/BWidget/types.ts`
- `src/ai/widget/scanner.ts`
- `src/ai/widget/importer.ts`
- `src/utils/zip/package.ts`
- `types/widget.d.ts`

## Contents

- [Package Layout](#package-layout)
- [Install Location](#install-location)
- [Top-Level WidgetData](#top-level-widgetdata)
- [Schemas](#schemas)
- [Execute](#execute)
- [Metadata](#metadata)
- [Validation](#validation)

## Package Layout

A generated Widget package should be a directory:

```text
my-widget/
  widget.json
  assets/
    optional-file.png
```

The local scanner discovers Widgets under `~/.tibis/widgets/<directory>/widget.json`; the directory name acts as the stable local Widget ID. Do not install there unless the user asks.

The importer accepts either a single JSON file or a ZIP package whose root contains `widget.json`. ZIP packages are limited to 50 non-directory files and each resource outside `widget.json` is limited to 5 MiB. Paths must stay inside the package.

## Install Location

When the user asks the agent to install or persist a widget, the runtime install path is the parent of the package, **not** the package itself. The plural `widgets/` segment is mandatory — the scanner only watches that subdirectory of `.tibis/`.

- Correct: `~/.tibis/widgets/<id>/widget.json`
- Wrong: `~/.tibis/<id>/widget.json` (missing the `widgets/` segment)
- Wrong: `~/.tibis/widget/<id>/widget.json` (singular `widget`)

Rules:

- `<id>` is the stable local Widget ID and must match the directory name. Allowed characters are `[a-z0-9_-]`; mixed case, spaces and slashes will be rejected by the installer's path safety check.
- The agent should write `widget.json` and any imported resources into `<id>/`, not directly into `.tibis/`.
- Writing the file to any path that is not under `.tibis/widgets/` means the widget will not be picked up by the scanner and will not appear in the Widget settings page.
- When the user has not explicitly asked to install, generate a package directory somewhere else (for example the current workspace) and let the user import it as JSON or ZIP. The Settings → Widgets page provides a “创建小组件” button that calls the official installer with `reject` conflict strategy.

This rule exists because the scanner root is hard-coded in `src/ai/widget/scanner.ts` and `src/layouts/default/hooks/useWidgetInit.ts`; any widget stored outside that root is invisible to the app.

## Top-Level WidgetData

`widget.json` must contain one JSON object with this shape:

```json
{
  "name": "weather-card",
  "description": "Show current weather for a city.",
  "inputSchema": { "type": "object", "properties": {}, "required": [] },
  "outputSchema": { "type": "object", "properties": {}, "required": [] },
  "dataSchema": { "type": "object", "properties": {}, "required": [] },
  "execute": {
    "enabled": true,
    "description": "Fetch and prepare weather data.",
    "code": "export default class WeatherCard extends Widget {\n  async onExecute() {\n    return {}\n  }\n}\n"
  },
  "metadata": { "width": 360, "height": 240 },
  "elements": []
}
```

Do not add extra top-level fields unless the source type is updated.

## Schemas

`inputSchema`, `outputSchema`, and `dataSchema` are object schemas:

```json
{
  "type": "object",
  "description": "Optional schema description.",
  "properties": {
    "city": {
      "type": "string",
      "description": "City name."
    }
  },
  "required": ["city"]
}
```

Property `type` supports `string`, `number`, `boolean`, `object`, and `array`. Object properties may include nested `properties` and `required`; array properties may include `items`.

Use the schemas as the binding contract:

- `$input.foo` must exist in `inputSchema.properties`.
- `$output.foo` must exist in `outputSchema.properties`.
- Bare runtime data bindings such as `{{ temperature }}` must exist in `dataSchema.properties`.

## Execute

`execute.code` is JavaScript text. It should export a default class that extends `Widget`:

```js
export default class WeatherCard extends Widget {
  async onExecute() {
    return {}
  }
}
```

See `references/runtime-api.md` before writing lifecycle code, button methods, HTTP requests, messages, or logger calls.

## Metadata

Top-level `metadata` is an object. `metadata.width` and `metadata.height` are optional positive numbers used by the validator for element bounds checks.

## Validation

Run:

```bash
node ../scripts/validate-widget.js <widget-directory>
```

The validator checks JSON shape, schemas, element IDs, supported element names, geometry, loops, package limits, image resource paths, button method names, runtime class protocol, and common binding mistakes.
