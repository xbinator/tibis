/**
 * @file widgetStyle.ts
 * @description BWidget 元素样式到 CSS 属性的转换工具。
 */
import type { WidgetBoxSideValue, WidgetCornerRadiusValue, WidgetElementStyle } from '../types';
import type { CSSProperties } from 'vue';

/**
 * 归一化非负盒模型数值。
 * @param value - 原始数值
 * @returns 可用于 CSS 的非负数值
 */
function normalizeBoxNumber(value: number | undefined): number {
  return Math.max(0, value ?? 0);
}

/**
 * 将数值转换为 px 单位。
 * @param value - 原始数值
 * @returns px 字符串
 */
function toPixelValue(value: number): string {
  return `${normalizeBoxNumber(value)}px`;
}

/**
 * 判断盒模型值是否为四边对象。
 * @param value - 盒模型值
 * @returns 是否为四边对象
 */
function isWidgetBoxSides(value: WidgetBoxSideValue | undefined): value is Exclude<WidgetBoxSideValue, number> {
  return typeof value === 'object' && value !== null;
}

/**
 * 判断圆角值是否为四角对象。
 * @param value - 圆角值
 * @returns 是否为四角对象
 */
function isWidgetCornerRadius(value: WidgetCornerRadiusValue | undefined): value is Exclude<WidgetCornerRadiusValue, number> {
  return typeof value === 'object' && value !== null;
}

/**
 * 解析四边数值，供渲染和文本测量共用。
 * @param value - 盒模型数值
 * @param fallback - 缺省数值
 * @returns 归一化后的四边数值
 */
export function resolveWidgetBoxSideNumbers(value: WidgetBoxSideValue | undefined, fallback: number): Exclude<WidgetBoxSideValue, number> {
  if (isWidgetBoxSides(value)) {
    return {
      top: normalizeBoxNumber(value.top),
      right: normalizeBoxNumber(value.right),
      bottom: normalizeBoxNumber(value.bottom),
      left: normalizeBoxNumber(value.left)
    };
  }

  const normalizedValue = normalizeBoxNumber(value ?? fallback);

  return {
    top: normalizedValue,
    right: normalizedValue,
    bottom: normalizedValue,
    left: normalizedValue
  };
}

/**
 * 应用边框宽度 CSS 属性。
 * @param properties - CSS 属性对象
 * @param borderWidth - 边框宽度
 */
function assignBorderWidthProperties(properties: CSSProperties, borderWidth: WidgetBoxSideValue | undefined): void {
  if (borderWidth === undefined) {
    return;
  }

  if (isWidgetBoxSides(borderWidth)) {
    properties.borderTopWidth = toPixelValue(borderWidth.top);
    properties.borderRightWidth = toPixelValue(borderWidth.right);
    properties.borderBottomWidth = toPixelValue(borderWidth.bottom);
    properties.borderLeftWidth = toPixelValue(borderWidth.left);
    return;
  }

  properties.borderWidth = toPixelValue(borderWidth);
}

/**
 * 应用圆角 CSS 属性。
 * @param properties - CSS 属性对象
 * @param borderRadius - 圆角数值
 */
function assignBorderRadiusProperties(properties: CSSProperties, borderRadius: WidgetCornerRadiusValue | undefined): void {
  if (borderRadius === undefined) {
    return;
  }

  if (isWidgetCornerRadius(borderRadius)) {
    properties.borderTopLeftRadius = toPixelValue(borderRadius.topLeft);
    properties.borderTopRightRadius = toPixelValue(borderRadius.topRight);
    properties.borderBottomRightRadius = toPixelValue(borderRadius.bottomRight);
    properties.borderBottomLeftRadius = toPixelValue(borderRadius.bottomLeft);
    return;
  }

  properties.borderRadius = toPixelValue(borderRadius);
}

/**
 * 应用内边距 CSS 属性。
 * @param properties - CSS 属性对象
 * @param padding - 内边距数值
 */
function assignPaddingProperties(properties: CSSProperties, padding: WidgetBoxSideValue | undefined): void {
  if (padding === undefined) {
    return;
  }

  if (isWidgetBoxSides(padding)) {
    properties.paddingTop = toPixelValue(padding.top);
    properties.paddingRight = toPixelValue(padding.right);
    properties.paddingBottom = toPixelValue(padding.bottom);
    properties.paddingLeft = toPixelValue(padding.left);
    return;
  }

  properties.padding = toPixelValue(padding);
}

/**
 * 创建Widget元素盒模型 CSS 属性。
 * @param style - 元素样式
 * @returns Vue CSS 属性对象
 */
export function createWidgetElementStyleProperties(style?: WidgetElementStyle): CSSProperties {
  const properties: CSSProperties = {
    backgroundColor: style?.backgroundColor,
    borderColor: style?.borderColor,
    borderStyle: style?.borderStyle
  };

  assignBorderWidthProperties(properties, style?.borderWidth);
  assignBorderRadiusProperties(properties, style?.borderRadius);
  assignPaddingProperties(properties, style?.padding);

  return properties;
}

/**
 * 解析文字横向对齐到 flex 对齐方式。
 * @param textAlign - 文字横向对齐
 * @returns flex 主轴对齐方式
 */
export function resolveWidgetElementHorizontalAlign(textAlign: WidgetElementStyle['textAlign']): string | undefined {
  if (textAlign === 'left') {
    return 'flex-start';
  }

  if (textAlign === 'right') {
    return 'flex-end';
  }

  if (textAlign === 'center') {
    return 'center';
  }

  if (textAlign === 'justify') {
    return 'space-between';
  }

  return undefined;
}

/**
 * 解析文字纵向对齐到 flex 对齐方式。
 * @param textVerticalAlign - 文字纵向对齐
 * @returns flex 交叉轴对齐方式
 */
export function resolveWidgetElementVerticalAlign(textVerticalAlign: WidgetElementStyle['textVerticalAlign']): string | undefined {
  if (textVerticalAlign === 'top') {
    return 'flex-start';
  }

  if (textVerticalAlign === 'bottom') {
    return 'flex-end';
  }

  if (textVerticalAlign === 'middle') {
    return 'center';
  }

  return undefined;
}

/**
 * 创建Widget元素内容排版 CSS 属性。
 * @param style - 元素样式
 * @returns Vue CSS 属性对象
 */
export function createWidgetElementContentStyleProperties(style?: WidgetElementStyle): CSSProperties {
  return {
    alignItems: resolveWidgetElementVerticalAlign(style?.textVerticalAlign),
    color: style?.color,
    fontSize: style?.fontSize === undefined ? undefined : `${style.fontSize}px`,
    fontWeight: style?.fontWeight,
    justifyContent: resolveWidgetElementHorizontalAlign(style?.textAlign),
    textAlign: style?.textAlign
  };
}
