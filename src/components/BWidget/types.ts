/**
 * @file types.ts
 * @description BWidget 独立Widget工具的类型定义。
 */

/**
 * Widget坐标点。
 */
export interface WidgetPoint {
  /** 横坐标 */
  x: number;
  /** 纵坐标 */
  y: number;
}

/**
 * 节点尺寸。
 */
export interface WidgetSize {
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 盒模型四边数值。
 */
export interface WidgetBoxSides {
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
export interface WidgetCornerRadius {
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
export type WidgetBoxSideValue = number | WidgetBoxSides;

/**
 * 可统一或四角独立设置的圆角数值。
 */
export type WidgetCornerRadiusValue = number | WidgetCornerRadius;

/**
 * Widget元素边框线型。
 */
export type WidgetBorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';

/**
 * Widget元素样式。
 */
export interface WidgetElementStyle {
  /** 填充色 */
  backgroundColor?: string;
  /** 描边色 */
  borderColor?: string;
  /** 描边线型 */
  borderStyle?: WidgetBorderStyle;
  /** 描边宽度，支持统一或四边独立设置 */
  borderWidth?: WidgetBoxSideValue;
  /** 描边宽度旧字段，仅用于兼容历史数据 */
  borderColorWidth?: number;
  /** 圆角，支持统一或四角独立设置 */
  borderRadius?: WidgetCornerRadiusValue;
  /** 内边距，支持统一或四边独立设置 */
  padding?: WidgetBoxSideValue;
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
 * Widget元素样式变更。
 */
export type WidgetElementStyleChange = Partial<WidgetElementStyle>;

/**
 * 元素层级操作类型。
 */
export type WidgetLayerAction = 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack';

/**
 * 元素创建锚点。
 */
export type WidgetElementCreateAnchor = 'center' | 'top-left';

/**
 * Widget元信息。
 */
export interface WidgetMetadata {
  /** 预留扩展字段 */
  [key: string]: unknown;
}

/**
 * Widget交互脚本配置。
 */
export interface WidgetExecuteMethod {
  /** 方法是否启用 */
  enabled?: boolean;
  /** 方法说明，用于编辑器提示和后续权限确认 */
  description?: string;
  /** 方法执行超时时间，单位毫秒 */
  timeout?: number;
  /** 交互脚本代码，要求调用 defineConfig({...}) 声明生命周期与 methods */
  code: string;
}

/**
 * WidgetData 支持的 schema 字段类型。
 */
export type WidgetSchemaPropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * WidgetData 输入与状态 schema 属性。
 */
export interface WidgetSchemaProperty {
  /** 字段类型 */
  type: WidgetSchemaPropertyType;
  /** 字段说明 */
  description?: string;
  /** 对象字段定义 */
  properties?: Record<string, WidgetSchemaProperty>;
  /** 对象字段的必填子字段 */
  required?: string[];
  /** 数组元素结构 */
  items?: WidgetSchemaProperty;
}

/**
 * WidgetData 输入与状态对象 schema。
 */
export interface WidgetSchemaObject {
  /** 顶层 schema 固定为对象 */
  type: 'object';
  /** schema 说明 */
  description?: string;
  /** 对象字段定义 */
  properties: Record<string, WidgetSchemaProperty>;
  /** 必填字段 */
  required?: string[];
}

/**
 * 自由形状元素。
 */
export interface WidgetShapeElement {
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
  position: WidgetPoint;
  /** 元素尺寸 */
  size: WidgetSize;
  /** 旋转角度，单位为度 */
  rotation: number;
  /** 元素样式 */
  style: WidgetElementStyle;
  /** 组件自定义元数据 */
  metadata: WidgetMetadata;
}

/**
 * Widget元素。
 */
export type WidgetElement = WidgetShapeElement;

/**
 * 新增形状参数。
 */
export interface WidgetAddShapeOptions {
  /** 元素 ID */
  id: string;
  /** 元素注册名称 */
  name: string;
  /** 元素显示名称 */
  label: string;
  /** 用户自定义中文名称 */
  title?: string;
  /** 元素图标 */
  icon: string;
  /** 拖拽起点 */
  start: WidgetPoint;
  /** 拖拽终点 */
  end: WidgetPoint;
  /** 点击创建时的锚点 */
  createAnchor?: WidgetElementCreateAnchor;
  /** 元素初始样式 */
  style?: WidgetElementStyle;
  /** 元素默认自定义元数据 */
  metadata?: WidgetMetadata;
}

/**
 * 元素几何变更。
 */
export interface WidgetGeometryChange {
  /** 元素 ID */
  id: string;
  /** 新位置 */
  position?: WidgetPoint;
  /** 新尺寸 */
  size?: WidgetSize;
}

/**
 * Widget右键菜单事件载荷。
 */
export interface WidgetContextMenuPayload {
  /** 右键命中的元素 ID，空白Widget为 null */
  elementId: string | null;
  /** 浏览器坐标 */
  clientPoint: WidgetPoint;
  /** Widget坐标 */
  boardPoint: WidgetPoint;
}

/**
 * Widget视口状态。
 */
export interface WidgetViewport {
  /** 视口中心点 */
  center: WidgetPoint;
  /** 缩放比例 */
  zoom: number;
}

/**
 * Widget外部双向绑定数据。
 */
export interface WidgetData {
  /** Widget能力标识符 */
  name: string;
  /** Widget能力描述 */
  description: string;
  /** Widget能力入参 schema */
  inputSchema: WidgetSchemaObject;
  /** Widget运行状态 schema */
  stateSchema: WidgetSchemaObject;
  /** Widget交互脚本配置 */
  execute?: WidgetExecuteMethod;
  /** Widget元信息 */
  metadata: WidgetMetadata;
  /** 元素数据 */
  elements: WidgetElement[];
  /** 视口数据 */
  viewport: WidgetViewport;
}

/**
 * 当前设置面板可编辑目标。
 */
export type WidgetSelectTarget = WidgetElement | WidgetMetadata | null;

/**
 * Widget历史快照。
 */
export interface WidgetBoardSnapshot {
  /** 元素快照 */
  elements: WidgetElement[];
  /** 选区快照 */
  selection: string[];
  /** 视口快照 */
  viewport: WidgetViewport;
  /** 当前交互草稿 */
  draft?: {
    /** 草稿类型 */
    kind: 'creating-shape';
    /** 元素注册名称 */
    name: string;
    /** 拖拽起点 */
    start: WidgetPoint;
    /** 当前指针点 */
    current: WidgetPoint;
  };
}

/**
 * BWidget Widget状态。
 */
export interface WidgetBoardState extends WidgetBoardSnapshot {
  /** 历史记录 */
  history: {
    /** 可撤销快照 */
    past: WidgetBoardSnapshot[];
    /** 可重做快照 */
    future: WidgetBoardSnapshot[];
  };
  /** 最近一次错误 */
  lastError?: Error;
}
