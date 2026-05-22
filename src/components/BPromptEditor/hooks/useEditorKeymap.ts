/**
 * @file useEditorKeymap.ts
 * @description 编辑器键盘快捷键 Hook
 */
import type { Variable } from '../types';
import type { UseFileMentionReturn } from './useFileMention';
import type { UseSlashCommandReturn } from './useSlashCommand';
import type { EditorView } from '@codemirror/view';
import type { Ref, ComputedRef, ShallowRef } from 'vue';
import { defaultKeymap, historyKeymap, indentWithTab, insertNewline } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { closeTrigger, setTriggerActiveIndex } from '../extensions/triggerState';
import { getChipAtPos } from '../extensions/variableChip';

/**
 * 变量触发器相关状态接口
 */
export interface VariableTriggerState {
  triggerVisible: Ref<boolean>;
  triggerActiveIndex: Ref<number>;
  filteredVariables: ComputedRef<Variable[]>;
}

/**
 * useEditorKeymap 参数接口
 */
export interface UseEditorKeymapParams {
  view: ShallowRef<EditorView | null>;
  slashCommand: UseSlashCommandReturn;
  fileMention: UseFileMentionReturn;
  variableTrigger: VariableTriggerState;
  handleVariableSelect: (variable: Variable) => void;
  submitOnEnter: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}

/**
 * 创建编辑器 keymap 扩展
 */
export function useEditorKeymap(params: UseEditorKeymapParams): import('@codemirror/state').Extension {
  const { view, slashCommand, fileMention, variableTrigger, handleVariableSelect, submitOnEnter, onSubmit, onCancel } = params;

  const { triggerVisible, triggerActiveIndex, filteredVariables } = variableTrigger;

  return keymap.of([
    indentWithTab,
    // Backspace - 删除 chip
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
    // Delete - 删除 chip
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
    // ArrowUp - 导航
    {
      key: 'ArrowUp',
      run: () => {
        if (slashCommand.slashVisible.value) {
          return slashCommand.handleSlashCommandArrowUp();
        }
        if (fileMention.mentionVisible.value) {
          return fileMention.handleMentionArrowUp();
        }
        if (!triggerVisible.value) return false;
        const list = filteredVariables.value;
        if (list.length === 0) return true;
        const newIdx = (triggerActiveIndex.value - 1 + list.length) % list.length;
        triggerActiveIndex.value = newIdx;
        if (view.value) {
          view.value.dispatch({
            effects: setTriggerActiveIndex.of(newIdx)
          });
        }
        return true;
      }
    },
    // ArrowDown - 导航
    {
      key: 'ArrowDown',
      run: () => {
        if (slashCommand.slashVisible.value) {
          return slashCommand.handleSlashCommandArrowDown();
        }
        if (fileMention.mentionVisible.value) {
          return fileMention.handleMentionArrowDown();
        }
        if (!triggerVisible.value) return false;
        const list = filteredVariables.value;
        if (list.length === 0) return true;
        const newIdx = (triggerActiveIndex.value + 1) % list.length;
        triggerActiveIndex.value = newIdx;
        if (view.value) {
          view.value.dispatch({
            effects: setTriggerActiveIndex.of(newIdx)
          });
        }
        return true;
      }
    },
    // Escape - 关闭菜单或取消
    {
      key: 'Escape',
      run: (editorView) => {
        if (slashCommand.slashVisible.value) {
          slashCommand.closeSlashCommandMenu();
          return true;
        }
        if (fileMention.mentionVisible.value) {
          fileMention.closeMentionMenu();
          return true;
        }
        if (triggerVisible.value) {
          editorView.dispatch({ effects: closeTrigger.of() });
          return true;
        }
        if (onCancel) {
          return onCancel() ?? true;
        }
        return false;
      }
    },
    // Shift-Enter - 换行
    {
      key: 'Shift-Enter',
      run: insertNewline
    },
    // Enter - 确认选择或提交
    {
      key: 'Enter',
      run: () => {
        if (slashCommand.slashVisible.value && slashCommand.filteredSlashCommands.value.length > 0) {
          return slashCommand.handleSlashCommandEnter();
        }
        if (fileMention.mentionVisible.value && fileMention.filteredFileMentions.value.length > 0) {
          return fileMention.handleMentionEnter();
        }
        if (triggerVisible.value && filteredVariables.value.length > 0) {
          const variable = filteredVariables.value[triggerActiveIndex.value];
          if (variable) {
            handleVariableSelect(variable);
            return true;
          }
        }
        if (submitOnEnter) {
          onSubmit();
          return true;
        }
        return false;
      }
    },
    // 默认 keymap
    ...defaultKeymap,
    ...historyKeymap
  ]);
}
