/**
 * @file richMarkdownParser.ts
 * @description Rich 编辑器 Markdown 解析统一异步接口。
 * 第一阶段：主线程同步解析（Promise 包装，通过 setTimeout 0 yield 主线程让 UI 先行）。
 * 第二阶段：切 Web Worker 解析，调用方零改动。
 */
import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { createSourceLineTracker } from '../adapters/sourceLineMapping';
import { createRichMarkdownSchemaExtensions } from './useExtensions';

/**
 * 解析接口返回结果
 */
export interface RichParseResult {
  json: JSONContent;
  stats: {
    durationMs: number;
    nodeCount: number;
    cacheHit: boolean;
  };
}

/**
 * Rich 解析缓存项。
 */
interface RichParseCacheEntry {
  /** 编辑器实例 ID，影响 heading id 前缀 */
  editorInstanceId: string;
  /** 原始 Markdown 内容 */
  markdown: string;
  /** 解析后的 JSON */
  json: JSONContent;
  /** JSON 节点总数 */
  nodeCount: number;
}

/**
 * Rich 解析缓存最大条目数。
 * 仅保留最近两个文档，避免大文档 JSON 长期占用过多内存。
 */
const RICH_PARSE_CACHE_LIMIT = 2;

const richParseCache: RichParseCacheEntry[] = [];

/**
 * 查找未变化文档的解析缓存。
 * @param markdown - 原始 Markdown 字符串
 * @param editorInstanceId - 编辑器实例 ID
 * @returns 命中时返回缓存项，否则返回 null
 */
function findCachedParseResult(markdown: string, editorInstanceId: string): RichParseCacheEntry | null {
  const index = richParseCache.findIndex((entry) => entry.editorInstanceId === editorInstanceId && entry.markdown === markdown);
  if (index < 0) {
    return null;
  }

  const [entry] = richParseCache.splice(index, 1);
  if (!entry) {
    return null;
  }

  richParseCache.unshift(entry);
  return entry;
}

/**
 * 写入解析缓存，并按 LRU 淘汰旧项。
 * @param entry - 待缓存的解析结果
 */
function rememberParsedMarkdown(entry: RichParseCacheEntry): void {
  const existingIndex = richParseCache.findIndex((item) => item.editorInstanceId === entry.editorInstanceId && item.markdown === entry.markdown);
  if (existingIndex >= 0) {
    richParseCache.splice(existingIndex, 1);
  }

  richParseCache.unshift(entry);
  if (richParseCache.length > RICH_PARSE_CACHE_LIMIT) {
    richParseCache.length = RICH_PARSE_CACHE_LIMIT;
  }
}

/**
 * 递归统计 JSON 中的节点总数
 * @param json - 待统计的 JSON 节点
 * @returns 节点总数
 */
function countNodes(json: JSONContent): number {
  let count = 1;
  if (Array.isArray(json.content)) {
    for (const child of json.content) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * 在主线程上解析 Markdown 为 Tiptap JSON。
 * 不创建 Editor/View/DOM，仅走 MarkdownManager 的 lexer → token → JSON 管线。
 * @param markdown - 原始 Markdown 字符串
 * @param editorInstanceId - 编辑器实例 ID
 * @returns 解析后的 JSON
 */
function parseMarkdownOnMainThread(markdown: string, editorInstanceId: string): JSONContent {
  const sourceLineTracker = createSourceLineTracker();
  const { extensions } = createRichMarkdownSchemaExtensions(editorInstanceId, sourceLineTracker);

  const markdownManager = new MarkdownManager({
    indentation: { style: 'space', size: 2 },
    extensions
  });

  return markdownManager.parse(markdown);
}

/**
 * 解析 Markdown 为 Tiptap JSON。
 *
 * 关键：在开始 CPU 密集型解析前通过 setTimeout 0 yield 主线程，
 * 确保 UI 已渲染 loading 状态，用户不会感知到"点击后无反应"的卡死。
 *
 * @param markdown - 原始 Markdown 字符串
 * @param editorInstanceId - 编辑器实例 ID（用于 heading ID 前缀等）
 * @param requestId - 请求 ID（用于取消校验，与 loadToken 分开）
 * @param signal - AbortSignal（解析前后检查）
 * @returns 解析结果
 */
export async function parseMarkdownForRichLoad(markdown: string, editorInstanceId: string, _requestId: string, signal?: AbortSignal): Promise<RichParseResult> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const cached = findCachedParseResult(markdown, editorInstanceId);
  if (cached) {
    return {
      json: cached.json,
      stats: {
        durationMs: 0,
        nodeCount: cached.nodeCount,
        cacheHit: true
      }
    };
  }

  // YIELD：让出主线程给 UI 渲染（loading 遮罩等），然后再执行 CPU 密集解析
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

  // 再次检查是否已被取消
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const startTime = performance.now();
  const json = parseMarkdownOnMainThread(markdown, editorInstanceId);
  const nodeCount = countNodes(json);

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  rememberParsedMarkdown({
    editorInstanceId,
    markdown,
    json,
    nodeCount
  });

  return {
    json,
    stats: {
      durationMs: performance.now() - startTime,
      nodeCount,
      cacheHit: false
    }
  };
}
