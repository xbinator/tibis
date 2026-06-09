/**
 * @file image-preview.test.ts
 * @description 验证 Electron 图片预览服务在 macOS 使用系统预览，在其他平台打开独立图片窗口。
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createImagePreviewService,
  fetchRemoteImageWithLimits,
  type ImagePreviewServiceDependencies,
  type ImagePreviewWindow
} from '../../../../../electron/main/modules/ui/image-preview.mts';

/**
 * 创建图片预览服务依赖测试桩。
 * @param platform - 目标平台
 * @returns 依赖测试桩与窗口加载函数
 */
function createDependencies(platform: NodeJS.Platform): ImagePreviewServiceDependencies & { loadURL: ReturnType<typeof vi.fn<ImagePreviewWindow['loadURL']>> } {
  const loadURL = vi.fn<ImagePreviewWindow['loadURL']>().mockResolvedValue(undefined);

  return {
    platform,
    tempDir: '/tmp',
    mkdir: vi.fn<ImagePreviewServiceDependencies['mkdir']>().mockResolvedValue(undefined),
    readdir: vi.fn<ImagePreviewServiceDependencies['readdir']>().mockResolvedValue([]),
    stat: vi.fn<ImagePreviewServiceDependencies['stat']>().mockRejectedValue(new Error('missing')),
    unlink: vi.fn<ImagePreviewServiceDependencies['unlink']>().mockResolvedValue(undefined),
    now: vi.fn<ImagePreviewServiceDependencies['now']>().mockReturnValue(new Date('2026-06-09T10:00:00.000Z').getTime()),
    writeFile: vi.fn<ImagePreviewServiceDependencies['writeFile']>().mockResolvedValue(undefined),
    fetchRemoteImage: vi.fn<ImagePreviewServiceDependencies['fetchRemoteImage']>().mockResolvedValue({
      buffer: Buffer.from([4, 5, 6]),
      mimeType: 'image/png'
    }),
    openPath: vi.fn<ImagePreviewServiceDependencies['openPath']>().mockResolvedValue(''),
    createWindow: vi.fn<ImagePreviewServiceDependencies['createWindow']>(() => ({ loadURL })),
    loadURL
  };
}

/**
 * 计算测试中图片来源的缓存文件名前缀。
 * @param src - 图片来源
 * @returns 缓存文件名前缀
 */
function createPreviewHash(src: string): string {
  return createHash('sha256').update(src).digest('hex').slice(0, 20);
}

describe('createImagePreviewService', () => {
  it('writes data URL images to temp files and opens them through macOS native preview', async (): Promise<void> => {
    const deps = createDependencies('darwin');
    const service = createImagePreviewService(deps);

    const result = await service.previewImage({
      src: 'data:image/png;base64,AQID',
      name: 'demo.png',
      mimeType: 'image/png'
    });

    const expectedDir = path.join('/tmp', 'tibis-image-preview');
    expect(deps.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(deps.writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), Buffer.from([1, 2, 3]));
    expect(deps.openPath).toHaveBeenCalledWith(expect.stringMatching(/\.png$/));
    expect(result).toEqual({ opened: true, mode: 'native' });
  });

  it('downloads macOS remote image URLs to temp files and opens them through native preview', async (): Promise<void> => {
    const deps = createDependencies('darwin');
    const service = createImagePreviewService(deps);

    const result = await service.previewImage({
      src: 'https://example.com/demo.png',
      name: 'demo.png',
      mimeType: 'image/png'
    });

    expect(deps.fetchRemoteImage).toHaveBeenCalledWith('https://example.com/demo.png');
    expect(deps.writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), Buffer.from([4, 5, 6]));
    expect(deps.openPath).toHaveBeenCalledWith(expect.stringMatching(/\.png$/));
    expect(deps.createWindow).not.toHaveBeenCalled();
    expect(result).toEqual({ opened: true, mode: 'native' });
  });

  it('reuses cached macOS remote image temp files without downloading again', async (): Promise<void> => {
    const deps = createDependencies('darwin');
    deps.stat = vi.fn<ImagePreviewServiceDependencies['stat']>().mockResolvedValue({
      isFile: () => true,
      mtimeMs: new Date('2026-06-09T09:58:00.000Z').getTime()
    });
    const service = createImagePreviewService(deps);

    const result = await service.previewImage({
      src: 'https://example.com/demo.png',
      name: 'demo.png',
      mimeType: 'image/png'
    });

    expect(deps.fetchRemoteImage).not.toHaveBeenCalled();
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.openPath).toHaveBeenCalledWith(expect.stringMatching(/\.png$/));
    expect(result).toEqual({ opened: true, mode: 'native' });
  });

  it('refreshes expired cached macOS remote image temp files', async (): Promise<void> => {
    const deps = createDependencies('darwin');
    const oldMtime = new Date('2026-06-07T09:00:00.000Z').getTime();
    deps.stat = vi.fn<ImagePreviewServiceDependencies['stat']>().mockResolvedValue({
      isFile: () => true,
      mtimeMs: oldMtime
    });
    const service = createImagePreviewService(deps);

    const result = await service.previewImage({
      src: 'https://example.com/demo.png',
      name: 'demo.png',
      mimeType: 'image/png'
    });

    expect(deps.unlink).toHaveBeenCalledWith(expect.stringMatching(/\.png$/));
    expect(deps.fetchRemoteImage).toHaveBeenCalledWith('https://example.com/demo.png');
    expect(deps.writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), Buffer.from([4, 5, 6]));
    expect(result).toEqual({ opened: true, mode: 'native' });
  });

  it('reuses cached macOS remote images by source hash when the URL has no extension', async (): Promise<void> => {
    const deps = createDependencies('darwin');
    const src = 'https://example.com/image?id=1';
    const cachedFilename = `${createPreviewHash(src)}.jpg`;
    deps.readdir = vi.fn<ImagePreviewServiceDependencies['readdir']>().mockResolvedValue([cachedFilename]);
    deps.stat = vi.fn<ImagePreviewServiceDependencies['stat']>().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith(cachedFilename)) {
        return {
          isFile: () => true,
          mtimeMs: new Date('2026-06-09T09:58:00.000Z').getTime()
        };
      }

      throw new Error('missing');
    });
    const service = createImagePreviewService(deps);

    const result = await service.previewImage({ src });

    expect(deps.fetchRemoteImage).not.toHaveBeenCalled();
    expect(deps.openPath).toHaveBeenCalledWith(path.join('/tmp', 'tibis-image-preview', cachedFilename));
    expect(result).toEqual({ opened: true, mode: 'native' });
  });

  it('deduplicates concurrent macOS remote image downloads for the same URL', async (): Promise<void> => {
    const deps = createDependencies('darwin');
    let resolveDownload: ((value: { buffer: Buffer; mimeType: string }) => void) | undefined;
    deps.fetchRemoteImage = vi.fn<ImagePreviewServiceDependencies['fetchRemoteImage']>(
      () =>
        new Promise((resolve) => {
          resolveDownload = resolve;
        })
    );
    const service = createImagePreviewService(deps);
    const request = {
      src: 'https://example.com/demo.png',
      name: 'demo.png',
      mimeType: 'image/png'
    };

    const firstPreview = service.previewImage(request);
    const secondPreview = service.previewImage(request);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(deps.fetchRemoteImage).toHaveBeenCalledOnce();

    resolveDownload?.({ buffer: Buffer.from([7, 8, 9]), mimeType: 'image/png' });
    await Promise.all([firstPreview, secondPreview]);

    expect(deps.openPath).toHaveBeenCalledTimes(2);
  });

  it('cleans expired preview temp files before writing a new temp image', async (): Promise<void> => {
    const deps = createDependencies('darwin');
    const oldMtime = new Date('2026-06-07T09:00:00.000Z').getTime();
    const freshMtime = new Date('2026-06-09T09:58:00.000Z').getTime();
    deps.readdir = vi.fn<ImagePreviewServiceDependencies['readdir']>().mockResolvedValue(['old.png', 'fresh.png']);
    deps.stat = vi.fn<ImagePreviewServiceDependencies['stat']>().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('old.png')) return { isFile: () => true, mtimeMs: oldMtime };
      if (filePath.endsWith('fresh.png')) return { isFile: () => true, mtimeMs: freshMtime };
      throw new Error('missing');
    });
    const service = createImagePreviewService(deps);

    await service.previewImage({
      src: 'https://example.com/demo.png',
      name: 'demo.png',
      mimeType: 'image/png'
    });

    expect(deps.unlink).toHaveBeenCalledWith(path.join('/tmp', 'tibis-image-preview', 'old.png'));
    expect(deps.unlink).not.toHaveBeenCalledWith(path.join('/tmp', 'tibis-image-preview', 'fresh.png'));
  });

  it('falls back to a separate BrowserWindow when macOS remote image download fails', async (): Promise<void> => {
    const deps = createDependencies('darwin');
    deps.fetchRemoteImage = vi.fn<ImagePreviewServiceDependencies['fetchRemoteImage']>().mockRejectedValue(new Error('network failed'));
    const service = createImagePreviewService(deps);

    const result = await service.previewImage({
      src: 'https://example.com/demo.png',
      name: 'demo.png',
      mimeType: 'image/png'
    });

    expect(deps.createWindow).toHaveBeenCalledWith(expect.objectContaining({ title: 'demo.png' }));
    expect(result).toEqual({ opened: true, mode: 'window' });
  });

  it('opens Windows image previews in a separate BrowserWindow', async (): Promise<void> => {
    const deps = createDependencies('win32');
    const service = createImagePreviewService(deps);

    const result = await service.previewImage({
      src: 'data:image/png;base64,AQID',
      name: 'demo.png',
      mimeType: 'image/png'
    });

    expect(deps.createWindow).toHaveBeenCalledWith(expect.objectContaining({ title: 'demo.png' }));
    expect(deps.loadURL).toHaveBeenCalledWith(expect.stringContaining('data:text/html;charset=utf-8,'));
    expect(result).toEqual({ opened: true, mode: 'window' });
  });

  it('opens non-macOS image previews in a separate BrowserWindow', async (): Promise<void> => {
    const deps = createDependencies('linux');
    const service = createImagePreviewService(deps);

    const result = await service.previewImage({
      src: 'data:image/png;base64,AQID',
      name: 'demo.png',
      mimeType: 'image/png'
    });

    expect(deps.createWindow).toHaveBeenCalledWith(expect.objectContaining({ title: 'demo.png' }));
    expect(deps.openPath).not.toHaveBeenCalled();
    expect(result).toEqual({ opened: true, mode: 'window' });
  });
});

describe('fetchRemoteImageWithLimits', () => {
  it('rejects oversized remote images before reading the response body', async (): Promise<void> => {
    const arrayBuffer = vi.fn<() => Promise<ArrayBuffer>>().mockResolvedValue(new ArrayBuffer(0));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string): string | null => {
          if (name.toLowerCase() === 'content-length') return String(51 * 1024 * 1024);
          if (name.toLowerCase() === 'content-type') return 'image/png';
          return null;
        }
      },
      arrayBuffer
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRemoteImageWithLimits('https://example.com/large.png')).rejects.toThrow('图片过大');

    expect(arrayBuffer).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
