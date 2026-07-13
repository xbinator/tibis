/**
 * @file useWidgetTabTitle.ts
 * @description 从 Widget 实际保存内容解析并同步顶部标签标题。
 */
import type { Ref } from 'vue';
import { watch } from 'vue';
import { useTabsStore } from '@/stores/workspace/tabs';
import { isPlainRecord, safeJsonParse } from '@/utils/json';

/**
 * Widget 标签标题同步参数。
 */
export interface UseWidgetTabTitleOptions {
  /** 当前 Widget 标签 ID */
  tabId: Readonly<Ref<string>>;
  /** 从实际保存内容解析出的标签标题 */
  title: Readonly<Ref<string>>;
  /** 实际保存内容，用于在派生标题文本未变化时触发权威同步 */
  savedContent: Readonly<Ref<string>>;
}

/**
 * 从实际保存的 Widget JSON 中解析标签标题。
 * @param savedContent - 最近一次实际保存成功的 Widget JSON
 * @param fileTitle - Widget 名称为空或内容无效时的文件标题
 * @returns Widget 标签标题
 */
export function resolveSavedWidgetTabTitle(savedContent: string, fileTitle: string): string {
  const data = safeJsonParse<unknown>(savedContent);
  if (!isPlainRecord(data)) {
    return fileTitle;
  }

  const { name } = data;
  return typeof name === 'string' ? name.trim() || fileTitle : fileTitle;
}

/**
 * 监听实际保存标题并同步到当前 Widget 标签。
 * @param options - 标签标题同步参数
 */
export function useWidgetTabTitle(options: UseWidgetTabTitleOptions): void {
  const tabsStore = useTabsStore();

  watch([options.tabId, options.title, options.savedContent], ([tabId, title]: [string, string, string]): void => {
    if (!tabId || !title) {
      return;
    }

    tabsStore.updateTabTitle({ id: tabId, title });
  });
}
