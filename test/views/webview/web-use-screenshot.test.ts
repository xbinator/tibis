/**
 * @file web-use-screenshot.test.ts
 * @description 验证 WebView 截图输出到剪贴板。
 * @vitest-environment jsdom
 */
import type { WebviewTag } from 'electron';
import { ref } from 'vue';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { native } from '@/shared/platform/native';
import { useScreenshot } from '@/views/webview/web/hooks/useScreenshot';

vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/shared/platform/native', () => ({
  native: {
    copyImageToClipboard: vi.fn().mockResolvedValue(undefined),
    saveBinaryFile: vi.fn().mockResolvedValue('/tmp/webview.png')
  }
}));

/**
 * 创建可截图的 WebView 测试替身。
 * @param pngBytes - 截图 PNG 字节
 * @returns WebView 测试替身
 */
function createScreenshotWebview(pngBytes: Uint8Array): WebviewTag {
  const element = document.createElement('webview') as unknown as WebviewTag;
  element.executeJavaScript = vi.fn();
  element.capturePage = vi.fn().mockResolvedValue({
    toPNG: () => pngBytes
  });
  return element;
}

describe('useScreenshot', () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it('copies viewport screenshot PNG to clipboard without saving a file', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const webviewElement = createScreenshotWebview(pngBytes);
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureViewportScreenshot();

    expect(native.copyImageToClipboard).toHaveBeenCalledTimes(1);
    const copiedBuffer = vi.mocked(native.copyImageToClipboard).mock.calls[0]?.[0];

    expect(copiedBuffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(copiedBuffer ?? new ArrayBuffer(0)))).toEqual(Array.from(pngBytes));
    expect(native.saveBinaryFile).not.toHaveBeenCalled();
  });
});
