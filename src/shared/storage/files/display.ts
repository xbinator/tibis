/**
 * @file display.ts
 * @description 提供最近记录展示标题、描述、搜索字段与样式状态的统一派生函数。
 */

import { createDocumentDescription, createDocumentTitle } from './recent';
import { isDocumentRecord, type RecentRecord } from './types';

/**
 * 解析最近记录展示标题。
 * @param record - 最近记录
 * @returns 展示标题
 */
export function resolveRecentTitle(record: RecentRecord): string {
  if (record.title) return record.title;
  if (isDocumentRecord(record)) return createDocumentTitle(record.name, record.ext);

  return record.url;
}

/**
 * 解析最近记录展示描述。
 * @param record - 最近记录
 * @returns 展示描述
 */
export function resolveRecentDescription(record: RecentRecord): string {
  if (record.description !== undefined) return record.description;
  if (isDocumentRecord(record)) return createDocumentDescription(record.path);

  return record.url;
}

/**
 * 判断最近记录是否为指定本地文档路径。
 * @param record - 最近记录
 * @param path - 本地路径
 * @returns 是否匹配本地文档路径
 */
export function isRecentDocumentPath(record: RecentRecord, path: string | undefined): boolean {
  return isDocumentRecord(record) && record.path === path;
}

/**
 * 获取最近记录描述附加样式类。
 * @param record - 最近记录
 * @returns 描述样式类名
 */
export function getRecentDescriptionClass(record: RecentRecord): string {
  return isDocumentRecord(record) && !record.path ? 'is-unsaved' : '';
}

/**
 * 创建最近记录搜索文本。
 * @param record - 最近记录
 * @returns 可搜索文本
 */
export function createRecentSearchText(record: RecentRecord): string {
  const documentFields = isDocumentRecord(record) ? [record.name, record.ext, record.path] : [];
  const fields = [record.title, record.description, record.url, record.id, record.type, ...documentFields];

  return fields.filter((field): field is string => typeof field === 'string' && field.length > 0).join('\0');
}
