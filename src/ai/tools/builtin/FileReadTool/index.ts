/**
 * @file fileRead/index.ts
 * @description 内置本地文件读取工具实现。
 */
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '../../confirmation';
import type { BuiltinToolBaseOptions } from '../../shared/types';
import type { AIToolExecutionError, AIToolExecutor } from 'types/ai';
import { native } from '@/shared/platform';
import type {
  ReadWorkspaceDirectoryOptions,
  ReadWorkspaceDirectoryResult,
  ReadWorkspaceFileOptions,
  ReadWorkspaceFileResult
} from '@/shared/platform/native/types';
import { recentFilesStorage } from '@/shared/storage';
import { isAbsoluteFilePath, isPathInsideWorkspace } from '@/shared/workspace/pathUtils';
import { isUnsavedPath, parseUnsavedPath } from '@/utils/file/unsaved';
import { createToolCancelledResult, createToolFailureResult, createToolSuccessResult } from '../../results';

/** read_file 工具名称 */
export const READ_FILE_TOOL_NAME = 'read_file';
/** read_directory 工具名称 */
export const READ_DIRECTORY_TOOL_NAME = 'read_directory';
/** 默认起始行号 */
const DEFAULT_OFFSET = 1;

/** 工作区读取业务错误码 */
type WorkspaceReadErrorCode = 'FILE_NOT_FOUND' | 'INVALID_INPUT' | 'UNSUPPORTED_PROVIDER';

/** read_file 工具输入参数 */
export interface ReadFileInput {
  /** 文件路径，支持相对工作区路径或绝对路径 */
  path?: string;
  /** 起始行号，默认 1 */
  offset?: number;
  /** 读取行数，不传时读取到文件末尾 */
  limit?: number;
}

/** read_file 工具返回结果 */
export interface ReadFileResult {
  /** 规范化后的真实文件路径 */
  path: string;
  /** 截取后的文本内容 */
  content: string;
  /** 文件总行数 */
  totalLines: number;
  /** 实际读取行数 */
  readLines: number;
  /** 是否还有后续内容 */
  hasMore: boolean;
  /** 下一次滚动读取的起始行号，没有后续内容时为 null */
  nextOffset: number | null;
}

/** 创建 read_file 工具的选项 */
export interface CreateBuiltinReadFileToolOptions extends BuiltinToolBaseOptions {
  /** 读取本地文件，测试时可注入替身 */
  readWorkspaceFile?: (options: ReadWorkspaceFileOptions) => Promise<ReadWorkspaceFileResult>;
  /** 读取本地目录，测试时可注入替身 */
  readWorkspaceDirectory?: (options: ReadWorkspaceDirectoryOptions) => Promise<ReadWorkspaceDirectoryResult>;
}

/** read_directory 工具输入参数 */
export interface ReadDirectoryInput {
  /** 目录路径，支持相对工作区路径或绝对路径 */
  path: string;
}

/**
 * 从未知错误中提取业务错误码。
 * @param error - 未知错误
 * @returns 业务错误码或 null
 */
function readErrorCode(error: unknown): WorkspaceReadErrorCode | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { code: unknown };
  if (typeof code !== 'string') {
    return null;
  }

  return code as WorkspaceReadErrorCode;
}

/**
 * 将工作区读取错误码映射为工具错误码。
 * @param code - 工作区读取错误码
 * @returns 工具错误码
 */
function mapWorkspaceErrorCode(code: WorkspaceReadErrorCode | null): AIToolExecutionError['code'] {
  switch (code) {
    case 'INVALID_INPUT':
      return 'INVALID_INPUT';
    case 'UNSUPPORTED_PROVIDER':
      return 'UNSUPPORTED_PROVIDER';
    case 'FILE_NOT_FOUND':
    default:
      return 'EXECUTION_FAILED';
  }
}

/**
 * 读取错误消息。
 * @param error - 未知错误
 * @returns 可展示错误消息
 */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '读取文件失败';
}

/**
 * 读取目录错误消息。
 * @param error - 未知错误
 * @returns 可展示错误消息
 */
function readDirectoryErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '读取目录失败';
}

/**
 * 规范化读取行范围。
 * @param input - read_file 输入参数
 * @returns 规范化后的读取行范围
 */
function normalizeReadRange(input: ReadFileInput): { offset: number; limit?: number } {
  const offset = input.offset ?? DEFAULT_OFFSET;

  if (!Number.isInteger(offset) || offset < 1) {
    throw new Error('offset 必须是大于等于 1 的整数');
  }

  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
    throw new Error('limit 必须是大于等于 1 的整数');
  }

  if (input.limit === undefined) {
    return { offset };
  }

  return { offset, limit: input.limit };
}

/**
 * 读取确认结果。
 * @param decision - 用户确认结果
 * @returns 是否允许执行
 */
function readConfirmationApproved(decision: boolean | { approved: boolean }): boolean {
  if (typeof decision === 'boolean') {
    return decision;
  }

  return decision.approved;
}

/**
 * 构造读取范围描述文本。
 * @param range - 读取行范围
 * @returns 读取范围描述
 */
function buildReadRangeText(range: { offset: number; limit?: number }): string {
  if (range.limit === undefined) {
    return `从第 ${range.offset} 行开始读取到文件末尾`;
  }

  return `从第 ${range.offset} 行开始，读取 ${range.limit} 行`;
}

/**
 * 构造 workspaceRoot 参数。
 * @param workspaceRoot - 工作区根目录
 * @returns workspaceRoot 参数对象
 */
function buildWorkspaceRootOptions(workspaceRoot: string | null): { workspaceRoot?: string } {
  if (!workspaceRoot) {
    return {};
  }

  return { workspaceRoot };
}

/**
 * 构造 limit 参数。
 * @param limit - 读取行数
 * @returns limit 参数对象
 */
function buildLimitOptions(limit?: number): Partial<Pick<ReadWorkspaceFileOptions, 'limit'>> {
  if (limit === undefined) {
    return {};
  }

  return { limit };
}

/**
 * 解析用于编辑器内存读取的真实路径。
 * @param filePath - 文件路径
 * @param workspaceRoot - 工作区根目录
 * @returns 可用于匹配编辑器文件的路径，无法解析时返回空字符串
 */
function resolveEditorFilePath(filePath: string, workspaceRoot: string | null | undefined): string {
  if (isAbsoluteFilePath(filePath)) {
    return filePath;
  }

  if (!workspaceRoot) {
    return '';
  }

  return `${workspaceRoot.replace(/\/$/, '')}/${filePath.replace(/^\//, '')}`;
}

/**
 * 判断目标路径是否在工作区内。
 * 有 workspaceRoot 时：绝对路径用 isPathInsideWorkspace 判断，相对路径默认在工作区内。
 * 无 workspaceRoot 时：一律视为工作区外。
 * @param filePath - 目标路径
 * @param workspaceRoot - 工作区根目录
 * @returns 是否在工作区内
 */
function isPathInside(filePath: string, workspaceRoot: string | null): boolean {
  if (!workspaceRoot) {
    return false;
  }
  if (!isAbsoluteFilePath(filePath)) {
    return true;
  }
  return isPathInsideWorkspace(filePath, workspaceRoot);
}

/**
 * 请求用户确认读取本地绝对路径。
 * @param adapter - 确认适配器
 * @param filePath - 文件路径
 * @param range - 读取行范围
 * @returns 是否已确认
 */
async function confirmAbsoluteRead(adapter: AIToolConfirmationAdapter, filePath: string, range: { offset: number; limit?: number }): Promise<boolean> {
  const rangeText = buildReadRangeText(range);
  const request: AIToolConfirmationRequest = {
    toolName: READ_FILE_TOOL_NAME,
    title: 'AI 想要读取本地文件',
    description: `AI 请求读取本地文件：${filePath}\n读取范围：${rangeText}。`,
    riskLevel: 'read',
    beforeText: filePath
  };
  const decision = await adapter.confirm(request);

  return readConfirmationApproved(decision);
}

/**
 * 请求用户确认读取本地绝对路径目录。
 * @param adapter - 确认适配器
 * @param directoryPath - 目录路径
 * @returns 是否已确认
 */
async function confirmAbsoluteDirectoryRead(adapter: AIToolConfirmationAdapter, directoryPath: string): Promise<boolean> {
  const request: AIToolConfirmationRequest = {
    toolName: READ_DIRECTORY_TOOL_NAME,
    title: 'AI 想要读取本地目录',
    description: `AI 请求读取本地目录：${directoryPath}\n仅返回当前目录的直接子项。`,
    riskLevel: 'read',
    beforeText: directoryPath
  };
  const decision = await adapter.confirm(request);

  return readConfirmationApproved(decision);
}

/**
 * 将原始文件内容按 offset/limit 切片并构造 ReadFileResult。
 * @param filePath - 文件路径
 * @param fullContent - 完整文件内容
 * @param offset - 起始行号（1-based）
 * @param limit - 读取行数，不传时读到末尾
 * @returns 切片后的读取结果
 */
function buildReadFileResult(filePath: string, fullContent: string, offset: number, limit?: number): ReadFileResult {
  const lines = fullContent.split('\n');
  const totalLines = lines.length;
  const startLine = Math.max(0, offset - 1);

  let endLine = totalLines;
  if (limit !== undefined) {
    endLine = Math.min(startLine + limit, totalLines);
  }

  const content = lines.slice(startLine, endLine).join('\n');
  const readLines = endLine - startLine;
  const hasMore = endLine < totalLines;

  let nextOffset: number | null = null;
  if (hasMore) {
    nextOffset = endLine + 1;
  }

  return {
    path: filePath,
    content,
    totalLines,
    readLines,
    hasMore,
    nextOffset
  };
}

/**
 * 创建内置 read_file 工具。
 * @param options - 工具创建选项
 * @returns read_file 工具执行器
 */
export function createBuiltinReadFileTool(options: CreateBuiltinReadFileToolOptions = {}): AIToolExecutor<ReadFileInput, ReadFileResult> {
  const readWorkspaceFile = options.readWorkspaceFile ?? native.readWorkspaceFile.bind(native);
  /** 当前会话中已确认过的绝对路径，同一路径仅需确认一次 */
  const sessionApprovedPaths = new Set<string>();

  return {
    definition: {
      name: READ_FILE_TOOL_NAME,
      description: '读取指定本地文本文件内容，可通过 offset 和 limit 滚动读取。相对路径需要工作区根目录，绝对路径需要用户确认（最近文件列表中的路径除外）。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径或绝对路径。' },
          offset: { type: 'number', description: '起始行号，默认 1。' },
          limit: { type: 'number', description: '读取行数；不传时读取到文件末尾。' }
        },
        additionalProperties: false
      }
    },
    async execute(input: ReadFileInput) {
      let filePath = '';
      if (typeof input.path === 'string') {
        filePath = input.path.trim();
      }

      if (!filePath) {
        return createToolFailureResult(READ_FILE_TOOL_NAME, 'INVALID_INPUT', '文件路径不能为空');
      }

      // 检查是否为未保存文档虚拟路径，并读取对应草稿内容。
      if (isUnsavedPath(filePath)) {
        const unsavedReference = parseUnsavedPath(filePath);
        let storedFile: Awaited<ReturnType<typeof recentFilesStorage.getRecentFile>> | null = null;

        if (unsavedReference) {
          storedFile = await recentFilesStorage.getRecentFile(unsavedReference.fileId);
        }

        if (!storedFile || storedFile.content === undefined) {
          return createToolFailureResult(READ_FILE_TOOL_NAME, 'EXECUTION_FAILED', `未找到未保存文件：${filePath}`);
        }

        const range = normalizeReadRange(input);
        const result = buildReadFileResult(filePath, storedFile.content, range.offset, range.limit);
        return createToolSuccessResult<ReadFileResult>(READ_FILE_TOOL_NAME, result);
      }

      // 尝试从编辑器内存中获取已打开文件的最新内容（含未保存修改）。
      if (options.findFileByPath && options.getEditorContext) {
        try {
          // 解析路径：相对路径需拼接 workspaceRoot
          const root = options.getWorkspaceRoot?.();
          const resolvedPath = resolveEditorFilePath(filePath, root);

          if (resolvedPath) {
            const file = await options.findFileByPath(resolvedPath);
            if (file) {
              const context = options.getEditorContext(file.id);
              if (context) {
                try {
                  const range = normalizeReadRange(input);
                  const content = context.document.getContent();
                  const result = buildReadFileResult(filePath, content, range.offset, range.limit);
                  return createToolSuccessResult(READ_FILE_TOOL_NAME, result);
                } catch {
                  // getContent() 异常，静默降级到文件系统读取
                }
              }
            }
          }
        } catch {
          // 注入函数异常，静默降级到文件系统读取
        }
      }

      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const confirmationAdapter = options.confirm;

      // 判断目标路径是否在工作区内：工作区内静默读取，工作区外需用户确认
      const isInsideWorkspace = isPathInside(filePath, workspaceRoot);

      if (!isInsideWorkspace) {
        if (!confirmationAdapter) {
          return createToolFailureResult(READ_FILE_TOOL_NAME, 'PERMISSION_DENIED', '读取工作区外的文件需要用户确认');
        }

        const isRecentFile = options.isFileInRecent?.(filePath) === true;
        const hasApproved = sessionApprovedPaths.has(filePath);

        if (!isRecentFile && !hasApproved) {
          const range = normalizeReadRange(input);
          const confirmed = await confirmAbsoluteRead(confirmationAdapter, filePath, range);
          if (!confirmed) {
            return createToolCancelledResult(READ_FILE_TOOL_NAME);
          }
          sessionApprovedPaths.add(filePath);
        }
      }

      try {
        const range = normalizeReadRange(input);
        const result = await readWorkspaceFile({
          filePath,
          ...buildWorkspaceRootOptions(workspaceRoot),
          offset: range.offset,
          ...buildLimitOptions(range.limit)
        });
        return createToolSuccessResult(READ_FILE_TOOL_NAME, result);
      } catch (error) {
        const code = mapWorkspaceErrorCode(readErrorCode(error));
        return createToolFailureResult(READ_FILE_TOOL_NAME, code, readErrorMessage(error));
      }
    }
  };
}

/**
 * 创建内置 read_directory 工具。
 * @param options - 工具创建选项
 * @returns read_directory 工具执行器
 */
export function createBuiltinReadDirectoryTool(
  options: CreateBuiltinReadFileToolOptions = {}
): AIToolExecutor<ReadDirectoryInput, ReadWorkspaceDirectoryResult> {
  const readWorkspaceDirectory = options.readWorkspaceDirectory ?? native.readWorkspaceDirectory.bind(native);
  /** 当前会话中已确认过的绝对路径，同一路径仅需确认一次 */
  const sessionApprovedPaths = new Set<string>();

  return {
    definition: {
      name: READ_DIRECTORY_TOOL_NAME,
      description:
        '读取指定目录下的直接子项列表，仅返回当前目录中的文件和子目录，不递归展开。相对路径需要工作区根目录，绝对路径需要用户确认（最近文件列表中的路径除外）。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，支持相对工作区路径或绝对路径。' }
        },
        required: ['path'],
        additionalProperties: false
      }
    },
    async execute(input: ReadDirectoryInput) {
      let directoryPath = '';
      if (typeof input.path === 'string') {
        directoryPath = input.path.trim();
      }

      if (!directoryPath) {
        return createToolFailureResult(READ_DIRECTORY_TOOL_NAME, 'INVALID_INPUT', '目录路径不能为空');
      }

      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const confirmationAdapter = options.confirm;

      // 判断目标路径是否在工作区内：工作区内静默读取，工作区外需用户确认
      const isInsideWorkspace = isPathInside(directoryPath, workspaceRoot);

      if (!isInsideWorkspace) {
        if (!confirmationAdapter) {
          return createToolFailureResult(READ_DIRECTORY_TOOL_NAME, 'PERMISSION_DENIED', '读取工作区外的目录需要用户确认');
        }

        const isRecentFile = options.isFileInRecent?.(directoryPath) === true;
        const hasApproved = sessionApprovedPaths.has(directoryPath);

        if (!isRecentFile && !hasApproved) {
          const confirmed = await confirmAbsoluteDirectoryRead(confirmationAdapter, directoryPath);
          if (!confirmed) {
            return createToolCancelledResult(READ_DIRECTORY_TOOL_NAME);
          }
          sessionApprovedPaths.add(directoryPath);
        }
      }

      try {
        const result = await readWorkspaceDirectory({
          directoryPath,
          ...buildWorkspaceRootOptions(workspaceRoot)
        });

        return createToolSuccessResult(READ_DIRECTORY_TOOL_NAME, result);
      } catch (error) {
        const code = mapWorkspaceErrorCode(readErrorCode(error));
        return createToolFailureResult(READ_DIRECTORY_TOOL_NAME, code, readDirectoryErrorMessage(error));
      }
    }
  };
}
