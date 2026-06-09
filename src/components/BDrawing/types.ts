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
export type DrawingToolMode = 'select' | 'hand' | 'process';

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
 * 画板节点。
 */
export interface DrawingNode {
  /** 真实节点 ID */
  id: string;
  /** 节点类型 */
  type: DrawingNodeType;
  /** 节点主文本 */
  text: string;
  /** 节点说明 */
  description?: string;
  /** 节点位置 */
  position: DrawingPoint;
  /** 节点尺寸 */
  size: DrawingSize;
  /** 元信息 */
  metadata: DrawingElementMetadata;
}

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
  /** 节点快照 */
  nodes: DrawingNode[];
  /** 连线快照 */
  edges: DrawingEdge[];
  /** 选区快照 */
  selection: string[];
  /** 视口快照 */
  viewport: DrawingViewport;
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
