/**
 * @file types.ts
 * @description BDrawing 独立画图工具的类型定义。
 */

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
  /** 文字字号 */
  fontSize?: number;
  /** 文字字重 */
  fontWeight?: number;
  /** 文字对齐方式 */
  textAlign?: 'left' | 'center' | 'right';
  /** 文字垂直对齐方式 */
  textVerticalAlign?: 'top' | 'middle' | 'bottom';
  /** 透明度 */
  opacity?: number;
}

/**
 * 画板元素样式变更。
 */
export type DrawingElementStyleChange = Partial<DrawingElementStyle>;

/**
 * 元素层级操作类型。
 */
export type DrawingLayerAction = 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack';

/**
 * 自由形状元素。
 */
export interface DrawingShapeElement {
  /** 真实元素 ID */
  id: string;
  /** 元素注册名称 */
  name: string;
  /** 元素位置 */
  position: DrawingPoint;
  /** 元素尺寸 */
  size: DrawingSize;
  /** 旋转角度，单位为度 */
  rotation: number;
  /** 元素样式 */
  style?: DrawingElementStyle;
  /** 节点主文本 */
  text: string;
  /** 节点说明 */
  description?: string;
  /** 元信息 */
  metadata: {
    /** 元素创建来源 */
    source: 'user';
    /** 创建时间戳 */
    createdAt: number;
    /** 用户手动设置的基础尺寸，文本自动撑高时用于恢复高度 */
    manualSize?: DrawingSize;
  };
}

/**
 * 画板元素。
 */
export type DrawingElement = DrawingShapeElement;

/**
 * 新增形状参数。
 */
export interface DrawingAddShapeOptions {
  /** 元素 ID */
  id: string;
  /** 元素注册名称 */
  name: string;
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
 * 元素几何变更。
 */
export interface DrawingGeometryChange {
  /** 元素 ID */
  id: string;
  /** 新位置 */
  position?: DrawingPoint;
  /** 新尺寸 */
  size?: DrawingSize;
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
 * 画板外部双向绑定数据。
 */
export interface DrawingData {
  /** 元素数据 */
  elements: DrawingElement[];
  /** 视口数据 */
  viewport: DrawingViewport;
}

/**
 * 画板历史快照。
 */
export interface DrawingBoardSnapshot {
  /** 元素快照 */
  elements: DrawingElement[];
  /** 选区快照 */
  selection: string[];
  /** 视口快照 */
  viewport: DrawingViewport;
  /** 当前交互草稿 */
  draft?: {
    /** 草稿类型 */
    kind: 'creating-shape';
    /** 元素注册名称 */
    name: string;
    /** 拖拽起点 */
    start: DrawingPoint;
    /** 当前指针点 */
    current: DrawingPoint;
  };
}

/**
 * BDrawing 画板状态。
 */
export interface DrawingBoardState extends DrawingBoardSnapshot {
  /** 历史记录 */
  history: {
    /** 可撤销快照 */
    past: DrawingBoardSnapshot[];
    /** 可重做快照 */
    future: DrawingBoardSnapshot[];
  };
  /** 最近一次错误 */
  lastError?: Error;
}
