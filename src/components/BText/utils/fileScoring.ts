/**
 * @file fileScoring.ts
 * @description 文件提及评分算法
 */
import type { FileMentionOption } from '../types';

/**
 * 计算文件匹配得分
 * @param file - 文件选项
 * @param rawQuery - 原始查询字符串
 * @returns 匹配得分，越高越匹配
 */
export function scoreFile(file: FileMentionOption, rawQuery: string): number {
  const { name } = file;
  const path = file.path ?? '';
  const query = rawQuery.toLowerCase();

  const nameLower = name.toLowerCase();
  const pathLower = path.toLowerCase();

  let score = 0;

  // 名称优先（核心权重）
  if (name === rawQuery) score += 200; // 完全匹配（含大小写）
  else if (name.startsWith(rawQuery)) score += 160; // 前缀（大小写敏感）
  else if (nameLower === query) score += 120; // 忽略大小写完全匹配
  else if (nameLower.startsWith(query)) score += 100; // 忽略大小写前缀
  else if (nameLower.includes(query)) score += 70; // 包含

  // path 次要
  if (path === rawQuery) score += 60;
  else if (path.startsWith(rawQuery)) score += 40;
  else if (pathLower === query) score += 30;
  else if (pathLower.startsWith(query)) score += 20;
  else if (pathLower.includes(query)) score += 10;

  return score;
}

/**
 * 过滤并排序文件列表
 * @param files - 文件列表
 * @param query - 查询字符串
 * @returns 排序后的文件列表
 */
export function filterAndSortFiles(files: readonly FileMentionOption[], query: string): FileMentionOption[] {
  const rawQuery = query.trim();
  const lowerQuery = rawQuery.toLowerCase();

  if (!lowerQuery) return [...files];

  return [...files]
    .filter((file) => {
      const name = file.name.toLowerCase();
      const path = file.path?.toLowerCase() ?? '';
      return name.includes(lowerQuery) || path.includes(lowerQuery);
    })
    .sort((a, b) => scoreFile(b, rawQuery) - scoreFile(a, rawQuery));
}
