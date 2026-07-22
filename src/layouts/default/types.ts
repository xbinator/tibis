/**
 * @file types.ts
 * @description 默认布局共享类型。
 */
import type { File } from '@/shared/platform/native/types';

/**
 * 编辑器文件。
 */
export interface EditorFile extends File {
  /** 编辑器文件唯一标识。 */
  id: string;
}
