/**
 * @file file-parts.mts
 * @description ChatRuntime user file part snapshot materialization.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { RuntimeBridgeRequestInput } from '../controllers/bridge.mjs';
import type { ChatMessageFilePart, ChatMessageFilePartInput, ChatMessagePart } from 'types/chat';
import type { ChatRuntimeBridgeResult } from 'types/chat-runtime';
import { isRuntimeFileContentSnapshot } from '../tools/guards.mjs';
import { isRuntimeUnsavedPath, resolveRuntimeReadTarget } from '../tools/paths.mjs';

/** 单个文件快照最大字符数。 */
const MAX_FILE_SNAPSHOT_CHARS = 120_000;

/** 文件快照运行时上下文。 */
interface FilePartRuntimeContext {
  /** Runtime ID。 */
  runtimeId: string;
  /** 工作区根路径。 */
  workspaceRoot?: string;
}

/** Renderer bridge 请求函数。 */
type FilePartBridgeRequester = (input: RuntimeBridgeRequestInput) => Promise<ChatRuntimeBridgeResult>;

/** 文件 part materialize 输入。 */
export interface MaterializeRuntimeFilePartsInput {
  /** 输入片段。 */
  parts: Array<ChatMessagePart | ChatMessageFilePartInput>;
  /** runtime 上下文。 */
  runtime: FilePartRuntimeContext;
  /** 当前时间。 */
  now: () => string;
  /** renderer bridge 请求。 */
  requestBridge: FilePartBridgeRequester;
}

/** 文件 part materializer 依赖函数。 */
export type RuntimeFilePartMaterializer = (input: MaterializeRuntimeFilePartsInput) => Promise<ChatMessagePart[]>;

/**
 * 读取 URL 中的行号范围。
 * @param urlText - 文件 URL
 * @returns 行号范围
 */
function readLineRangeFromUrl(urlText: string): { startLine?: number; endLine?: number } {
  try {
    const url = new URL(urlText);
    const start = Number(url.searchParams.get('start'));
    const end = Number(url.searchParams.get('end'));
    return {
      ...(Number.isInteger(start) && start > 0 ? { startLine: start } : {}),
      ...(Number.isInteger(end) && end > 0 ? { endLine: end } : {})
    };
  } catch {
    return {};
  }
}

/**
 * 统计文件总行数，空文件按一行处理。
 * @param content - 文件内容
 * @returns 总行数
 */
function countTotalLines(content: string): number {
  if (!content) return 1;
  return content.split('\n').length;
}

/**
 * 截取指定行号范围。
 * @param content - 完整内容
 * @param startLine - 起始行
 * @param endLine - 结束行
 * @returns 截取内容与归一化行号
 */
function sliceContentByLines(
  content: string,
  startLine: number | undefined,
  endLine: number | undefined
): { content: string; startLine: number; endLine: number; totalLines: number } {
  const lines = content ? content.split('\n') : [''];
  const totalLines = countTotalLines(content);
  const normalizedStart = Math.min(Math.max(startLine ?? 1, 1), totalLines);
  const normalizedEnd = Math.min(Math.max(endLine ?? totalLines, normalizedStart), totalLines);

  return {
    content: lines.slice(normalizedStart - 1, normalizedEnd).join('\n'),
    startLine: normalizedStart,
    endLine: normalizedEnd,
    totalLines
  };
}

/**
 * 截断过大的快照内容。
 * @param content - 快照内容
 * @returns 截断结果
 */
function truncateSnapshotContent(content: string): { content: string; truncated?: boolean } {
  if (content.length <= MAX_FILE_SNAPSHOT_CHARS) return { content };
  return { content: content.slice(0, MAX_FILE_SNAPSHOT_CHARS), truncated: true };
}

/**
 * 计算内容哈希。
 * @param content - 快照内容
 * @returns sha256 hash
 */
function hashSnapshotContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 通过 renderer bridge 读取已打开或未保存文件内容。
 * @param part - 文件输入片段
 * @param input - materialize 输入
 * @returns 文件内容，无法读取时返回 null
 */
async function readFileContentFromBridge(part: ChatMessageFilePartInput, input: MaterializeRuntimeFilePartsInput): Promise<{ path: string; content: string } | null> {
  const result = await input.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: part.id,
    kind: 'file-content-snapshot',
    payload: { path: part.path, workspaceRoot: input.runtime.workspaceRoot }
  });
  if (result.status === 'failure') return null;
  if (!isRuntimeFileContentSnapshot(result.data)) throw new Error('文件内容快照格式无效');
  return result.data;
}

/**
 * 从磁盘读取文件内容。
 * @param part - 文件输入片段
 * @param input - materialize 输入
 * @returns 文件内容
 */
async function readFileContentFromDisk(part: ChatMessageFilePartInput, input: MaterializeRuntimeFilePartsInput): Promise<{ path: string; content: string }> {
  const target = resolveRuntimeReadTarget(part.path, input.runtime.workspaceRoot, 'file_part_snapshot');
  if ('status' in target) throw new Error(target.error?.message ?? '文件路径无效');
  const stats = await fs.stat(target.filePath);
  if (!stats.isFile()) throw new Error('文件引用目标不是文件');
  return { path: target.filePath, content: await fs.readFile(target.filePath, 'utf8') };
}

/**
 * 固化单个文件输入片段。
 * @param part - 文件输入片段
 * @param input - materialize 输入
 * @returns 持久化文件片段
 */
async function materializeFilePart(part: ChatMessageFilePartInput, input: MaterializeRuntimeFilePartsInput): Promise<ChatMessageFilePart> {
  const bridgeContent = await readFileContentFromBridge(part, input);
  const fileContent = bridgeContent ?? (isRuntimeUnsavedPath(part.path) ? null : await readFileContentFromDisk(part, input));
  if (!fileContent) throw new Error(`无法读取文件引用：${part.path}`);

  const range = readLineRangeFromUrl(part.url);
  const sliced = sliceContentByLines(fileContent.content, range.startLine, range.endLine);
  const truncated = truncateSnapshotContent(sliced.content);
  return {
    ...part,
    snapshot: {
      content: truncated.content,
      startLine: sliced.startLine,
      endLine: sliced.endLine,
      totalLines: sliced.totalLines,
      contentHash: hashSnapshotContent(truncated.content),
      capturedAt: input.now(),
      ...(truncated.truncated ? { truncated: true } : {})
    }
  };
}

/**
 * 固化 runtime user input parts 中的文件片段。
 * @param input - materialize 输入
 * @returns 可持久化消息片段
 */
export async function materializeRuntimeFileParts(input: MaterializeRuntimeFilePartsInput): Promise<ChatMessagePart[]> {
  const parts: ChatMessagePart[] = [];
  for (const part of input.parts) {
    if (part.type === 'file' && !('snapshot' in part)) {
      // eslint-disable-next-line no-await-in-loop
      parts.push(await materializeFilePart(part, input));
      continue;
    }
    parts.push(part as ChatMessagePart);
  }
  return parts;
}
