/**
 * @file index.mts
 * @description ChatRuntime 主进程文件工具。
 */
import * as fs from 'node:fs/promises';
import type { ChatRuntimeMainToolExecutionInput } from '../../types.mjs';
import type {
  MainToolsDependencies,
  RuntimeCreateDocumentInput,
  RuntimeEditFileInput,
  RuntimeGlobInput,
  RuntimeGrepInput,
  RuntimeReadTarget,
  RuntimeReadDirectoryInput,
  RuntimeReadFileInput,
  RuntimeWriteFileInput
} from '../types.mjs';
import type { AIToolExecutionResult } from 'types/ai';
import { readWorkspaceDirectory, readWorkspaceFile } from '../../../../workspace/read.mjs';
import {
  CREATE_DOCUMENT_TOOL_NAME,
  DEFAULT_READ_FILE_OFFSET,
  EDIT_FILE_TOOL_NAME,
  FILE_TOOL_NAMES,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME
} from '../constants.mjs';
import {
  DEFAULT_FILE_SEARCH_EXCLUDED_DIRS,
  DEFAULT_FILE_SEARCH_LIMIT,
  DEFAULT_GREP_BATCH_SIZE,
  DEFAULT_GREP_LINE_TEXT_LIMIT,
  DEFAULT_GREP_STDERR_LIMIT_BYTES,
  DEFAULT_GREP_STDOUT_LIMIT_BYTES,
  DEFAULT_GREP_TIMEOUT_MS,
  RuntimeSubprocessError,
  runGlobSearch,
  runGrepSearch
} from '../file-search.mjs';
import { isRecord, isRuntimeFileContentSnapshot, isRuntimeOpenDraftResult } from '../guards.mjs';
import { isRuntimePathInsideWorkspace, isRuntimeTrustedHomeReadPath, resolveRuntimeReadTarget, resolveRuntimeWriteTarget } from '../paths.mjs';
import { createBridgeFailureResult, createMainToolCancelledResult, createMainToolFailureResult, createMainToolSuccessResult } from '../results.mjs';

/**
 * 判断工具是否属于文件工具模块。
 * @param toolName - 工具名称
 * @returns 是否为文件工具
 */
export function isFileTool(toolName: string): boolean {
  return FILE_TOOL_NAMES.has(toolName);
}

/**
 * 读取正整数参数。
 * @param value - 原始值
 * @param fallback - 兜底值
 * @returns 正整数或兜底值
 */
function readPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return fallback;

  return value;
}

/**
 * 归一化 read_file 输入。
 * @param input - 原始工具输入
 * @returns 归一化读取输入或失败结果
 */
function normalizeRuntimeReadFileInput(input: unknown): RuntimeReadFileInput | AIToolExecutionResult {
  const source = isRecord(input) ? input : {};
  const filePath = typeof source.path === 'string' ? source.path.trim() : '';
  if (!filePath) {
    return createMainToolFailureResult(READ_FILE_TOOL_NAME, 'INVALID_INPUT', '文件路径不能为空');
  }

  if (source.offset !== undefined && (typeof source.offset !== 'number' || !Number.isInteger(source.offset) || source.offset < 1)) {
    return createMainToolFailureResult(READ_FILE_TOOL_NAME, 'INVALID_INPUT', 'offset 必须是大于等于 1 的整数');
  }

  if (source.limit !== undefined && (typeof source.limit !== 'number' || !Number.isInteger(source.limit) || source.limit < 1)) {
    return createMainToolFailureResult(READ_FILE_TOOL_NAME, 'INVALID_INPUT', 'limit 必须是大于等于 1 的整数');
  }

  return {
    filePath,
    offset: readPositiveInteger(source.offset, DEFAULT_READ_FILE_OFFSET),
    ...(typeof source.limit === 'number' ? { limit: source.limit } : {})
  };
}

/**
 * 归一化 read_directory 输入。
 * @param input - 原始工具输入
 * @returns 归一化目录读取输入或失败结果
 */
function normalizeRuntimeReadDirectoryInput(input: unknown): RuntimeReadDirectoryInput | AIToolExecutionResult {
  const source = isRecord(input) ? input : {};
  const directoryPath = typeof source.path === 'string' ? source.path.trim() : '';
  if (!directoryPath) {
    return createMainToolFailureResult(READ_DIRECTORY_TOOL_NAME, 'INVALID_INPUT', '目录路径不能为空');
  }

  return { directoryPath };
}

/**
 * 读取可选搜索路径。
 * @param source - 输入对象
 * @returns 搜索路径
 */
function readRuntimeSearchPath(source: Record<string, unknown>): string {
  return typeof source.path === 'string' && source.path.trim() ? source.path.trim() : '.';
}

/**
 * 归一化 glob 输入。
 * @param input - 原始工具输入
 * @returns 归一化 glob 输入或失败结果
 */
function normalizeRuntimeGlobInput(input: unknown): RuntimeGlobInput | AIToolExecutionResult {
  const source = isRecord(input) ? input : {};
  const pattern = typeof source.pattern === 'string' ? source.pattern : '';
  if (pattern.length === 0) {
    return createMainToolFailureResult(GLOB_TOOL_NAME, 'INVALID_INPUT', 'glob pattern 不能为空');
  }

  return { pattern, searchPath: readRuntimeSearchPath(source) };
}

/**
 * 归一化 grep 输入。
 * @param input - 原始工具输入
 * @returns 归一化 grep 输入或失败结果
 */
function normalizeRuntimeGrepInput(input: unknown): RuntimeGrepInput | AIToolExecutionResult {
  const source = isRecord(input) ? input : {};
  const pattern = typeof source.pattern === 'string' ? source.pattern : '';
  if (pattern.length === 0) {
    return createMainToolFailureResult(GREP_TOOL_NAME, 'INVALID_INPUT', 'grep pattern 不能为空');
  }

  const include = typeof source.include === 'string' && source.include.length > 0 ? source.include : undefined;

  return {
    pattern,
    searchPath: readRuntimeSearchPath(source),
    ...(include ? { include } : {})
  };
}

/**
 * 清洗文档扩展名。
 * @param rawExt - 原始扩展名
 * @returns 可用于草稿文件名的扩展名
 */
function sanitizeRuntimeDocumentExtension(rawExt: string): string {
  return rawExt.replace(/[/\\:*?"<>|]+/g, '').replace(/^\.+/, '') || 'md';
}

/**
 * 归一化 create_document 输入。
 * @param input - 原始工具输入
 * @returns 归一化创建文档输入或失败结果
 */
function normalizeRuntimeCreateDocumentInput(input: unknown): RuntimeCreateDocumentInput | AIToolExecutionResult {
  const source = isRecord(input) ? input : {};
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const content = typeof source.content === 'string' ? source.content : '';
  const rawExt = typeof source.ext === 'string' && source.ext.trim() ? source.ext.trim() : 'md';

  if (!title) {
    return createMainToolFailureResult(CREATE_DOCUMENT_TOOL_NAME, 'INVALID_INPUT', '文档标题不能为空');
  }

  return { title, content, ext: sanitizeRuntimeDocumentExtension(rawExt) };
}

/**
 * 归一化 write_file 输入。
 * @param input - 原始工具输入
 * @returns 归一化写入输入或失败结果
 */
function normalizeRuntimeWriteFileInput(input: unknown): RuntimeWriteFileInput | AIToolExecutionResult {
  const source = isRecord(input) ? input : {};
  const filePath = typeof source.path === 'string' ? source.path.trim() : '';
  const content = typeof source.content === 'string' ? source.content : '';
  if (!filePath) {
    return createMainToolFailureResult(WRITE_FILE_TOOL_NAME, 'INVALID_INPUT', '文件路径不能为空');
  }

  return { filePath, content };
}

/**
 * 归一化 edit_file 输入。
 * @param input - 原始工具输入
 * @returns 归一化编辑输入或失败结果
 */
function normalizeRuntimeEditFileInput(input: unknown): RuntimeEditFileInput | AIToolExecutionResult {
  const source = isRecord(input) ? input : {};
  const filePath = typeof source.path === 'string' ? source.path.trim() : '';
  const oldString = typeof source.oldString === 'string' ? source.oldString : '';
  const newString = typeof source.newString === 'string' ? source.newString : '';
  const replaceAll = source.replaceAll === true;

  if (!filePath) {
    return createMainToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', '文件路径不能为空');
  }
  if (!oldString) {
    return createMainToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', 'oldString 不能为空');
  }
  if (oldString === newString) {
    return createMainToolFailureResult(EDIT_FILE_TOOL_NAME, 'INVALID_INPUT', 'oldString 与 newString 不能完全相同');
  }

  return { filePath, oldString, newString, replaceAll };
}

/**
 * 根据完整文件内容构建 read_file 工具结果数据。
 * @param filePath - 文件路径
 * @param fullContent - 完整文件内容
 * @param offset - 起始行号
 * @param limit - 读取行数
 * @returns read_file 工具结果数据
 */
function createRuntimeReadFileData(filePath: string, fullContent: string, offset: number, limit?: number): Record<string, unknown> {
  const lines = fullContent.split('\n');
  const startLine = Math.max(0, offset - 1);
  const endLine = limit === undefined ? lines.length : Math.min(startLine + limit, lines.length);
  const hasMore = endLine < lines.length;

  return {
    path: filePath,
    content: lines.slice(startLine, endLine).join('\n'),
    totalLines: lines.length,
    readLines: endLine - startLine,
    hasMore,
    nextOffset: hasMore ? endLine + 1 : null
  };
}

/**
 * 尝试读取现有文件内容。
 * @param filePath - 文件路径
 * @returns 文件存在状态与内容
 */
async function readExistingRuntimeFile(filePath: string): Promise<{ exists: boolean; content: string }> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error('目标路径不是文件');
    }

    return { exists: true, content: await fs.readFile(filePath, 'utf-8') };
  } catch (error) {
    const nodeError = error as { code?: unknown };
    if (nodeError.code === 'ENOENT') {
      return { exists: false, content: '' };
    }

    throw error;
  }
}

/**
 * 统计字符串出现次数。
 * @param content - 文件内容
 * @param search - 待查找字符串
 * @returns 出现次数
 */
function countRuntimeOccurrences(content: string, search: string): number {
  if (!search) return 0;

  let count = 0;
  let startIndex = 0;
  let matchIndex = content.indexOf(search, startIndex);
  while (matchIndex !== -1) {
    count += 1;
    startIndex = matchIndex + search.length;
    matchIndex = content.indexOf(search, startIndex);
  }

  return count;
}

/**
 * 应用字符串替换。
 * @param content - 原始内容
 * @param oldString - 待替换文本
 * @param newString - 替换后文本
 * @param replaceAll - 是否替换全部
 * @returns 替换结果
 */
function applyRuntimeStringReplacement(content: string, oldString: string, newString: string, replaceAll: boolean): { content: string; replacedCount: number } {
  const matchCount = countRuntimeOccurrences(content, oldString);
  if (matchCount === 0) return { content, replacedCount: 0 };
  if (replaceAll) return { content: content.split(oldString).join(newString), replacedCount: matchCount };

  const matchIndex = content.indexOf(oldString);
  return {
    content: `${content.slice(0, matchIndex)}${newString}${content.slice(matchIndex + oldString.length)}`,
    replacedCount: 1
  };
}

/** 文件读取真实目标。 */
interface RuntimeRealReadTarget {
  /** realpath 后用于确认与读取的目标路径。 */
  filePath: string;
  /** 真实路径是否需要按工作区外路径确认。 */
  outsideWorkspace: boolean;
}

/**
 * 根据 realpath 判断只读目标是否仍需要工作区外确认。
 * @param target - 词法解析后的读取目标
 * @param realFilePath - realpath 后的目标路径
 * @param realWorkspaceRoot - realpath 后的工作区根目录
 * @returns 是否需要工作区外确认
 */
function isRuntimeRealReadTargetOutsideWorkspace(target: RuntimeReadTarget, realFilePath: string, realWorkspaceRoot: string | undefined): boolean {
  let { outsideWorkspace } = target;

  if (realWorkspaceRoot) {
    outsideWorkspace = !isRuntimePathInsideWorkspace(realFilePath, realWorkspaceRoot);
  }

  if (isRuntimeTrustedHomeReadPath(realFilePath)) {
    outsideWorkspace = false;
  }

  return outsideWorkspace;
}

/**
 * 解析只读目标的真实路径，并基于 realpath 复核工作区与用户级可信目录边界。
 * @param target - 词法解析后的读取目标
 * @param workspaceRoot - 工作区根目录
 * @returns 真实读取目标
 */
async function resolveRuntimeRealReadTarget(target: RuntimeReadTarget, workspaceRoot: string | undefined): Promise<RuntimeRealReadTarget> {
  const realFilePath = await fs.realpath(target.filePath);
  const realWorkspaceRoot = workspaceRoot ? await fs.realpath(workspaceRoot) : undefined;
  const realPathOutsideWorkspace = realWorkspaceRoot ? !isRuntimePathInsideWorkspace(realFilePath, realWorkspaceRoot) : false;
  const outsideWorkspace = isRuntimeRealReadTargetOutsideWorkspace(target, realFilePath, realWorkspaceRoot);

  return {
    filePath: !target.outsideWorkspace && realPathOutsideWorkspace ? realFilePath : target.filePath,
    outsideWorkspace
  };
}

/**
 * 执行 read_file 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeReadFileTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const normalizedInput = normalizeRuntimeReadFileInput(input.input);
  if ('status' in normalizedInput) return normalizedInput;

  const bridgeResult = await deps.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    kind: 'file-content-snapshot',
    payload: { path: normalizedInput.filePath, workspaceRoot: input.runtime.workspaceRoot }
  });
  if (bridgeResult.status === 'success') {
    if (!isRuntimeFileContentSnapshot(bridgeResult.data)) {
      return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '文件内容快照格式无效');
    }
    return createMainToolSuccessResult(
      READ_FILE_TOOL_NAME,
      createRuntimeReadFileData(bridgeResult.data.path, bridgeResult.data.content, normalizedInput.offset, normalizedInput.limit)
    );
  }
  if (bridgeResult.error.code !== 'EDITOR_UNAVAILABLE') return createBridgeFailureResult(input.toolName, bridgeResult.error);

  const target = resolveRuntimeReadTarget(normalizedInput.filePath, input.runtime.workspaceRoot, input.toolName);
  if ('status' in target) return target;

  try {
    const realTarget = await resolveRuntimeRealReadTarget(target, input.runtime.workspaceRoot);
    if (realTarget.outsideWorkspace) {
      const decision = await deps.requestConfirmation({
        runtimeId: input.runtime.runtimeId,
        toolCallId: input.toolCallId,
        request: {
          toolCallId: input.toolCallId,
          toolName: READ_FILE_TOOL_NAME,
          title: 'AI 想要读取本地文件',
          description: `AI 请求读取本地文件：${realTarget.filePath}`,
          riskLevel: 'read',
          beforeText: realTarget.filePath
        }
      });
      if (!decision.approved) return createMainToolCancelledResult(input.toolName);
    }

    const data = await readWorkspaceFile({
      filePath: realTarget.filePath,
      ...(input.runtime.workspaceRoot ? { workspaceRoot: input.runtime.workspaceRoot } : {}),
      offset: normalizedInput.offset,
      ...(normalizedInput.limit !== undefined ? { limit: normalizedInput.limit } : {})
    });
    return createMainToolSuccessResult(READ_FILE_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取文件失败';
    return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', message);
  }
}

/**
 * 执行 read_directory 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeReadDirectoryTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const normalizedInput = normalizeRuntimeReadDirectoryInput(input.input);
  if ('status' in normalizedInput) return normalizedInput;

  const target = resolveRuntimeReadTarget(normalizedInput.directoryPath, input.runtime.workspaceRoot, input.toolName);
  if ('status' in target) return target;

  try {
    const realTarget = await resolveRuntimeRealReadTarget(target, input.runtime.workspaceRoot);
    if (realTarget.outsideWorkspace) {
      const decision = await deps.requestConfirmation({
        runtimeId: input.runtime.runtimeId,
        toolCallId: input.toolCallId,
        request: {
          toolCallId: input.toolCallId,
          toolName: READ_DIRECTORY_TOOL_NAME,
          title: 'AI 想要读取本地目录',
          description: `AI 请求读取本地目录：${realTarget.filePath}`,
          riskLevel: 'read',
          beforeText: realTarget.filePath
        }
      });
      if (!decision.approved) return createMainToolCancelledResult(input.toolName);
    }

    const data = await readWorkspaceDirectory({
      directoryPath: realTarget.filePath,
      ...(input.runtime.workspaceRoot ? { workspaceRoot: input.runtime.workspaceRoot } : {})
    });
    return createMainToolSuccessResult(READ_DIRECTORY_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取目录失败';
    return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', message);
  }
}

/** 文件搜索真实目标。 */
interface RuntimeRealSearchTarget {
  /** realpath 后的搜索目标路径。 */
  filePath: string;
  /** 真实路径是否位于工作区外。 */
  outsideWorkspace: boolean;
}

/**
 * 解析文件搜索目标的真实路径，并基于 realpath 复核工作区边界。
 * @param target - 词法解析后的读取目标
 * @param workspaceRoot - 工作区根目录
 * @returns 真实搜索目标
 */
async function resolveRuntimeRealSearchTarget(target: RuntimeReadTarget, workspaceRoot: string | undefined): Promise<RuntimeRealSearchTarget> {
  const realFilePath = await fs.realpath(target.filePath);
  const realWorkspaceRoot = workspaceRoot ? await fs.realpath(workspaceRoot) : undefined;
  const realPathOutsideWorkspace = realWorkspaceRoot ? !isRuntimePathInsideWorkspace(realFilePath, realWorkspaceRoot) : false;
  const outsideWorkspace = isRuntimeRealReadTargetOutsideWorkspace(target, realFilePath, realWorkspaceRoot);

  return {
    filePath: !target.outsideWorkspace && realPathOutsideWorkspace ? realFilePath : target.filePath,
    outsideWorkspace
  };
}

/**
 * 请求确认读取工作区外搜索目标。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @param targetPath - 搜索目标路径
 * @returns 是否允许继续
 */
async function confirmRuntimeExternalSearchTarget(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies, targetPath: string): Promise<boolean> {
  const decision = await deps.requestConfirmation({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    request: {
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      title: 'AI 想要搜索本地文件',
      description: `AI 请求搜索本地路径：${targetPath}`,
      riskLevel: 'read',
      beforeText: targetPath
    }
  });

  return decision.approved;
}

/**
 * 将搜索错误转为工具失败结果。
 * @param toolName - 工具名称
 * @param error - 搜索错误
 * @returns 工具失败结果
 */
function createRuntimeSearchFailureResult(toolName: string, error: unknown): AIToolExecutionResult {
  if (error instanceof RuntimeSubprocessError) {
    if (error.code === 'USER_CANCELLED') return createMainToolCancelledResult(toolName);
    return createMainToolFailureResult(toolName, error.code, error.message);
  }

  const message = error instanceof Error ? error.message : '搜索文件失败';
  return createMainToolFailureResult(toolName, 'EXECUTION_FAILED', message);
}

/**
 * 执行 glob 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeGlobTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const normalizedInput = normalizeRuntimeGlobInput(input.input);
  if ('status' in normalizedInput) return normalizedInput;

  const target = resolveRuntimeReadTarget(normalizedInput.searchPath, input.runtime.workspaceRoot, input.toolName);
  if ('status' in target) return target;

  try {
    const searchTarget = await resolveRuntimeRealSearchTarget(target, input.runtime.workspaceRoot);
    if (searchTarget.outsideWorkspace && !(await confirmRuntimeExternalSearchTarget(input, deps, searchTarget.filePath))) {
      return createMainToolCancelledResult(input.toolName);
    }

    const stats = await fs.stat(searchTarget.filePath);
    if (!stats.isDirectory()) return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', 'glob 搜索目标必须是目录');

    const data = await runGlobSearch({
      rootPath: searchTarget.filePath,
      pattern: normalizedInput.pattern,
      limit: DEFAULT_FILE_SEARCH_LIMIT,
      excludedDirs: DEFAULT_FILE_SEARCH_EXCLUDED_DIRS,
      signal: input.runtime.abortController.signal
    });
    return createMainToolSuccessResult(GLOB_TOOL_NAME, { path: searchTarget.filePath, ...data });
  } catch (error) {
    return createRuntimeSearchFailureResult(input.toolName, error);
  }
}

/**
 * 执行 grep 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeGrepTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const normalizedInput = normalizeRuntimeGrepInput(input.input);
  if ('status' in normalizedInput) return normalizedInput;

  const target = resolveRuntimeReadTarget(normalizedInput.searchPath, input.runtime.workspaceRoot, input.toolName);
  if ('status' in target) return target;

  try {
    const searchTarget = await resolveRuntimeRealSearchTarget(target, input.runtime.workspaceRoot);
    if (searchTarget.outsideWorkspace && !(await confirmRuntimeExternalSearchTarget(input, deps, searchTarget.filePath))) {
      return createMainToolCancelledResult(input.toolName);
    }

    const stats = await fs.stat(searchTarget.filePath);
    if (!stats.isFile() && !stats.isDirectory()) return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', 'grep 搜索目标必须是文件或目录');

    const data = await runGrepSearch({
      rootPath: searchTarget.filePath,
      pattern: normalizedInput.pattern,
      ...(normalizedInput.include ? { include: normalizedInput.include } : {}),
      limit: DEFAULT_FILE_SEARCH_LIMIT,
      batchSize: DEFAULT_GREP_BATCH_SIZE,
      excludedDirs: DEFAULT_FILE_SEARCH_EXCLUDED_DIRS,
      timeoutMs: DEFAULT_GREP_TIMEOUT_MS,
      stdoutLimitBytes: DEFAULT_GREP_STDOUT_LIMIT_BYTES,
      stderrLimitBytes: DEFAULT_GREP_STDERR_LIMIT_BYTES,
      lineTextLimit: DEFAULT_GREP_LINE_TEXT_LIMIT,
      signal: input.runtime.abortController.signal
    });
    return createMainToolSuccessResult(GREP_TOOL_NAME, { path: searchTarget.filePath, ...data });
  } catch (error) {
    return createRuntimeSearchFailureResult(input.toolName, error);
  }
}

/**
 * 执行 create_document 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeCreateDocumentTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const normalizedInput = normalizeRuntimeCreateDocumentInput(input.input);
  if ('status' in normalizedInput) return normalizedInput;

  const bridgeResult = await deps.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    kind: 'open-draft',
    payload: { originalPath: `${normalizedInput.title}.${normalizedInput.ext}`, content: normalizedInput.content }
  });
  if (bridgeResult.status === 'failure') return createBridgeFailureResult(input.toolName, bridgeResult.error);
  if (!isRuntimeOpenDraftResult(bridgeResult.data)) return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '草稿创建结果格式无效');

  return createMainToolSuccessResult(CREATE_DOCUMENT_TOOL_NAME, {
    id: bridgeResult.data.file.id,
    title: bridgeResult.data.file.name,
    path: bridgeResult.data.unsavedPath,
    content: bridgeResult.data.file.content
  });
}

/**
 * 执行 write_file 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeWriteFileTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const normalizedInput = normalizeRuntimeWriteFileInput(input.input);
  if ('status' in normalizedInput) return normalizedInput;

  const target = resolveRuntimeWriteTarget(normalizedInput.filePath, input.runtime.workspaceRoot);
  if ('status' in target) return target;

  if (target.type === 'draft') {
    const decision = await deps.requestConfirmation({
      runtimeId: input.runtime.runtimeId,
      toolCallId: input.toolCallId,
      request: {
        toolCallId: input.toolCallId,
        toolName: WRITE_FILE_TOOL_NAME,
        title: 'AI 想要创建未保存草稿',
        description: `AI 请求创建未保存草稿：${target.originalPath}`,
        riskLevel: 'write',
        afterText: normalizedInput.content
      }
    });
    if (!decision.approved) return createMainToolCancelledResult(input.toolName);

    const bridgeResult = await deps.requestBridge({
      runtimeId: input.runtime.runtimeId,
      toolCallId: input.toolCallId,
      kind: 'open-draft',
      payload: { originalPath: target.originalPath, content: normalizedInput.content }
    });
    if (bridgeResult.status === 'failure') return createBridgeFailureResult(input.toolName, bridgeResult.error);
    if (!isRuntimeOpenDraftResult(bridgeResult.data)) return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '草稿创建结果格式无效');
    return createMainToolSuccessResult(WRITE_FILE_TOOL_NAME, { path: bridgeResult.data.unsavedPath, content: normalizedInput.content, created: true });
  }

  if (target.type === 'unsaved') {
    const snapshotResult = await deps.requestBridge({
      runtimeId: input.runtime.runtimeId,
      toolCallId: input.toolCallId,
      kind: 'file-content-snapshot',
      payload: { path: target.filePath }
    });
    if (snapshotResult.status === 'failure') return createBridgeFailureResult(input.toolName, snapshotResult.error);
    if (!isRuntimeFileContentSnapshot(snapshotResult.data)) return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '文件内容快照格式无效');

    const decision = await deps.requestConfirmation({
      runtimeId: input.runtime.runtimeId,
      toolCallId: input.toolCallId,
      request: {
        toolCallId: input.toolCallId,
        toolName: WRITE_FILE_TOOL_NAME,
        title: 'AI 想要修改未保存草稿',
        description: `AI 请求修改未保存草稿：${target.filePath}`,
        riskLevel: 'write',
        beforeText: snapshotResult.data.content,
        afterText: normalizedInput.content
      }
    });
    if (!decision.approved) return createMainToolCancelledResult(input.toolName);

    const bridgeResult = await deps.requestBridge({
      runtimeId: input.runtime.runtimeId,
      toolCallId: input.toolCallId,
      kind: 'write-file-content',
      payload: { path: target.filePath, content: normalizedInput.content }
    });
    if (bridgeResult.status === 'failure') return createBridgeFailureResult(input.toolName, bridgeResult.error);
    return createMainToolSuccessResult(WRITE_FILE_TOOL_NAME, { path: target.filePath, content: normalizedInput.content, created: false });
  }

  let existingFile: { exists: boolean; content: string };
  try {
    existingFile = await readExistingRuntimeFile(target.filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取文件失败';
    return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', message);
  }

  const decision = await deps.requestConfirmation({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    request: {
      toolCallId: input.toolCallId,
      toolName: WRITE_FILE_TOOL_NAME,
      title: existingFile.exists ? 'AI 想要覆盖本地文件' : 'AI 想要创建本地文件',
      description: target.outsideWorkspace
        ? `${existingFile.exists ? 'AI 请求覆盖本地文件' : 'AI 请求创建本地文件'}：${target.filePath}\n该文件不在当前工作区内，请确认是否允许。`
        : `${existingFile.exists ? 'AI 请求覆盖本地文件' : 'AI 请求创建本地文件'}：${target.filePath}`,
      riskLevel: target.outsideWorkspace || existingFile.exists ? 'dangerous' : 'write',
      ...(existingFile.exists ? { beforeText: existingFile.content, afterText: normalizedInput.content } : { afterText: normalizedInput.content })
    }
  });
  if (!decision.approved) return createMainToolCancelledResult(input.toolName);

  const bridgeResult = await deps.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    kind: 'write-file-content',
    payload: { path: target.filePath, content: normalizedInput.content, workspaceRoot: input.runtime.workspaceRoot }
  });
  if (bridgeResult.status === 'success') {
    return createMainToolSuccessResult(WRITE_FILE_TOOL_NAME, { path: target.filePath, content: normalizedInput.content, created: !existingFile.exists });
  }
  if (bridgeResult.error.code !== 'EDITOR_UNAVAILABLE') return createBridgeFailureResult(input.toolName, bridgeResult.error);

  try {
    await fs.writeFile(target.filePath, normalizedInput.content, 'utf-8');
    return createMainToolSuccessResult(WRITE_FILE_TOOL_NAME, { path: target.filePath, content: normalizedInput.content, created: !existingFile.exists });
  } catch (error) {
    const message = error instanceof Error ? error.message : '写入文件失败';
    return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', message);
  }
}

/**
 * 执行 edit_file 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeEditFileTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const normalizedInput = normalizeRuntimeEditFileInput(input.input);
  if ('status' in normalizedInput) return normalizedInput;

  const target = resolveRuntimeWriteTarget(normalizedInput.filePath, input.runtime.workspaceRoot);
  if ('status' in target) return target;
  if (target.type === 'draft') {
    return createMainToolFailureResult(
      input.toolName,
      'EXECUTION_FAILED',
      `无法编辑相对路径文件「${target.originalPath}」：当前无工作区，且编辑操作需要已有文件内容才能执行搜索替换。请使用绝对路径或先打开工作区。`
    );
  }

  let currentPath = target.filePath;
  let currentContent = '';
  const snapshotResult = await deps.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    kind: 'file-content-snapshot',
    payload: { path: target.filePath, workspaceRoot: input.runtime.workspaceRoot }
  });
  if (snapshotResult.status === 'success') {
    if (!isRuntimeFileContentSnapshot(snapshotResult.data)) return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '文件内容快照格式无效');
    currentPath = snapshotResult.data.path;
    currentContent = snapshotResult.data.content;
  } else if (snapshotResult.error.code === 'EDITOR_UNAVAILABLE') {
    try {
      const currentFile = await readExistingRuntimeFile(target.filePath);
      if (!currentFile.exists) return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', '文件或目录不存在或无法访问');
      currentContent = currentFile.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取文件失败';
      return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', message);
    }
  } else {
    return createBridgeFailureResult(input.toolName, snapshotResult.error);
  }

  const matchCount = countRuntimeOccurrences(currentContent, normalizedInput.oldString);
  if (matchCount === 0) return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', '未找到匹配的原始文本');
  if (matchCount > 1 && !normalizedInput.replaceAll) {
    return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', '匹配到多处原始文本，请设置 replaceAll=true 或提供更精确的 oldString');
  }

  const nextFile = applyRuntimeStringReplacement(currentContent, normalizedInput.oldString, normalizedInput.newString, normalizedInput.replaceAll);
  const decision = await deps.requestConfirmation({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    request: {
      toolCallId: input.toolCallId,
      toolName: EDIT_FILE_TOOL_NAME,
      title: target.type === 'unsaved' ? 'AI 想要修改未保存草稿' : 'AI 想要修改本地文件',
      description:
        target.type === 'unsaved'
          ? `AI 请求修改未保存草稿：${target.filePath}\n将 ${nextFile.replacedCount} 处匹配内容替换为新文本。`
          : `AI 请求修改本地文件：${currentPath}\n将 ${nextFile.replacedCount} 处匹配内容替换为新文本。`,
      riskLevel: target.type === 'file' && target.outsideWorkspace ? 'dangerous' : 'write',
      beforeText: normalizedInput.oldString,
      afterText: normalizedInput.newString
    }
  });
  if (!decision.approved) return createMainToolCancelledResult(input.toolName);

  const bridgeResult = await deps.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    kind: 'write-file-content',
    payload: { path: target.filePath, content: nextFile.content, workspaceRoot: input.runtime.workspaceRoot }
  });
  if (bridgeResult.status === 'success') {
    return createMainToolSuccessResult(EDIT_FILE_TOOL_NAME, { path: currentPath, content: nextFile.content, replacedCount: nextFile.replacedCount });
  }
  if (bridgeResult.error.code !== 'EDITOR_UNAVAILABLE') return createBridgeFailureResult(input.toolName, bridgeResult.error);

  try {
    await fs.writeFile(target.filePath, nextFile.content, 'utf-8');
    return createMainToolSuccessResult(EDIT_FILE_TOOL_NAME, { path: currentPath, content: nextFile.content, replacedCount: nextFile.replacedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : '修改文件失败';
    return createMainToolFailureResult(input.toolName, 'EXECUTION_FAILED', message);
  }
}

/**
 * 执行文件工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
export async function executeFileTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  if (input.toolName === READ_FILE_TOOL_NAME) return executeReadFileTool(input, deps);
  if (input.toolName === READ_DIRECTORY_TOOL_NAME) return executeReadDirectoryTool(input, deps);
  if (input.toolName === GLOB_TOOL_NAME) return executeGlobTool(input, deps);
  if (input.toolName === GREP_TOOL_NAME) return executeGrepTool(input, deps);
  if (input.toolName === CREATE_DOCUMENT_TOOL_NAME) return executeCreateDocumentTool(input, deps);
  if (input.toolName === WRITE_FILE_TOOL_NAME) return executeWriteFileTool(input, deps);
  if (input.toolName === EDIT_FILE_TOOL_NAME) return executeEditFileTool(input, deps);
  return createMainToolFailureResult(input.toolName, 'TOOL_NOT_FOUND', `Unsupported file tool: ${input.toolName}`);
}
