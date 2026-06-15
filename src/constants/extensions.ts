/**
 * @file file-extensions
 * @description 统一管理支持的文件扩展名常量，避免多处重复定义。
 */

/** 打开文件时支持的扩展名列表 */
export const OPEN_FILE_EXTENSIONS: string[] = ['md', 'markdown', 'json', 'tibis'];

/** 保存文件时默认的扩展名列表 */
export const SAVE_FILE_EXTENSIONS: string[] = ['md'];

/** Tibis 文件保存扩展名列表 */
export const TIBIS_FILE_EXTENSIONS: string[] = ['tibis'];

/** 打开文件对话框默认过滤器 */
export const OPEN_FILE_FILTER = { name: 'Tibis / Markdown', extensions: OPEN_FILE_EXTENSIONS };

/** 保存文件对话框默认过滤器 */
export const SAVE_FILE_FILTER = { name: 'Markdown', extensions: SAVE_FILE_EXTENSIONS };

/** Tibis 文件保存过滤器 */
export const TIBIS_FILE_FILTER = { name: 'Tibis', extensions: TIBIS_FILE_EXTENSIONS };

/** PDF 导出对话框默认过滤器 */
export const PDF_FILE_FILTER = { name: 'PDF', extensions: ['pdf'] };
