/**
 * @file editorMarkdown.ts
 * @description 统一处理富文本编辑器 Markdown 导出时的隐式尾部空段落。
 */
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * 带有源码行号属性的节点属性。
 */
interface SourceLineAttributes {
  /** 源码起始行号。 */
  sourceLineStart?: number | null;
  /** 源码结束行号。 */
  sourceLineEnd?: number | null;
}

/**
 * 判断节点是否为编辑器自动补出的隐式尾部空段落。
 * 这类段落仅用于提供可继续输入的落点，不应被导出为真实 Markdown 内容。
 * @param node - 待判断的文档节点
 * @returns 命中时返回 true
 */
function isImplicitTrailingParagraph(node: ProseMirrorNode | null | undefined): boolean {
  if (!node || node.type.name !== 'paragraph' || node.textContent.length > 0) {
    return false;
  }

  const attrs = node.attrs as SourceLineAttributes | undefined;
  return !Number.isInteger(attrs?.sourceLineStart) && !Number.isInteger(attrs?.sourceLineEnd);
}

/**
 * 获取适合持久化的 Markdown 文本。
 * 如果文档尾部存在编辑器自动补出的空段落，则去掉它带来的额外空行。
 * @param editor - 当前富文本编辑器实例
 * @returns 规范化后的 Markdown 文本
 */
export function getPersistedMarkdown(editor: Editor): string {
  const markdown = editor.getMarkdown();

  if (!isImplicitTrailingParagraph(editor.state.doc.lastChild)) {
    return markdown;
  }

  return markdown.replace(/\n{2}$/, '');
}
