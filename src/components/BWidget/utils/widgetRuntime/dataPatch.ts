/**
 * @file widgetRuntime/dataPatch.ts
 * @description BWidget 运行态 data patch 应用工具。
 */
import { isPlainObject } from 'lodash-es';

/** Widget 运行态 data patch 路径片段。 */
export type WidgetRuntimeDataPathSegment = string | number;

/**
 * Widget 运行态 data patch。
 */
export type WidgetRuntimeDataPatch =
  | {
      /** 设置字段值 */
      op: 'set';
      /** 从 renderContext.data 根开始的路径 */
      path: WidgetRuntimeDataPathSegment[];
      /** 写入值 */
      value: unknown;
    }
  | {
      /** 删除字段 */
      op: 'delete';
      /** 从 renderContext.data 根开始的路径 */
      path: WidgetRuntimeDataPathSegment[];
    };

/**
 * 可应用运行态 data patch 的状态。
 */
interface WidgetRuntimeDataPatchableState {
  /** 运行态渲染上下文 */
  renderContext: {
    /** 运行态数据 */
    data: Record<string, unknown>;
  };
}

/**
 * 判断值是否为普通对象记录。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 判断值是否可作为 patch 路径片段。
 * @param value - 待判断值
 * @returns 是否为路径片段
 */
function isPatchPathSegment(value: unknown): value is WidgetRuntimeDataPathSegment {
  return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}

/**
 * 判断值是否为 patch 路径。
 * @param value - 待判断值
 * @returns 是否为 patch 路径
 */
function isPatchPath(value: unknown): value is WidgetRuntimeDataPathSegment[] {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && value.every(isPatchPathSegment);
}

/**
 * 判断值是否可继续按路径写入。
 * @param value - 待判断值
 * @returns 是否为对象或数组容器
 */
function isPatchContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isPlainRecord(value);
}

/**
 * 判断容器上是否存在指定路径片段。
 * @param container - 容器
 * @param segment - 路径片段
 * @returns 是否存在
 */
function hasContainerSegment(container: Record<string, unknown> | unknown[], segment: WidgetRuntimeDataPathSegment): boolean {
  return Object.prototype.hasOwnProperty.call(container, segment);
}

/**
 * 读取容器路径片段。
 * @param container - 容器
 * @param segment - 路径片段
 * @returns 路径值
 */
function readContainerSegment(container: Record<string, unknown> | unknown[], segment: WidgetRuntimeDataPathSegment): unknown {
  return Array.isArray(container) && typeof segment === 'number' ? container[segment] : (container as Record<string, unknown>)[String(segment)];
}

/**
 * 写入容器路径片段。
 * @param container - 容器
 * @param segment - 路径片段
 * @param value - 写入值
 */
function writeContainerSegment(container: Record<string, unknown> | unknown[], segment: WidgetRuntimeDataPathSegment, value: unknown): void {
  if (Array.isArray(container) && typeof segment === 'number') {
    container[segment] = value;
    return;
  }

  (container as Record<string, unknown>)[String(segment)] = value;
}

/**
 * 删除容器路径片段。
 * @param container - 容器
 * @param segment - 路径片段
 */
function deleteContainerSegment(container: Record<string, unknown> | unknown[], segment: WidgetRuntimeDataPathSegment): void {
  if (Array.isArray(container) && typeof segment === 'number') {
    container[segment] = null;
    return;
  }

  delete (container as Record<string, unknown>)[String(segment)];
}

/**
 * 按下一段路径创建或浅拷贝容器。
 * @param value - 原容器
 * @param nextSegment - 下一段路径
 * @returns 新容器
 */
function clonePatchContainer(value: unknown, nextSegment: WidgetRuntimeDataPathSegment): Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return [...value];
  if (isPlainRecord(value)) return { ...value };
  return typeof nextSegment === 'number' ? [] : {};
}

/**
 * 应用 set patch。
 * @param data - 原 data
 * @param patch - set patch
 * @returns 应用后的 data
 */
function applySetPatch(data: Record<string, unknown>, patch: Extract<WidgetRuntimeDataPatch, { op: 'set' }>): Record<string, unknown> {
  if (!isPatchPath(patch.path)) return data;

  const nextData = { ...data };
  let targetCursor: Record<string, unknown> | unknown[] = nextData;

  for (let index = 0; index < patch.path.length - 1; index += 1) {
    const segment = patch.path[index];
    const nextSegment = patch.path[index + 1];
    const currentValue = readContainerSegment(targetCursor, segment);
    const nextContainer = clonePatchContainer(currentValue, nextSegment);

    writeContainerSegment(targetCursor, segment, nextContainer);
    targetCursor = nextContainer;
  }

  writeContainerSegment(targetCursor, patch.path[patch.path.length - 1], patch.value);

  return nextData;
}

/**
 * 应用 delete patch。
 * @param data - 原 data
 * @param patch - delete patch
 * @returns 应用后的 data
 */
function applyDeletePatch(data: Record<string, unknown>, patch: Extract<WidgetRuntimeDataPatch, { op: 'delete' }>): Record<string, unknown> {
  if (!isPatchPath(patch.path)) return data;

  const nextData = { ...data };
  let sourceCursor: Record<string, unknown> | unknown[] = data;
  let targetCursor: Record<string, unknown> | unknown[] = nextData;

  for (let index = 0; index < patch.path.length - 1; index += 1) {
    const segment = patch.path[index];
    const nextSegment = patch.path[index + 1];
    const currentValue = readContainerSegment(sourceCursor, segment);

    if (!isPatchContainer(currentValue)) return data;

    const nextContainer = clonePatchContainer(currentValue, nextSegment);
    writeContainerSegment(targetCursor, segment, nextContainer);
    sourceCursor = currentValue;
    targetCursor = nextContainer;
  }

  const lastSegment = patch.path[patch.path.length - 1];
  if (!hasContainerSegment(sourceCursor, lastSegment)) return data;

  deleteContainerSegment(targetCursor, lastSegment);

  return nextData;
}

/**
 * 应用单个运行态 data patch。
 * @param data - 原 data
 * @param patch - data patch
 * @returns 应用后的 data
 */
export function applyWidgetRuntimeDataPatch(data: Record<string, unknown>, patch: WidgetRuntimeDataPatch): Record<string, unknown> {
  return patch.op === 'set' ? applySetPatch(data, patch) : applyDeletePatch(data, patch);
}

/**
 * 应用运行态 data patch 列表。
 * @param data - 原 data
 * @param patches - data patch 列表
 * @returns 应用后的 data
 */
export function applyWidgetRuntimeDataPatches(data: Record<string, unknown>, patches: WidgetRuntimeDataPatch[]): Record<string, unknown> {
  let nextData = data;

  for (const patch of patches) {
    nextData = applyWidgetRuntimeDataPatch(nextData, patch);
  }

  return nextData;
}

/**
 * 把 data patch 列表应用到运行态状态。
 * @param state - 原运行态状态
 * @param patches - data patch 列表
 * @returns 应用后的运行态状态
 */
export function applyWidgetRuntimeDataPatchesToState<TState extends WidgetRuntimeDataPatchableState>(state: TState, patches: WidgetRuntimeDataPatch[]): TState {
  const nextData = applyWidgetRuntimeDataPatches(state.renderContext.data, patches);
  if (nextData === state.renderContext.data) return state;

  return {
    ...state,
    renderContext: {
      ...state.renderContext,
      data: nextData
    }
  } as TState;
}

/**
 * 判断值是否为运行态 data patch。
 * @param value - 待判断值
 * @returns 是否为运行态 data patch
 */
export function isWidgetRuntimeDataPatch(value: unknown): value is WidgetRuntimeDataPatch {
  if (!isPlainRecord(value) || !isPatchPath(value.path)) return false;
  if (value.op === 'delete') return true;
  return value.op === 'set' && Object.prototype.hasOwnProperty.call(value, 'value');
}

/**
 * 判断值是否为运行态 data patch 数组。
 * @param value - 待判断值
 * @returns 是否为运行态 data patch 数组
 */
export function isWidgetRuntimeDataPatchArray(value: unknown): value is WidgetRuntimeDataPatch[] {
  return Array.isArray(value) && value.every(isWidgetRuntimeDataPatch);
}
