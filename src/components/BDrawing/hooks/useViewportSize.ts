/**
 * @file useViewportSize.ts
 * @description BDrawing 根视口尺寸同步与首屏稳定状态管理。
 */
import type { DrawingSize } from '../types';
import { nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Ref } from 'vue';
import { useResizeObserver } from '@vueuse/core';

/**
 * 视口尺寸 hook 返回值。
 */
interface UseViewportSizeReturn {
  /** 画板根节点 */
  rootRef: Ref<HTMLElement | null>;
  /** 当前画布视口实际渲染尺寸 */
  viewportSize: Ref<DrawingSize>;
  /** 画布首轮尺寸稳定后再显示舞台，避免初始布局抖动产生黑框 */
  isViewportReady: Ref<boolean>;
  /** 从 DOM 读取并同步根视口尺寸 */
  syncViewportSizeFromRoot: () => void;
  /** 在 KeepAlive 激活后的下一帧同步根视口尺寸 */
  scheduleViewportSizeSyncFromRoot: () => void;
}

/**
 * 从 ResizeObserver 条目读取画布尺寸。
 * @param entry - ResizeObserver 条目
 * @returns 画布尺寸，无法读取时返回 null
 */
function readResizeEntrySize(entry: ResizeObserverEntry): DrawingSize | null {
  const boxSize = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
  const width = boxSize?.inlineSize ?? entry.contentRect.width;
  const height = boxSize?.blockSize ?? entry.contentRect.height;
  if (!width || !height) {
    return null;
  }

  return { width, height };
}

/**
 * 创建视口尺寸同步 hook。
 * @returns 视口尺寸状态和同步命令
 */
export function useViewportSize(): UseViewportSizeReturn {
  const rootRef = ref<HTMLElement | null>(null);
  const viewportSize = ref<DrawingSize>({ width: 0, height: 0 });
  const isViewportReady = ref<boolean>(false);
  let viewportReadyFrame: ReturnType<typeof requestAnimationFrame> | null = null;
  let viewportSizeSyncFrame: ReturnType<typeof requestAnimationFrame> | null = null;

  /**
   * 从 DOM 读取根视口尺寸。
   * @returns 画布尺寸，无法读取时返回 null
   */
  function readRootViewportSize(): DrawingSize | null {
    const rect = rootRef.value?.getBoundingClientRect();
    if (!rect?.width || !rect.height) {
      return null;
    }

    return {
      width: rect.width,
      height: rect.height
    };
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
   * 等待根视口尺寸跨帧稳定后再显示画布舞台。
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
   * @param size - 画布尺寸
   */
  function setViewportSize(size: DrawingSize): void {
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
        console.warn('BDrawing viewport size sync failed', error);
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
    const size = entries[0] ? readResizeEntrySize(entries[0]) : null;
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
