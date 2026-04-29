<template>
  <div ref="editorRootRef" class="b-prompt-editor-shell" @focusout="handleEditorShellFocusOut">
    <SlashCommandSelect
      :visible="slashVisible"
      :commands="filteredSlashCommands"
      :active-index="slashActiveIndex"
      @select="handleSlashCommandSelect"
      @update:active-index="handleSlashActiveIndexChange"
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
 * @description Prompt editor main component using CodeMirror 6
 */
import type { SlashCommandOption, Variable, BPromptEditorProps as Props } from './types';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewline } from '@codemirror/commands';
import { Annotation, EditorState } from '@codemirror/state';
import { Decoration, EditorView, keymap } from '@codemirror/view';
import SlashCommandSelect from './components/SlashCommandSelect.vue';
import VariableSelect from './components/VariableSelect.vue';
import { editableCompartment, readOnlyCompartment, themeCompartment } from './extensions/base';
import { createPasteHandlerExtension } from './extensions/pasteHandler';
import { createPlaceholderExtension } from './extensions/placeholder';
import { createTriggerPlugin } from './extensions/triggerPlugin';
import { closeTrigger, setTriggerActiveIndex, triggerStateField } from './extensions/triggerState';
import { chipResolverEffect, getChipAtPos, variableChipField } from './extensions/variableChip';

const props = withDefaults(defineProps<Props>(), {
  placeholder: '璇疯緭鍏ュ唴瀹?..',
  options: () => [],
  slashCommands: () => [],
  disabled: false,
  maxHeight: undefined,
  submitOnEnter: false,
  chipResolver: undefined,
  onPasteFiles: undefined
});

const emit = defineEmits<{
  (e: 'change', value: string): void;
  (e: 'submit'): void;
  (e: 'slash-command', command: SlashCommandOption): void;
}>();

const modelValue = defineModel<string>('value', { default: '' });

// Template refs
const editorRootRef = ref<HTMLDivElement>();
const editorHostRef = ref<HTMLDivElement>();

// Trigger refs (Vue refs, not computed)
const triggerVisible = ref(false);
const triggerPosition = ref({ top: 0, left: 0, bottom: 0 });
const triggerActiveIndex = ref(0);
const triggerQuery = ref('');

// Slash command refs
const slashVisible = ref(false);
const slashActiveIndex = ref(0);
const slashQuery = ref('');
const slashRange = ref<{ from: number; to: number } | null>(null);

// Editor state
const lastSelection = ref<{ main: { head: number } } | null>(null);

// Editor view reference
const view = ref<EditorView | null>(null);

// Computed variables from options
const allVariables = computed<Variable[]>(() => props.options.flatMap((group) => group.options));

// Computed slash command list
const allSlashCommands = computed<readonly SlashCommandOption[]>(() => props.slashCommands ?? []);

// Filtered slash commands based on trigger prefix
const filteredSlashCommands = computed<readonly SlashCommandOption[]>(() => {
  const query = slashQuery.value.toLowerCase();
  if (!query) return allSlashCommands.value;
  return allSlashCommands.value.filter((command) => command.trigger.toLowerCase().startsWith(`/${query}`));
});

// Filtered variables based on trigger query
const filteredVariables = computed<Variable[]>(() => {
  const query = triggerQuery.value.toLowerCase();
  if (!query) return allVariables.value;
  return allVariables.value.filter((v) => v.label.toLowerCase().includes(query) || v.value.toLowerCase().includes(query));
});

// Whether there are variables available for triggering
const hasVariables = computed<boolean>(() => allVariables.value.length > 0);

// Resolved max height
const resolvedMaxHeight = computed<string | undefined>(() => {
  if (props.maxHeight === undefined) return undefined;
  if (typeof props.maxHeight === 'number') return `${props.maxHeight}px`;
  return props.maxHeight;
});

/**
 * Determine whether the editor content is empty after trimming whitespace.
 * @param content - Raw editor content.
 * @returns Whether the content should be treated as empty.
 */
function isEditorContentEmpty(content: string): boolean {
  return content.trim().length === 0;
}

// Whether the editor currently contains visible content.
const editorIsEmpty = ref<boolean>(isEditorContentEmpty(modelValue.value));

/**
 * Create the CodeMirror theme extension.
 * @param maxHeight - Maximum height for the editor scroller.
 * @param isEmpty - Whether the editor is currently empty.
 * @returns CodeMirror theme extension.
 */
const createThemeExtension = (maxHeight: string | undefined, isEmpty: boolean): import('@codemirror/state').Extension => {
  return EditorView.theme({
    '.cm-scroller': {
      maxHeight: maxHeight ?? 'none',
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
    // Prevent normalize.css div border reset from collapsing widget buffer width.
    '.cm-widgetBuffer': {
      display: 'inline-block',
      width: isEmpty ? '1px' : '0'
    }
  });
};

/**
 * Determine whether a slash command matches the current query prefix.
 * @param command - Slash command candidate.
 * @param query - Current slash query content.
 * @returns Whether the command matches.
 */
function isSlashCommandMatch(command: SlashCommandOption, query: string): boolean {
  return command.trigger.toLowerCase().startsWith(`/${query.toLowerCase()}`);
}

/**
 * Get the current slash command context at the caret.
 * @param state - Editor state.
 * @returns Slash context or null when unavailable.
 */
function getSlashCommandContext(state: EditorState): { from: number; to: number; query: string } | null {
  if (allSlashCommands.value.length === 0) {
    return null;
  }

  const selection = state.selection.main;
  if (!selection.empty) {
    return null;
  }

  const pos = selection.head;
  const line = state.doc.lineAt(pos);
  const text = state.sliceDoc(line.from, pos);

  if (!text.startsWith('/')) {
    return null;
  }

  const query = text.slice(1);
  const matches = allSlashCommands.value.filter((command) => isSlashCommandMatch(command, query));

  if (matches.length === 0) {
    return null;
  }

  return {
    from: line.from,
    to: pos,
    query
  };
}

/**
 * Hide the slash command menu and clear its active range.
 */
function closeSlashCommandMenu(): void {
  slashVisible.value = false;
  slashQuery.value = '';
  slashRange.value = null;
}

/**
 * Sync slash command menu state from the editor content.
 * @param state - Editor state.
 * @param editorView - Editor view, used to ensure the editor still has focus.
 */
function syncSlashCommandState(state: EditorState, editorView: EditorView | null): void {
  if (!editorView?.hasFocus) {
    closeSlashCommandMenu();
    return;
  }

  const context = getSlashCommandContext(state);
  if (!context) {
    closeSlashCommandMenu();
    return;
  }

  slashVisible.value = true;
  slashQuery.value = context.query;
  slashRange.value = { from: context.from, to: context.to };
  slashActiveIndex.value = 0;
}

// External update annotation for avoiding circular updates
const externalUpdate = Annotation.define<boolean>();

// Model sync extension
const modelSyncExtension = EditorView.updateListener.of((update) => {
  const newValue = update.state.doc.toString();
  editorIsEmpty.value = isEditorContentEmpty(newValue);
  const isExternalValueChange = update.transactions.some((tr) => tr.annotation(externalUpdate));

  syncSlashCommandState(update.state, update.view);

  if (isExternalValueChange) {
    return;
  }

  if (modelValue.value !== newValue) {
    modelValue.value = newValue;
    emit('change', newValue);
  }
});

/**
 * Insert the selected variable into the active trigger range.
 * @param variable - Selected variable metadata.
 */
function handleVariableSelect(variable: Variable): void {
  if (!view.value) return;

  const { state } = view.value;
  const triggerState = state.field(triggerStateField, false);

  if (!triggerState) return;

  const variableText = `{{${variable.value}}} `;
  view.value.dispatch({
    changes: { from: triggerState.from, to: triggerState.to, insert: variableText },
    effects: closeTrigger.of()
  });

  view.value.focus();
}

/**
 * Update the highlighted variable index.
 * @param index - New highlighted index.
 */
function handleActiveIndexChange(index: number): void {
  triggerActiveIndex.value = index;
  if (view.value) {
    view.value.dispatch({
      effects: setTriggerActiveIndex.of(index)
    });
  }
}

/**
 * Update the highlighted slash command index.
 * @param index - New highlighted index.
 */
function handleSlashActiveIndexChange(index: number): void {
  slashActiveIndex.value = index;
}

/**
 * Apply the selected slash command and clear the active slash text.
 * @param command - Selected slash command metadata.
 */
function handleSlashCommandSelect(command: SlashCommandOption): void {
  if (!view.value || !slashRange.value) return;

  const { from, to } = slashRange.value;
  view.value.dispatch({
    changes: { from, to, insert: '' },
    selection: { anchor: from }
  });

  emit('slash-command', command);
  closeSlashCommandMenu();
  view.value.focus();
}

/**
 * Select the currently highlighted slash command.
 * @returns Whether the command was handled.
 */
function handleSlashCommandEnter(): boolean {
  const command = filteredSlashCommands.value[slashActiveIndex.value];
  if (!command) {
    return false;
  }

  handleSlashCommandSelect(command);
  return true;
}

/**
 * Move slash command highlight upward.
 * @returns Whether the key was handled.
 */
function handleSlashCommandArrowUp(): boolean {
  const list = filteredSlashCommands.value;
  if (!slashVisible.value) return false;
  if (list.length === 0) return true;

  const newIndex = (slashActiveIndex.value - 1 + list.length) % list.length;
  handleSlashActiveIndexChange(newIndex);
  return true;
}

/**
 * Move slash command highlight downward.
 * @returns Whether the key was handled.
 */
function handleSlashCommandArrowDown(): boolean {
  const list = filteredSlashCommands.value;
  if (!slashVisible.value) return false;
  if (list.length === 0) return true;

  const newIndex = (slashActiveIndex.value + 1) % list.length;
  handleSlashActiveIndexChange(newIndex);
  return true;
}

/**
 * Focus the editor when the shell is clicked.
 */
function handleContainerClick(): void {
  if (!props.disabled && view.value) {
    view.value.focus();
  }
}

/**
 * Handle document clicks outside the editor shell.
 * @param event - Document mousedown event.
 */
function handleDocumentMouseDown(event: MouseEvent): void {
  const root = editorRootRef.value;
  const { target } = event;

  if (!root || !(target instanceof Node) || root.contains(target)) {
    return;
  }

  if (slashVisible.value) {
    closeSlashCommandMenu();
  }
}

/**
 * Close the slash menu when focus leaves the editor shell.
 * @param event - Shell focusout event.
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

  if (slashVisible.value) {
    closeSlashCommandMenu();
  }
}

/**
 * Build the CodeMirror extension list.
 * @returns Editor extension array.
 */
function createExtensions(): import('@codemirror/state').Extension[] {
  const extensions: import('@codemirror/state').Extension[] = [
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
    createPasteHandlerExtension(props.onPasteFiles),
    EditorView.domEventHandlers({
      blur: (_event, editorView) => {
        if (slashVisible.value) {
          closeSlashCommandMenu();
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
    keymap.of([
      indentWithTab,
      {
        key: 'Backspace',
        run: (editorView) => {
          const sel = editorView.state.selection.main;
          if (!sel.empty) return false;
          if (sel.head > 0) {
            const chip = getChipAtPos(editorView.state, sel.head - 1);
            if (chip) {
              editorView.dispatch({
                changes: { from: chip.from, to: chip.to }
              });
              return true;
            }
          }
          return false;
        }
      },
      {
        key: 'Delete',
        run: (editorView) => {
          const sel = editorView.state.selection.main;
          if (!sel.empty) return false;
          const chip = getChipAtPos(editorView.state, sel.head);
          if (chip) {
            editorView.dispatch({
              changes: { from: chip.from, to: chip.to }
            });
            return true;
          }
          return false;
        }
      },
      {
        key: 'ArrowUp',
        run: () => {
          if (slashVisible.value) {
            return handleSlashCommandArrowUp();
          }
          if (!triggerVisible.value) return false;
          const list = filteredVariables.value;
          if (list.length === 0) return true;
          const newIdx = (triggerActiveIndex.value - 1 + list.length) % list.length;
          handleActiveIndexChange(newIdx);
          return true;
        }
      },
      {
        key: 'ArrowDown',
        run: () => {
          if (slashVisible.value) {
            return handleSlashCommandArrowDown();
          }
          if (!triggerVisible.value) return false;
          const list = filteredVariables.value;
          if (list.length === 0) return true;
          const newIdx = (triggerActiveIndex.value + 1) % list.length;
          handleActiveIndexChange(newIdx);
          return true;
        }
      },
      {
        key: 'Escape',
        run: (editorView) => {
          if (slashVisible.value) {
            closeSlashCommandMenu();
            return true;
          }
          if (triggerVisible.value) {
            editorView.dispatch({ effects: closeTrigger.of() });
            return true;
          }
          return false;
        }
      },
      {
        key: 'Shift-Enter',
        run: insertNewline
      },
      {
        key: 'Enter',
        run: () => {
          if (slashVisible.value && filteredSlashCommands.value.length > 0) {
            return handleSlashCommandEnter();
          }
          if (triggerVisible.value && filteredVariables.value.length > 0) {
            const variable = filteredVariables.value[triggerActiveIndex.value];
            if (variable) {
              handleVariableSelect(variable);
              return true;
            }
          }
          if (props.submitOnEnter) {
            emit('submit');
            return true;
          }
          return false;
        }
      }
    ]),
    keymap.of([...defaultKeymap, ...historyKeymap])
  ];

  return extensions;
}

watch(
  () => modelValue.value,
  (value) => {
    if (!view.value) return;

    const currentDoc = view.value.state.doc.toString();
    if (currentDoc === value) return;

    view.value.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: value },
      annotations: externalUpdate.of(true)
    });
  }
);

watch(
  () => props.disabled,
  (disabled) => {
    if (!view.value) return;

    view.value.dispatch({
      effects: [editableCompartment.reconfigure(EditorView.editable.of(!disabled)), readOnlyCompartment.reconfigure(EditorState.readOnly.of(disabled))]
    });
  }
);

watch(resolvedMaxHeight, (maxHeight) => {
  if (!view.value) return;

  view.value.dispatch({
    effects: themeCompartment.reconfigure(createThemeExtension(maxHeight, editorIsEmpty.value))
  });
});

watch(editorIsEmpty, (isEmpty) => {
  if (!view.value) return;

  view.value.dispatch({
    effects: themeCompartment.reconfigure(createThemeExtension(resolvedMaxHeight.value, isEmpty))
  });
});

watch(
  () => props.chipResolver,
  (resolver) => {
    if (!view.value || !resolver) return;
    view.value.dispatch({
      effects: chipResolverEffect.of(resolver)
    });
  }
);

onMounted(() => {
  if (!editorHostRef.value) return;

  const state = EditorState.create({
    doc: modelValue.value,
    extensions: createExtensions()
  });

  view.value = new EditorView({ state, parent: editorHostRef.value });

  syncSlashCommandState(view.value.state as EditorState, view.value as EditorView);

  if (props.chipResolver) {
    view.value.dispatch({ effects: chipResolverEffect.of(props.chipResolver) });
  }

  nextTick(() => {
    view.value?.requestMeasure();
  });

  document.addEventListener('mousedown', handleDocumentMouseDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown);
  view.value?.destroy();
  view.value = null;
});

defineExpose({
  focus: () => {
    view.value?.focus();
  },
  /**
   * Save the current selection for delayed external insertions.
   */
  saveCursorPosition: () => {
    if (view.value) {
      lastSelection.value = view.value.state.selection;
    }
  },
  /**
   * Insert text at the saved selection or current caret position.
   * @param text - Text to insert.
   */
  insertTextAtCursor: (text: string) => {
    if (!view.value) return;

    const selection = lastSelection.value ?? view.value.state.selection;
    const pos = selection.main.head;
    const insertEnd = pos + text.length;

    view.value.dispatch({
      changes: { from: pos, insert: text },
      selection: { anchor: insertEnd }
    });

    lastSelection.value = null;
    view.value.focus();
  },
  /**
   * Get the raw editor text, including {{...}} tokens.
   */
  getText: () => {
    return view.value?.state.doc.toString() ?? '';
  }
});
</script>

<style lang="less">
@import url('@/assets/styles/scrollbar.less');

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

.b-prompt-chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  font-family: inherit;
  font-size: 12px;
  line-height: 20px;
  color: var(--color-primary, #4080ff);
  background-color: rgb(var(--color-primary-value, 64, 128, 255), 0.1);
  border-radius: 4px;
}

.b-prompt-chip--file {
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-primary);
}
</style>
