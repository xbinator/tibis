/**
 * @file index.ts
 * @description 小组件管理服务统一出口。
 */
export { joinPath, parseWidgetJson, readWidgetIdFromFilePath } from './parser';
export {
  createWidgetIdSuggestionFromFileName,
  importWidgetJsonFile,
  importWidgetZipFile,
  type WidgetImportResource,
  type WidgetImportResult
} from './importer';
export { scanWidgetDirectories, type WidgetScannerAPI } from './scanner';
export type { WidgetDefinition, WidgetEntry, WidgetIndex, WidgetScanConfig } from './types';
