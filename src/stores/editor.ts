import { ref, reactive, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { useStorage } from '@vueuse/core';
import type { BEditorPublicInstance, BEditorViewMode } from '@/components/BEditor/types';
import type { EditorFile } from '@/layouts/default/types';
import { local } from '@/shared/storage/base';

export interface EditorViewState {
  mode: BEditorViewMode;
  showOutline: boolean;
}

const VIEW_STATE_KEY = 'editor_viewState';

export const useEditorStore = defineStore('editor', () => {
  const fileState = ref<EditorFile>({ id: '', path: '', content: '', name: '', ext: 'md' });
  const visible = reactive({ shortcuts: false });
  const sidebarState = useStorage('editor-sidebar-state', { visible: false, width: 300 });
  const viewState = ref<EditorViewState>(local.getItem<EditorViewState>(VIEW_STATE_KEY) ?? { mode: 'rich', showOutline: true });
  const editorInstance = shallowRef<BEditorPublicInstance | null>(null);

  return { fileState, visible, sidebarState, viewState, editorInstance };
});
