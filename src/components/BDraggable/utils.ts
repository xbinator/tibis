/**
 * @file utils.ts
 * @description BDraggable 公共拖拽排序计算工具。
 */
import type {
  BDraggableClosestEdge,
  BDraggableDirection,
  BDraggableItemKeyGetter,
  BDraggableItemRect,
  BDraggableMovePosition,
  BDraggablePlacement,
  BDraggableResolvePlacementParams
} from './types';

/** 拖拽数据中记录 BDraggable key 的字段名。 */
export const B_DRAGGABLE_DATA_KEY = 'bDraggableKey';
/** 拖拽数据中记录 BDraggable 实例 ID 的字段名。 */
export const B_DRAGGABLE_INSTANCE_DATA_KEY = 'bDraggableInstanceId';

/**
 * 判断拖拽数据是否属于 BDraggable。
 * @param data - Pragmatic Drag and Drop 的 user data
 * @returns 是否为 BDraggable 拖拽数据
 */
export function isBDraggableDragData(data: Record<string | symbol, unknown>): boolean {
  return typeof data[B_DRAGGABLE_DATA_KEY] === 'string';
}

/**
 * 将 Pragmatic hitbox 边缘映射为拖拽插入位置。
 * @param edge - 最近边缘
 * @param direction - 拖拽方向
 * @returns 插入位置
 */
export function closestEdgeToDraggableMovePosition(edge: BDraggableClosestEdge | null, direction: BDraggableDirection): BDraggableMovePosition {
  if (direction === 'horizontal') {
    return edge === 'left' ? 'before' : 'after';
  }

  return edge === 'top' ? 'before' : 'after';
}

/**
 * 在 hitbox edge 数据缺失时，根据指针相对目标项中线推导插入位置。
 * @param pointerPosition - 指针在滚动内容坐标系下的位置
 * @param targetRect - 当前命中目标项几何信息
 * @returns 插入位置
 */
function inferMovePositionFromPointer(pointerPosition: number, targetRect: BDraggableItemRect): BDraggableMovePosition {
  const targetMiddle = targetRect.start + targetRect.size / 2;

  return pointerPosition <= targetMiddle ? 'before' : 'after';
}

/**
 * 解析命中目标项上的插入位置。
 * @param params - 命中目标项、指针位置与最近边信息
 * @returns 插入位置
 */
function resolveTargetMovePosition(params: {
  /** 指针在滚动内容坐标系下的位置 */
  pointerPosition: number;
  /** 命中目标项几何信息 */
  targetRect: BDraggableItemRect;
  /** 拖拽库提供的最近边 */
  targetEdge: BDraggableClosestEdge | null;
  /** 拖拽排序方向 */
  direction: BDraggableDirection;
}): BDraggableMovePosition {
  if (params.targetEdge) {
    return closestEdgeToDraggableMovePosition(params.targetEdge, params.direction);
  }

  return inferMovePositionFromPointer(params.pointerPosition, params.targetRect);
}

/**
 * 当拖拽库没有提供有效目标项时，按指针位置推导最近的插入锚点。
 * @param pointerPosition - 指针在滚动内容坐标系下的位置
 * @param itemRects - 当前已注册列表项几何信息
 * @param sourceKey - 被拖拽项 key
 * @returns 插入位置，无可用目标时返回 null
 */
function resolveFallbackPlacementFromPointer(pointerPosition: number, itemRects: BDraggableItemRect[], sourceKey: string): BDraggablePlacement | null {
  const candidateRects = itemRects.filter((rect: BDraggableItemRect): boolean => rect.key !== sourceKey);
  if (candidateRects.length === 0) {
    return null;
  }

  const beforeTarget = candidateRects.find((rect: BDraggableItemRect): boolean => pointerPosition <= rect.start + rect.size / 2);
  if (beforeTarget) {
    return {
      targetKey: beforeTarget.key,
      position: 'before'
    };
  }

  const lastTarget = candidateRects[candidateRects.length - 1];

  return {
    targetKey: lastTarget.key,
    position: 'after'
  };
}

/**
 * 判断两个列表是否保持相同引用顺序。
 * @param currentList - 当前列表
 * @param nextList - 调整后的列表
 * @returns 是否为相同顺序
 */
function isSameDraggableListOrder<TItem>(currentList: TItem[], nextList: TItem[]): boolean {
  return currentList.length === nextList.length && currentList.every((item: TItem, index: number): boolean => Object.is(item, nextList[index]));
}

/**
 * 根据指针位置与当前命中目标解析投放位置。
 * @param params - 指针、列表项几何信息与拖拽库命中状态
 * @returns 可用投放位置，无有效位置时返回 null
 */
export function resolveDraggablePlacement(params: BDraggableResolvePlacementParams): BDraggablePlacement | null {
  const { pointerPosition, itemRects, sourceKey, targetKey, targetEdge, direction } = params;
  const sortedRects = [...itemRects].sort((leftRect: BDraggableItemRect, rightRect: BDraggableItemRect): number => leftRect.start - rightRect.start);
  if (sortedRects.length === 0) {
    return null;
  }

  const firstRect = sortedRects[0];
  const lastRect = sortedRects[sortedRects.length - 1];
  const lastRectEnd = lastRect.start + lastRect.size;

  // 指针越过列表首尾时仍保留投放锚点，解决首尾空隙无法排序的问题。
  if (pointerPosition <= firstRect.start && firstRect.key !== sourceKey) {
    return {
      targetKey: firstRect.key,
      position: 'before'
    };
  }

  if (pointerPosition >= lastRectEnd && lastRect.key !== sourceKey) {
    return {
      targetKey: lastRect.key,
      position: 'after'
    };
  }

  if (!targetKey || targetKey === sourceKey) {
    return resolveFallbackPlacementFromPointer(pointerPosition, sortedRects, sourceKey);
  }

  const targetRect = sortedRects.find((rect: BDraggableItemRect): boolean => rect.key === targetKey);
  if (!targetRect) {
    return null;
  }

  return {
    targetKey,
    position: resolveTargetMovePosition({
      pointerPosition,
      targetRect,
      targetEdge,
      direction
    })
  };
}

/**
 * 解析插入指示线在滚动内容坐标系下的中心位置。
 * @param params - 当前列表项几何信息与投放位置
 * @returns 指示线中心位置，无有效目标时返回 null
 */
export function resolveDraggableIndicatorOffset(params: {
  /** 当前已注册列表项的几何信息 */
  itemRects: BDraggableItemRect[];
  /** 指示线锚定目标项 key */
  targetKey: string;
  /** 指示线相对目标项的位置 */
  position: BDraggableMovePosition;
}): number | null {
  const sortedRects = [...params.itemRects].sort((leftRect: BDraggableItemRect, rightRect: BDraggableItemRect): number => leftRect.start - rightRect.start);
  const targetIndex = sortedRects.findIndex((rect: BDraggableItemRect): boolean => rect.key === params.targetKey);
  if (targetIndex === -1) {
    return null;
  }

  const targetRect = sortedRects[targetIndex];
  if (params.position === 'before') {
    const previousRect = sortedRects[targetIndex - 1];
    if (!previousRect) {
      return targetRect.start;
    }

    return (previousRect.start + previousRect.size + targetRect.start) / 2;
  }

  const nextRect = sortedRects[targetIndex + 1];
  if (!nextRect) {
    return targetRect.start + targetRect.size;
  }

  return (targetRect.start + targetRect.size + nextRect.start) / 2;
}

/**
 * 按投放位置重排列表。
 * @param list - 原始列表
 * @param sourceKey - 被移动项 key
 * @param targetKey - 目标项 key
 * @param position - 插入位置
 * @param getItemKey - 列表项 key 读取函数
 * @returns 调整后的列表；无效移动时返回原数组引用
 */
export function reorderDraggableList<TItem>(
  list: TItem[],
  sourceKey: string,
  targetKey: string,
  position: BDraggableMovePosition,
  getItemKey: BDraggableItemKeyGetter<TItem>
): TItem[] {
  if (sourceKey === targetKey) {
    return list;
  }

  const sourceIndex = list.findIndex((item: TItem, index: number): boolean => getItemKey(item, index) === sourceKey);
  const targetIndex = list.findIndex((item: TItem, index: number): boolean => getItemKey(item, index) === targetKey);
  if (sourceIndex === -1 || targetIndex === -1) {
    return list;
  }

  const nextList = [...list];
  const [sourceItem] = nextList.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = nextList.findIndex((item: TItem, index: number): boolean => getItemKey(item, index) === targetKey);
  if (sourceItem === undefined || targetIndexAfterRemoval === -1) {
    return list;
  }

  const insertIndex = position === 'before' ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
  nextList.splice(insertIndex, 0, sourceItem);

  return isSameDraggableListOrder(list, nextList) ? list : nextList;
}
