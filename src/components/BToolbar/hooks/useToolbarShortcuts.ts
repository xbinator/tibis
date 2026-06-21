/**
 * @file useToolbarShortcuts.ts
 * @description BToolbar 菜单快捷键注册 Hook。
 */
import type { ToolbarOption, ToolbarOptions } from '../types';
import { useShortcuts } from '@/hooks/useShortcuts';

/**
 * BToolbar 快捷键注册结果。
 */
interface UseToolbarShortcutsResult {
  /** 注册工具栏菜单项快捷键。 */
  register: (options: ToolbarOptions) => () => void;
}

/**
 * 创建工具栏快捷键注册器。
 * @returns 工具栏快捷键注册 API
 */
export function useToolbarShortcuts(): UseToolbarShortcutsResult {
  const { registerShortcuts } = useShortcuts();

  /**
   * 注册工具栏菜单项快捷键。
   * @param options - 工具栏菜单项列表
   * @returns 取消注册函数
   */
  function register(options: ToolbarOptions): () => void {
    const shortcuts = options
      .filter((item): item is ToolbarOption => item.type !== 'divider')
      .filter((item) => item.shortcut && item.onClick && item.enableShortcut !== false && item.disabled !== true)
      .map((item) => ({
        key: item.shortcut!,
        handler: item.onClick!,
        guard: item.shortcutGuard,
        repeatable: item.repeatableShortcut === true
      }));

    return registerShortcuts(shortcuts);
  }

  return { register };
}
