/**
 * @file title.ts
 * @description 统一生成文件展示标题与最近文件标签。
 */

import type { StoredFile } from '@/shared/storage/files/types';

/**
 * 文件标题解析参数。
 */
export interface FileTitleParts {
  /** 文件名主体。 */
  name: string;
  /** 文件扩展名。 */
  ext: string;
}

/**
 * 生成统一文件标题，优先展示"文件名.扩展名"。
 * @param parts - 文件名与扩展名
 * @returns 文件展示标题
 */
export function resolveFileTitle(parts: FileTitleParts): string {
  const normalizedName = parts.name.trim();
  const normalizedExt = parts.ext.trim();

  if (normalizedName && normalizedExt) {
    return `${normalizedName}.${normalizedExt}`;
  }

  if (normalizedName) {
    return normalizedName;
  }

  return normalizedExt ? `Untitled.${normalizedExt}` : 'Untitled';
}

/**
 * 生成最近文件展示名称，优先展示真实文件名与扩展名。
 * @param file - 最近文件记录
 * @returns 展示名称
 */
export function getRecentFileLabel(file: Pick<StoredFile, 'name' | 'ext'>): string {
  return resolveFileTitle(file);
}
