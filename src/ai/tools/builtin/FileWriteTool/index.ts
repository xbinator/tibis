/**
 * @file fileWrite/index.ts
 * @description 内置本地文件写入工具实现。
 */
import type { CreateBuiltinWriteFileToolOptions, WriteFileInput, WriteFileResult } from './types';
import type { AIToolConfirmationRequest } from '../../confirmation';
import type { AIToolContext, AIToolExecutor } from 'types/ai';
import { native } from '@/shared/platform';
import type { ReadWorkspaceFileResult } from '@/shared/platform/native/types';
import { parseUnsavedPath } from '@/utils/file/unsaved';
import { createToolFailureResult } from '../../results';
import {
  confirmOrCancel,
  executeConfirmedWrite,
  isActiveDocumentTarget,
  isUnsavedPath,
  readUnsavedDraft,
  resolveTargetPath,
  writeUnsavedDraft
} from '../../shared/fileTool';

/** write_file 工具名称。 */
export const WRITE_FILE_TOOL_NAME = 'write_file';

/**
 * 尝试读取工作区文件，文件不存在时返回 null。
 * @param readWorkspaceFile - 读取函数
 * @param filePath - 文件路径
 * @param workspaceRoot - 工作区根目录
 * @returns 文件读取结果或 null
 */
async function tryReadWorkspaceFile(
  readWorkspaceFile: (options: { filePath: string; workspaceRoot?: string; offset?: number }) => Promise<ReadWorkspaceFileResult>,
  filePath: string,
  workspaceRoot: string | null
): Promise<ReadWorkspaceFileResult | null> {
  try {
    return await readWorkspaceFile({
      filePath,
      ...(workspaceRoot ? { workspaceRoot } : {}),
      offset: 1
    });
  } catch {
    return null;
  }
}

// ─── 草稿写入处理 ─────────────────────────────────────────────────────────────

/**
 * 处理无工作区 + 相对路径降级为草稿的写入流程。
 * @param options - 工具创建选项
 * @param originalPath - 用户输入的原始相对路径
 * @param content - 写入内容
 * @returns 工具执行结果
 */
async function handleDraftWrite(
  options: CreateBuiltinWriteFileToolOptions,
  originalPath: string,
  content: string
): Promise<ReturnType<typeof createToolFailureResult> | ReturnType<typeof executeConfirmedWrite<WriteFileResult>>> {
  if (!options.openDraft) {
    return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'EXECUTION_FAILED', '当前环境不支持创建未保存草稿');
  }

  const request: AIToolConfirmationRequest = {
    toolName: WRITE_FILE_TOOL_NAME,
    title: 'AI 想要创建未保存草稿',
    description: `AI 请求创建未保存草稿：${originalPath}`,
    riskLevel: 'write',
    afterText: content
  };

  const cancelled = await confirmOrCancel(options.confirm, request, WRITE_FILE_TOOL_NAME);
  if (cancelled) return cancelled;

  return executeConfirmedWrite(options.confirm, request, WRITE_FILE_TOOL_NAME, '写入文件失败', async () => {
    const draft = await options.openDraft!({ originalPath, content });
    return { path: draft.unsavedPath, content, created: true };
  });
}

/**
 * 处理目标为未保存草稿的写入流程：读取草稿内容 → 展示 diff → 确认 → 写回。
 * @param options - 工具创建选项
 * @param context - 工具执行上下文
 * @param targetPath - 未保存草稿虚拟路径
 * @param content - 写入内容
 * @returns 工具执行结果
 */
async function handleUnsavedWrite(
  options: CreateBuiltinWriteFileToolOptions,
  context: AIToolContext | undefined,
  targetPath: string,
  content: string
): Promise<ReturnType<typeof createToolFailureResult> | ReturnType<typeof executeConfirmedWrite<WriteFileResult>>> {
  const unsavedReference = parseUnsavedPath(targetPath);
  if (!unsavedReference) {
    return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'INVALID_INPUT', `未识别的未保存文档路径：${targetPath}`);
  }

  const isActive = isActiveDocumentTarget(context, targetPath);
  let currentContent: string | null;
  if (isActive) {
    currentContent = context?.document.getContent() ?? null;
  } else {
    const draft = await readUnsavedDraft(options, unsavedReference.fileId);
    currentContent = draft?.content ?? null;
  }

  if (currentContent === null) {
    return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'EXECUTION_FAILED', `未找到未保存文件：${targetPath}`);
  }

  const request: AIToolConfirmationRequest = {
    toolName: WRITE_FILE_TOOL_NAME,
    title: 'AI 想要修改未保存草稿',
    description: `AI 请求修改未保存草稿：${targetPath}`,
    riskLevel: 'write',
    beforeText: currentContent,
    afterText: content
  };

  const cancelled = await confirmOrCancel(options.confirm, request, WRITE_FILE_TOOL_NAME);
  if (cancelled) return cancelled;

  return executeConfirmedWrite(options.confirm, request, WRITE_FILE_TOOL_NAME, '写入文件失败', async () => {
    if (isActive) {
      await context?.editor.replaceDocument(content);
    } else {
      await writeUnsavedDraft(options, unsavedReference.fileId, { content, modifiedAt: Date.now() });
    }

    return { path: targetPath, content, created: false };
  });
}

/**
 * 处理目标为工作区文件的写入流程：判断文件是否存在 → 展示 diff → 确认 → 写入。
 * @param options - 工具创建选项
 * @param context - 工具执行上下文
 * @param targetPath - 规范化后的目标路径
 * @param content - 写入内容
 * @param isOutsideWorkspace - 是否在工作区外，工作区外时强调风险
 * @returns 工具执行结果
 */
async function handleWorkspaceWrite(
  options: CreateBuiltinWriteFileToolOptions,
  context: AIToolContext | undefined,
  targetPath: string,
  content: string,
  isOutsideWorkspace = false
): Promise<ReturnType<typeof createToolFailureResult> | ReturnType<typeof executeConfirmedWrite<WriteFileResult>>> {
  const readWorkspaceFile = options.readWorkspaceFile ?? native.readWorkspaceFile.bind(native);
  const writeFile = options.writeFile ?? native.writeFile.bind(native);
  const workspaceRoot = options.getWorkspaceRoot?.() ?? null;

  const existingFile = await tryReadWorkspaceFile(readWorkspaceFile, targetPath, workspaceRoot);
  const fileExists = existingFile !== null;

  const baseTitle = fileExists ? 'AI 想要覆盖本地文件' : 'AI 想要创建本地文件';
  const baseDescription = fileExists ? `AI 请求覆盖本地文件：${targetPath}` : `AI 请求创建本地文件：${targetPath}`;

  const request: AIToolConfirmationRequest = {
    toolName: WRITE_FILE_TOOL_NAME,
    title: baseTitle,
    description: isOutsideWorkspace ? `${baseDescription}\n该文件不在当前工作区内，请确认是否允许。` : baseDescription,
    riskLevel: isOutsideWorkspace || fileExists ? 'dangerous' : 'write',
    ...(fileExists ? { beforeText: existingFile.content, afterText: content } : { afterText: content })
  };

  const cancelled = await confirmOrCancel(options.confirm, request, WRITE_FILE_TOOL_NAME);
  if (cancelled) return cancelled;

  return executeConfirmedWrite(options.confirm, request, WRITE_FILE_TOOL_NAME, '写入文件失败', async () => {
    if (isActiveDocumentTarget(context, targetPath)) {
      await context?.editor.replaceDocument(content);
    } else {
      await writeFile(targetPath, content);
    }

    return { path: targetPath, content, created: !fileExists };
  });
}

/**
 * 创建内置 write_file 工具。
 * @param options - 工具创建选项
 * @returns write_file 工具执行器
 */
export function createBuiltinWriteFileTool(options: CreateBuiltinWriteFileToolOptions): AIToolExecutor<WriteFileInput, WriteFileResult> {
  return {
    definition: {
      name: WRITE_FILE_TOOL_NAME,
      description: '创建或覆盖本地文本文件或未保存草稿。执行前会向用户展示确认信息。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径、绝对路径或未保存草稿虚拟路径。' },
          content: { type: 'string', description: '新的完整文件内容。' }
        },
        required: ['path', 'content'],
        additionalProperties: false
      }
    },
    async execute(input: WriteFileInput, context?: AIToolContext) {
      const filePath = typeof input.path === 'string' ? input.path.trim() : '';
      const content = typeof input.content === 'string' ? input.content : '';

      if (!filePath) {
        return createToolFailureResult(WRITE_FILE_TOOL_NAME, 'INVALID_INPUT', '文件路径不能为空');
      }

      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const resolvedTargetPath = resolveTargetPath(filePath, workspaceRoot, WRITE_FILE_TOOL_NAME);
      if ('error' in resolvedTargetPath) {
        return resolvedTargetPath.error;
      }

      if ('draft' in resolvedTargetPath) {
        return handleDraftWrite(options, resolvedTargetPath.originalPath, content);
      }

      if (isUnsavedPath(resolvedTargetPath.path)) {
        return handleUnsavedWrite(options, context, resolvedTargetPath.path, content);
      }

      const isOutsideWorkspace = 'outsideWorkspace' in resolvedTargetPath;
      return handleWorkspaceWrite(options, context, resolvedTargetPath.path, content, isOutsideWorkspace);
    }
  };
}

export type { CreateBuiltinWriteFileToolOptions, WriteFileInput, WriteFileResult } from './types';
