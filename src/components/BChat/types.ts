/**
 * 行号范围信息
 */
export interface LineRange {
  /** 起始行号（1-based），0 表示无行号 */
  startLine: number;
  /** 结束行号（1-based），等于 startLine 时表示单行 */
  endLine: number;
}

/**
 * 文件位置信息
 */
export interface FileLocation extends LineRange {
  /** 完整文件路径（可用时），未保存的引用则为 `null` */
  filePath: string | null;
  /** Chip 内显示的展示名称 */
  fileName: string;
}

/**
 * 文件引用 Chip 数据，用于 Prompt 编辑器
 */
export interface FileReferenceChip extends FileLocation {
  /** 稳定的文档 ID，用于限定草稿范围内的引用及 `{{file-ref:...}}` 标记 */
  id: string;
}

export type { FileReference } from '@/utils/file/reference';
