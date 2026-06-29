/**
 * @file types.ts
 * @description 绘图页面级共享类型定义。
 */

/**
 * 多选外接框布局变更。
 */
export interface WidgetMultiSelectLayoutChange {
  /** 外接框左上横坐标 */
  x?: number;
  /** 外接框左上纵坐标 */
  y?: number;
  /** 外接框宽度 */
  width?: number;
  /** 外接框高度 */
  height?: number;
}
