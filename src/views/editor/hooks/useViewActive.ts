import { computed, ref } from 'vue';
import type { BEditorViewMode } from '@/components/BEditor/types';
import type { Props as ToolbarProps } from '@/components/Toolbar.vue';

interface EditorViewState {
  mode: BEditorViewMode;
  showOutline: boolean;
}

export function useViewActive() {
  const viewState = ref<EditorViewState>({
    mode: 'rich',
    showOutline: true
  });

  const canShowOutline = computed<boolean>(() => viewState.value.mode === 'rich');

  const toolbarViewOptions = computed<ToolbarProps['options']>(() => [
    {
      value: 'source',
      label: '源代码模式',
      selected: viewState.value.mode === 'source',
      onClick: () => {
        viewState.value.mode = viewState.value.mode === 'source' ? 'rich' : 'source';
      }
    },
    {
      value: 'outline',
      label: '大纲',
      selected: canShowOutline.value && viewState.value.showOutline,
      disabled: !canShowOutline.value,
      onClick: () => {
        if (!canShowOutline.value) {
          return;
        }

        viewState.value.showOutline = !viewState.value.showOutline;
      }
    }
  ]);

  return { viewState, toolbarViewOptions };
}
