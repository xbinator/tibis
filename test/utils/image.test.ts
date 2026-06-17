/**
 * @file image.test.ts
 * @description 图片工具函数测试。
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadImageArrayBuffer } from '@/utils/image';

describe('image utils', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('downloads an image URL as an ArrayBuffer', async (): Promise<void> => {
    const imageBytes = new Uint8Array([7, 8, 9]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(imageBytes, { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    const [error, buffer] = await downloadImageArrayBuffer('https://example.test/image.png', '图片下载失败');

    expect(error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/image.png');
    expect(Array.from(new Uint8Array(buffer ?? new ArrayBuffer(0)))).toEqual([7, 8, 9]);
  });

  it('returns an error result when image download fails', async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

    vi.stubGlobal('fetch', fetchMock);

    const [error, buffer] = await downloadImageArrayBuffer('https://example.test/missing.png', '图片下载失败');

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('图片下载失败');
    expect(buffer).toBeUndefined();
  });
});
