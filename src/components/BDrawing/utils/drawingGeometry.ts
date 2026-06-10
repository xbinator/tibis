/**
 * @file drawingGeometry.ts
 * @description BDrawing 画布坐标、SVG 几何和 DOM 查询工具。
 */
import type { DrawingConnectorElement, DrawingElement, DrawingPoint, DrawingShapeElement, DrawingShapeType, DrawingSize, DrawingViewport } from '../types';
import { DRAWING_VIEWBOX_SIZE } from '../constants/defaults';

/**
 * 画布元素 ID 的 DOM 属性名。
 */
export const DRAWING_ELEMENT_ID_ATTRIBUTE = 'data-drawing-element-id';

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
 * 读取元素中心点。
 * @param element - 画板元素
 * @returns 中心点
 */
export function getDrawingElementCenter(element: DrawingElement): DrawingPoint {
  return {
    x: element.position.x + element.size.width / 2,
    y: element.position.y + element.size.height / 2
  };
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
