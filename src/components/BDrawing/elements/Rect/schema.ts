/**
 * @file schema.ts
 * @description BDrawing 矩形元素注册配置。
 */
import type { DrawingElementSchema } from '../types';
import { DRAWING_DEFAULT_ELEMENT_STYLE } from '../../constants/style';

/**
 * 矩形元素注册配置。
 */
export const rectElementSchema: DrawingElementSchema = {
  name: 'rect',
  label: '矩形',
  icon: 'lucide:square',
  style: DRAWING_DEFAULT_ELEMENT_STYLE
};
