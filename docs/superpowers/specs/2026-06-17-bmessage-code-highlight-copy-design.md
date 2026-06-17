# BMessage Code Highlight And Copy Design

## Goal

Add syntax highlighting and a copy action for fenced Markdown code blocks rendered by `src/components/BMessage`.

## Scope

- Support fenced Markdown code blocks such as ```` ```ts ````.
- Keep inline code unchanged.
- Reuse the existing `lowlight` dependency and project highlight styles.
- Copy the raw code text without language labels or rendered formatting.
- Preserve the current safe AST rendering model and avoid `v-html`.

## Non-Goals

- Do not add a new highlighting library.
- Do not reuse editor-only TipTap node-view components.
- Do not add copy controls to inline code.
- Do not change Markdown parsing behavior beyond rendering code blocks.

## Architecture

Introduce a dedicated `CodeBlockNode.vue` under `src/components/BMessage/components`.

`BlockNode.vue` continues to dispatch block node rendering. When `node.type === 'code'`, it delegates to `CodeBlockNode.vue` instead of rendering the `<pre><code>` inline.

`CodeBlockNode.vue` owns:

- language display
- lowlight highlighting
- fallback plain-text rendering
- copy button behavior
- code-block-specific styles

## Data Flow

1. `parser.ts` keeps producing `CodeBlockNode` values with `lang` and `text`.
2. `BlockNode.vue` passes the code node to `CodeBlockNode.vue`.
3. `CodeBlockNode.vue` normalizes the language and asks `lowlight` to highlight the code when the language is registered.
4. The rendered output uses Vue nodes, not raw HTML.
5. The copy button calls `useClipboard().clipboard(node.text, { successMessage: '代码已复制', trim: false })`.

## Error Handling

- Unknown or missing languages render as plain text.
- Highlighting exceptions fall back to plain text.
- Empty code blocks still render a code container and the copy action naturally no-ops through `useClipboard`.

## Testing

Add or update BMessage component tests to cover:

- known-language fenced code block renders highlight classes
- unknown-language fenced code block still renders plain text
- copy button copies exactly the original code text
- inline code remains unchanged and does not show a copy control
