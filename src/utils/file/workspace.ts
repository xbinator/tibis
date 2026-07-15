/**
 * @file workspace.ts
 * @description 工作区根边界相关的路径解析与判断：识别绝对路径、解析工作区内相对路径、判断目标是否在根目录范围内。
 *
 * 与 `posix.ts` 协作：`workspace` 仅在内部用 `posix.parseParts` 解析路径前缀/片段，对外
 * 暴露工作区边界相关的语义化函数。
 */

import { posix } from './posix';

/** Windows 盘符或 UNC 绝对路径前缀。 */
const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/u;
/** Windows 网络共享 UNC 路径前缀。 */
const UNC_PATH = /^\\\\/u;

/**
 * 重新组装路径。
 * @param prefix - 路径前缀
 * @param segments - 路径片段
 * @param separator - 分隔符
 * @returns 组装后的路径
 */
function buildPath(prefix: string, segments: string[], separator: '/' | '\\'): string {
  const joined = segments.join(separator);

  if (!prefix) {
    return joined;
  }

  if (prefix === '/') {
    return joined ? `${separator}${joined}` : separator;
  }

  if (prefix.startsWith('//')) {
    const platformPrefix = separator === '\\' ? prefix.replace(/\//gu, '\\') : prefix;
    return joined ? `${platformPrefix}${separator}${joined}` : platformPrefix;
  }

  return joined ? `${prefix}${separator}${joined}` : `${prefix}${separator}`;
}

/**
 * 判断输入路径是否为绝对路径。
 * @param filePath - 文件路径
 * @returns 是否为绝对路径
 */
function isAbsoluteFilePath(filePath: string): boolean {
  return WINDOWS_ABSOLUTE_PATH.test(filePath) || filePath.startsWith('/') || UNC_PATH.test(filePath);
}

/**
 * 将工作区相对路径解析为绝对路径。
 * @param filePath - 用户输入路径
 * @param root - 工作区根目录
 * @returns 解析后的绝对路径，超出边界时返回 null
 */
function resolveWithin(filePath: string, root: string): string | null {
  const rootParts = posix.parseParts(root);
  if (!rootParts.prefix) {
    return null;
  }

  const separator: '/' | '\\' = root.includes('\\') ? '\\' : '/';
  const resolvedSegments = [...rootParts.segments];
  const relativeSegments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);

  for (const segment of relativeSegments) {
    if (segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (resolvedSegments.length <= rootParts.segments.length) {
        return null;
      }

      resolvedSegments.pop();
      continue;
    }

    resolvedSegments.push(segment);
  }

  return buildPath(rootParts.prefix, resolvedSegments, separator);
}

/**
 * 判断目标路径是否位于 root 工作区内。
 * @param root - 工作区根目录
 * @param target - 目标路径
 * @returns 是否位于工作区内
 */
function contains(root: string, target: string): boolean {
  const targetParts = posix.parseParts(target);
  const rootParts = posix.parseParts(root);

  if (targetParts.prefix.toLowerCase() !== rootParts.prefix.toLowerCase()) {
    return false;
  }

  if (targetParts.segments.length < rootParts.segments.length) {
    return false;
  }

  return rootParts.segments.every((segment, index) => targetParts.segments[index] === segment);
}

/** 工作区根边界工具集合。 */
export const workspace = {
  contains,
  isAbsoluteFilePath,
  resolveWithin
};
