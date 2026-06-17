/**
 * @file math-block.component.test.ts
 * @description BEditor 块级数学公式 NodeView 交互测试。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick, ref } from 'vue';
import { EditorContent, useEditor, type Editor } from '@tiptap/vue-3';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi, type Mock } from 'vitest';
import MathBlock from '@/components/BEditor/components/MathBlock.vue';
import { useExtensions } from '@/components/BEditor/hooks/useExtensions';

/**
 * MathBlock 测试挂载结果。
 */
interface MathBlockMountResult {
  /** Vue Test Utils 包装器 */
  wrapper: VueWrapper;
  /** Tiptap NodeView 属性更新函数 */
  updateAttributes: Mock;
}

/**
 * 挂载块级数学公式 NodeView。
 * @param latex - 初始 LaTeX 内容
 * @returns 测试包装器和属性更新 spy
 */
function mountMathBlock(latex = 'a^2+b^2=c^2'): MathBlockMountResult {
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
