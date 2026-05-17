/**
 * @file index.ts
 * @description EditorDriver 注册表。
 */

import type { EditorFile } from '../types';
import type { EditorDriver } from './types';
import { editorDriver } from './editor';
import { markdownDriver } from './markdown';

/** 已注册驱动列表。 */
export const editorDrivers: EditorDriver[] = [editorDriver, markdownDriver];

/**
 * 根据文件状态解析驱动。
 * @param fileState - 当前文件
 * @returns 匹配驱动
 */
export function resolveEditorDriver(fileState: EditorFile): EditorDriver {
  return editorDrivers.find((driver: EditorDriver) => driver.match(fileState)) ?? markdownDriver;
}
