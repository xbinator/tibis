/**
 * @file types.ts
 * @description BDraggable 公共拖拽排序组件类型定义。
 */

/**
 * 拖拽排序方向。
 */
export type BDraggableDirection = 'vertical' | 'horizontal';

/**
 * 拖拽插入位置。
 */
export type BDraggableMovePosition = 'before' | 'after';

/**
 * Pragmatic Drag and Drop hitbox 最近边缘。
 */
export type BDraggableClosestEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * 列表项唯一标识。
 */
export type BDraggableKey = string;

/**
 * 列表项 key 读取函数。
 */
export type BDraggableItemKeyGetter<TItem = unknown> = (item: TItem, index: number) => BDraggableKey;

/**
 * 列表项 class 值。
 */
export type BDraggableClassValue = string | Record<string, boolean> | Array<string | Record<string, boolean>>;

/**
 * 列表项 class 配置。
 */
export type BDraggableItemClass<TItem = unknown> = BDraggableClassValue | ((item: TItem, index: number) => BDraggableClassValue);

/**
 * 列表项在滚动内容坐标系下的几何信息。
 */
export interface BDraggableItemRect {
  /** 列表项唯一标识 */
  key: BDraggableKey;
  /** 列表项起点坐标，纵向为 top，横向为 left */
  start: number;
  /** 列表项尺寸，纵向为 height，横向为 width */
  size: number;
}

/**
 * 已解析的拖拽投放位置。
 */
export interface BDraggablePlacement {
  /** 作为排序参照的目标项 key */
  targetKey: BDraggableKey;
  /** 插入到目标项前方或后方 */
  position: BDraggableMovePosition;
}

/**
 * 拖拽投放位置解析参数。
 */
export interface BDraggableResolvePlacementParams {
  /** 指针在滚动内容坐标系下的位置 */
  pointerPosition: number;
  /** 当前已注册列表项的几何信息 */
  itemRects: BDraggableItemRect[];
  /** 被拖拽项 key */
  sourceKey: BDraggableKey;
  /** 当前拖拽库命中的目标项 key */
  targetKey: BDraggableKey | null;
  /** 当前目标项由 hitbox 推导出的最近边 */
  targetEdge: BDraggableClosestEdge | null;
  /** 拖拽排序方向 */
  direction: BDraggableDirection;
}

/**
 * 拖拽移动事件。
 */
export interface BDraggableMoveEvent<TItem = unknown> {
  /** 被移动项 key */
  sourceKey: BDraggableKey;
  /** 目标项 key */
  targetKey: BDraggableKey;
  /** 插入到目标项前方或后方 */
  position: BDraggableMovePosition;
  /** 被移动项 */
  sourceItem: TItem;
  /** 目标项 */
  targetItem: TItem;
  /** 被移动项原始下标 */
  sourceIndex: number;
  /** 目标项原始下标 */
  targetIndex: number;
  /** 按当前视觉顺序完成排序后的列表 */
  nextList: TItem[];
}

/**
 * 默认插槽属性。
 */
export interface BDraggableSlotProps<TItem = unknown> {
  /** 当前列表项 */
  item: TItem;
  /** 当前列表项下标 */
  index: number;
  /** 当前列表项 key */
  itemKey: BDraggableKey;
  /** 拖拽手柄 class，插槽内容可把该 class 放到手柄元素上 */
  handleClass: string;
  /** 当前项是否正在拖拽 */
  dragging: boolean;
  /** 当前项投放指示位置 */
  dropPosition: BDraggableMovePosition | null;
}
