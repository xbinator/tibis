/**
 * @file schema.ts
 * @description BDrawing 文本元素注册配置。
 */
import type { DrawingMetadata, DrawingShapeElement, DrawingSize } from '../../types';
import type { DrawingElementSchema } from '../types';
import { measureDrawingTextElementSize } from '../../utils/drawingTextMetrics';

/** 文本元素默认内容。 */
export const DRAWING_TEXT_DEFAULT_CONTENT = '文本';

/**
 * 文本元素自定义元数据。
 */
export interface DrawingTextElementMetadata extends DrawingMetadata {
  /** 文本正文内容 */
  content: string;
}

/**
 * 读取文本元素正文内容，兼容旧数据中曾存放在 title 的文本。
 * @param element - 文本元素
 * @returns 文本正文内容
 */
export function readDrawingTextElementContent(element: Pick<DrawingShapeElement, 'metadata' | 'title'>): string {
  const { content } = element.metadata;

  return typeof content === 'string' ? content : element.title;
}

/**
 * 文本元素注册配置。
 */
export const textElementSchema: DrawingElementSchema = {
  name: 'text',
  label: '文本',
  icon: 'lucide:type',
  metadata: {
    content: DRAWING_TEXT_DEFAULT_CONTENT
  } satisfies DrawingTextElementMetadata,
  renderSize: {
    width: 'content',
    height: 'content',
    measureContent: (element: DrawingShapeElement): DrawingSize => measureDrawingTextElementSize(readDrawingTextElementContent(element), element.style)
  },
  createAnchor: 'top-left',
  createCursor: 'text'
};
