/**
 * @file core/apply.ts
 * @description 运行时将主题 Token 注入为 CSS 变量（通过 <style> 标签），并提供开发时格式校验。
 */

import type { ThemeTokens } from '../types/tokens';
import { toCssVars } from './derive';

/**
 * 用于标识主题 <style> 标签的属性选择器。
 */
const STYLE_ATTR = 'data-theme-styles';

/**
 * 合法颜色格式正则：#hex、rgb() 函数，或包含 rgb() 的复合值（如 shadow）。
 */
const COLOR_RE = /^(#([0-9a-f]{3,8})|.*rgb\(\d{1,3}\s+\d{1,3}\s+\d{1,3}.*\))$/i;

/**
 * 将扁平化的 CSS 变量映射编译为 :root { ... } 规则文本。
 * @param vars - CSS 变量键值对
 * @returns 可直接写入 <style> 标签的 CSS 文本
 */
function buildRootRule(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

/**
 * 在开发环境下校验 Token 值的颜色格式。
 * @param tokens - 主题 Token 对象
 * @param name - 主题名称（用于日志）
 */
export function validateTokens(tokens: ThemeTokens, name: string): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const flat = toCssVars(tokens);
  for (const [key, value] of Object.entries(flat)) {
    if (!COLOR_RE.test(value)) {
      console.warn(`[theme] Unexpected color format in ${name}: ${key}=${value}`);
    }
  }
}

/**
 * 将主题 Token 以 <style> 标签形式注入为 :root CSS 变量。
 * 若已存在主题 <style> 标签，则替换之，避免标签堆积。
 * @param tokens - 主题 Token 对象
 */
export function applyCssVars(tokens: ThemeTokens): void {
  const vars = toCssVars(tokens);
  const css = buildRootRule(vars);

  const existing = document.querySelector(`style[${STYLE_ATTR}]`);
  if (existing) {
    existing.textContent = css;
    return;
  }

  const style = document.createElement('style');
  style.setAttribute(STYLE_ATTR, '');
  style.textContent = css;
  document.head.appendChild(style);
}
