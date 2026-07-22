/**
 * @file editor-scrollbar.test.ts
 * @description 验证 BSmartEditor 使用统一滚动条组件承载 CodeMirror 内容。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BScrollbar from '@/components/BScrollbar/index.vue';
import BSmartEditor from '@/components/BSmart/Editor.vue';

/**
 * BScrollbar 测试关注的属性。
 */
interface ScrollbarProps {
  /** 滚动区域最大高度。 */
  maxHeight?: string | number;
  /** 滚动条是否内嵌显示。 */
  inset?: boolean | string;
}

/**
 * 挂载智能编辑器。
 * @returns 编辑器包装器
 */
async function mountEditor(): Promise<VueWrapper> {
  const wrapper = mount(BSmartEditor, {
    props: {
      value: 'line 1\nline 2\nline 3',
      maxHeight: 120
    },
    attachTo: document.body,
    global: {
      components: {
        BScrollbar
      }
    }
  });

  await nextTick();
  return wrapper;
}

describe('BSmartEditor scrollbar', (): void => {
  it('wraps CodeMirror host with BScrollbar and forwards max height', async (): Promise<void> => {
    const wrapper = await mountEditor();
    const scrollbar = wrapper.findComponent(BScrollbar);
    const scrollbarProps = scrollbar.props() as ScrollbarProps;

    expect(scrollbar.exists()).toBe(true);
    expect(scrollbarProps.maxHeight).toBe('120px');
    expect(scrollbarProps.inset).toBe(false);
    expect(scrollbar.find('.b-smart-editor__codemirror').exists()).toBe(true);

    wrapper.unmount();
  });
});
