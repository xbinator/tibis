/**
 * @file types.ts
 * @description BWidget 元素注册配置类型。
 * BWidget 元素注册配置，仅描述侧边栏展示元信息。
 */
import type { WidgetElementCreateAnchor, WidgetElementStyle, WidgetMetadata, WidgetShapeElement, WidgetSize } from '../types';
import type { WidgetRenderContext } from 'types/widget';

/**
 * 元素渲染尺寸来源。
 */
export type WidgetElementRenderSizeSource = 'model' | 'content' | 'model-min-content';

/**
 * 元素渲染尺寸配置。
 */
export interface WidgetElementRenderSizeConfig {
  /** 宽度来源 */
  width: WidgetElementRenderSizeSource;
  /** 高度来源 */
  height: WidgetElementRenderSizeSource;
  /**
   * 测量内容尺寸。
   * @param element - Widget元素
   * @param renderContext - Widget渲染上下文
   * @returns 内容尺寸
   */
  measureContent: (element: WidgetShapeElement, renderContext?: WidgetRenderContext) => WidgetSize;
}

/**
 * 元素 Moveable 缩放配置。
 */
export interface WidgetElementResizeConfig {
  /** 是否允许通过控制框修改尺寸，默认允许 */
  enabled?: boolean;
}

/**
 * BWidget 元素注册配置。
 */
export interface WidgetElementSchema {
  /** 元素名称 */
  name: string;
  /** 元素显示名称 */
  label: string;
  /** 侧边栏显示图标 */
  icon: string;
  /** 元素渲染尺寸配置 */
  renderSize?: WidgetElementRenderSizeConfig;
  /** 点击创建时的锚点，默认以中心点创建 */
  createAnchor?: WidgetElementCreateAnchor;
  /** 创建工具激活时的Widget光标，默认使用 crosshair */
  createCursor?: string;
  /** 元素缩放能力配置 */
  resize?: WidgetElementResizeConfig;
  /** 创建元素时写入元素的默认自定义元数据 */
  metadata?: WidgetMetadata;
  /** 创建元素时写入元素的默认样式 */
  style?: WidgetElementStyle;
}
