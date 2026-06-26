/**
 * @file types.ts
 * @description BDrawing 元素注册配置类型。
 * BDrawing 元素注册配置，仅描述侧边栏展示元信息。
 */
import type { DrawingElementCreateAnchor, DrawingShapeElement, DrawingSize } from '../types';

/**
 * 元素渲染尺寸来源。
 */
export type DrawingElementRenderSizeSource = 'model' | 'content';

/**
 * 元素渲染尺寸配置。
 */
export interface DrawingElementRenderSizeConfig {
  /** 宽度来源 */
  width: DrawingElementRenderSizeSource;
  /** 高度来源 */
  height: DrawingElementRenderSizeSource;
  /**
   * 测量内容尺寸。
   * @param element - 画图元素
   * @returns 内容尺寸
   */
  measureContent: (element: DrawingShapeElement) => DrawingSize;
}

/**
 * BDrawing 元素注册配置。
 */
export interface DrawingElementSchema {
  /** 元素名称 */
  name: string;
  /** 元素显示名称 */
  label: string;
  /** 侧边栏显示图标 */
  icon: string;
  /** 元素渲染尺寸配置 */
  renderSize?: DrawingElementRenderSizeConfig;
  /** 点击创建时的锚点，默认以中心点创建 */
  createAnchor?: DrawingElementCreateAnchor;
  /** 创建工具激活时的画布光标，默认使用 crosshair */
  createCursor?: string;
}
