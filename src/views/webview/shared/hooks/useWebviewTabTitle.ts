/**
 * @file useWebviewTabTitle.ts
 * @description 同步 WebView 页面标题到 tabsStore。
 */
import type { WebviewTabTitleOptions } from '../types';
import { watch } from 'vue';
import { useTabsStore } from '@/stores/workspace/tabs';

/**
 * 监听 WebView 标题并更新当前标签页名称。
 * @param options - 标题同步参数
 */
export function useWebviewTabTitle(options: WebviewTabTitleOptions): void {
  const tabsStore = useTabsStore();

  watch(options.title, (title: string) => {
    if (!title) {
      return;
    }

    tabsStore.updateTabTitle({
      id: options.routeFullPath,
      title
    });
  });
}
