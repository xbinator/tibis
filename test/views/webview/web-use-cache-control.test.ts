/**
 * @file web-use-cache-control.test.ts
 * @description 验证 WebView 缓存与站点数据清理控制器。
 * @vitest-environment jsdom
 */
import type { WebviewTag } from 'electron';
import type { ElectronAPI } from 'types/electron-api';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCacheControl } from '@/views/webview/web/hooks/useCacheControl';

const messageMock = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock('ant-design-vue', () => ({
  message: messageMock
}));

/**
 * 创建可执行清理脚本的 WebView 测试替身。
 * @returns WebView 测试替身
 */
function createStorageWebview(): WebviewTag {
  const element = document.createElement('webview') as unknown as WebviewTag;
  element.executeJavaScript = vi.fn().mockResolvedValue(undefined);
  return element;
}

/**
 * 安装测试用 Electron WebView API。
 * @param clearCache - clearCache 替身
 */
function installElectronWebviewAPI(clearCache: () => Promise<void>): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      webview: {
        clearCache
      }
    } as unknown as ElectronAPI
  });
}

describe('useCacheControl', () => {
  afterEach((): void => {
    Reflect.deleteProperty(window, 'electronAPI');
    messageMock.loading.mockClear();
    messageMock.success.mockClear();
    messageMock.error.mockClear();
    vi.restoreAllMocks();
  });

  it('clears current page localStorage/sessionStorage before clearing persistent WebView data', async (): Promise<void> => {
    const clearCache = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const webviewElement = createStorageWebview();
    installElectronWebviewAPI(clearCache);

    await useCacheControl(ref<WebviewTag | null>(webviewElement)).clearCache();

    expect(webviewElement.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('localStorage.clear()'));
    expect(webviewElement.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('sessionStorage.clear()'));
    expect(clearCache).toHaveBeenCalledTimes(1);
  });
});
