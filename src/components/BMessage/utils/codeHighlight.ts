/**
 * @file codeHighlight.ts
 * @description BMessage 代码块共享语法高亮器与安全节点转换。
 */
/* eslint-disable no-use-before-define -- Lowlight 与渲染节点类型是递归结构。 */
import { common, createLowlight } from 'lowlight';

/**
 * Lowlight 文本节点。
 */
interface LowlightTextNode {
  /** 节点类型。 */
  type: 'text';
  /** 文本内容。 */
  value: string;
}

/**
 * Lowlight 元素节点。
 */
interface LowlightElementNode {
  /** 节点类型。 */
  type: 'element' | 'root';
  /** 子节点。 */
  children?: LowlightNode[];
  /** 节点属性。 */
  properties?: {
    /** CSS 类名。 */
    className?: string[] | string;
  };
}

/**
 * Lowlight 节点。
 */
type LowlightNode = LowlightElementNode | LowlightTextNode;

/**
 * 代码高亮文本渲染节点。
 */
export interface CodeHighlightTextNode {
  /** 节点类型。 */
  type: 'text';
  /** 文本内容。 */
  value: string;
}

/**
 * 代码高亮元素渲染节点。
 */
export interface CodeHighlightElementNode {
  /** 节点类型。 */
  type: 'element';
  /** 安全 CSS 类名。 */
  className: string;
  /** 子节点。 */
  children: CodeHighlightRenderNode[];
}

/**
 * 代码高亮渲染节点。
 */
export type CodeHighlightRenderNode = CodeHighlightElementNode | CodeHighlightTextNode;

/**
 * Markdown 代码围栏语言别名。
 */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  bash: 'shell',
  cjs: 'javascript',
  htm: 'xml',
  html: 'xml',
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  plaintext: 'plaintext',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  shellscript: 'shell',
  text: 'plaintext',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'xml',
  yml: 'yaml'
};

const lowlight = createLowlight(common);
const HIGHLIGHT_CACHE_LIMIT = 100;
const highlightCache = new Map<string, CodeHighlightRenderNode[]>();

/**
 * 读取并刷新高亮缓存项的最近使用顺序。
 * @param key - 缓存键
 * @returns 缓存节点
 */
function getCachedHighlight(key: string): CodeHighlightRenderNode[] | undefined {
  const cached = highlightCache.get(key);
  if (!cached) return undefined;

  highlightCache.delete(key);
  highlightCache.set(key, cached);
  return cached;
}

/**
 * 写入有界高亮缓存。
 * @param key - 缓存键
 * @param nodes - 高亮节点
 */
function cacheHighlight(key: string, nodes: CodeHighlightRenderNode[]): void {
  highlightCache.set(key, nodes);
  if (highlightCache.size <= HIGHLIGHT_CACHE_LIMIT) return;

  const oldestKey = highlightCache.keys().next().value as string | undefined;
  if (oldestKey) highlightCache.delete(oldestKey);
}

/**
 * 将纯文本转为代码高亮文本节点。
 * @param text - 代码文本
 * @returns 高亮渲染节点列表
 */
function textToHighlightNodes(text: string): CodeHighlightRenderNode[] {
  return text ? [{ type: 'text', value: text }] : [];
}

/**
 * 读取 Lowlight 元素节点的安全类名。
 * @param node - Lowlight 元素节点
 * @returns 安全类名
 */
function getSafeClassName(node: LowlightElementNode): string {
  const rawClassName = node.properties?.className;
  const classNames = Array.isArray(rawClassName) ? rawClassName : rawClassName?.split(/\s+/) ?? [];

  return classNames.filter((className: string): boolean => className.startsWith('hljs-')).join(' ');
}

/**
 * 将 Lowlight 节点转为可控的 Vue 渲染节点。
 * @param node - Lowlight 节点
 * @returns 高亮渲染节点列表
 */
function lowlightNodeToHighlightNodes(node: LowlightNode): CodeHighlightRenderNode[] {
  if (node.type === 'text') return textToHighlightNodes(node.value);

  const children = node.children?.flatMap((child: LowlightNode): CodeHighlightRenderNode[] => lowlightNodeToHighlightNodes(child)) ?? [];
  if (node.type === 'root') return children;

  return [
    {
      type: 'element',
      className: getSafeClassName(node),
      children
    }
  ];
}

/**
 * 高亮 BMessage 代码块。
 * @param rawLanguage - Markdown 原始语言
 * @param code - 代码文本
 * @param complete - 围栏是否闭合
 * @returns 安全高亮节点
 */
export function highlightMessageCode(rawLanguage: string, code: string, complete: boolean): CodeHighlightRenderNode[] {
  if (!complete) return textToHighlightNodes(code);

  const language = LANGUAGE_ALIASES[rawLanguage] ?? rawLanguage;
  if (!language || !lowlight.registered(language)) return textToHighlightNodes(code);

  const cacheKey = `${language}\u0000${code}`;
  const cached = getCachedHighlight(cacheKey);
  if (cached) return cached;

  try {
    const nodes = lowlightNodeToHighlightNodes(lowlight.highlight(language, code) as LowlightNode);
    cacheHighlight(cacheKey, nodes);
    return nodes;
  } catch {
    return textToHighlightNodes(code);
  }
}
