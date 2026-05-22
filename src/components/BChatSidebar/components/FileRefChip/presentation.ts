/**
 * @file presentation.ts
 * @description 文件引用 Chip 的共享展示数据与 DOM 创建工具。
 */

/**
 * 文件引用 Chip 展示数据。
 */
export interface FileRefChipPresentation {
  /** 根节点类名。 */
  rootClass: string;
  /** 文件名节点类名。 */
  fileNameClass: string;
  /** 行号节点类名。 */
  lineTextClass: string;
  /** 标题文案。 */
  title: string;
  /** 文件名文案。 */
  fileName: string;
  /** 行号文案。 */
  lineText: string;
}

/**
 * 文件引用 Chip 展示参数。
 */
export interface FileRefChipPresentationOptions {
  /** 完整路径或回退标题。 */
  title: string;
  /** 展示用文件名。 */
  fileName: string;
  /** 起始行号。 */
  startLine: number;
  /** 结束行号。 */
  endLine: number;
}

/** 文件引用 Chip 根节点类名。 */
export const FILE_REF_CHIP_CLASS = 'b-file-ref-chip';

/** 文件引用 Chip 文件名节点类名。 */
export const FILE_REF_CHIP_FILENAME_CLASS = 'b-file-ref-chip__filename';

/** 文件引用 Chip 行号节点类名。 */
export const FILE_REF_CHIP_LINES_CLASS = 'b-file-ref-chip__lines';

/**
 * 格式化展示行号文案。
 * @param startLine - 起始行号（0 表示无行号）
 * @param endLine - 结束行号（0 表示无行号）
 * @returns 行号展示文案，无行号时返回空字符串
 */
export function formatFileRefChipLineText(startLine: number, endLine: number): string {
  if (startLine === 0 && endLine === 0) {
    return '';
  }
  return startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
}

/**
 * 创建文件引用 Chip 展示数据。
 * @param options - 展示参数
 * @returns 统一的 Chip 展示数据
 */
export function createFileRefChipPresentation(options: FileRefChipPresentationOptions): FileRefChipPresentation {
  return {
    rootClass: FILE_REF_CHIP_CLASS,
    fileNameClass: FILE_REF_CHIP_FILENAME_CLASS,
    lineTextClass: FILE_REF_CHIP_LINES_CLASS,
    title: options.title,
    fileName: options.fileName,
    lineText: formatFileRefChipLineText(options.startLine, options.endLine)
  };
}

/**
 * 创建文件引用 Chip 的 DOM 结构。
 * @param presentation - 展示数据
 * @returns 渲染后的 DOM 节点
 */
export function createFileRefChipElement(presentation: FileRefChipPresentation): HTMLSpanElement {
  const root = document.createElement('span');
  root.className = presentation.rootClass;
  root.title = presentation.title;
  root.setAttribute('role', 'button');
  root.tabIndex = 0;

  const fileName = document.createElement('span');
  fileName.className = presentation.fileNameClass;
  fileName.textContent = presentation.fileName;

  root.appendChild(fileName);

  // 无行号时不添加行号元素
  if (presentation.lineText) {
    const lineText = document.createElement('span');
    lineText.className = presentation.lineTextClass;
    lineText.textContent = presentation.lineText;
    root.appendChild(lineText);
  }

  return root;
}
