/**
 * @file rich-selection-style.test.ts
 * @description BEditor Rich 模式选区高亮样式回归测试。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取 Rich 编辑器面板源码。
 * @returns PaneRichEditor.vue 文件内容
 */
function readPaneRichEditorSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/BEditor/panes/PaneRichEditor.vue'), 'utf8');
}

/**
 * 从源码中提取指定 CSS 规则内容。
 * @param source - Vue 组件源码
 * @param selector - CSS 选择器
 * @returns 样式规则内容，未命中时为空字符串
 */
function extractStyleRuleBody(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\s*\\}`).exec(source);
  return rule?.groups?.body ?? '';
}

describe('BEditor rich selection styles', (): void => {
  it('renders table container selection as a filled table state instead of an outline ring', (): void => {
    const source = readPaneRichEditorSource();
    const tableRuleBody = extractStyleRuleBody(source, '.b-markdown-table.ai-selection-highlight');
    const tableHeaderRuleBody = extractStyleRuleBody(source, '.b-markdown-table.ai-selection-highlight th');
    const tableCellRuleBody = extractStyleRuleBody(source, '.b-markdown-table.ai-selection-highlight td');

    expect(tableRuleBody).toContain('box-shadow: none;');
    expect(tableRuleBody).toContain('background: transparent;');
    expect(tableRuleBody).not.toContain('outline:');
    expect(tableHeaderRuleBody).toContain('background-color: var(--editor-table-selection-header-bg);');
    expect(tableCellRuleBody).toContain('background-color: var(--editor-table-selection-cell-bg);');
  });

  it('uses the same table selection colors for drag cell selections and container selections', (): void => {
    const source = readPaneRichEditorSource();

    expect(source).toContain('--editor-table-selection-header-bg:');
    expect(source).toContain('--editor-table-selection-cell-bg:');
    expect(source).toContain('--editor-table-selection-header-bg: color-mix(in srgb, var(--color-primary-bg-hover) 88%, var(--editor-table-header-bg));');
    expect(source).toContain('--editor-table-selection-cell-bg: color-mix(in srgb, var(--color-primary-bg-hover) 74%, var(--bg-primary));');
    expect(source).toContain('background-color: var(--editor-table-selection-header-bg);');
    expect(source).toContain('background-color: var(--editor-table-selection-cell-bg);');
  });
});
