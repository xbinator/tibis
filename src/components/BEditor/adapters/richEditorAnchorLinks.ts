/**
 * @file richEditorAnchorLinks.ts
 * @description 提供富文本编辑区文内锚点链接解析、标题匹配与滚动工具。
 */

/**
 * 富文本标题元素选择器。
 */
const RICH_HEADING_SELECTOR = [
  '.b-markdown-rich__content h1[id]',
  '.b-markdown-rich__content h2[id]',
  '.b-markdown-rich__content h3[id]',
  '.b-markdown-rich__content h4[id]',
  '.b-markdown-rich__content h5[id]',
  '.b-markdown-rich__content h6[id]'
].join(', ');

/**
 * 对选择器片段做最小转义，兼容测试环境缺少 `CSS.escape` 的场景。
 * @param value - 原始片段
 * @returns 可安全拼接进 `querySelector` 的片段
 */
function escapeSelectorFragment(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/["\\#.:()[\],>+~*^$|=\s]/g, '\\$&');
}

/**
 * 从 hash 链接中提取并解码片段内容。
 * @param rawHash - 原始 hash 文本
 * @returns 去掉 `#` 后的片段内容
 */
function extractHashFragment(rawHash: string): string {
  const fragment = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;

  if (!fragment) {
    return '';
  }

  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * 将标题文本或 hash 片段规范化为宽松匹配 slug。
 * @param value - 标题文本或 hash 片段
 * @returns 可用于匹配的 slug
 */
function normalizeHeadingSlug(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 在富文本容器内根据 hash 查找对应标题元素。
 * 先按 DOM `id` 精确匹配，再退化为按标题文本 slug 匹配。
 * @param container - 富文本根容器
 * @param rawHash - 原始 hash 文本
 * @returns 匹配到的标题元素，未命中时返回 null
 */
export function findHeadingElementByHash(container: ParentNode, rawHash: string): HTMLElement | null {
  const fragment = extractHashFragment(rawHash);

  if (!fragment) {
    return null;
  }

  const directMatch = container.querySelector<HTMLElement>(`#${escapeSelectorFragment(fragment)}`);
  if (directMatch) {
    return directMatch;
  }

  const expectedSlug = normalizeHeadingSlug(fragment);
  if (!expectedSlug) {
    return null;
  }

  const headings = Array.from(container.querySelectorAll<HTMLElement>(RICH_HEADING_SELECTOR));

  return headings.find((heading) => normalizeHeadingSlug(heading.textContent ?? '') === expectedSlug) ?? null;
}

/**
 * 将匹配到的标题滚动到编辑区可视区域顶部附近。
 * @param heading - 目标标题元素
 */
export function scrollHeadingIntoView(heading: HTMLElement): void {
  heading.scrollIntoView({
    behavior: 'auto',
    block: 'start',
    inline: 'nearest'
  });
}
