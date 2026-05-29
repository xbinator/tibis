/**
 * @file read.mts
 * @description 工作区文本文件读取服务，仅负责路径解析与文件 I/O，不做安全拦截。
 * 安全策略（扩展名、黑名单、工作区边界）由业务方决定。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** 默认起始行号 */
const DEFAULT_OFFSET = 1;

/** 读取工作区文件请求 */
export interface ReadWorkspaceFileRequest {
  /** 文件路径，支持相对工作区路径或绝对路径 */
  filePath: string;
  /** 工作区根目录，用作相对路径的解析基准 */
  workspaceRoot?: string;
  /** 起始行号，默认 1 */
  offset?: number;
  /** 读取行数，不传时读取到文件末尾 */
  limit?: number;
}

/** 读取工作区文件结果 */
export interface ReadWorkspaceFileResult {
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

/** 读取工作区目录请求 */
export interface ReadWorkspaceDirectoryRequest {
  /** 目录路径，支持相对工作区路径或绝对路径 */
  directoryPath: string;
  /** 工作区根目录，用作相对路径的解析基准 */
  workspaceRoot?: string;
}

/** 读取工作区目录子项 */
export interface ReadWorkspaceDirectoryEntry {
  /** 子项名称 */
  name: string;
  /** 子项真实绝对路径 */
  path: string;
  /** 子项类型 */
  type: 'file' | 'directory';
}

/** 读取工作区目录结果 */
export interface ReadWorkspaceDirectoryResult {
  /** 规范化后的真实目录路径 */
  path: string;
  /** 当前目录下的直接子项 */
  entries: ReadWorkspaceDirectoryEntry[];
}

/**
 * 规范化读取行范围。
 * @param offset - 起始行号
 * @param limit - 读取行数
 * @returns 规范化后的行范围
 */
function normalizeLineRange(offset?: number, limit?: number): { offset: number; limit?: number } {
  const normalizedOffset = offset ?? DEFAULT_OFFSET;

  if (!Number.isInteger(normalizedOffset) || normalizedOffset < 1) {
    throw new Error('offset 必须是大于等于 1 的整数');
  }

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('limit 必须是大于等于 1 的整数');
  }

  return limit === undefined ? { offset: normalizedOffset } : { offset: normalizedOffset, limit };
}

/**
 * 解析目标路径为真实绝对路径。
 * 支持相对路径（基于 workspaceRoot 解析）和绝对路径。
 * 不做任何安全拦截。
 * @param targetPath - 目标路径
 * @param workspaceRoot - 工作区根目录
 * @returns 真实绝对路径
 */
async function resolveTargetPath(targetPath: string, workspaceRoot?: string): Promise<string> {
  const normalizedPath = targetPath.trim();
  const resolvedRoot = workspaceRoot?.trim() ?? '';

  if (!normalizedPath) {
    throw new Error('路径不能为空');
  }

  if (!resolvedRoot && !path.isAbsolute(normalizedPath)) {
    throw new Error('未配置工作区根目录时只能使用绝对路径');
  }

  try {
    const candidatePath = resolvedRoot && !path.isAbsolute(normalizedPath) ? path.join(resolvedRoot, normalizedPath) : normalizedPath;
    return await fs.realpath(candidatePath);
  } catch {
    throw new Error('文件或目录不存在或无法访问');
  }
}

/**
 * 读取文本文件，支持行范围截取。
 * 不做扩展名、黑名单、工作区边界等安全拦截，由业务方决定。
 * @param request - 读取请求
 * @returns 文件读取结果
 */
export async function readWorkspaceFile(request: ReadWorkspaceFileRequest): Promise<ReadWorkspaceFileResult> {
  const lineRange = normalizeLineRange(request.offset, request.limit);
  const realPath = await resolveTargetPath(request.filePath, request.workspaceRoot);

  const stats = await fs.stat(realPath);
  if (!stats.isFile()) {
    throw new Error('目标路径不是文件');
  }

  const content = await fs.readFile(realPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const startIndex = lineRange.offset - 1;
  const endIndex = lineRange.limit === undefined ? undefined : startIndex + lineRange.limit;
  const selectedLines = lines.slice(startIndex, endIndex);
  const nextOffset = lineRange.offset + selectedLines.length;
  const hasMore = nextOffset <= lines.length;

  return {
    path: realPath,
    content: selectedLines.join('\n'),
    totalLines: lines.length,
    readLines: selectedLines.length,
    hasMore,
    nextOffset: hasMore ? nextOffset : null
  };
}

/**
 * 读取目录的直接子项。
 * 不做黑名单、工作区边界等安全拦截，由业务方决定。
 * @param request - 读取请求
 * @returns 目录读取结果
 */
export async function readWorkspaceDirectory(request: ReadWorkspaceDirectoryRequest): Promise<ReadWorkspaceDirectoryResult> {
  const realPath = await resolveTargetPath(request.directoryPath, request.workspaceRoot);

  const stats = await fs.stat(realPath);
  if (!stats.isDirectory()) {
    throw new Error('目标路径不是目录');
  }

  const children = await fs.readdir(realPath, { withFileTypes: true });
  const entries = await Promise.all(
    children
      .filter((child) => child.isFile() || child.isDirectory())
      .map(async (child) => ({
        name: child.name,
        path: await fs.realpath(path.join(realPath, child.name)),
        type: child.isDirectory() ? ('directory' as const) : ('file' as const)
      }))
  );

  entries.sort((left, right) => left.name.localeCompare(right.name));

  return {
    path: realPath,
    entries
  };
}
