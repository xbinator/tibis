/**
 * @file serializer.ts
 * @description WebView 扁平 DOM 树简化文本序列化脚本生成器。
 */

/**
 * 构建注入页面的扁平 DOM 序列化代码。
 * @returns 页面序列化代码片段
 */
export function createSerializerScript(): string {
  return `
const __tibisWebviewEngineSerializer = (() => {
  const SEMANTIC_TAGS = new Set([
    'main',
    'nav',
    'menu',
    'header',
    'footer',
    'section',
    'article',
    'aside',
    'form',
    'label',
    'ul',
    'ol',
    'li',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6'
  ]);
  const DEFAULT_INCLUDE_ATTRIBUTES = [
    'title',
    'type',
    'checked',
    'name',
    'role',
    'value',
    'placeholder',
    'data-date-format',
    'alt',
    'aria-label',
    'aria-expanded',
    'data-state',
    'aria-checked',
    'id',
    'for',
    'target',
    'aria-haspopup',
    'aria-controls',
    'aria-owns',
    'contenteditable',
    'class',
    'data-cy',
    'data-id',
    'data-action',
    'data-ai-action',
    'data-click',
    'data-command',
    'data-href'
  ];
  const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const escapeText = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;');
  const capText = (value, limit) => {
    const text = String(value || '');
    return text.length > limit ? text.slice(0, limit) + '...' : text;
  };
  const buildTreeNode = (flatTree, nodeId) => {
    const node = flatTree.map[nodeId];
    if (!node) return null;
    const children = Array.isArray(node.children)
      ? node.children.map((childId) => buildTreeNode(flatTree, childId)).filter(Boolean)
      : [];
    return { ...node, parent: null, children };
  };
  const setParents = (node, parent) => {
    node.parent = parent;
    node.children.forEach((child) => setParents(child, node));
  };
  const hasIndexedParent = (node) => {
    let current = node.parent;
    while (current) {
      if (typeof current.highlightIndex === 'number') return true;
      current = current.parent;
    }
    return false;
  };
  const readTextUntilIndexedChild = (node) => {
    const textParts = [];
    const collect = (current) => {
      if (current !== node && typeof current.highlightIndex === 'number') return;
      if (current.type === 'TEXT_NODE' && current.text) {
        textParts.push(current.text);
        return;
      }
      if (Array.isArray(current.children)) {
        current.children.forEach(collect);
      }
    };
    collect(node);
    return textParts.join(' ').replace(/\\s+/g, ' ').trim();
  };
  const readLineText = (node) => {
    if (VOID_TAGS.has(node.tagName)) return '';
    const directText = String(node.directText || '').trim();
    if (directText) return directText;
    const explicitLabel =
      node.attributes &&
      (node.attributes['aria-label'] || node.attributes.title || node.attributes.placeholder || node.attributes.alt || node.attributes.value);
    if (explicitLabel) return String(explicitLabel).trim();
    if (Array.isArray(node.children) && node.children.some((child) => child.type === 'ELEMENT_NODE')) return '';
    return readTextUntilIndexedChild(node);
  };
  const readAttributes = (node, text) => {
    const attrs = node.attributes || {};
    const seenValues = new Set();
    const preserveDuplicateAttributeNames = new Set([
      'class',
      'data-cy',
      'data-id',
      'data-action',
      'data-ai-action',
      'data-click',
      'data-command',
      'data-href'
    ]);
    return DEFAULT_INCLUDE_ATTRIBUTES.map((name) => {
      const value = attrs[name];
      if (!value) return '';
      if (name === 'role' && String(value).toLowerCase() === node.tagName) return '';
      const shouldDedupe = !preserveDuplicateAttributeNames.has(name);
      if (shouldDedupe && value.length > 5 && seenValues.has(value)) return '';
      if (shouldDedupe && value.length > 5) seenValues.add(value);
      return name + '="' + escapeAttribute(capText(value, 40)) + '"';
    })
      .filter(Boolean)
      .join(' ');
  };
  const readScrollableText = (node) => {
    if (!node.extra || !node.extra.scrollable || !node.extra.scrollData) return '';
    const scrollData = node.extra.scrollData;
    const parts = [];
    if (scrollData.left) parts.push('left=' + scrollData.left);
    if (scrollData.top) parts.push('top=' + scrollData.top);
    if (scrollData.right) parts.push('right=' + scrollData.right);
    if (scrollData.bottom) parts.push('bottom=' + scrollData.bottom);
    return parts.length ? ' data-scrollable="' + parts.join(', ') + '"' : ' data-scrollable="true"';
  };
  const createIndexedLine = (node, depth) => {
    const text = capText(readLineText(node), 240);
    const attrs = readAttributes(node, text);
    const indicator = node.isNew ? '*[' + node.highlightIndex + ']' : '[' + node.highlightIndex + ']';
    let line = '\\t'.repeat(Math.min(depth, 6)) + indicator + '<' + node.tagName;
    if (attrs) line += ' ' + attrs;
    line += readScrollableText(node);
    if (text && !VOID_TAGS.has(node.tagName)) line += '>' + escapeText(text);
    else if (!attrs && !readScrollableText(node)) line += ' ';
    line += ' />';
    return line;
  };
  const createSemanticOpenLine = (node, depth) => {
    const text = capText(String(node.directText || '').trim(), 240);
    const attrs = readAttributes(node, text);
    const openTag = '<' + node.tagName + (attrs ? ' ' + attrs : '') + '>';
    if (VOID_TAGS.has(node.tagName)) return '\\t'.repeat(Math.min(depth, 6)) + '<' + node.tagName + (attrs ? ' ' + attrs : '') + ' />';
    return '\\t'.repeat(Math.min(depth, 6)) + openTag + escapeText(text) + '</' + node.tagName + '>';
  };
  const processNode = (node, depth, lines) => {
    if (lines.length >= 260) return;
    if (node.type === 'TEXT_NODE') {
      if (!node.isVisible || hasIndexedParent(node)) return;
      const text = escapeText(node.text || '');
      if (text) lines.push('\\t'.repeat(Math.min(depth, 6)) + capText(text, 240));
      return;
    }

    if (typeof node.highlightIndex === 'number') {
      lines.push(createIndexedLine(node, depth));
      node.children.forEach((child) => processNode(child, depth + 1, lines));
      return;
    }

    if (node.shadowRoot) {
      lines.push('\\t'.repeat(Math.min(depth, 6)) + '<' + node.tagName + '>');
      lines.push('\\t'.repeat(Math.min(depth + 1, 6)) + '#shadow-root');
      node.children.forEach((child) => processNode(child, depth + 2, lines));
      lines.push('\\t'.repeat(Math.min(depth, 6)) + '</' + node.tagName + '>');
      return;
    }

    const isSemantic = SEMANTIC_TAGS.has(node.tagName);
    if (!isSemantic && node.isVisible && String(node.directText || '').trim() && !hasIndexedParent(node)) {
      const text = capText(String(node.directText || '').trim(), 240);
      const attrs = readAttributes(node, text);
      lines.push('\\t'.repeat(Math.min(depth, 6)) + '<' + node.tagName + (attrs ? ' ' + attrs : '') + '>' + escapeText(text) + '</' + node.tagName + '>');
      return;
    }

    const mark = lines.length;
    if (isSemantic) {
      lines.push(createSemanticOpenLine(node, depth));
    } else if (node.isVisible && node.children.some((child) => child.type === 'ELEMENT_NODE')) {
      const attrs = readAttributes(node, '');
      if (attrs) lines.push('\\t'.repeat(Math.min(depth, 6)) + '<' + node.tagName + ' ' + attrs + '></' + node.tagName + '>');
    }
    node.children.forEach((child) => {
      if (isSemantic && String(node.directText || '').trim() && child.type === 'TEXT_NODE') return;
      processNode(child, isSemantic ? depth + 1 : depth, lines);
    });
    if (isSemantic && lines.length === mark + 1 && !String(node.directText || '').trim()) {
      lines.pop();
    }
  };
  const flatTreeToString = (flatTree) => {
    const rootNode = buildTreeNode(flatTree, flatTree.rootId);
    if (!rootNode) return '<EMPTY>';
    setParents(rootNode, null);
    const lines = [];
    processNode(rootNode, 0, lines);
    return lines.length ? lines.slice(0, 260).join('\\n') : '<EMPTY>';
  };

  return { flatTreeToString };
})();
`;
}
