/**
 * @file schema.ts
 * @description BWidget 矩形元素注册配置。
 */
import type { WidgetElementSchema } from '../types';
import { WIDGET_DEFAULT_ELEMENT_STYLE } from '../../constants/style';

/**
 * 矩形元素注册配置。
 */
export const rectElementSchema: WidgetElementSchema = {
  name: 'rect',
  label: '矩形',
  icon: 'lucide:square',
  style: WIDGET_DEFAULT_ELEMENT_STYLE
};
