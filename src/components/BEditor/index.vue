<!--
  @file index.vue
  @description 统一编辑器入口组件，负责根据文件扩展名选择 Markdown 或 Monaco 实现并对外维持统一协议。
-->
<template>
  <Markdown
    v-if="editorKind === 'markdown'"
    ref="markdownRef"
    v-model:content="editorState.content"
    v-model:outline-content="outlineContent"
    :editor-state="editorState"
    :editable="editable"
    @editor-blur="emit('editor-blur', $event)"
    @rename-file="emit('rename-file')"
    @save="emit('save')"
    @save-as="emit('save-as')"
    @copy-path="emit('copy-path')"
    @show-in-folder="emit('show-in-folder')"
  />

  <BMonaco
    v-else
    ref="monacoEditorRef"
    v-model:value="editorState.content"
    :editor-state="editorState"
    :language="monacoLanguage"
    :editable="editable"
    @editor-blur="emit('editor-blur', $event)"
  />
</template>

<script setup lang="ts">
import type { EditorController, EditorSearchState, EditorState } from './types';
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import { editorToolContextRegistry } from '@/ai/tools/context/editor';
import BMonaco from '@/components/BMonaco/index.vue';
import { resolveEditorKind, resolveMonacoLanguage } from './constants/resolver';
import { createEditorToolContext } from './hooks/useEditorToolContext';
import Markdown from './Markdown.vue';

const monacoEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);
const markdownRef = ref<InstanceType<typeof Markdown> | null>(null);

/**
 * BEditor 组件入参。
 */
interface Props {
  /** 是否可编辑。 */
  editable?: boolean;
  /** 当前编辑器是否处于活跃状态。 */
  active?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  active: true
});

const emit = defineEmits(['rename-file', 'save', 'save-as', 'copy-path', 'show-in-folder', 'editor-blur']);

/**
 * 编辑器状态数据项，包含内容、文件名、路径等信息。
 */
const editorState = defineModel<EditorState>('value', { default: () => ({ content: '', name: '', path: '', id: '', ext: '' }) });

const editable = toRef(props, 'editable');
const editorKind = computed(() => resolveEditorKind(editorState.value.ext));
const monacoLanguage = computed(() => resolveMonacoLanguage(editorState.value.ext));
const outlineContent = defineModel<string>('outlineContent', { default: '' });
const lastRegisteredDocumentId = ref('');

/**
 * 统一读取当前活动的编辑器控制器。
 * @returns 当前编辑器控制器
 */
function getEditorController(): EditorController | null {
  if (editorKind.value === 'monaco') {
    return monacoEditorRef.value;
  }

  return markdownRef.value?.editorController ?? null;
}

/**
 * 注销已注册的编辑器工具上下文。
 */
function unregisterEditorToolContext(): void {
  if (!lastRegisteredDocumentId.value) {
    return;
  }

  editorToolContextRegistry.unregister(lastRegisteredDocumentId.value);
  lastRegisteredDocumentId.value = '';
}

/**
 * 根据当前激活的编辑器实例注册统一工具上下文。
 */
function registerEditorToolContext(): void {
  const editorInstance = getEditorController();
  const documentId = editorState.value.id;

  unregisterEditorToolContext();

  if (!props.active || !editorInstance || !documentId) {
    return;
  }

  editorToolContextRegistry.register(
    documentId,
    createEditorToolContext({
      fileState: editorState.value,
      editorInstance
    })
  );
  lastRegisteredDocumentId.value = documentId;
}

watch(
  [
    () => props.active,
    editorKind,
    () => markdownRef.value?.editorController,
    () => editorState.value.id,
    () => editorState.value.name,
    () => editorState.value.path,
    () => editorState.value.ext,
    monacoEditorRef
  ],
  (): void => {
    registerEditorToolContext();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  unregisterEditorToolContext();
});

function setContent(text: string): void {
  editorState.value = { ...editorState.value, content: text };
}

function undo(): void {
  getEditorController()?.undo();
}

function redo(): void {
  getEditorController()?.redo();
}

function canUndo(): boolean {
  return getEditorController()?.canUndo() ?? false;
}

function canRedo(): boolean {
  return getEditorController()?.canRedo() ?? false;
}

function setSearchTerm(term: string): void {
  getEditorController()?.setSearchTerm(term);
}

function findNext(): void {
  getEditorController()?.findNext();
}

function findPrevious(): void {
  getEditorController()?.findPrevious();
}

function clearSearch(): void {
  getEditorController()?.clearSearch();
}

function getSelection(): ReturnType<EditorController['getSelection']> {
  return getEditorController()?.getSelection() ?? null;
}

async function insertAtCursor(content: string): Promise<void> {
  await getEditorController()?.insertAtCursor(content);
}

async function replaceSelection(content: string): Promise<void> {
  await getEditorController()?.replaceSelection(content);
}

async function replaceDocument(content: string): Promise<void> {
  await getEditorController()?.replaceDocument(content);
}

function focusEditor(): void {
  getEditorController()?.focusEditor();
}

function focusEditorAtStart(): void {
  getEditorController()?.focusEditorAtStart();
}

function getSearchState(): EditorSearchState {
  return getEditorController()?.getSearchState() ?? { currentIndex: 0, matchCount: 0, term: '' };
}

/**
 * 按源码行号选中并滚动到对应范围。
 * @param startLine - 起始行号（1-based）
 * @param endLine - 结束行号（1-based）
 * @returns 是否成功设置选区
 */
async function selectLineRange(startLine: number, endLine: number): Promise<boolean> {
  return getEditorController()?.selectLineRange(startLine, endLine) ?? false;
}

defineExpose({
  setContent,
  undo,
  redo,
  canUndo,
  canRedo,
  focusEditorAtStart,
  setSearchTerm,
  findNext,
  findPrevious,
  clearSearch,
  focusEditor,
  getSelection,
  insertAtCursor,
  replaceSelection,
  replaceDocument,
  selectLineRange,
  getSearchState,
  scrollToAnchor(anchorId: string): boolean {
    if (editorKind.value === 'monaco') {
      return false;
    }

    return markdownRef.value?.scrollToAnchor(anchorId) ?? false;
  },
  getActiveAnchorId(scrollContainer: HTMLElement, thresholdPx: number): string {
    if (editorKind.value === 'monaco') {
      return '';
    }

    return markdownRef.value?.getActiveAnchorId(scrollContainer, thresholdPx) ?? '';
  }
});
</script>
