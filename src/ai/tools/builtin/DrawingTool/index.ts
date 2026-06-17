/**
 * @file DrawingTool/index.ts
 * @description 内置 Drawing 工具实现（读取 + 更新当前画板）。
 */
import type { DrawingToolContext } from '../../context/drawing';
import type { OpenDraftInput, OpenDraftResult } from '../../shared/types';
import type { AIToolExecutor } from 'types/ai';
import { cloneDeep } from 'lodash-es';
import type {
  DrawingConnectorAnchor,
  DrawingConnectorEndpoint,
  DrawingConnectorElement,
  DrawingData,
  DrawingElement,
  DrawingElementStyle,
  DrawingPoint,
  DrawingShapeElement,
  DrawingShapeType,
  DrawingSize
} from '@/components/BDrawing/types';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** 创建画板草稿工具名称。 */
export const CREATE_DRAWING_TOOL_NAME = 'create_drawing';
/** 读取当前画板工具名称。 */
export const READ_CURRENT_DRAWING_TOOL_NAME = 'read_current_drawing';
/** 更新当前画板工具名称。 */
export const UPDATE_CURRENT_DRAWING_TOOL_NAME = 'update_current_drawing';
/** 操作当前画板工具名称。 */
export const APPLY_DRAWING_OPERATIONS_TOOL_NAME = 'apply_drawing_operations';

/** AI 自动创建形状的 ID 前缀。 */
const AI_SHAPE_ID_PREFIX = 'drawing-ai-shape';
/** AI 自动创建连接线的 ID 前缀。 */
const AI_CONNECTOR_ID_PREFIX = 'drawing-ai-connector';
/** AI 支持创建的形状类型。 */
const SUPPORTED_DRAWING_SHAPES: readonly DrawingShapeType[] = ['process', 'decision', 'actor', 'service', 'database', 'text', 'rect', 'ellipse', 'diamond'];
/** AI 支持使用的连接线锚点。 */
const SUPPORTED_CONNECTOR_ANCHORS: readonly DrawingConnectorAnchor[] = ['top', 'right', 'bottom', 'left', 'center'];

/**
 * 内部 JSON Schema 对象类型。
 */
type DrawingToolJsonSchema = Record<string, unknown>;

/** 画板坐标点参数 Schema。 */
const DRAWING_POINT_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'object',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' }
  },
  required: ['x', 'y'],
  additionalProperties: false
};

/** 画板尺寸参数 Schema。 */
const DRAWING_SIZE_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'object',
  properties: {
    width: { type: 'number', minimum: 0 },
    height: { type: 'number', minimum: 0 }
  },
  required: ['width', 'height'],
  additionalProperties: false
};

/** 画板样式参数 Schema。 */
const DRAWING_STYLE_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'object',
  properties: {
    fill: { type: 'string' },
    stroke: { type: 'string' },
    strokeWidth: { type: 'number' },
    color: { type: 'string' },
    fontSize: { type: 'number' },
    fontWeight: { type: 'number' },
    textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
    textVerticalAlign: { type: 'string', enum: ['top', 'middle', 'bottom'] },
    opacity: { type: 'number' }
  },
  additionalProperties: false
};

/** 新增形状操作参数 Schema。 */
const ADD_SHAPE_OPERATION_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['add_shape'] },
    id: { type: 'string' },
    shape: { type: 'string', enum: SUPPORTED_DRAWING_SHAPES },
    text: { type: 'string' },
    position: DRAWING_POINT_PARAMETER_SCHEMA,
    size: DRAWING_SIZE_PARAMETER_SCHEMA,
    style: DRAWING_STYLE_PARAMETER_SCHEMA
  },
  required: ['type', 'shape', 'position'],
  additionalProperties: false
};

/** 更新形状文本操作参数 Schema。 */
const UPDATE_SHAPE_TEXT_OPERATION_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['update_shape_text'] },
    id: { type: 'string' },
    text: { type: 'string' }
  },
  required: ['type', 'id', 'text'],
  additionalProperties: false
};

/** 移动形状操作参数 Schema。 */
const MOVE_SHAPE_OPERATION_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['move_shape'] },
    id: { type: 'string' },
    position: DRAWING_POINT_PARAMETER_SCHEMA
  },
  required: ['type', 'id', 'position'],
  additionalProperties: false
};

/** 新增连接线操作参数 Schema。 */
const ADD_CONNECTOR_OPERATION_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['add_connector'] },
    id: { type: 'string' },
    sourceId: { type: 'string' },
    targetId: { type: 'string' },
    sourceAnchor: { type: 'string', enum: SUPPORTED_CONNECTOR_ANCHORS },
    targetAnchor: { type: 'string', enum: SUPPORTED_CONNECTOR_ANCHORS },
    label: { type: 'string' },
    style: DRAWING_STYLE_PARAMETER_SCHEMA
  },
  required: ['type', 'sourceId', 'targetId'],
  additionalProperties: false
};

/** 删除元素操作参数 Schema。 */
const DELETE_ELEMENT_OPERATION_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['delete_element'] },
    id: { type: 'string' }
  },
  required: ['type', 'id'],
  additionalProperties: false
};

/** 批量画板操作参数 Schema。 */
const DRAWING_OPERATIONS_PARAMETER_SCHEMA: DrawingToolJsonSchema = {
  type: 'array',
  description:
    '按顺序执行的操作列表。支持 add_shape、update_shape_text、move_shape、add_connector、delete_element。' +
    'add_shape 可传 shape/text/position/size/style；add_connector 可传 sourceId/targetId/sourceAnchor/targetAnchor/label/style。',
  items: {
    oneOf: [
      ADD_SHAPE_OPERATION_PARAMETER_SCHEMA,
      UPDATE_SHAPE_TEXT_OPERATION_PARAMETER_SCHEMA,
      MOVE_SHAPE_OPERATION_PARAMETER_SCHEMA,
      ADD_CONNECTOR_OPERATION_PARAMETER_SCHEMA,
      DELETE_ELEMENT_OPERATION_PARAMETER_SCHEMA
    ]
  }
};

/**
 * 读取当前画板结果。
 */
export interface ReadCurrentDrawingResult {
  /** 画图文件 ID */
  id: string;
  /** 画图文件标题 */
  title: string;
  /** 画图文件路径 */
  path: string | null;
  /** 当前画图数据 */
  data: DrawingData;
}

/**
 * 更新当前画板输入。
 */
export interface UpdateCurrentDrawingInput {
  /** 新的完整画图数据 */
  data: DrawingData;
}

/**
 * 新增形状操作。
 */
export interface AddDrawingShapeOperation {
  /** 操作类型 */
  type: 'add_shape';
  /** 可选元素 ID，未传入时自动生成 */
  id?: string;
  /** 形状类型 */
  shape: DrawingShapeType;
  /** 节点文本 */
  text?: string;
  /** 元素位置 */
  position: DrawingPoint;
  /** 元素尺寸 */
  size?: DrawingSize;
  /** 元素样式 */
  style?: DrawingElementStyle;
}

/**
 * 更新形状文本操作。
 */
export interface UpdateDrawingShapeTextOperation {
  /** 操作类型 */
  type: 'update_shape_text';
  /** 目标元素 ID */
  id: string;
  /** 新文本 */
  text: string;
}

/**
 * 移动形状操作。
 */
export interface MoveDrawingShapeOperation {
  /** 操作类型 */
  type: 'move_shape';
  /** 目标元素 ID */
  id: string;
  /** 新位置 */
  position: DrawingPoint;
}

/**
 * 新增连接线操作。
 */
export interface AddDrawingConnectorOperation {
  /** 操作类型 */
  type: 'add_connector';
  /** 可选连接线 ID，未传入时自动生成 */
  id?: string;
  /** 起点形状 ID */
  sourceId: string;
  /** 终点形状 ID */
  targetId: string;
  /** 起点锚点 */
  sourceAnchor?: DrawingConnectorAnchor;
  /** 终点锚点 */
  targetAnchor?: DrawingConnectorAnchor;
  /** 连线标签 */
  label?: string;
  /** 连线样式 */
  style?: DrawingElementStyle;
}

/**
 * 删除元素操作。
 */
export interface DeleteDrawingElementOperation {
  /** 操作类型 */
  type: 'delete_element';
  /** 待删除元素 ID */
  id: string;
}

/**
 * AI 画板操作。
 */
export type DrawingOperation =
  | AddDrawingShapeOperation
  | UpdateDrawingShapeTextOperation
  | MoveDrawingShapeOperation
  | AddDrawingConnectorOperation
  | DeleteDrawingElementOperation;

/**
 * 创建画板草稿输入。
 */
export interface CreateDrawingInput {
  /** 画板标题/文件名主体 */
  title: string;
  /** 创建草稿时同步应用的初始画板操作 */
  operations?: DrawingOperation[];
}

/**
 * 操作当前画板输入。
 */
export interface ApplyDrawingOperationsInput {
  /** 需要按顺序执行的画板操作 */
  operations: DrawingOperation[];
}

/**
 * 更新当前画板结果。
 */
export type UpdateCurrentDrawingResult = ReadCurrentDrawingResult;

/**
 * 创建画板草稿结果。
 */
export type CreateDrawingResult = ReadCurrentDrawingResult;

/**
 * 操作当前画板结果。
 */
export interface ApplyDrawingOperationsResult extends ReadCurrentDrawingResult {
  /** 已执行的操作数量 */
  appliedOperations: number;
}

/**
 * 画板操作应用结果。
 */
type DrawingOperationApplyResult = { ok: true } | { ok: false; message: string };

/**
 * 画板批量操作应用结果。
 */
type DrawingOperationsApplyResult = { ok: true; data: DrawingData; appliedOperations: number } | { ok: false; message: string };

/**
 * Drawing 工具创建选项。
 */
export interface CreateBuiltinDrawingToolsOptions {
  /** 获取当前活动 Drawing 上下文 */
  getDrawingContext?: () => DrawingToolContext | undefined;
  /** 创建并打开未保存草稿 */
  openDraft?: (input: OpenDraftInput) => Promise<OpenDraftResult>;
}

/**
 * 内置 Drawing 工具集合。
 */
export interface BuiltinDrawingTools {
  /** 创建画板草稿工具 */
  createDrawing: AIToolExecutor<CreateDrawingInput, CreateDrawingResult>;
  /** 读取当前画板工具 */
  readCurrentDrawing: AIToolExecutor<Record<string, never>, ReadCurrentDrawingResult>;
  /** 更新当前画板工具 */
  updateCurrentDrawing: AIToolExecutor<UpdateCurrentDrawingInput, UpdateCurrentDrawingResult>;
  /** 按操作协议更新当前画板工具 */
  applyDrawingOperations: AIToolExecutor<ApplyDrawingOperationsInput, ApplyDrawingOperationsResult>;
}

/**
 * 判断值是否为可索引对象。
 * @param value - 待判断值
 * @returns 是否为可索引对象
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
 * 判断值是否为画板坐标点。
 * @param value - 待判断值
 * @returns 是否为画板坐标点
 */
function isDrawingPoint(value: unknown): value is DrawingPoint {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

/**
 * 判断值是否为画板尺寸。
 * @param value - 待判断值
 * @returns 是否为画板尺寸
 */
function isDrawingSize(value: unknown): value is DrawingSize {
  return isRecord(value) && isFiniteNumber(value.width) && isFiniteNumber(value.height) && value.width >= 0 && value.height >= 0;
}

/**
 * 判断值是否为画板形状类型。
 * @param value - 待判断值
 * @returns 是否为画板形状类型
 */
function isDrawingShapeType(value: unknown): value is DrawingShapeType {
  return typeof value === 'string' && SUPPORTED_DRAWING_SHAPES.includes(value as DrawingShapeType);
}

/**
 * 判断值是否为连接线锚点。
 * @param value - 待判断值
 * @returns 是否为连接线锚点
 */
function isDrawingConnectorAnchor(value: unknown): value is DrawingConnectorAnchor {
  return typeof value === 'string' && SUPPORTED_CONNECTOR_ANCHORS.includes(value as DrawingConnectorAnchor);
}

/**
 * 判断值是否为可选样式对象。
 * @param value - 待判断值
 * @returns 是否为可选样式对象
 */
function isOptionalDrawingStyle(value: unknown): value is DrawingElementStyle | undefined {
  return value === undefined || isRecord(value);
}

/**
 * 判断输入是否为 DrawingData。
 * @param value - 待判断值
 * @returns 是否为 DrawingData
 */
function isDrawingData(value: unknown): value is DrawingData {
  return (
    isRecord(value) &&
    Array.isArray(value.elements) &&
    Array.isArray(value.edges) &&
    isRecord(value.viewport) &&
    isRecord(value.viewport.center) &&
    typeof value.viewport.center.x === 'number' &&
    typeof value.viewport.center.y === 'number' &&
    typeof value.viewport.zoom === 'number'
  );
}

/**
 * 创建空画板数据。
 * @returns 空画板数据
 */
function createEmptyDrawingData(): DrawingData {
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
 * 创建 .tibis 画板草稿内容。
 * @param data - 画板数据
 * @returns .tibis JSON 内容
 */
function createDrawingDraftContent(data: DrawingData): string {
  return JSON.stringify(
    {
      type: 'drawing',
      version: 1,
      ...data
    },
    null,
    2
  );
}

/**
 * 规范化画板标题。
 * @param value - 原始标题
 * @returns 可用标题
 */
function normalizeDrawingTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  return title || 'Untitled';
}

/**
 * 判断元素是否为形状元素。
 * @param element - 画板元素
 * @returns 是否为形状元素
 */
function isDrawingShapeElement(element: DrawingElement): element is DrawingShapeElement {
  return element.kind === 'shape';
}

/**
 * 判断元素是否为连接线元素。
 * @param element - 画板元素
 * @returns 是否为连接线元素
 */
function isDrawingConnectorElement(element: DrawingElement): element is DrawingConnectorElement {
  return element.kind === 'connector';
}

/**
 * 读取连接线端点绑定的元素 ID。
 * @param endpoint - 连接线端点
 * @returns 元素 ID，点位端点返回 null
 */
function getConnectorEndpointElementId(endpoint: DrawingConnectorEndpoint): string | null {
  return 'elementId' in endpoint ? endpoint.elementId : null;
}

/**
 * 创建 Drawing 工具结果。
 * @param context - Drawing 工具上下文
 * @param data - 画图数据
 * @returns 工具结果载荷
 */
function createDrawingResult(context: DrawingToolContext, data: DrawingData): ReadCurrentDrawingResult {
  return {
    id: context.id,
    title: context.title,
    path: context.path,
    data: cloneDeep(data)
  };
}

/**
 * 创建画板草稿工具结果。
 * @param draft - 草稿创建结果
 * @param data - 画板数据
 * @returns 工具结果载荷
 */
function createDrawingDraftResult(draft: OpenDraftResult, data: DrawingData): CreateDrawingResult {
  return {
    id: draft.file.id,
    title: draft.file.name,
    path: draft.unsavedPath,
    data: cloneDeep(data)
  };
}

/**
 * 收集当前画板已占用的元素和连线 ID。
 * @param data - 当前画板数据
 * @returns 已占用 ID 集合
 */
function createUsedDrawingIds(data: DrawingData): Set<string> {
  return new Set(data.elements.map((element) => element.id));
}

/**
 * 创建不与现有数据冲突的 AI 元素 ID。
 * @param prefix - ID 前缀
 * @param usedIds - 已占用 ID 集合
 * @returns 新 ID
 */
function createUniqueDrawingId(prefix: string, usedIds: Set<string>): string {
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
 * 保留外部 ID 或创建新的唯一 ID。
 * @param id - 外部传入 ID
 * @param prefix - 自动 ID 前缀
 * @param usedIds - 已占用 ID 集合
 * @returns 可使用的唯一 ID 或错误信息
 */
function resolveDrawingOperationId(id: string | undefined, prefix: string, usedIds: Set<string>): { ok: true; id: string } | { ok: false; message: string } {
  if (!id) {
    return { ok: true, id: createUniqueDrawingId(prefix, usedIds) };
  }

  if (usedIds.has(id)) {
    return { ok: false, message: `元素已存在: ${id}` };
  }

  usedIds.add(id);
  return { ok: true, id };
}

/**
 * 查找画板形状元素。
 * @param data - 当前画板数据
 * @param id - 元素 ID
 * @returns 形状元素，不存在时返回 null
 */
function findDrawingShape(data: DrawingData, id: string): DrawingShapeElement | null {
  const element = data.elements.find((item) => item.id === id);
  return element && isDrawingShapeElement(element) ? element : null;
}

/**
 * 读取形状中心点。
 * @param shape - 形状元素
 * @returns 形状中心点
 */
function getShapeCenter(shape: DrawingShapeElement): DrawingPoint {
  return {
    x: shape.position.x + shape.size.width / 2,
    y: shape.position.y + shape.size.height / 2
  };
}

/**
 * 推断左右排列时的连接锚点。
 * @param sourceCenter - 起点中心
 * @param targetCenter - 终点中心
 * @returns 起终点锚点
 */
function inferHorizontalConnectorAnchors(
  sourceCenter: DrawingPoint,
  targetCenter: DrawingPoint
): { sourceAnchor: DrawingConnectorAnchor; targetAnchor: DrawingConnectorAnchor } {
  if (targetCenter.x >= sourceCenter.x) {
    return { sourceAnchor: 'right', targetAnchor: 'left' };
  }

  return { sourceAnchor: 'left', targetAnchor: 'right' };
}

/**
 * 推断上下排列时的连接锚点。
 * @param sourceCenter - 起点中心
 * @param targetCenter - 终点中心
 * @returns 起终点锚点
 */
function inferVerticalConnectorAnchors(
  sourceCenter: DrawingPoint,
  targetCenter: DrawingPoint
): { sourceAnchor: DrawingConnectorAnchor; targetAnchor: DrawingConnectorAnchor } {
  if (targetCenter.y >= sourceCenter.y) {
    return { sourceAnchor: 'bottom', targetAnchor: 'top' };
  }

  return { sourceAnchor: 'top', targetAnchor: 'bottom' };
}

/**
 * 根据节点相对位置推断缺省连接锚点。
 * @param sourceShape - 起点形状
 * @param targetShape - 终点形状
 * @returns 起终点锚点
 */
function inferConnectorAnchors(
  sourceShape: DrawingShapeElement,
  targetShape: DrawingShapeElement
): { sourceAnchor: DrawingConnectorAnchor; targetAnchor: DrawingConnectorAnchor } {
  const sourceCenter = getShapeCenter(sourceShape);
  const targetCenter = getShapeCenter(targetShape);
  const dx = Math.abs(targetCenter.x - sourceCenter.x);
  const dy = Math.abs(targetCenter.y - sourceCenter.y);

  if (dx >= dy) {
    return inferHorizontalConnectorAnchors(sourceCenter, targetCenter);
  }

  return inferVerticalConnectorAnchors(sourceCenter, targetCenter);
}

/**
 * 创建形状元素。
 * @param operation - 新增形状操作
 * @param id - 已解析的元素 ID
 * @returns 形状元素
 */
function createShapeElementFromOperation(operation: AddDrawingShapeOperation, id: string): DrawingShapeElement {
  return {
    id,
    kind: 'shape',
    shape: operation.shape,
    text: operation.text ?? '',
    position: cloneDeep(operation.position),
    size: cloneDeep(operation.size ?? { width: 180, height: 72 }),
    rotation: 0,
    style: cloneDeep(operation.style),
    metadata: {
      source: 'user',
      createdAt: Date.now()
    }
  };
}

/**
 * 创建连接线元素。
 * @param operation - 新增连接线操作
 * @param id - 已解析的连接线 ID
 * @param anchors - 推断后的连接锚点
 * @returns 连接线元素
 */
function createConnectorElementFromOperation(
  operation: AddDrawingConnectorOperation,
  id: string,
  anchors: { sourceAnchor: DrawingConnectorAnchor; targetAnchor: DrawingConnectorAnchor }
): DrawingConnectorElement {
  return {
    id,
    kind: 'connector',
    source: {
      elementId: operation.sourceId,
      anchor: operation.sourceAnchor ?? anchors.sourceAnchor
    },
    target: {
      elementId: operation.targetId,
      anchor: operation.targetAnchor ?? anchors.targetAnchor
    },
    markerEnd: 'arrow',
    label: operation.label,
    style: cloneDeep(operation.style),
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: Date.now()
    }
  };
}

/**
 * 判断原始值是否为新增形状操作。
 * @param value - 待判断值
 * @returns 是否为新增形状操作
 */
function isAddShapeOperation(value: Record<string, unknown>): value is Record<string, unknown> & AddDrawingShapeOperation {
  return (
    value.type === 'add_shape' &&
    (value.id === undefined || typeof value.id === 'string') &&
    isDrawingShapeType(value.shape) &&
    (value.text === undefined || typeof value.text === 'string') &&
    isDrawingPoint(value.position) &&
    (value.size === undefined || isDrawingSize(value.size)) &&
    isOptionalDrawingStyle(value.style)
  );
}

/**
 * 判断原始值是否为更新形状文本操作。
 * @param value - 待判断值
 * @returns 是否为更新形状文本操作
 */
function isUpdateShapeTextOperation(value: Record<string, unknown>): value is Record<string, unknown> & UpdateDrawingShapeTextOperation {
  return value.type === 'update_shape_text' && typeof value.id === 'string' && typeof value.text === 'string';
}

/**
 * 判断原始值是否为移动形状操作。
 * @param value - 待判断值
 * @returns 是否为移动形状操作
 */
function isMoveShapeOperation(value: Record<string, unknown>): value is Record<string, unknown> & MoveDrawingShapeOperation {
  return value.type === 'move_shape' && typeof value.id === 'string' && isDrawingPoint(value.position);
}

/**
 * 判断原始值是否为新增连接线操作。
 * @param value - 待判断值
 * @returns 是否为新增连接线操作
 */
function isAddConnectorOperation(value: Record<string, unknown>): value is Record<string, unknown> & AddDrawingConnectorOperation {
  return (
    value.type === 'add_connector' &&
    (value.id === undefined || typeof value.id === 'string') &&
    typeof value.sourceId === 'string' &&
    typeof value.targetId === 'string' &&
    (value.sourceAnchor === undefined || isDrawingConnectorAnchor(value.sourceAnchor)) &&
    (value.targetAnchor === undefined || isDrawingConnectorAnchor(value.targetAnchor)) &&
    (value.label === undefined || typeof value.label === 'string') &&
    isOptionalDrawingStyle(value.style)
  );
}

/**
 * 判断原始值是否为删除元素操作。
 * @param value - 待判断值
 * @returns 是否为删除元素操作
 */
function isDeleteElementOperation(value: Record<string, unknown>): value is Record<string, unknown> & DeleteDrawingElementOperation {
  return value.type === 'delete_element' && typeof value.id === 'string';
}

/**
 * 解析原始操作输入。
 * @param value - 原始操作输入
 * @returns 画板操作或错误信息
 */
function parseDrawingOperation(value: unknown): { ok: true; operation: DrawingOperation } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: 'operation 必须是对象' };
  }

  if (isAddShapeOperation(value)) return { ok: true, operation: value };
  if (isUpdateShapeTextOperation(value)) return { ok: true, operation: value };
  if (isMoveShapeOperation(value)) return { ok: true, operation: value };
  if (isAddConnectorOperation(value)) return { ok: true, operation: value };
  if (isDeleteElementOperation(value)) return { ok: true, operation: value };

  return { ok: false, message: `不支持或参数不完整的画板操作: ${String(value.type ?? 'unknown')}` };
}

/**
 * 应用新增形状操作。
 * @param data - 待更新画板数据
 * @param operation - 新增形状操作
 * @param usedIds - 已占用 ID 集合
 * @returns 应用结果
 */
function applyAddShapeOperation(data: DrawingData, operation: AddDrawingShapeOperation, usedIds: Set<string>): DrawingOperationApplyResult {
  const resolvedId = resolveDrawingOperationId(operation.id, AI_SHAPE_ID_PREFIX, usedIds);
  if (!resolvedId.ok) {
    return resolvedId;
  }

  data.elements.push(createShapeElementFromOperation(operation, resolvedId.id));
  return { ok: true };
}

/**
 * 应用更新形状文本操作。
 * @param data - 待更新画板数据
 * @param operation - 更新形状文本操作
 * @returns 应用结果
 */
function applyUpdateShapeTextOperation(data: DrawingData, operation: UpdateDrawingShapeTextOperation): DrawingOperationApplyResult {
  const shape = findDrawingShape(data, operation.id);
  if (!shape) {
    return { ok: false, message: `找不到节点: ${operation.id}` };
  }

  shape.text = operation.text;
  return { ok: true };
}

/**
 * 应用移动形状操作。
 * @param data - 待更新画板数据
 * @param operation - 移动形状操作
 * @returns 应用结果
 */
function applyMoveShapeOperation(data: DrawingData, operation: MoveDrawingShapeOperation): DrawingOperationApplyResult {
  const shape = findDrawingShape(data, operation.id);
  if (!shape) {
    return { ok: false, message: `找不到节点: ${operation.id}` };
  }

  shape.position = cloneDeep(operation.position);
  return { ok: true };
}

/**
 * 应用新增连接线操作。
 * @param data - 待更新画板数据
 * @param operation - 新增连接线操作
 * @param usedIds - 已占用 ID 集合
 * @returns 应用结果
 */
function applyAddConnectorOperation(data: DrawingData, operation: AddDrawingConnectorOperation, usedIds: Set<string>): DrawingOperationApplyResult {
  const sourceShape = findDrawingShape(data, operation.sourceId);
  const targetShape = findDrawingShape(data, operation.targetId);
  if (!sourceShape) {
    return { ok: false, message: `找不到连接起点: ${operation.sourceId}` };
  }
  if (!targetShape) {
    return { ok: false, message: `找不到连接目标: ${operation.targetId}` };
  }
  if (operation.sourceId === operation.targetId) {
    return { ok: false, message: '连接线起点和终点不能相同' };
  }

  const resolvedId = resolveDrawingOperationId(operation.id, AI_CONNECTOR_ID_PREFIX, usedIds);
  if (!resolvedId.ok) {
    return resolvedId;
  }

  data.elements.push(createConnectorElementFromOperation(operation, resolvedId.id, inferConnectorAnchors(sourceShape, targetShape)));
  return { ok: true };
}

/**
 * 应用删除元素操作。
 * @param data - 待更新画板数据
 * @param operation - 删除元素操作
 * @returns 应用结果
 */
function applyDeleteElementOperation(data: DrawingData, operation: DeleteDrawingElementOperation): DrawingOperationApplyResult {
  const target = data.elements.find((element) => element.id === operation.id);
  if (!target) {
    return { ok: false, message: `找不到元素: ${operation.id}` };
  }

  const deletedShapeIds = new Set(isDrawingShapeElement(target) ? [target.id] : []);
  data.elements = data.elements.filter((element) => {
    if (element.id === operation.id) {
      return false;
    }
    if (isDrawingConnectorElement(element)) {
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
 * 应用单个画板操作。
 * @param data - 待更新画板数据
 * @param operation - 画板操作
 * @param usedIds - 已占用 ID 集合
 * @returns 应用结果
 */
function applyDrawingOperation(data: DrawingData, operation: DrawingOperation, usedIds: Set<string>): DrawingOperationApplyResult {
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
      return { ok: false, message: '不支持的画板操作' };
  }
}

/**
 * 按顺序应用画板操作列表。
 * @param data - 原始画板数据
 * @param operations - 原始操作列表
 * @returns 应用后的画板数据或错误信息
 */
function applyDrawingOperationsToData(data: DrawingData, operations: unknown[]): DrawingOperationsApplyResult {
  const nextData = cloneDeep(data);
  nextData.edges = [];
  const usedIds = createUsedDrawingIds(nextData);

  for (const rawOperation of operations) {
    const parsedOperation = parseDrawingOperation(rawOperation);
    if (!parsedOperation.ok) {
      return parsedOperation;
    }

    const appliedOperation = applyDrawingOperation(nextData, parsedOperation.operation, usedIds);
    if (!appliedOperation.ok) {
      return appliedOperation;
    }
  }

  return {
    ok: true,
    data: nextData,
    appliedOperations: operations.length
  };
}

/**
 * 读取当前 Drawing 上下文。
 * @param options - Drawing 工具创建选项
 * @param toolName - 当前工具名称
 * @returns Drawing 上下文或失败结果
 */
function getActiveDrawingContext(options: CreateBuiltinDrawingToolsOptions, toolName: string): DrawingToolContext | ReturnType<typeof createToolFailureResult> {
  const context = options.getDrawingContext?.();
  if (!context) {
    return createToolFailureResult(toolName, 'NO_ACTIVE_DOCUMENT', '当前没有可用的画板');
  }

  return context;
}

/**
 * 创建内置 Drawing 工具。
 * @param options - Drawing 工具创建选项
 * @returns Drawing 工具执行器集合
 */
export function createBuiltinDrawingTools(options: CreateBuiltinDrawingToolsOptions): BuiltinDrawingTools {
  return {
    createDrawing: {
      definition: {
        name: CREATE_DRAWING_TOOL_NAME,
        description:
          '创建新的 BDrawing 画板草稿并打开。可传入初始 operations，一次性创建并绘制初始节点、连线或布局；适合用户要求新建流程图、结构图、思维草图时使用。',
        source: 'builtin',
        riskLevel: 'write',
        requiresActiveDocument: false,
        permissionCategory: 'document',
        safeAutoApprove: true,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '画板标题/文件名主体，如 "产品流程图"。' },
            operations: {
              ...DRAWING_OPERATIONS_PARAMETER_SCHEMA,
              description: '创建草稿后立即应用的初始画板操作列表。省略时创建空画板。'
            }
          },
          required: ['title'],
          additionalProperties: false
        }
      },
      async execute(input: CreateDrawingInput) {
        const title = normalizeDrawingTitle(input.title);
        const operations = Array.isArray(input.operations) ? input.operations : [];

        if (!options.openDraft) {
          return createToolFailureResult(CREATE_DRAWING_TOOL_NAME, 'EXECUTION_FAILED', '当前环境不支持创建画板草稿');
        }

        const applied = applyDrawingOperationsToData(createEmptyDrawingData(), operations);
        if (!applied.ok) {
          return createToolFailureResult(CREATE_DRAWING_TOOL_NAME, 'INVALID_INPUT', applied.message);
        }

        const content = createDrawingDraftContent(applied.data);
        const draft = await options.openDraft({
          originalPath: `${title}.tibis`,
          content
        });

        return createToolSuccessResult(CREATE_DRAWING_TOOL_NAME, createDrawingDraftResult(draft, applied.data));
      }
    },
    readCurrentDrawing: {
      definition: {
        name: READ_CURRENT_DRAWING_TOOL_NAME,
        description: '读取当前画板的文件信息与完整 Drawing JSON 数据。',
        source: 'builtin',
        riskLevel: 'read',
        requiresActiveDocument: false,
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      },
      async execute() {
        const context = getActiveDrawingContext(options, READ_CURRENT_DRAWING_TOOL_NAME);
        if ('status' in context) {
          return context;
        }

        return createToolSuccessResult(READ_CURRENT_DRAWING_TOOL_NAME, createDrawingResult(context, context.getData()));
      }
    },
    updateCurrentDrawing: {
      definition: {
        name: UPDATE_CURRENT_DRAWING_TOOL_NAME,
        description: '更新当前画板的完整 Drawing JSON 数据。适合新增、删除、移动节点或连线后写回画板。',
        source: 'builtin',
        riskLevel: 'write',
        requiresActiveDocument: false,
        permissionCategory: 'document',
        parameters: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              description: '完整 Drawing 数据，包含 elements、edges、viewport。'
            }
          },
          required: ['data'],
          additionalProperties: false
        }
      },
      async execute(input: UpdateCurrentDrawingInput) {
        const context = getActiveDrawingContext(options, UPDATE_CURRENT_DRAWING_TOOL_NAME);
        if ('status' in context) {
          return context;
        }

        if (!isDrawingData(input.data)) {
          return createToolFailureResult(UPDATE_CURRENT_DRAWING_TOOL_NAME, 'INVALID_INPUT', 'data 必须是完整 Drawing 数据');
        }

        const nextData = await context.replaceData(cloneDeep(input.data));

        return createToolSuccessResult(UPDATE_CURRENT_DRAWING_TOOL_NAME, createDrawingResult(context, nextData));
      }
    },
    applyDrawingOperations: {
      definition: {
        name: APPLY_DRAWING_OPERATIONS_TOOL_NAME,
        description: '按顺序对当前画板执行结构化操作。优先用于新增形状、移动形状、更新节点文本、创建连线或删除元素；比直接重写完整 Drawing JSON 更安全。',
        source: 'builtin',
        riskLevel: 'write',
        requiresActiveDocument: false,
        permissionCategory: 'document',
        parameters: {
          type: 'object',
          properties: {
            operations: {
              ...DRAWING_OPERATIONS_PARAMETER_SCHEMA
            }
          },
          required: ['operations'],
          additionalProperties: false
        }
      },
      async execute(input: ApplyDrawingOperationsInput) {
        const context = getActiveDrawingContext(options, APPLY_DRAWING_OPERATIONS_TOOL_NAME);
        if ('status' in context) {
          return context;
        }

        if (!Array.isArray(input.operations)) {
          return createToolFailureResult(APPLY_DRAWING_OPERATIONS_TOOL_NAME, 'INVALID_INPUT', 'operations 必须是数组');
        }

        const applied = applyDrawingOperationsToData(context.getData(), input.operations);
        if (!applied.ok) {
          return createToolFailureResult(APPLY_DRAWING_OPERATIONS_TOOL_NAME, 'INVALID_INPUT', applied.message);
        }

        const nextData = await context.replaceData(applied.data);
        return createToolSuccessResult(APPLY_DRAWING_OPERATIONS_TOOL_NAME, {
          ...createDrawingResult(context, nextData),
          appliedOperations: applied.appliedOperations
        });
      }
    }
  };
}
