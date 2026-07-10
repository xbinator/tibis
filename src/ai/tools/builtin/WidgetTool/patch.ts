/**
 * @file WidgetTool/patch.ts
 * @description Widget 编辑工具结构化 Patch 的安全解析与原子应用。
 */
import { cloneDeep, isPlainObject } from 'lodash-es';
import type { WidgetData } from '@/components/BWidget/types';
import { validateWidgetData, WIDGET_DATA_ROOT_KEYS } from '@/components/BWidget/utils/widgetDataValidation';

/** Widget 文档 Patch 路径片段。 */
export type WidgetDocumentPathSegment = string | number;

/**
 * Widget 文档结构化 Patch。
 */
export type WidgetDocumentPatch =
  | {
      /** 设置字段值 */
      op: 'set';
      /** 从 WidgetData 根开始的路径 */
      path: WidgetDocumentPathSegment[];
      /** 写入值 */
      value: unknown;
    }
  | {
      /** 删除字段或数组项 */
      op: 'delete';
      /** 从 WidgetData 根开始的路径 */
      path: WidgetDocumentPathSegment[];
    };

/** Widget 文档 Patch 结构校验结果。 */
export type WidgetDocumentPatchValidationResult = { valid: true; patches: WidgetDocumentPatch[] } | { valid: false; message: string };

/** Widget 文档 Patch 单次调用最大操作数。 */
const MAX_WIDGET_DOCUMENT_PATCHES = 100;

/** 禁止出现在 Patch 路径中的原型字段。 */
const UNSAFE_WIDGET_DOCUMENT_PATH_SEGMENTS: readonly string[] = ['__proto__', 'prototype', 'constructor'];

/**
 * Widget 文档 Patch 错误。
 */
export class WidgetDocumentPatchError extends Error {
  /**
   * 创建 Widget 文档 Patch 错误。
   * @param message - 错误说明
   */
  constructor(message: string) {
    super(message);
    this.name = 'WidgetDocumentPatchError';
  }
}

/**
 * 判断未知值是否为普通对象记录。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 判断路径片段是否合法。
 * @param segment - 待判断路径片段
 * @returns 是否为合法路径片段
 */
function isValidPathSegment(segment: unknown): segment is WidgetDocumentPathSegment {
  if (typeof segment === 'number') {
    return Number.isSafeInteger(segment) && segment >= 0;
  }

  return typeof segment === 'string' && segment.length > 0 && !UNSAFE_WIDGET_DOCUMENT_PATH_SEGMENTS.includes(segment);
}

/**
 * 校验单个 Patch 路径。
 * @param path - 待校验路径
 * @returns 错误消息，合法时返回 null
 */
function validatePatchPath(path: unknown): string | null {
  if (!Array.isArray(path) || path.length === 0) return 'Patch path 不能为空';
  if (!path.every(isValidPathSegment)) {
    const unsafeSegment = path.find((segment: unknown): boolean => typeof segment === 'string' && UNSAFE_WIDGET_DOCUMENT_PATH_SEGMENTS.includes(segment));
    return unsafeSegment ? `Patch path 禁止包含 ${String(unsafeSegment)}` : 'Patch path 包含非法片段';
  }
  if (typeof path[0] !== 'string' || !WIDGET_DATA_ROOT_KEYS.includes(path[0])) {
    return `不支持的 WidgetData 顶层字段：${String(path[0])}`;
  }

  return null;
}

/**
 * 校验 Widget 文档 Patch 列表并返回类型安全副本。
 * @param value - 待校验值
 * @returns Patch 校验结果
 */
export function validateWidgetDocumentPatches(value: unknown): WidgetDocumentPatchValidationResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { valid: false, message: 'patches 必须是非空数组' };
  }
  if (value.length > MAX_WIDGET_DOCUMENT_PATCHES) {
    return { valid: false, message: `patches 最多包含 ${MAX_WIDGET_DOCUMENT_PATCHES} 个操作` };
  }

  for (const [index, patch] of value.entries()) {
    if (!isPlainRecord(patch)) return { valid: false, message: `patches[${index}] 必须是普通对象` };
    if (patch.op !== 'set' && patch.op !== 'delete') return { valid: false, message: `patches[${index}].op 必须是 set 或 delete` };

    const pathError = validatePatchPath(patch.path);
    if (pathError) return { valid: false, message: `patches[${index}]: ${pathError}` };

    const path = patch.path as WidgetDocumentPathSegment[];
    if (patch.op === 'set' && !Object.prototype.hasOwnProperty.call(patch, 'value')) {
      return { valid: false, message: `patches[${index}] 的 set 操作缺少 value` };
    }
    if (patch.op === 'delete' && path.length === 1) {
      return { valid: false, message: `patches[${index}] 不能删除 WidgetData 必需顶层字段` };
    }

    const allowedKeys = patch.op === 'set' ? ['op', 'path', 'value'] : ['op', 'path'];
    const unexpectedKey = Object.keys(patch).find((key: string): boolean => !allowedKeys.includes(key));
    if (unexpectedKey) return { valid: false, message: `patches[${index}] 包含不支持的字段：${unexpectedKey}` };
  }

  return { valid: true, patches: cloneDeep(value) as WidgetDocumentPatch[] };
}

/**
 * 从对象或数组容器读取路径片段。
 * @param container - 当前容器
 * @param segment - 路径片段
 * @param path - 当前完整路径
 * @returns 路径值
 */
function readContainerValue(container: Record<string, unknown> | unknown[], segment: WidgetDocumentPathSegment, path: WidgetDocumentPathSegment[]): unknown {
  if (Array.isArray(container)) {
    if (typeof segment !== 'number' || segment >= container.length) {
      throw new WidgetDocumentPatchError(`Patch 父路径不存在：${JSON.stringify(path)}`);
    }
    return container[segment];
  }

  if (typeof segment !== 'string' || !Object.prototype.hasOwnProperty.call(container, segment)) {
    throw new WidgetDocumentPatchError(`Patch 父路径不存在：${JSON.stringify(path)}`);
  }
  return container[segment];
}

/**
 * 读取 Patch 末级字段的父容器。
 * @param root - WidgetData 根对象
 * @param path - Patch 路径
 * @returns 父容器与末级路径片段
 */
function resolvePatchTarget(
  root: Record<string, unknown>,
  path: WidgetDocumentPathSegment[]
): { container: Record<string, unknown> | unknown[]; segment: WidgetDocumentPathSegment } {
  let cursor: unknown = root;

  for (let index = 0; index < path.length - 1; index += 1) {
    if (!Array.isArray(cursor) && !isPlainRecord(cursor)) {
      throw new WidgetDocumentPatchError(`Patch 父路径不是容器：${JSON.stringify(path.slice(0, index))}`);
    }
    cursor = readContainerValue(cursor, path[index], path.slice(0, index + 1));
  }

  if (!Array.isArray(cursor) && !isPlainRecord(cursor)) {
    throw new WidgetDocumentPatchError(`Patch 目标父路径不是容器：${JSON.stringify(path.slice(0, -1))}`);
  }

  return { container: cursor, segment: path[path.length - 1] };
}

/**
 * 应用单个 set Patch。
 * @param root - WidgetData 根对象
 * @param patch - set Patch
 */
function applySetPatch(root: Record<string, unknown>, patch: Extract<WidgetDocumentPatch, { op: 'set' }>): void {
  const { container, segment } = resolvePatchTarget(root, patch.path);
  const value = cloneDeep(patch.value);

  if (Array.isArray(container)) {
    if (typeof segment !== 'number' || segment > container.length) {
      throw new WidgetDocumentPatchError(`Patch 数组索引越界：${JSON.stringify(patch.path)}`);
    }
    if (segment === container.length) {
      container.push(value);
      return;
    }
    container[segment] = value;
    return;
  }

  if (typeof segment !== 'string') {
    throw new WidgetDocumentPatchError(`对象路径末段必须是字符串：${JSON.stringify(patch.path)}`);
  }
  container[segment] = value;
}

/**
 * 应用单个 delete Patch。
 * @param root - WidgetData 根对象
 * @param patch - delete Patch
 */
function applyDeletePatch(root: Record<string, unknown>, patch: Extract<WidgetDocumentPatch, { op: 'delete' }>): void {
  const { container, segment } = resolvePatchTarget(root, patch.path);

  if (Array.isArray(container)) {
    if (typeof segment !== 'number' || segment >= container.length) {
      throw new WidgetDocumentPatchError(`Patch 数组索引越界：${JSON.stringify(patch.path)}`);
    }
    container.splice(segment, 1);
    return;
  }

  if (typeof segment !== 'string' || !Object.prototype.hasOwnProperty.call(container, segment)) {
    throw new WidgetDocumentPatchError(`Patch 删除目标不存在：${JSON.stringify(patch.path)}`);
  }
  delete container[segment];
}

/**
 * 原子应用 Widget 文档 Patch 列表。
 * @param value - 当前 WidgetData
 * @param patches - 结构化 Patch 列表
 * @returns 应用后的新 WidgetData
 */
export function applyWidgetDocumentPatches(value: WidgetData, patches: WidgetDocumentPatch[]): WidgetData {
  const patchValidation = validateWidgetDocumentPatches(patches);
  if (!patchValidation.valid) throw new WidgetDocumentPatchError(patchValidation.message);

  const nextValue = cloneDeep(value) as unknown as Record<string, unknown>;
  for (const patch of patchValidation.patches) {
    if (patch.op === 'set') {
      applySetPatch(nextValue, patch);
    } else {
      applyDeletePatch(nextValue, patch);
    }
  }

  const dataValidation = validateWidgetData(nextValue);
  if (!dataValidation.valid) {
    throw new WidgetDocumentPatchError(`WidgetData 校验失败 ${JSON.stringify(dataValidation.path)}：${dataValidation.message}`);
  }

  return nextValue as unknown as WidgetData;
}
