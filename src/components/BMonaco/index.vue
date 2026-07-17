<template>
  <div class="b-editor-monaco" @focusout="handleFocusOut">
    <div v-if="loadError" class="b-editor-monaco__fallback">
      <div class="b-editor-monaco__error">{{ loadError }}</div>
      <textarea class="b-editor-monaco__textarea" :value="editorContent" readonly></textarea>
    </div>
    <div v-else ref="hostRef" class="b-editor-monaco__host"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description 基于 Monaco 的低层编辑器组件，实现统一的 EditorController 协议。
 */

import type { MonacoCompilerOptions, MonacoEditorHandle, MonacoExtraLib, MonacoThemeName } from './utils/createMonaco';
import type * as Monaco from 'monaco-editor';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { EditorController, EditorScrollController, EditorSearchState, EditorSelection, EditorState } from '@/components/BEditor/types';
import { useSettingStore } from '@/stores/ui/setting';
import { createMonacoEditor, ensureTheme, getMonacoThemeName } from './utils/createMonaco';

/**
 * 搜索匹配信息。
 */
interface SearchMatchState {
  /** 当前搜索词。 */
  term: string;
  /** 当前命中的索引。 */
  currentIndex: number;
  /** 当前匹配列表。 */
  matches: Monaco.editor.FindMatch[];
}

/**
 * Monaco 查找高亮 class 名。
 */
const SEARCH_DECORATION_CLASS_NAME = 'b-editor-monaco__search-match';

/**
 * BMonaco 编辑器运行时选项。
 */
interface BMonacoOptions {
  /** 是否自动换行 */
  wordWrap?: boolean;
  /** 是否启用内置搜索（Ctrl+F/Cmd+F），默认 true */
  search?: boolean;
  /** 是否启用粘性标题（函数名、类名固定在顶部），默认 false */
  stickyScroll?: boolean;
  /** TypeScript/JavaScript 语言服务编译配置 */
  typescriptCompilerOptions?: MonacoCompilerOptions;
}

/**
 * BMonaco 组件入参。
 */
interface Props {
  /** 当前文本内容。 */
  value: string;
  /** 是否允许编辑。 */
  editable?: boolean;
  /** 当前 Monaco 语言标识。 */
  language: string;
  /** 当前编辑文件状态。 */
  editorState: EditorState;
  /** 编辑器运行时选项 */
  options?: BMonacoOptions;
  /** 额外类型声明，用于 TypeScript/JavaScript 提示 */
  extraLibs?: MonacoExtraLib[];
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  extraLibs: () => [],
  options: () => ({ wordWrap: false, search: true })
});

const emit = defineEmits<{
  /**
   * 文本内容变更。
   * @param event - 事件名
   * @param value - 最新文本
   */
  (event: 'update:value', value: string): void;
  /**
   * 编辑器整体失焦。
   * @param event - 失焦事件
   */
  (event: 'editor-blur', eventObject: FocusEvent): void;
  /**
   * 保存快捷键触发。
   * @param event - 事件名
   */
  (event: 'save'): void;
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const editorHandle = shallowRef<MonacoEditorHandle | null>(null);
const loadError = ref('');
const ignoreModelChange = ref(false);
const editorContent = ref(props.value);
const settingStore = useSettingStore();
const editorInitializationPromise = shallowRef<Promise<MonacoEditorHandle | null> | null>(null);
const modelChangeDispose = ref<Monaco.IDisposable | null>(null);
const scrollChangeDispose = ref<Monaco.IDisposable | null>(null);
const searchDecorations = ref<Monaco.editor.IEditorDecorationsCollection | null>(null);
const searchState = ref<SearchMatchState>({
  term: '',
  currentIndex: 0,
  matches: []
});

/**
 * Monaco 滚动位置快照。
 */
interface MonacoScrollSnapshot {
  /** 垂直滚动位置 */
  top: number;
  /** 水平滚动位置 */
  left: number;
}

const cachedScrollSnapshot = ref<MonacoScrollSnapshot>({ top: 0, left: 0 });

/**
 * 根据当前应用主题解析 Monaco 主题名。
 */
const monacoTheme = computed<MonacoThemeName>(() => {
  const mode = settingStore.resolvedTheme === 'dark' ? 'dark' : 'light';
  return getMonacoThemeName(settingStore.themePreset, mode);
});

/**
 * 计算生效的自动换行配置。
 */
const effectiveWordWrap = computed<boolean>(() => props.options?.wordWrap ?? false);

/**
 * 计算生效的搜索配置，默认开启。
 */
const effectiveSearch = computed<boolean>(() => props.options?.search ?? true);

/**
 * 计算生效的粘性标题配置，默认关闭。
 */
const effectiveStickyScroll = computed<boolean>(() => props.options?.stickyScroll ?? false);

/**
 * 构造 Monaco 搜索选项。
 * @param model - 当前文本模型
 * @param term - 搜索词
 * @returns 匹配结果列表
 */
function collectSearchMatches(model: Monaco.editor.ITextModel, term: string): Monaco.editor.FindMatch[] {
  if (!term) {
    return [];
  }

  return model.findMatches(term, false, false, false, null, true);
}

/**
 * 把 Monaco range 转为统一选区结构。
 * @param model - 当前文本模型
 * @param range - 目标 range
 * @returns 标准选区
 */
function toEditorSelection(model: Monaco.editor.ITextModel, range: Monaco.IRange): EditorSelection {
  const from = model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn });
  const to = model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn });

  return {
    from,
    to,
    text: model.getValueInRange(range)
  };
}

/**
 * 刷新搜索高亮装饰与搜索状态。
 * @param preserveIndex - 是否尽量保留当前索引
 */
function refreshSearchState(preserveIndex: boolean): void {
  const handle = editorHandle.value;
  if (!handle) {
    return;
  }

  const model = handle.getModel();
  const nextMatches = collectSearchMatches(model, searchState.value.term);
  const nextIndex = preserveIndex && nextMatches.length > 0 ? Math.min(searchState.value.currentIndex, nextMatches.length - 1) : 0;

  searchState.value = {
    term: searchState.value.term,
    currentIndex: nextIndex,
    matches: nextMatches
  };

  if (!searchDecorations.value) {
    const editor = handle.getEditor();
    searchDecorations.value = editor.createDecorationsCollection([]);
  }

  searchDecorations.value.set(
    nextMatches.map((match, index) => ({
      range: match.range,
      options: {
        className: index === nextIndex ? `${SEARCH_DECORATION_CLASS_NAME} is-current` : SEARCH_DECORATION_CLASS_NAME
      }
    }))
  );
}

/**
 * 导航到当前命中的搜索结果。
 */
function revealCurrentSearchMatch(): void {
  const handle = editorHandle.value;
  const currentMatch = searchState.value.matches.at(searchState.value.currentIndex);
  if (!handle || !currentMatch) {
    return;
  }

  const editor = handle.getEditor();
  editor.setSelection(currentMatch.range);
  editor.revealRangeInCenter(currentMatch.range);
}

/**
 * 把底层内容变更同步回外层 v-model。
 */
function bindModelChange(): void {
  const handle = editorHandle.value;
  if (!handle) {
    return;
  }

  modelChangeDispose.value?.dispose();
  modelChangeDispose.value = handle.getModel().onDidChangeContent((): void => {
    if (ignoreModelChange.value) {
      return;
    }

    const nextValue = handle.getValue();
    editorContent.value = nextValue;
    emit('update:value', nextValue);
    refreshSearchState(true);
  });
}

/**
 * 保存 Monaco 当前滚动位置。
 */
function rememberScrollPosition(): void {
  const editor = editorHandle.value?.getEditor();
  if (!editor) {
    return;
  }

  cachedScrollSnapshot.value = {
    top: editor.getScrollTop(),
    left: editor.getScrollLeft()
  };
}

/**
 * 恢复 Monaco 最近一次滚动位置。
 */
function restoreScrollPosition(): void {
  const editor = editorHandle.value?.getEditor();
  if (!editor) {
    return;
  }

  editor.setScrollPosition({
    scrollTop: cachedScrollSnapshot.value.top,
    scrollLeft: cachedScrollSnapshot.value.left
  });
}

/**
 * 监听 Monaco 滚动变化并维护快照。
 */
function bindScrollChange(): void {
  const editor = editorHandle.value?.getEditor();
  if (!editor) {
    return;
  }

  scrollChangeDispose.value?.dispose();
  scrollChangeDispose.value = editor.onDidScrollChange((): void => {
    rememberScrollPosition();
  });
}

/**
 * 创建 Monaco 编辑器实例。
 * @returns Monaco 编辑器句柄；初始化失败时返回 null
 */
async function initializeEditor(): Promise<MonacoEditorHandle | null> {
  if (!hostRef.value) {
    return null;
  }

  try {
    editorHandle.value = await createMonacoEditor({
      container: hostRef.value,
      value: props.value,
      language: props.language,
      readOnly: !props.editable,
      theme: monacoTheme.value,
      presetId: settingStore.themePreset,
      mode: settingStore.resolvedTheme === 'dark' ? 'dark' : 'light',
      wordWrap: effectiveWordWrap.value,
      search: effectiveSearch.value,
      extraLibs: props.extraLibs,
      typescriptCompilerOptions: props.options?.typescriptCompilerOptions,
      onSaveShortcut: (): void => emit('save'),
      stickyScroll: effectiveStickyScroll.value
    });
    bindModelChange();
    bindScrollChange();
    refreshSearchState(false);
    return editorHandle.value;
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : 'Monaco 初始化失败';
    return null;
  }
}

/**
 * 确保 Monaco 初始化流程只启动一次，并允许早到的外部调用等待 editor ready。
 * @returns Monaco 编辑器句柄；初始化失败时返回 null
 */
function ensureEditorInitialized(): Promise<MonacoEditorHandle | null> {
  if (editorHandle.value) {
    return Promise.resolve(editorHandle.value);
  }

  if (!editorInitializationPromise.value) {
    editorInitializationPromise.value = initializeEditor();
  }

  return editorInitializationPromise.value;
}

/**
 * 统一向外转发失焦事件，外层会进一步过滤 relatedTarget。
 * @param event - 失焦事件
 */
function handleFocusOut(event: FocusEvent): void {
  emit('editor-blur', event);
}

/**
 * 获取当前标准搜索状态。
 * @returns 搜索状态快照
 */
function getSearchState(): EditorSearchState {
  return {
    currentIndex: searchState.value.matches.length > 0 ? searchState.value.currentIndex + 1 : 0,
    matchCount: searchState.value.matches.length,
    term: searchState.value.term
  };
}

/**
 * 获取当前选区内容。
 * @returns 标准选区；无选区时返回 null
 */
function getSelection(): EditorSelection | null {
  const handle = editorHandle.value;
  if (!handle) {
    return null;
  }

  const range = handle.getEditor().getSelection();
  if (!range || range.isEmpty()) {
    return null;
  }

  return toEditorSelection(handle.getModel(), range);
}

/**
 * 聚焦编辑器。
 */
function focusEditor(): void {
  editorHandle.value?.focus();
}

/**
 * 聚焦文档起始位置。
 */
function focusEditorAtStart(): void {
  const handle = editorHandle.value;
  if (!handle) {
    return;
  }

  handle.getEditor().setPosition({ lineNumber: 1, column: 1 });
  handle.getEditor().revealPositionInCenter({ lineNumber: 1, column: 1 });
  handle.focus();
}

/**
 * 设置搜索词并刷新高亮。
 * @param term - 搜索词
 */
function setSearchTerm(term: string): void {
  searchState.value.term = term;
  searchState.value.currentIndex = 0;
  refreshSearchState(false);
  revealCurrentSearchMatch();
}

/**
 * 跳转到下一个搜索命中。
 */
function findNext(): void {
  if (searchState.value.matches.length === 0) {
    return;
  }

  searchState.value.currentIndex = (searchState.value.currentIndex + 1) % searchState.value.matches.length;
  refreshSearchState(true);
  revealCurrentSearchMatch();
}

/**
 * 跳转到上一个搜索命中。
 */
function findPrevious(): void {
  if (searchState.value.matches.length === 0) {
    return;
  }

  searchState.value.currentIndex = (searchState.value.currentIndex - 1 + searchState.value.matches.length) % searchState.value.matches.length;
  refreshSearchState(true);
  revealCurrentSearchMatch();
}

/**
 * 清除当前搜索状态。
 */
function clearSearch(): void {
  searchState.value = {
    term: '',
    currentIndex: 0,
    matches: []
  };
  searchDecorations.value?.clear();
}

/**
 * 在光标位置插入内容。
 * @param content - 待插入文本
 */
async function insertAtCursor(content: string): Promise<void> {
  const handle = editorHandle.value;
  if (!handle) {
    return;
  }

  const editor = handle.getEditor();
  const range = editor.getSelection();
  if (!range) {
    return;
  }

  editor.executeEdits('insert-at-cursor', [{ range, text: content, forceMoveMarkers: true }]);
  editor.pushUndoStop();
  emit('update:value', handle.getValue());
}

/**
 * 替换当前选区内容。
 * @param content - 替换文本
 */
async function replaceSelection(content: string): Promise<void> {
  const handle = editorHandle.value;
  if (!handle) {
    return;
  }

  const editor = handle.getEditor();
  const range = editor.getSelection();
  if (!range || range.isEmpty()) {
    throw new Error('NO_SELECTION');
  }

  editor.executeEdits('replace-selection', [{ range, text: content, forceMoveMarkers: true }]);
  editor.pushUndoStop();
  emit('update:value', handle.getValue());
}

/**
 * 替换整个文档内容。
 * @param content - 新文档内容
 */
async function replaceDocument(content: string): Promise<void> {
  const handle = editorHandle.value;
  if (!handle) {
    return;
  }

  ignoreModelChange.value = true;
  handle.setValue(content);
  ignoreModelChange.value = false;
  editorContent.value = content;
  emit('update:value', content);
  refreshSearchState(true);
}

/**
 * 执行撤销。
 */
function undo(): void {
  editorHandle.value?.getEditor().trigger('keyboard', 'undo', null);
}

/**
 * 执行重做。
 */
function redo(): void {
  editorHandle.value?.getEditor().trigger('keyboard', 'redo', null);
}

/**
 * 当前是否可撤销。
 * @returns 是否可撤销
 */
function canUndo(): boolean {
  return true;
}

/**
 * 当前是否可重做。
 * @returns 是否可重做
 */
function canRedo(): boolean {
  return true;
}

/**
 * 按行号选中范围。
 * @param startLine - 起始行号
 * @param endLine - 结束行号
 * @returns 是否成功
 */
async function selectLineRange(startLine: number, endLine: number): Promise<boolean> {
  const handle = editorHandle.value ?? (await ensureEditorInitialized());
  if (!handle) {
    return false;
  }

  const model = handle.getModel();
  const safeStartLine = Math.max(1, Math.min(startLine, model.getLineCount()));
  const safeEndLine = Math.max(safeStartLine, Math.min(endLine, model.getLineCount()));
  const range = {
    startLineNumber: safeStartLine,
    startColumn: 1,
    endLineNumber: safeEndLine,
    endColumn: model.getLineMaxColumn(safeEndLine)
  };

  handle.getEditor().setSelection(range);
  handle.getEditor().revealRangeInCenter(range);
  handle.focus();
  return true;
}

watch(
  () => props.value,
  (nextValue: string): void => {
    const handle = editorHandle.value;
    if (!handle || handle.getValue() === nextValue) {
      return;
    }

    ignoreModelChange.value = true;
    handle.setValue(nextValue);
    ignoreModelChange.value = false;
    editorContent.value = nextValue;
    refreshSearchState(true);
  }
);

watch(
  () => props.editable,
  (editable: boolean): void => {
    editorHandle.value?.updateOptions({ readOnly: !editable });
  }
);

/**
 * 动态响应额外类型声明变化，避免调用方通过 key 重建编辑器。
 */
watch(
  () => props.extraLibs,
  (extraLibs: MonacoExtraLib[]): void => {
    editorHandle.value?.updateExtraLibs(extraLibs);
  },
  { deep: true }
);

/**
 * 动态响应 options 变化，实时更新编辑器配置。
 */
watch(
  () => props.options,
  (): void => {
    const handle = editorHandle.value;
    if (!handle) {
      return;
    }

    handle.updateOptions({
      wordWrap: effectiveWordWrap.value ? 'on' : 'off',
      stickyScroll: { enabled: effectiveStickyScroll.value },
      find: effectiveSearch.value
        ? {
            addExtraSpaceOnTop: false,
            autoFindInSelection: 'never',
            seedSearchStringFromSelection: 'always',
            loop: true
          }
        : {}
    });
  },
  { deep: true }
);

watch(monacoTheme, async (): Promise<void> => {
  const editor = editorHandle.value?.getEditor();
  if (!editor) {
    return;
  }

  // 确保 Monaco 模块已加载，然后注册主题
  const monaco = await import('monaco-editor/esm/vs/editor/editor.main.js');
  const mode = settingStore.resolvedTheme === 'dark' ? 'dark' : 'light';
  const resolvedThemeName = ensureTheme(monaco, settingStore.themePreset, mode);
  editor.updateOptions({ theme: resolvedThemeName });
});

onMounted((): void => {
  ensureEditorInitialized().catch((): void => {
    // 错误已在 initializeEditor 内部收敛为 loadError，这里避免未处理 Promise。
  });
});

onBeforeUnmount((): void => {
  modelChangeDispose.value?.dispose();
  scrollChangeDispose.value?.dispose();
  searchDecorations.value?.clear();
  editorHandle.value?.dispose();
});

defineExpose<EditorController & EditorScrollController>({
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
  rememberScrollPosition,
  restoreScrollPosition,
  scrollToAnchor: (): boolean => false,
  getActiveAnchorId: (): string => ''
});
</script>

<style lang="less">
.b-editor-monaco {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.b-editor-monaco__host,
.b-editor-monaco__fallback {
  flex: 1;
  min-height: calc(100vh - 44px);
}

.b-editor-monaco__fallback {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 40px 90px;
}

.b-editor-monaco__error {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-danger, #dc2626);
}

.b-editor-monaco__textarea {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 0;
  font-family: 'JetBrains Mono', SFMono-Regular, Consolas, 'Liberation Mono', monospace;
  font-size: 15px;
  line-height: 24px;
  color: var(--editor-text, #243042);
  resize: none;
  outline: none;
  background: transparent;
  border: none;
}

.b-editor-monaco .monaco-editor .selected-text {
  background-color: var(--monaco-inactive-selection-bg) !important;
}

.b-editor-monaco .monaco-editor .focused .selected-text {
  background-color: var(--monaco-selection-bg) !important;
}
</style>
