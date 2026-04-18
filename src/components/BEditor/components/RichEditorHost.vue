<template>
  <PaneRichEditor
    v-model:front-matter-data="frontMatterModel"
    :editor="editorInstance"
    :editor-id="editorInstanceId"
    :should-show-front-matter-card="shouldShowFrontMatterCard"
  />
</template>

<script setup lang="ts">
import type { EditorController, EditorSearchState } from '../adapters/types';
import type { SearchScrollContext } from '../extensions/Search';
import type { FrontMatterData } from '../hooks/useFrontMatter';
import { computed, toRef, watch } from 'vue';
import { getSearchSnapshot } from '../extensions/Search';
import { useFrontMatter } from '../hooks/useFrontMatter';
import { useRichEditor } from '../hooks/useRichEditor';
import PaneRichEditor from './PaneRichEditor.vue';

interface Props {
  editable?: boolean;
  editorId?: string;
  onSearchMatchElementFocus?: (targetElement: HTMLElement) => void;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  editorId: '',
  onSearchMatchElementFocus: undefined
});

const editorContent = defineModel<string>('value', { default: '' });
const outlineContent = defineModel<string>('outlineContent', { default: '' });

const editorInstanceId = computed<string>(() => `${props.editorId || ''}`);

const { bodyContent, frontMatterData, hasFrontMatter, updateFrontMatter, reconstructContent } = useFrontMatter(editorContent);

const shouldShowFrontMatterCard = computed<boolean>(() => Boolean(hasFrontMatter.value));

function syncToExternal(): void {
  const nextContent = reconstructContent();
  if (editorContent.value !== nextContent) {
    editorContent.value = nextContent;
  }
}

function handleSearchMatchFocus({ targetElement }: SearchScrollContext): void {
  if (targetElement instanceof HTMLElement) {
    props.onSearchMatchElementFocus?.(targetElement);
  }
}

const { editorInstance } = useRichEditor({
  bodyContent,
  editable: toRef(props, 'editable'),
  editorInstanceId,
  onContentChange: syncToExternal,
  onSearchMatchFocus: handleSearchMatchFocus
});

const frontMatterModel = computed<FrontMatterData>({
  get(): FrontMatterData {
    return frontMatterData.value;
  },
  set(data: FrontMatterData): void {
    updateFrontMatter(data);
    syncToExternal();
  }
});

watch(
  bodyContent,
  (content: string): void => {
    outlineContent.value = content;
  },
  { immediate: true }
);

function setContent(text: string): void {
  editorContent.value = text;
}

function undo(): void {
  editorInstance.value?.commands.undo();
}

function redo(): void {
  editorInstance.value?.commands.redo();
}

function canUndo(): boolean {
  return Boolean(editorInstance.value?.can().undo());
}

function canRedo(): boolean {
  return Boolean(editorInstance.value?.can().redo());
}

function focusEditor(): void {
  editorInstance.value?.commands.focus();
}

function focusEditorAtStart(): void {
  editorInstance.value?.commands.focus('start');
}

function setSearchTerm(term: string): void {
  editorInstance.value?.commands.setSearchTerm(term);
}

function findNext(): void {
  editorInstance.value?.commands.findNext();
}

function findPrevious(): void {
  editorInstance.value?.commands.findPrevious();
}

function clearSearch(): void {
  editorInstance.value?.commands.clearSearch();
}

function getSearchState(): EditorSearchState {
  return getSearchSnapshot(editorInstance.value);
}

function scrollToAnchor(): boolean {
  return false;
}

function getActiveAnchorId(): string {
  return '';
}

const controller: EditorController & { setContent: (text: string) => void } = {
  undo,
  redo,
  canUndo,
  canRedo,
  focusEditor,
  focusEditorAtStart,
  setSearchTerm,
  findNext,
  findPrevious,
  clearSearch,
  getSearchState,
  scrollToAnchor,
  getActiveAnchorId,
  setContent
};

defineExpose(controller);
</script>
