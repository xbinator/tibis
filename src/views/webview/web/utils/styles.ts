/**
 * @file styleFilter.ts
 * @description CSS 计算样式过滤工具，过滤默认值、零值以及标签默认 display。
 */

/**
 * CSS 样式展示项。
 */
export interface StyleEntry {
  /** 样式属性名 */
  name: string;
  /** 样式属性值 */
  value: string;
}

/**
 * CSS 属性通用默认值，匹配则过滤不展示。
 */
const CSS_DEFAULT_VALUES = new Set(['normal', 'none', 'auto', 'initial', 'inherit', 'unset', '', 'visible', 'static', '1']);

/**
 * HTML 标签默认 display 值。
 * 当元素标签与其默认 display 匹配时，display 属性不展示。
 */
const TAG_DEFAULT_DISPLAY: Record<string, string> = {
  /** 块级元素 */
  div: 'block',
  p: 'block',
  h1: 'block',
  h2: 'block',
  h3: 'block',
  h4: 'block',
  h5: 'block',
  h6: 'block',
  header: 'block',
  footer: 'block',
  nav: 'block',
  main: 'block',
  section: 'block',
  article: 'block',
  aside: 'block',
  form: 'block',
  ul: 'block',
  ol: 'block',
  pre: 'block',
  blockquote: 'block',
  hr: 'block',
  /** 行内元素 */
  span: 'inline',
  a: 'inline',
  strong: 'inline',
  b: 'inline',
  em: 'inline',
  i: 'inline',
  code: 'inline',
  label: 'inline',
  /** 行内块元素 */
  input: 'inline-block',
  button: 'inline-block',
  textarea: 'inline-block',
  select: 'inline-block',
  /** 列表项 */
  li: 'list-item',
  /** 表格元素 */
  table: 'table'
};

/**
 * 将 margin/padding 长写合并为简写。
 * @param styles - 原始计算样式对象
 * @returns 合并简写后的样式对象
 */
function collapseBoxStyles(styles: Record<string, string>): Record<string, string> {
  const result = { ...styles };

  for (const prefix of ['margin', 'padding'] as const) {
    const values = [styles[`${prefix}-top`], styles[`${prefix}-right`], styles[`${prefix}-bottom`], styles[`${prefix}-left`]];

    if (values.some((value) => !value)) {
      continue;
    }

    const [top, right, bottom, left] = values;

    let shorthand: string;

    if (top === right && top === bottom && top === left) {
      shorthand = top;
    } else if (top === bottom && right === left) {
      shorthand = `${top} ${right}`;
    } else if (right === left) {
      shorthand = `${top} ${right} ${bottom}`;
    } else {
      shorthand = `${top} ${right} ${bottom} ${left}`;
    }

    result[prefix] = shorthand;

    delete result[`${prefix}-top`];
    delete result[`${prefix}-right`];
    delete result[`${prefix}-bottom`];
    delete result[`${prefix}-left`];
  }

  return result;
}

/**
 * 判断样式值是否应该在面板中显示。
 * 过滤默认值、零值。
 * @param value - 样式值
 * @returns 是否应显示
 */
const isVisibleStyleValue = (value: unknown): boolean => {
  const normalized = String(value).trim().toLowerCase();

  if (CSS_DEFAULT_VALUES.has(normalized)) {
    return false;
  }

  return !/^0(?:px|rem|em|%|vh|vw)?$/.test(normalized);
};

/**
 * 判断样式条目是否应该在面板中显示。
 * 综合过滤默认值、零值、标签默认 display。
 * @param name - CSS 属性名
 * @param value - CSS 属性值
 * @param tagName - 元素标签名（小写）
 * @returns 是否应显示
 */
const isStyleEntryVisible = (name: string, value: string, tagName?: string): boolean => {
  if (!isVisibleStyleValue(value)) {
    return false;
  }

  /** 过滤标签默认 display 值（如 div:block、span:inline） */
  if (name === 'display' && tagName && TAG_DEFAULT_DISPLAY[tagName] === value) {
    return false;
  }

  return true;
};

/**
 * 从计算样式中提取并过滤出应展示的样式键值对。
 * @param computedStyles - 元素计算样式
 * @param tagName - 元素标签名
 * @returns 过滤后的样式展示项列表
 */
export function filterStyleEntries(computedStyles: Record<string, string> | undefined | null, tagName?: string): StyleEntry[] {
  if (!computedStyles) {
    return [];
  }

  const collapsed = collapseBoxStyles(computedStyles);

  return Object.entries(collapsed)
    .filter(([name, value]) => isStyleEntryVisible(name, value, tagName?.toLowerCase()))
    .map(([name, value]) => ({ name, value }));
}
