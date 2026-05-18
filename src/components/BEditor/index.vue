<!--
  @file index.vue
  @description 通用编辑器入口组件，首期承载 JSON 文件的 Monaco 编辑分支并对外维持统一协议。
-->
<template>
  <PaneMonacoEditor
    v-if="monacoLanguage"
    ref="monacoEditorRef"
    v-model:value="editorState.content"
    :editor-state="editorState"
    :language="monacoLanguage"
    :editable="props.editable"
    @editor-blur="emit('editor-blur', $event)"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EditorController } from '@/components/BMarkdown/adapters/types';
import type { EditorState } from '@/components/BMarkdown/types';
import PaneMonacoEditor from './components/PaneMonacoEditor.vue';

interface Props {
  /** 是否允许编辑。 */
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true
});

const emit = defineEmits<{
  /**
   * 编辑器整体失焦。
   * @param event - 事件名
   * @param eventObject - 失焦事件
   */
  (event: 'editor-blur', eventObject: FocusEvent): void;
  /**
   * 以下事件保持与 BMarkdown 容器同形，首期 JSON 分支不主动发出。
   */
  (event: 'rename-file'): void;
  (event: 'save'): void;
  (event: 'save-as'): void;
  (event: 'copy-path'): void;
  (event: 'show-in-folder'): void;
}>();

const editorState = defineModel<EditorState>('value', {
  default: () => ({ content: '', name: '', path: null, id: '', ext: '' })
});

const monacoEditorRef = ref<InstanceType<typeof PaneMonacoEditor> | null>(null);

/**
 * 解析当前文件的 Monaco 语言标识。
 */
const monacoLanguage = computed<string | null>(() => {
  switch (editorState.value.ext) {
    case 'json':
      return 'json';
    default:
      return null;
  }
});

/**
 * 读取当前 Monaco 编辑器实例。
 * @returns 统一编辑器协议实例
 */
function getMonacoEditor(): EditorController | null {
  return monacoEditorRef.value;
}

defineExpose<EditorController>({
  undo: (): void => getMonacoEditor()?.undo(),
  redo: (): void => getMonacoEditor()?.redo(),
  canUndo: (): boolean => getMonacoEditor()?.canUndo() ?? false,
  canRedo: (): boolean => getMonacoEditor()?.canRedo() ?? false,
  focusEditor: (): void => getMonacoEditor()?.focusEditor(),
  focusEditorAtStart: (): void => getMonacoEditor()?.focusEditorAtStart(),
  setSearchTerm: (term: string): void => getMonacoEditor()?.setSearchTerm(term),
  findNext: (): void => getMonacoEditor()?.findNext(),
  findPrevious: (): void => getMonacoEditor()?.findPrevious(),
  clearSearch: (): void => getMonacoEditor()?.clearSearch(),
  getSelection: () => getMonacoEditor()?.getSelection() ?? null,
  insertAtCursor: async (content: string): Promise<void> => getMonacoEditor()?.insertAtCursor(content),
  replaceSelection: async (content: string): Promise<void> => getMonacoEditor()?.replaceSelection(content),
  replaceDocument: async (content: string): Promise<void> => getMonacoEditor()?.replaceDocument(content),
  selectLineRange: (startLine: number, endLine: number) => getMonacoEditor()?.selectLineRange(startLine, endLine) ?? false,
  getSearchState: () => getMonacoEditor()?.getSearchState() ?? { currentIndex: 0, matchCount: 0, term: '' },
  scrollToAnchor: (): boolean => false,
  getActiveAnchorId: (): string => ''
});
</script>
