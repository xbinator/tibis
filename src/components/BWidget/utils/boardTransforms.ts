/**
 * @file boardTransforms.ts
 * @description BWidget Widget状态变换、历史记录与元素数据模型。
 */
import type {
  WidgetAddShapeOptions,
  WidgetBoardSnapshot,
  WidgetBoardState,
  WidgetData,
  WidgetElementCreateAnchor,
  WidgetElementStyle,
  WidgetElementStyleChange,
  WidgetGeometryChange,
  WidgetLayerAction,
  WidgetMetadata,
  WidgetPoint,
  WidgetSize,
  WidgetShapeElement
} from '../types';
import { cloneDeep } from 'lodash-es';
import { WIDGET_DEFAULT_NODE_SIZE, WIDGET_MIN_CREATE_SIZE, WIDGET_MIN_ELEMENT_SIZE } from '../constants/board';
import { getWidgetElementSchema } from '../elements';
import { createDefaultWidgetViewport, normalizeWidgetDataContract, type WidgetDataContractCandidate } from './widgetData';
import { getWidgetShapeRenderSize } from './widgetGeometry';
import { expandWidgetSelectionToGroups, getWidgetElementGroupId } from './widgetGroups';

/** 粘贴元素未指定落点时使用的默认偏移量。 */
const WIDGET_PASTE_DEFAULT_OFFSET: WidgetPoint = { x: 16, y: 16 };

/**
 * 归一化几何数值，减少 DOM 坐标换算带来的浮点噪声。
 * @param value - 原始数值
 * @returns 归一化数值
 */
function normalizeGeometryValue(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 旧版Widget元素快照候选，兼容曾经写入的 kind 与 shape 字段。
 */
type WidgetElementSnapshotCandidate = Partial<Omit<WidgetShapeElement, 'metadata' | 'style'>> & {
  /** 旧版元素类别 */
  kind?: unknown;
  /** 旧版形状类型 */
  shape?: unknown;
  /** 旧版节点文本 */
  text?: unknown;
  /** 旧版节点说明 */
  description?: unknown;
  /** 样式 */
  style?: Partial<WidgetElementStyle>;
  /** 元信息 */
  metadata?: Record<string, unknown>;
};

/**
 * 粘贴元素参数。
 */
export interface WidgetPasteElementsOptions {
  /** 目标落点，按复制内容外接框左上角对齐 */
  anchorPoint?: WidgetPoint;
  /** 未指定目标落点时使用的整体偏移 */
  offset?: WidgetPoint;
  /** 创建粘贴元素新 ID */
  createElementId: (element: WidgetShapeElement, index: number) => string;
  /** 创建粘贴组合新 ID */
  createGroupId?: (groupId: string, index: number) => string;
}

/**
 * 判断坐标点是否可用于Widget元素。
 * @param point - 待检查坐标
 * @returns 是否为有效坐标
 */
function isWidgetPointLike(point: WidgetPoint | undefined): point is WidgetPoint {
  return typeof point?.x === 'number' && typeof point.y === 'number';
}

/**
 * 判断尺寸是否可用于Widget元素。
 * @param size - 待检查尺寸
 * @returns 是否为有效尺寸
 */
function isWidgetSizeLike(size: WidgetSize | undefined): size is WidgetSize {
  return typeof size?.width === 'number' && typeof size.height === 'number';
}

/**
 * 读取元素注册名称，优先使用新版 name，兼容旧版 shape。
 * @param element - 元素快照候选
 * @returns 元素注册名称，无法读取时返回 null
 */
function readWidgetElementName(element: WidgetElementSnapshotCandidate): string | null {
  if (typeof element.name === 'string') {
    return element.name;
  }

  if (typeof element.shape === 'string') {
    return element.shape;
  }

  return null;
}

/**
 * 读取元素注册展示信息。
 * @param name - 元素注册名称
 * @returns 注册展示信息
 */
function getElementRegistryDisplay(name: string): { label: string; icon: string } {
  const schema = getWidgetElementSchema(name);

  return {
    label: schema?.label ?? name,
    icon: schema?.icon ?? 'lucide:box'
  };
}

/**
 * 归一化组件自定义元数据，移除旧版通用系统字段。
 * @param metadata - 原始元数据
 * @returns 自定义元数据
 */
function normalizeElementMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const nextMetadata = cloneDeep(metadata ?? {});
  delete nextMetadata.source;
  delete nextMetadata.createdAt;
  delete nextMetadata.manualSize;

  return nextMetadata;
}

/**
 * 移除元素组合 ID。
 * @param metadata - 元素元数据
 * @returns 移除组合 ID 后的元数据
 */
function removeElementGroupId(metadata: WidgetMetadata): WidgetMetadata {
  const nextMetadata = cloneDeep(metadata);
  delete nextMetadata.groupId;

  return nextMetadata;
}

/**
 * 计算元素集合外接框左上角。
 * @param elements - 元素集合
 * @returns 外接框左上角，空集合返回原点
 */
function getElementsTopLeft(elements: WidgetShapeElement[]): WidgetPoint {
  if (!elements.length) {
    return { x: 0, y: 0 };
  }

  return elements.reduce<WidgetPoint>(
    (point: WidgetPoint, element: WidgetShapeElement): WidgetPoint => ({
      x: Math.min(point.x, element.position.x),
      y: Math.min(point.y, element.position.y)
    }),
    { x: elements[0].position.x, y: elements[0].position.y }
  );
}

/**
 * 读取粘贴元素整体偏移。
 * @param elements - 待粘贴元素
 * @param options - 粘贴参数
 * @returns 位置偏移
 */
function getPasteDelta(elements: WidgetShapeElement[], options: WidgetPasteElementsOptions): WidgetPoint {
  if (options.anchorPoint) {
    const topLeft = getElementsTopLeft(elements);

    return {
      x: options.anchorPoint.x - topLeft.x,
      y: options.anchorPoint.y - topLeft.y
    };
  }

  return cloneDeep(options.offset ?? WIDGET_PASTE_DEFAULT_OFFSET);
}

/**
 * 读取粘贴后的组合 ID。
 * @param groupIdMap - 旧组合 ID 到新组合 ID 的映射
 * @param sourceGroupId - 原组合 ID
 * @param createGroupId - 新组合 ID 生成器
 * @returns 新组合 ID
 */
function getPastedGroupId(
  groupIdMap: Map<string, string>,
  sourceGroupId: string,
  createGroupId: NonNullable<WidgetPasteElementsOptions['createGroupId']>
): string {
  const existingGroupId = groupIdMap.get(sourceGroupId);
  if (existingGroupId) {
    return existingGroupId;
  }

  const nextGroupId = createGroupId(sourceGroupId, groupIdMap.size);
  groupIdMap.set(sourceGroupId, nextGroupId);

  return nextGroupId;
}

/**
 * 判断元素 ID 是否发生重复。
 * @param currentIds - 当前已有 ID 集合
 * @param incomingIds - 新增 ID 列表
 * @returns 是否存在重复 ID
 */
function hasDuplicateElementIds(currentIds: Set<string>, incomingIds: string[]): boolean {
  const nextIds = new Set(currentIds);

  return incomingIds.some((id: string): boolean => {
    if (nextIds.has(id)) {
      return true;
    }

    nextIds.add(id);
    return false;
  });
}

/**
 * 交换元素数组中的两个位置。
 * @param elements - 元素数组
 * @param fromIndex - 第一个位置
 * @param toIndex - 第二个位置
 */
function swapElements(elements: WidgetShapeElement[], fromIndex: number, toIndex: number): void {
  const current = elements[fromIndex];
  elements[fromIndex] = elements[toIndex];
  elements[toIndex] = current;
}

/**
 * 将选中元素向上一层移动。
 * @param elements - 元素列表
 * @param selectedIds - 选中 ID 集合
 * @returns 调整后的元素列表
 */
function bringSelectionForward(elements: WidgetShapeElement[], selectedIds: Set<string>): WidgetShapeElement[] {
  const nextElements = cloneDeep(elements);

  for (let index = nextElements.length - 2; index >= 0; index -= 1) {
    const current = nextElements[index];
    const above = nextElements[index + 1];
    if (selectedIds.has(current.id) && !selectedIds.has(above.id)) {
      swapElements(nextElements, index, index + 1);
    }
  }

  return nextElements;
}

/**
 * 将选中元素向下一层移动。
 * @param elements - 元素列表
 * @param selectedIds - 选中 ID 集合
 * @returns 调整后的元素列表
 */
function sendSelectionBackward(elements: WidgetShapeElement[], selectedIds: Set<string>): WidgetShapeElement[] {
  const nextElements = cloneDeep(elements);

  for (let index = 1; index < nextElements.length; index += 1) {
    const current = nextElements[index];
    const below = nextElements[index - 1];
    if (selectedIds.has(current.id) && !selectedIds.has(below.id)) {
      swapElements(nextElements, index, index - 1);
    }
  }

  return nextElements;
}

/**
 * 按元素 schema 的尺寸来源同步模型尺寸。
 * @param element - 原始元素
 * @returns 已同步模型尺寸的元素
 */
function normalizeElementModelSize(element: WidgetShapeElement): WidgetShapeElement {
  return {
    ...element,
    size: getWidgetShapeRenderSize(element)
  };
}

/**
 * 创建不包含旧版冗余字段的元素快照。
 * @param element - 元素快照候选
 * @returns 元素快照，无法识别时返回 null
 */
function createSupportedElementSnapshot(element: WidgetElementSnapshotCandidate): WidgetShapeElement | null {
  const name = readWidgetElementName(element);
  if (!name || typeof element.id !== 'string' || !isWidgetPointLike(element.position) || !isWidgetSizeLike(element.size)) {
    return null;
  }

  const registryDisplay = getElementRegistryDisplay(name);
  const label = typeof element.label === 'string' ? element.label : registryDisplay.label;
  const icon = typeof element.icon === 'string' ? element.icon : registryDisplay.icon;

  return normalizeElementModelSize({
    id: element.id,
    name,
    label,
    icon,
    title: typeof element.title === 'string' ? element.title : label,
    position: cloneDeep(element.position),
    size: cloneDeep(element.size),
    rotation: typeof element.rotation === 'number' ? element.rotation : 0,
    style: cloneDeep(element.style ?? {}),
    metadata: normalizeElementMetadata(element.metadata)
  });
}

/**
 * 仅保留当前支持的形状元素。
 * @param elements - 输入元素列表
 * @returns 形状元素列表
 */
function cloneSupportedElements(elements: WidgetBoardSnapshot['elements'] | undefined): WidgetShapeElement[] {
  return (elements ?? [])
    .map((element: WidgetElementSnapshotCandidate): WidgetShapeElement | null => createSupportedElementSnapshot(element))
    .filter((element: WidgetShapeElement | null): element is WidgetShapeElement => element !== null);
}

/**
 * 创建Widget快照。
 * @param state - Widget状态
 * @returns 快照
 */
function createSnapshot(state: WidgetBoardSnapshot): WidgetBoardSnapshot {
  return {
    elements: cloneSupportedElements(state.elements),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  };
}

/**
 * 创建形状初始样式。
 * @param style - 外部传入样式
 * @returns 初始样式
 */
function createShapeInitialStyle(style?: WidgetElementStyle): WidgetElementStyle {
  return cloneDeep(style ?? {});
}

/**
 * 根据拖拽起止点计算形状几何。
 * @param start - 拖拽起点
 * @param end - 拖拽终点
 * @returns 归一化后的元素位置和尺寸
 */
function createShapeGeometry(
  start: WidgetPoint,
  end: WidgetPoint,
  createAnchor: WidgetElementCreateAnchor = 'center'
): { position: WidgetPoint; size: WidgetSize } {
  const width = normalizeGeometryValue(Math.abs(end.x - start.x));
  const height = normalizeGeometryValue(Math.abs(end.y - start.y));
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
  const shouldUseDefaultSize = width < WIDGET_MIN_CREATE_SIZE || height < WIDGET_MIN_CREATE_SIZE;
  const size = shouldUseDefaultSize
    ? WIDGET_DEFAULT_NODE_SIZE
    : {
        width,
        height
      };

  if (createAnchor === 'top-left') {
    return {
      position: {
        x: normalizeGeometryValue(start.x),
        y: normalizeGeometryValue(start.y)
      },
      size
    };
  }

  if (shouldUseDefaultSize) {
    return {
      position: {
        x: normalizeGeometryValue(center.x - WIDGET_DEFAULT_NODE_SIZE.width / 2),
        y: normalizeGeometryValue(center.y - WIDGET_DEFAULT_NODE_SIZE.height / 2)
      },
      size
    };
  }

  return {
    position: {
      x: normalizeGeometryValue(Math.min(start.x, end.x)),
      y: normalizeGeometryValue(Math.min(start.y, end.y))
    },
    size
  };
}

/**
 * 创建带历史记录的新状态。
 * @param previous - 之前状态
 * @param next - 新快照
 * @returns 新状态
 */
function withHistory(previous: WidgetBoardState, next: WidgetBoardSnapshot): WidgetBoardState {
  return {
    ...next,
    history: {
      past: [...previous.history.past, createSnapshot(previous)],
      future: []
    },
    lastError: undefined
  };
}

/**
 * 创建错误状态。
 * @param state - 原状态
 * @param error - 错误
 * @returns 带错误的新状态
 */
function withError(state: WidgetBoardState, error: Error): WidgetBoardState {
  return {
    ...state,
    history: {
      past: [...state.history.past],
      future: [...state.history.future]
    },
    lastError: error
  };
}

/**
 * 查找并应用元素几何变更。
 * @param state - 当前Widget状态
 * @param changes - 几何变更列表
 * @param applyChange - 单个元素应用逻辑
 * @returns 新Widget状态
 */
function applyGeometryChanges(
  state: WidgetBoardState,
  changes: WidgetGeometryChange[],
  applyChange: (element: WidgetShapeElement, change: WidgetGeometryChange) => void
): WidgetBoardState {
  const nextElements = cloneDeep(state.elements);

  for (const change of changes) {
    const element = nextElements.find((item) => item.id === change.id);
    if (!element) {
      return withError(state, new Error(`找不到元素: ${change.id}`));
    }

    applyChange(element, change);
    element.size = normalizeElementModelSize(element).size;
  }

  return withHistory(state, {
    elements: nextElements,
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 创建初始Widget状态。
 * @param snapshot - 初始快照
 * @returns Widget状态
 */
export function createWidgetBoardState(snapshot?: Partial<WidgetBoardSnapshot>): WidgetBoardState {
  return {
    elements: cloneSupportedElements(snapshot?.elements),
    selection: [...(snapshot?.selection ?? [])],
    viewport: cloneDeep(snapshot?.viewport ?? createDefaultWidgetViewport()),
    draft: cloneDeep(snapshot?.draft),
    history: {
      past: [],
      future: []
    }
  };
}

/**
 * 创建供外部双向绑定和持久化使用的轻量Widget数据。
 * @param snapshot - Widget快照或状态
 * @returns Widget绑定数据
 */
export function createWidgetDataSnapshot(snapshot: Pick<WidgetBoardSnapshot, 'elements' | 'viewport'> & WidgetDataContractCandidate): WidgetData {
  return {
    ...normalizeWidgetDataContract(snapshot),
    elements: cloneSupportedElements(snapshot.elements),
    viewport: cloneDeep(snapshot.viewport)
  };
}

/**
 * 新增一个自由形状元素。
 * @param state - 当前Widget状态
 * @param options - 新形状参数
 * @returns 新Widget状态
 */
export function addWidgetShape(state: WidgetBoardState, options: WidgetAddShapeOptions): WidgetBoardState {
  if (state.elements.some((element) => element.id === options.id)) {
    return withError(state, new Error(`元素已存在: ${options.id}`));
  }

  const style = createShapeInitialStyle(options.style);
  const geometry = createShapeGeometry(options.start, options.end, options.createAnchor);
  const element: WidgetShapeElement = normalizeElementModelSize({
    id: options.id,
    name: options.name,
    label: options.label,
    icon: options.icon,
    title: options.title ?? options.label,
    position: cloneDeep(geometry.position),
    size: cloneDeep(geometry.size),
    rotation: 0,
    style,
    metadata: normalizeElementMetadata(options.metadata)
  });

  return withHistory(state, {
    elements: [...cloneDeep(state.elements), element],
    selection: [element.id],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 撤销Widget操作。
 * @param state - 当前Widget状态
 * @returns 新Widget状态
 */
export function undoWidgetBoard(state: WidgetBoardState): WidgetBoardState {
  const previous = state.history.past.at(-1);
  if (!previous) {
    return state;
  }

  return {
    ...createSnapshot(previous),
    history: {
      past: state.history.past.slice(0, -1),
      future: [createSnapshot(state), ...state.history.future]
    },
    lastError: undefined
  };
}

/**
 * 重做Widget操作。
 * @param state - 当前Widget状态
 * @returns 新Widget状态
 */
export function redoWidgetBoard(state: WidgetBoardState): WidgetBoardState {
  const next = state.history.future[0];
  if (!next) {
    return state;
  }

  return {
    ...createSnapshot(next),
    history: {
      past: [...state.history.past, createSnapshot(state)],
      future: state.history.future.slice(1)
    },
    lastError: undefined
  };
}

/**
 * 移动Widget元素。
 * @param state - 当前Widget状态
 * @param changes - 位置变更
 * @returns 新Widget状态
 */
export function moveWidgetElements(state: WidgetBoardState, changes: WidgetGeometryChange[]): WidgetBoardState {
  return applyGeometryChanges(state, changes, (element: WidgetShapeElement, change: WidgetGeometryChange): void => {
    if (!change.position) {
      return;
    }

    element.position = {
      x: normalizeGeometryValue(change.position.x),
      y: normalizeGeometryValue(change.position.y)
    };
  });
}

/**
 * 缩放Widget元素。
 * @param state - 当前Widget状态
 * @param changes - 尺寸变更
 * @returns 新Widget状态
 */
export function resizeWidgetElements(state: WidgetBoardState, changes: WidgetGeometryChange[]): WidgetBoardState {
  return applyGeometryChanges(state, changes, (element: WidgetShapeElement, change: WidgetGeometryChange): void => {
    if (change.position) {
      element.position = {
        x: normalizeGeometryValue(change.position.x),
        y: normalizeGeometryValue(change.position.y)
      };
    }

    if (change.size) {
      element.size = {
        width: Math.max(WIDGET_MIN_ELEMENT_SIZE.width, normalizeGeometryValue(change.size.width)),
        height: Math.max(WIDGET_MIN_ELEMENT_SIZE.height, normalizeGeometryValue(change.size.height))
      };
    }
  });
}

/**
 * 更新Widget元素样式。
 * @param state - 当前Widget状态
 * @param elementId - 元素 ID
 * @param style - 样式变更
 * @returns 新Widget状态
 */
export function updateWidgetElementStyle(state: WidgetBoardState, elementId: string, style: WidgetElementStyleChange): WidgetBoardState {
  const nextElements = cloneDeep(state.elements);
  const element = nextElements.find((item) => item.id === elementId);
  if (!element) {
    return withError(state, new Error(`找不到元素: ${elementId}`));
  }

  element.style = {
    ...element.style,
    ...style
  };
  element.size = normalizeElementModelSize(element).size;

  return withHistory(state, {
    elements: nextElements,
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 删除当前选中元素。
 * @param state - 当前Widget状态
 * @returns 新Widget状态
 */
export function deleteWidgetSelection(state: WidgetBoardState): WidgetBoardState {
  if (!state.selection.length) {
    return state;
  }

  const selected = new Set(expandWidgetSelectionToGroups(state.elements, state.selection));
  const nextElements = state.elements.filter((element) => !selected.has(element.id));
  return withHistory(state, {
    elements: nextElements,
    selection: [],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 复制当前选区元素。
 * @param state - 当前Widget状态
 * @returns 已复制元素快照
 */
export function copyWidgetSelection(state: WidgetBoardState): WidgetShapeElement[] {
  const selected = new Set(expandWidgetSelectionToGroups(state.elements, state.selection));

  return cloneDeep(state.elements.filter((element: WidgetShapeElement): boolean => selected.has(element.id)));
}

/**
 * 粘贴元素快照。
 * @param state - 当前Widget状态
 * @param elements - 待粘贴元素
 * @param options - 粘贴参数
 * @returns 新Widget状态
 */
export function pasteWidgetElements(state: WidgetBoardState, elements: WidgetShapeElement[], options: WidgetPasteElementsOptions): WidgetBoardState {
  if (!elements.length) {
    return state;
  }

  const delta = getPasteDelta(elements, options);
  const groupIdMap = new Map<string, string>();
  const pastedElements = cloneDeep(elements).map((element: WidgetShapeElement, index: number): WidgetShapeElement => {
    const nextGroupId = getWidgetElementGroupId(element);
    const metadata =
      nextGroupId && options.createGroupId
        ? {
            ...cloneDeep(element.metadata),
            groupId: getPastedGroupId(groupIdMap, nextGroupId, options.createGroupId)
          }
        : cloneDeep(element.metadata);

    return normalizeElementModelSize({
      ...element,
      id: options.createElementId(element, index),
      position: {
        x: normalizeGeometryValue(element.position.x + delta.x),
        y: normalizeGeometryValue(element.position.y + delta.y)
      },
      metadata
    });
  });
  const pastedIds = pastedElements.map((element: WidgetShapeElement): string => element.id);

  if (hasDuplicateElementIds(new Set(state.elements.map((element: WidgetShapeElement): string => element.id)), pastedIds)) {
    return withError(state, new Error('粘贴元素 ID 重复'));
  }

  return withHistory(state, {
    elements: [...cloneDeep(state.elements), ...pastedElements],
    selection: pastedIds,
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 将当前选区合并为组合。
 * @param state - 当前Widget状态
 * @param groupId - 新组合 ID
 * @returns 新Widget状态
 */
export function groupWidgetSelection(state: WidgetBoardState, groupId: string): WidgetBoardState {
  const selection = expandWidgetSelectionToGroups(state.elements, state.selection);
  if (selection.length < 2) {
    return state;
  }

  const selected = new Set(selection);
  const nextElements = cloneDeep(state.elements).map((element: WidgetShapeElement): WidgetShapeElement => {
    if (!selected.has(element.id)) {
      return element;
    }

    return {
      ...element,
      metadata: {
        ...element.metadata,
        groupId
      }
    };
  });

  return withHistory(state, {
    elements: nextElements,
    selection,
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 取消当前选区命中的组合。
 * @param state - 当前Widget状态
 * @returns 新Widget状态
 */
export function ungroupWidgetSelection(state: WidgetBoardState): WidgetBoardState {
  const groupIds = new Set<string>();
  expandWidgetSelectionToGroups(state.elements, state.selection).forEach((elementId: string): void => {
    const element = state.elements.find((item: WidgetShapeElement): boolean => item.id === elementId);
    const groupId = element ? getWidgetElementGroupId(element) : null;
    if (groupId) {
      groupIds.add(groupId);
    }
  });

  if (groupIds.size === 0) {
    return state;
  }

  const nextSelection: string[] = [];
  const nextElements = cloneDeep(state.elements).map((element: WidgetShapeElement): WidgetShapeElement => {
    const groupId = getWidgetElementGroupId(element);
    if (!groupId || !groupIds.has(groupId)) {
      return element;
    }

    nextSelection.push(element.id);
    return {
      ...element,
      metadata: removeElementGroupId(element.metadata)
    };
  });

  return withHistory(state, {
    elements: nextElements,
    selection: nextSelection,
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 更新元素自定义名称。
 * @param state - 当前Widget状态
 * @param elementId - 元素 ID
 * @param title - 新名称
 * @returns 新Widget状态
 */
export function updateWidgetElementTitle(state: WidgetBoardState, elementId: string, title: string): WidgetBoardState {
  const nextElements = cloneDeep(state.elements);
  const element = nextElements.find((item) => item.id === elementId);
  if (!element) {
    return withError(state, new Error(`找不到元素: ${elementId}`));
  }

  element.title = title;
  element.size = normalizeElementModelSize(element).size;

  return withHistory(state, {
    elements: nextElements,
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 调整元素层级顺序。
 * 元素数组中索引越大，渲染层级越高（显示在上层）。
 * @param state - 当前Widget状态
 * @param elementId - 目标元素 ID
 * @param action - 层级操作类型
 * @returns 新Widget状态
 */
export function reorderWidgetElement(state: WidgetBoardState, elementId: string, action: WidgetLayerAction): WidgetBoardState {
  const nextElements = cloneDeep(state.elements);
  const index = nextElements.findIndex((item) => item.id === elementId);
  if (index === -1) {
    return withError(state, new Error(`找不到元素: ${elementId}`));
  }

  const [element] = nextElements.splice(index, 1);

  switch (action) {
    case 'bringToFront': {
      // 移到数组末尾（最顶层）
      nextElements.push(element);
      break;
    }
    case 'bringForward': {
      // 上移一层（索引 +1）
      const targetIndex = Math.min(index + 1, nextElements.length);
      nextElements.splice(targetIndex, 0, element);
      break;
    }
    case 'sendBackward': {
      // 下移一层（索引 -1）
      const targetIndex = Math.max(index - 1, 0);
      nextElements.splice(targetIndex, 0, element);
      break;
    }
    case 'sendToBack': {
      // 移到数组开头（最底层）
      nextElements.unshift(element);
      break;
    }
    default: {
      // 未知操作，放回原位
      nextElements.splice(index, 0, element);
      break;
    }
  }

  return withHistory(state, {
    elements: nextElements,
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 调整当前选区层级顺序。
 * @param state - 当前Widget状态
 * @param action - 层级操作类型
 * @returns 新Widget状态
 */
export function reorderWidgetSelection(state: WidgetBoardState, action: WidgetLayerAction): WidgetBoardState {
  const selection = expandWidgetSelectionToGroups(state.elements, state.selection);
  if (!selection.length) {
    return state;
  }

  const selectedIds = new Set(selection);
  const selectedElements = state.elements.filter((element: WidgetShapeElement): boolean => selectedIds.has(element.id));
  const unselectedElements = state.elements.filter((element: WidgetShapeElement): boolean => !selectedIds.has(element.id));
  let nextElements: WidgetShapeElement[];

  switch (action) {
    case 'bringToFront': {
      nextElements = [...cloneDeep(unselectedElements), ...cloneDeep(selectedElements)];
      break;
    }
    case 'sendToBack': {
      nextElements = [...cloneDeep(selectedElements), ...cloneDeep(unselectedElements)];
      break;
    }
    case 'bringForward': {
      nextElements = bringSelectionForward(state.elements, selectedIds);
      break;
    }
    case 'sendBackward': {
      nextElements = sendSelectionBackward(state.elements, selectedIds);
      break;
    }
    default: {
      nextElements = cloneDeep(state.elements);
      break;
    }
  }

  return withHistory(state, {
    elements: nextElements,
    selection,
    viewport: cloneDeep(state.viewport)
  });
}
