/**
 * @file types.ts
 * @description 记忆系统类型定义
 */

/** 记忆分区名称 */
export type MemoryCategory = 'Instructions' | 'Preferences' | 'Habits' | 'Facts' | 'Projects' | 'Current Context';

/** 所有分区名称的有序列表，用于序列化时保持顺序 */
export const MEMORY_CATEGORIES: MemoryCategory[] = ['Instructions', 'Preferences', 'Habits', 'Facts', 'Projects', 'Current Context'];

/** 单条记忆 */
export interface MemoryItem {
  content: string;
}

/** 记忆分区 */
export interface MemorySection {
  category: MemoryCategory;
  items: MemoryItem[];
}

/** 完整记忆文档 */
export interface MemoryDoc {
  sections: MemorySection[];
}

/** 记忆文件路径常量 */
export const MEMORY_FILE_NAME = 'MEMORY.md';
