import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import type { ToolbarOptions } from '@/components/BToolbar/types';
import { local } from '@/shared/storage/base';
import { useEditorStore } from '@/stores/editor';
import { useSettingStore } from '@/stores/setting';
import { EditorShortcuts } from '../constants/shortcuts';

const STORAGE_KEY = 'editor_viewState';

function saveViewState(state: { mode: string; showOutline: boolean }): void {
  local.setItem(STORAGE_KEY, state);
}

export function useViewActive() {
  const editorStore = useEditorStore();
  const { viewState } = storeToRefs(editorStore);
  const settingStore = useSettingStore();

  const canShowOutline = computed<boolean>(() => viewState.value.mode === 'rich');

  const toolbarViewOptions = computed<ToolbarOptions>(() => [
    {
      value: 'source',
      label: '源代码模式',
      shortcut: EditorShortcuts.VIEW_SOURCE,
      selected: viewState.value.mode === 'source',
      onClick: () => {
        viewState.value.mode = viewState.value.mode === 'source' ? 'rich' : 'source';
        saveViewState(viewState.value);
      }
    },
    {
      value: 'outline',
      label: '大纲',
      selected: canShowOutline.value && viewState.value.showOutline,
      disabled: !canShowOutline.value,
      onClick: () => {
        viewState.value.showOutline = !viewState.value.showOutline;
        saveViewState(viewState.value);
      }
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

  return { viewState, toolbarViewOptions };
}
