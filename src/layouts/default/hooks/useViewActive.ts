/**
 * @file useViewActive.ts
 * @description 默认布局视图菜单 hook，负责组装视图相关菜单项与快捷键注册。
 */
import { computed, onUnmounted } from 'vue';
import type { ComputedRef } from 'vue';
import { useToolbarShortcuts } from '@/components/BToolbar/hooks/useToolbarShortcuts';
import type { ToolbarOptions } from '@/components/BToolbar/types';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { useSettingStore } from '@/stores/ui/setting';
import { getPresetList } from '@/theme';
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
    {
      value: 'outline',
      label: '大纲',
      selected: editorPreferencesStore.showOutline,
      onClick: () => {
        editorPreferencesStore.setShowOutline(!editorPreferencesStore.showOutline);
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
      label: '配色方案',
      selected: false,
      children: [
        {
          value: 'system',
          label: '跟随系统',
          selected: settingStore.theme === 'system',
          onClick: () => {
            settingStore.setTheme('system');
          }
        },
        {
          value: 'light',
          label: '浅色主题',
          selected: settingStore.theme === 'light',
          onClick: () => {
            settingStore.setTheme('light');
          }
        },
        {
          value: 'dark',
          label: '深色主题',
          selected: settingStore.theme === 'dark',
          onClick: () => {
            settingStore.setTheme('dark');
          }
        },
        { type: 'divider' },
        {
          value: 'preset',
          label: '主题风格',
          selected: false,
          children: getPresetList().map((p) => ({
            value: p.id,
            label: p.label,
            selected: settingStore.themePreset === p.id,
            onClick: () => {
              settingStore.setThemePreset(p.id);
            }
          }))
        }
      ]
    }
  ]);

  const cleanup = registerShortcuts(toolbarViewOptions.value);
  onUnmounted(cleanup);

  return { toolbarViewOptions };
}
