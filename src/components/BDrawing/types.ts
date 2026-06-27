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
 * 盒模型四边数值。
 */
export interface DrawingBoxSides {
  /** 上边数值 */
  top: number;
  /** 右边数值 */
  right: number;
  /** 下边数值 */
  bottom: number;
  /** 左边数值 */
  left: number;
}

/**
 * 盒模型四角圆角数值。
 */
export interface DrawingCornerRadius {
  /** 左上圆角 */
  topLeft: number;
  /** 右上圆角 */
  topRight: number;
  /** 右下圆角 */
  bottomRight: number;
  /** 左下圆角 */
  bottomLeft: number;
}

/**
 * 可统一或四边独立设置的盒模型数值。
 */
export type DrawingBoxSideValue = number | DrawingBoxSides;

/**
 * 可统一或四角独立设置的圆角数值。
 */
export type DrawingCornerRadiusValue = number | DrawingCornerRadius;

/**
 * 画板元素边框线型。
 */
export type DrawingBorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';

/**
 * 画板元素样式。
 */
export interface DrawingElementStyle {
  /** 填充色 */
  backgroundColor?: string;
  /** 描边色 */
  borderColor?: string;
  /** 描边线型 */
  borderStyle?: DrawingBorderStyle;
  /** 描边宽度，支持统一或四边独立设置 */
  borderWidth?: DrawingBoxSideValue;
  /** 描边宽度旧字段，仅用于兼容历史数据 */
  borderColorWidth?: number;
  /** 圆角，支持统一或四角独立设置 */
  borderRadius?: DrawingCornerRadiusValue;
  /** 内边距，支持统一或四边独立设置 */
  padding?: DrawingBoxSideValue;
  /** 文字颜色 */
  color?: string;
  /** 文字字号 */
  fontSize?: number;
  /** 文字字重 */
  fontWeight?: number;
  /** 文字对齐方式 */
  textAlign?: 'left' | 'center' | 'right' | 'justify';
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
 * 元素创建锚点。
 */
export type DrawingElementCreateAnchor = 'center' | 'top-left';

/**
 * 画板元信息。
 */
export interface DrawingMetadata {
  /** 预留扩展字段 */
  [key: string]: unknown;
}

/**
 * 自由形状元素。
 */
export interface DrawingShapeElement {
  /** 真实元素 ID */
  id: string;
  /** 元素注册名称 */
  name: string;
  /** 元素显示名称，来自注册配置，不支持编辑 */
  label: string;
  /** 元素图标，来自注册配置 */
  icon: string;
  /** 用户自定义中文名称 */
  title: string;
  /** 元素位置 */
  position: DrawingPoint;
  /** 元素尺寸 */
  size: DrawingSize;
  /** 旋转角度，单位为度 */
  rotation: number;
  /** 元素样式 */
  style: DrawingElementStyle;
  /** 组件自定义元数据 */
  metadata: DrawingMetadata;
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
  /** 元素显示名称 */
  label: string;
  /** 元素图标 */
  icon: string;
  /** 拖拽起点 */
  start: DrawingPoint;
  /** 拖拽终点 */
  end: DrawingPoint;
  /** 点击创建时的锚点 */
  createAnchor?: DrawingElementCreateAnchor;
  /** 元素初始样式 */
  style?: DrawingElementStyle;
  /** 元素默认自定义元数据 */
  metadata?: DrawingMetadata;
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
 * 画布右键菜单事件载荷。
 */
export interface DrawingContextMenuPayload {
  /** 右键命中的元素 ID，空白画布为 null */
  elementId: string | null;
  /** 浏览器坐标 */
  clientPoint: DrawingPoint;
  /** 画板坐标 */
  boardPoint: DrawingPoint;
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
  /** 画板元信息 */
  metadata: DrawingMetadata;
  /** 元素数据 */
  elements: DrawingElement[];
  /** 视口数据 */
  viewport: DrawingViewport;
}

/**
 * 当前设置面板可编辑目标。
 */
export type DrawingSelectTarget = DrawingElement | DrawingMetadata | null;

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
