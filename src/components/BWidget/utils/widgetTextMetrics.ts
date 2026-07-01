/**
 * @file widgetTextMetrics.ts
 * @description BWidget 文本元素尺寸测量工具。
 */
import type { WidgetElementRenderSizeConfig } from '../elements/types';
import type { WidgetElementStyle, WidgetShapeElement, WidgetSize } from '../types';
import type { WidgetRenderContext } from 'types/widget';
import {
  WIDGET_TEXT_DEFAULT_FONT_SIZE,
  WIDGET_TEXT_DEFAULT_FONT_WEIGHT,
  WIDGET_TEXT_FULL_WIDTH_CHARACTER_WIDTH_RATIO,
  WIDGET_TEXT_HORIZONTAL_PADDING,
  WIDGET_TEXT_LATIN_CHARACTER_WIDTH_RATIO,
  WIDGET_TEXT_LINE_HEIGHT_RATIO,
  WIDGET_TEXT_NARROW_CHARACTER_WIDTH_RATIO,
  WIDGET_TEXT_SPACE_CHARACTER_WIDTH_RATIO,
  WIDGET_TEXT_VERTICAL_PADDING
} from '../constants/text';
import { resolveWidgetTemplateFieldText } from './widgetBindings';
import { resolveWidgetBoxSideNumbers } from './widgetStyle';

/** 文本测量Widget缓存。 */
let widgetTextMeasureCanvas: HTMLCanvasElement | null = null;

/**
 * 文本元素尺寸测量选项。
 */
interface WidgetTextMeasureOptions {
  /** 文本元素最大渲染宽度，用于自动换行 */
  maxWidth?: number;
}

/**
 * 归一化文本尺寸数值，减少浮点噪声。
 * @param value - 原始数值
 * @returns 归一化数值
 */
function normalizeTextMetricValue(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 判断字符是否为全宽字符。
 * @param codePoint - 字符码点
 * @returns 是否为全宽字符
 */
function isFullWidthTextCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

/**
 * 判断字符是否为窄拉丁字符。
 * @param character - 单个字符
 * @returns 是否为窄字符
 */
function isNarrowLatinTextCharacter(character: string): boolean {
  return ['i', 'j', 'l', 'I', 'f', 't', 'r', '.', ',', ':', ';', '!', '|'].includes(character);
}

/**
 * 估算单个字符宽度。
 * @param character - 单个字符
 * @param fontSize - 字号
 * @returns 字符宽度
 */
function estimateWidgetTextCharacterWidth(character: string, fontSize: number): number {
  if (character === ' ' || character === '\t') {
    return fontSize * WIDGET_TEXT_SPACE_CHARACTER_WIDTH_RATIO;
  }

  const codePoint = character.codePointAt(0);
  if (codePoint !== undefined && isFullWidthTextCodePoint(codePoint)) {
    return fontSize * WIDGET_TEXT_FULL_WIDTH_CHARACTER_WIDTH_RATIO;
  }

  if (isNarrowLatinTextCharacter(character)) {
    return fontSize * WIDGET_TEXT_NARROW_CHARACTER_WIDTH_RATIO;
  }

  return fontSize * WIDGET_TEXT_LATIN_CHARACTER_WIDTH_RATIO;
}

/**
 * 估算文本行宽度。
 * @param line - 文本行
 * @param fontSize - 字号
 * @returns 文本行宽度
 */
function estimateWidgetTextLineWidth(line: string, fontSize: number): number {
  return Array.from(line).reduce((width: number, character: string): number => width + estimateWidgetTextCharacterWidth(character, fontSize), 0);
}

/**
 * 获取文本测量Widget上下文。
 * @returns Widget上下文，不支持时返回 null
 */
function getWidgetTextMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) {
    return null;
  }

  widgetTextMeasureCanvas ??= document.createElement('canvas');

  return widgetTextMeasureCanvas.getContext('2d');
}

/**
 * 读取文本行真实渲染宽度。
 * @param line - 文本行
 * @param fontSize - 字号
 * @param fontWeight - 字重
 * @returns 文本行宽度，无法测量时返回 null
 */
function measureWidgetTextLineWidth(line: string, fontSize: number, fontWeight: number): number | null {
  const context = getWidgetTextMeasureContext();
  if (!context) {
    return null;
  }

  context.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  return context.measureText(line).width;
}

/**
 * 读取文本行渲染宽度。
 * @param line - 文本行
 * @param fontSize - 字号
 * @param fontWeight - 字重
 * @returns 文本行宽度
 */
function getWidgetTextLineWidth(line: string, fontSize: number, fontWeight: number): number {
  return measureWidgetTextLineWidth(line, fontSize, fontWeight) ?? estimateWidgetTextLineWidth(line, fontSize);
}

/**
 * 读取用于文本换行的内容宽度。
 * @param maxWidth - 文本元素最大宽度
 * @param padding - 文本内边距尺寸
 * @returns 可用于文本内容的宽度，未限制时返回 null
 */
function getTextWrappingContentWidth(maxWidth: number | undefined, padding: { horizontal: number; vertical: number }): number | null {
  if (maxWidth === undefined) {
    return null;
  }

  return Math.max(1, maxWidth - padding.horizontal);
}

/**
 * 按最大内容宽度拆分单行文本。
 * @param line - 原始文本行
 * @param maxLineWidth - 最大内容宽度
 * @param fontSize - 字号
 * @param fontWeight - 字重
 * @returns 拆分后的渲染行
 */
function wrapWidgetTextLine(line: string, maxLineWidth: number | null, fontSize: number, fontWeight: number): string[] {
  if (maxLineWidth === null || getWidgetTextLineWidth(line, fontSize, fontWeight) <= maxLineWidth) {
    return [line];
  }

  const wrappedLines: string[] = [];
  let currentLine = '';

  Array.from(line).forEach((character: string): void => {
    const candidateLine = `${currentLine}${character}`;
    if (currentLine && getWidgetTextLineWidth(candidateLine, fontSize, fontWeight) > maxLineWidth) {
      wrappedLines.push(currentLine);
      currentLine = character;
      return;
    }

    currentLine = candidateLine;
  });

  wrappedLines.push(currentLine);

  return wrappedLines;
}

/**
 * 读取文本元素测量时使用的内边距。
 * @param style - 文本样式
 * @returns 横向与纵向内边距总和
 */
function getWidgetTextPaddingMetrics(style?: WidgetElementStyle): { horizontal: number; vertical: number } {
  if (style?.padding === undefined) {
    return {
      horizontal: WIDGET_TEXT_HORIZONTAL_PADDING,
      vertical: WIDGET_TEXT_VERTICAL_PADDING
    };
  }

  const padding = resolveWidgetBoxSideNumbers(style.padding, 0);

  return {
    horizontal: padding.left + padding.right,
    vertical: padding.top + padding.bottom
  };
}

/**
 * 按文本内容估算文本元素尺寸。
 * @param text - 文本内容
 * @param style - 文本样式
 * @param options - 文本测量选项
 * @returns 文本元素尺寸
 */
export function measureWidgetTextElementSize(text: string, style?: WidgetElementStyle, options: WidgetTextMeasureOptions = {}): WidgetSize {
  const fontSize = style?.fontSize ?? WIDGET_TEXT_DEFAULT_FONT_SIZE;
  const fontWeight = style?.fontWeight ?? WIDGET_TEXT_DEFAULT_FONT_WEIGHT;
  const lineHeight = fontSize * WIDGET_TEXT_LINE_HEIGHT_RATIO;
  const padding = getWidgetTextPaddingMetrics(style);
  const maxContentWidth = getTextWrappingContentWidth(options.maxWidth, padding);
  const lines = text.split('\n').flatMap((line: string): string[] => wrapWidgetTextLine(line, maxContentWidth, fontSize, fontWeight));
  const maxLineWidth = Math.max(1, ...lines.map((line: string): number => getWidgetTextLineWidth(line, fontSize, fontWeight)));

  return {
    width: normalizeTextMetricValue(
      options.maxWidth === undefined ? maxLineWidth + padding.horizontal : Math.min(options.maxWidth, maxLineWidth + padding.horizontal)
    ),
    height: normalizeTextMetricValue(Math.max(1, lines.length) * lineHeight + padding.vertical)
  };
}

/**
 * 创建按模板字段内容自适应高度的文本元素渲染尺寸配置。
 * @param fieldName - 元数据字段名称
 * @returns 文本元素渲染尺寸配置
 */
export function createWidgetTextRenderSize(fieldName: string): WidgetElementRenderSizeConfig {
  return {
    width: 'model',
    height: 'model-min-content',
    measureContent: (element: WidgetShapeElement, renderContext?: WidgetRenderContext): WidgetSize =>
      measureWidgetTextElementSize(resolveWidgetTemplateFieldText(element.metadata, fieldName, renderContext), element.style, {
        maxWidth: element.size.width
      })
  };
}
