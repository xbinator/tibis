/**
 * @file posix.ts
 * @description POSIX 风格路径工具集合，统一使用 `/` 分隔符，避免业务层感知平台差异。
 *
 * 仿 Node `path.posix` API：所有函数均将输入的 `\` 归一为 `/`，确保跨平台行为可预期。
 * 后续若需扩展（`extname` 等），直接在 `posix` 对象上追加方法即可。
 */

/**
 * 将路径分隔符统一为 `/`。
 * @param filePath - 原始路径
 * @returns 统一分隔符后的路径
 */
function slashify(filePath: string): string {
  return filePath.replace(/\\/gu, '/');
}

/**
 * 获取文件所在目录，行为对齐 Node `path.posix.dirname`：
 * - 输入分隔符兼容 `\` 与 `/`；
 * - 输出统一使用 `/` 分隔符。
 * @param filePath - 文件路径
 * @returns 文件所在目录
 */
function dirname(filePath: string): string {
  const normalized = slashify(filePath);
  const index = normalized.lastIndexOf('/');
  if (index <= 0) {
    return index === 0 ? '/' : '.';
  }
  return normalized.slice(0, index);
}

/**
 * 获取路径最后一个非空片段，行为对齐 Node `path.posix.basename`。
 * @param filePath - 文件路径
 * @returns 最后一个非空路径片段
 */
function basename(filePath: string): string {
  const normalized = slashify(filePath).replace(/\/+$/gu, '');
  const index = normalized.lastIndexOf('/');
  return normalized.slice(index + 1);
}

/**
 * 拼接 POSIX、Windows 盘符或 UNC 路径片段，并统一使用 `/` 分隔。
 * 保留原始根前缀（`/`、`C:`、`//server/share`）。
 * @param segments - 路径片段
 * @returns 拼接后的路径
 */
function join(...segments: string[]): string {
  const normalizedSegments = segments.map((segment: string): string => slashify(segment));
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
 * - `//server/share/...` 视为 UNC；
 * - `C:/...` 视为 Windows 盘符；
 * - `/...` 视为 POSIX 绝对路径；
 * - 其他视为相对路径。
 * @param filePath - 原始路径
 * @returns 路径前缀与片段
 */
function parseParts(filePath: string): { prefix: string; segments: string[] } {
  const normalized = slashify(filePath);

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
 * POSIX 风格路径工具集合。
 */
export const posix = {
  basename,
  dirname,
  join,
  /** 内部使用：解析路径前缀（UNC / 盘符 / 绝对根）与片段。供同级模块复用。 */
  parseParts,
  /** 将 `\` 归一为 `/`，等价于 Node `path.posix` 内部的归一化处理。 */
  slashify
};
