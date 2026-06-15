/**
 * @file index.ts
 * @description 文件引用 Chip 共享导出入口。
 */

export type { FileRefChipPresentation, FileRefChipPresentationOptions } from './presentation';
export {
  FILE_REF_CHIP_CLASS,
  FILE_REF_CHIP_FILENAME_CLASS,
  FILE_REF_CHIP_LINES_CLASS,
  createFileRefChipElement,
  createFileRefChipPresentation,
  formatFileRefChipLineText
} from './presentation';
