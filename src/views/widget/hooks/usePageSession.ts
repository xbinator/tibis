/**
 * @file usePageSession.ts
 * @description Widget页面文件会话、标签同步和页面级样式变量。
 */
import type { CSSProperties, ComputedRef, Ref } from 'vue';
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { useFileSession, type UseFileSessionReturn } from '@/hooks/useFileSession';
import { useTabsStore } from '@/stores/workspace/tabs';
import { useBindings } from './useBindings';

/**
 * Widget页面根节点样式变量。
 */
export type WidgetPageStyle = CSSProperties & {
  /** 右侧设置覆盖面板宽度，用于画布内浮动控件避让。 */
  '--widget-page-settings-width': string;
};

/**
 * Widget页面会话 hook 返回值。
 */
export interface UsePageSessionReturn {
  /** 当前文件 ID */
  fileId: Ref<string>;
  /** 当前 KeepAlive 页面是否活跃 */
  isActive: Ref<boolean>;
  /** 当前Widget文件会话 */
  session: UseFileSessionReturn<WidgetData>;
  /** 右侧设置面板宽度 */
  settingsWidth: Ref<number>;
  /** 页面级样式变量 */
  widgetPageStyle: ComputedRef<WidgetPageStyle>;
  /** 保存当前Widget文件 */
  handleSave: () => Promise<void>;
}

/**
 * 创建Widget页面文件会话和页面级状态。
 * @returns Widget页面会话状态
 */
export function usePageSession(): UsePageSessionReturn {
  const route = useRoute();
  const tabsStore = useTabsStore();
  const fileId = ref(String(route.params.id || ''));
  const isActive = ref(true);
  const routePath = computed<string>(() => route.fullPath || `/widget/${fileId.value}`);
  const session = useFileSession<WidgetData>({
    fileId,
    kind: 'widget',
    recordType: 'widget',
    defaultName: 'Untitled',
    defaultExt: 'json',
    defaultData: createDefaultWidgetData(),
    routeName: 'widget',
    fallbackRouteName: 'editor'
  });
  const settingsWidth = ref(300);
  const widgetPageStyle = computed<WidgetPageStyle>(
    (): WidgetPageStyle => ({
      '--widget-page-settings-width': `${settingsWidth.value}px`
    })
  );

  /**
   * 保存当前 Widget 文件（由侧栏运行脚本编辑器 Ctrl+S 触发）。
   */
  async function handleSave(): Promise<void> {
    await session.actions.onSave();
  }

  /**
   * 将当前Widget文件同步到标签页列表。
   */
  function syncWidgetTab(): void {
    if (!fileId.value) {
      return;
    }

    tabsStore.addTab({
      id: fileId.value,
      path: routePath.value,
      title: session.currentTitle.value,
      cacheKey: `widget:${fileId.value}`
    });
  }

  watch([fileId, session.currentTitle], syncWidgetTab, { immediate: true });

  useBindings({
    isActive,
    actions: session.actions
  });

  onActivated((): void => {
    isActive.value = true;
  });

  onDeactivated((): void => {
    isActive.value = false;
  });

  return {
    fileId,
    isActive,
    session,
    settingsWidth,
    widgetPageStyle,
    handleSave
  };
}
