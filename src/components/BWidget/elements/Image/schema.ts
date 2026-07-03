/**
 * @file schema.ts
 * @description BWidget 图片元素注册配置。
 */
import type { WidgetMetadata } from '../../types';
import type { WidgetElementSchema } from '../types';
import { WIDGET_DEFAULT_ELEMENT_STYLE } from '../../constants/style';

/**
 * 图片填充模式，对应 CSS object-fit。
 */
export type WidgetImageFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

/**
 * 图片元素自定义元数据。
 */
export interface WidgetImageElementMetadata extends WidgetMetadata {
  /** 图片地址，支持变量插值 {{ ... }} */
  src: string;
  /** 图片填充模式，未设置时使用 WIDGET_IMAGE_DEFAULT_FIT */
  fit?: WidgetImageFit;
  /** 替代文本，用于无障碍；支持变量插值 */
  alt?: string;
}

/** 图片元素默认填充模式。 */
export const WIDGET_IMAGE_DEFAULT_FIT: WidgetImageFit = 'cover';

/**
 * 图片填充模式下拉选项。
 */
export const WIDGET_IMAGE_FIT_OPTIONS: { label: string; value: WidgetImageFit }[] = [
  { label: '填充裁剪（cover）', value: 'cover' },
  { label: '完整显示（contain）', value: 'contain' },
  { label: '拉伸填充（fill）', value: 'fill' },
  { label: '原始尺寸（none）', value: 'none' },
  { label: '缩小适应（scale-down）', value: 'scale-down' }
];

/**
 * 判断值是否为有效的图片填充模式。
 * @param value - 待判断的值
 * @returns 是否为 WidgetImageFit
 */
export function isWidgetImageFit(value: unknown): value is WidgetImageFit {
  return value === 'cover' || value === 'contain' || value === 'fill' || value === 'none' || value === 'scale-down';
}

/**
 * 读取图片元素填充模式，归一化为合法值；非法或未设置时返回默认值。
 * @param metadata - 元素元数据
 * @returns 填充模式
 */
export function readWidgetImageFit(metadata: WidgetMetadata): WidgetImageFit {
  return isWidgetImageFit(metadata.fit) ? metadata.fit : WIDGET_IMAGE_DEFAULT_FIT;
}

/**
 * 图片元素注册配置。
 * 通过泛型参数声明专属元数据类型，metadata 字段在写入时即获得 WidgetImageElementMetadata 校验。
 */
export const imageElementSchema: WidgetElementSchema<WidgetImageElementMetadata> = {
  name: 'image',
  label: '图片',
  icon: 'lucide:image',
  metadata: {
    src: '',
    fit: WIDGET_IMAGE_DEFAULT_FIT
  },
  style: WIDGET_DEFAULT_ELEMENT_STYLE,
  resize: {
    enabled: true
  },
  createAnchor: 'center',
  createCursor: 'crosshair'
};
