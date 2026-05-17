/**
 * @file unsaved.ts
 * @description 未保存文档虚拟路径的构建、判断与解析工具。
 */

/**
 * 未保存文档路径构建参数。
 */
export interface UnsavedPathParts {
  /** 未保存文档 ID。 */
  id: string;
  /** 展示用文件名，可包含扩展名。 */
  fileName: string;
  /** 可选扩展名；当 fileName 未携带扩展名时使用，默认 `md`。 */
  ext?: string;
}

/**
 * 未保存文档路径解析结果。
 */
export interface ParsedUnsavedPath {
  /** 未保存文档 ID。 */
  fileId: string;
  /** 展示用文件名。 */
  fileName: string;
}

/**
 * 清洗虚拟路径片段，避免出现路径分隔符等非法字符。
 * @param value - 原始片段
 * @param fallback - 兜底值
 * @returns 清洗后的片段
 */
function sanitizeUnsavedPathSegment(value: string, fallback: string): string {
  const sanitizedValue = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ');

  return sanitizedValue || fallback;
}

/**
 * 判断文件名是否已携带扩展名。
 * @param fileName - 展示用文件名
 * @returns 是否已包含扩展名
 */
function hasFileExtension(fileName: string): boolean {
  return /\.[A-Za-z0-9_-]+$/.test(fileName);
}

/**
 * 判断给定路径是否为未保存文档虚拟路径。
 * @param path - 路径字符串
 * @returns 是否为 `unsaved://` 虚拟路径
 */
export function isUnsavedPath(path: string): boolean {
  return path.startsWith('unsaved://');
}

/**
 * 构建未保存文档虚拟路径。
 * @param parts - 路径片段
 * @returns `unsaved://{id}/{fileName}.{ext}` 形式的虚拟路径
 */
export function buildUnsavedPath(parts: UnsavedPathParts): string {
  const fileId = sanitizeUnsavedPathSegment(parts.id, 'unknown');
  const sanitizedFileName = sanitizeUnsavedPathSegment(parts.fileName, 'Untitled');
  const normalizedExtension = sanitizeUnsavedPathSegment(parts.ext ?? 'md', 'md').replace(/^\.+/, '');
  const normalizedFileName = hasFileExtension(sanitizedFileName) ? sanitizedFileName : `${sanitizedFileName}.${normalizedExtension}`;

  return `unsaved://${fileId}/${normalizedFileName}`;
}

/**
 * 解析未保存文档虚拟路径。
 * @param rawPath - 原始路径字符串
 * @returns 草稿 ID 与文件名；非未保存路径时返回 null
 */
export function parseUnsavedPath(rawPath: string): ParsedUnsavedPath | null {
  const matched = rawPath.match(/^unsaved:\/\/([^/]+)\/(.+)$/);
  if (!matched) {
    return null;
  }

  const [, fileId, fileName] = matched;
  return {
    fileId,
    fileName
  };
}
