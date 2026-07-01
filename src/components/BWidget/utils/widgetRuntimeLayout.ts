/**
 * @file widgetRuntimeLayout.ts
 * @description BWidget 运行态内容边界布局工具。
 */
import type { WidgetElement, WidgetPoint, WidgetShapeElement, WidgetSize } from '../types';
import type { WidgetRenderContext } from 'types/widget';
import { getWidgetShapeRenderSize } from './widgetGeometry';

/**
 * 运行态内容边界。
 */
export interface WidgetRuntimeBounds {
  /** 左侧边界 */
  minX: number;
  /** 顶部边界 */
  minY: number;
  /** 右侧边界 */
  maxX: number;
  /** 底部边界 */
  maxY: number;
  /** 边界宽度 */
  width: number;
  /** 边界高度 */
  height: number;
}

/**
 * 运行态元素布局。
 */
export interface WidgetRuntimeElementLayout {
  /** 原始元素 */
  element: WidgetShapeElement;
  /** 平移后的运行态位置 */
  position: WidgetPoint;
  /** 渲染尺寸 */
  renderSize: WidgetSize;
}

/**
 * 运行态Widget布局。
 */
export interface WidgetRuntimeLayout {
  /** 原始内容边界 */
  bounds: WidgetRuntimeBounds;
  /** 加上留白后的内容尺寸 */
  contentSize: WidgetSize;
  /** 原始坐标到运行态舞台坐标的平移量 */
  offset: WidgetPoint;
  /** 运行态元素布局 */
  elements: WidgetRuntimeElementLayout[];
}

/**
 * 运行态元素测量结果。
 */
interface WidgetRuntimeMeasuredElement {
  /** 原始元素 */
  element: WidgetShapeElement;
  /** 渲染尺寸 */
  renderSize: WidgetSize;
  /** 视觉边界 */
  bounds: WidgetRuntimeBounds;
}

/** 空运行态布局最小内容尺寸。 */
const WIDGET_RUNTIME_EMPTY_CONTENT_SIZE: WidgetSize = { width: 1, height: 1 };

/**
 * 规整浮点边界值，避免 90 度旋转产生 9.999999999 这类显示噪声。
 * @param value - 原始数值
 * @returns 规整后的数值
 */
function normalizeRuntimeMetric(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * 创建运行态边界对象。
 * @param minX - 左侧边界
 * @param minY - 顶部边界
 * @param maxX - 右侧边界
 * @param maxY - 底部边界
 * @returns 运行态边界
 */
function createRuntimeBounds(minX: number, minY: number, maxX: number, maxY: number): WidgetRuntimeBounds {
  const normalizedMinX = normalizeRuntimeMetric(minX);
  const normalizedMinY = normalizeRuntimeMetric(minY);
  const normalizedMaxX = normalizeRuntimeMetric(maxX);
  const normalizedMaxY = normalizeRuntimeMetric(maxY);

  return {
    minX: normalizedMinX,
    minY: normalizedMinY,
    maxX: normalizedMaxX,
    maxY: normalizedMaxY,
    width: normalizeRuntimeMetric(normalizedMaxX - normalizedMinX),
    height: normalizeRuntimeMetric(normalizedMaxY - normalizedMinY)
  };
}

/**
 * 将角度转换为弧度。
 * @param degrees - 角度
 * @returns 弧度
 */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 计算点绕中心点旋转后的坐标。
 * @param point - 原始点
 * @param center - 旋转中心
 * @param radians - 旋转弧度
 * @returns 旋转后的点
 */
function rotatePoint(point: WidgetPoint, center: WidgetPoint, radians: number): WidgetPoint {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;

  return {
    x: center.x + deltaX * cos - deltaY * sin,
    y: center.y + deltaX * sin + deltaY * cos
  };
}

/**
 * 计算单个元素的运行态视觉边界。
 * @param element - Widget元素
 * @param renderSize - 元素渲染尺寸
 * @returns 元素视觉边界
 */
function createElementRuntimeBounds(element: WidgetShapeElement, renderSize: WidgetSize): WidgetRuntimeBounds {
  const left = element.position.x;
  const top = element.position.y;
  const right = left + renderSize.width;
  const bottom = top + renderSize.height;

  if (!element.rotation) {
    return createRuntimeBounds(left, top, right, bottom);
  }

  const center = {
    x: left + renderSize.width / 2,
    y: top + renderSize.height / 2
  };
  const radians = degreesToRadians(element.rotation);
  const points = [
    rotatePoint({ x: left, y: top }, center, radians),
    rotatePoint({ x: right, y: top }, center, radians),
    rotatePoint({ x: right, y: bottom }, center, radians),
    rotatePoint({ x: left, y: bottom }, center, radians)
  ];
  const xValues = points.map((point: WidgetPoint): number => point.x);
  const yValues = points.map((point: WidgetPoint): number => point.y);

  return createRuntimeBounds(Math.min(...xValues), Math.min(...yValues), Math.max(...xValues), Math.max(...yValues));
}

/**
 * 判断元素布局是否可见。
 * @param renderSize - 元素渲染尺寸
 * @returns 是否可见
 */
function isVisibleRenderSize(renderSize: WidgetSize): boolean {
  return renderSize.width > 0 && renderSize.height > 0;
}

/**
 * 创建空运行态布局。
 * @returns 空布局
 */
function createEmptyRuntimeLayout(): WidgetRuntimeLayout {
  return {
    bounds: createRuntimeBounds(0, 0, 0, 0),
    contentSize: { ...WIDGET_RUNTIME_EMPTY_CONTENT_SIZE },
    offset: { x: 0, y: 0 },
    elements: []
  };
}

/**
 * 根据元素和渲染上下文创建运行态布局。
 * @param elements - Widget元素列表
 * @param renderContext - 运行态渲染上下文
 * @param padding - 内容留白
 * @returns 运行态布局
 */
export function createWidgetRuntimeLayout(elements: WidgetElement[], renderContext?: WidgetRenderContext, padding = 16): WidgetRuntimeLayout {
  const elementLayouts = elements
    .map((element: WidgetElement): WidgetRuntimeMeasuredElement => {
      const renderSize = getWidgetShapeRenderSize(element, renderContext);

      return {
        element,
        renderSize,
        bounds: createElementRuntimeBounds(element, renderSize)
      };
    })
    .filter((item: WidgetRuntimeMeasuredElement): boolean => isVisibleRenderSize(item.renderSize));

  if (!elementLayouts.length) {
    return createEmptyRuntimeLayout();
  }

  const bounds = elementLayouts.reduce<WidgetRuntimeBounds>(
    (currentBounds: WidgetRuntimeBounds, item: WidgetRuntimeMeasuredElement): WidgetRuntimeBounds =>
      createRuntimeBounds(
        Math.min(currentBounds.minX, item.bounds.minX),
        Math.min(currentBounds.minY, item.bounds.minY),
        Math.max(currentBounds.maxX, item.bounds.maxX),
        Math.max(currentBounds.maxY, item.bounds.maxY)
      ),
    elementLayouts[0].bounds
  );
  const offset = {
    x: padding - bounds.minX,
    y: padding - bounds.minY
  };

  return {
    bounds,
    contentSize: {
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    },
    offset,
    elements: elementLayouts.map(
      (item: WidgetRuntimeMeasuredElement): WidgetRuntimeElementLayout => ({
        element: item.element,
        renderSize: item.renderSize,
        position: {
          x: item.element.position.x + offset.x,
          y: item.element.position.y + offset.y
        }
      })
    )
  };
}
