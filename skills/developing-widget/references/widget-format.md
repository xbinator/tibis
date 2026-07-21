# Widget 格式参考

使用本参考确认包目录结构、`widget.json`、schema、导入限制和校验规则。

## 目录

- [包目录结构](#包目录结构)
- [安装位置](#安装位置)
- [顶层 WidgetData](#顶层-widgetdata)
- [Schemas](#schemas)
- [Execute](#execute)
- [Metadata](#metadata)
- [校验](#校验)

## 包目录结构

生成的 Widget 包应该是一个目录：

```text
my-widget/
  widget.json
  assets/
    optional-file.png
```

本地扫描器只会发现 `~/.tibis/widgets/<widget-id>/widget.json` 下的 Widget；目录名会作为稳定的本地 Widget ID。除非用户明确要求安装，否则不要写入该扫描目录。

导入器接受单个 JSON 文件，或根目录包含 `widget.json` 的 ZIP 包。ZIP 包最多包含 50 个非目录文件，`widget.json` 之外的每个资源文件最大 5 MiB。所有路径都必须留在包目录内部。

## 安装位置

当用户要求安装或持久化 Widget 时，运行时扫描根目录是 `~/.tibis/widgets/`。路径中的复数目录段 `widgets/` 是强制要求，扫描器只监听 `.tibis/` 下的这个子目录。

唯一正确的安装文件路径：

```text
~/.tibis/widgets/<widget-id>/widget.json
```

规则：

- `<widget-id>` 是创建弹窗里的“小组件标识”，也是 `WidgetDefinition.id`，必须与目录名一致。它不是 `widget.json.name` 显示名；只有当 `name` 本身已符合 `[a-z0-9_-]` 时，才可以让标识与名称相同。
- `<widget-id>` 允许字符为 `[a-z0-9_-]`；大小写混用、空格和斜杠会被安装器的路径安全检查拒绝。
- 必须把 `widget.json` 和导入资源写入 `<widget-id>/` 目录中，不要直接写入 `.tibis/`。
- 写入前检查最终路径：它必须位于 `.tibis/widgets/` 扫描根目录下，并且文件名必须是 `widget.json`。
- 不要在计划、输出或脚本中复述错误完整路径；只使用上面的唯一正确路径。
- 如果用户没有明确要求安装，应在其他位置生成 Widget 包目录（例如当前 workspace），让用户以 JSON 或 ZIP 方式导入。设置页的 Widgets 区域提供“创建小组件”按钮，会使用 `reject` 冲突策略调用官方安装器。

这条规则存在是因为扫描根目录是硬编码的；任何不在该根目录下的 Widget 都对应用不可见。

## 顶层 WidgetData

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
