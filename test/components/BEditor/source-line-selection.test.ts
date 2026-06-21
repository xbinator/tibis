/**
 * @file source-line-selection.test.ts
 * @description Source 编辑器按行定位高亮测试。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PaneSourceEditor from '@/components/BEditor/panes/PaneSourceEditor.vue';

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    agent: {
      /**
       * 测试桩实现，不会被本测试调用。
       * @returns 空结果
       */
      invoke: async (): AsyncResult<unknown, { message: string }> => [undefined, { text: '' }]
    }
  })
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: () => ({
    getAvailableServiceConfig: async (): Promise<null> => null
  })
}));

/**
 * Source 编辑器组件公开实例。
 */
interface PaneSourceEditorExpose {
  /** 按源码行号选中并高亮。 */
  selectLineRange: (startLine: number, endLine: number) => boolean;
}

let wrapper: VueWrapper | null = null;

/**
 * 挂载 Source 编辑器。
 * @param content - 初始 Markdown 源码
 * @returns Source 编辑器公开实例
 */
async function mountSourceEditor(content: string): Promise<PaneSourceEditorExpose> {
  wrapper = mount(PaneSourceEditor, {
    attachTo: document.body,
    props: {
      value: content,
      editorState: {
        content,
        name: 'note',
        path: null,
        id: 'note-1',
        ext: 'md'
      }
    }
  });

  await nextTick();

  return wrapper.vm as unknown as PaneSourceEditorExpose;
}

describe('PaneSourceEditor selectLineRange', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  afterEach((): void => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders source selection highlight for selected line ranges', async (): Promise<void> => {
    const editor = await mountSourceEditor(['first line', 'second line', 'third line'].join('\n'));

    const selected = editor.selectLineRange(2, 2);
    await nextTick();

    expect(selected).toBe(true);
    expect(document.querySelector('.b-markdown-source__ai-highlight')).not.toBeNull();
  });
});
