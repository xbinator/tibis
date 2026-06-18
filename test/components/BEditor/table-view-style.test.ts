/**
 * @file table-view-style.test.ts
 * @description BEditor Rich 模式表格 NodeView 样式回归测试。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取 TableView 组件源码。
 * @returns TableView.vue 文件内容
 */
function readTableViewSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/BEditor/components/TableView.vue'), 'utf8');
}

/**
 * 从 Vue 源码中提取指定样式规则内容。
 * @param source - Vue 组件源码
 * @param selector - 需要匹配的 CSS 选择器
 * @returns 样式规则内容；未命中时返回空字符串
 */
function extractStyleRuleBody(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`).exec(source);
  return rule?.groups?.body ?? '';
}

describe('BEditor TableView styles', (): void => {
  it('stretches the table to the editor width and distributes columns across the available space', (): void => {
    const source = readTableViewSource();
    const tableRuleBody = extractStyleRuleBody(source, '.b-markdown-table__table');

    expect(tableRuleBody).toContain('width: 100%;');
    expect(tableRuleBody).toContain('table-layout: fixed;');
  });

  it('prevents generated column widths from shrinking the inner grid to the left side', (): void => {
    const source = readTableViewSource();
    const colRuleBody = extractStyleRuleBody(source, '.b-markdown-table__table colgroup,\n.b-markdown-table__table col');
    const cellRuleBody = extractStyleRuleBody(source, '.b-markdown-table__table th,\n.b-markdown-table__table td');

    expect(colRuleBody).toContain('width: auto !important;');
    expect(cellRuleBody).toContain('width: auto;');
    expect(cellRuleBody).toContain('min-width: 0;');
  });

  it('stretches table row containers so body rows reach the full table width', (): void => {
    const source = readTableViewSource();
    const contentRuleBody = extractStyleRuleBody(source, '.b-markdown-table__table [data-node-view-content-vue]');
    const rowGroupRuleBody = extractStyleRuleBody(source, '.b-markdown-table__table tbody,\n.b-markdown-table__table thead');
    const rowRuleBody = extractStyleRuleBody(source, '.b-markdown-table__table tr');

    expect(contentRuleBody).toContain('display: contents;');
    expect(rowGroupRuleBody).toContain('width: 100%;');
    expect(rowRuleBody).toContain('width: 100%;');
  });
});
