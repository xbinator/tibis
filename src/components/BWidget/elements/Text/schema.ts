/**
 * @file schema.ts
 * @description BWidget 文本元素注册配置。
 */
import type { WidgetMetadata } from '../../types';
import type { WidgetElementSchema } from '../types';
import { WIDGET_DEFAULT_ELEMENT_STYLE } from '../../constants/style';
import { createWidgetTextRenderSize } from '../../utils/widgetTextMetrics';

/** 文本元素默认内容。 */
export const WIDGET_TEXT_DEFAULT_CONTENT = '文本';

/**
 * 文本元素自定义元数据。
 */
export interface WidgetTextElementMetadata extends WidgetMetadata {
  /** 文本正文内容 */
  content: string;
}

/**
 * 文本元素注册配置。
 */
export const textElementSchema: WidgetElementSchema = {
  name: 'text',
  label: '文本',
  icon: 'lucide:type',
  metadata: {
    content: WIDGET_TEXT_DEFAULT_CONTENT
  } satisfies WidgetTextElementMetadata,
  style: WIDGET_DEFAULT_ELEMENT_STYLE,
  renderSize: createWidgetTextRenderSize('content'),
  resize: {
    enabled: true
  },
  createAnchor: 'top-left',
  createCursor: 'text'
};
