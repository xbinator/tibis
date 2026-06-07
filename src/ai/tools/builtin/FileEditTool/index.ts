/**
 * @file fileEdit/index.ts
 * @description 内置本地文件局部编辑工具实现。
 */
import type { CreateBuiltinEditFileToolOptions, EditFileInput, EditFileResult } from './types';
import type { AIToolConfirmationRequest } from '../../confirmation';
import type { AIToolContext, AIToolExecutionError, AIToolExecutor } from 'types/ai';
import { native } from '@/shared/platform';
import type { ReadWorkspaceFileResult } from '@/shared/platform/native/types';
import { parseUnsavedPath } from '@/utils/file/unsaved';
import { createToolFailureResult } from '../../results';
import { toFileToolExecutionError } from '../../shared/fileErrors';
import {
  confirmOrCancel,
  executeConfirmedWrite,
  isActiveDocumentTarget,
  isUnsavedPath,
  mapNativeError,
  readUnsavedDraft,
  resolveTargetPath,
  writeUnsavedDraft
} from '../../shared/fileTool';

/** edit_file 工具名称。 */
export const EDIT_FILE_TOOL_NAME = 'edit_file';

/**
 * 统计字符串出现次数。
 * @param content - 文件内容
 * @param search - 待查找字符串
 * @returns 出现次数
 */
function countOccurrences(content: string, search: string): number {
  if (!search) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const matchIndex = content.indexOf(search, startIndex);
    if (matchIndex === -1) {
      return count;
    }

    count += 1;
    startIndex = matchIndex + search.length;
  }
}

/**
 * 执行单次或批量字符串替换。
 * @param content - 原始内容
 * @param oldString - 待替换内容
 * @param newString - 新内容
 * @param replaceAll - 是否替换全部
 * @returns 替换后的文本与替换次数
 */
function applyStringReplacement(content: string, oldString: string, newString: string, replaceAll: boolean): { content: string; replacedCount: number } {
  const matchCount = countOccurrences(content, oldString);
  if (matchCount === 0) {
    return { content, replacedCount: 0 };
  }

  if (replaceAll) {
    return {
      content: content.split(oldString).join(newString),
      replacedCount: matchCount
    };
  }

  const matchIndex = content.indexOf(oldString);
  return {
    content: `${content.slice(0, matchIndex)}${newString}${content.slice(matchIndex + oldString.length)}`,
    replacedCount: 1
  };
}

// ─── 草稿编辑处理 ─────────────────────────────────────────────────────────────

/**
 * 处理无工作区 + 相对路径降级为草稿的编辑流程。
 * edit_file 需要已有内容才能执行搜索替换，因此该场景返回错误。
 * @param originalPath - 用户输入的原始相对路径
 * @returns 失败结果
 */
function handleDraftEdit(originalPath: string): ReturnType<typeof createToolFailureResult> {
  return createToolFailureResult(
    EDIT_FILE_TOOL_NAME,
    'EXECUTION_FAILED',
    `无法编辑相对路径文件「${originalPath}」：当前无工作区，且编辑操作需要已有文件内容才能执行搜索替换。请使用绝对路径或先打开工作区。`
  );
}

/**
 * 处理目标为未保存草稿的编辑流程：读取草稿内容 → 字符串替换 → 写回草稿。
 * @param options - 工具创建选项
 * @param context - 工具执行上下文
 * @param targetPath - 未保存草稿虚拟路径
 * @param oldString - 待替换文本
 * @param newString - 替换后文本
 * @param replaceAll - 是否替换全部
 * @returns 工具执行结果
 */
async function handleUnsavedEdit(
  options: CreateBuiltinEditFileToolOptions,
  context: AIToolContext | undefined,
  targetPath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): Promise<ReturnType<typeof createToolFailureResult> | ReturnType<typeof executeConfirmedWrite<EditFileResult>>> {
  const unsavedReference = parseUnsavedPath(targetPath);
  if (!unsavedReference) {
    return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', `未识别的未保存文档路径：${targetPath}`);
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
    return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'EXECUTION_FAILED', `未找到未保存文件：${targetPath}`);
  }

  const matchCount = countOccurrences(currentContent, oldString);
  if (matchCount === 0) {
    const error = toFileToolExecutionError('MATCH_NOT_FOUND');
    return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
  }

  if (matchCount > 1 && !replaceAll) {
    const error = toFileToolExecutionError('MATCH_NOT_UNIQUE');
    return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
  }

  const nextFile = applyStringReplacement(currentContent, oldString, newString, replaceAll);

  const request: AIToolConfirmationRequest = {
    toolCallId: context?.toolCallId ?? '',
    toolName: EDIT_FILE_TOOL_NAME,
    title: 'AI 想要修改未保存草稿',
    description: `AI 请求修改未保存草稿：${targetPath}\n将 ${nextFile.replacedCount} 处匹配内容替换为新文本。`,
    riskLevel: 'write',
    beforeText: oldString,
    afterText: newString
  };

  const cancelled = await confirmOrCancel(options.confirm, request, EDIT_FILE_TOOL_NAME);
  if (cancelled) return cancelled;

  return executeConfirmedWrite(options.confirm, request, EDIT_FILE_TOOL_NAME, '修改文件失败', async () => {
    if (isActive) {
      await context?.editor.replaceDocument(nextFile.content);
    } else {
      await writeUnsavedDraft(options, unsavedReference.fileId, { content: nextFile.content, modifiedAt: Date.now() });
    }

    return { path: targetPath, content: nextFile.content, replacedCount: nextFile.replacedCount };
  });
}

/**
 * 创建内置 edit_file 工具。
 * @param options - 工具创建选项
 * @returns edit_file 工具执行器
 */
export function createBuiltinEditFileTool(options: CreateBuiltinEditFileToolOptions): AIToolExecutor<EditFileInput, EditFileResult> {
  const readWorkspaceFile = options.readWorkspaceFile ?? native.readWorkspaceFile.bind(native);
  const writeFile = options.writeFile ?? native.writeFile.bind(native);

  return {
    definition: {
      name: EDIT_FILE_TOOL_NAME,
      description: '按精确字符串匹配修改本地文本文件或未保存草稿。执行前会向用户展示确认信息。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径、绝对路径或未保存草稿虚拟路径。' },
          oldString: { type: 'string', description: '待替换的原始文本。' },
          newString: { type: 'string', description: '替换后的文本。' },
          replaceAll: { type: 'boolean', description: '是否替换全部匹配项，默认 false。' }
        },
        required: ['path', 'oldString', 'newString'],
        additionalProperties: false
      }
    },
    async execute(input: EditFileInput, context?: AIToolContext) {
      const filePath = typeof input.path === 'string' ? input.path.trim() : '';
      const oldString = typeof input.oldString === 'string' ? input.oldString : '';
      const newString = typeof input.newString === 'string' ? input.newString : '';
      const replaceAll = input.replaceAll === true;

      if (!filePath) {
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', '文件路径不能为空');
      }

      if (!oldString) {
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', 'oldString 不能为空');
      }

      if (oldString === newString) {
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', 'oldString 与 newString 不能完全相同');
      }

      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const resolvedTargetPath = resolveTargetPath(filePath, workspaceRoot, EDIT_FILE_TOOL_NAME);
      if ('error' in resolvedTargetPath) {
        return resolvedTargetPath.error;
      }

      if ('draft' in resolvedTargetPath) {
        return handleDraftEdit(resolvedTargetPath.originalPath);
      }

      if (isUnsavedPath(resolvedTargetPath.path)) {
        return handleUnsavedEdit(options, context, resolvedTargetPath.path, oldString, newString, replaceAll);
      }

      const isOutsideWorkspace = 'outsideWorkspace' in resolvedTargetPath;

      let currentFile: ReadWorkspaceFileResult;
      try {
        currentFile = await readWorkspaceFile({
          filePath,
          ...(workspaceRoot ? { workspaceRoot } : {}),
          offset: 1
        });
      } catch (error) {
        const { code, message } = mapNativeError(error);
        const mappedCode: AIToolExecutionError['code'] = code === 'EXECUTION_FAILED' && message.includes('文件不存在') ? 'EXECUTION_FAILED' : code;
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, mappedCode, message);
      }

      const matchCount = countOccurrences(currentFile.content, oldString);
      if (matchCount === 0) {
        const error = toFileToolExecutionError('MATCH_NOT_FOUND');
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
      }

      if (matchCount > 1 && !replaceAll) {
        const error = toFileToolExecutionError('MATCH_NOT_UNIQUE');
        return createToolFailureResult(EDIT_FILE_TOOL_NAME, error.code, error.message);
      }

      const nextFile = applyStringReplacement(currentFile.content, oldString, newString, replaceAll);
      const baseTitle = 'AI 想要修改本地文件';
      const baseDescription = `AI 请求修改本地文件：${currentFile.path}\n将 ${nextFile.replacedCount} 处匹配内容替换为新文本。`;

      const request: AIToolConfirmationRequest = {
        toolCallId: context?.toolCallId ?? '',
        toolName: EDIT_FILE_TOOL_NAME,
        title: baseTitle,
        description: baseDescription,
        riskLevel: isOutsideWorkspace ? 'dangerous' : 'write',
        beforeText: oldString,
        afterText: newString
      };
      const cancelled = await confirmOrCancel(options.confirm, request, EDIT_FILE_TOOL_NAME);
      if (cancelled) {
        return cancelled;
      }

      return executeConfirmedWrite(options.confirm, request, EDIT_FILE_TOOL_NAME, '修改文件失败', async () => {
        if (isActiveDocumentTarget(context, currentFile.path)) {
          await context?.editor.replaceDocument(nextFile.content);
        } else {
          await writeFile(currentFile.path, nextFile.content);
        }

        return {
          path: currentFile.path,
          content: nextFile.content,
          replacedCount: nextFile.replacedCount
        };
      });
    }
  };
}

export type { CreateBuiltinEditFileToolOptions, EditFileInput, EditFileResult } from './types';
