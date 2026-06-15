/**
 * @file image-viewer.test.ts
 * @description BMessage Markdown 图片查看器交互测试。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BMessage from '@/components/BMessage/index.vue';

const previewImageMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    onLink: vi.fn()
  })
}));

vi.mock('@/hooks/useImagePreview', () => ({
  useImagePreview: () => ({
    previewImage: previewImageMock
  })
}));

describe('BMessage image viewer', () => {
  it('opens markdown images through previewImage without selecting text', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '![first](https://example.com/first.png)\n\n![second](https://example.com/second.png)'
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

    expect(mouseDownPreventDefaultSpy).toHaveBeenCalledOnce();
    expect(preventDefaultSpy).toHaveBeenCalledOnce();
    expect(stopPropagationSpy).toHaveBeenCalledOnce();
    expect(previewImageMock).toHaveBeenCalledWith({
      images: [
        { src: 'https://example.com/first.png', name: 'first' },
        { src: 'https://example.com/second.png', name: 'second' }
      ],
      startPosition: 1,
      showCarousel: true
    });
  });

  it('resolves relative markdown image sources before opening preview', async (): Promise<void> => {
    previewImageMock.mockClear();

    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '![relative](assets/relative.png)'
      }
    });

    await nextTick();

    await wrapper.find('.b-message__markdown img').trigger('click');

    expect(previewImageMock).toHaveBeenCalledWith({
      images: [{ src: new URL('assets/relative.png', document.baseURI).href, name: 'relative' }],
      startPosition: 0,
      showCarousel: false
    });
  });
});
