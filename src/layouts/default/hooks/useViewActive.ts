/**
 * @file useViewActive.ts
 * @description 默认布局视图菜单 hook，负责组装视图相关菜单项与快捷键注册。
 */
import { computed, onUnmounted } from 'vue';
import type { ComputedRef } from 'vue';
import { useToolbarShortcuts } from '@/components/BToolbar/hooks/useToolbarShortcuts';
import type { ToolbarOptions } from '@/components/BToolbar/types';
import { useEditorPreferencesStore } from '@/stores/editorPreferences';
import { useSettingStore } from '@/stores/setting';
import { EditorShortcuts } from '../../../constants/shortcuts';

/**
 * 构建默认布局的视图菜单选项。
 * @returns 视图菜单配置
 */
export function useViewActive(): { toolbarViewOptions: ComputedRef<ToolbarOptions> } {
  const editorPreferencesStore = useEditorPreferencesStore();
  const settingStore = useSettingStore();
  const { register: registerShortcuts } = useToolbarShortcuts();

  const toolbarViewOptions = computed<ToolbarOptions>(() => [
    {
      value: 'source',
      label: '源代码模式',
      shortcut: EditorShortcuts.VIEW_SOURCE,
      selected: editorPreferencesStore.viewMode === 'source',
      onClick: () => {
        editorPreferencesStore.setViewMode(editorPreferencesStore.viewMode === 'source' ? 'rich' : 'source');
      }
    },
    { type: 'divider' },
    {
      value: 'page-width',
      label: '页宽',
      selected: false,
      children: [
        {
          value: 'default',
          label: '默认',
          selected: editorPreferencesStore.pageWidth === 'default',
          onClick: () => {
            editorPreferencesStore.setPageWidth('default');
          }
        },
        {
          value: 'wide',
          label: '较宽',
          selected: editorPreferencesStore.pageWidth === 'wide',
          onClick: () => {
            editorPreferencesStore.setPageWidth('wide');
          }
        },
        {
          value: 'full',
          label: '全宽',
          selected: editorPreferencesStore.pageWidth === 'full',
          onClick: () => {
            editorPreferencesStore.setPageWidth('full');
          }
        }
      ]
    },
    { type: 'divider' },
    {
      value: 'theme',
      label: '主题',
      selected: false,
      children: [
        {
          value: 'light',
          label: '浅色模式',
          selected: settingStore.theme === 'light',
          onClick: () => {
            settingStore.setTheme('light');
          }
        },
        {
          value: 'dark',
          label: '深色模式',
          selected: settingStore.theme === 'dark',
          onClick: () => {
            settingStore.setTheme('dark');
          }
        },
        {
          value: 'system',
          label: '跟随系统',
          selected: settingStore.theme === 'system',
          onClick: () => {
            settingStore.setTheme('system');
          }
        }
      ]
    }
  ]);

  const cleanup = registerShortcuts(toolbarViewOptions.value);
  onUnmounted(cleanup);

  return { toolbarViewOptions };
}
