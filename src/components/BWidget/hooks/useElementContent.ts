/**
 * @file useElementContent.ts
 * @description BWidget 元素内容 hook。
 */
import type { WidgetShapeElement } from '../types';
import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import { resolveWidgetTemplateFieldText } from '../utils/widgetBindings';
import { useRenderContext } from './useRenderContext';

/**
 * 创建元素模板字段内容计算值。
 * @param element - 当前元素
 * @param fieldName - 元数据字段名称
 * @returns 元素内容
 */
export function useElementContent(element: Readonly<Ref<WidgetShapeElement | undefined>>, fieldName: string): ComputedRef<string> {
  const renderContext = useRenderContext();

  return computed<string>((): string => (element.value ? resolveWidgetTemplateFieldText(element.value.metadata, fieldName, renderContext.value) : ''));
}
