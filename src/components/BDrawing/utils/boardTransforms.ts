/**
 * @file boardTransforms.ts
 * @description BDrawing 画板状态变换、历史记录与元素数据模型。
 */
import type {
  DrawingAddConnectorOptions,
  DrawingAddNodeOptions,
  DrawingAddShapeOptions,
  DrawingBoardSnapshot,
  DrawingBoardState,
  DrawingConnectorElement,
  DrawingConnectorOptionsChange,
  DrawingElementStyleChange,
  DrawingGeometryChange,
  DrawingPoint,
  DrawingSize,
  DrawingShapeElement,
  DrawingShapeType,
  DrawingViewport
} from '../types';
import { cloneDeep } from 'lodash-es';
import {
  DRAWING_DEFAULT_NODE_SIZE,
  DRAWING_MIN_CREATE_SIZE,
  DRAWING_MIN_ELEMENT_SIZE,
  DRAWING_NODE_TYPE_TEXT,
  DRAWING_SHAPE_TYPE_TEXT
} from '../constants/defaults';
import { isDrawingConnectorElement, isDrawingShapeElement } from './drawingGeometry';

/**
 * 创建默认视口。
 * @returns 默认视口
 */
function createDefaultViewport(): DrawingViewport {
  return {
    center: { x: 0, y: 0 },
    zoom: 1
  };
}

/**
 * 创建画板快照。
 * @param state - 画板状态
 * @returns 快照
 */
function createSnapshot(state: DrawingBoardSnapshot): DrawingBoardSnapshot {
  return {
    elements: cloneDeep(state.elements),
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  };
}

/**
 * 将旧节点类型转换为自由形状类型。
 * @param type - 旧节点类型
 * @returns 形状类型
 */
function nodeTypeToShape(type: DrawingAddNodeOptions['type']): DrawingShapeType {
  return type === 'decision' ? 'diamond' : type;
}

/**
 * 获取形状默认文案。
 * @param shape - 形状类型
 * @returns 默认文案
 */
function getShapeDefaultText(shape: DrawingShapeType): string {
  if (shape in DRAWING_SHAPE_TYPE_TEXT) {
    return DRAWING_SHAPE_TYPE_TEXT[shape as keyof typeof DRAWING_SHAPE_TYPE_TEXT];
  }

  return DRAWING_NODE_TYPE_TEXT[shape as keyof typeof DRAWING_NODE_TYPE_TEXT];
}

/**
 * 归一化几何数值，减少 DOM 坐标换算带来的浮点噪声。
 * @param value - 原始数值
 * @returns 归一化数值
 */
function normalizeGeometryValue(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 归一化旋转角度到 0 到 360 度之间。
 * @param rotation - 原始角度
 * @returns 归一化后的角度
 */
function normalizeRotation(rotation: number): number {
  return normalizeGeometryValue(((rotation % 360) + 360) % 360);
}

/**
 * 根据拖拽起止点计算形状几何。
 * @param start - 拖拽起点
 * @param end - 拖拽终点
 * @returns 归一化后的元素位置和尺寸
 */
function createShapeGeometry(start: DrawingPoint, end: DrawingPoint): { position: DrawingPoint; size: DrawingSize } {
  const width = normalizeGeometryValue(Math.abs(end.x - start.x));
  const height = normalizeGeometryValue(Math.abs(end.y - start.y));
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };

  if (width < DRAWING_MIN_CREATE_SIZE || height < DRAWING_MIN_CREATE_SIZE) {
    return {
      position: {
        x: normalizeGeometryValue(center.x - DRAWING_DEFAULT_NODE_SIZE.width / 2),
        y: normalizeGeometryValue(center.y - DRAWING_DEFAULT_NODE_SIZE.height / 2)
      },
      size: DRAWING_DEFAULT_NODE_SIZE
    };
  }

  return {
    position: {
      x: normalizeGeometryValue(Math.min(start.x, end.x)),
      y: normalizeGeometryValue(Math.min(start.y, end.y))
    },
    size: {
      width,
      height
    }
  };
}

/**
 * 创建带历史记录的新状态。
 * @param previous - 之前状态
 * @param next - 新快照
 * @returns 新状态
 */
function withHistory(previous: DrawingBoardState, next: DrawingBoardSnapshot): DrawingBoardState {
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
function withError(state: DrawingBoardState, error: Error): DrawingBoardState {
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
 * @param state - 当前画板状态
 * @param changes - 几何变更列表
 * @param applyChange - 单个元素应用逻辑
 * @returns 新画板状态
 */
function applyGeometryChanges(
  state: DrawingBoardState,
  changes: DrawingGeometryChange[],
  applyChange: (element: DrawingShapeElement, change: DrawingGeometryChange) => void
): DrawingBoardState {
  const nextElements = cloneDeep(state.elements);

  for (const change of changes) {
    const element = nextElements.find((item) => item.id === change.id);
    if (!element) {
      return withError(state, new Error(`找不到元素: ${change.id}`));
    }
    if (element.kind !== 'shape') {
      return withError(state, new Error(`元素不支持几何变换: ${change.id}`));
    }

    applyChange(element, change);
  }

  return withHistory(state, {
    elements: nextElements,
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 创建初始画板状态。
 * @param snapshot - 初始快照
 * @returns 画板状态
 */
export function createDrawingBoardState(snapshot?: Partial<DrawingBoardSnapshot>): DrawingBoardState {
  return {
    elements: cloneDeep(snapshot?.elements ?? []),
    edges: cloneDeep(snapshot?.edges ?? []),
    selection: [...(snapshot?.selection ?? [])],
    viewport: cloneDeep(snapshot?.viewport ?? createDefaultViewport()),
    draft: cloneDeep(snapshot?.draft),
    history: {
      past: [],
      future: []
    }
  };
}

/**
 * 新增一个自由形状元素。
 * @param state - 当前画板状态
 * @param options - 新形状参数
 * @returns 新画板状态
 */
export function addDrawingShape(state: DrawingBoardState, options: DrawingAddShapeOptions): DrawingBoardState {
  if (state.elements.some((element) => element.id === options.id)) {
    return withError(state, new Error(`元素已存在: ${options.id}`));
  }

  const geometry = createShapeGeometry(options.start, options.end);
  const element: DrawingShapeElement = {
    id: options.id,
    kind: 'shape',
    shape: options.shape,
    text: options.text ?? getShapeDefaultText(options.shape),
    position: cloneDeep(geometry.position),
    size: cloneDeep(geometry.size),
    rotation: 0,
    style: cloneDeep(options.style),
    metadata: {
      source: 'user',
      createdAt: options.createdAt ?? Date.now()
    }
  };

  return withHistory(state, {
    elements: [...cloneDeep(state.elements), element],
    edges: cloneDeep(state.edges),
    selection: [element.id],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 新增一个手动画板节点。
 * @param state - 当前画板状态
 * @param options - 新节点参数
 * @returns 新画板状态
 */
export function addDrawingNode(state: DrawingBoardState, options: DrawingAddNodeOptions): DrawingBoardState {
  if (state.elements.some((element) => element.id === options.id)) {
    return withError(state, new Error(`节点已存在: ${options.id}`));
  }

  const node: DrawingShapeElement = {
    id: options.id,
    kind: 'shape',
    shape: nodeTypeToShape(options.type),
    text: options.text ?? DRAWING_NODE_TYPE_TEXT[options.type],
    description: options.description,
    position: cloneDeep(options.position ?? state.viewport.center),
    size: cloneDeep(options.size ?? DRAWING_DEFAULT_NODE_SIZE),
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: options.createdAt ?? Date.now()
    }
  };

  return withHistory(state, {
    elements: [...cloneDeep(state.elements), node],
    edges: cloneDeep(state.edges),
    selection: [node.id],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 新增一个连接线元素。
 * @param state - 当前画板状态
 * @param options - 新连接线参数
 * @returns 新画板状态
 */
export function addDrawingConnector(state: DrawingBoardState, options: DrawingAddConnectorOptions): DrawingBoardState {
  if (state.elements.some((element) => element.id === options.id)) {
    return withError(state, new Error(`元素已存在: ${options.id}`));
  }

  const source = state.elements.find((element) => element.id === options.sourceId);
  const target = state.elements.find((element) => element.id === options.targetId);
  if (!source || !isDrawingShapeElement(source)) {
    return withError(state, new Error(`找不到连接起点: ${options.sourceId}`));
  }
  if (!target || !isDrawingShapeElement(target)) {
    return withError(state, new Error(`找不到连接目标: ${options.targetId}`));
  }
  if (source.id === target.id) {
    return withError(state, new Error('连接线起点和终点不能相同'));
  }

  const connector: DrawingConnectorElement = {
    id: options.id,
    kind: 'connector',
    source: {
      elementId: options.sourceId,
      anchor: options.sourceAnchor ?? 'center'
    },
    target: {
      elementId: options.targetId,
      anchor: options.targetAnchor ?? 'center'
    },
    style: cloneDeep(options.style),
    markerStart: options.markerStart,
    markerEnd: options.markerEnd,
    curve: options.curve,
    label: options.label,
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: options.createdAt ?? Date.now()
    }
  };

  return withHistory(state, {
    elements: [...cloneDeep(state.elements), connector],
    edges: cloneDeep(state.edges),
    selection: [connector.id],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 撤销画板操作。
 * @param state - 当前画板状态
 * @returns 新画板状态
 */
export function undoDrawingBoard(state: DrawingBoardState): DrawingBoardState {
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
 * 重做画板操作。
 * @param state - 当前画板状态
 * @returns 新画板状态
 */
export function redoDrawingBoard(state: DrawingBoardState): DrawingBoardState {
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
 * 移动画板元素。
 * @param state - 当前画板状态
 * @param changes - 位置变更
 * @returns 新画板状态
 */
export function moveDrawingElements(state: DrawingBoardState, changes: DrawingGeometryChange[]): DrawingBoardState {
  return applyGeometryChanges(state, changes, (element: DrawingShapeElement, change: DrawingGeometryChange): void => {
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
 * 移动画板节点。
 * @param state - 当前画板状态
 * @param nodeId - 节点 ID
 * @param delta - 移动增量
 * @returns 新画板状态
 */
export function moveDrawingNode(state: DrawingBoardState, nodeId: string, delta: DrawingPoint): DrawingBoardState {
  const node = state.elements.find((item) => item.id === nodeId);
  if (!node || !isDrawingShapeElement(node)) {
    return withError(state, new Error(`找不到节点: ${nodeId}`));
  }

  return moveDrawingElements(state, [
    {
      id: nodeId,
      position: {
        x: node.position.x + delta.x,
        y: node.position.y + delta.y
      }
    }
  ]);
}

/**
 * 缩放画板元素。
 * @param state - 当前画板状态
 * @param changes - 尺寸变更
 * @returns 新画板状态
 */
export function resizeDrawingElements(state: DrawingBoardState, changes: DrawingGeometryChange[]): DrawingBoardState {
  return applyGeometryChanges(state, changes, (element: DrawingShapeElement, change: DrawingGeometryChange): void => {
    if (change.position) {
      element.position = {
        x: normalizeGeometryValue(change.position.x),
        y: normalizeGeometryValue(change.position.y)
      };
    }

    if (change.size) {
      element.size = {
        width: Math.max(DRAWING_MIN_ELEMENT_SIZE.width, normalizeGeometryValue(change.size.width)),
        height: Math.max(DRAWING_MIN_ELEMENT_SIZE.height, normalizeGeometryValue(change.size.height))
      };
    }
  });
}

/**
 * 旋转画板元素。
 * @param state - 当前画板状态
 * @param changes - 旋转变更
 * @returns 新画板状态
 */
export function rotateDrawingElements(state: DrawingBoardState, changes: DrawingGeometryChange[]): DrawingBoardState {
  return applyGeometryChanges(state, changes, (element: DrawingShapeElement, change: DrawingGeometryChange): void => {
    if (change.rotation === undefined) {
      return;
    }

    element.rotation = normalizeRotation(change.rotation);
  });
}

/**
 * 更新画板元素样式。
 * @param state - 当前画板状态
 * @param elementId - 元素 ID
 * @param style - 样式变更
 * @returns 新画板状态
 */
export function updateDrawingElementStyle(state: DrawingBoardState, elementId: string, style: DrawingElementStyleChange): DrawingBoardState {
  const nextElements = cloneDeep(state.elements);
  const element = nextElements.find((item) => item.id === elementId);
  if (!element || (!isDrawingShapeElement(element) && !isDrawingConnectorElement(element))) {
    return withError(state, new Error(`找不到元素: ${elementId}`));
  }

  element.style = {
    ...element.style,
    ...style
  };

  return withHistory(state, {
    elements: nextElements,
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 更新连接线配置。
 * @param state - 当前画板状态
 * @param connectorId - 连接线 ID
 * @param options - 连接线配置变更
 * @returns 新画板状态
 */
export function updateDrawingConnectorOptions(state: DrawingBoardState, connectorId: string, options: DrawingConnectorOptionsChange): DrawingBoardState {
  const nextElements = cloneDeep(state.elements);
  const connector = nextElements.find((item) => item.id === connectorId);
  if (!connector || !isDrawingConnectorElement(connector)) {
    return withError(state, new Error(`找不到连接线: ${connectorId}`));
  }

  connector.markerStart = options.markerStart ?? connector.markerStart;
  connector.markerEnd = options.markerEnd ?? connector.markerEnd;
  connector.curve = options.curve ?? connector.curve;

  return withHistory(state, {
    elements: nextElements,
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 删除当前选中元素。
 * @param state - 当前画板状态
 * @returns 新画板状态
 */
export function deleteDrawingSelection(state: DrawingBoardState): DrawingBoardState {
  if (!state.selection.length) {
    return state;
  }

  const selected = new Set(state.selection);
  const selectedShapeIds = new Set(state.elements.filter((element) => selected.has(element.id) && isDrawingShapeElement(element)).map((element) => element.id));
  const nextElements = state.elements.filter((element) => {
    if (selected.has(element.id)) {
      return false;
    }
    if (isDrawingConnectorElement(element)) {
      return !selectedShapeIds.has(element.source.elementId) && !selectedShapeIds.has(element.target.elementId);
    }

    return true;
  });
  const nextEdges = state.edges.filter((edge) => !selected.has(edge.id) && !selected.has(edge.sourceId) && !selected.has(edge.targetId));

  return withHistory(state, {
    elements: nextElements,
    edges: nextEdges,
    selection: [],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 更新节点文本。
 * @param state - 当前画板状态
 * @param nodeId - 节点 ID
 * @param text - 新文本
 * @returns 新画板状态
 */
export function updateDrawingNodeText(state: DrawingBoardState, nodeId: string, text: string): DrawingBoardState {
  const nextElements = cloneDeep(state.elements);
  const node = nextElements.find((item) => item.id === nodeId);
  if (!node || !isDrawingShapeElement(node)) {
    return withError(state, new Error(`找不到节点: ${nodeId}`));
  }

  node.text = text;

  return withHistory(state, {
    elements: nextElements,
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}
