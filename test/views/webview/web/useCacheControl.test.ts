/**
 * @file useCacheControl.test.ts
 * @description 验证缓存控制 Hook 的行为。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCacheControl } from '@/views/webview/web/hooks/useCacheControl';

const { messageSuccess, messageError } = vi.hoisted(() => ({
  messageSuccess: vi.fn(),
  messageError: vi.fn()
}));

vi.mock('ant-design-vue', () => ({
  message: {
    success: messageSuccess,
    error: messageError
  }
}));

describe('useCacheControl', () => {
  beforeEach(() => {
    messageSuccess.mockReset();
    messageError.mockReset();
    vi.stubGlobal('window', {});
  });

  it('clears the current webview cache through the electron bridge', async () => {
    const clearCache = vi.fn().mockResolvedValue(undefined);
    (window as typeof window & { electronAPI?: typeof window.electronAPI }).electronAPI = {
      webview: {
        clearCache
      }
    } as typeof window.electronAPI;
    const cacheControl = useCacheControl();

    await cacheControl.clearCache();

    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(messageSuccess).toHaveBeenCalledWith('WebView 缓存已清除');
  });

  it('reports when the current environment does not support clearing cache', async () => {
    delete (window as typeof window & { electronAPI?: typeof window.electronAPI }).electronAPI;
    const cacheControl = useCacheControl();

    await cacheControl.clearCache();

    expect(messageError).toHaveBeenCalledWith('当前环境暂不支持清除缓存');
  });
});
