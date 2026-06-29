<template>
  <div ref="editorRootRef" class="b-prompt-editor-shell" @focusout="handleEditorShellFocusOut">
    <SlashCommandSelect
      :visible="slashCommand.slashVisible.value"
      :commands="slashCommand.filteredSlashCommands.value"
      :active-index="slashCommand.slashActiveIndex.value"
      :scroll-active-into-view="slashCommand.slashShouldScrollActive.value"
      @select="slashCommand.handleSlashCommandSelect"
      @update:active-index="slashCommand.handleSlashActiveIndexChange"
    />
    <FileMentionSelect
      :visible="fileMention.mentionVisible.value"
      :files="fileMention.filteredFileMentions.value"
      :active-index="fileMention.mentionActiveIndex.value"
      :scroll-active-into-view="fileMention.mentionShouldScrollActive.value"
      @select="fileMention.handleFileMentionSelect"
      @update:active-index="fileMention.handleMentionActiveIndexChange"
    />
    <div class="b-prompt-editor" @click="handleContainerClick">
      <div class="b-prompt-editor__container">
        <div ref="editorHostRef" class="b-prompt-editor__codemirror"></div>
        <VariableSelect
          :visible="triggerVisible"
          :variables="filteredVariables"
          :position="triggerPosition"
          :active-index="triggerActiveIndex"
          @select="handleVariableSelect"
          @update:active-index="handleActiveIndexChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file BPromptEditor/index.vue
 * @description Prompt 编辑器主组件，基于 CodeMirror 6 实现
 */
import type { SlashCommandOption, Variable, FileMentionOption, BPromptEditorProps as Props } from './types';
import type { Extension } from '@codemirror/state';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { history } from '@codemirror/commands';
import { Annotation, EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import FileMentionSelect from './components/FileMentionSelect.vue';
import SlashCommandSelect from './components/SlashCommandSelect.vue';
import VariableSelect from './components/VariableSelect.vue';
import { editableCompartment, readOnlyCompartment, themeCompartment } from './extensions/base';
import { createPasteHandlerExtension } from './extensions/pasteHandler';
import { createPlaceholderExtension } from './extensions/placeholder';
import { createTriggerPlugin } from './extensions/triggerPlugin';
import { closeTrigger, setTriggerActiveIndex, triggerStateField } from './extensions/triggerState';
import { variableChipField, chipResolverEffect, getChipAtPos, createVariableValueChipResolver } from './extensions/variableChip';
import { useEditorKeymap } from './hooks/useEditorKeymap';
import { useFileMention } from './hooks/useFileMention';
import { useSlashCommand } from './hooks/useSlashCommand';

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请输入内容...',
  options: () => [],
  slashCommands: () => [],
  fileMentions: () => [],
  disabled: false,
  maxHeight: undefined,
  submitOnEnter: false,
  chipResolver: undefined,
  onPasteFiles: undefined,
  onPasteImages: undefined,
  canAcceptImages: undefined,
  onCancel: undefined
});

const emit = defineEmits<{
  (e: 'change', value: string): void;
  (e: 'submit'): void;
  (e: 'slash-command', command: SlashCommandOption): void;
  (e: 'file-mention-select', file: FileMentionOption): void;
}>();

const modelValue = defineModel<string>('value', { default: '' });

// 模板 ref
const editorRootRef = ref<HTMLDivElement>();
const editorHostRef = ref<HTMLDivElement>();

// 触发器状态（变量选择相关）
const triggerVisible = ref(false);
const triggerPosition = ref({ top: 0, left: 0, bottom: 0 });
const triggerActiveIndex = ref(0);
const triggerQuery = ref('');

// 编辑器状态
const lastSelection = ref<{ main: { head: number } } | null>(null);

// 从 options 计算得到的变量列表
const allVariables = computed<Variable[]>(() => props.options.flatMap((group) => group.options));

// 根据触发查询过滤后的变量
const filteredVariables = computed<Variable[]>(() => {
  const query = triggerQuery.value.toLowerCase();
  if (!query) return allVariables.value;
  return allVariables.value.filter((v) => v.label.toLowerCase().includes(query) || v.value.toLowerCase().includes(query));
});

// 是否有可用于触发的变量
const hasVariables = computed<boolean>(() => allVariables.value.length > 0);

// 默认变量 Chip 解析器，自定义解析器优先，普通变量按 value 渲染
const resolvedChipResolver = computed(() => createVariableValueChipResolver(allVariables.value, props.chipResolver));

// 解析后的最大高度
const resolvedMaxHeight = computed<string | undefined>(() => {
  if (props.maxHeight === undefined) return undefined;
  if (typeof props.maxHeight === 'number') return `${props.maxHeight}px`;
  return props.maxHeight;
});

/**
 * 判断编辑器内容在去除空白后是否为空
 */
function isEditorContentEmpty(content: string): boolean {
  return content.trim().length === 0;
}

// 编辑器当前是否包含可见内容
const editorIsEmpty = ref<boolean>(isEditorContentEmpty(modelValue.value));
// 斜杠命令列表
const allSlashCommands = computed<readonly SlashCommandOption[]>(() => props.slashCommands ?? []);
// 文件提及列表
const allFileMentions = computed<readonly FileMentionOption[]>(() => props.fileMentions ?? []);
// 外部更新标记
const externalUpdate = Annotation.define<boolean>();
// 编辑器视图引用
const instance = shallowRef<EditorView | null>(null);
// 使用斜杠命令 hook
const slashCommand = useSlashCommand(instance, allSlashCommands, (event, command) => emit(event, command));
// 使用文件提及 hook
const fileMention = useFileMention(instance, allFileMentions, (event, file) => emit(event, file));

/**
 * 将选中的变量插入到活动触发范围
 */
function handleVariableSelect(variable: Variable): void {
  if (!instance.value) return;

  const { state } = instance.value;
  const triggerState = state.field(triggerStateField, false);

  if (!triggerState) return;

  const variableText = `{{${variable.value}}} `;
  instance.value.dispatch({
    changes: { from: triggerState.from, to: triggerState.to, insert: variableText },
    effects: closeTrigger.of()
  });

  instance.value.focus();
}

/**
 * 更新高亮变量的索引
 */
function handleActiveIndexChange(index: number): void {
  if (!instance.value) return;

  triggerActiveIndex.value = index;
  instance.value.dispatch({
    effects: setTriggerActiveIndex.of(index)
  });
}

// 键盘快捷键扩展
const keymapExtension = useEditorKeymap({
  view: instance,
  slashCommand,
  fileMention,
  variableTrigger: {
    triggerVisible,
    triggerActiveIndex,
    filteredVariables
  },
  handleVariableSelect,
  submitOnEnter: props.submitOnEnter,
  onSubmit: () => emit('submit'),
  onCancel: props.onCancel
});

/**
 * 创建 CodeMirror 主题扩展
 */
function createThemeExtension(height: string | undefined, isEmpty: boolean): Extension {
  return EditorView.theme({
    '.cm-scroller': {
      maxHeight: height ?? 'none',
      overflow: 'auto',
      fontFamily: 'inherit',
      fontSize: '14px',
      lineHeight: '1.6'
    },
    '.cm-content': {
      caretColor: 'var(--color-primary, #4080ff)',
      padding: '0'
    },
    '.cm-line': {
      padding: '0'
    },
    '.cm-placeholder': {
      color: 'var(--text-placeholder)',
      fontStyle: 'normal'
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgb(var(--color-primary-value, 64, 128, 255), 0.15) !important'
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgb(var(--color-primary-value, 64, 128, 255), 0.2) !important'
    },
    '.cm-cursor': {
      borderLeft: '1.2px solid var(--color-primary, #4080ff)',
      marginLeft: '-0.6px',
      pointerEvents: 'none',
      position: 'relative',
      height: '1em'
    },
    '.cm-widgetBuffer': {
      display: 'inline-block',
      width: isEmpty ? '1px' : '0'
    }
  });
}

/**
 * 构建 CodeMirror 扩展列表
 */
function createExtensions(): Extension[] {
  const modelSyncExtension = EditorView.updateListener.of((update) => {
    const newValue = update.state.doc.toString();
    editorIsEmpty.value = isEditorContentEmpty(newValue);
    const isExternalValueChange = update.transactions.some((tr) => tr.annotation(externalUpdate));

    slashCommand.syncSlashCommandState(update.state, update.view);
    fileMention.syncMentionState(update.state, update.view);

    if (isExternalValueChange) {
      return;
    }

    if (modelValue.value !== newValue) {
      modelValue.value = newValue;
      emit('change', newValue);
    }
  });

  const extensions: Extension[] = [
    EditorView.lineWrapping,
    history(),
    modelSyncExtension,
    variableChipField,
    triggerStateField,
    createTriggerPlugin({
      triggerVisible,
      triggerPosition,
      triggerActiveIndex,
      triggerQuery,
      hasVariables
    }),
    createPlaceholderExtension(props.placeholder),
    createPasteHandlerExtension(props.onPasteFiles, props.onPasteImages, props.canAcceptImages),
    EditorView.domEventHandlers({
      focus: () => {
        return false;
      },
      blur: (_event, editorView) => {
        if (slashCommand.slashVisible.value) {
          slashCommand.closeSlashCommandMenu(true);
        }
        if (fileMention.mentionVisible.value) {
          fileMention.closeMentionMenu(true);
        }
        if (triggerVisible.value) {
          editorView.dispatch({ effects: closeTrigger.of() });
        }
        return false;
      }
    }),
    EditorView.domEventHandlers({
      mousedown: (event, editorView) => {
        if (!(event instanceof MouseEvent)) return false;
        const pos = editorView.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        const chip = getChipAtPos(editorView.state, pos);
        if (!chip) return false;
        event.preventDefault();
        const anchor = pos - chip.from < chip.to - pos ? chip.from : chip.to;
        editorView.dispatch({
          selection: { anchor },
          scrollIntoView: true
        });
        return true;
      }
    }),
    EditorView.atomicRanges.of((editorView) => {
      const chipState = editorView.state.field(variableChipField, false);
      return chipState?.decorations ?? Decoration.none;
    }),
    editableCompartment.of(EditorView.editable.of(!props.disabled)),
    readOnlyCompartment.of(EditorState.readOnly.of(props.disabled)),
    themeCompartment.of(createThemeExtension(resolvedMaxHeight.value, editorIsEmpty.value)),
    keymapExtension
  ];

  return extensions;
}

/**
 * 将当前 Chip 解析器同步到 CodeMirror 状态字段。
 */
function syncChipResolver(): void {
  if (!instance.value) return;

  instance.value.dispatch({
    effects: chipResolverEffect.of(resolvedChipResolver.value)
  });
}

/**
 * 初始化编辑器
 */
function setupEditor(): void {
  if (!editorHostRef.value) return;

  const state = EditorState.create({
    doc: modelValue.value,
    extensions: createExtensions()
  });

  instance.value = new EditorView({ state, parent: editorHostRef.value });

  slashCommand.syncSlashCommandState(instance.value.state as EditorState, instance.value as EditorView);
  fileMention.syncMentionState(instance.value.state as EditorState, instance.value as EditorView);

  syncChipResolver();

  nextTick(() => {
    instance.value?.requestMeasure();
  });
}

/**
 * 销毁编辑器
 */
function destroyEditor(): void {
  instance.value?.destroy();
  instance.value = null;
}

/**
 * 点击编辑器外壳时聚焦编辑器
 */
function handleContainerClick(): void {
  if (!props.disabled && instance.value) {
    instance.value.focus();
  }
}

/**
 * 处理编辑器外壳外部的文档点击事件
 */
function handleDocumentMouseDown(event: MouseEvent): void {
  const root = editorRootRef.value;
  const { target } = event;

  if (!root || !(target instanceof Node) || root.contains(target)) {
    return;
  }

  if (slashCommand.slashVisible.value) {
    slashCommand.closeSlashCommandMenu(true);
  }
  if (fileMention.mentionVisible.value) {
    fileMention.closeMentionMenu(true);
  }
}

/**
 * 焦点离开编辑器外壳时关闭菜单
 */
function handleEditorShellFocusOut(event: FocusEvent): void {
  const root = editorRootRef.value;
  const { relatedTarget } = event;

  if (!root) {
    return;
  }

  if (relatedTarget instanceof Node && root.contains(relatedTarget)) {
    return;
  }

  if (slashCommand.slashVisible.value) {
    slashCommand.closeSlashCommandMenu(true);
  }
  if (fileMention.mentionVisible.value) {
    fileMention.closeMentionMenu(true);
  }
}

// 监听 modelValue 变化
watch(modelValue, (value) => {
  if (!instance.value) return;

  const currentDoc = instance.value.state.doc.toString();
  if (currentDoc === value) return;

  instance.value.dispatch({
    changes: { from: 0, to: currentDoc.length, insert: value },
    annotations: externalUpdate.of(true)
  });
});

// 监听 disabled 变化
watch(
  () => props.disabled,
  (isDisabled) => {
    if (!instance.value) return;

    instance.value.dispatch({
      effects: [editableCompartment.reconfigure(EditorView.editable.of(!isDisabled)), readOnlyCompartment.reconfigure(EditorState.readOnly.of(isDisabled))]
    });
  }
);

// 监听 maxHeight 变化
watch(resolvedMaxHeight, (h) => {
  if (!instance.value) return;

  instance.value.dispatch({
    effects: themeCompartment.reconfigure(createThemeExtension(h, editorIsEmpty.value))
  });
});

// 监听 editorIsEmpty 变化
watch(editorIsEmpty, (isEmpty) => {
  if (!instance.value) return;

  instance.value.dispatch({
    effects: themeCompartment.reconfigure(createThemeExtension(resolvedMaxHeight.value, isEmpty))
  });
});

// 监听 Chip 解析器变化
watch(resolvedChipResolver, () => {
  syncChipResolver();
});

onMounted(() => {
  setupEditor();
  document.addEventListener('mousedown', handleDocumentMouseDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown);
  destroyEditor();
});

defineExpose({
  focus: (options?: { moveToEnd?: boolean }) => {
    if (!instance.value) return;
    instance.value.focus();
    if (options?.moveToEnd) {
      const end = instance.value.state.doc.length;
      instance.value.dispatch({ selection: { anchor: end } });
    }
  },
  getCursorPosition: (): number => {
    if (!instance.value) {
      return 0;
    }

    const selection = lastSelection.value ?? instance.value.state.selection;
    return selection.main.head;
  },
  saveCursorPosition: () => {
    if (instance.value) {
      lastSelection.value = instance.value.state.selection;
    }
  },
  insertTextAtCursor: (text: string) => {
    if (!instance.value) return;

    instance.value.focus();
    const selection = lastSelection.value ?? instance.value.state.selection;
    const pos = selection.main.head;
    const insertEnd = pos + text.length;

    instance.value.dispatch({
      changes: { from: pos, insert: text },
      selection: { anchor: insertEnd }
    });

    lastSelection.value = null;
  },
  replaceTextRange: (from: number, to: number, text: string) => {
    if (!instance.value) return;

    instance.value.focus();
    const insertEnd = from + text.length;
    instance.value.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: insertEnd }
    });
  },
  getText: () => {
    return instance.value?.state.doc.toString() ?? '';
  }
});
</script>

<style lang="less">
@import url('@/assets/styles/scrollbar.less');
@import url('@/components/BChat/components/FileRefChip/index.less');

.b-prompt-editor-shell {
  position: relative;
  width: 100%;
}

.b-prompt-editor {
  width: 100%;
  min-height: 80px;
  padding: 12px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  outline: none;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--border-hover);
  }

  &:focus-within {
    background: var(--input-bg);
    border-color: var(--input-focus-border);
    box-shadow: 0 0 0 2px var(--input-focus-shadow);
  }

  .scrollbar-style();
}

.b-prompt-editor__container {
  position: relative;
  width: 100%;
  height: 100%;
}

.b-prompt-variable-chip {
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  height: 20px;
  padding: 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 20px;
  vertical-align: middle;
  color: var(--color-primary);
  white-space: nowrap;
  background: var(--color-primary-bg);
  border: 1px solid rgb(var(--color-primary-value, 64, 128, 255), 0.18);
  border-radius: 4px;
}

.b-prompt-editor__codemirror {
  width: 100%;
  min-height: 80px;

  .cm-editor {
    outline: none;
  }

  .cm-focused {
    outline: none;
  }

  .cm-content {
    word-break: break-all;
    white-space: pre-wrap;
  }

  .cm-line {
    white-space: pre-wrap;
  }
}
</style>
