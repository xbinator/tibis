/**
 * @file selectionInputKeyboard.ts
 * @description 选区悬浮输入框共用的键盘事件判断工具。
 */

/**
 * 判断 Enter 是否用于确认输入法候选词。
 * @param event - 原生键盘事件
 * @returns 输入法正在组合输入或兼容事件使用 229 键码时返回 true
 */
export function isImeConfirm(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.isComposing || event.keyCode === 229);
}
