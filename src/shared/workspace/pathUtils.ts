/**
 * @file pathUtils.ts
 * @description 渲染进程共享路径解析与工作区边界校验。
 */

/**
 * 解析路径前缀与片段。
 * @param filePath - 原始路径
 * @returns 路径前缀与片段
 */
function parsePathParts(filePath: string): { prefix: string; segments: string[] } {
  const normalized = filePath.replace(/\\/g, '/');

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return {
      prefix: normalized.slice(0, 2),
      segments: normalized.slice(3).split('/').filter(Boolean)
    };
  }

  if (normalized.startsWith('/')) {
    return {
      prefix: '/',
      segments: normalized.slice(1).split('/').filter(Boolean)
    };
  }

  return {
    prefix: '',
    segments: normalized.split('/').filter(Boolean)
  };
}

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

  return joined ? `${prefix}${separator}${joined}` : `${prefix}${separator}`;
}

/**
 * 判断输入路径是否为绝对路径。
 * @param filePath - 文件路径
 * @returns 是否为绝对路径
 */
export function isAbsoluteFilePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\');
}

/**
 * 将工作区相对路径解析为绝对路径。
 * @param filePath - 用户输入路径
 * @param workspaceRoot - 工作区根目录
 * @returns 解析后的绝对路径，超出边界时返回 null
 */
export function resolvePathAgainstWorkspace(filePath: string, workspaceRoot: string): string | null {
  const root = parsePathParts(workspaceRoot);
  if (!root.prefix) {
    return null;
  }

  const separator: '/' | '\\' = workspaceRoot.includes('\\') ? '\\' : '/';
  const resolvedSegments = [...root.segments];
  const relativeSegments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);

  for (const segment of relativeSegments) {
    if (segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (resolvedSegments.length <= root.segments.length) {
        return null;
      }

      resolvedSegments.pop();
      continue;
    }

    resolvedSegments.push(segment);
  }

  return buildPath(root.prefix, resolvedSegments, separator);
}

/**
 * 判断目标路径是否位于工作区内。
 * @param targetPath - 目标路径
 * @param workspaceRoot - 工作区根目录
 * @returns 是否位于工作区内
 */
export function isPathInsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const target = parsePathParts(targetPath);
  const root = parsePathParts(workspaceRoot);

  if (target.prefix.toLowerCase() !== root.prefix.toLowerCase()) {
    return false;
  }

  if (target.segments.length < root.segments.length) {
    return false;
  }

  return root.segments.every((segment, index) => target.segments[index] === segment);
}
