/**
 * @file drawingGeometry.ts
 * @description BDrawing 画布坐标、几何和 DOM 查询工具。
 */
import type { DrawingElement, DrawingPoint, DrawingShapeElement, DrawingSize, DrawingViewport } from '../types';
import { DRAWING_ELEMENT_ID_ATTRIBUTE } from '../constants/dom';
import { DRAWING_MIN_ZOOM, DRAWING_VIEWBOX_SIZE } from '../constants/viewport';
import { getDrawingElementSchema } from '../elements';

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

/**
 * 可见元素及其渲染尺寸。
 */
interface DrawingVisibleElement {
  /** 画板元素 */
  element: DrawingElement;
  /** 渲染尺寸 */
  renderSize: DrawingSize;
}

/**
 * 根据缩放比例计算 viewBox 尺寸。
 * @param zoom - 缩放比例
 * @returns viewBox 尺寸
 */
function getDrawingViewBoxSize(zoom: number): DrawingSize {
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
 * 读取形状渲染时使用的有效尺寸。
 * @param element - 形状元素
 * @returns 渲染尺寸
 */
export function getDrawingShapeRenderSize(element: DrawingShapeElement): DrawingSize {
  const renderSize = getDrawingElementSchema(element.name)?.renderSize;
  if (!renderSize) {
    return element.size;
  }

  const contentSize = renderSize.measureContent(element);

  return {
    width: renderSize.width === 'content' ? contentSize.width : element.size.width,
    height: renderSize.height === 'content' ? contentSize.height : element.size.height
  };
}

/**
 * 根据元素列表计算内容边界。
 * @param elements - 画板元素列表
 * @returns 内容边界，无可见元素时返回 null
 */
function getDrawingContentBounds(elements: DrawingElement[]): DrawingContentBounds | null {
  const visibleElements = elements
    .map(
      (element: DrawingElement): DrawingVisibleElement => ({
        element,
        renderSize: getDrawingShapeRenderSize(element)
      })
    )
    .filter((item: DrawingVisibleElement): boolean => item.renderSize.width > 0 && item.renderSize.height > 0);
  if (!visibleElements.length) {
    return null;
  }

  return visibleElements.reduce<DrawingContentBounds>(
    (bounds: DrawingContentBounds, item: DrawingVisibleElement): DrawingContentBounds => ({
      minX: Math.min(bounds.minX, item.element.position.x),
      minY: Math.min(bounds.minY, item.element.position.y),
      maxX: Math.max(bounds.maxX, item.element.position.x + item.renderSize.width),
      maxY: Math.max(bounds.maxY, item.element.position.y + item.renderSize.height)
    }),
    {
      minX: visibleElements[0].element.position.x,
      minY: visibleElements[0].element.position.y,
      maxX: visibleElements[0].element.position.x + visibleElements[0].renderSize.width,
      maxY: visibleElements[0].element.position.y + visibleElements[0].renderSize.height
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
  return elements.find((item) => item.id === id) ?? null;
}

/**
 * 创建 HTML 元素 transform 字符串。
 * @param position - 元素位置
 * @param rotation - 旋转角度
 * @returns CSS transform 属性值
 */
export function createDrawingElementCssTransform(position: DrawingPoint, rotation: number): string {
  const translate = `translate(${position.x}px, ${position.y}px)`;

  return rotation ? `${translate} rotate(${rotation}deg)` : translate;
}
