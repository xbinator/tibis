/**
 * @file widgetPreviewContext.ts
 * @description BWidget 设计期预览上下文读写工具。
 */
import type { WidgetMetadata, WidgetRenderContext } from '../types';
import { isPlainObject } from 'lodash-es';

/** 设计期预览上下文存放在Widget metadata 中的字段名。 */
export const WIDGET_PREVIEW_CONTEXT_METADATA_KEY = 'previewContext';

/**
 * 判断未知值是否为普通对象记录。
 * @param value - 待判断的未知值
 * @returns 是否为普通对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 读取预览上下文中的对象根。
 * @param value - 原始根值
 * @returns 可用于渲染上下文的对象
 */
function readPreviewContextRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * 从Widget metadata 中读取设计期预览渲染上下文。
 * @param metadata - Widget metadata
 * @returns 预览渲染上下文，未配置时返回 undefined
 */
export function readWidgetPreviewRenderContext(metadata: WidgetMetadata): WidgetRenderContext | undefined {
  const previewContext = metadata[WIDGET_PREVIEW_CONTEXT_METADATA_KEY];

  if (!isRecord(previewContext)) {
    return undefined;
  }

  return {
    input: readPreviewContextRecord(previewContext.input),
    state: readPreviewContextRecord(previewContext.state)
  };
}

/**
 * 向Widget metadata 写入设计期预览渲染上下文。
 * @param metadata - 原始Widget metadata
 * @param context - 预览渲染上下文
 * @returns 写入预览上下文后的 metadata
 */
export function writeWidgetPreviewRenderContext(metadata: WidgetMetadata, context: WidgetRenderContext): WidgetMetadata {
  return {
    ...metadata,
    [WIDGET_PREVIEW_CONTEXT_METADATA_KEY]: context
  };
}
