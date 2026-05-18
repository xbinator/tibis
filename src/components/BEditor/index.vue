<!--
  @file index.vue
  @description 统一编辑器入口组件，负责根据文件扩展名选择 Markdown 或 Monaco 实现并对外维持统一协议。
-->
<template>
  <div v-if="editorKind === 'markdown'" ref="layoutRef" class="b-markdown-layout">
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

  <BMonaco
    v-else
    ref="monacoEditorRef"
    v-model:value="editorState.content"
    :editor-state="editorState"
    language="json"
    :editable="editable"
    @editor-blur="emit('editor-blur', $event)"
  />
</template>

<script setup lang="ts">
import type { BMarkdownPublicInstance, EditorController, EditorSearchState } from './adapters/types';
import type { AnchorRecord } from './hooks/useAnchors';
import type { EditorState } from './types';
import type { CSSProperties } from 'vue';
import { computed, ref, toRef } from 'vue';
import BMonaco from '@/components/BMonaco/index.vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { handleEditorAnchorNavigation } from './adapters/editorAnchorNavigation';
import FindBar from './components/FindBar.vue';
import PaneRichEditor from './components/PaneRichEditor.vue';
import PaneSourceEditor from './components/PaneSourceEditor.vue';
import QuickActions from './components/QuickActions.vue';
import Sidebar from './components/Sidebar.vue';
import { resolveEditorKind } from './constants/resolver';
import { useAnchors } from './hooks/useAnchors';
import { useEditorController } from './hooks/useEditorController';

const layoutRef = ref<HTMLElement | null>(null);
const scrollbarRef = ref<InstanceType<typeof BScrollbar> | null>(null);
const editorPreferencesStore = useEditorPreferencesStore();

/**
 * BEditor 组件入参。
 */
interface Props {
  /** 是否可编辑。 */
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true
});

const emit = defineEmits(['rename-file', 'save', 'save-as', 'copy-path', 'show-in-folder', 'editor-blur']);

/**
 * 编辑器状态数据项，包含内容、文件名、路径等信息。
 */
const editorState = defineModel<EditorState>('value', { default: () => ({ content: '', name: '', path: '', id: '', ext: '' }) });

const editable = toRef(props, 'editable');
const editorKind = computed(() => resolveEditorKind(editorState.value.ext));
const isRichMode = computed<boolean>(() => editorPreferencesStore.viewMode === 'rich');
const showOutline = ref(false);
const outlineContent = defineModel<string>('outlineContent', { default: '' });
const richEditorPaneRef = ref<(EditorController & { recomputeSelectionOverlays?: () => void }) | null>(null);
const sourceEditorPaneRef = ref<EditorController | null>(null);
const monacoEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);
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
const markdownEditorController = useEditorController({ isRichMode, richEditorPaneRef, sourceEditorPaneRef });

/**
 * 统一读取当前活动的编辑器控制器。
 * @returns 当前编辑器控制器
 */
function getEditorController(): EditorController | null {
  if (editorKind.value === 'monaco') {
    return monacoEditorRef.value;
  }

  return markdownEditorController.value;
}

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

/**
 * 将富文本搜索命中滚动到可视区域中心。
 * @param targetElement - 目标匹配元素
 */
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

/**
 * 将源码锚点滚动到目标位置。
 * @param hostElement - 锚点宿主元素
 * @param offsetTop - 顶部偏移
 */
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

/**
 * 处理大纲锚点切换。
 * @param record - 当前锚点记录
 */
function handleEditorAnchorChange(record: AnchorRecord): void {
  handleEditorAnchorNavigation({
    record,
    isRichMode: isRichMode.value,
    setActiveAnchorId,
    scrollToTop: () => scrollbarRef.value?.scrollTo({ top: 0, behavior: 'auto' }),
    scrollRichAnchor: handleChangeAnchor,
    scrollEditorAnchor: markdownEditorController.value.scrollToAnchor
  });
}

/**
 * 响应 Markdown 编辑器滚动并同步活跃锚点。
 */
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

  setActiveAnchorId(markdownEditorController.value.getActiveAnchorId(scrollElement, 100));
}

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
    if (editorKind.value === 'monaco') {
      return false;
    }

    return markdownEditorController.value.scrollToAnchor(anchorId);
  },
  getActiveAnchorId(scrollContainer: HTMLElement, thresholdPx: number): string {
    if (editorKind.value === 'monaco') {
      return '';
    }

    return markdownEditorController.value.getActiveAnchorId(scrollContainer, thresholdPx);
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
