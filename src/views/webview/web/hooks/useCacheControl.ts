/**
 * @file useCacheControl.ts
 * @description 封装 WebView 持久化分区缓存清理操作。
 */
import { message } from 'ant-design-vue';

/**
 * 创建 WebView 缓存控制器。
 * @returns 缓存清理方法
 */
export function useCacheControl(): { clearCache: () => Promise<void> } {
  /**
   * 清理当前 WebView 持久化分区缓存。
   */
  async function clearCache(): Promise<void> {
    try {
      const webviewApi = window.electronAPI?.webview;
      if (!webviewApi) {
        throw new Error('当前环境暂不支持清除缓存');
      }

      await webviewApi.clearCache();
      message.success('WebView 缓存已清除');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '清除缓存失败');
    }
  }

  return {
    clearCache
  };
}
