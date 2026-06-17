# BMessage Math And Mermaid Design

## Goal

Add KaTeX math rendering and Mermaid diagram preview support to `src/components/BMessage`.

## Scope

- Render inline math written as `$...$`.
- Render block math written as `$$...$$`.
- Render fenced Mermaid code blocks written as ```` ```mermaid ```` as diagrams.
- Keep code copy support for Mermaid source text.
- Preserve the current owned AST rendering path and avoid parsing arbitrary HTML into the DOM.

## Non-Goals

- Do not add a new math or diagram dependency.
- Do not reuse TipTap node-view components from `src/components/BEditor/components/CodeBlock.vue`.
- Do not add Mermaid editing controls, preview toggles, or collapse controls.
- Do not change inline code behavior.

## Architecture

Extend BMessage node types with math inline and math block nodes. Keep Markdown parsing in `parser.ts` and render through focused Vue components.

Mermaid remains a specialized code-block rendering mode inside `CodeBlockNode.vue`: when the normalized language is `mermaid`, show a rendered diagram area beneath the existing code-block header and keep the copy button wired to the raw source.

## Data Flow

1. `parser.ts` tokenizes `$...$` into inline math nodes and `$$...$$` into block math nodes.
2. `InlineNode.vue` delegates inline math to `MathNode.vue`.
3. `BlockNode.vue` delegates block math to `MathBlockNode.vue`.
4. `MathNode.vue` and `MathBlockNode.vue` use `katex.renderToString` with `throwOnError: false`.
5. `CodeBlockNode.vue` detects `mermaid`, initializes Mermaid lazily, and writes the rendered SVG into an internal preview element.

## Error Handling

- Invalid KaTeX input renders as KaTeX error output through `throwOnError: false`.
- Mermaid render failures display a compact error state and leave the copy action available.
- Empty Mermaid blocks show the normal empty code block body.

## Testing

- Parser tests cover inline and block math nodes.
- Renderer tests cover inline math, block math, Mermaid preview container, Mermaid error state, and copy of Mermaid source.
- Existing code block and image tests remain passing.
