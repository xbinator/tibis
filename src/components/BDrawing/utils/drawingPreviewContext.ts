/**
 * @file drawingPreviewContext.ts
 * @description BDrawing 设计期预览上下文读写工具。
 */
import type { DrawingMetadata, DrawingRenderContext } from '../types';
import { isPlainObject } from 'lodash-es';

/** 设计期预览上下文存放在画布 metadata 中的字段名。 */
export const DRAWING_PREVIEW_CONTEXT_METADATA_KEY = 'previewContext';

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
 * 从画布 metadata 中读取设计期预览渲染上下文。
 * @param metadata - 画布 metadata
 * @returns 预览渲染上下文，未配置时返回 undefined
 */
export function readDrawingPreviewRenderContext(metadata: DrawingMetadata): DrawingRenderContext | undefined {
  const previewContext = metadata[DRAWING_PREVIEW_CONTEXT_METADATA_KEY];

  if (!isRecord(previewContext)) {
    return undefined;
  }

  return {
    input: readPreviewContextRecord(previewContext.input),
    state: readPreviewContextRecord(previewContext.state),
    output: previewContext.output,
    lastResult: previewContext.lastResult
  };
}

/**
 * 向画布 metadata 写入设计期预览渲染上下文。
 * @param metadata - 原始画布 metadata
 * @param context - 预览渲染上下文
 * @returns 写入预览上下文后的 metadata
 */
export function writeDrawingPreviewRenderContext(metadata: DrawingMetadata, context: DrawingRenderContext): DrawingMetadata {
  return {
    ...metadata,
    [DRAWING_PREVIEW_CONTEXT_METADATA_KEY]: context
  };
}
