/**
 * @file DocumentTool/index.ts
 * @description 内置文档只读工具实现
 */
import type { AIToolContext, AIToolExecutor } from 'types/ai';
import { buildUnsavedPath } from '@/utils/file';
import { createToolSuccessResult } from '../../results';

/**
 * 读取当前文档的结果
 */
export interface ReadCurrentDocumentResult {
  /** 文档 ID */
  id: string;
  /** 文档标题 */
  title: string;
  /** 文档路径 */
  path: string;
  /** 文档内容 */
  content: string;
}

/**
 * 内置只读工具集合
 */
export interface BuiltinReadTools {
  /** 读取当前文档工具 */
  readCurrentDocument: AIToolExecutor<Record<string, never>, ReadCurrentDocumentResult>;
}

/** 读取当前文档工具名称。 */
export const READ_CURRENT_DOCUMENT_TOOL_NAME = 'read_current_document';

/**
 * 创建内置只读工具
 * @returns 只读工具执行器对象
 */
export function createBuiltinReadTools(): BuiltinReadTools {
  return {
    readCurrentDocument: {
      definition: {
        name: READ_CURRENT_DOCUMENT_TOOL_NAME,
        description: '读取当前编辑器文档的标题、路径和 Markdown 内容。',
        source: 'builtin',
        riskLevel: 'read',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      },
      async execute(_input: Record<string, never>, context: AIToolContext) {
        const path = context.document.locator ?? context.document.path ?? buildUnsavedPath({ id: context.document.id, fileName: context.document.title });
        const content = context.document.getContent();

        return createToolSuccessResult(READ_CURRENT_DOCUMENT_TOOL_NAME, {
          id: context.document.id,
          title: context.document.title,
          path,
          content
        });
      }
    }
  };
}
