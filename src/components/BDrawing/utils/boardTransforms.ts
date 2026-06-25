/**
 * @file boardTransforms.ts
 * @description BDrawing 画板状态变换、历史记录与元素数据模型。
 */
import type {
  DrawingAddShapeOptions,
  DrawingBoardSnapshot,
  DrawingBoardState,
  DrawingData,
  DrawingElementStyle,
  DrawingElementStyleChange,
  DrawingGeometryChange,
  DrawingLayerAction,
  DrawingPoint,
  DrawingSize,
  DrawingShapeElement,
  DrawingViewport
} from '../types';
import { cloneDeep } from 'lodash-es';
import { DRAWING_DEFAULT_NODE_SIZE, DRAWING_MIN_CREATE_SIZE, DRAWING_MIN_ELEMENT_SIZE } from '../constants/board';
import { DRAWING_DEFAULT_TEXT, DRAWING_TEXT_DEFAULT_FONT_SIZE, DRAWING_TEXT_DEFAULT_FONT_WEIGHT } from '../constants/text';
import { createDrawingTextFitSize, measureDrawingTextElementSize } from './drawingTextMetrics';

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
 * 归一化几何数值，减少 DOM 坐标换算带来的浮点噪声。
 * @param value - 原始数值
 * @returns 归一化数值
 */
function normalizeGeometryValue(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 旧版画板元素快照候选，兼容曾经写入的 kind 与 shape 字段。
 */
type DrawingElementSnapshotCandidate = Partial<Omit<DrawingShapeElement, 'metadata'>> & {
  /** 旧版元素类别 */
  kind?: unknown;
  /** 旧版形状类型 */
  shape?: unknown;
  /** 元信息 */
  metadata?: Partial<DrawingShapeElement['metadata']>;
};

/**
 * 判断坐标点是否可用于画板元素。
 * @param point - 待检查坐标
 * @returns 是否为有效坐标
 */
function isDrawingPointLike(point: DrawingPoint | undefined): point is DrawingPoint {
  return typeof point?.x === 'number' && typeof point.y === 'number';
}

/**
 * 判断尺寸是否可用于画板元素。
 * @param size - 待检查尺寸
 * @returns 是否为有效尺寸
 */
function isDrawingSizeLike(size: DrawingSize | undefined): size is DrawingSize {
  return typeof size?.width === 'number' && typeof size.height === 'number';
}

/**
 * 读取元素注册名称，优先使用新版 name，兼容旧版 shape。
 * @param element - 元素快照候选
 * @returns 元素注册名称，无法读取时返回 null
 */
function readDrawingElementName(element: DrawingElementSnapshotCandidate): string | null {
  if (typeof element.name === 'string') {
    return element.name;
  }

  if (typeof element.shape === 'string') {
    return element.shape;
  }

  return null;
}

/**
 * 创建不包含旧版冗余字段的元素快照。
 * @param element - 元素快照候选
 * @returns 元素快照，无法识别时返回 null
 */
function createSupportedElementSnapshot(element: DrawingElementSnapshotCandidate): DrawingShapeElement | null {
  const name = readDrawingElementName(element);
  if (!name || typeof element.id !== 'string' || !isDrawingPointLike(element.position) || !isDrawingSizeLike(element.size)) {
    return null;
  }

  return {
    id: element.id,
    name,
    text: typeof element.text === 'string' ? element.text : '',
    position: cloneDeep(element.position),
    size: cloneDeep(element.size),
    rotation: typeof element.rotation === 'number' ? element.rotation : 0,
    style: cloneDeep(element.style),
    description: element.description,
    metadata: {
      source: 'user',
      createdAt: typeof element.metadata?.createdAt === 'number' ? element.metadata.createdAt : Date.now(),
      manualSize: cloneDeep(element.metadata?.manualSize)
    }
  };
}

/**
 * 仅保留当前支持的形状元素。
 * @param elements - 输入元素列表
 * @returns 形状元素列表
 */
function cloneSupportedElements(elements: DrawingBoardSnapshot['elements'] | undefined): DrawingShapeElement[] {
  return (elements ?? [])
    .map((element: DrawingElementSnapshotCandidate): DrawingShapeElement | null => createSupportedElementSnapshot(element))
    .filter((element: DrawingShapeElement | null): element is DrawingShapeElement => element !== null);
}

/**
 * 创建画板快照。
 * @param state - 画板状态
 * @returns 快照
 */
function createSnapshot(state: DrawingBoardSnapshot): DrawingBoardSnapshot {
  return {
    elements: cloneSupportedElements(state.elements),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  };
}

/**
 * 获取形状默认文案。
 * @param shape - 形状类型
 * @returns 默认文案
 */
function getShapeDefaultText(name: string): string {
  if (name === 'text') {
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
function createShapeInitialStyle(name: string, style?: DrawingElementStyle): DrawingElementStyle | undefined {
  if (name !== 'text') {
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
 * 读取普通形状的手动基础尺寸。
 * @param element - 形状元素
 * @returns 手动基础尺寸
 */
function getRegularShapeManualSize(element: DrawingShapeElement): DrawingSize {
  return cloneDeep(element.metadata.manualSize ?? element.size);
}

/**
 * 记录普通形状的手动基础尺寸。
 * @param element - 待更新的形状元素
 * @param manualSize - 手动基础尺寸
 */
function setRegularShapeManualSize(element: DrawingShapeElement, manualSize: DrawingSize): void {
  element.metadata = {
    ...element.metadata,
    manualSize: cloneDeep(manualSize)
  };
}

/**
 * 根据 resize 输入推断新的手动基础尺寸。
 * @param element - 待更新的形状元素
 * @param size - resize 输入尺寸
 * @returns 新的手动基础尺寸
 */
function createManualResizeSize(element: DrawingShapeElement, size: DrawingSize): DrawingSize {
  const nextSize = {
    width: Math.max(DRAWING_MIN_ELEMENT_SIZE.width, normalizeGeometryValue(size.width)),
    height: Math.max(DRAWING_MIN_ELEMENT_SIZE.height, normalizeGeometryValue(size.height))
  };
  const currentManualSize = getRegularShapeManualSize(element);
  const isHeightChangedByUser = nextSize.height !== normalizeGeometryValue(element.size.height);

  return {
    width: nextSize.width,
    height: isHeightChangedByUser ? nextSize.height : currentManualSize.height
  };
}

/**
 * 确保普通形状尺寸能容纳换行后的文本内容。
 * @param element - 待更新的形状元素
 */
function fitRegularShapeSizeToText(element: DrawingShapeElement): void {
  if (element.name === 'text' || !element.text) {
    return;
  }

  const manualSize = getRegularShapeManualSize(element);
  setRegularShapeManualSize(element, manualSize);

  element.size = createDrawingTextFitSize(element.text, manualSize, element.style);
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

    applyChange(element, change);
  }

  return withHistory(state, {
    elements: nextElements,
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
    elements: cloneSupportedElements(snapshot?.elements),
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
export function createDrawingDataSnapshot(snapshot: Pick<DrawingBoardSnapshot, 'elements' | 'viewport'>): DrawingData {
  return {
    elements: cloneSupportedElements(snapshot.elements),
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

  const text = options.text ?? getShapeDefaultText(options.name);
  const style = createShapeInitialStyle(options.name, options.style);
  const geometry = options.name === 'text' ? createTextShapeGeometry(options.start, text, style) : createShapeGeometry(options.start, options.end);
  const element: DrawingShapeElement = {
    id: options.id,
    name: options.name,
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
    selection: [element.id],
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
      const manualSize = createManualResizeSize(element, change.size);
      setRegularShapeManualSize(element, manualSize);
      element.size = manualSize;
      fitRegularShapeSizeToText(element);
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
  if (!element) {
    return withError(state, new Error(`找不到元素: ${elementId}`));
  }

  element.style = {
    ...element.style,
    ...style
  };
  if (element.name === 'text') {
    element.size = measureDrawingTextElementSize(element.text, element.style);
  } else {
    fitRegularShapeSizeToText(element);
  }

  return withHistory(state, {
    elements: nextElements,
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
  const nextElements = state.elements.filter((element) => !selected.has(element.id));
  return withHistory(state, {
    elements: nextElements,
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
  if (!node) {
    return withError(state, new Error(`找不到节点: ${nodeId}`));
  }

  node.text = text;
  if (node.name === 'text') {
    node.size = measureDrawingTextElementSize(text, node.style);
  } else {
    fitRegularShapeSizeToText(node);
  }

  return withHistory(state, {
    elements: nextElements,
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
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}
