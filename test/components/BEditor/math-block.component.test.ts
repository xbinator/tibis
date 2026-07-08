/**
 * @file math-block.component.test.ts
 * @description BEditor 块级数学公式 NodeView 交互测试。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { EditorContent, useEditor, type Editor } from '@tiptap/vue-3';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
 * hoisted 容器：vi.mock 工厂在 import 解析前执行，无法直接 import Vue 的 `ref`。
 * 所以这里只放 holder，真正的 Vue ref 在 `beforeEach` 里再注入。
 */
const capturedRefs = vi.hoisted(() => ({
  /** 模拟 useTextareaAutosize 返回的 textarea ref（在 beforeEach 中注入）。 */
  textarea: { current: null as Ref<HTMLTextAreaElement | null> | null },
  /** 模拟 useTextareaAutosize 返回的 input ref 兜底。 */
  input: { current: null as Ref<string> | null },
  /** 模拟 useTextareaAutosize 返回的 triggerResize 函数。 */
  triggerResize: { current: null as Mock | null },
  /** 捕获组件调用 useTextareaAutosize 时传入的 input ref，用于校验 v-model 链路。 */
  inputFromComponent: { ref: null as Ref<string> | null }
}));

/**
 * 替换 useTextareaAutosize：把返回的引用暴露给测试用例，
 * 用于校验 MathBlock 是否将真实的 `<textarea>` 节点交给了 composable。
 */
vi.mock('@vueuse/core', () => ({
  useTextareaAutosize: vi.fn(
    (options?: {
      input?: Ref<string>;
    }): {
      textarea: Ref<HTMLTextAreaElement | null> | null;
      input: Ref<string> | null;
      triggerResize: (() => void) | null;
    } => {
      if (options?.input) {
        capturedRefs.inputFromComponent.ref = options.input;
      }

      return {
        textarea: capturedRefs.textarea.current,
        input: options?.input ?? capturedRefs.input.current,
        triggerResize: capturedRefs.triggerResize.current
      };
    }
  )
}));

/** 原始 document.elementFromPoint 实现。 */
let originalElementFromPoint: typeof document.elementFromPoint | undefined;

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
  beforeEach((): void => {
    originalElementFromPoint = document.elementFromPoint;
    if (!document.elementFromPoint) {
      document.elementFromPoint = (): Element | null => document.body;
    }
    // 注入真正的 Vue ref，让模板 `ref="textarea"` / `v-model="input"` 能正确写入
    capturedRefs.textarea.current = ref<HTMLTextAreaElement | null>(null);
    capturedRefs.input.current = ref<string>('');
    capturedRefs.triggerResize.current = vi.fn();
    capturedRefs.inputFromComponent.ref = null;
  });

  afterEach((): void => {
    if (originalElementFromPoint) {
      document.elementFromPoint = originalElementFromPoint;
    } else {
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
  });

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

  /**
   * 验证修复点：useTextareaAutosize 的 textarea 引用必须指向模板里可见的
   * `<textarea>` DOM 节点，否则 composable 会自己创建一个隐藏节点去做高度计算，
   * 导致输入框不会跟随内容撑开。
   */
  it('binds useTextareaAutosize ref to the visible textarea so it auto-resizes with content', async (): Promise<void> => {
    const { wrapper } = mountMathBlock('x');

    await wrapper.find('.b-markdown-mathblock__control-btn').trigger('click');
    const textarea = wrapper.find('textarea').element as HTMLTextAreaElement;

    // composable 的 textarea ref 必须指向用户实际看到的那个节点
    expect(capturedRefs.textarea.current?.value).toBe(textarea);

    wrapper.unmount();
  });

  /**
   * 验证 v-model 绑定到了 useTextareaAutosize 返回的 input ref，
   * 这样在输入变化时 composable 才能监听到并自动 triggerResize。
   */
  it('binds v-model to the autosize input ref so content changes trigger resize', async (): Promise<void> => {
    const { wrapper } = mountMathBlock('x');

    await wrapper.find('.b-markdown-mathblock__control-btn').trigger('click');
    const textarea = wrapper.find('textarea');

    await textarea.setValue('y = mx + b');

    // v-model 应将 textarea 的值同步到 composable 的 input ref（即组件传入的 draftLatex）
    expect(capturedRefs.inputFromComponent.ref?.value).toBe('y = mx + b');
    // 显式调用 triggerResize 也应该被命中
    expect(capturedRefs.triggerResize.current).toHaveBeenCalled();

    wrapper.unmount();
  });
});
