/**
 * @file importer.ts
 * @description 小组件 zip 包导入解析工具。
 */
import type { WidgetData } from '@/components/BWidget/types';
import { readZipPackage, type ZipPackageResource } from '@/utils/zip/package';
import { parseWidgetJson } from './parser';

/** zip 根层级小组件文件名。 */
const WIDGET_JSON_FILE_NAME = 'widget.json';
/** Widget zip 最大非目录文件数。 */
export const WIDGET_ZIP_MAX_ENTRIES = 50;
/** Widget zip 单个资源最大字节数。 */
export const WIDGET_ZIP_MAX_RESOURCE_BYTES = 5 * 1024 * 1024;
/** 小组件标识允许字符替换表达式。 */
const WIDGET_ID_INVALID_CHARACTER_PATTERN = /[^a-z0-9_-]+/gu;
/** 小组件标识两端短横线清理表达式。 */
const WIDGET_ID_EDGE_DASH_PATTERN = /^-+|-+$/gu;

/**
 * 小组件 zip 导入资源。
 */
export type WidgetImportResource = ZipPackageResource;

/**
 * 小组件 zip 导入结果。
 */
export interface WidgetImportResult {
  /** 导入得到的小组件数据。 */
  data: WidgetData;
  /** 来源文件名。 */
  sourceName: string;
  /** 根据 zip 文件名推导的标识。 */
  suggestedId: string;
  /** widget.json 之外需要写入小组件目录的资源文件。 */
  resources: WidgetImportResource[];
}

/**
 * 读取文件名主干。
 * @param fileName - 文件名
 * @returns 文件名主干
 */
function readFileNameStem(fileName: string): string {
  const normalizedName = fileName.replace(/\\/g, '/').split('/').at(-1) ?? fileName;

  return normalizedName.toLowerCase().endsWith('.zip') ? normalizedName.slice(0, -'.zip'.length) : normalizedName;
}

/**
 * 根据 zip 文件名生成小组件标识建议值。
 * @param fileName - zip 文件名
 * @returns 小组件标识建议值
 */
export function createWidgetIdSuggestionFromFileName(fileName: string): string {
  const normalized = readFileNameStem(fileName).trim().toLowerCase().replace(WIDGET_ID_INVALID_CHARACTER_PATTERN, '-').replace(WIDGET_ID_EDGE_DASH_PATTERN, '');

  return normalized || 'widget';
}

/**
 * 从 zip 文件导入小组件数据。
 * @param file - zip 文件
 * @returns 小组件导入结果
 */
export async function importWidgetZipFile(file: File): Promise<WidgetImportResult> {
  const buffer = await file.arrayBuffer();
  const zipPackage = await readZipPackage(buffer, {
    rootFileName: WIDGET_JSON_FILE_NAME,
    maxEntries: WIDGET_ZIP_MAX_ENTRIES,
    maxFileBytes: WIDGET_ZIP_MAX_RESOURCE_BYTES
  });
  const suggestedId = createWidgetIdSuggestionFromFileName(file.name);
  const definition = parseWidgetJson(zipPackage.rootFileContent, `${suggestedId}/${WIDGET_JSON_FILE_NAME}`);

  if (definition.parseError) {
    throw new Error(`widget.json 解析失败：${definition.parseError}`);
  }

  return {
    data: definition.data,
    sourceName: file.name,
    suggestedId,
    resources: zipPackage.resources
  };
}
