# BMessage Code Highlight Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add syntax highlighting and copy support for fenced Markdown code blocks rendered by `src/components/BMessage`.

**Architecture:** Keep the existing safe AST parser unchanged. Add a dedicated `CodeBlockNode.vue` renderer that consumes existing `CodeBlockNode` data, renders lowlight output as Vue nodes, and owns the copy action.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, lowlight, Vitest, Vue Test Utils, Less.

---

## File Structure

- Create: `src/components/BMessage/components/CodeBlockNode.vue`
  - Renders block code, language label, copy button, and lowlight token tree.
- Modify: `src/components/BMessage/components/BlockNode.vue`
  - Delegates `node.type === 'code'` to `CodeBlockNode.vue`.
- Modify: `test/components/BMessage/node-renderer.test.ts`
  - Covers highlight output, fallback output, copy action, and inline-code non-goal.
- Modify: `changelog/2026-06-17.md`
  - Records the feature change.
- Keep unchanged: `src/components/BMessage/parser.ts`
  - Existing `lang` and `text` fields already provide the needed data.

## Task 1: Add Failing Renderer Tests

**Files:**
- Modify: `test/components/BMessage/node-renderer.test.ts`

- [ ] **Step 1: Mock clipboard in the renderer test**

Add a `clipboardMock` hoisted mock and include it in the existing `useClipboard` mock:

```ts
const clipboardMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: clipboardMock
  })
}));
```

- [ ] **Step 2: Add tests for code block highlighting and copy**

Add tests that mount `BMessage` with fenced code:

```ts
it('renders fenced code blocks with syntax highlight classes', async (): Promise<void> => {
  const wrapper = mount(BMessage, {
    props: {
      type: 'markdown',
      content: '```ts\nconst answer: number = 42\n```'
    }
  });

  await nextTick();

  expect(wrapper.find('.b-message__code-block').exists()).toBe(true);
  expect(wrapper.find('.b-message__code-language').text()).toBe('ts');
  expect(wrapper.find('.hljs-keyword').exists()).toBe(true);
  expect(wrapper.find('code').text()).toContain('const answer');
});

it('falls back to plain text for unknown code block languages', async (): Promise<void> => {
  const wrapper = mount(BMessage, {
    props: {
      type: 'markdown',
      content: '```madeup\nplain text\n```'
    }
  });

  await nextTick();

  expect(wrapper.find('.b-message__code-language').text()).toBe('madeup');
  expect(wrapper.find('.hljs-keyword').exists()).toBe(false);
  expect(wrapper.find('code').text()).toBe('plain text');
});

it('copies fenced code block text without rendered labels', async (): Promise<void> => {
  clipboardMock.mockResolvedValue(true);

  const wrapper = mount(BMessage, {
    props: {
      type: 'markdown',
      content: '```js\nconsole.log(\"copy me\")\n```'
    }
  });

  await nextTick();
  await wrapper.find('button[aria-label="复制代码"]').trigger('click');

  expect(clipboardMock).toHaveBeenCalledWith('console.log("copy me")', {
    successMessage: '代码已复制',
    trim: false
  });
});

it('keeps inline code without a copy control', async (): Promise<void> => {
  const wrapper = mount(BMessage, {
    props: {
      type: 'markdown',
      content: 'Inline `const value = 1` only.'
    }
  });

  await nextTick();

  expect(wrapper.find('p code').text()).toBe('const value = 1');
  expect(wrapper.find('button[aria-label="复制代码"]').exists()).toBe(false);
});
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
pnpm test test/components/BMessage/node-renderer.test.ts
```

Expected: failures because `.b-message__code-block` and `button[aria-label="复制代码"]` do not exist yet.

## Task 2: Implement CodeBlockNode

**Files:**
- Create: `src/components/BMessage/components/CodeBlockNode.vue`
- Modify: `src/components/BMessage/components/BlockNode.vue`

- [ ] **Step 1: Create the dedicated renderer**

Implement `CodeBlockNode.vue` with:

```ts
import type { CodeBlockNode } from '../types';
import { common, createLowlight } from 'lowlight';
import { computed } from 'vue';
import { useClipboard } from '@/hooks/useClipboard';
import { createNamespace } from '@/utils/namespace';
```

Use a local lowlight instance, normalize aliases such as `ts -> typescript`, recursively render lowlight text and element nodes through Vue templates, and call `clipboard(props.node.text, { successMessage: '代码已复制', trim: false })`.

- [ ] **Step 2: Delegate block rendering**

Replace the inline code block branch in `BlockNode.vue`:

```vue
<CodeBlockNode v-else-if="node.type === 'code'" :node="node" />
```

Import the new component.

- [ ] **Step 3: Run the focused tests and verify they pass**

Run:

```bash
pnpm test test/components/BMessage/node-renderer.test.ts
```

Expected: all renderer tests pass.

## Task 3: Polish Styles And Changelog

**Files:**
- Modify: `src/components/BMessage/components/CodeBlockNode.vue`
- Modify: `changelog/2026-06-17.md`

- [ ] **Step 1: Add scoped code block styles**

Use full class selectors such as `.b-message__code-block`, `.b-message__code-header`, `.b-message__code-copy`, and `.b-message__code-content`. Import `@/assets/styles/markdown.less` and apply `.code-highlight()` within the code block.

- [ ] **Step 2: Update changelog**

Add under `## Added`:

```md
- BMessage Markdown 代码块支持语法高亮与一键复制。
```

- [ ] **Step 3: Run checks**

Run:

```bash
pnpm test test/components/BMessage/node-renderer.test.ts test/components/BMessage/parser.test.ts test/components/BMessage/image-viewer.test.ts
pnpm exec tsc --noEmit
pnpm exec stylelint 'src/components/BMessage/**/*.vue'
pnpm exec eslint src/components/BMessage test/components/BMessage/node-renderer.test.ts --ext .vue,.ts
```

Expected: all commands pass.

## Commit Policy

Do not create intermediate commits. Keep all changes in the working tree until the feature is complete and the user asks for the final unified commit.
