# BMessage BlockNode Renderer Design

## Background

`src/components/BMessage/index.vue` currently renders Markdown by converting the whole message into one HTML string and binding it with `v-html="renderedMarkdown"`. During streaming, each content update reparses the full message and replaces a large HTML subtree. This is expensive for long messages and makes future structured message components harder to integrate.

The refactor will make `BMessage` render a message node tree. Markdown text will be parsed into block-level and inline-level nodes, then rendered with Vue components through `v-for` and normal Vue bindings/events.

## Goals

- Replace whole-message `v-html` rendering with `BlockNode` / `InlineNode` rendering.
- Reduce streaming repaint scope by keeping completed block keys stable and updating only the actively growing tail node.
- Make images and links first-class Vue nodes with explicit event handlers.
- Provide an extension point for future structured message components such as tool calls, file cards, charts, citations, and thinking sections.
- Keep the public `BMessage` props compatible with current callers: `content`, `type`, `loading`, `height`, and `maxHeight`.

## Non-Goals

- Do not introduce a new Markdown parser package.
- Do not support raw Markdown HTML as executable/rendered HTML.
- Do not redesign message bubble styling outside `BMessage`.
- Do not change chat message data contracts outside this component.

## Architecture

The component will be split into a parser layer, a node type layer, and a render layer.

- `src/components/BMessage/index.vue`
  - Owns props, container styles, loading state, and image/link actions.
  - Computes `BlockNode[]` from `content`.
  - Renders one `BlockNode` component per top-level node.
  - Provides message render actions to descendant node components with Vue `provide`.

- `src/components/BMessage/types.ts`
  - Defines `BlockNode`, `InlineNode`, and related node-specific interfaces.
  - Defines render context interfaces used by node components.

- `src/components/BMessage/parser.ts`
  - Uses `marked.lexer(content)` to parse Markdown into Marked tokens.
  - Converts Marked tokens into project-owned `BlockNode[]`.
  - Appends cursor nodes when `loading` is true.
  - Ignores or textifies raw HTML tokens instead of returning HTML strings.
  - Owns the local Marked parser instance and deletion tokenizer configuration.

- `src/components/BMessage/components/BlockNode.vue`
  - Renders one block-level node.
  - Dispatches block types such as paragraph, heading, list, blockquote, code, table, horizontal rule, component, and cursor.

- `src/components/BMessage/components/InlineNode.vue`
  - Renders one inline node recursively.
  - Dispatches inline types such as text, strong, emphasis, deletion, code span, link, image, line break, and cursor.

- `src/components/BMessage/utils.ts`
  - Contains stable id helpers, token guards, image collection helpers, and small parser utilities.

## Node Model

The data model is project-owned and should not expose Marked token objects to Vue templates.

```ts
export type MessageNodeRenderMode = 'markdown' | 'text';

export interface MessageNodeBase {
  /** Stable node id used as the Vue key. */
  id: string;
  /** Original source text when available. */
  raw: string;
}

export type BlockNode =
  | ParagraphBlockNode
  | HeadingBlockNode
  | ListBlockNode
  | BlockquoteBlockNode
  | CodeBlockNode
  | TableBlockNode
  | HrBlockNode
  | ComponentBlockNode
  | CursorBlockNode;

export type InlineNode =
  | TextInlineNode
  | StrongInlineNode
  | EmInlineNode
  | DelInlineNode
  | CodeInlineNode
  | LinkInlineNode
  | ImageInlineNode
  | BreakInlineNode
  | CursorInlineNode;

export interface ComponentBlockNode extends MessageNodeBase {
  type: 'component';
  componentName: string;
  data?: unknown;
}
```

Every block node has:

- `id`: stable Vue key.
- `type`: discriminant used by `BlockNode.vue`.
- `raw`: original block text when available, used for stable identity and debugging.

Inline nodes do not need globally unique ids unless rendered with nested `v-for`. Nested inline ids can be derived from the parent block id and inline path.

`ComponentBlockNode` is defined from the start even before specific component block producers exist. This keeps the block dispatcher exhaustive and prevents a future union-type reshuffle when tool calls, file cards, charts, or citations are added.

## Render Modes

`BMessage` keeps the existing `type` prop behavior, but both modes should render through nodes:

- `type="markdown"` parses `content` with `marked.lexer()` and renders Markdown `BlockNode[]`.
- `type="text"` creates text-preserving paragraph nodes without Markdown interpretation, preserving whitespace and the loading cursor behavior currently used by the plain text branch.

Callers remain prop-compatible, and cursor display still depends on the existing `loading` prop. This refactor should not require upstream call sites to derive new loading state; callers that already pass `loading` keep the cursor behavior, and callers that do not pass `loading` keep their current display.

## Supported Markdown Nodes

The implementation should support the Markdown features already expected by `BMessage`:

- Paragraphs
- Headings
- Ordered and unordered lists
- Blockquotes
- Fenced and indented code blocks
- Tables
- Horizontal rules
- Inline text
- Strong and emphasis
- Deletion with the existing double-tilde-only behavior
- Inline code
- Links
- Images
- Hard and soft line breaks

Unknown or unsupported tokens should render as safe text instead of HTML.

## Raw HTML Handling

Raw Markdown HTML will not be rendered as HTML. HTML tokens should be converted to text nodes or ignored when empty.

This keeps the message renderer safe by default and aligns with the goal of removing `v-html`. Future rich components should be represented as explicit `ComponentBlockNode` entries rather than raw HTML.

## Streaming Behavior

Streaming updates will still be scheduled with `requestAnimationFrame`, so content changes are parsed at most once per frame.

The parser must generate stable ids for completed blocks and a fixed id for the mutable tail block while `loading` is true. The id strategy is:

- Use block index plus a stable hash of block `raw`.
- For all completed blocks, use `block-${index}-${hash(raw)}`.
- For the active tail block during streaming, use `block-tail-${index}` without the raw hash, so the same Vue component instance is preserved while the tail text grows.
- After `loading` becomes false, promote the tail node to the completed-block id format.
- Append a `CursorInlineNode` to the last inline-capable node when possible.
- Use a separate `CursorBlockNode` when the message is empty or the last node cannot contain inline children.

With stable ids, Vue can preserve completed block DOM and component instances while only the growing tail block changes.

## Marked Parser Scope

The current component mutates the shared `marked` module by calling `marked.use(...)` at module scope. The refactor should avoid leaking BMessage-specific tokenizer behavior to other Markdown users.

`parser.ts` should create and export a local Marked instance configured for this renderer. The double-tilde-only deletion tokenizer belongs to that local instance, and BMessage parsing should call that instance's lexer instead of the package-level singleton.

## Token Conversion

Block conversion should be explicit and recursive:

- Convert each top-level Marked token into one or more `BlockNode` values.
- Convert inline-capable token fields such as `paragraph.tokens`, `heading.tokens`, table cell tokens, and text token children with a shared `toInlineNodes(tokens, path)` function.
- Preserve nested inline structure for tokens such as `strong`, `em`, `del`, and `link` by assigning their converted children to `children`.
- Convert image tokens to `ImageInlineNode` and assign image indexes after the full tree is built.
- Convert list item token children to nested `BlockNode[]`, preserving ordered/unordered list metadata.
- Convert unknown block or inline tokens to safe text using their `raw` or `text` value.

The conversion layer should be the only place that knows Marked token shapes. Vue components consume only `BlockNode` and `InlineNode`.

## Image Preview

Images should be represented by `ImageInlineNode` with `src`, `alt`, `title`, and a stable image index.

`BMessage` should build a flat image list from the parsed node tree and provide image actions to `InlineNode.vue` through `provide/inject`. Clicking an image calls the existing `useImagePreview().previewImage` API with:

- `images`: all images in the current message.
- `startPosition`: clicked image index.
- `showCarousel`: true when there are multiple images.

The renderer should no longer query DOM with `querySelectorAll('img[src]')`.

## Link Navigation

Links should be represented by `LinkInlineNode` with `href`, `title`, and inline children.

`InlineNode.vue` should render links as anchors and route clicks through an injected navigation action. The action should preserve the existing `useNavigate().onLink` behavior, including default-prevention and file/webview routing, while avoiding whole-container click delegation.

## Render Context

`BMessage` should provide a render context so recursive node components do not pass actions through every nested level.

```ts
export interface MessageNodeRenderContext {
  images: ImagePreviewItem[];
  previewImageAt(index: number): Promise<void>;
  navigateLink(event: MouseEvent): void;
}
```

`InlineNode.vue` injects this context for image and link actions. `BlockNode.vue` only forwards node data and does not need to know about image preview internals.

## Future Component Blocks

`ComponentBlockNode` is the extension point for non-Markdown message content.

Examples:

- Tool call status
- File reference card
- Generated chart
- Citation group
- Thinking or reasoning section

The renderer should support a conservative placeholder for unknown component names. Real component block mappings can be added when those message formats exist.

## Styling

The existing `.markdown-base()` style mixin should continue to apply to the Markdown render root so the visual result stays close to the current component.

Node components should render semantic HTML tags where possible:

- `p` for paragraph
- `h1` through `h6` for headings
- `ul`, `ol`, and `li` for lists
- `blockquote` for quote blocks
- `pre > code` for code blocks
- `table`, `thead`, `tbody`, `tr`, `th`, and `td` for tables

Existing image cursor and user-drag styles should move to class selectors that still apply to rendered image nodes.

## Testing

Add parser unit tests for:

- Paragraph and inline formatting conversion.
- Headings, lists, blockquotes, code blocks, tables, and horizontal rules.
- Images and links.
- Raw HTML being textified or ignored.
- Plain text mode preserving whitespace without Markdown interpretation.
- Loading cursor placement for empty content, normal inline content, and non-inline tail blocks.
- Local Marked deletion tokenizer behavior without relying on the package-level singleton.

Add component tests for:

- Markdown content rendering without `v-html`.
- Text content rendering through the same node component path.
- Image preview opening with the correct image list and start position.
- Link clicks routing through the existing navigation hook.
- Streaming update preserving completed block keys while changing only the tail block.

## Migration Notes

Current callers should not need prop changes. The legacy `status="streaming"` attribute in `src/components/BEditor/shared/SelectionAIInput.vue` is not part of `BMessageProps`; this refactor should either leave it as a harmless inherited attribute or remove it in the same implementation if type checks expose it.

The existing Marked tokenizer override for deletion should be retained so single `~` characters are not treated as deletion delimiters.
