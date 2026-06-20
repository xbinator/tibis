/**
 * @file source-line-selection.test.ts
 * @description Source 编辑器按行定位高亮测试。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import PaneSourceEditor from '@/components/BEditor/panes/PaneSourceEditor.vue';

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
