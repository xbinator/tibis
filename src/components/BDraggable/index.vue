<!--
  @file index.vue
  @description 公共列表拖拽排序组件，通过插槽渲染列表项并输出排序事件。
-->
<template>
  <div ref="containerRef" :class="bem({ horizontal: direction === 'horizontal', disabled })">
    <div
      v-for="entry in draggableEntries"
      :key="entry.key"
      :ref="getItemRef(entry.key)"
      :class="[bem('item'), resolveItemClass(entry), getItemStateClass(entry.key)]"
      @click="handleItemClick(entry)"
    >
      <slot
        :item="entry.item"
        :index="entry.index"
        :item-key="entry.key"
        :handle-class="resolvedHandleClass"
        :dragging="draggingKey === entry.key"
        :drop-position="getDropPosition(entry.key)"
      ></slot>
    </div>
    <div v-if="dropIndicatorStyle" :class="bem('indicator', { horizontal: direction === 'horizontal' })" :style="dropIndicatorStyle"></div>
  </div>
</template>

<script setup lang="ts" generic="TItem">
import type {
  BDraggableClassValue,
  BDraggableClosestEdge,
  BDraggableDirection,
  BDraggableItemClass,
  BDraggableItemRect,
  BDraggableKey,
  BDraggableMoveEvent,
  BDraggableMovePosition,
  BDraggableSlotProps
} from './types';
import type { ElementDropTargetGetFeedbackArgs } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { ComponentPublicInstance, CSSProperties, VNodeRef } from 'vue';
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { createNamespace } from '@/utils/namespace';
import {
  B_DRAGGABLE_DATA_KEY,
  B_DRAGGABLE_INSTANCE_DATA_KEY,
  isBDraggableDragData,
  reorderDraggableList,
  resolveDraggableIndicatorOffset,
  resolveDraggablePlacement
} from './utils';

const [, bem] = createNamespace('draggable');
const DEFAULT_HANDLE_CLASS = 'b-draggable__handle';
const DRAG_PREVIEW_CLASS = 'b-draggable__native-preview';

/**
 * 原生拖拽预览设置函数。
 */
type NativeDragImageSetter = (element: Element, x: number, y: number) => void;

/**
 * 组件入参。
 */
interface Props {
  /** 视觉顺序下的列表数据 */
  list: TItem[];
  /** 列表项 key 字段名或 key 读取函数 */
  itemKey: string | ((item: TItem, index: number) => string);
  /** 拖拽排序方向 */
  direction?: BDraggableDirection;
  /** 是否禁用拖拽 */
  disabled?: boolean;
  /** 列表项 class，支持静态 class 或按列表项动态生成 */
  itemClass?: BDraggableItemClass<TItem>;
  /** 拖拽手柄 class，组件会在列表项内部查找该 class 对应元素 */
  handleClass?: string;
}

/**
 * 内部渲染列表项。
 */
interface DraggableEntry {
  /** 列表项 key */
  key: BDraggableKey;
  /** 原始列表项 */
  item: TItem;
  /** 原始下标 */
  index: number;
}

/**
 * 创建组件实例级拖拽 ID，用于隔离页面上的多个 BDraggable。
 * @returns 组件实例拖拽 ID
 */
function createDraggableInstanceId(): symbol {
  return Symbol('b-draggable-instance');
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'vertical',
  disabled: false,
  itemClass: '',
  handleClass: DEFAULT_HANDLE_CLASS
});
const emit = defineEmits<{
  /** 完成拖拽排序 */
  move: [event: BDraggableMoveEvent<TItem>];
  /** 点击列表项 */
  'item-click': [item: TItem, index: number];
}>();
defineSlots<{
  /** 默认列表项渲染插槽 */
  default(props: BDraggableSlotProps<TItem>): unknown;
}>();

/** 容器 DOM 引用。 */
const containerRef = ref<HTMLElement | null>(null);
/** 当前 BDraggable 实例 ID。 */
const draggableInstanceId = createDraggableInstanceId();
/** 当前拖拽中的列表项 key。 */
const draggingKey = shallowRef<string | null>(null);
/** 当前命中的目标项 key。 */
const dropTargetKey = shallowRef<string | null>(null);
/** 当前投放插入位置。 */
const dragInsertPosition = shallowRef<BDraggableMovePosition | null>(null);
/** 列表项 key 到 DOM 元素的映射。 */
const itemElements = new Map<string, HTMLElement>();
/** 列表项 key 到清理函数的映射。 */
const cleanupMap = new Map<string, () => void>();
/** auto-scroll 清理函数。 */
let autoScrollCleanup: (() => void) | null = null;
/** 全局拖拽监听清理函数。 */
let monitorCleanup: (() => void) | null = null;

/**
 * 判断值是否为可按字段读取的对象。
 * @param value - 待判断值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 读取列表项 key。
 * @param item - 列表项
 * @param index - 列表项下标
 * @returns 列表项 key
 */
function resolveItemKey(item: TItem, index: number): string {
  if (typeof props.itemKey === 'function') {
    return props.itemKey(item, index);
  }

  if (isRecord(item)) {
    const value = item[props.itemKey];
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }

  return String(index);
}

/** 渲染用列表项。 */
const draggableEntries = computed<DraggableEntry[]>((): DraggableEntry[] =>
  props.list.map(
    (item: TItem, index: number): DraggableEntry => ({
      item,
      index,
      key: resolveItemKey(item, index)
    })
  )
);
/** 实际使用的拖拽手柄 class。 */
const resolvedHandleClass = computed<string>((): string => props.handleClass.trim() || DEFAULT_HANDLE_CLASS);

/**
 * 读取 ref 对应的 HTML 元素。
 * @param element - Vue 模板 ref 回传值
 * @returns HTML 元素，不存在时返回 null
 */
function resolveTemplateRefElement(element: Element | ComponentPublicInstance | null): HTMLElement | null {
  if (element instanceof HTMLElement) {
    return element;
  }

  if (!element || element instanceof Element) {
    return null;
  }

  const rootElement = element?.$el;

  return rootElement instanceof HTMLElement ? rootElement : null;
}

/**
 * 读取列表项内部拖拽手柄元素。
 * @param element - 列表项元素
 * @returns 拖拽手柄元素，不存在时返回 undefined
 */
function getDragHandleElement(element: HTMLElement): HTMLElement | undefined {
  const handleClass = resolvedHandleClass.value.split(/\s+/).find((className: string): boolean => className.length > 0);
  if (!handleClass) {
    return undefined;
  }

  return element.querySelector<HTMLElement>(`.${handleClass}`) ?? undefined;
}

/**
 * 读取当前方向允许命中的最近边。
 * @returns 最近边列表
 */
function getAllowedClosestEdges(): BDraggableClosestEdge[] {
  return props.direction === 'horizontal' ? ['left', 'right'] : ['top', 'bottom'];
}

/**
 * 创建原生拖拽预览克隆节点。
 * @param element - 被拖拽的列表项元素
 * @returns 原生拖拽预览元素
 */
function createNativeDragPreviewElement(element: HTMLElement): HTMLElement {
  const previewElement = element.cloneNode(true);
  if (!(previewElement instanceof HTMLElement)) {
    return element;
  }

  previewElement.classList.add(DRAG_PREVIEW_CLASS);
  previewElement.classList.remove('is-dragging');
  previewElement.style.width = `${element.offsetWidth}px`;
  previewElement.style.height = `${element.offsetHeight}px`;
  (containerRef.value ?? document.body).appendChild(previewElement);

  return previewElement;
}

/**
 * 清理临时原生拖拽预览节点。
 * @param previewElement - 原生拖拽预览元素
 */
function cleanupNativeDragPreviewElement(previewElement: HTMLElement): void {
  window.setTimeout((): void => {
    previewElement.remove();
  }, 0);
}

/**
 * 设置原生拖拽预览，避免真实选中行边框被浏览器截成第二条插入线。
 * @param element - 被拖拽的列表项元素
 * @param nativeSetDragImage - 浏览器原生拖拽预览设置函数
 */
function setNativeDragPreview(element: HTMLElement, nativeSetDragImage: NativeDragImageSetter | null | undefined): void {
  if (!nativeSetDragImage) {
    return;
  }

  const previewElement = createNativeDragPreviewElement(element);
  nativeSetDragImage(previewElement, 0, 0);
  cleanupNativeDragPreviewElement(previewElement);
}

/**
 * 从 Pragmatic user data 中读取列表项 key。
 * @param data - 拖拽数据
 * @returns 列表项 key，不存在时返回 null
 */
function getKeyFromData(data: Record<string | symbol, unknown>): string | null {
  const value = data[B_DRAGGABLE_DATA_KEY];

  return typeof value === 'string' ? value : null;
}

/**
 * 判断拖拽数据是否来自当前 BDraggable 实例。
 * @param data - Pragmatic Drag and Drop 的 user data
 * @returns 是否来自当前实例
 */
function isCurrentDraggableInstanceData(data: Record<string | symbol, unknown>): boolean {
  return isBDraggableDragData(data) && data[B_DRAGGABLE_INSTANCE_DATA_KEY] === draggableInstanceId;
}

/**
 * 清空投放指示状态。
 */
function resetIndicatorState(): void {
  dropTargetKey.value = null;
  dragInsertPosition.value = null;
}

/**
 * 重置拖拽状态。
 */
function resetDragState(): void {
  draggingKey.value = null;
  resetIndicatorState();
}

/**
 * 读取当前已注册列表项的几何信息。
 * @returns 列表项几何信息
 */
function getRegisteredItemRects(): BDraggableItemRect[] {
  const container = containerRef.value;
  const containerRect = container?.getBoundingClientRect();
  const containerStart = props.direction === 'horizontal' ? containerRect?.left ?? 0 : containerRect?.top ?? 0;
  const scrollStart = props.direction === 'horizontal' ? container?.scrollLeft ?? 0 : container?.scrollTop ?? 0;

  return Array.from(itemElements.entries())
    .map(([key, element]: [string, HTMLElement]): BDraggableItemRect => {
      const rect = element.getBoundingClientRect();

      return {
        key,
        start: (props.direction === 'horizontal' ? rect.left : rect.top) - containerStart + scrollStart,
        size: props.direction === 'horizontal' ? element.offsetWidth : element.offsetHeight
      };
    })
    .sort((leftRect: BDraggableItemRect, rightRect: BDraggableItemRect): number => leftRect.start - rightRect.start);
}

/** 当前插入指示线样式。 */
const dropIndicatorStyle = computed<CSSProperties | null>((): CSSProperties | null => {
  const targetKey = dropTargetKey.value;
  const position = dragInsertPosition.value;
  if (!targetKey || !position) {
    return null;
  }

  const indicatorOffset = resolveDraggableIndicatorOffset({
    itemRects: getRegisteredItemRects(),
    targetKey,
    position
  });
  if (indicatorOffset === null) {
    return null;
  }

  if (props.direction === 'horizontal') {
    return {
      left: `${indicatorOffset}px`
    };
  }

  return {
    top: `${indicatorOffset}px`
  };
});

/**
 * 将视口指针坐标转换为滚动内容坐标。
 * @param clientPosition - 指针视口坐标
 * @returns 滚动内容坐标，无容器时返回 null
 */
function getPointerContentPosition(clientPosition: number): number | null {
  const container = containerRef.value;
  if (!container) {
    return null;
  }

  const rect = container.getBoundingClientRect();
  const containerStart = props.direction === 'horizontal' ? rect.left : rect.top;
  const scrollStart = props.direction === 'horizontal' ? container.scrollLeft : container.scrollTop;

  return clientPosition - containerStart + scrollStart;
}

/**
 * 根据拖拽状态应用投放指示。
 * @param params - 拖拽命中信息
 * @returns 是否存在有效投放位置
 */
function applyIndicatorFromDragState(params: {
  /** 指针视口坐标 */
  clientPosition: number;
  /** 被拖拽项 key */
  sourceKey: string;
  /** 当前命中目标 key */
  targetKey: string | null;
  /** 当前命中目标最近边 */
  targetEdge: BDraggableClosestEdge | null;
}): boolean {
  const pointerPosition = getPointerContentPosition(params.clientPosition);
  if (pointerPosition === null) {
    resetIndicatorState();
    return false;
  }

  const placement = resolveDraggablePlacement({
    pointerPosition,
    itemRects: getRegisteredItemRects(),
    sourceKey: params.sourceKey,
    targetKey: params.targetKey,
    targetEdge: params.targetEdge,
    direction: props.direction
  });
  if (!placement) {
    resetIndicatorState();
    return false;
  }

  dropTargetKey.value = placement.targetKey;
  dragInsertPosition.value = placement.position;

  return true;
}

/**
 * 初始化 auto-scroll。
 */
function initAutoScroll(): void {
  const container = containerRef.value;
  if (!container || autoScrollCleanup) {
    return;
  }

  try {
    autoScrollCleanup = autoScrollForElements({
      element: container,
      canScroll: (): boolean => draggingKey.value !== null,
      getConfiguration: () => ({
        maxScrollSpeed: 'fast'
      })
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[BDraggable] auto-scroll 初始化失败: ${message}`);
    autoScrollCleanup = null;
  }
}

/**
 * 注销指定列表项拖拽能力。
 * @param key - 列表项 key
 */
function unregisterItem(key: string): void {
  itemElements.delete(key);
  const cleanup = cleanupMap.get(key);
  if (cleanup) {
    cleanup();
    cleanupMap.delete(key);
  }
}

/**
 * 刷新指定列表项拖拽注册。
 * @param key - 列表项 key
 */
function refreshItemRegistration(key: string): void {
  const element = itemElements.get(key);
  if (!element) {
    return;
  }

  const oldCleanup = cleanupMap.get(key);
  if (oldCleanup) {
    oldCleanup();
    cleanupMap.delete(key);
  }

  initAutoScroll();
  if (props.disabled) {
    return;
  }

  const localCleanups: (() => void)[] = [];
  const dragCleanup = draggable({
    element,
    dragHandle: getDragHandleElement(element),
    getInitialData: (): Record<string, unknown> => ({
      [B_DRAGGABLE_DATA_KEY]: key,
      [B_DRAGGABLE_INSTANCE_DATA_KEY]: draggableInstanceId
    }),
    onGenerateDragPreview({ nativeSetDragImage }): void {
      setNativeDragPreview(element, nativeSetDragImage);
    },
    onDragStart(): void {
      draggingKey.value = key;
      resetIndicatorState();
    },
    onDrop(): void {
      resetDragState();
    }
  });
  localCleanups.push(dragCleanup);

  const dropCleanup = dropTargetForElements({
    element,
    getData({ input }: ElementDropTargetGetFeedbackArgs): Record<string | symbol, unknown> {
      return attachClosestEdge(
        {
          [B_DRAGGABLE_DATA_KEY]: key,
          [B_DRAGGABLE_INSTANCE_DATA_KEY]: draggableInstanceId
        },
        {
          element,
          input,
          allowedEdges: getAllowedClosestEdges()
        }
      );
    },
    getIsSticky: (): boolean => true,
    canDrop({ source }: ElementDropTargetGetFeedbackArgs): boolean {
      return isCurrentDraggableInstanceData(source.data) && getKeyFromData(source.data) !== key;
    },
    onDragEnter({ source }): void {
      if (getKeyFromData(source.data) === key) {
        return;
      }
      dropTargetKey.value = key;
    },
    onDragLeave(): void {
      if (dropTargetKey.value === key) {
        resetIndicatorState();
      }
    }
  });
  localCleanups.push(dropCleanup);

  cleanupMap.set(key, (): void => {
    localCleanups.forEach((cleanup: () => void): void => cleanup());
  });
}

/**
 * 读取当前项投放位置。
 * @param key - 列表项 key
 * @returns 投放位置
 */
function getDropPosition(key: string): BDraggableMovePosition | null {
  return dropTargetKey.value === key ? dragInsertPosition.value : null;
}

/**
 * 生成列表项状态 class。
 * @param key - 列表项 key
 * @returns class 映射
 */
function getItemStateClass(key: string): Record<string, boolean> {
  return {
    'is-dragging': draggingKey.value === key
  };
}

/**
 * 解析列表项业务 class。
 * @param entry - 内部渲染列表项
 * @returns 列表项 class
 */
function resolveItemClass(entry: DraggableEntry): BDraggableClassValue {
  if (typeof props.itemClass === 'function') {
    return props.itemClass(entry.item, entry.index);
  }

  return props.itemClass;
}

/**
 * 生成列表项 DOM ref 回调。
 * @param key - 列表项 key
 * @returns ref 回调
 */
function getItemRef(key: string): VNodeRef {
  return (element: Element | ComponentPublicInstance | null): void => {
    const htmlElement = resolveTemplateRefElement(element);
    if (htmlElement) {
      itemElements.set(key, htmlElement);
      refreshItemRegistration(key);
      return;
    }

    unregisterItem(key);
  };
}

/**
 * 处理列表项点击。
 * @param entry - 被点击的内部列表项
 */
function handleItemClick(entry: DraggableEntry): void {
  emit('item-click', entry.item, entry.index);
}

/**
 * 构建拖拽移动事件。
 * @param sourceKey - 被移动项 key
 * @param targetKey - 目标项 key
 * @param position - 插入位置
 * @returns 移动事件，无效移动时返回 null
 */
function createMoveEvent(sourceKey: string, targetKey: string, position: BDraggableMovePosition): BDraggableMoveEvent<TItem> | null {
  const getKey = (item: TItem, index: number): string => resolveItemKey(item, index);
  const sourceIndex = props.list.findIndex((item: TItem, index: number): boolean => getKey(item, index) === sourceKey);
  const targetIndex = props.list.findIndex((item: TItem, index: number): boolean => getKey(item, index) === targetKey);
  if (sourceIndex === -1 || targetIndex === -1) {
    return null;
  }

  const nextList = reorderDraggableList(props.list, sourceKey, targetKey, position, getKey);
  if (nextList === props.list) {
    return null;
  }

  return {
    sourceKey,
    targetKey,
    position,
    sourceItem: props.list[sourceIndex],
    targetItem: props.list[targetIndex],
    sourceIndex,
    targetIndex,
    nextList
  };
}

monitorCleanup = monitorForElements({
  canMonitor({ source }): boolean {
    return isCurrentDraggableInstanceData(source.data);
  },
  onDragStart({ source }): void {
    draggingKey.value = getKeyFromData(source.data);
  },
  onDrag({ location, source }): void {
    const sourceKey = getKeyFromData(source.data);
    if (!sourceKey) {
      resetIndicatorState();
      return;
    }

    const target = location.current.dropTargets[0] ?? null;
    applyIndicatorFromDragState({
      clientPosition: props.direction === 'horizontal' ? location.current.input.clientX : location.current.input.clientY,
      sourceKey,
      targetKey: target ? getKeyFromData(target.data) : null,
      targetEdge: target ? extractClosestEdge(target.data) : null
    });
  },
  onDrop({ source, location }): void {
    const sourceKey = getKeyFromData(source.data);
    const target = location.current.dropTargets[0] ?? null;
    const hasPlacement = sourceKey
      ? applyIndicatorFromDragState({
          clientPosition: props.direction === 'horizontal' ? location.current.input.clientX : location.current.input.clientY,
          sourceKey,
          targetKey: target ? getKeyFromData(target.data) : null,
          targetEdge: target ? extractClosestEdge(target.data) : null
        })
      : false;
    const targetKey = hasPlacement ? dropTargetKey.value : null;
    const position = hasPlacement ? dragInsertPosition.value : null;

    if (sourceKey && targetKey && position && sourceKey !== targetKey) {
      const moveEvent = createMoveEvent(sourceKey, targetKey, position);
      if (moveEvent) {
        emit('move', moveEvent);
      }
    }

    resetDragState();
  }
});

onUnmounted((): void => {
  cleanupMap.forEach((cleanup: () => void): void => cleanup());
  cleanupMap.clear();
  itemElements.clear();

  if (monitorCleanup) {
    monitorCleanup();
    monitorCleanup = null;
  }

  if (autoScrollCleanup) {
    autoScrollCleanup();
    autoScrollCleanup = null;
  }

  resetDragState();
});
</script>

<style lang="less" scoped>
.b-draggable {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.b-draggable--horizontal {
  flex-direction: row;
  min-width: 0;
}

.b-draggable__item {
  position: relative;
  min-width: 0;
}

.b-draggable__native-preview {
  position: fixed !important;
  top: -10000px !important;
  left: -10000px !important;
  pointer-events: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.b-draggable__native-preview::before,
.b-draggable__native-preview::after {
  display: none !important;
  content: none !important;
}

.b-draggable__indicator {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 5;
  height: 2px;
  pointer-events: none;
  background: var(--color-primary);
  border-radius: 999px;
  transform: translateY(-1px);
}

.b-draggable__indicator--horizontal {
  top: 0;
  bottom: 0;
  left: auto;
  width: 2px;
  height: auto;
  transform: translateX(-1px);
}

.b-draggable--horizontal .b-draggable__item {
  min-height: 0;
}

.b-draggable--disabled {
  pointer-events: none;
}
</style>
