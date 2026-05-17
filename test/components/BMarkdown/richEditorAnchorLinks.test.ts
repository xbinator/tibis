// @vitest-environment jsdom
/**
 * @file richEditorAnchorLinks.test.ts
 * @description 验证富文本文内锚点链接的解析与标题匹配规则。
 */
import { describe, expect, test } from 'vitest';
import { findHeadingElementByHash } from '@/components/BMarkdown/adapters/richEditorAnchorLinks';

/**
 * 创建带有标题节点的容器。
 * @returns 测试用容器元素
 */
function createHeadingContainer(): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="b-markdown-rich__content">
      <h2 id="editor-heading-0">什么是规格驱动开发？</h2>
      <h2 id="editor-heading-1">Implementation Plan</h2>
    </div>
  `;
  return container;
}

describe('findHeadingElementByHash', () => {
  test('matches headings by normalized text slug when hash uses markdown-style anchor text', () => {
    const container = createHeadingContainer();

    expect(findHeadingElementByHash(container, '#-什么是规格驱动开发')).toBe(container.querySelector('#editor-heading-0'));
  });

  test('prefers direct id matching before falling back to heading text matching', () => {
    const container = createHeadingContainer();

    expect(findHeadingElementByHash(container, '#editor-heading-1')).toBe(container.querySelector('#editor-heading-1'));
  });
});
