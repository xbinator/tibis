/**
 * @file code-block.component.test.ts
 * @description BEditor 代码块 NodeView 交互测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file -- 测试文件内定义轻量组件替身。 */
import { defineComponent, nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CodeBlock from '@/components/BEditor/components/CodeBlock.vue';

const copyTextMock = vi.hoisted(() => vi.fn());
const copyImageMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const messageErrorMock = vi.hoisted(() => vi.fn());
const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn().mockResolvedValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" data-testid="mermaid-svg"><rect width="120" height="80" /></svg>'
  })
}));

vi.mock('@vueuse/core', () => ({
  useDebounceFn: (callback: () => Promise<void>) => callback
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: copyTextMock,
    copyImage: copyImageMock
  })
}));

vi.mock('ant-design-vue', () => ({
  message: {
    error: messageErrorMock,
    success: vi.fn()
  }
}));

vi.mock('mermaid', () => ({
  default: mermaidMock
}));

/**
 * 测试用代码块节点。
 */
interface TestCodeBlockNode {
  /** 节点属性 */
  attrs: {
    /** 代码语言 */
    language: string;
  };
  /** 代码文本内容 */
  textContent: string;
}

/**
 * 代码块挂载结果。
 */
interface CodeBlockMountResult {
  /** Vue Test Utils 包装器 */
  wrapper: VueWrapper;
  /** 属性更新函数 */
  updateAttributes: ReturnType<typeof vi.fn>;
}

/**
 * 等待一帧 rAF 渲染。
 */
async function waitAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  await nextTick();
}

/**
 * 等待 Mermaid SVG 写入预览容器。
 * @param wrapper - 代码块包装器
 */
async function waitForMermaidSvg(wrapper: VueWrapper, remainingChecks = 6): Promise<void> {
  if (remainingChecks <= 0) return;

  await flushPromises();
  await waitAnimationFrame();

  if (wrapper.find('[data-testid="mermaid-svg"]').exists()) return;

  await waitForMermaidSvg(wrapper, remainingChecks - 1);
}

/**
 * 创建测试用代码块节点。
 * @param language - 代码块语言
 * @param textContent - 代码内容
 * @returns 测试节点
 */
function createCodeBlockNode(language: string, textContent: string): TestCodeBlockNode {
  return {
    attrs: { language },
    textContent
  };
}

/**
 * 挂载代码块 NodeView。
 * @param node - 测试代码块节点
 * @returns 挂载结果
 */
function mountCodeBlock(node: TestCodeBlockNode): CodeBlockMountResult {
  const updateAttributes = vi.fn();
  const wrapper = mount(CodeBlock, {
    props: {
      node,
      updateAttributes,
      editor: {},
      decorations: [],
      selected: false,
      extension: {},
      getPos: () => 0,
      deleteNode: vi.fn(),
      view: {},
      innerDecorations: {},
      HTMLAttributes: {}
    },
    global: {
      stubs: {
        BIcon: true,
        BJsonViewer: true,
        BSelect: true,
        BSuspense: defineComponent({
          name: 'BSuspense',
          props: {
            active: {
              type: Boolean,
              default: false
            }
          },
          template: '<div v-if="active"><slot /></div>'
        }),
        NodeViewContent: defineComponent({
          name: 'NodeViewContent',
          props: {
            as: {
              type: String,
              default: 'div'
            }
          },
          template: '<component :is="as"><slot /></component>'
        }),
        NodeViewWrapper: defineComponent({
          name: 'NodeViewWrapper',
          template: '<div><slot /></div>'
        })
      }
    }
  });

  return { wrapper, updateAttributes };
}

describe('CodeBlock', (): void => {
  beforeEach((): void => {
    vi.clearAllMocks();
    copyTextMock.mockResolvedValue(true);
    copyImageMock.mockResolvedValue(true);
    mermaidMock.render.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" data-testid="mermaid-svg"><rect width="120" height="80" /></svg>'
    });
  });

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('copies rendered Mermaid preview as an image when preview is visible', async (): Promise<void> => {
    const { wrapper } = mountCodeBlock(createCodeBlockNode('mermaid', 'graph TD\n  A --> B'));

    await waitForMermaidSvg(wrapper);

    expect(wrapper.find('[data-testid="mermaid-svg"]').exists()).toBe(true);

    await wrapper.find('.b-markdown-codeblock__copy').trigger('click');
    await flushPromises();

    expect(messageErrorMock).not.toHaveBeenCalled();
    expect(copyImageMock).toHaveBeenCalledWith(wrapper.find('[data-testid="mermaid-svg"]').element, {
      successMessage: '复制成功',
      errorMessage: '复制图片失败'
    });
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it('keeps copying source text when no rendered preview image is visible', async (): Promise<void> => {
    const { wrapper } = mountCodeBlock(createCodeBlockNode('typescript', 'const value = 1;'));

    await wrapper.find('.b-markdown-codeblock__copy').trigger('click');
    await flushPromises();

    expect(copyTextMock).toHaveBeenCalledWith('const value = 1;', {
      successMessage: '复制成功',
      trim: false
    });
    expect(copyImageMock).not.toHaveBeenCalled();
  });
});
