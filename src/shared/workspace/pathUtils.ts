/**
 * @file pathUtils.ts
 * @description 渲染进程共享路径解析与工作区边界校验。
 */

/** Windows 文件名非法字符。 */
const WINDOWS_INVALID_PATH_CHARS = /[<>:"|?*]/u;
/** Windows 保留设备名，带扩展名也不可作为文件名。 */
const WINDOWS_RESERVED_PATH_SEGMENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
/** 可安全作为跨平台资源目录名的标识格式。 */
export const PORTABLE_RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;

/**
 * 将路径分隔符统一为 `/`。
 * @param filePath - 原始路径
 * @returns 统一分隔符后的路径
 */
export function normalizeFilePathSeparators(filePath: string): string {
  return filePath.replace(/\\/gu, '/');
}

/**
 * 判断路径片段是否为 Windows 保留设备名。
 * @param segment - 单一路径片段
 * @returns 是否为 Windows 保留名称
 */
export function isWindowsReservedFileName(segment: string): boolean {
  return WINDOWS_RESERVED_PATH_SEGMENT.test(segment);
}

/**
 * 判断单一路径片段能否安全用于跨平台文件路径。
 * @param segment - 单一路径片段
 * @returns 是否为安全片段
 */
export function isSafeFilePathSegment(segment: string): boolean {
  const hasControlCharacter = Array.from(segment).some((character: string): boolean => character.charCodeAt(0) <= 31);

  return Boolean(
    segment &&
      segment !== '.' &&
      segment !== '..' &&
      !segment.includes('/') &&
      !segment.includes('\\') &&
      !WINDOWS_INVALID_PATH_CHARS.test(segment) &&
      !hasControlCharacter &&
      !isWindowsReservedFileName(segment) &&
      !segment.endsWith(' ') &&
      !segment.endsWith('.')
  );
}

/**
 * 校验并规范化跨平台安全相对文件路径。
 * @param filePath - 待校验相对路径
 * @param description - 错误信息中的路径描述
 * @returns 使用 `/` 分隔的安全相对路径
 */
export function normalizeSafeRelativeFilePath(filePath: string, description = '路径'): string {
  const normalized = normalizeFilePathSeparators(filePath);
  const segments = normalized.split('/');

  if (!normalized || normalized.startsWith('/') || segments.some((segment: string): boolean => !isSafeFilePathSegment(segment))) {
    throw new Error(`${description}不安全：${filePath}`);
  }

  return normalized;
}

/**
 * 拼接 POSIX、Windows 盘符或 UNC 文件路径，并统一使用 `/` 分隔。
 * @param segments - 路径片段
 * @returns 保留原始根前缀的拼接路径
 */
export function joinFilePath(...segments: string[]): string {
  const normalizedSegments = segments.map((segment: string): string => normalizeFilePathSeparators(segment));
  const firstSegment = normalizedSegments[0] ?? '';
  let prefix = '';
  if (firstSegment.startsWith('//')) {
    prefix = '//';
  } else if (firstSegment.startsWith('/')) {
    prefix = '/';
  }
  const joined = normalizedSegments
    .map((segment: string): string => segment.replace(/\/{2,}/gu, '/').replace(/^\/+|\/+$/gu, ''))
    .filter(Boolean)
    .join('/');

  return `${prefix}${joined}` || prefix;
}

/**
 * 解析路径前缀与片段。
 * @param filePath - 原始路径
 * @returns 路径前缀与片段
 */
function parsePathParts(filePath: string): { prefix: string; segments: string[] } {
  const normalized = normalizeFilePathSeparators(filePath);

  if (normalized.startsWith('//')) {
    const [server = '', share = '', ...segments] = normalized.slice(2).split('/').filter(Boolean);
    return {
      prefix: `//${server}/${share}`,
      segments
    };
  }

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
