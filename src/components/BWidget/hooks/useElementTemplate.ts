/**
 * @file useElementTemplate.ts
 * @description BWidget 元素模板读写 hook。
 */
import type { WidgetElement, WidgetMetadata } from '../types';
import type { Ref, WritableComputedRef } from 'vue';
import { computed } from 'vue';

/**
 * 写入模板字段。
 * @param metadata - 原始元素元数据
 * @param fieldName - 字段名称
 * @param value - 字段新值
 * @returns 写入后的元素元数据
 */
function writeTemplateFieldMetadata(metadata: WidgetMetadata, fieldName: string, value: string): WidgetMetadata {
  return {
    ...metadata,
    [fieldName]: value
  };
}

/**
 * 读取模板字段。
 * @param metadata - 元素元数据
 * @param fieldName - 字段名称
 * @returns 字段文本
 */
function readTemplateFieldMetadata(metadata: WidgetMetadata, fieldName: string): string {
  const value = metadata[fieldName];

  return typeof value === 'string' ? value : '';
}

/**
 * 创建元素模板字段的可写计算值。
 * @param element - 当前编辑元素
 * @param fieldName - 元数据字段名称
 * @returns 可直接绑定到输入组件的字段值
 */
export function useElementTemplate(element: Ref<WidgetElement>, fieldName: string): WritableComputedRef<string> {
  return computed<string>({
    /**
     * 读取模板字段内容。
     * @returns 字段模板内容
     */
    get: (): string => readTemplateFieldMetadata(element.value.metadata, fieldName),
    /**
     * 写入模板字段内容。
     * @param value - 字段新值
     */
    set: (value: string): void => {
      element.value.metadata = writeTemplateFieldMetadata(element.value.metadata, fieldName, value);
    }
  });
}
