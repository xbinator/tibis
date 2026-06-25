/**
 * @file schema.ts
 * @description BDrawing 文本元素注册配置。
 */
import type { DrawingElementSchema } from '../types';

/**
 * 文本元素注册配置。
 */
export const textElementSchema: DrawingElementSchema = {
  name: 'text',
  label: '文本',
  icon: 'lucide:type'
};
