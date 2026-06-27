/**
 * @file layerOrder.ts
 * @description 画图侧栏图层展示顺序与画布元素数据顺序的转换工具。
 */
import type { DrawingElement } from '@/components/BDrawing/types';

/**
 * 图层移动插入位置，含义基于侧栏从上到下的视觉顺序。
 */
export type DrawingLayerMovePosition = 'before' | 'after';

/**
 * 判断两组元素是否保持相同层级顺序。
 * @param currentElements - 当前元素列表
 * @param nextElements - 调整后的元素列表
 * @returns 是否为相同顺序
 */
function isSameDrawingLayerOrder(currentElements: DrawingElement[], nextElements: DrawingElement[]): boolean {
  return (
    currentElements.length === nextElements.length &&
    currentElements.every((element: DrawingElement, index: number): boolean => element.id === nextElements[index]?.id)
  );
}

/**
 * 按侧栏视觉顺序移动画图元素，并返回画布真实层级顺序。
 * 画布元素数组按从底层到顶层存储，侧栏为方便查看会倒序展示。
 * @param elements - 当前画布元素列表
 * @param sourceElementId - 被拖拽元素 ID
 * @param targetElementId - 命中的目标元素 ID
 * @param position - 插入到目标元素视觉上的前方或后方
 * @returns 调整后的画布元素列表；无效移动时返回原数组引用
 */
export function reorderDrawingLayerElementsByDisplayPosition(
  elements: DrawingElement[],
  sourceElementId: string,
  targetElementId: string,
  position: DrawingLayerMovePosition
): DrawingElement[] {
  if (sourceElementId === targetElementId) {
    return elements;
  }

  const displayElements = [...elements].reverse();
  const sourceIndex = displayElements.findIndex((element: DrawingElement): boolean => element.id === sourceElementId);
  const targetIndex = displayElements.findIndex((element: DrawingElement): boolean => element.id === targetElementId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return elements;
  }

  const [sourceElement] = displayElements.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = displayElements.findIndex((element: DrawingElement): boolean => element.id === targetElementId);
  if (!sourceElement || targetIndexAfterRemoval === -1) {
    return elements;
  }

  const insertIndex = position === 'before' ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
  displayElements.splice(insertIndex, 0, sourceElement);
  const nextElements = displayElements.reverse();

  return isSameDrawingLayerOrder(elements, nextElements) ? elements : nextElements;
}
