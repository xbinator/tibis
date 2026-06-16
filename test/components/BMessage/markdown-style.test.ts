/**
 * @file markdown-style.test.ts
 * @description BMessage Markdown 基础样式测试。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 读取 Markdown 基础样式源码。
 * @returns Markdown Less 样式源码
 */
function readMarkdownStyle(): string {
  return readFileSync(new URL('../../../src/assets/styles/markdown.less', import.meta.url), 'utf8');
}

describe('BMessage markdown style', () => {
  it('restores unordered and ordered list markers after global normalize reset', (): void => {
    const style = readMarkdownStyle();

    expect(style).toMatch(/ul\s*>\s*li\s*\{[\s\S]*list-style:\s*disc;/);
    expect(style).toMatch(/ol\s*>\s*li\s*\{[\s\S]*list-style:\s*decimal;/);
    expect(style).toMatch(/ul\s+ul\s*>\s*li\s*\{[\s\S]*list-style:\s*circle;/);
    expect(style).toMatch(/ol\s+ol\s*>\s*li\s*\{[\s\S]*list-style:\s*lower-alpha;/);
  });

  it('keeps task list checkboxes visible after global input reset', (): void => {
    const style = readMarkdownStyle();

    expect(style).toMatch(/li:has\(>\s*input\[type='checkbox'\]\)\s*\{[\s\S]*list-style:\s*none;/);
    expect(style).toMatch(/li:has\(>\s*input\[type='checkbox'\]\)\s*\{[\s\S]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);/);
    expect(style).toMatch(/li\s*>\s*input\[type='checkbox'\]\s*\{[\s\S]*width:\s*1em;/);
    expect(style).toMatch(/li\s*>\s*input\[type='checkbox'\]\s*\{[\s\S]*accent-color:\s*var\(--color-primary\);/);
    expect(style).toMatch(/li:has\(>\s*input\[type='checkbox'\]\)\s*>\s*p\s*\{[\s\S]*grid-column:\s*2;/);
  });
});
