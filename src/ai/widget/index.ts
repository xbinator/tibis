/**
 * @file index.ts
 * @description 小组件管理服务统一出口。
 */
export { joinPath, parseWidgetJson, readWidgetIdFromFilePath } from './parser';
export { createWidgetIdSuggestionFromFileName, importWidgetZipFile, type WidgetImportResource, type WidgetImportResult } from './importer';
export { scanWidgets, type WidgetScannerAPI } from './scanner';
export type { WidgetDefinition, WidgetScanConfig } from './types';
