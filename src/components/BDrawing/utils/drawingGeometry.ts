/**
 * @file drawingGeometry.ts
 * @description BDrawing 画布坐标、SVG 几何和 DOM 查询工具。
 */
import type {
  DrawingConnectorAnchor,
  DrawingConnectorElement,
  DrawingElement,
  DrawingPoint,
  DrawingShapeElement,
  DrawingShapeType,
  DrawingSize,
  DrawingViewport
} from '../types';
import { DRAWING_ELEMENT_ID_ATTRIBUTE } from '../constants/dom';
import { DRAWING_MIN_ZOOM, DRAWING_VIEWBOX_SIZE } from '../constants/viewport';
import { measureDrawingTextElementSize } from './drawingTextMetrics';

/**
 * 浏览器矩形信息。
 */
interface DrawingClientRect {
  /** 左侧浏览器坐标 */
  left: number;
  /** 顶部浏览器坐标 */
  top: number;
  /** 渲染宽度 */
  width: number;
  /** 渲染高度 */
  height: number;
}

/**
 * 浏览器坐标在画布中的投影信息。
 */
export interface DrawingCanvasPointProjection {
  /** 投影后的画板坐标 */
  boardPoint: DrawingPoint;
  /** 坐标在画布渲染区域中的比例 */
  viewportRatio: DrawingPoint;
  /** 当前画布渲染尺寸 */
  viewportSize: DrawingSize;
}

/**
 * 连接线路径计算时临时覆盖的形状几何。
 */
export interface DrawingConnectorPathElementOverride {
  /** 元素 ID */
  id: string;
  /** 预览位置 */
  position?: DrawingPoint;
  /** 预览尺寸 */
  size?: DrawingSize;
}

/**
 * 连接线端点标记位置。
 */
export type DrawingConnectorMarkerPlacement = 'start' | 'end';

/**
 * 连接线解析后的端点和控制点。
 */
interface DrawingConnectorRoute {
  /** 起点 */
  source: DrawingPoint;
  /** 终点 */
  target: DrawingPoint;
  /** 起点控制点 */
  sourceControl?: DrawingPoint;
  /** 终点控制点 */
  targetControl?: DrawingPoint;
}

/**
 * 连接线端点坐标。
 */
export interface DrawingConnectorEndpointPoints {
  /** 起点坐标 */
  source: DrawingPoint;
  /** 终点坐标 */
  target: DrawingPoint;
}

/**
 * 画板内容边界。
 */
interface DrawingContentBounds {
  /** 左侧边界 */
  minX: number;
  /** 顶部边界 */
  minY: number;
  /** 右侧边界 */
  maxX: number;
  /** 底部边界 */
  maxY: number;
}

/** 连接线箭头长度。 */
const DRAWING_CONNECTOR_ARROW_LENGTH = 12;
/** 连接线箭头半宽。 */
const DRAWING_CONNECTOR_ARROW_HALF_WIDTH = 4.5;

/**
 * 连接线箭头几何。
 */
interface DrawingConnectorMarkerGeometry {
  /** 箭头尖端 */
  tip: DrawingPoint;
  /** 箭头底边中心 */
  baseCenter: DrawingPoint;
  /** 箭头底边左点 */
  left: DrawingPoint;
  /** 箭头底边右点 */
  right: DrawingPoint;
}

/**
 * 判断元素是否为形状。
 * @param element - 画板元素
 * @returns 是否为形状元素
 */
export function isDrawingShapeElement(element: DrawingElement): element is DrawingShapeElement {
  return element.kind === 'shape';
}

/**
 * 判断元素是否为连接线。
 * @param element - 画板元素
 * @returns 是否为连接线元素
 */
export function isDrawingConnectorElement(element: DrawingElement): element is DrawingConnectorElement {
  return element.kind === 'connector';
}

/**
 * 判断形状是否按菱形渲染。
 * @param shape - 形状类型
 * @returns 是否为菱形
 */
export function isDrawingDiamondShape(shape: DrawingShapeType): boolean {
  return shape === 'decision' || shape === 'diamond';
}

/**
 * 根据缩放比例计算 viewBox 尺寸。
 * @param zoom - 缩放比例
 * @returns viewBox 尺寸
 */
export function getDrawingViewBoxSize(zoom: number): DrawingSize {
  return {
    width: DRAWING_VIEWBOX_SIZE.width / zoom,
    height: DRAWING_VIEWBOX_SIZE.height / zoom
  };
}

/**
 * 根据渲染尺寸和缩放比例计算动态 viewBox 尺寸。
 * @param zoom - 缩放比例
 * @param viewportSize - 画布渲染尺寸
 * @returns viewBox 尺寸
 */
export function getDrawingResponsiveViewBoxSize(zoom: number, viewportSize: DrawingSize): DrawingSize {
  if (!viewportSize.width || !viewportSize.height) {
    return getDrawingViewBoxSize(zoom);
  }

  return {
    width: viewportSize.width / zoom,
    height: viewportSize.height / zoom
  };
}

/**
 * 根据元素列表计算内容边界。
 * @param elements - 画板元素列表
 * @returns 内容边界，无可见元素时返回 null
 */
function getDrawingContentBounds(elements: DrawingElement[]): DrawingContentBounds | null {
  const visibleElements = elements.filter((element: DrawingElement): boolean => element.size.width > 0 && element.size.height > 0);
  if (!visibleElements.length) {
    return null;
  }

  return visibleElements.reduce<DrawingContentBounds>(
    (bounds: DrawingContentBounds, element: DrawingElement): DrawingContentBounds => ({
      minX: Math.min(bounds.minX, element.position.x),
      minY: Math.min(bounds.minY, element.position.y),
      maxX: Math.max(bounds.maxX, element.position.x + element.size.width),
      maxY: Math.max(bounds.maxY, element.position.y + element.size.height)
    }),
    {
      minX: visibleElements[0].position.x,
      minY: visibleElements[0].position.y,
      maxX: visibleElements[0].position.x + visibleElements[0].size.width,
      maxY: visibleElements[0].position.y + visibleElements[0].size.height
    }
  );
}

/**
 * 创建能够完整展示现有内容的视口。
 * @param elements - 画板元素列表
 * @param viewportSize - 画布渲染尺寸
 * @param padding - 内容周围留白
 * @returns 适配内容的视口，无内容时返回 null
 */
export function createDrawingViewportForElements(elements: DrawingElement[], viewportSize: DrawingSize, padding = 80): DrawingViewport | null {
  const bounds = getDrawingContentBounds(elements);
  if (!bounds) {
    return null;
  }

  const size = viewportSize.width && viewportSize.height ? viewportSize : DRAWING_VIEWBOX_SIZE;
  const contentWidth = bounds.maxX - bounds.minX + padding * 2;
  const contentHeight = bounds.maxY - bounds.minY + padding * 2;
  const fitZoom = Math.min(1, size.width / contentWidth, size.height / contentHeight);

  return {
    center: {
      x: Number(((bounds.minX + bounds.maxX) / 2).toFixed(2)),
      y: Number(((bounds.minY + bounds.maxY) / 2).toFixed(2))
    },
    zoom: Number(Math.max(DRAWING_MIN_ZOOM, fitZoom).toFixed(2))
  };
}

/**
 * 将浏览器像素位移换算为画板坐标位移。
 * @param delta - 浏览器像素位移
 * @param viewportSize - 画布渲染尺寸
 * @param zoom - 当前缩放比例
 * @returns 画板坐标位移，无法读取尺寸时返回 null
 */
export function clientDeltaToDrawingDelta(delta: DrawingPoint, viewportSize: DrawingSize, zoom: number): DrawingPoint | null {
  if (!viewportSize.width || !viewportSize.height) {
    return null;
  }

  const viewBoxSize = getDrawingResponsiveViewBoxSize(zoom, viewportSize);

  return {
    x: (delta.x * viewBoxSize.width) / viewportSize.width,
    y: (delta.y * viewBoxSize.height) / viewportSize.height
  };
}

/**
 * 创建 SVG viewBox 字符串。
 * @param viewport - 当前画布视口
 * @param viewportSize - 可选画布渲染尺寸
 * @returns SVG viewBox 属性值
 */
export function createDrawingViewBox(viewport: DrawingViewport, viewportSize: DrawingSize = DRAWING_VIEWBOX_SIZE): string {
  const size = getDrawingResponsiveViewBoxSize(viewport.zoom, viewportSize);

  return `${viewport.center.x - size.width / 2} ${viewport.center.y - size.height / 2} ${size.width} ${size.height}`;
}

/**
 * 将浏览器坐标投影到画板坐标系。
 * @param clientPoint - 浏览器坐标
 * @param rect - 画布渲染矩形
 * @param viewport - 当前视口
 * @returns 画布投影信息，无法读取尺寸时返回 null
 */
export function projectClientPointToDrawingBoard(
  clientPoint: DrawingPoint,
  rect: DrawingClientRect,
  viewport: DrawingViewport
): DrawingCanvasPointProjection | null {
  if (!rect.width || !rect.height) {
    return null;
  }

  const viewportSize = {
    width: rect.width,
    height: rect.height
  };
  const viewBoxSize = getDrawingResponsiveViewBoxSize(viewport.zoom, viewportSize);
  const xRatio = (clientPoint.x - rect.left) / rect.width;
  const yRatio = (clientPoint.y - rect.top) / rect.height;

  return {
    boardPoint: {
      x: viewport.center.x - viewBoxSize.width / 2 + xRatio * viewBoxSize.width,
      y: viewport.center.y - viewBoxSize.height / 2 + yRatio * viewBoxSize.height
    },
    viewportRatio: {
      x: xRatio,
      y: yRatio
    },
    viewportSize
  };
}

/**
 * 读取 DOM 目标绑定的画板元素 ID。
 * @param target - DOM 目标
 * @returns 元素 ID
 */
export function getDrawingElementId(target?: Element | null): string | null {
  return target?.getAttribute(DRAWING_ELEMENT_ID_ATTRIBUTE) ?? null;
}

/**
 * 通过元素 ID 查询 DOM target。
 * @param root - 查询根节点
 * @param id - 元素 ID
 * @returns DOM target
 */
export function queryDrawingElementTarget(root: ParentNode | null | undefined, id: string): Element | null {
  return root?.querySelector(`[${DRAWING_ELEMENT_ID_ATTRIBUTE}="${id}"]`) ?? null;
}

/**
 * 通过元素 ID 查询形状元素。
 * @param elements - 画板元素列表
 * @param id - 元素 ID
 * @returns 形状元素
 */
export function findDrawingShapeElement(elements: DrawingElement[], id: string): DrawingShapeElement | null {
  const element = elements.find((item) => item.id === id);

  return element && isDrawingShapeElement(element) ? element : null;
}

/**
 * 读取形状渲染时使用的有效尺寸。
 * @param element - 形状元素
 * @returns 渲染尺寸
 */
export function getDrawingShapeRenderSize(element: DrawingShapeElement): DrawingSize {
  if (element.shape === 'text') {
    return measureDrawingTextElementSize(element.text, element.style);
  }

  return element.size;
}

/**
 * 读取画板元素渲染时使用的有效尺寸。
 * @param element - 画板元素
 * @returns 渲染尺寸
 */
export function getDrawingElementRenderSize(element: DrawingElement): DrawingSize {
  return isDrawingShapeElement(element) ? getDrawingShapeRenderSize(element) : element.size;
}

/**
 * 应用连接线路径计算时的临时几何覆盖。
 * @param element - 原始形状元素
 * @param overrides - 临时几何覆盖列表
 * @returns 应用覆盖后的形状元素
 */
function applyConnectorPathElementOverride(element: DrawingShapeElement, overrides: DrawingConnectorPathElementOverride[]): DrawingShapeElement {
  const override = overrides.find((item: DrawingConnectorPathElementOverride): boolean => item.id === element.id);
  if (!override) {
    return element;
  }

  return {
    ...element,
    position: override.position ?? element.position,
    size: override.size ?? element.size
  };
}

/**
 * 读取元素中心点。
 * @param element - 画板元素
 * @returns 中心点
 */
export function getDrawingElementCenter(element: DrawingElement): DrawingPoint {
  const size = getDrawingElementRenderSize(element);

  return {
    x: element.position.x + size.width / 2,
    y: element.position.y + size.height / 2
  };
}

/**
 * 读取形状元素指定锚点的画板坐标。
 * @param element - 形状元素
 * @param anchor - 锚点
 * @returns 锚点坐标
 */
export function getDrawingConnectorAnchorPoint(element: DrawingShapeElement, anchor: DrawingConnectorAnchor): DrawingPoint {
  const center = getDrawingElementCenter(element);
  const size = getDrawingShapeRenderSize(element);

  if (anchor === 'top') {
    return { x: center.x, y: element.position.y };
  }
  if (anchor === 'right') {
    return { x: element.position.x + size.width, y: center.y };
  }
  if (anchor === 'bottom') {
    return { x: center.x, y: element.position.y + size.height };
  }
  if (anchor === 'left') {
    return { x: element.position.x, y: center.y };
  }

  return center;
}

/**
 * 通过元素 ID 读取中心点。
 * @param elements - 画板元素列表
 * @param id - 元素 ID
 * @returns 中心点，找不到时返回 null
 */
export function findDrawingElementCenter(elements: DrawingElement[], id: string): DrawingPoint | null {
  const element = elements.find((item) => item.id === id);

  return element ? getDrawingElementCenter(element) : null;
}

/**
 * 创建直线 SVG 路径。
 * @param source - 起点
 * @param target - 终点
 * @returns SVG path d 属性值
 */
export function createDrawingLinePath(source: DrawingPoint, target: DrawingPoint): string {
  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

/**
 * 创建点位差向量。
 * @param from - 起点
 * @param to - 终点
 * @returns 差向量
 */
function createDrawingVector(from: DrawingPoint, to: DrawingPoint): DrawingPoint {
  return {
    x: to.x - from.x,
    y: to.y - from.y
  };
}

/**
 * 归一化方向向量。
 * @param vector - 原始方向向量
 * @returns 单位方向向量
 */
function normalizeDrawingVector(vector: DrawingPoint): DrawingPoint {
  const length = Math.hypot(vector.x, vector.y);
  if (!length) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

/**
 * 读取连接线箭头类型。
 * @param connector - 连接线元素
 * @param placement - 标记位置
 * @returns 箭头类型
 */
function getDrawingConnectorMarkerType(connector: DrawingConnectorElement, placement: DrawingConnectorMarkerPlacement): string {
  return placement === 'start' ? connector.markerStart ?? 'none' : connector.markerEnd ?? 'arrow';
}

/**
 * 读取连接线箭头切线方向。
 * @param route - 连接线路线
 * @param placement - 标记位置
 * @returns 箭头方向
 */
function getDrawingConnectorMarkerDirection(route: DrawingConnectorRoute, placement: DrawingConnectorMarkerPlacement): DrawingPoint {
  const tangent =
    placement === 'start'
      ? createDrawingVector(route.sourceControl ?? route.target, route.source)
      : createDrawingVector(route.targetControl ?? route.source, route.target);

  return normalizeDrawingVector(tangent);
}

/**
 * 创建连接线箭头几何。
 * @param route - 连接线路线
 * @param placement - 标记位置
 * @returns 箭头几何
 */
function createDrawingConnectorMarkerGeometry(route: DrawingConnectorRoute, placement: DrawingConnectorMarkerPlacement): DrawingConnectorMarkerGeometry {
  const tip = placement === 'start' ? route.source : route.target;
  const direction = getDrawingConnectorMarkerDirection(route, placement);
  const baseCenter = {
    x: tip.x - direction.x * DRAWING_CONNECTOR_ARROW_LENGTH,
    y: tip.y - direction.y * DRAWING_CONNECTOR_ARROW_LENGTH
  };
  const perpendicular = {
    x: -direction.y,
    y: direction.x
  };
  const left = {
    x: baseCenter.x + perpendicular.x * DRAWING_CONNECTOR_ARROW_HALF_WIDTH,
    y: baseCenter.y + perpendicular.y * DRAWING_CONNECTOR_ARROW_HALF_WIDTH
  };
  const right = {
    x: baseCenter.x - perpendicular.x * DRAWING_CONNECTOR_ARROW_HALF_WIDTH,
    y: baseCenter.y - perpendicular.y * DRAWING_CONNECTOR_ARROW_HALF_WIDTH
  };

  return {
    tip,
    baseCenter,
    left,
    right
  };
}

/**
 * 读取连接锚点对应的切线方向。
 * @param anchor - 连接线锚点
 * @returns 单位方向向量
 */
function getConnectorAnchorDirection(anchor: DrawingConnectorAnchor): DrawingPoint {
  if (anchor === 'top') {
    return { x: 0, y: -1 };
  }
  if (anchor === 'right') {
    return { x: 1, y: 0 };
  }
  if (anchor === 'bottom') {
    return { x: 0, y: 1 };
  }
  if (anchor === 'left') {
    return { x: -1, y: 0 };
  }

  return { x: 1, y: 0 };
}

/**
 * 创建三次贝塞尔路线控制点。
 * @param source - 起点
 * @param target - 终点
 * @param sourceAnchor - 起点锚点
 * @param targetAnchor - 终点锚点
 * @returns 连接线解析路线
 */
function createDrawingBezierRoute(
  source: DrawingPoint,
  target: DrawingPoint,
  sourceAnchor: DrawingConnectorAnchor,
  targetAnchor: DrawingConnectorAnchor
): DrawingConnectorRoute {
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  const handleLength = Math.max(48, distance * 0.35);
  const sourceDirection = getConnectorAnchorDirection(sourceAnchor);
  const targetDirection = getConnectorAnchorDirection(targetAnchor);
  const sourceControl = {
    x: source.x + sourceDirection.x * handleLength,
    y: source.y + sourceDirection.y * handleLength
  };
  const targetControl = {
    x: target.x + targetDirection.x * handleLength,
    y: target.y + targetDirection.y * handleLength
  };

  return {
    source,
    target,
    sourceControl,
    targetControl
  };
}

/**
 * 创建三次贝塞尔 SVG 路径。
 * @param source - 起点
 * @param target - 终点
 * @param sourceAnchor - 起点锚点
 * @param targetAnchor - 终点锚点
 * @returns SVG path d 属性值
 */
export function createDrawingBezierPath(
  source: DrawingPoint,
  target: DrawingPoint,
  sourceAnchor: DrawingConnectorAnchor,
  targetAnchor: DrawingConnectorAnchor
): string {
  const route = createDrawingBezierRoute(source, target, sourceAnchor, targetAnchor);

  return `M ${route.source.x} ${route.source.y} C ${route.sourceControl?.x ?? route.source.x} ${route.sourceControl?.y ?? route.source.y}, ${
    route.targetControl?.x ?? route.target.x
  } ${route.targetControl?.y ?? route.target.y}, ${route.target.x} ${route.target.y}`;
}

/**
 * 解析连接线端点和控制点。
 * @param elements - 画板元素列表
 * @param connector - 连接线元素
 * @param overrides - 预览中的形状几何覆盖
 * @returns 连接线路线，端点缺失时返回 null
 */
function resolveDrawingConnectorRoute(
  elements: DrawingElement[],
  connector: DrawingConnectorElement,
  overrides: DrawingConnectorPathElementOverride[] = []
): DrawingConnectorRoute | null {
  const sourceElement = findDrawingShapeElement(elements, connector.source.elementId);
  const targetElement = findDrawingShapeElement(elements, connector.target.elementId);
  if (!sourceElement || !targetElement) {
    return null;
  }

  const source = applyConnectorPathElementOverride(sourceElement, overrides);
  const target = applyConnectorPathElementOverride(targetElement, overrides);
  const sourcePoint = getDrawingConnectorAnchorPoint(source, connector.source.anchor);
  const targetPoint = getDrawingConnectorAnchorPoint(target, connector.target.anchor);

  if (connector.curve === 'bezier') {
    return createDrawingBezierRoute(sourcePoint, targetPoint, connector.source.anchor, connector.target.anchor);
  }

  return {
    source: sourcePoint,
    target: targetPoint
  };
}

/**
 * 根据箭头占位裁剪连接线本体端点。
 * @param route - 原始连接线路线
 * @param connector - 连接线元素
 * @returns 裁剪后的连接线路线
 */
function trimDrawingConnectorRouteForMarkers(route: DrawingConnectorRoute, connector: DrawingConnectorElement): DrawingConnectorRoute {
  const source = getDrawingConnectorMarkerType(connector, 'start') === 'arrow' ? createDrawingConnectorMarkerGeometry(route, 'start').baseCenter : route.source;
  const target = getDrawingConnectorMarkerType(connector, 'end') === 'arrow' ? createDrawingConnectorMarkerGeometry(route, 'end').baseCenter : route.target;

  return {
    ...route,
    source,
    target
  };
}

/**
 * 解析连接线端点坐标。
 * @param elements - 画板元素列表
 * @param connector - 连接线元素
 * @param overrides - 预览中的形状几何覆盖
 * @returns 连接线端点坐标，端点缺失时返回 null
 */
export function resolveDrawingConnectorEndpointPoints(
  elements: DrawingElement[],
  connector: DrawingConnectorElement,
  overrides: DrawingConnectorPathElementOverride[] = []
): DrawingConnectorEndpointPoints | null {
  const route = resolveDrawingConnectorRoute(elements, connector, overrides);
  if (!route) {
    return null;
  }

  return {
    source: route.source,
    target: route.target
  };
}

/**
 * 创建连接线元素路径。
 * @param elements - 画板元素列表
 * @param connector - 连接线元素
 * @param overrides - 预览中的形状几何覆盖
 * @returns SVG path d 属性值，端点缺失时返回空字符串
 */
export function createDrawingConnectorPath(
  elements: DrawingElement[],
  connector: DrawingConnectorElement,
  overrides: DrawingConnectorPathElementOverride[] = []
): string {
  const resolvedRoute = resolveDrawingConnectorRoute(elements, connector, overrides);
  if (!resolvedRoute) {
    return '';
  }

  const route = trimDrawingConnectorRouteForMarkers(resolvedRoute, connector);
  if (connector.curve === 'bezier') {
    return `M ${route.source.x} ${route.source.y} C ${route.sourceControl?.x ?? route.source.x} ${route.sourceControl?.y ?? route.source.y}, ${
      route.targetControl?.x ?? route.target.x
    } ${route.targetControl?.y ?? route.target.y}, ${route.target.x} ${route.target.y}`;
  }

  return createDrawingLinePath(route.source, route.target);
}

/**
 * 创建独立渲染的连接线箭头路径。
 * @param elements - 画板元素列表
 * @param connector - 连接线元素
 * @param placement - 标记位置
 * @param overrides - 预览中的形状几何覆盖
 * @returns SVG path d 属性值，不显示标记时返回空字符串
 */
export function createDrawingConnectorMarkerPath(
  elements: DrawingElement[],
  connector: DrawingConnectorElement,
  placement: DrawingConnectorMarkerPlacement,
  overrides: DrawingConnectorPathElementOverride[] = []
): string {
  const route = resolveDrawingConnectorRoute(elements, connector, overrides);
  if (!route) {
    return '';
  }

  const markerType = placement === 'start' ? connector.markerStart ?? 'none' : connector.markerEnd ?? 'arrow';
  if (markerType !== 'arrow') {
    return '';
  }

  const marker = createDrawingConnectorMarkerGeometry(route, placement);

  return `M ${marker.tip.x} ${marker.tip.y} L ${marker.left.x} ${marker.left.y} L ${marker.right.x} ${marker.right.y} Z`;
}

/**
 * 计算直线标签位置。
 * @param source - 起点
 * @param target - 终点
 * @returns 标签中心点
 */
export function getDrawingLineLabelPosition(source: DrawingPoint, target: DrawingPoint): DrawingPoint {
  return {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2 - 8
  };
}

/**
 * 创建 SVG 元素 transform 字符串。
 * @param position - 元素位置
 * @param size - 元素尺寸
 * @param rotation - 旋转角度
 * @returns SVG transform 属性值
 */
export function createDrawingElementTransform(position: DrawingPoint, size: DrawingSize, rotation: number): string {
  if (!rotation) {
    return `translate(${position.x}, ${position.y})`;
  }

  return `translate(${position.x}, ${position.y}) rotate(${rotation}, ${size.width / 2}, ${size.height / 2})`;
}

/**
 * 生成菱形 SVG polygon 点位。
 * @param size - 元素尺寸
 * @param position - 可选左上角位置
 * @returns SVG polygon points 属性值
 */
export function createDrawingDiamondPoints(size: DrawingSize, position: DrawingPoint = { x: 0, y: 0 }): string {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const left = position.x;
  const top = position.y;
  const right = left + size.width;
  const bottom = top + size.height;

  return `${left + halfWidth},${top} ${right},${top + halfHeight} ${left + halfWidth},${bottom} ${left},${top + halfHeight}`;
}
