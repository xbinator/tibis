# Elements And Bindings Reference

Use this reference when creating `elements`, styles, groups, loops, images, buttons, or template bindings.

## Base Element

Every element in `elements` and group `children` should include:

```json
{
  "id": "city-text",
  "name": "text",
  "label": "文本",
  "icon": "lucide:type",
  "title": "城市",
  "position": { "x": 16, "y": 16 },
  "size": { "width": 180, "height": 32 },
  "rotation": 0,
  "style": {},
  "loop": {
    "enabled": false,
    "source": "",
    "autoColumns": false,
    "columns": 1,
    "columnGap": 12,
    "rowGap": 12,
    "itemName": "",
    "indexName": ""
  },
  "metadata": { "content": "{{ $input.city }}" }
}
```

Supported `name` values are `rect`, `text`, `image`, `button`, and `group`. Element IDs must be globally unique, including nested group children.

## Element Metadata

`rect` uses style and geometry. Its metadata may be `{}`.

`text` metadata:

```json
{ "content": "{{ condition }}", "maxLines": 2 }
```

`maxLines` controls the maximum visible lines. Positive integer caps the visible lines; non-positive or missing value keeps the text fully visible. Manual line breaks (`\n`) are counted toward the line budget.

`image` metadata:

```json
{ "src": "{{ iconUrl }}", "fit": "cover", "alt": "{{ condition }}" }
```

`button` metadata:

```json
{
  "text": "刷新",
  "disabled": false,
  "loading": "{{ loading }}",
  "actions": [{ "method": "refresh", "args": [] }]
}
```

Every button `actions[].method` should be a method declared on the exported Widget class.

## Styles

Useful style fields include `backgroundColor`, `borderColor`, `borderStyle`, `borderWidth`, `borderRadius`, `padding`, `color`, `fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `textDecoration`, `textAlign`, `textVerticalAlign`, and `opacity`.

Use positive numbers for sizes and font sizes. `opacity` is between `0` and `1`. Box values such as `padding`, `borderWidth`, and `borderRadius` can be a number or an object of side/corner numbers.

## Groups

Groups use `name: "group"` and may contain `children`. Child positions are relative to the group position. Non-group elements must not contain `children`.

## Loops

Loop source is a binding path, not moustache text. Use a bare runtime data field such as `items`, not `{{ items }}`.

```json
{
  "enabled": true,
  "source": "items",
  "autoColumns": false,
  "columns": 2,
  "columnGap": 12,
  "rowGap": 12,
  "itemName": "item",
  "indexName": "index"
}
```

Set `autoColumns: true` when the parent width is not known up front. In that mode `columns` may be omitted or set to the literal string `"auto"` and the runtime will compute the column count from the available width. When `autoColumns: false`, `columns` must be a positive integer.

Inside looped element metadata, `item` and `index` are local binding roots:

```json
{ "content": "{{ item.label }} #{{ index }}" }
```

## Bindings

Bindings use moustache syntax in metadata strings:

```text
{{ $input.city }}
{{ $output.summary }}
{{ condition }}
{{ forecast[0].temperature }}
```

Root rules:

- `$input` reads `renderContext.input`.
- `$output` reads the successful `onExecute` return value.
- Bare names read `renderContext.data`.
- Loop local roots come from `loop.itemName` and `loop.indexName`.

Dotted or indexed paths such as `{{ forecast[0].temperature }}` and `{{ user.profile.name }}` are resolved at runtime but are not statically verified against the schema; only the root name is checked. Declare the root in the relevant schema (`dataSchema` for bare roots, `inputSchema` for `$input.x`, `outputSchema` for `$output.x`).

## Image Resources

The package can include local resource files, and the validator checks local image paths for existence and path traversal. Current image rendering passes `metadata.src` directly to `<img>`, so prefer HTTPS URLs, data URLs, or host-resolvable URLs unless the target integration is known to serve packaged resources.
