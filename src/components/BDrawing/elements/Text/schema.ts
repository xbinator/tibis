/**
 * @file schema.ts
 * @description BDrawing 文本元素注册配置。
 */
import type { DrawingElementSchema } from '../types';
import { measureDrawingTextElementSize } from '../../utils/drawingTextMetrics';

/**
 * 文本元素注册配置。
 */
export const textElementSchema: DrawingElementSchema = {
  name: 'text',
  label: '文本',
  icon: 'lucide:type',
  renderSize: {
    width: 'content',
    height: 'content',
    measureContent: (element) => measureDrawingTextElementSize(element.title, element.style)
  },
  createAnchor: 'top-left',
  createCursor: 'text'
};
