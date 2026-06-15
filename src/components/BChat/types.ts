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
 * 渲染行号范围信息
 */
export interface RenderLineRange {
  /** 渲染时的起始行号（1-based），0 表示无行号 */
  renderStartLine?: number;
  /** 渲染时的结束行号（1-based），等于 renderStartLine 时表示单行 */
  renderEndLine?: number;
}

/**
 * 文件位置信息
 */
export interface FileLocation extends LineRange, RenderLineRange {
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

/**
 * 文件引用解析结果
 */
export interface FileReference extends LineRange, RenderLineRange {
  /** 原始文件引用令牌 */
  token: string;
  /** 文件路径 */
  path: string;
  /** 指定行号范围的内容 */
  selectedContent: string;
  /** 文件完整内容 */
  fullContent: string;
}
