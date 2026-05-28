/**
 * @file DocumentTool/index.ts
 * @description 内置文档工具实现（读取 + 创建）
 */
import type { OpenDraftInput, OpenDraftResult } from '../../shared/types';
import type { AIToolContext, AIToolExecutor } from 'types/ai';
import { buildUnsavedPath } from '@/utils/file/unsaved';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

// ─── 读取当前文档 ───────────────────────────────────────────────────────────────

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

// ─── 创建文档 ───────────────────────────────────────────────────────────────

/** 创建文档工具名称。 */
export const CREATE_DOCUMENT_TOOL_NAME = 'create_document';

/**
 * 创建文档输入参数。
 */
export interface CreateDocumentInput {
  /** 文档标题/文件名，如 "README"。 */
  title: string;
  /** 文档初始内容。 */
  content: string;
  /** 文件扩展名，默认为 "md"。 */
  ext?: string;
}

/**
 * 创建文档结果。
 */
export interface CreateDocumentResult {
  /** 文档 ID。 */
  id: string;
  /** 文档标题。 */
  title: string;
  /** 文档路径（unsaved:// 虚拟路径）。 */
  path: string;
  /** 文档内容。 */
  content: string;
}

/**
 * 创建文档写工具的选项。
 */
export interface CreateBuiltinDocumentWriteToolOptions {
  /** 创建并打开未保存草稿的函数。 */
  openDraft?: (input: OpenDraftInput) => Promise<OpenDraftResult>;
}

/**
 * 创建内置文档写工具。
 * @param options - 工具创建选项
 * @returns 文档创建工具执行器
 */
export function createBuiltinDocumentWriteTool(options: CreateBuiltinDocumentWriteToolOptions): {
  createDocument: AIToolExecutor<CreateDocumentInput, CreateDocumentResult>;
} {
  return {
    createDocument: {
      definition: {
        name: CREATE_DOCUMENT_TOOL_NAME,
        description: '创建新的编辑器文档（未保存草稿）。提供标题和初始内容，将在编辑器中打开新标签页供用户编辑。',
        source: 'builtin',
        riskLevel: 'write',
        requiresActiveDocument: false,
        permissionCategory: 'document',
        safeAutoApprove: true,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '文档标题/文件名，如 "README"。' },
            content: { type: 'string', description: '文档的初始内容。' },
            ext: { type: 'string', description: '文件扩展名，默认为 "md"。支持 md、txt、json 等。' }
          },
          required: ['title', 'content'],
          additionalProperties: false
        }
      },
      async execute(input: CreateDocumentInput) {
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        const content = typeof input.content === 'string' ? input.content : '';
        const rawExt = typeof input.ext === 'string' && input.ext.trim() ? input.ext.trim() : 'md';
        // 清洗 ext 参数，去除路径分隔符和前导点号，防止路径穿越和非法字符
        const ext = rawExt.replace(/[/\\:*?"<>|]+/g, '').replace(/^\.+/, '') || 'md';

        if (!title) {
          return createToolFailureResult(CREATE_DOCUMENT_TOOL_NAME, 'INVALID_INPUT', '文档标题不能为空');
        }

        if (!options.openDraft) {
          return createToolFailureResult(CREATE_DOCUMENT_TOOL_NAME, 'EXECUTION_FAILED', '当前环境不支持创建文档');
        }

        // 构建 originalPath，包含扩展名
        const fileName = `${title}.${ext}`;

        try {
          const draft = await options.openDraft({ originalPath: fileName, content });

          return createToolSuccessResult(CREATE_DOCUMENT_TOOL_NAME, {
            id: draft.file.id,
            title: draft.file.name,
            path: draft.unsavedPath,
            content: draft.file.content
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : '创建文档失败';
          return createToolFailureResult(CREATE_DOCUMENT_TOOL_NAME, 'EXECUTION_FAILED', message);
        }
      }
    }
  };
}
