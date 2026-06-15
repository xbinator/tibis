<template>
  <div ref="overlayRootRef" :class="name" @click="handleEditorClick" @focusout="handleEditorFocusOut">
    <!-- Front Matter 卡片 -->
    <FrontMatterCard
      v-if="shouldShowFrontMatterCard"
      :data="frontMatterData"
      @click.stop
      @update="handleFrontMatterUpdate"
      @update-field="handleFrontMatterFieldUpdate"
      @remove-field="handleFrontMatterFieldRemove"
      @add-field="handleFrontMatterFieldAdd"
    />

    <!-- 当前选中块菜单 -->
    <CurrentBlockMenu v-if="!isLoadingRich && !isFailedRich" :editor="editorInstance" />

    <!-- Loading overlay -->
    <div v-if="isLoadingRich" class="b-markdown-rich__loading-overlay">
      <div class="b-markdown-rich__loading-content">
        <div class="b-markdown-rich__loading-spinner"></div>
      </div>
    </div>

    <!-- Failed overlay -->
    <div v-if="isFailedRich" class="b-markdown-rich__failed-overlay">
      <div class="b-markdown-rich__failed-content">
        <p class="b-markdown-rich__failed-message">{{ richLoadState.errorMessage }}</p>
        <div class="b-markdown-rich__failed-actions">
          <BButton size="small" @click="onRetryLoad">重试</BButton>
          <BButton size="small" @click="onSwitchToSource">切换到源码模式</BButton>
        </div>
      </div>
    </div>

    <!-- 编辑器内容 -->
    <EditorContent
      :key="editorState?.id"
      :editor="editorInstance ?? undefined"
      class="b-markdown-rich__content"
      :class="{ 'b-markdown-rich__content--loading': isLoadingRich }"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectionAssistantAdapter } from '../adapters/selectionAssistant';
import type { EditorController, EditorSearchState, EditorSelection as EditorSelectionRange } from '../adapters/types';
import type { SearchScrollContext } from '../extensions/editorSearch';
import type { FrontMatterData } from '../hooks/useFrontMatter';
import type { EditorState } from '../types';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';
import { computed, onBeforeUnmount, ref, shallowRef, toRef, watch } from 'vue';
import { EditorContent } from '@tiptap/vue-3';
import { useEventListener } from '@vueuse/core';
import { useNavigate } from '@/hooks/useNavigate';
import { createNamespace } from '@/utils/namespace';
import { findHeadingElementByHash, scrollHeadingIntoView } from '../adapters/richEditorAnchorLinks';
import { createRichSelectionAssistantAdapter } from '../adapters/richSelectionAssistant';
import { mapSourceLineRangeToProseMirrorRange } from '../adapters/sourceLineMapping';
import CurrentBlockMenu from '../components/CurrentBlockMenu.vue';
import FrontMatterCard from '../components/FrontMatterCard.vue';
import { setAISelectionHighlight } from '../extensions/aiRangeHighlight';
import { getSearchSnapshot } from '../extensions/editorSearch';
import { useFrontMatter } from '../hooks/useFrontMatter';
import { useRichEditor } from '../hooks/useRichEditor';
import { getPersistedMarkdown } from '../utils/editorMarkdown';

const [name] = createNamespace('', 'b-markdown-rich');

/**
 * Rich 模式回传给宿主的选区工具状态。
 */
interface RichSelectionHostPayload {
  /** 当前浮层根节点 */
  overlayRoot: HTMLElement | null;
  /** 当前选区适配器 */
  adapter: SelectionAssistantAdapter | null;
  /** 当前 Tiptap 编辑器实例 */
  editor: TiptapEditor | null;
}

interface Props {
  /** 编辑器是否可编辑 */
  editable?: boolean;
  /** 编辑器文件状态 */
  editorState?: EditorState;
  /** 搜索匹配元素聚焦回调 */
  onSearchMatchElementFocus?: (targetElement: HTMLElement) => void;
  /** 将选区工具宿主状态回传给上层统一编排 */
  onSelectionHostChange?: (payload: RichSelectionHostPayload | null) => void;
  /** 请求上层重算选区浮层位置 */
  onSelectionOverlayChange?: () => void;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  editorState: () => ({ content: '', name: '', path: '', id: '', ext: '' }),
  onSearchMatchElementFocus: undefined,
  onSelectionHostChange: undefined,
  onSelectionOverlayChange: undefined
});
const emit = defineEmits<{
  /**
   * 编辑器根区域发生失焦事件。
   */
  (e: 'editor-blur', event: FocusEvent): void;
  /**
   * 请求切换到源码模式。
   */
  (e: 'request-source-mode'): void;
}>();

const editorContent = defineModel<string>('value', { default: '' });
const outlineContent = defineModel<string>('outlineContent', { default: '' });

const navigate = useNavigate();
const overlayRootRef = ref<HTMLElement | null>(null);

const editorInstanceId = computed<string>(() => props.editorState?.id || '');

const { bodyContent, frontMatterData, hasFrontMatter, updateFrontMatter, reconstructContent } = useFrontMatter(editorContent);

const shouldShowFrontMatterCard = computed<boolean>(() => Boolean(hasFrontMatter.value));

/**
 * 同步内容到外部 model
 */
function syncToExternal(): void {
  const nextContent = reconstructContent();
  if (editorContent.value !== nextContent) {
    editorContent.value = nextContent;
  }
}

/**
 * 处理搜索匹配焦点事件
 * @param param0 - 搜索滚动上下文
 */
function handleSearchMatchFocus({ targetElement }: SearchScrollContext): void {
  if (targetElement instanceof HTMLElement) {
    props.onSearchMatchElementFocus?.(targetElement);
  }
}

const {
  editorInstance,
  loadState: richLoadState,
  retryLoad
} = useRichEditor({
  bodyContent,
  editable: toRef(props, 'editable'),
  editorInstanceId,
  onContentChange: syncToExternal,
  onSearchMatchFocus: handleSearchMatchFocus
});

const isLoadingRich = computed(() => richLoadState.value?.phase === 'loading');
const isFailedRich = computed(() => richLoadState.value?.phase === 'failed');

function onRetryLoad(): void {
  retryLoad();
}

function onSwitchToSource(): void {
  emit('request-source-mode');
}

/**
 * 将编辑区 focusout 事件统一转发给外层容器做语义过滤。
 * @param event - 当前失焦事件
 */
function handleEditorFocusOut(event: FocusEvent): void {
  emit('editor-blur', event);
}

/**
 * 处理富文本中的链接点击。
 * 文内 hash 链接优先在当前编辑器内跳转，其余链接继续走统一导航逻辑。
 * @param event - 当前点击事件
 */
function handleEditorClick(event: MouseEvent): void {
  const { target } = event;

  if (!(target instanceof Element)) {
    return;
  }

  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) {
    return;
  }

  const rawHref = anchor.getAttribute('href');
  if (!rawHref || !rawHref.startsWith('#')) {
    navigate.onLink(event);
    return;
  }

  const rootElement = overlayRootRef.value;
  if (!rootElement) {
    return;
  }

  const heading = findHeadingElementByHash(rootElement, rawHref);
  if (!heading) {
    return;
  }

  event.preventDefault();
  scrollHeadingIntoView(heading);
}

watch(
  bodyContent,
  (content: string): void => {
    outlineContent.value = content;
  },
  { immediate: true }
);

// ---- Adapter & Orchestration ----

const adapter = shallowRef<SelectionAssistantAdapter | null>(null);

watch(
  [editorInstance, overlayRootRef, () => props.editorState],
  ([editor, root, editorState]) => {
    if (editor && root) {
      adapter.value = createRichSelectionAssistantAdapter(editor, {
        editorState: editorState || { content: '', name: '', path: '', id: '', ext: '' },
        overlayRoot: root
      });
    } else {
      adapter.value = null;
    }
  },
  { immediate: true }
);

watch(
  [editorInstance, overlayRootRef, adapter],
  ([editor, root, nextAdapter]) => {
    if (editor) {
      props.onSelectionHostChange?.({
        overlayRoot: root,
        adapter: nextAdapter,
        editor
      });
      return;
    }

    props.onSelectionHostChange?.(null);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  props.onSelectionHostChange?.(null);
  adapter.value?.dispose?.();
  adapter.value = null;
});

// ---- Front Matter ----

/**
 * 处理 Front Matter 整体更新
 * @param data - 新的 Front Matter 数据
 */
function handleFrontMatterUpdate(data: FrontMatterData): void {
  updateFrontMatter(data);
  syncToExternal();
}

/**
 * 处理 Front Matter 字段更新
 * @param key - 字段名
 * @param value - 字段值
 */
function handleFrontMatterFieldUpdate(key: string, value: unknown): void {
  frontMatterData.value = { ...frontMatterData.value, [key]: value };
  syncToExternal();
}

/**
 * 处理 Front Matter 字段删除
 * @param key - 字段名
 */
function handleFrontMatterFieldRemove(key: string): void {
  const rest = Object.fromEntries(Object.entries(frontMatterData.value).filter(([k]) => k !== key));
  updateFrontMatter(rest);
  syncToExternal();
}

/**
 * 处理 Front Matter 字段添加
 * @param key - 字段名
 * @param value - 字段值
 */
function handleFrontMatterFieldAdd(key: string, value: unknown): void {
  if (key in frontMatterData.value) return;
  frontMatterData.value = { ...frontMatterData.value, [key]: value };
  syncToExternal();
}

/**
 * 统一编辑守卫
 * @throws Error 当 editable 为 false 或加载状态非 ready
 */
function guardEdit(): TiptapEditor {
  if (richLoadState.value?.phase !== 'ready' || !props.editable) {
    throw new Error(richLoadState.value?.phase === 'failed' ? '富文本加载失败，请重试或切换回源码模式' : '富文本正在加载，请稍后或切换到源码模式');
  }
  const instance = editorInstance.value;
  if (!instance) throw new Error('编辑器未初始化');
  return instance;
}

// ---- Editor Commands ----

/**
 * 设置编辑器内容
 * @param text - 新的编辑器内容
 */
function setContent(text: string): void {
  editorContent.value = text;
}

/**
 * 撤销操作
 */
function undo(): void {
  editorInstance.value?.commands.undo();
}

/**
 * 重做操作
 */
function redo(): void {
  editorInstance.value?.commands.redo();
}

/**
 * 判断是否可以撤销
 * @returns 是否可以撤销
 */
function canUndo(): boolean {
  return Boolean(editorInstance.value?.can().undo());
}

/**
 * 判断是否可以重做
 * @returns 是否可以重做
 */
function canRedo(): boolean {
  return Boolean(editorInstance.value?.can().redo());
}

/**
 * 聚焦编辑器
 */
function focusEditor(): void {
  editorInstance.value?.commands.focus();
}

/**
 * 聚焦编辑器起始位置
 */
function focusEditorAtStart(): void {
  editorInstance.value?.commands.focus('start');
}

/**
 * 设置搜索词
 * @param term - 搜索词
 */
function setSearchTerm(term: string): void {
  editorInstance.value?.commands.setSearchTerm(term);
}

/**
 * 查找下一个匹配项
 */
function findNext(): void {
  editorInstance.value?.commands.findNext();
}

/**
 * 查找上一个匹配项
 */
function findPrevious(): void {
  editorInstance.value?.commands.findPrevious();
}

/**
 * 清除搜索
 */
function clearSearch(): void {
  editorInstance.value?.commands.clearSearch();
}

/**
 * 获取当前选区
 * @returns 选区信息，无选区时返回 null
 */
function getSelection(): EditorSelectionRange | null {
  const selection = editorInstance.value?.state.selection;
  const document = editorInstance.value?.state.doc;
  if (!selection || !document || selection.from === selection.to) {
    return null;
  }

  return {
    from: selection.from,
    to: selection.to,
    text: document.textBetween(selection.from, selection.to, '')
  };
}

/**
 * 在光标位置插入 Markdown 内容
 * @param content - 要插入的 Markdown 文本
 */
async function insertAtCursor(content: string): Promise<void> {
  const instance = guardEdit();
  const { selection } = instance.state;
  instance.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, content, { contentType: 'markdown' }).run();
}

/**
 * 替换当前选中的内容
 * @param content - 用于替换的 Markdown 文本
 * @throws {Error} 当没有选中内容时抛出 NO_SELECTION 错误
 */
async function replaceSelection(content: string): Promise<void> {
  const instance = guardEdit();
  const { selection } = instance.state;
  if (selection.from === selection.to) {
    throw new Error('NO_SELECTION');
  }

  instance.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, content, { contentType: 'markdown' }).run();
}

/**
 * 替换整个文档内容
 * @param content - 新的 Markdown 文档内容
 */
async function replaceDocument(content: string): Promise<void> {
  const instance = guardEdit();
  instance.commands.setContent(content, { contentType: 'markdown' });
}

/**
 * 获取搜索状态
 * @returns 搜索状态
 */
function getSearchState(): EditorSearchState {
  return getSearchSnapshot(editorInstance.value);
}

/**
 * 按源码行号选中并滚动到对应范围。
 * @param startLine - 起始行号（1-based）
 * @param endLine - 结束行号（1-based）
 * @returns 是否成功设置选区
 */
async function selectLineRange(startLine: number, endLine: number): Promise<boolean> {
  const instance = guardEdit();
  const mappedRange = mapSourceLineRangeToProseMirrorRange(instance.state.doc, startLine, endLine, getPersistedMarkdown(instance));
  if (!mappedRange) {
    return false;
  }

  instance.commands.setTextSelection({
    from: mappedRange.from,
    to: mappedRange.to
  });
  setAISelectionHighlight(instance, {
    from: mappedRange.from,
    to: mappedRange.to
  });
  instance.commands.focus();
  return true;
}

/**
 * 滚动到锚点。
 * @param anchorId - 锚点 ID
 * @returns 是否成功滚动
 */
function scrollToAnchor(anchorId: string): boolean {
  const rootElement = overlayRootRef.value;
  if (!rootElement) {
    return false;
  }

  const heading = findHeadingElementByHash(rootElement, `#${anchorId}`);
  if (!heading) {
    return false;
  }

  scrollHeadingIntoView(heading);
  return true;
}

/**
 * 获取当前激活的锚点 ID
 * @returns 锚点 ID
 */
function getActiveAnchorId(): string {
  return '';
}

/**
 * 重新计算选区相关浮层位置。
 * rich 模式实际滚动发生在外层 BScrollbar 中，因此需要由宿主在容器滚动时主动触发重算。
 */
function recomputeSelectionOverlays(): void {
  props.onSelectionOverlayChange?.();
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
  getSelection,
  insertAtCursor,
  replaceSelection,
  replaceDocument,
  selectLineRange,
  getSearchState,
  scrollToAnchor,
  getActiveAnchorId,
  setContent
};

useEventListener(window, 'resize', () => {
  props.onSelectionOverlayChange?.();
});

defineExpose({
  ...controller,
  recomputeSelectionOverlays,
  richLoadState: computed(() => richLoadState.value)
});
</script>

<style lang="less">
@import url('@/assets/styles/markdown.less');

.b-markdown-rich {
  position: relative;
}

.b-markdown-rich__content {
  height: 100%;

  .ProseMirror {
    --native-selection-color: var(--selection-color);
    --native-selection-bg: var(--selection-bg);

    min-height: calc(100vh - 42px);
    padding: 20px 40px 90px;
    margin: 0;
    line-height: 1.74;
    color: var(--editor-text);
    caret-color: var(--editor-caret);
    outline: none;

    &::selection {
      color: var(--native-selection-color) !important;
      background: var(--native-selection-bg) !important;
      -webkit-text-fill-color: var(--native-selection-color) !important;
    }

    *::selection {
      color: var(--native-selection-color) !important;
      background: var(--native-selection-bg) !important;
      -webkit-text-fill-color: var(--native-selection-color) !important;
    }

    > *:first-child {
      margin-top: 0;
    }

    .search-match {
      background: var(--editor-search-highlight);
      border-radius: 2px;
    }

    .search-match-current {
      color: #000;
      background: var(--editor-search-active);
      box-shadow: var(--editor-search-active-border);
    }

    .ai-selection-highlight {
      color: var(--selection-color);
      background: var(--selection-bg);
      box-shadow: 0 0.2em 0 0 var(--selection-bg), 0 -0.2em 0 0 var(--selection-bg);
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;

      // 覆盖富文本 token 的显式颜色，确保 AI 高亮范围内统一显示选区前景色。
      &,
      & * {
        color: var(--selection-color) !important;
      }
    }

    .is-editor-empty:first-child::before {
      float: left;
      height: 0;
      font-size: 14px;
      line-height: 1.74;
      color: var(--editor-placeholder);
      pointer-events: none;
      content: attr(data-placeholder);
    }
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-weight: 600;
    color: var(--editor-text);
  }

  h1 {
    margin: 1.5em 0 0.75em;
    font-size: 24px;
  }

  h2 {
    margin: 1.25em 0 0.625em;
    font-size: 20px;
  }

  h3 {
    margin: 1em 0 0.5em;
    font-size: 16px;
  }

  h4 {
    margin: 0.875em 0 0.4375em;
    font-size: 14px;
  }

  h5 {
    margin: 0.75em 0 0.375em;
    font-size: 12px;
    text-transform: uppercase;
  }

  h6 {
    margin: 0.625em 0 0.3125em;
    font-size: 11px;
    text-transform: uppercase;
  }

  p {
    min-height: 1em;
  }

  ul,
  ol {
    padding-left: 1.75em;
    margin: 0.75em 0;
  }

  ul > li {
    list-style: disc;
  }

  ol > li {
    list-style: decimal;
  }

  ul ul {
    list-style: circle;
  }

  ul ul ul {
    list-style: square;
  }

  ol ol {
    list-style: lower-alpha;
  }

  ol ol ol {
    list-style: lower-roman;
  }

  li {
    margin: 0.25em 0;

    &::marker {
      color: var(--text-tertiary);
    }

    > p {
      margin: 0.25em 0;
    }
  }

  li > ul,
  li > ol {
    margin: 0.25em 0;
  }

  ul[data-type='taskList'] {
    padding: 0;
    margin-left: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;

      > label {
        flex: 0 0 auto;
        margin-right: 0.5rem;
        user-select: none;
      }

      > div {
        flex: 1 1 auto;
      }
    }

    input[type='checkbox'] {
      cursor: pointer;
    }
  }

  blockquote {
    padding: 0.5em 1em 0.5em 1.25em;
    margin: 0.75em 0;
    color: var(--editor-blockquote-text);
    background-color: var(--editor-blockquote-bg);
    border-left: 4px solid var(--editor-blockquote-border);
    border-radius: 0 4px 4px 0;
  }

  code {
    padding: 0.125em 0.25em;
    font-family: Menlo, Monaco, 'Courier New', monospace;
    font-size: 0.85em;
    color: var(--color-error);
    background-color: var(--bg-disabled);
    border-radius: 3px;
  }

  pre {
    margin: 0.75em 0;
    background-color: transparent;
    border: 0;
    border-radius: 0;

    code {
      padding: 0;
      font-family: 'Fira Code', 'Fira Mono', Consolas, Monaco, 'Courier New', monospace;
      font-size: 0.9em;
      line-height: 1.6;
      color: var(--code-text);
      background-color: transparent;
      .code-highlight();
    }
  }

  hr {
    margin: 1.5em 0;
    border: none;
    border-top: 1px solid var(--editor-hr);
  }

  a {
    font-weight: 500;
    color: var(--editor-link);
    text-decoration: underline;
    cursor: pointer;

    &:hover {
      opacity: 0.7;
    }
  }

  img {
    max-width: 100%;
    margin: 0.75em 0;
    border-radius: 4px;
    box-shadow: var(--shadow-md);
  }

  th {
    min-width: 120px;
    padding: 0.5em 0.75em;
    font-weight: 600;
    vertical-align: top;
    color: var(--editor-text);
    text-align: left;
    background-color: var(--editor-table-header-bg);
    border-right: 1px solid var(--editor-table-border);
    border-bottom: 1px solid var(--editor-table-border);

    &.selectedCell {
      color: var(--editor-text);
      background-color: color-mix(in srgb, var(--editor-link) 12%, var(--editor-table-header-bg));
      -webkit-text-fill-color: var(--editor-text);
    }
  }

  td {
    min-width: 120px;
    padding: 0.5em 0.75em;
    vertical-align: top;
    color: var(--editor-text);
    text-align: left;
    background-color: var(--bg-primary);
    border-right: 1px solid var(--editor-table-border);
    border-bottom: 1px solid var(--editor-table-border);

    &.selectedCell {
      color: var(--editor-text);
      background-color: color-mix(in srgb, var(--editor-link) 12%, var(--bg-primary));
      -webkit-text-fill-color: var(--editor-text);
    }

    &:last-child {
      border-right: none;
    }
  }

  tr {
    &:first-child {
      td,
      th {
        &:first-child {
          border-top-left-radius: 8px;
        }

        &:last-child {
          border-right: none;
          border-top-right-radius: 8px;
        }
      }
    }

    &:last-child {
      th {
        border-right: none;
        border-bottom: none;

        &:first-child {
          border-bottom-left-radius: 8px;
        }

        &:last-child {
          border-bottom-right-radius: 8px;
        }
      }

      td {
        border-bottom: none;

        &:first-child {
          border-bottom-left-radius: 8px;
        }

        &:last-child {
          border-bottom-right-radius: 8px;
        }
      }
    }
  }

  th p,
  td p {
    min-height: auto;
    margin: 0;
    color: inherit;
  }

  .b-markdown-table__viewport.is-cell-dragging {
    th.selectedCell,
    td.selectedCell {
      &::selection,
      *::selection {
        color: var(--editor-text) !important;
        background: transparent !important;
        -webkit-text-fill-color: var(--editor-text) !important;
      }
    }
  }
}

.b-markdown-rich__loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-primary) 85%, transparent);
}

.b-markdown-rich__loading-content {
  text-align: center;

  p {
    margin-top: 12px;
    font-size: 14px;
    color: var(--text-secondary);
  }
}

.b-markdown-rich__loading-spinner {
  display: inline-block;
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--editor-link);
  border-radius: 50%;
  animation: b-markdown-rich-spin 0.8s linear infinite;
}

@keyframes b-markdown-rich-spin {
  to {
    transform: rotate(360deg);
  }
}

.b-markdown-rich__failed-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
}

.b-markdown-rich__failed-content {
  text-align: center;
}

.b-markdown-rich__failed-message {
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.b-markdown-rich__failed-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.b-markdown-rich__content--loading {
  pointer-events: none;
  opacity: 0.5;
}
</style>
