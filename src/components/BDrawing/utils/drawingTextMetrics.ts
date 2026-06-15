/**
 * @file drawingTextMetrics.ts
 * @description BDrawing 文本元素尺寸测量工具。
 */
import type { DrawingElementStyle, DrawingSize } from '../types';
import {
  DRAWING_TEXT_DEFAULT_FONT_SIZE,
  DRAWING_TEXT_DEFAULT_FONT_WEIGHT,
  DRAWING_TEXT_FULL_WIDTH_CHARACTER_WIDTH_RATIO,
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LATIN_CHARACTER_WIDTH_RATIO,
  DRAWING_TEXT_LINE_HEIGHT_RATIO,
  DRAWING_TEXT_NARROW_CHARACTER_WIDTH_RATIO,
  DRAWING_TEXT_SPACE_CHARACTER_WIDTH_RATIO,
  DRAWING_TEXT_VERTICAL_PADDING
} from '../constants/text';

/**
 * 渲染文本行。
 */
export interface DrawingTextLineItem {
  /** 渲染文本 */
  text: string;
  /** 是否为空行 */
  empty: boolean;
}

export {
  DRAWING_TEXT_DEFAULT_FONT_SIZE,
  DRAWING_TEXT_DEFAULT_FONT_WEIGHT,
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_RATIO,
  DRAWING_TEXT_VERTICAL_PADDING
} from '../constants/text';
/** 文本测量画布缓存。 */
let drawingTextMeasureCanvas: HTMLCanvasElement | null = null;

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
function estimateDrawingTextCharacterWidth(character: string, fontSize: number): number {
  if (character === ' ' || character === '\t') {
    return fontSize * DRAWING_TEXT_SPACE_CHARACTER_WIDTH_RATIO;
  }

  const codePoint = character.codePointAt(0);
  if (codePoint !== undefined && isFullWidthTextCodePoint(codePoint)) {
    return fontSize * DRAWING_TEXT_FULL_WIDTH_CHARACTER_WIDTH_RATIO;
  }

  if (isNarrowLatinTextCharacter(character)) {
    return fontSize * DRAWING_TEXT_NARROW_CHARACTER_WIDTH_RATIO;
  }

  return fontSize * DRAWING_TEXT_LATIN_CHARACTER_WIDTH_RATIO;
}

/**
 * 估算文本行宽度。
 * @param line - 文本行
 * @param fontSize - 字号
 * @returns 文本行宽度
 */
function estimateDrawingTextLineWidth(line: string, fontSize: number): number {
  return Array.from(line).reduce((width: number, character: string): number => width + estimateDrawingTextCharacterWidth(character, fontSize), 0);
}

/**
 * 获取文本测量画布上下文。
 * @returns 画布上下文，不支持时返回 null
 */
function getDrawingTextMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) {
    return null;
  }

  drawingTextMeasureCanvas ??= document.createElement('canvas');

  return drawingTextMeasureCanvas.getContext('2d');
}

/**
 * 读取文本行真实渲染宽度。
 * @param line - 文本行
 * @param fontSize - 字号
 * @param fontWeight - 字重
 * @returns 文本行宽度，无法测量时返回 null
 */
function measureDrawingTextLineWidth(line: string, fontSize: number, fontWeight: number): number | null {
  const context = getDrawingTextMeasureContext();
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
function getDrawingTextLineWidth(line: string, fontSize: number, fontWeight: number): number {
  return measureDrawingTextLineWidth(line, fontSize, fontWeight) ?? estimateDrawingTextLineWidth(line, fontSize);
}

/**
 * 创建不自动换行的文本行。
 * @param text - 文本内容
 * @returns 文本行
 */
export function createDrawingTextLineItems(text: string): DrawingTextLineItem[] {
  return text.split('\n').map((line: string): DrawingTextLineItem => ({ empty: !line, text: line || '\u00a0' }));
}

/**
 * 按最大宽度拆分文本行。
 * @param text - 文本内容
 * @param maxWidth - 文本容器宽度
 * @param style - 文本样式
 * @returns 拆分后的文本行
 */
export function wrapDrawingTextLineItems(text: string, maxWidth: number, style?: DrawingElementStyle): DrawingTextLineItem[] {
  const fontSize = style?.fontSize ?? DRAWING_TEXT_DEFAULT_FONT_SIZE;
  const fontWeight = style?.fontWeight ?? DRAWING_TEXT_DEFAULT_FONT_WEIGHT;
  const maxContentWidth = Math.max(1, maxWidth - DRAWING_TEXT_HORIZONTAL_PADDING);

  return text.split('\n').flatMap((paragraph: string): DrawingTextLineItem[] => {
    if (!paragraph) {
      return [{ empty: true, text: '\u00a0' }];
    }

    const lines: DrawingTextLineItem[] = [];
    let currentLine = '';

    for (const character of Array.from(paragraph)) {
      const nextLine = `${currentLine}${character}`;
      if (currentLine && getDrawingTextLineWidth(nextLine, fontSize, fontWeight) > maxContentWidth) {
        lines.push({ empty: false, text: currentLine });
        currentLine = character;
        continue;
      }

      currentLine = nextLine;
    }

    lines.push({ empty: false, text: currentLine });

    return lines;
  });
}

/**
 * 按文本内容估算文本元素尺寸。
 * @param text - 文本内容
 * @param style - 文本样式
 * @returns 文本元素尺寸
 */
export function measureDrawingTextElementSize(text: string, style?: DrawingElementStyle): DrawingSize {
  const fontSize = style?.fontSize ?? DRAWING_TEXT_DEFAULT_FONT_SIZE;
  const fontWeight = style?.fontWeight ?? DRAWING_TEXT_DEFAULT_FONT_WEIGHT;
  const lineHeight = fontSize * DRAWING_TEXT_LINE_HEIGHT_RATIO;
  const lines = text.split('\n');
  const maxLineWidth = Math.max(1, ...lines.map((line: string): number => getDrawingTextLineWidth(line, fontSize, fontWeight)));

  return {
    width: normalizeTextMetricValue(maxLineWidth + DRAWING_TEXT_HORIZONTAL_PADDING),
    height: normalizeTextMetricValue(Math.max(1, lines.length) * lineHeight + DRAWING_TEXT_VERTICAL_PADDING)
  };
}

/**
 * 按容器宽度估算普通形状中换行文本需要的高度。
 * @param text - 文本内容
 * @param width - 文本容器宽度
 * @param style - 文本样式
 * @returns 换行文本所需高度
 */
export function measureWrappedDrawingTextHeight(text: string, width: number, style?: DrawingElementStyle): number {
  const fontSize = style?.fontSize ?? DRAWING_TEXT_DEFAULT_FONT_SIZE;
  const lineHeight = fontSize * DRAWING_TEXT_LINE_HEIGHT_RATIO;
  const lineCount = wrapDrawingTextLineItems(text, width, style).length;

  return normalizeTextMetricValue(Math.max(1, lineCount) * lineHeight + DRAWING_TEXT_VERTICAL_PADDING);
}

/**
 * 根据文本换行高度修正普通形状尺寸。
 * @param text - 文本内容
 * @param size - 用户手动设置的基础尺寸
 * @param style - 文本样式
 * @returns 至少能容纳文本的形状尺寸
 */
export function createDrawingTextFitSize(text: string, size: DrawingSize, style?: DrawingElementStyle): DrawingSize {
  return {
    width: size.width,
    height: Math.max(size.height, measureWrappedDrawingTextHeight(text, size.width, style))
  };
}
