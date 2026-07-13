/**
 * @file roles.ts
 * @description BWidget 元素工具角色定义与派生类型。
 */

/**
 * BWidget 侧边栏元素角色定义，数组顺序即展示顺序。
 */
export const WIDGET_ELEMENT_ROLES = [
  { key: 'basic', label: '基础' },
  { key: 'interaction', label: '交互' }
] as const;

/**
 * Widget 元素工具角色键，由角色定义自动派生。
 */
export type WidgetElementRole = (typeof WIDGET_ELEMENT_ROLES)[number]['key'];

/**
 * Widget 元素工具角色定义，由有序角色常量自动派生。
 */
export type WidgetElementRoleDefinition = (typeof WIDGET_ELEMENT_ROLES)[number];
