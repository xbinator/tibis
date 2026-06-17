/**
 * @file utils.ts
 * @description BMessage 节点解析与遍历工具函数。
 */
import type { BlockNode, ImageInlineNode, InlineNode } from './types';
import type { ImagePreviewItem } from '@/hooks/useImagePreview';

let mermaidRenderIdCounter = 0;

/**
 * 生成 Mermaid render() 需要的唯一 id。
 * @returns 当前页面生命周期内唯一的 Mermaid 渲染 id
 */
export function createMessageMermaidRenderId(): string {
  mermaidRenderIdCounter = (mermaidRenderIdCounter + 1) % Number.MAX_SAFE_INTEGER;

  return `b-message-mermaid-${Date.now()}-${mermaidRenderIdCounter}`;
}

/**
 * 生成稳定短哈希，用于节点 key。
 * @param value - 待哈希文本
 * @returns base36 短哈希
 */
export function stableHash(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

/**
 * 从行内节点中收集图片节点。
 * @param nodes - 行内节点列表
 * @param images - 图片节点收集结果
 */
function collectInlineImageNodes(nodes: InlineNode[], images: ImageInlineNode[]): void {
  nodes.forEach((node) => {
    if (node.type === 'image') {
      images.push(node);
      return;
    }

    if (
      node.type === 'strong' ||
      node.type === 'em' ||
      node.type === 'del' ||
      node.type === 'mark' ||
      node.type === 'sup' ||
      node.type === 'sub' ||
      node.type === 'link' ||
      node.type === 'htmlInline'
    ) {
      collectInlineImageNodes(node.children, images);
    }
  });
}

/**
 * 从块级节点中收集图片节点。
 * @param nodes - 块级节点列表
 * @returns 图片节点列表
 */
export function collectImageNodes(nodes: BlockNode[]): ImageInlineNode[] {
  const images: ImageInlineNode[] = [];

  nodes.forEach((node) => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      collectInlineImageNodes(node.children, images);
      return;
    }

    if (node.type === 'blockquote') {
      images.push(...collectImageNodes(node.children));
      return;
    }

    if (node.type === 'list') {
      node.items.forEach((item) => {
        images.push(...collectImageNodes(item.children));
      });
      return;
    }

    if (node.type === 'table') {
      node.header.forEach((cell) => collectInlineImageNodes(cell.children, images));
      node.rows.forEach((row) => {
        row.forEach((cell) => collectInlineImageNodes(cell.children, images));
      });
    }
  });

  return images;
}

/**
 * 为图片节点分配索引并生成预览条目。
 * @param nodes - 块级节点列表
 * @returns 图片预览条目
 */
export function assignImageIndexes(nodes: BlockNode[]): ImagePreviewItem[] {
  return collectImageNodes(nodes).map((node, index) => {
    node.imageIndex = index;
    return {
      src: node.src,
      name: node.alt || undefined
    };
  });
}
