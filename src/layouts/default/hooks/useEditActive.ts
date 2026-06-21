/**
 * @file useEditActive.ts
 * @description 默认布局编辑菜单状态与快捷键绑定。
 */
import { computed, onUnmounted, type ComputedRef } from 'vue';
import { useToolbarShortcuts } from '@/components/BToolbar/hooks/useToolbarShortcuts';
import type { ToolbarOptions } from '@/components/BToolbar/types';
import { EditorShortcuts } from '@/constants/shortcuts';
import { emitter } from '@/utils/emitter';

/**
 * 判断快捷键事件是否来自文本编辑区域。
 * @param event - 键盘事件
 * @returns 是否来自可编辑输入区域
 */
function isEditableShortcutTarget(event: KeyboardEvent): boolean {
  const { target } = event;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .ProseMirror, .cm-editor'));
}

/**
 * 判断全局编辑快捷键是否应由菜单层处理。
 * @param event - 键盘事件
 * @returns 是否由全局菜单层处理
 */
function shouldHandleGlobalEditShortcut(event: KeyboardEvent): boolean {
  return !isEditableShortcutTarget(event);
}

/**
 * 创建编辑菜单工具栏配置。
 * @returns 编辑菜单配置
 */
export function useEditActive(): { toolbarEditOptions: ComputedRef<ToolbarOptions> } {
  const { register: registerShortcuts } = useToolbarShortcuts();

  const toolbarEditOptions = computed<ToolbarOptions>(() => {
    return [
      {
        value: 'undo',
        label: '撤销',
        shortcut: EditorShortcuts.EDIT_UNDO,
        repeatableShortcut: true,
        shortcutGuard: shouldHandleGlobalEditShortcut,
        onClick: () => {
          emitter.emit('edit:undo');
        }
      },
      {
        value: 'redo',
        label: '重做',
        shortcut: EditorShortcuts.EDIT_REDO,
        repeatableShortcut: true,
        shortcutGuard: shouldHandleGlobalEditShortcut,
        onClick: () => {
          emitter.emit('edit:redo');
        }
      },
      { type: 'divider' },
      {
        value: 'copyPlainText',
        label: '复制为纯文本',
        disabled: false,
        onClick: async () => {
          emitter.emit('edit:copyPlainText');
        }
      },
      {
        value: 'copyMarkdown',
        label: '复制为 Markdown',
        disabled: false,
        onClick: async () => {
          emitter.emit('edit:copyMarkdown');
        }
      },
      {
        value: 'copyHtml',
        label: '复制为 HTML 代码',
        disabled: false,
        onClick: async () => {
          emitter.emit('edit:copyHtml');
        }
      }
    ];
  });

  const cleanup = registerShortcuts(toolbarEditOptions.value);
  onUnmounted(cleanup);

  return { toolbarEditOptions };
}
