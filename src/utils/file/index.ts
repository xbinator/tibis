/**
 * @file index.ts
 * @description 文件工具模块统一导出入口。
 */

export { resolveFileTitle, type FileTitleParts } from './title';
export { buildUnsavedPath, parseUnsavedPath, isUnsavedPath, type UnsavedPathParts, type ParsedUnsavedPath } from './unsaved';
export { parseFileReferenceToken, type ParsedFileReference, type FileReferenceNavigationTarget } from './reference';
