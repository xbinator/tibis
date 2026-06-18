/**
 * @file rich-placeholder.test.ts
 * @description BEditor Rich 模式标题占位文案与样式测试。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRichEditorPlaceholder, type RichEditorPlaceholderContext } from '@/components/BEditor/hooks/useExtensions';

/**
 * 构建最小 Tiptap 节点上下文。
 * @param type - 节点类型
 * @param attrs - 节点属性
 * @returns 占位文案解析上下文
 */
function createPlaceholderContext(type: string, attrs: Record<string, unknown> = {}): RichEditorPlaceholderContext {
  return {
    node: {
      type: { name: type },
      attrs
    }
  };
}

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

describe('resolveRichEditorPlaceholder', (): void => {
  it('returns heading level labels for empty heading blocks', (): void => {
    expect(resolveRichEditorPlaceholder(createPlaceholderContext('heading', { level: 1 }))).toBe('H1');
    expect(resolveRichEditorPlaceholder(createPlaceholderContext('heading', { level: 2 }))).toBe('H2');
    expect(resolveRichEditorPlaceholder(createPlaceholderContext('heading', { level: 3 }))).toBe('H3');
    expect(resolveRichEditorPlaceholder(createPlaceholderContext('heading', { level: 4 }))).toBe('H4');
    expect(resolveRichEditorPlaceholder(createPlaceholderContext('heading', { level: 5 }))).toBe('H5');
    expect(resolveRichEditorPlaceholder(createPlaceholderContext('heading', { level: 6 }))).toBe('H6');
  });

  it('keeps the default placeholder for non-heading blocks', (): void => {
    expect(resolveRichEditorPlaceholder(createPlaceholderContext('paragraph'))).toBe('请输入内容');
  });
});

describe('BEditor rich placeholder styles', (): void => {
  it('uses a softer color for placeholder text than the base editor placeholder token', (): void => {
    const source = readPaneRichEditorSource();
    const placeholderRuleBody = extractStyleRuleBody(source, '.is-editor-empty:first-child::before');

    expect(placeholderRuleBody).toContain('color: color-mix(in srgb, var(--editor-placeholder) 64%, var(--bg-primary));');
  });

  it('matches heading placeholder font sizes to heading levels', (): void => {
    const source = readPaneRichEditorSource();

    expect(extractStyleRuleBody(source, 'h1.is-editor-empty:first-child::before')).toContain('font-size: 24px;');
    expect(extractStyleRuleBody(source, 'h2.is-editor-empty:first-child::before')).toContain('font-size: 20px;');
    expect(extractStyleRuleBody(source, 'h3.is-editor-empty:first-child::before')).toContain('font-size: 16px;');
    expect(extractStyleRuleBody(source, 'h4.is-editor-empty:first-child::before')).toContain('font-size: 14px;');
    expect(extractStyleRuleBody(source, 'h5.is-editor-empty:first-child::before')).toContain('font-size: 12px;');
    expect(extractStyleRuleBody(source, 'h6.is-editor-empty:first-child::before')).toContain('font-size: 11px;');
  });
});
