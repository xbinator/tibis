/**
 * @file types.ts
 * @description BDrawing 独立画图工具的类型定义。
 */

/**
 * 画板支持的节点类型。
 */
export type DrawingNodeType = 'process' | 'decision' | 'actor' | 'service' | 'database' | 'text';

/**
 * 画板支持的连线类型。
 */
export type DrawingEdgeType = 'arrow';

/**
 * 画板工具模式。
 */
export type DrawingToolMode = 'select' | 'hand' | 'process' | 'rect' | 'ellipse' | 'diamond' | 'text' | 'connector';

/**
 * 画板元素类别。
 */
export type DrawingElementKind = 'shape' | 'text' | 'connector' | 'mindmap-node';

/**
 * 画板形状类型。
 */
export type DrawingShapeType = DrawingNodeType | 'rect' | 'ellipse' | 'diamond';

/**
 * 画布坐标点。
 */
export interface DrawingPoint {
  /** 横坐标 */
  x: number;
  /** 纵坐标 */
  y: number;
}

/**
 * 节点尺寸。
 */
export interface DrawingSize {
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 画图元素元信息。
 */
export interface DrawingElementMetadata {
  /** 元素创建来源 */
  source: 'user';
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 画板元素样式。
 */
export interface DrawingElementStyle {
  /** 填充色 */
  fill?: string;
  /** 描边色 */
  stroke?: string;
  /** 描边宽度 */
  strokeWidth?: number;
  /** 文字颜色 */
  color?: string;
  /** 透明度 */
  opacity?: number;
}

/**
 * 画板元素样式变更。
 */
export type DrawingElementStyleChange = Partial<DrawingElementStyle>;

/**
 * 画板元素基础字段。
 */
export interface DrawingElementBase {
  /** 真实元素 ID */
  id: string;
  /** 元素类别 */
  kind: DrawingElementKind;
  /** 元素位置 */
  position: DrawingPoint;
  /** 元素尺寸 */
  size: DrawingSize;
  /** 旋转角度，单位为度 */
  rotation: number;
  /** 元素样式 */
  style?: DrawingElementStyle;
  /** 元信息 */
  metadata: DrawingElementMetadata;
}

/**
 * 自由形状元素。
 */
export interface DrawingShapeElement extends DrawingElementBase {
  /** 元素类别 */
  kind: 'shape';
  /** 形状类型 */
  shape: DrawingShapeType;
  /** 节点主文本 */
  text: string;
  /** 节点说明 */
  description?: string;
}

/**
 * 连接线锚点类型。
 */
export type DrawingConnectorAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center';

/**
 * 连接线端点。
 */
export interface DrawingConnectorEndpoint {
  /** 端点元素 ID */
  elementId: string;
  /** 端点锚点 */
  anchor: DrawingConnectorAnchor;
}

/**
 * 连接线元素。
 */
export interface DrawingConnectorElement extends DrawingElementBase {
  /** 元素类别 */
  kind: 'connector';
  /** 起点 */
  source: DrawingConnectorEndpoint;
  /** 终点 */
  target: DrawingConnectorEndpoint;
  /** 连线标签 */
  label?: string;
}

/**
 * 画板元素。
 */
export type DrawingElement = DrawingShapeElement | DrawingConnectorElement;

/**
 * 兼容旧节点 API 的形状元素别名。
 */
export type DrawingNode = DrawingShapeElement;

/**
 * 画板连线。
 */
export interface DrawingEdge {
  /** 真实连线 ID */
  id: string;
  /** 连线类型 */
  type: DrawingEdgeType;
  /** 起点节点 ID */
  sourceId: string;
  /** 终点节点 ID */
  targetId: string;
  /** 连线标签 */
  label?: string;
  /** 元信息 */
  metadata: DrawingElementMetadata;
}

/**
 * 新增节点参数。
 */
export interface DrawingAddNodeOptions {
  /** 节点 ID */
  id: string;
  /** 节点类型 */
  type: DrawingNodeType;
  /** 节点文本 */
  text?: string;
  /** 节点说明 */
  description?: string;
  /** 节点位置 */
  position?: DrawingPoint;
  /** 节点尺寸 */
  size?: DrawingSize;
  /** 创建时间戳 */
  createdAt?: number;
}

/**
 * 新增形状参数。
 */
export interface DrawingAddShapeOptions {
  /** 元素 ID */
  id: string;
  /** 形状类型 */
  shape: DrawingShapeType;
  /** 拖拽起点 */
  start: DrawingPoint;
  /** 拖拽终点 */
  end: DrawingPoint;
  /** 节点文本 */
  text?: string;
  /** 元素初始样式 */
  style?: DrawingElementStyle;
  /** 创建时间戳 */
  createdAt?: number;
}

/**
 * 新增连接线参数。
 */
export interface DrawingAddConnectorOptions {
  /** 连接线 ID */
  id: string;
  /** 起点元素 ID */
  sourceId: string;
  /** 起点锚点 */
  sourceAnchor?: DrawingConnectorAnchor;
  /** 终点元素 ID */
  targetId: string;
  /** 终点锚点 */
  targetAnchor?: DrawingConnectorAnchor;
  /** 连线标签 */
  label?: string;
  /** 创建时间戳 */
  createdAt?: number;
}

/**
 * 元素几何变更。
 */
export interface DrawingGeometryChange {
  /** 元素 ID */
  id: string;
  /** 新位置 */
  position?: DrawingPoint;
  /** 新尺寸 */
  size?: DrawingSize;
  /** 新旋转角度 */
  rotation?: number;
}

/**
 * 画板交互草稿。
 */
export type DrawingInteractionDraft =
  | {
      /** 草稿类型 */
      kind: 'creating-shape';
      /** 形状类型 */
      shape: DrawingShapeType;
      /** 拖拽起点 */
      start: DrawingPoint;
      /** 当前指针点 */
      current: DrawingPoint;
    }
  | {
      /** 草稿类型 */
      kind: 'creating-connector';
      /** 起点 */
      source: DrawingConnectorEndpoint;
      /** 当前指针点 */
      current: DrawingPoint;
    };

/**
 * 画板视口状态。
 */
export interface DrawingViewport {
  /** 视口中心点 */
  center: DrawingPoint;
  /** 缩放比例 */
  zoom: number;
}

/**
 * 画板历史快照。
 */
export interface DrawingBoardSnapshot {
  /** 元素快照 */
  elements: DrawingElement[];
  /** 连线快照 */
  edges: DrawingEdge[];
  /** 选区快照 */
  selection: string[];
  /** 视口快照 */
  viewport: DrawingViewport;
  /** 当前交互草稿 */
  draft?: DrawingInteractionDraft;
}

/**
 * 画板历史状态。
 */
export interface DrawingBoardHistory {
  /** 可撤销快照 */
  past: DrawingBoardSnapshot[];
  /** 可重做快照 */
  future: DrawingBoardSnapshot[];
}

/**
 * BDrawing 画板状态。
 */
export interface DrawingBoardState extends DrawingBoardSnapshot {
  /** 历史记录 */
  history: DrawingBoardHistory;
  /** 最近一次错误 */
  lastError?: Error;
}
