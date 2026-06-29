/**
 * @file useElementDisplayContent.ts
 * @description BDrawing 元素展示内容 hook。
 */
import type { DrawingShapeElement } from '../types';
import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import { resolveDrawingTemplateFieldText } from '../utils/drawingBindings';
import { useRenderContext } from './useRenderContext';

/**
 * 创建元素模板字段展示内容计算值。
 * @param element - 当前元素
 * @param fieldName - 元数据字段名称
 * @returns 元素展示内容
 */
export function useElementDisplayContent(element: Readonly<Ref<DrawingShapeElement | undefined>>, fieldName: string): ComputedRef<string> {
  const renderContext = useRenderContext();

  return computed<string>((): string => (element.value ? resolveDrawingTemplateFieldText(element.value.metadata, fieldName, renderContext.value) : ''));
}
