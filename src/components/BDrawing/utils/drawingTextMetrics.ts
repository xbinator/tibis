/**
 * @file drawingTextMetrics.ts
 * @description BDrawing 文本元素尺寸测量工具。
 */
import type { DrawingElementStyle, DrawingSize } from '../types';

/** 文本元素默认字号。 */
export const DRAWING_TEXT_DEFAULT_FONT_SIZE = 13;
/** 文本元素默认字重。 */
export const DRAWING_TEXT_DEFAULT_FONT_WEIGHT = 650;
/** 文本元素水平内边距。 */
export const DRAWING_TEXT_HORIZONTAL_PADDING = 20;
/** 文本元素垂直内边距。 */
export const DRAWING_TEXT_VERTICAL_PADDING = 16;
/** 文本元素窄拉丁字符宽度估算比例。 */
const DRAWING_TEXT_NARROW_CHARACTER_WIDTH_RATIO = 0.34;
/** 文本元素普通拉丁字符宽度估算比例。 */
const DRAWING_TEXT_LATIN_CHARACTER_WIDTH_RATIO = 0.56;
/** 文本元素空白字符宽度估算比例。 */
const DRAWING_TEXT_SPACE_CHARACTER_WIDTH_RATIO = 0.32;
/** 文本元素全宽字符宽度估算比例。 */
const DRAWING_TEXT_FULL_WIDTH_CHARACTER_WIDTH_RATIO = 1;
/** 文本元素行高比例。 */
export const DRAWING_TEXT_LINE_HEIGHT_RATIO = 1.35;
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
  const maxLineWidth = Math.max(
    1,
    ...lines.map((line: string): number => measureDrawingTextLineWidth(line, fontSize, fontWeight) ?? estimateDrawingTextLineWidth(line, fontSize))
  );

  return {
    width: normalizeTextMetricValue(maxLineWidth + DRAWING_TEXT_HORIZONTAL_PADDING),
    height: normalizeTextMetricValue(Math.max(1, lines.length) * lineHeight + DRAWING_TEXT_VERTICAL_PADDING)
  };
}
