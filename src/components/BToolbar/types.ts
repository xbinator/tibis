/**
 * @file types.ts
 * @description BToolbar 菜单项类型定义。
 */
import type { DropdownOptionDivider, DropdownOptionItem } from '../BDropdown/type';

export interface ToolbarOption extends DropdownOptionItem {
  /** 是否处于选中态。 */
  selected?: boolean;
  /** 是否处于活跃态。 */
  active?: boolean;
  /** 菜单项对应的快捷键。 */
  shortcut?: string;
  /** 是否启用快捷键。 */
  enableShortcut?: boolean;
  /** 是否响应长按产生的重复快捷键事件。 */
  repeatableShortcut?: boolean;
  /** 快捷键作用域守卫。 */
  shortcutGuard?: (event: KeyboardEvent) => boolean;
}

export type ToolbarOptions = Array<ToolbarOption | DropdownOptionDivider>;
