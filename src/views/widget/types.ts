/**
 * @file types.ts
 * @description 绘图页面级共享类型定义。
 */
import type { WidgetElementLoopConfig } from '@/components/BWidget/types';

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

/**
 * Widget元素循环配置变更。
 */
export interface WidgetLoopChangePayload {
  /** 需要写入循环配置的元素 ID 列表 */
  elementIds: string[];
  /** 下一份循环配置 */
  config: WidgetElementLoopConfig;
}
