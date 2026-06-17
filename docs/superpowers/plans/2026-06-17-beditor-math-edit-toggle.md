# BEditor Math Edit Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mermaid-style preview/edit switching for block math formulas in BEditor Rich mode.

**Architecture:** Keep Tiptap mathematics parsing and Markdown serialization intact, but replace the runtime `blockMath` NodeView with a Vue component. The component owns presentation, uses VueUse `useTextareaAutosize` for edit height, and calls `updateAttributes({ latex })` when the user edits LaTeX.

**Tech Stack:** Vue 3, Tiptap Vue NodeView, `@tiptap/extension-mathematics`, KaTeX, Vitest, Vue Test Utils.

---

### Task 1: Component Tests

**Files:**
- Create: `test/components/BEditor/math-block.component.test.ts`
- Target: `src/components/BEditor/components/MathBlock.vue`

- [ ] **Step 1: Write failing component tests**

```ts
/**
 * @file math-block.component.test.ts
 * @description BEditor 块级数学公式 NodeView 交互测试。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { EditorContent, useEditor, type Editor } from '@tiptap/vue-3';
import { describe, expect, it, vi } from 'vitest';
import MathBlock from '@/components/BEditor/components/MathBlock.vue';
import { useExtensions } from '@/components/BEditor/hooks/useExtensions';

function mountMathBlock(latex = 'a^2+b^2=c^2') {
  const updateAttributes = vi.fn();
  const wrapper = mount(MathBlock, {
    props: {
      node: { attrs: { latex } },
      updateAttributes
    }
  });
  return { wrapper, updateAttributes };
}

describe('MathBlock', (): void => {
  it('renders KaTeX preview by default', (): void => {
    const { wrapper } = mountMathBlock();
    expect(wrapper.find('.b-markdown-mathblock__preview .katex-display').exists()).toBe(true);
    expect(wrapper.find('.b-markdown-mathblock__control-btn.is-active').exists()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('switches to edit mode and updates latex attributes from textarea input', async (): Promise<void> => {
    const { wrapper, updateAttributes } = mountMathBlock('x');
    await wrapper.find('.b-markdown-mathblock__control-btn').trigger('click');
    const textarea = wrapper.find('textarea');
    await textarea.setValue('y = mx + b');
    expect(updateAttributes).toHaveBeenCalledWith({ latex: 'y = mx + b' });
    expect(wrapper.find('.b-markdown-mathblock__control-btn.is-active').exists()).toBe(false);
  });

  it('updates rich editor Markdown when editing a block math node view', async (): Promise<void> => {
    const wrapper = mount(
      defineComponent({
        name: 'MathBlockEditorHarness',
        components: { EditorContent },
        setup() {
          const editorInstanceId = ref('math-block-editor-test');
          const { editorExtensions } = useExtensions(editorInstanceId);
          const editor = useEditor({
            content: '$$\nx\n$$',
            contentType: 'markdown',
            extensions: editorExtensions
          });

          return { editor };
        },
        template: '<EditorContent :editor="editor ?? undefined" />'
      }),
      {
        global: {
          stubs: {
            BIcon: true
          }
        }
      }
    );

    await nextTick();
    await nextTick();

    await wrapper.find('.b-markdown-mathblock__control-btn').trigger('click');
    await wrapper.find('textarea').setValue('y = mx + b');
    await nextTick();

    const editor = wrapper.vm.editor as Editor | undefined;

    expect(editor?.getMarkdown()).toContain('y = mx + b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/components/BEditor/math-block.component.test.ts`
Expected: FAIL because `MathBlock.vue` does not exist.

### Task 2: MathBlock NodeView Component

**Files:**
- Create: `src/components/BEditor/components/MathBlock.vue`
- Test: `test/components/BEditor/math-block.component.test.ts`

- [ ] **Step 1: Implement `MathBlock.vue`**

Create a Vue NodeView component with a header, CodeBlock-style `control-btn` preview/edit button, KaTeX preview, textarea edit mode, VueUse `useTextareaAutosize`, `resize: none`, and `updateAttributes({ latex })` on input.

- [ ] **Step 2: Run component test**

Run: `pnpm test test/components/BEditor/math-block.component.test.ts`
Expected: PASS.

### Task 3: Runtime Extension Wiring

**Files:**
- Modify: `src/components/BEditor/hooks/useExtensions.ts`
- Test: `test/components/BEditor/rich-markdown-parser.test.ts`

- [ ] **Step 1: Write/extend parser test**

Add an assertion that Rich Markdown parsing keeps block math as `{ type: 'blockMath', attrs: { latex } }`.

- [ ] **Step 2: Verify parser test before wiring**

Run: `pnpm test test/components/BEditor/rich-markdown-parser.test.ts`
Expected: PASS for existing parser behavior.

- [ ] **Step 3: Wire custom runtime BlockMath**

Import `BlockMath` and `InlineMath`, create `RuntimeBlockMath = BlockMath.extend({ addNodeView: () => VueNodeViewRenderer(MathBlockView) })`, and use `RuntimeBlockMath` + `InlineMath` in runtime extensions. Keep schema-only parser extensions safe from Vue NodeView dependency.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test test/components/BEditor/math-block.component.test.ts test/components/BEditor/rich-markdown-parser.test.ts`
Expected: PASS.

### Task 4: Changelog and Verification

**Files:**
- Modify: `changelog/2026-06-17.md`

- [ ] **Step 1: Add changelog entry**

Add a `Changed` entry: `BEditor Rich 模式块级数学公式支持预览 / 编辑切换。`

- [ ] **Step 2: Run verification**

Run:
`pnpm test test/components/BEditor/math-block.component.test.ts test/components/BEditor/rich-markdown-parser.test.ts test/components/BMessage/markdown-style.test.ts test/components/BMessage/node-renderer.test.ts test/components/BMessage/parser.test.ts test/components/BMessage/image-viewer.test.ts`

Run:
`pnpm exec tsc --noEmit`

Run:
`pnpm exec eslint src/components/BEditor/hooks/useExtensions.ts src/components/BEditor/components/MathBlock.vue test/components/BEditor/math-block.component.test.ts test/components/BEditor/rich-markdown-parser.test.ts src/components/BMessage test/components/BMessage --ext .vue,.ts`

Run:
`pnpm exec stylelint 'src/components/BEditor/**/*.vue' 'src/components/BMessage/**/*.vue' src/assets/styles/markdown.less`

Expected: all commands exit 0.

- [ ] **Step 3: Do not commit**

Leave all changes uncommitted for final unified commit.
