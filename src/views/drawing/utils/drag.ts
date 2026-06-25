/**
 * @file drag.ts
 * @description 画图页面元素拖拽数据读写工具。
 */

/**
 * 画图元素拖拽 MIME 类型。
 */
export const DRAWING_ELEMENT_DRAG_MIME = 'application/x-tibis-drawing-element';

/**
 * 画图元素拖拽数据。
 */
export interface DrawingElementDragData {
  /** 元素注册名称 */
  name: string;
}

/**
 * 判断未知数据是否为元素拖拽数据。
 * @param value - 待判断数据
 * @returns 是否为元素拖拽数据
 */
function isDrawingElementDragData(value: unknown): value is DrawingElementDragData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof DrawingElementDragData, unknown>>;

  return typeof candidate.name === 'string';
}

/**
 * 写入元素拖拽数据。
 * @param dataTransfer - 浏览器拖拽数据对象
 * @param data - 元素拖拽数据
 */
export function setDrawingElementDragData(dataTransfer: DataTransfer | null, data: DrawingElementDragData): void {
  if (!dataTransfer) {
    return;
  }

  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(DRAWING_ELEMENT_DRAG_MIME, JSON.stringify(data));
}

/**
 * 读取元素拖拽数据。
 * @param dataTransfer - 浏览器拖拽数据对象
 * @returns 元素拖拽数据，格式无效时返回 null
 */
export function getDrawingElementDragData(dataTransfer: DataTransfer | null): DrawingElementDragData | null {
  const rawData = dataTransfer?.getData(DRAWING_ELEMENT_DRAG_MIME);
  if (!rawData) {
    return null;
  }

  try {
    const parsedData: unknown = JSON.parse(rawData);

    return isDrawingElementDragData(parsedData) ? parsedData : null;
  } catch {
    return null;
  }
}
