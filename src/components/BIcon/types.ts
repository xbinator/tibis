/**
 * BIcon 组件 Props 类型定义
 */

export interface BIconProps {
  /** 图标名称，对应 Iconify 图标集（如 `lucide:home`） */
  icon?: string;
  /** 图标尺寸，数字为 px，字符串可带单位 */
  size?: number | string;
  /** 图标颜色 */
  color?: string;
  /** 旋转角度（deg） */
  rotate?: number;
}
