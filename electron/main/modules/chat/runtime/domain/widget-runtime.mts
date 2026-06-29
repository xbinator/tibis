/**
 * @file widget-runtime.mts
 * @description ChatRuntime 主进程 Widget 工具纯逻辑。
 */
import { cloneDeep } from 'lodash-es';

/** Widget坐标点。 */
export interface WidgetPoint {
  /** 横坐标。 */
  x: number;
  /** 纵坐标。 */
  y: number;
}

/** Widget尺寸。 */
export interface WidgetSize {
  /** 宽度。 */
  width: number;
  /** 高度。 */
  height: number;
}

/** Widget形状类型。 */
export type WidgetShapeType = 'process' | 'decision' | 'actor' | 'service' | 'database' | 'text' | 'rect' | 'ellipse' | 'diamond';

/** Widget连接锚点。 */
export type WidgetConnectorAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center';

/** Widget元素样式。 */
export interface WidgetElementStyle {
  /** 填充色。 */
  fill?: string;
  /** 描边色。 */
  stroke?: string;
  /** 描边宽度。 */
  strokeWidth?: number;
  /** 文字颜色。 */
  color?: string;
  /** 文字字号。 */
  fontSize?: number;
  /** 文字字重。 */
  fontWeight?: number;
  /** 文字水平对齐。 */
  textAlign?: 'left' | 'center' | 'right';
  /** 文字垂直对齐。 */
  textVerticalAlign?: 'top' | 'middle' | 'bottom';
  /** 透明度。 */
  opacity?: number;
}

/** Widget元素元信息。 */
interface WidgetElementMetadata {
  /** 元素来源。 */
  source: 'user';
  /** 创建时间戳。 */
  createdAt: number;
}

/** Widget元素基础结构。 */
interface WidgetElementBase {
  /** 元素 ID。 */
  id: string;
  /** 元素位置。 */
  position: WidgetPoint;
  /** 元素尺寸。 */
  size: WidgetSize;
  /** 元素旋转角度。 */
  rotation: number;
  /** 元素样式。 */
  style?: WidgetElementStyle;
  /** 元信息。 */
  metadata: WidgetElementMetadata;
}

/** Widget形状元素。 */
export interface WidgetShapeElement extends WidgetElementBase {
  /** 元素类别。 */
  kind: 'shape';
  /** 形状类型。 */
  shape: WidgetShapeType;
  /** 主文本。 */
  text: string;
}

/** 连接线绑定端点。 */
interface WidgetConnectorElementEndpoint {
  /** 端点元素 ID。 */
  elementId: string;
  /** 端点锚点。 */
  anchor: WidgetConnectorAnchor;
}

/** 连接线点位端点。 */
interface WidgetConnectorPointEndpoint {
  /** 端点坐标。 */
  point: WidgetPoint;
}

/** 连接线端点。 */
type WidgetConnectorEndpoint = WidgetConnectorElementEndpoint | WidgetConnectorPointEndpoint;

/** Widget连接线元素。 */
export interface WidgetConnectorElement extends WidgetElementBase {
  /** 元素类别。 */
  kind: 'connector';
  /** 起点。 */
  source: WidgetConnectorEndpoint;
  /** 终点。 */
  target: WidgetConnectorEndpoint;
  /** 终点标记。 */
  markerEnd?: 'none' | 'arrow';
  /** 连线标签。 */
  label?: string;
}

/** Widget元素。 */
type WidgetElement = WidgetShapeElement | WidgetConnectorElement;

/** Widget数据。 */
export interface WidgetData {
  /** 元素数据。 */
  elements: WidgetElement[];
  /** 旧版 edge 占位。 */
  edges: unknown[];
  /** 视口状态。 */
  viewport: {
    /** 视口中心点。 */
    center: WidgetPoint;
    /** 缩放比例。 */
    zoom: number;
  };
}

/** 新增形状操作。 */
interface AddWidgetShapeOperation {
  /** 操作类型。 */
  type: 'add_shape';
  /** 可选元素 ID。 */
  id?: string;
  /** 形状类型。 */
  shape: WidgetShapeType;
  /** 节点文本。 */
  text?: string;
  /** 元素位置。 */
  position: WidgetPoint;
  /** 元素尺寸。 */
  size?: WidgetSize;
  /** 元素样式。 */
  style?: WidgetElementStyle;
}

/** 更新形状文本操作。 */
interface UpdateWidgetShapeTextOperation {
  /** 操作类型。 */
  type: 'update_shape_text';
  /** 目标元素 ID。 */
  id: string;
  /** 新文本。 */
  text: string;
}

/** 移动形状操作。 */
interface MoveWidgetShapeOperation {
  /** 操作类型。 */
  type: 'move_shape';
  /** 目标元素 ID。 */
  id: string;
  /** 新位置。 */
  position: WidgetPoint;
}

/** 新增连接线操作。 */
interface AddWidgetConnectorOperation {
  /** 操作类型。 */
  type: 'add_connector';
  /** 可选连接线 ID。 */
  id?: string;
  /** 起点形状 ID。 */
  sourceId: string;
  /** 终点形状 ID。 */
  targetId: string;
  /** 起点锚点。 */
  sourceAnchor?: WidgetConnectorAnchor;
  /** 终点锚点。 */
  targetAnchor?: WidgetConnectorAnchor;
  /** 连线标签。 */
  label?: string;
  /** 连线样式。 */
  style?: WidgetElementStyle;
}

/** 删除元素操作。 */
interface DeleteWidgetElementOperation {
  /** 操作类型。 */
  type: 'delete_element';
  /** 待删除元素 ID。 */
  id: string;
}

/** Widget操作。 */
type WidgetOperation =
  | AddWidgetShapeOperation
  | UpdateWidgetShapeTextOperation
  | MoveWidgetShapeOperation
  | AddWidgetConnectorOperation
  | DeleteWidgetElementOperation;

/** Widget操作应用结果。 */
type WidgetOperationApplyResult = { ok: true } | { ok: false; message: string };

/** Widget批量操作应用结果。 */
export type WidgetOperationsApplyResult = { ok: true; data: WidgetData; appliedOperations: number } | { ok: false; message: string };

/** AI 自动创建形状的 ID 前缀。 */
const AI_SHAPE_ID_PREFIX = 'widget-ai-shape';
/** AI 自动创建连接线的 ID 前缀。 */
const AI_CONNECTOR_ID_PREFIX = 'widget-ai-connector';
/** AI 支持创建的形状类型。 */
const SUPPORTED_WIDGET_SHAPES: readonly WidgetShapeType[] = ['process', 'decision', 'actor', 'service', 'database', 'text', 'rect', 'ellipse', 'diamond'];
/** AI 支持使用的连接线锚点。 */
const SUPPORTED_CONNECTOR_ANCHORS: readonly WidgetConnectorAnchor[] = ['top', 'right', 'bottom', 'left', 'center'];

/**
 * 判断值是否为对象记录。
 * @param value - 待判断值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断值是否为有限数字。
 * @param value - 待判断值
 * @returns 是否为有限数字
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 判断值是否为Widget坐标点。
 * @param value - 待判断值
 * @returns 是否为Widget坐标点
 */
function isWidgetPoint(value: unknown): value is WidgetPoint {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

/**
 * 判断值是否为Widget尺寸。
 * @param value - 待判断值
 * @returns 是否为Widget尺寸
 */
function isWidgetSize(value: unknown): value is WidgetSize {
  return isRecord(value) && isFiniteNumber(value.width) && isFiniteNumber(value.height) && value.width >= 0 && value.height >= 0;
}

/**
 * 判断值是否为Widget形状类型。
 * @param value - 待判断值
 * @returns 是否为Widget形状类型
 */
function isWidgetShapeType(value: unknown): value is WidgetShapeType {
  return typeof value === 'string' && SUPPORTED_WIDGET_SHAPES.includes(value as WidgetShapeType);
}

/**
 * 判断值是否为连接线锚点。
 * @param value - 待判断值
 * @returns 是否为连接线锚点
 */
function isWidgetConnectorAnchor(value: unknown): value is WidgetConnectorAnchor {
  return typeof value === 'string' && SUPPORTED_CONNECTOR_ANCHORS.includes(value as WidgetConnectorAnchor);
}

/**
 * 判断值是否为可选样式对象。
 * @param value - 待判断值
 * @returns 是否为可选样式对象
 */
function isOptionalWidgetStyle(value: unknown): value is WidgetElementStyle | undefined {
  return value === undefined || isRecord(value);
}

/**
 * 创建空Widget数据。
 * @returns 空Widget数据
 */
export function createEmptyWidgetData(): WidgetData {
  return {
    elements: [],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建 .tibis Widget草稿内容。
 * @param data - Widget数据
 * @returns .tibis JSON 内容
 */
export function createWidgetDraftContent(data: WidgetData): string {
  return JSON.stringify({ type: 'widget', version: 1, ...data }, null, 2);
}

/**
 * 规范化Widget标题。
 * @param value - 原始标题
 * @returns 可用标题
 */
export function normalizeWidgetTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  return title || 'Untitled';
}

/**
 * 创建Widget草稿工具结果。
 * @param draft - 草稿创建结果
 * @param data - Widget数据
 * @returns 工具结果载荷
 */
export function createWidgetDraftResult(draft: { file: { id: string; name: string }; unsavedPath: string }, data: WidgetData): Record<string, unknown> {
  return {
    id: draft.file.id,
    title: draft.file.name,
    path: draft.unsavedPath,
    data: cloneDeep(data)
  };
}

/**
 * 判断元素是否为形状元素。
 * @param element - Widget元素
 * @returns 是否为形状元素
 */
function isWidgetShapeElement(element: WidgetElement): element is WidgetShapeElement {
  return element.kind === 'shape';
}

/**
 * 判断元素是否为连接线元素。
 * @param element - Widget元素
 * @returns 是否为连接线元素
 */
function isWidgetConnectorElement(element: WidgetElement): element is WidgetConnectorElement {
  return element.kind === 'connector';
}

/**
 * 读取连接线端点绑定的元素 ID。
 * @param endpoint - 连接线端点
 * @returns 元素 ID，点位端点返回 null
 */
function getConnectorEndpointElementId(endpoint: WidgetConnectorEndpoint): string | null {
  return 'elementId' in endpoint ? endpoint.elementId : null;
}

/**
 * 收集当前Widget已占用的元素 ID。
 * @param data - 当前Widget数据
 * @returns 已占用 ID 集合
 */
function createUsedWidgetIds(data: WidgetData): Set<string> {
  return new Set(data.elements.map((element) => element.id));
}

/**
 * 创建唯一元素 ID。
 * @param prefix - ID 前缀
 * @param usedIds - 已占用 ID 集合
 * @returns 新 ID
 */
function createUniqueWidgetId(prefix: string, usedIds: Set<string>): string {
  let index = 1;
  let id = `${prefix}-${index}`;
  while (usedIds.has(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  usedIds.add(id);
  return id;
}

/**
 * 解析操作 ID。
 * @param id - 外部传入 ID
 * @param prefix - 自动 ID 前缀
 * @param usedIds - 已占用 ID 集合
 * @returns 可用 ID 或错误
 */
function resolveWidgetOperationId(id: string | undefined, prefix: string, usedIds: Set<string>): { ok: true; id: string } | { ok: false; message: string } {
  if (!id) return { ok: true, id: createUniqueWidgetId(prefix, usedIds) };
  if (usedIds.has(id)) return { ok: false, message: `元素已存在: ${id}` };
  usedIds.add(id);
  return { ok: true, id };
}

/**
 * 查找Widget形状元素。
 * @param data - 当前Widget数据
 * @param id - 元素 ID
 * @returns 形状元素，不存在时返回 null
 */
function findWidgetShape(data: WidgetData, id: string): WidgetShapeElement | null {
  const element = data.elements.find((item) => item.id === id);
  return element && isWidgetShapeElement(element) ? element : null;
}

/**
 * 读取形状中心点。
 * @param shape - 形状元素
 * @returns 形状中心点
 */
function getShapeCenter(shape: WidgetShapeElement): WidgetPoint {
  return { x: shape.position.x + shape.size.width / 2, y: shape.position.y + shape.size.height / 2 };
}

/**
 * 推断连接锚点。
 * @param sourceShape - 起点形状
 * @param targetShape - 终点形状
 * @returns 起终点锚点
 */
function inferConnectorAnchors(
  sourceShape: WidgetShapeElement,
  targetShape: WidgetShapeElement
): { sourceAnchor: WidgetConnectorAnchor; targetAnchor: WidgetConnectorAnchor } {
  const sourceCenter = getShapeCenter(sourceShape);
  const targetCenter = getShapeCenter(targetShape);
  const dx = Math.abs(targetCenter.x - sourceCenter.x);
  const dy = Math.abs(targetCenter.y - sourceCenter.y);
  if (dx >= dy) {
    return targetCenter.x >= sourceCenter.x ? { sourceAnchor: 'right', targetAnchor: 'left' } : { sourceAnchor: 'left', targetAnchor: 'right' };
  }
  return targetCenter.y >= sourceCenter.y ? { sourceAnchor: 'bottom', targetAnchor: 'top' } : { sourceAnchor: 'top', targetAnchor: 'bottom' };
}

/**
 * 创建形状元素。
 * @param operation - 新增形状操作
 * @param id - 元素 ID
 * @returns 形状元素
 */
function createShapeElementFromOperation(operation: AddWidgetShapeOperation, id: string): WidgetShapeElement {
  return {
    id,
    kind: 'shape',
    shape: operation.shape,
    text: operation.text ?? '',
    position: cloneDeep(operation.position),
    size: cloneDeep(operation.size ?? { width: 180, height: 72 }),
    rotation: 0,
    style: cloneDeep(operation.style),
    metadata: { source: 'user', createdAt: Date.now() }
  };
}

/**
 * 创建连接线元素。
 * @param operation - 新增连接线操作
 * @param id - 连接线 ID
 * @param anchors - 推断锚点
 * @returns 连接线元素
 */
function createConnectorElementFromOperation(
  operation: AddWidgetConnectorOperation,
  id: string,
  anchors: { sourceAnchor: WidgetConnectorAnchor; targetAnchor: WidgetConnectorAnchor }
): WidgetConnectorElement {
  return {
    id,
    kind: 'connector',
    source: { elementId: operation.sourceId, anchor: operation.sourceAnchor ?? anchors.sourceAnchor },
    target: { elementId: operation.targetId, anchor: operation.targetAnchor ?? anchors.targetAnchor },
    markerEnd: 'arrow',
    label: operation.label,
    style: cloneDeep(operation.style),
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    rotation: 0,
    metadata: { source: 'user', createdAt: Date.now() }
  };
}

/**
 * 解析原始操作输入。
 * @param value - 原始操作输入
 * @returns Widget操作或错误信息
 */
function parseWidgetOperation(value: unknown): { ok: true; operation: WidgetOperation } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: 'operation 必须是对象' };
  if (
    value.type === 'add_shape' &&
    (value.id === undefined || typeof value.id === 'string') &&
    isWidgetShapeType(value.shape) &&
    (value.text === undefined || typeof value.text === 'string') &&
    isWidgetPoint(value.position) &&
    (value.size === undefined || isWidgetSize(value.size)) &&
    isOptionalWidgetStyle(value.style)
  ) {
    return { ok: true, operation: value as unknown as AddWidgetShapeOperation };
  }
  if (value.type === 'update_shape_text' && typeof value.id === 'string' && typeof value.text === 'string') {
    return { ok: true, operation: value as unknown as UpdateWidgetShapeTextOperation };
  }
  if (value.type === 'move_shape' && typeof value.id === 'string' && isWidgetPoint(value.position)) {
    return { ok: true, operation: value as unknown as MoveWidgetShapeOperation };
  }
  if (
    value.type === 'add_connector' &&
    (value.id === undefined || typeof value.id === 'string') &&
    typeof value.sourceId === 'string' &&
    typeof value.targetId === 'string' &&
    (value.sourceAnchor === undefined || isWidgetConnectorAnchor(value.sourceAnchor)) &&
    (value.targetAnchor === undefined || isWidgetConnectorAnchor(value.targetAnchor)) &&
    (value.label === undefined || typeof value.label === 'string') &&
    isOptionalWidgetStyle(value.style)
  ) {
    return { ok: true, operation: value as unknown as AddWidgetConnectorOperation };
  }
  if (value.type === 'delete_element' && typeof value.id === 'string') {
    return { ok: true, operation: value as unknown as DeleteWidgetElementOperation };
  }
  return { ok: false, message: `不支持或参数不完整的 Widget 操作: ${String(value.type ?? 'unknown')}` };
}

/**
 * 应用新增形状操作。
 * @param data - 待更新Widget数据
 * @param operation - 新增形状操作
 * @param usedIds - 已占用 ID 集合
 * @returns 应用结果
 */
function applyAddShapeOperation(data: WidgetData, operation: AddWidgetShapeOperation, usedIds: Set<string>): WidgetOperationApplyResult {
  const resolvedId = resolveWidgetOperationId(operation.id, AI_SHAPE_ID_PREFIX, usedIds);
  if (!resolvedId.ok) return resolvedId;
  data.elements.push(createShapeElementFromOperation(operation, resolvedId.id));
  return { ok: true };
}

/**
 * 应用更新形状文本操作。
 * @param data - 待更新Widget数据
 * @param operation - 更新形状文本操作
 * @returns 应用结果
 */
function applyUpdateShapeTextOperation(data: WidgetData, operation: UpdateWidgetShapeTextOperation): WidgetOperationApplyResult {
  const shape = findWidgetShape(data, operation.id);
  if (!shape) return { ok: false, message: `找不到节点: ${operation.id}` };
  shape.text = operation.text;
  return { ok: true };
}

/**
 * 应用移动形状操作。
 * @param data - 待更新Widget数据
 * @param operation - 移动形状操作
 * @returns 应用结果
 */
function applyMoveShapeOperation(data: WidgetData, operation: MoveWidgetShapeOperation): WidgetOperationApplyResult {
  const shape = findWidgetShape(data, operation.id);
  if (!shape) return { ok: false, message: `找不到节点: ${operation.id}` };
  shape.position = cloneDeep(operation.position);
  return { ok: true };
}

/**
 * 应用新增连接线操作。
 * @param data - 待更新Widget数据
 * @param operation - 新增连接线操作
 * @param usedIds - 已占用 ID 集合
 * @returns 应用结果
 */
function applyAddConnectorOperation(data: WidgetData, operation: AddWidgetConnectorOperation, usedIds: Set<string>): WidgetOperationApplyResult {
  const sourceShape = findWidgetShape(data, operation.sourceId);
  const targetShape = findWidgetShape(data, operation.targetId);
  if (!sourceShape) return { ok: false, message: `找不到连接起点: ${operation.sourceId}` };
  if (!targetShape) return { ok: false, message: `找不到连接目标: ${operation.targetId}` };
  if (operation.sourceId === operation.targetId) return { ok: false, message: '连接线起点和终点不能相同' };

  const resolvedId = resolveWidgetOperationId(operation.id, AI_CONNECTOR_ID_PREFIX, usedIds);
  if (!resolvedId.ok) return resolvedId;
  data.elements.push(createConnectorElementFromOperation(operation, resolvedId.id, inferConnectorAnchors(sourceShape, targetShape)));
  return { ok: true };
}

/**
 * 应用删除元素操作。
 * @param data - 待更新Widget数据
 * @param operation - 删除元素操作
 * @returns 应用结果
 */
function applyDeleteElementOperation(data: WidgetData, operation: DeleteWidgetElementOperation): WidgetOperationApplyResult {
  const target = data.elements.find((element) => element.id === operation.id);
  if (!target) return { ok: false, message: `找不到元素: ${operation.id}` };

  const deletedShapeIds = new Set(isWidgetShapeElement(target) ? [target.id] : []);
  data.elements = data.elements.filter((element) => {
    if (element.id === operation.id) return false;
    if (isWidgetConnectorElement(element)) {
      const sourceId = getConnectorEndpointElementId(element.source);
      const targetId = getConnectorEndpointElementId(element.target);
      return !deletedShapeIds.has(sourceId ?? '') && !deletedShapeIds.has(targetId ?? '');
    }
    return true;
  });
  data.edges = [];
  return { ok: true };
}

/**
 * 应用单个Widget操作。
 * @param data - 待更新Widget数据
 * @param operation - Widget操作
 * @param usedIds - 已占用 ID 集合
 * @returns 应用结果
 */
function applyWidgetOperation(data: WidgetData, operation: WidgetOperation, usedIds: Set<string>): WidgetOperationApplyResult {
  switch (operation.type) {
    case 'add_shape':
      return applyAddShapeOperation(data, operation, usedIds);
    case 'update_shape_text':
      return applyUpdateShapeTextOperation(data, operation);
    case 'move_shape':
      return applyMoveShapeOperation(data, operation);
    case 'add_connector':
      return applyAddConnectorOperation(data, operation, usedIds);
    case 'delete_element':
      return applyDeleteElementOperation(data, operation);
    default:
      return { ok: false, message: '不支持的 Widget 操作' };
  }
}

/**
 * 按顺序应用Widget操作列表。
 * @param data - 原始Widget数据
 * @param operations - 原始操作列表
 * @returns 应用后的Widget数据或错误信息
 */
export function applyWidgetOperationsToData(data: WidgetData, operations: unknown[]): WidgetOperationsApplyResult {
  const nextData = cloneDeep(data);
  nextData.edges = [];
  const usedIds = createUsedWidgetIds(nextData);

  for (const rawOperation of operations) {
    const parsedOperation = parseWidgetOperation(rawOperation);
    if (!parsedOperation.ok) return parsedOperation;

    const appliedOperation = applyWidgetOperation(nextData, parsedOperation.operation, usedIds);
    if (!appliedOperation.ok) return appliedOperation;
  }

  return { ok: true, data: nextData, appliedOperations: operations.length };
}
