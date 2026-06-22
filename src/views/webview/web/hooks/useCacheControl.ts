/**
 * @file useCacheControl.ts
 * @description 封装 WebView 缓存与站点数据清理操作。
 */
import type { WebviewTag } from 'electron';
import type { Ref } from 'vue';
import { message } from 'ant-design-vue';

/**
 * 创建当前页面 Web Storage 清理脚本。
 * @returns 可注入到 `<webview>` 当前页面的清理脚本
 */
function createCurrentPageStorageClearScript(): string {
  return `(() => {
  const failedStorages = [];
  try {
    window.localStorage.clear();
  } catch {
    failedStorages.push('localStorage');
  }
  try {
    window.sessionStorage.clear();
  } catch {
    failedStorages.push('sessionStorage');
  }
  return { ok: failedStorages.length === 0, failedStorages };
})()`;
}

/**
 * 清理当前页面的 localStorage 与 sessionStorage。
 * @param webviewRef - 当前 `<webview>` 引用
 */
async function clearCurrentPageStorage(webviewRef?: Ref<WebviewTag | null>): Promise<void> {
  const instance = webviewRef?.value;
  const executeJavaScript = instance?.executeJavaScript;

  if (!instance || typeof executeJavaScript !== 'function') {
    return;
  }

  await executeJavaScript.call(instance, createCurrentPageStorageClearScript());
}

/**
 * 创建 WebView 缓存控制器。
 * @param webviewRef - 当前 `<webview>` 引用
 * @returns 缓存清理方法
 */
export function useCacheControl(webviewRef?: Ref<WebviewTag | null>): { clearCache: () => Promise<void> } {
  /**
   * 清理当前 WebView 缓存、Cookie 以及 Web Storage。
   */
  async function clearCache(): Promise<void> {
    const key = 'clear-cache';
    message.loading({ content: '正在删除缓存数据…', key, duration: 0 });
    try {
      const webviewApi = window.electronAPI?.webview;
      if (!webviewApi) {
        throw new Error('当前环境暂不支持清除缓存');
      }

      await clearCurrentPageStorage(webviewRef);
      await webviewApi.clearCache();
      message.success({ content: '已删除缓存数据', key });
    } catch (error: unknown) {
      message.error({ content: error instanceof Error ? error.message : '删除缓存数据失败', key });
    }
  }

  return {
    clearCache
  };
}
