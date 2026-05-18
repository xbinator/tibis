/**
 * @file useTabDragger.ts
 * @description 基于 Pragmatic Drag and Drop 的标签页横向拖拽排序组合函数。
 *   封装 draggable/dropTarget 注册、命中判定、auto-scroll 和状态生命周期。
 */

import { shallowRef, type ShallowRef } from 'vue';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { TabMovePosition } from '@/stores/workspace/tabs';

/**
 * Pragmatic Drag and Drop hitbox 计算出的最近边缘。
 * 与 `@atlaskit/pragmatic-drag-and-drop-hitbox` 的 `Edge` 类型一致。
 * 本模块仅使用 `left` 和 `right`，因为标签栏为横向排列。
 */
export type ClosestEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * 标签页在滚动内容坐标系下的几何信息。
 */
export interface HeaderTabRect {
  /** 标签页唯一标识 */
  id: string;
  /** 元素左侧相对滚动内容起点的位置 */
  left: number;
  /** 元素宽度 */
  width: number;
}

/**
 * 指针离开具体标签命中区后，仍可回退到的插入指示线锚点。
 */
export interface DetachedIndicatorPlacement {
  /** 作为排序参照的目标标签 ID */
  tabId: string;
  /** 插入位置 */
  position: TabMovePosition;
  /** 插入指示线在滚动内容中的横向偏移 */
  offset: number;
}

/**
 * 将 Pragmatic hitbox 的 ClosestEdge 枚举映射为标签排序插入位置。
 * @param edge - 命中区域判定的最近边，null 时默认视为 'after'
 * @returns 排序插入位置
 */
export function closestEdgeToMovePosition(edge: ClosestEdge | null): TabMovePosition {
  return edge === 'left' ? 'before' : 'after';
}

/**
 * 根据目标标签与插入方向，计算独立插入指示线的内容坐标。
 * @param tabRect - 目标标签的几何信息
 * @param position - 插入到目标标签前方或后方
 * @returns 指示线在滚动内容中的横向偏移
 */
export function getDropIndicatorOffset(tabRect: HeaderTabRect, position: TabMovePosition): number {
  return position === 'before' ? tabRect.left : tabRect.left + tabRect.width;
}

/**
 * 当指针离开标签命中区时，按首尾边界回退到可见的插入指示线。
 * @param params - 指针位置与当前标签几何信息
 * @returns 回退后的插入锚点，若指针仍在有效标签区间内则返回 null
 */
export function getDetachedIndicatorPlacement(params: {
  /** 指针在滚动内容坐标系中的横向位置 */
  pointerX: number;
  /** 当前可见标签的几何信息 */
  tabs: HeaderTabRect[];
}): DetachedIndicatorPlacement | null {
  const { pointerX, tabs } = params;
  if (tabs.length === 0) {
    return null;
  }

  const firstTab = tabs[0];
  const lastTab = tabs[tabs.length - 1];
  const lastTabRight = lastTab.left + lastTab.width;

  if (pointerX <= firstTab.left) {
    return {
      tabId: firstTab.id,
      position: 'before',
      offset: getDropIndicatorOffset(firstTab, 'before')
    };
  }

  if (pointerX >= lastTabRight) {
    return {
      tabId: lastTab.id,
      position: 'after',
      offset: getDropIndicatorOffset(lastTab, 'after')
    };
  }

  return null;
}

/**
 * 拖拽模块对外暴露的状态接口。
 */
export interface TabDraggerState {
  /** 当前拖拽中的标签 ID，无拖拽时为 null */
  draggingTabId: ShallowRef<string | null>;
  /** 当前悬停的目标标签 ID，无悬停时为 null */
  dropTargetTabId: ShallowRef<string | null>;
  /** 插入位置，无有效目标时为 null */
  dragInsertPosition: ShallowRef<TabMovePosition | null>;
  /** 独立插入指示线在滚动内容中的横向偏移，无有效位置时为 null */
  dropIndicatorOffset: ShallowRef<number | null>;
}

/**
 * 拖拽模块对外暴露的操作接口。
 */
export interface TabDraggerAPI {
  /** 为标签元素注册 draggable + dropTarget 能力，返回 cleanup 函数 */
  registerTabElement: (tabId: string, element: HTMLElement) => () => void;
  /** 注销标签元素的拖拽能力 */
  unregisterTabElement: (tabId: string) => void;
  /** 全局清理，组件 onUnmounted 时调用 */
  cleanup: () => void;
  /** 拖拽响应式状态 */
  state: TabDraggerState;
}

/**
 * 创建 HeaderTabs 的 Pragmatic Drag and Drop 拖拽模块。
 * @param scrollContainerRef - 横向滚动容器元素引用
 * @param onMoveTab - 排序回调，参数与 tabsStore.moveTab 一致
 * @param onDragEnded - 拖拽结束时回调（用于设置时间戳以抑制误点击）
 * @returns 拖拽操作与状态接口
 */
export function useTabDragger(
  scrollContainerRef: ShallowRef<HTMLElement | null>,
  onMoveTab: (fromId: string, toId: string, position: TabMovePosition) => void,
  onDragEnded: () => void
): TabDraggerAPI {
  const draggingTabId = shallowRef<string | null>(null);
  const dropTargetTabId = shallowRef<string | null>(null);
  const dragInsertPosition = shallowRef<TabMovePosition | null>(null);
  const dropIndicatorOffset = shallowRef<number | null>(null);

  /** 标签 ID → cleanup 函数映射 */
  const cleanups = new Map<string, () => void>();
  /** 标签 ID → DOM 元素映射 */
  const elements = new Map<string, HTMLElement>();

  /** auto-scroll 清理函数 */
  let autoScrollCleanup: (() => void) | null = null;

  /** 全局 monitor 清理函数 */
  let monitorCleanup: (() => void) | null = null;

  /**
   * 清空当前插入指示线状态，但保留 draggingTabId。
   */
  function resetIndicatorState(): void {
    dropTargetTabId.value = null;
    dragInsertPosition.value = null;
    dropIndicatorOffset.value = null;
  }

  /**
   * 重置所有拖拽相关状态并通知拖拽结束。
   */
  function resetDragState(): void {
    draggingTabId.value = null;
    resetIndicatorState();
    onDragEnded();
  }

  /**
   * 读取当前已注册标签的几何信息，并按横向顺序排序。
   * @returns 标签几何信息列表
   */
  function getRegisteredTabRects(): HeaderTabRect[] {
    return Array.from(elements.entries())
      .map(([id, element]) => ({
        id,
        left: element.offsetLeft,
        width: element.offsetWidth
      }))
      .sort((leftTab, rightTab) => leftTab.left - rightTab.left);
  }

  /**
   * 根据目标标签与插入位置同步当前指示线状态。
   * @param tabId - 目标标签 ID
   * @param position - 插入位置
   */
  function applyIndicatorPlacement(tabId: string, position: TabMovePosition): void {
    const tabRect = getRegisteredTabRects().find((tab) => tab.id === tabId);
    if (!tabRect) {
      resetIndicatorState();
      return;
    }

    dropTargetTabId.value = tabId;
    dragInsertPosition.value = position;
    dropIndicatorOffset.value = getDropIndicatorOffset(tabRect, position);
  }

  /**
   * 将视口坐标中的指针位置转换为滚动内容坐标。
   * @param clientX - 指针在视口中的横向位置
   * @returns 指针在滚动内容中的横向偏移，无容器时返回 null
   */
  function getPointerContentX(clientX: number): number | null {
    const container = scrollContainerRef.value;
    if (!container) {
      return null;
    }

    return clientX - container.getBoundingClientRect().left + container.scrollLeft;
  }

  /**
   * 当指针离开具体标签时，尝试按首尾边界回退为可见的插入指示线。
   * @param clientX - 指针在视口中的横向位置
   * @returns 是否成功生成回退指示线
   */
  function applyDetachedIndicatorPlacement(clientX: number): boolean {
    const pointerX = getPointerContentX(clientX);
    if (pointerX === null) {
      return false;
    }

    const placement = getDetachedIndicatorPlacement({
      pointerX,
      tabs: getRegisteredTabRects()
    });
    if (!placement) {
      return false;
    }

    dropTargetTabId.value = placement.tabId;
    dragInsertPosition.value = placement.position;
    dropIndicatorOffset.value = placement.offset;
    return true;
  }

  /**
   * 注销指定标签的拖拽注册。
   * @param tabId - 标签 ID
   */
  function unregisterTabElement(tabId: string): void {
    elements.delete(tabId);
    const fn = cleanups.get(tabId);
    if (fn) {
      fn();
      cleanups.delete(tabId);
    }
  }

  /**
   * 将标签元素注册为 draggable 和 drop target。
   * 每次调用先清理该标签已有的注册，避免重复注册导致事件堆积。
   * @param tabId - 标签 ID
   * @param element - 标签 DOM 元素
   * @returns 该标签的清理函数
   */
  function registerTabElement(tabId: string, element: HTMLElement): () => void {
    // 如果已注册则先清理旧注册
    unregisterTabElement(tabId);
    elements.set(tabId, element);

    const localCleanups: (() => void)[] = [];

    // 注册 draggable
    const dragCleanup = draggable({
      element,
      getInitialData: (): Record<string, unknown> => ({ tabId }),
      onGenerateDragPreview({ nativeSetDragImage }) {
        // 使用原生拖拽预览，保持与旧实现一致的 ghost 视觉
        nativeSetDragImage?.(element, 0, 0);
      },
      onDragStart() {
        draggingTabId.value = tabId;
        resetIndicatorState();
      },
      onDrop() {
        resetDragState();
      }
    });
    localCleanups.push(dragCleanup);

    // 注册 drop target
    // Pragmatic 的 dropTargetForElements 使用 userData + attachClosestEdge 模式记录命中边
    const dropCleanup = dropTargetForElements({
      element,
      getData: (): Record<string | symbol, unknown> => ({ tabId }),
      getIsSticky: () => true,
      canDrop({ source }) {
        // 不允许拖到自己身上
        return source.data.tabId !== tabId;
      },
      onDrag({ self, location }) {
        // 在每次指针移动时附着最近边信息到 self.data
        attachClosestEdge(self.data, {
          element,
          input: location.current.input,
          allowedEdges: ['left', 'right']
        });
      },
      onDragEnter({ source }) {
        if (source.data.tabId === tabId) return;
        dropTargetTabId.value = tabId;
      },
      onDragLeave() {
        if (dropTargetTabId.value === tabId) {
          resetIndicatorState();
        }
      }
    });
    localCleanups.push(dropCleanup);

    const combinedCleanup = () => {
      localCleanups.forEach((fn) => fn());
    };
    cleanups.set(tabId, combinedCleanup);

    return combinedCleanup;
  }

  // 激活全局 monitor（单例，整个模块生命周期仅一次）
  monitorCleanup = monitorForElements({
    onDragStart({ source }) {
      draggingTabId.value = source.data.tabId as string;
    },
    onDrag({ location, source }) {
      const target = location.current.dropTargets[0];
      if (!target) {
        if (!applyDetachedIndicatorPlacement(location.current.input.clientX)) {
          resetIndicatorState();
        }
        return;
      }

      const targetTabId = target.data.tabId as string;
      if (targetTabId === source.data.tabId) {
        if (!applyDetachedIndicatorPlacement(location.current.input.clientX)) {
          resetIndicatorState();
        }
        return;
      }

      // 从目标元素的 userData 中提取最近边
      const edge = extractClosestEdge(target.data);
      applyIndicatorPlacement(targetTabId, closestEdgeToMovePosition(edge));
    },
    onDrop({ source, location }) {
      const target = location.current.dropTargets[0];
      const fromId = source.data.tabId as string;
      let toId: string | null = null;
      let position: TabMovePosition | null = null;

      if (target && target.data.tabId !== fromId) {
        toId = target.data.tabId as string;
        position = closestEdgeToMovePosition(extractClosestEdge(target.data));
      } else {
        const placement = applyDetachedIndicatorPlacement(location.current.input.clientX)
          ? {
              tabId: dropTargetTabId.value,
              position: dragInsertPosition.value
            }
          : null;
        toId = placement?.tabId ?? null;
        position = placement?.position ?? null;
      }

      if (!toId || !position || fromId === toId) {
        resetDragState();
        return;
      }

      onMoveTab(fromId, toId, position);
      resetDragState();
    }
  });

  /**
   * 初始化 auto-scroll（延迟初始化，等待滚动容器就绪）。
   */
  function initAutoScroll(): void {
    const container = scrollContainerRef.value;
    if (!container || autoScrollCleanup) return;

    try {
      autoScrollCleanup = autoScrollForElements({
        element: container,
        canScroll: () => draggingTabId.value !== null,
        getConfiguration: () => ({
          maxScrollSpeed: 'fast'
        })
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[useTabDragger] auto-scroll 初始化失败: ${message}`);
      autoScrollCleanup = null;
    }
  }

  // 延迟初始化 auto-scroll，确保 DOM 已挂载
  setTimeout(() => initAutoScroll(), 0);

  /**
   * 全局清理：遍历所有标签清理 + 清理 monitor + 清理 auto-scroll。
   */
  function cleanup(): void {
    cleanups.forEach((fn) => fn());
    cleanups.clear();
    elements.clear();

    if (monitorCleanup) {
      monitorCleanup();
      monitorCleanup = null;
    }

    if (autoScrollCleanup) {
      autoScrollCleanup();
      autoScrollCleanup = null;
    }

    resetDragState();
  }

  return {
    registerTabElement,
    unregisterTabElement,
    cleanup,
    state: {
      draggingTabId,
      dropTargetTabId,
      dragInsertPosition,
      dropIndicatorOffset
    }
  };
}
