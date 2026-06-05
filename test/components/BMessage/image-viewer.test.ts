/**
 * @file image-viewer.test.ts
 * @description BMessage Markdown 图片查看器交互测试。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import BMessage from '@/components/BMessage/index.vue';

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    onLink: vi.fn()
  })
}));

/**
 * 创建图片查看器测试桩，用于读取 BMessage 传入的预览参数。
 * @returns Vue 测试组件
 */
function createImageViewerStub(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'BImageViewer',
    props: {
      images: {
        type: Array,
        default: () => []
      },
      show: {
        type: Boolean,
        default: false
      },
      startPosition: {
        type: Number,
        default: 0
      }
    },
    setup(props) {
      return () =>
        h('output', {
          class: 'image-viewer-stub',
          'data-show': String(props.show),
          'data-images': JSON.stringify(props.images),
          'data-start-position': String(props.startPosition)
        });
    }
  });
}

describe('BMessage image viewer', () => {
  it('opens BImageViewer at clicked markdown image without selecting text', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '![first](https://example.com/first.png)\n\n![second](https://example.com/second.png)'
      },
      global: {
        stubs: {
          BImageViewer: createImageViewerStub()
        }
      }
    });

    await nextTick();

    const images = wrapper.findAll('.b-message__markdown img');
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const mouseDownPreventDefaultSpy = vi.spyOn(mouseDownEvent, 'preventDefault');
    images[1].element.dispatchEvent(mouseDownEvent);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
    images[1].element.dispatchEvent(clickEvent);

    await nextTick();

    const viewer = wrapper.find('.image-viewer-stub');
    expect(mouseDownPreventDefaultSpy).toHaveBeenCalledOnce();
    expect(preventDefaultSpy).toHaveBeenCalledOnce();
    expect(stopPropagationSpy).toHaveBeenCalledOnce();
    expect(viewer.attributes('data-show')).toBe('true');
    expect(viewer.attributes('data-start-position')).toBe('1');
    expect(JSON.parse(viewer.attributes('data-images') ?? '[]')).toEqual(['https://example.com/first.png', 'https://example.com/second.png']);
  });
});
