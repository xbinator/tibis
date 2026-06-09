/**
 * @file use-image-preview.test.ts
 * @description 验证图片预览 hook 会优先调用 Electron 原生预览，并在不可用时回退到应用内查看器。
 * @vitest-environment jsdom
 */
import type { ElectronAPI, ElectronImagePreviewResult } from 'types/electron-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImagePreview } from '@/hooks/useImagePreview';

const renderMock = vi.hoisted(() => vi.fn());

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    render: renderMock
  };
});

vi.mock('@/components/BImageViewer/index.vue', () => ({
  default: { name: 'BImageViewer' }
}));

/**
 * 将测试用 electronAPI 挂到 window 上。
 * @param api - Electron API 局部测试桩
 */
function setElectronAPI(api: Pick<ElectronAPI, 'previewImage'> | undefined): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: api
  });
}

describe('useImagePreview', () => {
  afterEach((): void => {
    renderMock.mockReset();
    setElectronAPI(undefined);
  });

  it('opens the selected image through Electron preview API', async (): Promise<void> => {
    const electronResult: ElectronImagePreviewResult = { opened: true, mode: 'native' };
    const electronPreview = vi.fn<ElectronAPI['previewImage']>().mockResolvedValue(electronResult);

    setElectronAPI({ previewImage: electronPreview });

    const { previewImage } = useImagePreview();
    await previewImage({
      images: [
        { src: 'data:image/png;base64,AAAA', name: 'first.png', mimeType: 'image/png' },
        { src: '/tmp/second.jpg', name: 'second.jpg', mimeType: 'image/jpeg' }
      ],
      startPosition: 1
    });

    expect(electronPreview).toHaveBeenCalledWith({ src: '/tmp/second.jpg', name: 'second.jpg', mimeType: 'image/jpeg' });
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('renders the in-app viewer internally when native preview is unavailable', async (): Promise<void> => {
    setElectronAPI(undefined);

    const { previewImage } = useImagePreview();
    await previewImage({
      images: [{ src: 'data:image/png;base64,AAAA', name: 'first.png', mimeType: 'image/png' }],
      startPosition: 0
    });

    const hiddenVNode = renderMock.mock.calls[0]?.[0] as { props?: Record<string, unknown> } | undefined;
    const visibleVNode = renderMock.mock.calls[1]?.[0] as { props?: Record<string, unknown> } | undefined;
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(hiddenVNode?.props).toMatchObject({
      show: false
    });
    expect(visibleVNode?.props).toMatchObject({
      images: ['data:image/png;base64,AAAA'],
      startPosition: 0,
      show: true
    });
  });

  it('normalizes invalid start positions in the hook', async (): Promise<void> => {
    setElectronAPI(undefined);

    const { previewImage } = useImagePreview();
    await previewImage({
      images: [{ src: 'data:image/png;base64,AAAA' }],
      startPosition: -10
    });

    const visibleVNode = renderMock.mock.calls[1]?.[0] as { props?: Record<string, unknown> } | undefined;
    expect(visibleVNode?.props).toMatchObject({
      startPosition: 0
    });
  });

  it('does not reject when preview internals fail', async (): Promise<void> => {
    const electronPreview = vi.fn<ElectronAPI['previewImage']>().mockRejectedValue(new Error('native failed'));
    renderMock.mockImplementationOnce(() => {
      throw new Error('fallback failed');
    });

    setElectronAPI({ previewImage: electronPreview });

    const { previewImage } = useImagePreview();
    await expect(
      previewImage({
        images: [{ src: 'data:image/png;base64,AAAA' }],
        startPosition: 0
      })
    ).resolves.toBeUndefined();
  });
});
