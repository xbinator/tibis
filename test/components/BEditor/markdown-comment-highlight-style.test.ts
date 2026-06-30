/**
 * @file markdown-comment-highlight-style.test.ts
 * @description Markdown 批注高亮样式回归测试。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取 Markdown 编辑器组件源码。
 * @returns Markdown.vue 源码文本
 */
function readMarkdownComponent(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/BEditor/Markdown.vue'), 'utf8');
}

/**
 * 读取 Rich 编辑器 Pane 源码。
 * @returns PaneRichEditor.vue 源码文本
 */
function readRichEditorPane(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/BEditor/panes/PaneRichEditor.vue'), 'utf8');
}

describe('Markdown comment highlight style', (): void => {
  it('draws the comment underline as a reusable background line instead of a fragmented border', (): void => {
    const source = readMarkdownComponent();

    expect(source).toContain('--comment-highlight-line');
    expect(source).toContain('background-image: linear-gradient(var(--comment-highlight-line), var(--comment-highlight-line))');
    expect(source).not.toContain('border-bottom: 2px solid');
  });

  it('keeps inline code visually independent from the comment underline', (): void => {
    const source = readMarkdownComponent();

    expect(source).not.toContain('.editor-comment-highlight code');
  });

  it('lets the shared comment underline remain visible through inline code without drawing a code underline', (): void => {
    const source = readRichEditorPane();

    expect(source).toContain('.editor-comment-highlight code');
    expect(source).toContain('background-color: color-mix(in srgb, var(--bg-disabled) 72%, transparent)');
    expect(source).not.toMatch(/\.editor-comment-highlight\s+code\s*\{[^}]*background-image/s);
  });
});
