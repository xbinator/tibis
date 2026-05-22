/**
 * @file keymaps.ts
 * @description 键盘快捷键配置常量
 */

/**
 * 编辑器快捷键配置
 */
export const EDITOR_KEYMAP_CONFIG = {
  /** 变量选择导航 */
  variable: {
    arrowUp: 'ArrowUp',
    arrowDown: 'ArrowDown',
    enter: 'Enter'
  },
  /** 斜杠命令导航 */
  slashCommand: {
    arrowUp: 'ArrowUp',
    arrowDown: 'ArrowDown',
    enter: 'Enter',
    escape: 'Escape'
  },
  /** 文件提及导航 */
  fileMention: {
    arrowUp: 'ArrowUp',
    arrowDown: 'ArrowDown',
    enter: 'Enter',
    escape: 'Escape'
  },
  /** 通用 */
  general: {
    escape: 'Escape',
    shiftEnter: 'Shift-Enter',
    enter: 'Enter',
    backspace: 'Backspace',
    delete: 'Delete',
    tab: 'Tab'
  }
} as const;
