/**
 * @file paneRichEditor.selectLineRange.test.ts
 * @description PaneRichEditor 行范围选区能力测试。
 * @vitest-environment jsdom
 */

import type { ComponentPublicInstance } from 'vue';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PaneRichEditor from '@/components/BEditor/components/PaneRichEditor.vue';

const { setAISelectionHighlightMock } = vi.hoisted(() => ({
  setAISelectionHighlightMock: vi.fn()
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

vi.mock('@/components/BEditor/extensions/aiRangeHighlight', async () => {
  const actual = await vi.importActual<typeof import('@/components/BEditor/extensions/aiRangeHighlight')>('@/components/BEditor/extensions/aiRangeHighlight');
  return {
    ...actual,
    setAISelectionHighlight: setAISelectionHighlightMock
  };
});

vi.mock('@/components/BEditor/hooks/useSelectionAssistant', () => ({
  useSelectionAssistant: () => ({
    toolbarVisible: ref(false),
    toolbarPosition: ref(null),
    aiInputVisible: ref(false),
    cachedSelectionRange: ref(null),
    panelPosition: ref(null),
    openAIInput: vi.fn(),
    closeAIInput: vi.fn(),
    applyAIResult: vi.fn(async () => undefined),
    setStreaming: vi.fn(),
    insertReference: vi.fn(),
    recomputeAllPositions: vi.fn()
  })
}));

/**
 * 富文本面板公开的最小实例接口。
 */
interface PaneRichEditorVm extends ComponentPublicInstance {
  /** 按源码行号选中范围。 */
  selectLineRange: (startLine: number, endLine: number) => Promise<boolean>;
  /** 读取当前选区。 */
  getSelection: () => { text: string } | null;
}

/**
 * 等待编辑器挂载与异步副作用稳定。
 */
async function flushEditorWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * 挂载富文本编辑器面板。
 * @param value - 初始 Markdown 内容
 * @returns 挂载后的组件包装器
 */
function mountPaneRichEditor(value: string): VueWrapper<PaneRichEditorVm> {
  return mount(PaneRichEditor, {
    attachTo: document.body,
    props: {
      value,
      outlineContent: '',
      editable: true,
      editorState: {
        id: 'rich-select-range',
        name: 'rich-select-range.md',
        content: value,
        ext: 'md',
        path: null
      }
    },
    global: {
      plugins: [createPinia()],
      stubs: {
        CurrentBlockMenu: true,
        FrontMatterCard: true,
        SelectionAIInput: true,
        SelectionToolbarRich: true
      }
    }
  }) as VueWrapper<PaneRichEditorVm>;
}

describe('PaneRichEditor selectLineRange', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setAISelectionHighlightMock.mockReset();
  });

  test('applies text selection and AI highlight for source lines', async () => {
    const wrapper = mountPaneRichEditor('# Title\n\nParagraph line 1\nParagraph line 2\n');

    await flushEditorWork();
    await expect(wrapper.vm.selectLineRange(3, 4)).resolves.toBe(true);

    expect(wrapper.vm.getSelection()).toMatchObject({
      text: 'Paragraph line 1\nParagraph line 2'
    });
    expect(setAISelectionHighlightMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
