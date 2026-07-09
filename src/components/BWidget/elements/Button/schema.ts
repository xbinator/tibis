/**
 * @file schema.ts
 * @description BWidget 按钮元素注册配置。
 */
import type { WidgetElementStyle, WidgetMetadata } from '../../types';
import type { MethodAction } from '../../utils/widgetMethods';
import type { WidgetElementSchema } from '../types';
import type { BTextSelectOption } from '@/components/BText/types';

/** 按钮元素默认文字。 */
export const WIDGET_BUTTON_DEFAULT_TEXT = '按钮';

/** 按钮布尔控制值，字符串表示 {{ }} 变量模板。 */
export type WidgetButtonBooleanValue = boolean | string;

/** 按钮状态选项。 */
export const WIDGET_BUTTON_DISABLED_OPTIONS: BTextSelectOption[] = [
  { label: '启用', value: false },
  { label: '禁用', value: true }
];

/** 按钮加载选项。 */
export const WIDGET_BUTTON_LOADING_OPTIONS: BTextSelectOption[] = [
  { label: '关闭', value: false },
  { label: '加载中', value: true }
];

/**
 * 按钮元素默认视觉样式。
 */
export const WIDGET_BUTTON_DEFAULT_STYLE: WidgetElementStyle = {
  backgroundColor: '#1677ff',
  borderColor: '#1677ff',
  borderRadius: 6,
  borderStyle: 'solid',
  borderWidth: 1,
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 500,
  textAlign: 'center',
  textVerticalAlign: 'middle'
};

/** 按钮点击动作配置。 */
export type WidgetButtonAction = MethodAction;

/**
 * 按钮元素自定义元数据。
 */
export interface WidgetButtonElementMetadata extends WidgetMetadata {
  /** 按钮展示文字，支持变量插值 {{ ... }} */
  text: string;
  /** 是否禁用按钮交互，支持 {{ }} 变量模板 */
  disabled: WidgetButtonBooleanValue;
  /** 是否展示加载状态并阻止重复点击，支持 {{ }} 变量模板 */
  loading: WidgetButtonBooleanValue;
  /** 点击动作列表 */
  actions: WidgetButtonAction[];
}

/**
 * 按钮元素注册配置。
 */
export const buttonElementSchema: WidgetElementSchema<WidgetButtonElementMetadata> = {
  name: 'button',
  label: '按钮',
  icon: 'lucide:mouse-pointer-click',
  metadata: {
    actions: [],
    disabled: false,
    loading: false,
    text: WIDGET_BUTTON_DEFAULT_TEXT
  },
  style: WIDGET_BUTTON_DEFAULT_STYLE,
  resize: {
    enabled: true
  },
  createAnchor: 'center',
  createCursor: 'pointer'
};
