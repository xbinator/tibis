/**
 * @file schema.ts
 * @description BDrawing 文本元素注册配置。
 */
import type { DrawingMetadata } from '../../types';
import type { DrawingElementSchema } from '../types';
import { DRAWING_DEFAULT_ELEMENT_STYLE } from '../../constants/style';
import { createDrawingTextRenderSize } from '../../utils/drawingTextMetrics';

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
 * 文本元素注册配置。
 */
export const textElementSchema: DrawingElementSchema = {
  name: 'text',
  label: '文本',
  icon: 'lucide:type',
  metadata: {
    content: DRAWING_TEXT_DEFAULT_CONTENT
  } satisfies DrawingTextElementMetadata,
  style: DRAWING_DEFAULT_ELEMENT_STYLE,
  renderSize: createDrawingTextRenderSize('content'),
  resize: {
    enabled: true
  },
  createAnchor: 'top-left',
  createCursor: 'text'
};
