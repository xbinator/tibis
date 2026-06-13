/**
 * @file boardTransforms.ts
 * @description BDrawing 画板状态变换、历史记录与元素数据模型。
 */
import type {
  DrawingAddConnectorOptions,
  DrawingAddShapeOptions,
  DrawingBoardSnapshot,
  DrawingBoardState,
  DrawingConnectorElement,
  DrawingConnectorOptionsChange,
  DrawingData,
  DrawingElementStyle,
  DrawingElementStyleChange,
  DrawingGeometryChange,
  DrawingLayerAction,
  DrawingPoint,
  DrawingSize,
  DrawingShapeElement,
  DrawingShapeType,
  DrawingViewport
} from '../types';
import { cloneDeep } from 'lodash-es';
import { DRAWING_DEFAULT_NODE_SIZE, DRAWING_DEFAULT_TEXT, DRAWING_MIN_CREATE_SIZE, DRAWING_MIN_ELEMENT_SIZE } from '../constants/defaults';
import { isDrawingConnectorElement, isDrawingShapeElement } from './drawingGeometry';
import { DRAWING_TEXT_DEFAULT_FONT_SIZE, DRAWING_TEXT_DEFAULT_FONT_WEIGHT, measureDrawingTextElementSize } from './drawingTextMetrics';

export {
  DRAWING_TEXT_DEFAULT_FONT_SIZE,
  DRAWING_TEXT_DEFAULT_FONT_WEIGHT,
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_RATIO,
  DRAWING_TEXT_VERTICAL_PADDING,
  measureDrawingTextElementSize
} from './drawingTextMetrics';

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
 * 归一化几何数值，减少 DOM 坐标换算带来的浮点噪声。
 * @param value - 原始数值
 * @returns 归一化数值
 */
function normalizeGeometryValue(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 获取形状默认文案。
 * @param shape - 形状类型
 * @returns 默认文案
 */
function getShapeDefaultText(shape: DrawingShapeType): string {
  if (shape === 'text') {
    return DRAWING_DEFAULT_TEXT;
  }

  return '';
}

/**
 * 创建文本形状几何信息。
 * @param start - 创建起点
 * @param text - 文本内容
 * @param style - 文本样式
 * @returns 文本形状几何信息
 */
function createTextShapeGeometry(start: DrawingPoint, text: string, style?: DrawingElementStyle): { position: DrawingPoint; size: DrawingSize } {
  return {
    position: {
      x: normalizeGeometryValue(start.x),
      y: normalizeGeometryValue(start.y)
    },
    size: measureDrawingTextElementSize(text, style)
  };
}

/**
 * 创建形状初始样式。
 * @param shape - 形状类型
 * @param style - 外部传入样式
 * @returns 初始样式
 */
function createShapeInitialStyle(shape: DrawingShapeType, style?: DrawingElementStyle): DrawingElementStyle | undefined {
  if (shape !== 'text') {
    return cloneDeep(style);
  }

  return {
    fill: 'transparent',
    stroke: 'transparent',
    fontSize: DRAWING_TEXT_DEFAULT_FONT_SIZE,
    fontWeight: DRAWING_TEXT_DEFAULT_FONT_WEIGHT,
    textAlign: 'center',
    ...cloneDeep(style)
  };
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
 * 创建供外部双向绑定和持久化使用的轻量画板数据。
 * @param snapshot - 画板快照或状态
 * @returns 画板绑定数据
 */
export function createDrawingDataSnapshot(snapshot: Pick<DrawingBoardSnapshot, 'elements' | 'edges' | 'viewport'>): DrawingData {
  return {
    elements: cloneDeep(snapshot.elements),
    edges: cloneDeep(snapshot.edges),
    viewport: cloneDeep(snapshot.viewport)
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

  const text = options.text ?? getShapeDefaultText(options.shape);
  const style = createShapeInitialStyle(options.shape, options.style);
  const geometry = options.shape === 'text' ? createTextShapeGeometry(options.start, text, style) : createShapeGeometry(options.start, options.end);
  const element: DrawingShapeElement = {
    id: options.id,
    kind: 'shape',
    shape: options.shape,
    text,
    position: cloneDeep(geometry.position),
    size: cloneDeep(geometry.size),
    rotation: 0,
    style,
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
  if (isDrawingShapeElement(element) && element.shape === 'text') {
    element.size = measureDrawingTextElementSize(element.text, element.style);
  }

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
  if (node.shape === 'text') {
    node.size = measureDrawingTextElementSize(text, node.style);
  }

  return withHistory(state, {
    elements: nextElements,
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 调整元素层级顺序。
 * 元素数组中索引越大，渲染层级越高（显示在上层）。
 * @param state - 当前画板状态
 * @param elementId - 目标元素 ID
 * @param action - 层级操作类型
 * @returns 新画板状态
 */
export function reorderDrawingElement(state: DrawingBoardState, elementId: string, action: DrawingLayerAction): DrawingBoardState {
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
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}
