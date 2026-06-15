# BMessage BlockNode Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `BMessage` as a `BlockNode` / `InlineNode` renderer that avoids whole-message `v-html`, improves streaming repaint behavior, and keeps future component blocks possible.

**Architecture:** `BMessage` will parse `content` into project-owned node types, render top-level blocks with `BlockNode.vue`, and render inline children recursively with `InlineNode.vue`. Parser logic owns a local Marked instance, stable node ids, cursor placement, image collection, and safe raw HTML handling.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Marked lexer, Vitest, Vue Test Utils, Less.

---

## File Structure

- Create `src/components/BMessage/parser.ts`: local Marked setup and `parseMessageNodes`.
- Modify `src/components/BMessage/types.ts`: public props plus `BlockNode`, `InlineNode`, render context, and parser result types.
- Create `src/components/BMessage/utils.ts`: stable hash and node traversal helpers.
- Create `src/components/BMessage/components/BlockNode.vue`: block-level renderer.
- Create `src/components/BMessage/components/InlineNode.vue`: recursive inline renderer.
- Modify `src/components/BMessage/index.vue`: render parsed nodes, provide render context, keep rAF scheduling.
- Modify `test/components/BMessage/image-viewer.test.ts`: update expectations for node rendering.
- Create `test/components/BMessage/parser.test.ts`: parser-focused TDD coverage.
- Create `test/components/BMessage/node-renderer.test.ts`: component-focused rendering and streaming coverage.
- Modify or create `changelog/2026-06-15.md`: record the refactor.

## Task 1: Parser Node Model

**Files:**
- Modify: `src/components/BMessage/types.ts`
- Create: `src/components/BMessage/parser.ts`
- Create: `src/components/BMessage/utils.ts`
- Test: `test/components/BMessage/parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `test/components/BMessage/parser.test.ts` with tests that import `parseMessageNodes` and assert paragraph, inline formatting, raw HTML textification, image collection, text mode, and streaming tail ids.

Run: `pnpm test test/components/BMessage/parser.test.ts`
Expected: FAIL because `src/components/BMessage/parser.ts` does not exist.

- [ ] **Step 2: Implement node types**

Update `src/components/BMessage/types.ts` with file header comments, `BMessageProps`, `BlockNode`, `InlineNode`, `MessageNodeRenderContext`, `ParseMessageNodesOptions`, and `ParseMessageNodesResult`.

- [ ] **Step 3: Implement parser utilities**

Create `src/components/BMessage/utils.ts` with a documented stable hash helper and image traversal helpers.

- [ ] **Step 4: Implement parser**

Create `src/components/BMessage/parser.ts` with a local `Marked` instance, double-tilde deletion tokenizer, recursive block conversion, recursive inline conversion, text mode conversion, cursor insertion, stable tail ids, and image index assignment.

- [ ] **Step 5: Run parser tests**

Run: `pnpm test test/components/BMessage/parser.test.ts`
Expected: PASS.

## Task 2: Node Render Components

**Files:**
- Create: `src/components/BMessage/components/InlineNode.vue`
- Create: `src/components/BMessage/components/BlockNode.vue`
- Test: `test/components/BMessage/node-renderer.test.ts`

- [ ] **Step 1: Write failing node renderer tests**

Create `test/components/BMessage/node-renderer.test.ts` with tests mounting `BMessage` and asserting Markdown renders as semantic Vue-rendered nodes, no rendered HTML string is injected into the Markdown container, raw HTML appears as text, text mode preserves whitespace, and link/image actions still work.

Run: `pnpm test test/components/BMessage/node-renderer.test.ts`
Expected: FAIL because node renderer components do not exist or `BMessage` still uses `v-html`.

- [ ] **Step 2: Implement `InlineNode.vue`**

Render inline node variants: text, strong, em, del, code, link, image, break, and cursor. Inject `MessageNodeRenderContext` for image preview and link navigation.

- [ ] **Step 3: Implement `BlockNode.vue`**

Render block variants: paragraph, heading, list, blockquote, code, table, hr, component placeholder, and cursor. Use `InlineNode.vue` for inline children and recursive `BlockNode.vue` for nested blocks.

- [ ] **Step 4: Run node renderer tests**

Run: `pnpm test test/components/BMessage/node-renderer.test.ts`
Expected: PASS after `BMessage` is wired in Task 3.

## Task 3: BMessage Integration

**Files:**
- Modify: `src/components/BMessage/index.vue`
- Modify: `test/components/BMessage/image-viewer.test.ts`
- Test: `test/components/BMessage/image-viewer.test.ts`
- Test: `test/components/BMessage/node-renderer.test.ts`

- [ ] **Step 1: Write or update failing integration tests**

Update image preview tests to assert image preview works without DOM collection. Ensure the test still clicks rendered images and checks `previewImage` arguments.

Run: `pnpm test test/components/BMessage/image-viewer.test.ts test/components/BMessage/node-renderer.test.ts`
Expected: FAIL until `BMessage` uses node rendering.

- [ ] **Step 2: Replace `renderedMarkdown` with parsed nodes**

Update `src/components/BMessage/index.vue` so Markdown and text modes both render `BlockNode` components. Keep rAF scheduling and `height` / `maxHeight` styles.

- [ ] **Step 3: Provide render context**

Use `useImagePreview` and `useNavigate` in `BMessage` to provide `previewImageAt` and `navigateLink` actions. Remove DOM image querying and whole-container link click delegation.

- [ ] **Step 4: Run BMessage tests**

Run: `pnpm test test/components/BMessage/parser.test.ts test/components/BMessage/image-viewer.test.ts test/components/BMessage/node-renderer.test.ts`
Expected: PASS.

## Task 4: Changelog and Verification

**Files:**
- Modify or create: `changelog/2026-06-15.md`
- Verify: TypeScript, targeted tests, lint/style where relevant.

- [ ] **Step 1: Add changelog entry**

Record the BMessage renderer refactor under `Changed`.

- [ ] **Step 2: Run targeted tests**

Run: `pnpm test test/components/BMessage/parser.test.ts test/components/BMessage/image-viewer.test.ts test/components/BMessage/node-renderer.test.ts`
Expected: PASS.

- [ ] **Step 3: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run lint checks**

Run: `pnpm exec eslint src/components/BMessage test/components/BMessage --ext .vue,.ts`
Expected: PASS.

Run: `pnpm exec stylelint 'src/components/BMessage/**/*.{vue,less,css}'`
Expected: PASS.

## Self-Review

- Spec coverage: parser, node types, no `v-html`, streaming ids, local Marked instance, render context, image preview, link navigation, text mode, tests, and changelog are covered.
- Placeholder scan: no `TBD` or open implementation placeholders are intentionally left.
- Type consistency: plan uses `BlockNode`, `InlineNode`, `MessageNodeRenderContext`, `parseMessageNodes`, and `ParseMessageNodesResult` consistently.
