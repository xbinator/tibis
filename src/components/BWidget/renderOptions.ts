/**
 * @file renderOptions.ts
 * @description BWidget 渲染求值与内容测量共享选项。
 */
import type { WidgetRenderContextOptions } from './types';
import type { WidgetRenderContext } from 'types/widget';

/**
 * Widget 渲染求值选项。
 */
export interface WidgetRenderEvaluationOptions {
  /** Widget 渲染上下文 */
  renderContext?: WidgetRenderContext;
  /** Widget 渲染模式选项 */
  renderOptions?: WidgetRenderContextOptions;
}
