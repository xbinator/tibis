/**
 * @file image-viewer.test.ts
 * @description BMessage Markdown 图片查看器交互测试。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BMessage from '@/components/BMessage/index.vue';

const previewImageMock = vi.hoisted(() => vi.fn());
const nativeMocks = vi.hoisted(() => ({
  copyImageToClipboard: vi.fn()
}));
const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}));

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

vi.mock('@/shared/platform/native', () => ({
  native: nativeMocks
}));

vi.mock('ant-design-vue', () => ({
  message: messageMocks
}));

/**
 * 等待 BMessage 调度帧和 Vue DOM 更新。
 */
async function waitMessageRender(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  await nextTick();
}

describe('BMessage image viewer', () => {
  beforeEach((): void => {
    previewImageMock.mockClear();
    nativeMocks.copyImageToClipboard.mockReset();
    messageMocks.success.mockClear();
    messageMocks.error.mockClear();
    vi.unstubAllGlobals();
  });

  it('renders markdown images through the ImageNode component', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '![first](https://example.com/first.png)'
      }
    });

    await waitMessageRender();

    expect(wrapper.findComponent({ name: 'ImageNode' }).exists()).toBe(true);
    expect(wrapper.find('.b-message__image-img').exists()).toBe(true);
  });

  it('opens markdown images through previewImage without selecting text', async (): Promise<void> => {
    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '![first](https://example.com/first.png)\n\n![second](https://example.com/second.png)'
      }
    });

    await waitMessageRender();

    const images = wrapper.findAll('.b-message__markdown img');
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const mouseDownPreventDefaultSpy = vi.spyOn(mouseDownEvent, 'preventDefault');
    images[1].element.dispatchEvent(mouseDownEvent);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
    images[1].element.dispatchEvent(clickEvent);

    await waitMessageRender();

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

    await waitMessageRender();

    await wrapper.find('.b-message__markdown img').trigger('click');

    expect(previewImageMock).toHaveBeenCalledWith({
      images: [{ src: new URL('assets/relative.png', document.baseURI).href, name: 'relative' }],
      startPosition: 0,
      showCarousel: false
    });
  });

  it('copies markdown image binary to clipboard without opening preview', async (): Promise<void> => {
    const imageBuffer = new ArrayBuffer(4);
    const fetchResponse = {
      ok: true,
      arrayBuffer: async (): Promise<ArrayBuffer> => imageBuffer
    } as unknown as Response;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(fetchResponse);

    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '![first](https://example.com/first.png)'
      }
    });

    await waitMessageRender();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
    wrapper.find('button[aria-label="复制图片"]').element.dispatchEvent(clickEvent);

    await flushPromises();

    expect(preventDefaultSpy).toHaveBeenCalledOnce();
    expect(stopPropagationSpy).toHaveBeenCalledOnce();
    expect(previewImageMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/first.png');
    expect(nativeMocks.copyImageToClipboard).toHaveBeenCalledWith(imageBuffer);
    expect(messageMocks.success).toHaveBeenCalledWith('图片已复制');
  });

  it('shows an error when copying markdown image binary fails', async (): Promise<void> => {
    const copyError = new Error('系统剪贴板不可用');
    const fetchResponse = {
      ok: true,
      arrayBuffer: async (): Promise<ArrayBuffer> => new ArrayBuffer(4)
    } as unknown as Response;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(fetchResponse);

    vi.stubGlobal('fetch', fetchMock);
    nativeMocks.copyImageToClipboard.mockRejectedValue(copyError);

    const wrapper = mount(BMessage, {
      props: {
        type: 'markdown',
        content: '![first](https://example.com/first.png)'
      }
    });

    await waitMessageRender();

    await wrapper.find('button[aria-label="复制图片"]').trigger('click');
    await flushPromises();

    expect(previewImageMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/first.png');
    expect(messageMocks.error).toHaveBeenCalledWith('系统剪贴板不可用');
  });
});
