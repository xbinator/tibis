# BMessage Math Mermaid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KaTeX math rendering and Mermaid diagram previews to BMessage Markdown output.

**Architecture:** Extend the existing BMessage AST with dedicated math nodes and render them through small Vue components. Treat Mermaid as a specialized `CodeBlockNode` rendering mode while keeping code copy support and safe fallback behavior.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, marked tokenizer extensions, KaTeX, Mermaid, Vitest, Vue Test Utils, Less.

---

## File Structure

- Modify: `src/components/BMessage/types.ts`
  - Add `MathBlockNode` and `MathInlineNode`.
- Modify: `src/components/BMessage/parser.ts`
  - Tokenize `$...$` and `$$...$$`, excluding code spans and fenced code.
- Create: `src/components/BMessage/components/MathNode.vue`
  - Render inline math with KaTeX.
- Create: `src/components/BMessage/components/MathBlockNode.vue`
  - Render block math with KaTeX display mode.
- Modify: `src/components/BMessage/components/InlineNode.vue`
  - Delegate inline math rendering.
- Modify: `src/components/BMessage/components/BlockNode.vue`
  - Delegate block math rendering.
- Modify: `src/components/BMessage/components/CodeBlockNode.vue`
  - Render Mermaid previews for `mermaid` code fences.
- Modify: `test/components/BMessage/parser.test.ts`
  - Add math AST tests.
- Modify: `test/components/BMessage/node-renderer.test.ts`
  - Add math and Mermaid rendering tests.
- Modify: `changelog/2026-06-17.md`
  - Record math and Mermaid support.

## Task 1: Parser Tests And Math AST

- [ ] Add failing parser tests for inline `$E=mc^2$` and block `$$\na^2+b^2=c^2\n$$`.
- [ ] Add math node types in `types.ts`.
- [ ] Add marked tokenizer extensions and conversion logic in `parser.ts`.
- [ ] Run `pnpm test test/components/BMessage/parser.test.ts` and make it pass.

## Task 2: KaTeX Rendering

- [ ] Add failing renderer tests for inline and block math.
- [ ] Create `MathNode.vue` and `MathBlockNode.vue`.
- [ ] Wire math nodes into `InlineNode.vue` and `BlockNode.vue`.
- [ ] Run `pnpm test test/components/BMessage/node-renderer.test.ts` and make it pass.

## Task 3: Mermaid Preview

- [ ] Add failing renderer tests that mock Mermaid dynamic import and verify a `mermaid` fence renders a preview container.
- [ ] Extend `CodeBlockNode.vue` with Mermaid lazy initialization, render race protection, error state, and raw-source copy retention.
- [ ] Add BMessage Mermaid styles that do not alter non-Mermaid code blocks.
- [ ] Run `pnpm test test/components/BMessage/node-renderer.test.ts` and make it pass.

## Task 4: Changelog And Verification

- [ ] Add changelog entries for math and Mermaid.
- [ ] Run:

```bash
pnpm test test/components/BMessage/markdown-style.test.ts test/components/BMessage/node-renderer.test.ts test/components/BMessage/parser.test.ts test/components/BMessage/image-viewer.test.ts
pnpm exec tsc --noEmit
pnpm exec stylelint 'src/components/BMessage/**/*.vue' src/assets/styles/markdown.less
pnpm exec eslint src/components/BMessage test/components/BMessage --ext .vue,.ts
```

Expected: all commands pass.

## Commit Policy

Do not create intermediate commits. Keep all changes in the working tree until the user asks for the final unified commit.
