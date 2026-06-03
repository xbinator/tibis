/**
 * @file useScreenshot.test.ts
 * @description 验证截图 Hook 的对外行为。
 */

import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenshot } from '@/views/webview/web/hooks/useScreenshot';

const { saveBinaryFile, messageSuccess, messageError } = vi.hoisted(() => ({
  saveBinaryFile: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn()
}));

vi.mock('@/shared/platform', () => ({
  native: {
    saveBinaryFile
  }
}));

vi.mock('ant-design-vue', () => ({
  message: {
    success: messageSuccess,
    error: messageError
  }
}));

/**
 * 创建截图 hook 所需的最小页面状态。
 * @param title - 页面标题
 * @param url - 页面地址
 * @returns 页面状态引用
 */
function createWebviewState(title: string, url: string) {
  return ref({
    title,
    url
  });
}

describe('useScreenshot', () => {
  beforeEach(() => {
    saveBinaryFile.mockReset();
    messageSuccess.mockReset();
    messageError.mockReset();
  });

  it('saves the viewport screenshot with a generated png filename', async () => {
    const capturePage = vi.fn().mockResolvedValue({
      toPNG: () => new Uint8Array([137, 80, 78, 71])
    });
    const screenshot = useScreenshot({
      webviewElementRef: ref({
        capturePage,
        executeJavaScript: vi.fn()
      } as unknown as Electron.WebviewTag),
      webviewState: createWebviewState('Example / Page', 'https://example.com')
    });
    saveBinaryFile.mockResolvedValue('/tmp/example.png');

    await screenshot.captureViewportScreenshot();

    expect(capturePage).toHaveBeenCalledTimes(1);
    expect(saveBinaryFile).toHaveBeenCalledTimes(1);
    expect(saveBinaryFile.mock.calls[0]?.[2]).toMatchObject({
      defaultPath: expect.stringMatching(/^Example Page-viewport-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/)
    });
    expect(messageSuccess).toHaveBeenCalledWith('当前视图截图已保存');
  });

  it('reports a friendly error when capturing a full-page screenshot without a ready webview', async () => {
    const screenshot = useScreenshot({
      webviewElementRef: ref(null),
      webviewState: createWebviewState('Example', 'https://example.com')
    });

    await screenshot.captureFullPageScreenshot();

    expect(messageError).toHaveBeenCalledWith('当前页面尚未准备好，请稍后重试');
  });
});
