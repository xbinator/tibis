/**
 * @file posix.ts
 * @description POSIX 风格路径工具集合，统一使用 `/` 分隔符，避免业务层感知平台差异。
 *
 * 仿 Node `path.posix` API：所有函数均将输入的 `\` 归一为 `/`，确保跨平台行为可预期。
 * 后续若需扩展（`basename` / `extname` / `join` / `normalize` 等），
 * 直接在 `posix` 对象上追加方法即可。
 */

/**
 * 获取文件所在目录，行为对齐 Node `path.posix.dirname`：
 * - 输入分隔符兼容 `\` 与 `/`；
 * - 输出统一使用 `/` 分隔符（与项目内 `filePath` 等字段的归一化风格一致）。
 * @param filePath - 文件路径
 * @returns 文件所在目录
 */
function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) {
    return index === 0 ? '/' : '.';
  }
  return normalized.slice(0, index);
}

/**
 * POSIX 风格路径工具集合。
 */
export const posix = {
  dirname
};
