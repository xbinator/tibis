/**
 * @file useViewportSize.ts
 * @description BWidget 根视口尺寸同步与首屏稳定状态管理。
 */
import type { WidgetSize } from '../types';
import { nextTick, onActivated, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import type { Ref } from 'vue';
import { useResizeObserver } from '@vueuse/core';

/**
 * 视口尺寸 hook 返回值。
 */
interface UseViewportSizeReturn {
  /** Widget根节点 */
  rootRef: Ref<HTMLElement | null>;
  /** 当前Widget视口实际渲染尺寸 */
  viewportSize: Ref<WidgetSize>;
  /** Widget首轮尺寸稳定后再显示舞台，避免初始布局抖动产生黑框 */
  isViewportReady: Ref<boolean>;
  /** 从 DOM 读取并同步根视口尺寸 */
  syncViewportSizeFromRoot: () => void;
  /** 在 KeepAlive 激活后的下一帧同步根视口尺寸 */
  scheduleViewportSizeSyncFromRoot: () => void;
}

/**
 * 视口尺寸 hook 选项。
 */
interface UseViewportSizeOptions {
  /** 是否允许根高度为 0 时同步尺寸，适用于高度由内容反算的运行态视图 */
  allowZeroHeight?: boolean;
}

/**
 * 判断视口尺寸是否可用于同步。
 * @param size - 待判断的视口尺寸
 * @param options - 视口尺寸 hook 选项
 * @returns 尺寸可用时返回 true
 */
function isUsableViewportSize(size: WidgetSize, options: UseViewportSizeOptions): boolean {
  if (!size.width) {
    return false;
  }

  return options.allowZeroHeight ? size.height >= 0 : Boolean(size.height);
}

/**
 * 从 ResizeObserver 条目读取Widget尺寸。
 * @param entry - ResizeObserver 条目
 * @param options - 视口尺寸 hook 选项
 * @returns Widget尺寸，无法读取时返回 null
 */
function readResizeEntrySize(entry: ResizeObserverEntry, options: UseViewportSizeOptions): WidgetSize | null {
  const boxSize = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
  const size = {
    width: boxSize?.inlineSize ?? entry.contentRect.width,
    height: boxSize?.blockSize ?? entry.contentRect.height
  };
  if (!isUsableViewportSize(size, options)) {
    return null;
  }

  return size;
}

/**
 * 创建视口尺寸同步 hook。
 * @param key - 模板中静态 ref 名称，不传时返回可手动绑定的 rootRef
 * @param options - 视口尺寸 hook 选项
 * @returns 视口尺寸状态和同步命令
 */
export function useViewportSize(key?: string, options: UseViewportSizeOptions = {}): UseViewportSizeReturn {
  const rootRef = key ? useTemplateRef<HTMLElement>(key) : ref<HTMLElement | null>(null);
  const viewportSize = ref<WidgetSize>({ width: 0, height: 0 });
  const isViewportReady = ref<boolean>(false);
  let viewportReadyFrame: ReturnType<typeof requestAnimationFrame> | null = null;
  let viewportSizeSyncFrame: ReturnType<typeof requestAnimationFrame> | null = null;

  /**
   * 从 DOM 读取根视口尺寸。
   * @returns Widget尺寸，无法读取时返回 null
   */
  function readRootViewportSize(): WidgetSize | null {
    const rect = rootRef.value?.getBoundingClientRect();
    const size = rect ? { width: rect.width, height: rect.height } : null;
    if (!size || !isUsableViewportSize(size, options)) {
      return null;
    }

    return size;
  }

  /**
   * 取消待执行的首屏稳定性检查。
   */
  function cancelViewportReadyCheck(): void {
    if (viewportReadyFrame === null) {
      return;
    }

    cancelAnimationFrame(viewportReadyFrame);
    viewportReadyFrame = null;
  }

  /**
   * 取消待执行的视口尺寸同步。
   */
  function cancelViewportSizeSync(): void {
    if (viewportSizeSyncFrame === null) {
      return;
    }

    cancelAnimationFrame(viewportSizeSyncFrame);
    viewportSizeSyncFrame = null;
  }

  /**
   * 等待根视口尺寸跨帧稳定后再显示Widget舞台。
   */
  function scheduleViewportReadyCheck(): void {
    if (isViewportReady.value) {
      return;
    }

    cancelViewportReadyCheck();
    viewportReadyFrame = requestAnimationFrame((): void => {
      viewportReadyFrame = requestAnimationFrame((): void => {
        viewportReadyFrame = null;
        isViewportReady.value = true;
      });
    });
  }

  /**
   * 同步根视口尺寸。
   * @param size - Widget尺寸
   */
  function setViewportSize(size: WidgetSize): void {
    viewportSize.value = size;
    scheduleViewportReadyCheck();
  }

  /**
   * 从 DOM 读取并同步根视口尺寸。
   */
  function syncViewportSizeFromRoot(): void {
    const size = readRootViewportSize();
    if (!size) {
      return;
    }

    setViewportSize(size);
  }

  /**
   * 在 KeepAlive 激活后的下一帧同步根视口尺寸。
   */
  function scheduleViewportSizeSyncFromRoot(): void {
    cancelViewportSizeSync();
    isViewportReady.value = false;
    nextTick()
      .then((): void => {
        viewportSizeSyncFrame = requestAnimationFrame((): void => {
          viewportSizeSyncFrame = null;
          syncViewportSizeFromRoot();
        });
      })
      .catch((error: unknown): void => {
        console.warn('BWidget viewport size sync failed', error);
      });
  }

  onBeforeUnmount((): void => {
    cancelViewportSizeSync();
    cancelViewportReadyCheck();
  });

  onMounted((): void => {
    syncViewportSizeFromRoot();
  });

  onActivated((): void => {
    scheduleViewportSizeSyncFromRoot();
  });

  useResizeObserver(rootRef, (entries: ResizeObserverEntry[]): void => {
    const size = entries[0] ? readResizeEntrySize(entries[0], options) : null;
    if (!size) {
      return;
    }

    setViewportSize(size);
  });

  return {
    rootRef,
    viewportSize,
    isViewportReady,
    syncViewportSizeFromRoot,
    scheduleViewportSizeSyncFromRoot
  };
}
