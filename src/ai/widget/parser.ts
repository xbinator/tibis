/**
 * @file parser.ts
 * @description 小组件 JSON 文件解析器。
 */
import type { WidgetDefinition } from './types';
import { cloneDeep } from 'lodash-es';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData, normalizeWidgetDataContract } from '@/components/BWidget/utils/widgetData';
import { hashString } from '@/shared/utils/hash';

/**
 * 判断值是否为普通记录。
 * @param value - 待判断值
 * @returns 是否为普通记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断值是否包含可用的 Widget execute 脚本。
 * @param value - 待检查值
 * @returns 是否包含可用 execute
 */
function hasWidgetExecuteMethod(value: Record<string, unknown>): boolean {
  const { execute } = value;

  return isRecord(execute) && typeof execute.code === 'string';
}

/**
 * 拼接路径片段，统一使用 / 分隔。
 * @param segments - 路径片段
 * @returns 拼接后的路径
 */
export function joinPath(...segments: string[]): string {
  return segments
    .map((segment: string): string => segment.replace(/\\/g, '/').replace(/\/+$/u, ''))
    .join('/')
    .replace(/\/+/gu, '/');
}

/**
 * 从小组件配置文件路径读取目录形式的小组件 ID。
 * @param filePath - 小组件 JSON 文件路径
 * @returns 小组件 ID
 */
export function readWidgetIdFromFilePath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const pathSegments = normalizedPath.split('/').filter(Boolean);
  const fileName = pathSegments.at(-1) ?? '';

  if (fileName === 'widget.json') {
    return pathSegments.at(-2) ?? fileName;
  }

  return fileName.endsWith('.json') ? fileName.slice(0, -'.json'.length) : fileName;
}

/**
 * 从未知记录归一化 WidgetData。
 * @param id - 小组件文件 ID
 * @param value - 原始 JSON 数据
 * @returns 小组件数据
 */
function normalizeWidgetData(id: string, value: Record<string, unknown>): WidgetData {
  const defaults = createDefaultWidgetData(id);
  const contract = normalizeWidgetDataContract(value);
  const data: WidgetData = {
    ...defaults,
    ...contract,
    execute: hasWidgetExecuteMethod(value) ? contract.execute : defaults.execute,
    elements: Array.isArray(value.elements) ? (cloneDeep(value.elements) as WidgetData['elements']) : defaults.elements
  };

  return {
    ...data,
    name: data.name || id
  };
}

/**
 * 创建解析失败的小组件定义。
 * @param filePath - 小组件 JSON 文件路径
 * @param message - 错误信息
 * @param contentHash - 完整源文本的内容版本
 * @returns 解析失败定义
 */
function createWidgetParseError(filePath: string, message: string, contentHash: string): WidgetDefinition {
  const id = readWidgetIdFromFilePath(filePath);
  const data = createDefaultWidgetData(id);

  return {
    id,
    name: id,
    description: '',
    data: {
      ...data,
      name: id
    },
    contentHash,
    filePath: filePath.replace(/\\/g, '/'),
    enabled: true,
    parsedAt: Date.now(),
    parseError: message
  };
}

/**
 * 解析小组件 JSON 文件内容。
 * @param content - JSON 文件文本
 * @param filePath - 小组件 JSON 文件路径
 * @returns 小组件定义
 */
export function parseWidgetJson(content: string, filePath: string): WidgetDefinition {
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const id = readWidgetIdFromFilePath(normalizedFilePath);
  const contentHash = hashString(content);

  try {
    const parsed: unknown = JSON.parse(content);

    if (!isRecord(parsed)) {
      return createWidgetParseError(normalizedFilePath, 'Widget JSON must be an object.', contentHash);
    }

    const data = normalizeWidgetData(id, parsed);

    return {
      id,
      name: data.name,
      description: data.description,
      data,
      contentHash,
      filePath: normalizedFilePath,
      enabled: true,
      parsedAt: Date.now()
    };
  } catch (error: unknown) {
    return createWidgetParseError(normalizedFilePath, error instanceof Error ? error.message : String(error), contentHash);
  }
}
