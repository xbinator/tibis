/**
 * @file index.ts
 * @description 小组件管理服务统一出口。
 */
export { createWidgetTibisDocumentContent, joinPath, parseWidgetJson, readWidgetIdFromFilePath } from './parser';
export { scanWidgets, type WidgetScannerAPI } from './scanner';
export type { WidgetDefinition, WidgetScanConfig } from './types';
