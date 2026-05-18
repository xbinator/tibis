<!--
  @file index.vue
  @description Markdown 编辑器外层容器，负责统一编排正文区、大纲、查找条和富文本/源码双模式切换。
-->
<template>
  <div ref="layoutRef" class="b-markdown-layout">
    <Sidebar
      v-if="showOutline"
      :title="editorState.name"
      :content="outlineContent"
      :anchor-id-prefix="editorState.id"
      :active-id="activeAnchorId"
      @change="handleEditorAnchorChange"
    />

    <BScrollbar ref="scrollbarRef" class="b-markdown-scrollbar" @scroll="handleEditorScrollEvent">
      <div class="b-markdown-container" :style="editorContainerStyle">
        <PaneRichEditor
          v-if="isRichMode"
          ref="richEditorPaneRef"
          v-model:value="editorState.content"
          v-model:outline-content="outlineContent"
          :editor-state="editorState"
          :editable="editable"
          :on-search-match-element-focus="scrollSearchMatchElementIntoView"
          @editor-blur="handleEditorBlur"
        />

        <PaneSourceEditor
          v-else
          ref="sourceEditorPaneRef"
          v-model:value="editorState.content"
          v-model:outline-content="outlineContent"
          :editor-id="editorState.id"
          :editor-state="editorState"
          :on-anchor-scroll="scrollSourceAnchorIntoView"
          :editable="editable"
          @editor-blur="handleEditorBlur"
        />
      </div>

      <QuickActions
        v-model:show-outline="showOutline"
        :file-path="editorState.path"
        @rename-file="emit('rename-file')"
        @save="emit('save')"
        @save-as="emit('save-as')"
        @copy-path="emit('copy-path')"
        @show-in-folder="emit('show-in-folder')"
      />

      <FindBar v-model:visible="findBarVisible" :editor-instance="editorPublicInstance" />
    </BScrollbar>
  </div>
</template>

<script setup lang="ts">
import type { BMarkdownPublicInstance, EditorController, EditorSearchState } from './adapters/types';
import type { AnchorRecord } from './hooks/useAnchors';
import type { EditorState } from './types';
import type { CSSProperties } from 'vue';
import { computed, defineAsyncComponent, ref } from 'vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { handleEditorAnchorNavigation } from './adapters/editorAnchorNavigation';
import FindBar from './components/FindBar.vue';
import QuickActions from './components/QuickActions.vue';
import Sidebar from './components/Sidebar.vue';
import { useAnchors } from './hooks/useAnchors';
import { useEditorController } from './hooks/useEditorController';

const PaneRichEditor = defineAsyncComponent(() => import('./components/PaneRichEditor.vue'));
const PaneSourceEditor = defineAsyncComponent(() => import('./components/PaneSourceEditor.vue'));

const layoutRef = ref<HTMLElement | null>(null);
const scrollbarRef = ref<InstanceType<typeof BScrollbar> | null>(null);
const editorPreferencesStore = useEditorPreferencesStore();

/**
 * BMarkdown 组件入参。
 */
interface Props {
  /** 是否可编辑。 */
  editable?: boolean;
}

withDefaults(defineProps<Props>(), {
  editable: true
});

const emit = defineEmits(['rename-file', 'save', 'save-as', 'copy-path', 'show-in-folder', 'editor-blur']);

/**
 * Markdown 编辑器视图模式直接跟随编辑器偏好设置。
 */
const isRichMode = computed<boolean>(() => editorPreferencesStore.viewMode === 'rich');

const showOutline = ref(false);

/**
 * 编辑器状态数据项，包含内容、文件名、路径等信息
 */
const editorState = defineModel<EditorState>('value', { default: () => ({ content: '', name: '', path: '', id: '', ext: '' }) });

/**
 * 大纲内容
 */
const outlineContent = defineModel<string>('outlineContent', { default: '' });

const richEditorPaneRef = ref<(EditorController & { recomputeSelectionOverlays?: () => void }) | null>(null);
const sourceEditorPaneRef = ref<EditorController | null>(null);
const findBarVisible = ref(false);

const editorPageMaxWidth = computed<string>(() => {
  switch (editorPreferencesStore.pageWidth) {
    case 'wide':
      return '1200px';
    case 'full':
      return 'none';
    default:
      return '900px';
  }
});

const editorContainerStyle = computed<CSSProperties>(() => ({
  '--editor-page-max-width': editorPageMaxWidth.value
}));

const { activeAnchorId, handleChangeAnchor, handleEditorScroll, setActiveAnchorId } = useAnchors(layoutRef, scrollbarRef);

/**
 * 仅当焦点真正离开整个编辑器交互区域时，向外抛出统一的 editor-blur 事件。
 * @param event - 编辑器内部上抛的失焦事件
 */
function handleEditorBlur(event: FocusEvent): void {
  const nextTarget = event.relatedTarget;

  if (nextTarget instanceof Node && layoutRef.value?.contains(nextTarget)) {
    return;
  }

  emit('editor-blur', event);
}

function scrollSearchMatchElementIntoView(targetElement: HTMLElement): void {
  const scrollElement = scrollbarRef.value?.getScrollElement();
  if (!scrollElement) {
    targetElement.scrollIntoView({ block: 'center', inline: 'nearest' });
    return;
  }

  const scrollRect = scrollElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const centeredTop = scrollElement.scrollTop + (targetRect.top - scrollRect.top) - (scrollElement.clientHeight - targetRect.height) / 2;
  const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
  const nextTop = Math.min(Math.max(centeredTop, 0), maxScrollTop);

  scrollbarRef.value?.scrollTo({ top: nextTop, behavior: 'auto' });
}

const editorController = useEditorController({ isRichMode, richEditorPaneRef, sourceEditorPaneRef });

function scrollSourceAnchorIntoView(hostElement: HTMLElement, offsetTop: number): void {
  const scrollElement = scrollbarRef.value?.getScrollElement();
  if (!scrollElement) {
    hostElement.scrollIntoView({ block: 'start' });
    return;
  }

  const scrollRect = scrollElement.getBoundingClientRect();
  const hostRect = hostElement.getBoundingClientRect();
  const nextTop = scrollElement.scrollTop + (hostRect.top - scrollRect.top) + offsetTop;

  scrollbarRef.value?.scrollTo({ top: Math.max(0, nextTop), behavior: 'auto' });
}

function handleEditorAnchorChange(record: AnchorRecord): void {
  handleEditorAnchorNavigation({
    record,
    isRichMode: isRichMode.value,
    setActiveAnchorId,
    scrollToTop: () => scrollbarRef.value?.scrollTo({ top: 0, behavior: 'auto' }),
    scrollRichAnchor: handleChangeAnchor,
    scrollEditorAnchor: editorController.value.scrollToAnchor
  });
}

function handleEditorScrollEvent(): void {
  if (isRichMode.value) {
    handleEditorScroll();
    richEditorPaneRef.value?.recomputeSelectionOverlays?.();
    return;
  }

  const scrollElement = scrollbarRef.value?.getScrollElement();
  if (!scrollElement) {
    return;
  }

  if (scrollElement.scrollTop < 50) {
    setActiveAnchorId('');
    return;
  }

  setActiveAnchorId(editorController.value.getActiveAnchorId(scrollElement, 100));
}

function setContent(text: string): void {
  editorState.value = { ...editorState.value, content: text };
}

function undo(): void {
  editorController.value.undo();
}

function redo(): void {
  editorController.value.redo();
}

function canUndo(): boolean {
  return editorController.value.canUndo();
}

function canRedo(): boolean {
  return editorController.value.canRedo();
}

function setSearchTerm(term: string): void {
  editorController.value.setSearchTerm(term);
}

function findNext(): void {
  editorController.value.findNext();
}

function findPrevious(): void {
  editorController.value.findPrevious();
}

function clearSearch(): void {
  editorController.value.clearSearch();
}

function getSelection(): ReturnType<EditorController['getSelection']> {
  return editorController.value.getSelection();
}

async function insertAtCursor(content: string): Promise<void> {
  await editorController.value.insertAtCursor(content);
}

async function replaceSelection(content: string): Promise<void> {
  await editorController.value.replaceSelection(content);
}

async function replaceDocument(content: string): Promise<void> {
  await editorController.value.replaceDocument(content);
}

function focusEditor(): void {
  editorController.value.focusEditor();
}

function focusEditorAtStart(): void {
  editorController.value.focusEditorAtStart();
}

function getSearchState(): EditorSearchState {
  return editorController.value.getSearchState();
}

/**
 * 按源码行号选中并滚动到对应范围。
 * @param startLine - 起始行号（1-based）
 * @param endLine - 结束行号（1-based）
 * @returns 是否成功设置选区
 */
async function selectLineRange(startLine: number, endLine: number): Promise<boolean> {
  return editorController.value.selectLineRange(startLine, endLine);
}

const editorPublicInstance = computed<BMarkdownPublicInstance>(() => ({
  undo,
  redo,
  canUndo,
  canRedo,
  focusEditor,
  getSelection,
  insertAtCursor,
  replaceSelection,
  replaceDocument,
  selectLineRange,
  setSearchTerm,
  findNext,
  findPrevious,
  clearSearch,
  getSearchState
}));

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
    return editorController.value.scrollToAnchor(anchorId);
  },
  getActiveAnchorId(scrollContainer: HTMLElement, thresholdPx: number): string {
    return editorController.value.getActiveAnchorId(scrollContainer, thresholdPx);
  }
});
</script>

<style lang="less">
.b-markdown-layout {
  display: flex;
  gap: 6px;
  height: 100%;

  --selection-color: #000;
  --selection-bg: #ffef5c;
  --native-selection-color: var(--selection-color);
  --native-selection-bg: var(--selection-bg);

  ::selection {
    color: var(--native-selection-color);
    background: var(--native-selection-bg);
  }
}

.b-markdown-scrollbar {
  flex: 1;
  width: 0;
  background: var(--bg-primary);
  border-radius: 8px;
}

.b-markdown-container {
  position: relative;
  max-width: var(--editor-page-max-width);
  margin: 0 auto;
  font-size: 16px;
}

.b-markdown-title {
  display: block;
  width: 100%;
  padding: 20px 40px 0;
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--editor-text);
  cursor: text;
  resize: none;
  outline: none;
  background: transparent;
  border: none;

  &::placeholder {
    font-weight: 600;
    color: var(--editor-placeholder);
  }
}
</style>
