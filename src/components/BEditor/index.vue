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
          :on-selection-host-change="handleRichSelectionHostChange"
          :on-selection-overlay-change="recomputeSelectionOverlays"
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
          :on-selection-host-change="handleSourceSelectionHostChange"
          :on-selection-overlay-change="recomputeSelectionOverlays"
          @editor-blur="handleEditorBlur"
        />

        <SelectionToolbarRich
          v-if="isRichMode && selectionToolbarKind === 'rich' && currentRichSelectionHost?.editor"
          :editor="currentRichSelectionHost.editor"
          :visible="selectionAssistant.toolbarVisible.value"
          :position="selectionAssistant.toolbarPosition.value"
          :overlay-root="currentRichSelectionHost.overlayRoot"
          :format-buttons="formatButtons"
          @ai="selectionAssistant.openAIInput()"
          @reference="selectionAssistant.insertReference()"
        />

        <SelectionToolbarSource
          v-else-if="!isRichMode && selectionToolbarKind === 'source'"
          :visible="selectionAssistant.toolbarVisible.value"
          :position="selectionAssistant.toolbarPosition.value"
          :overlay-root="currentSourceSelectionHost?.overlayRoot"
          :format-buttons="[]"
          @ai="selectionAssistant.openAIInput()"
          @reference="selectionAssistant.insertReference()"
        />

        <SelectionAIInput
          :visible="selectionAssistant.aiInputVisible.value"
          :adapter="currentSelectionAdapter"
          :selection-range="selectionAssistant.cachedSelectionRange.value"
          :position="selectionAssistant.panelPosition.value"
          @update:visible="handleSelectionAIVisibleChange"
          @apply="selectionAssistant.applyAIResult($event)"
          @streaming-change="selectionAssistant.setStreaming($event)"
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
import type { SelectionAssistantAdapter, SelectionToolbarAction } from './adapters/selectionAssistant';
import type { AnchorRecord } from './hooks/useAnchors';
import type { EditorController, EditorPublicInstance, EditorSearchState, EditorState } from './types';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';
import type { CSSProperties } from 'vue';
import { computed, onBeforeUnmount, ref, shallowRef, toRef, watch } from 'vue';
import { editorToolContextRegistry } from '@/ai/tools/editor-context';
import BMonaco from '@/components/BMonaco/index.vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { handleEditorAnchorNavigation } from './adapters/editorAnchorNavigation';
import Sidebar from './components/Sidebar.vue';
import { resolveEditorKind } from './constants/resolver';
import { useAnchors } from './hooks/useAnchors';
import { useEditorController } from './hooks/useEditorController';
import { createEditorToolContext } from './hooks/useEditorToolContext';
import { useSelectionAssistant } from './hooks/useSelectionAssistant';
import PaneRichEditor from './panes/PaneRichEditor.vue';
import PaneSourceEditor from './panes/PaneSourceEditor.vue';
import FindBar from './shared/FindBar.vue';
import QuickActions from './shared/QuickActions.vue';
import SelectionAIInput from './shared/SelectionAIInput.vue';
import SelectionToolbarRich from './shared/SelectionToolbarRich.vue';
import SelectionToolbarSource from './shared/SelectionToolbarSource.vue';

const layoutRef = ref<HTMLElement | null>(null);
const scrollbarRef = ref<InstanceType<typeof BScrollbar> | null>(null);
const editorPreferencesStore = useEditorPreferencesStore();

/**
 * BEditor 组件入参。
 */
interface Props {
  /** 是否可编辑。 */
  editable?: boolean;
  /** 当前编辑器是否处于活跃状态。 */
  active?: boolean;
}

/**
 * Rich 模式选区宿主状态。
 */
interface RichSelectionHostState {
  /** 当前浮层根节点 */
  overlayRoot: HTMLElement | null;
  /** 当前选区适配器 */
  adapter: SelectionAssistantAdapter | null;
  /** 当前 Tiptap 编辑器实例 */
  editor: TiptapEditor | null;
}

/**
 * Source 模式选区宿主状态。
 */
interface SourceSelectionHostState {
  /** 当前浮层根节点 */
  overlayRoot: HTMLElement | null;
  /** 当前选区适配器 */
  adapter: SelectionAssistantAdapter | null;
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
const isRichMode = computed<boolean>(() => editorPreferencesStore.viewMode === 'rich');
const showOutline = ref(false);
const outlineContent = defineModel<string>('outlineContent', { default: '' });
const richEditorPaneRef = ref<(EditorController & { recomputeSelectionOverlays?: () => void }) | null>(null);
const sourceEditorPaneRef = ref<EditorController | null>(null);
const monacoEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);
const findBarVisible = ref(false);
const lastRegisteredDocumentId = ref('');
const currentRichSelectionHost = shallowRef<RichSelectionHostState | null>(null);
const currentSourceSelectionHost = shallowRef<SourceSelectionHostState | null>(null);

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
const currentSelectionAdapter = computed<SelectionAssistantAdapter | null>(() => {
  if (editorKind.value !== 'markdown') {
    return null;
  }

  return isRichMode.value ? currentRichSelectionHost.value?.adapter ?? null : currentSourceSelectionHost.value?.adapter ?? null;
});
const selectionToolbarKind = computed<'rich' | 'source' | null>(() => {
  if (editorKind.value !== 'markdown') {
    return null;
  }

  return isRichMode.value ? 'rich' : 'source';
});
const selectionAssistant = useSelectionAssistant({
  adapter: () => currentSelectionAdapter.value,
  isEditable: () => editable.value
});

/** Rich 模式格式按钮列表。 */
const formatButtons = computed(() => [
  { command: 'bold' as SelectionToolbarAction, icon: 'lucide:bold' },
  { command: 'italic' as SelectionToolbarAction, icon: 'lucide:italic' },
  { command: 'underline' as SelectionToolbarAction, icon: 'lucide:underline' },
  { command: 'strike' as SelectionToolbarAction, icon: 'lucide:strikethrough' },
  { command: 'link' as SelectionToolbarAction, icon: 'lucide:link' },
  { command: 'code' as SelectionToolbarAction, icon: 'lucide:code' }
]);

/**
 * 接收 Rich pane 回传的选区宿主状态。
 * @param payload - 当前选区宿主状态
 */
function handleRichSelectionHostChange(payload: RichSelectionHostState | null): void {
  currentRichSelectionHost.value = payload;
}

/**
 * 接收 Source pane 回传的选区宿主状态。
 * @param payload - 当前选区宿主状态
 */
function handleSourceSelectionHostChange(payload: SourceSelectionHostState | null): void {
  currentSourceSelectionHost.value = payload;
}

/**
 * 请求重算当前选区浮层位置。
 */
function recomputeSelectionOverlays(): void {
  selectionAssistant.recomputeAllPositions();
}

/**
 * 处理 AI 输入层显隐变化。
 * @param visible - 最新显隐状态
 */
function handleSelectionAIVisibleChange(visible: boolean): void {
  if (!visible) {
    selectionAssistant.closeAIInput();
  }
}

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
    () => isRichMode.value,
    () => editorState.value.id,
    () => editorState.value.name,
    () => editorState.value.path,
    () => editorState.value.ext,
    richEditorPaneRef,
    sourceEditorPaneRef,
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
    recomputeSelectionOverlays();
    return;
  }

  const scrollElement = scrollbarRef.value?.getScrollElement();
  if (!scrollElement) {
    return;
  }

  if (scrollElement.scrollTop < 50) {
    setActiveAnchorId('');
    recomputeSelectionOverlays();
    return;
  }

  setActiveAnchorId(markdownEditorController.value.getActiveAnchorId(scrollElement, 100));
  recomputeSelectionOverlays();
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

const editorPublicInstance = computed<EditorPublicInstance>(() => ({
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
