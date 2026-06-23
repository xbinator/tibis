/**
 * @file useChatScroll.ts
 * @description 聊天面板滚动状态和历史加载 hook，基于 useScroller 提供反向滚动容器的业务逻辑
 */
import type { Ref } from 'vue';
import { nextTick, onUnmounted, ref, watch, useTemplateRef } from 'vue';
import { useScroller } from '@/hooks/useScroller';
import { scroll } from '@/utils/scroll';

export interface UseChatScrollOptions {
  /** 历史加载阈值（滚动到此位置时触发加载） */
  historyLoadThreshold?: number;
  /** 回到底部按钮可见阈值 */
  backBottomHeight?: number;
  /** 回到底部按钮停止滚动后隐藏延迟 */
  backBottomIdleHideDelay?: number;
  /** 是否在远离底部时保持回到底部按钮可见 */
  keepBackBottomVisible?: Ref<boolean>;
  /** 加载历史回调 */
  onLoadHistory?: () => Promise<void> | void;
}

/**
 * 聊天滚动状态返回值
 */
interface UseChatScrollReturn {
  /** 回到底部按钮是否显示 */
  isBackBottom: Ref<boolean>;
  /** 滚动到底部 */
  scrollToBottom: (options?: { behavior?: 'smooth' | 'auto' }) => void;
  /** 暂停回到底部按钮自动隐藏 */
  pauseBackBottomHideTimer: () => void;
  /** 恢复回到底部按钮自动隐藏 */
  resumeBackBottomHideTimer: () => void;
  /** 带滚动锚点执行内容更新 */
  withScrollAnchor: (callback: () => Promise<void> | void) => Promise<void>;
}

/**
 * 创建聊天滚动状态。
 * @param scrollOptions - 滚动配置
 * @returns 聊天滚动状态与操作方法
 */
export function useChatScroll(scrollOptions: UseChatScrollOptions): UseChatScrollReturn {
  const containerRef = useTemplateRef<HTMLElement>('container');
  const { historyLoadThreshold = 160, backBottomHeight = 300, backBottomIdleHideDelay = 1200, keepBackBottomVisible, onLoadHistory } = scrollOptions;

  const scroller = useScroller(containerRef);
  const isBackBottom = ref(false);
  let backBottomHideTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 清理回到底部按钮隐藏定时器。
   */
  function clearBackBottomHideTimer(): void {
    if (backBottomHideTimer) {
      clearTimeout(backBottomHideTimer);
      backBottomHideTimer = null;
    }
  }

  /**
   * 重置回到底部按钮停止滚动后的隐藏定时器。
   */
  function resetBackBottomHideTimer(): void {
    clearBackBottomHideTimer();

    if (backBottomIdleHideDelay <= 0 || keepBackBottomVisible?.value === true) {
      return;
    }

    backBottomHideTimer = setTimeout(() => {
      isBackBottom.value = false;
      backBottomHideTimer = null;
    }, backBottomIdleHideDelay);
  }

  /**
   * 暂停回到底部按钮自动隐藏。
   */
  function pauseBackBottomHideTimer(): void {
    clearBackBottomHideTimer();
  }

  /**
   * 恢复回到底部按钮自动隐藏。
   */
  function resumeBackBottomHideTimer(): void {
    if (isBackBottom.value) {
      resetBackBottomHideTimer();
    }
  }

  /**
   * 检查是否接近历史边缘
   *
   * 针对反向滚动容器（column-reverse），scrollTop 可能为负值，
   * 需要结合容器高度与内容总高度计算实际的历史边缘位置。
   */
  function isNearHistoryEdge(): boolean {
    const currentTop = scroller.scrollTop;
    const info = scroller.scrollInfo;
    const reverseMinScrollTop = info.height - info.total;

    if (currentTop <= 0 && reverseMinScrollTop < 0) {
      return currentTop - reverseMinScrollTop <= historyLoadThreshold;
    }

    return currentTop <= historyLoadThreshold;
  }

  // 监听 scrollTop 变化驱动业务逻辑
  watch(
    () => scroller.scrollTop,
    (currentTop) => {
      // 回到底部按钮可见性
      if (Math.abs(currentTop) > backBottomHeight) {
        isBackBottom.value = true;
        resetBackBottomHideTimer();
      } else {
        isBackBottom.value = false;
        clearBackBottomHideTimer();
      }

      // 历史加载检测
      if (isNearHistoryEdge()) {
        onLoadHistory?.();
      }
    }
  );

  // 生成中仅在已经远离底部时接管隐藏计时；接近底部仍交给滚动状态隐藏按钮。
  watch(
    () => keepBackBottomVisible?.value === true,
    (shouldKeepVisible) => {
      if (Math.abs(scroller.scrollTop) <= backBottomHeight) {
        return;
      }

      isBackBottom.value = true;

      if (shouldKeepVisible) {
        clearBackBottomHideTimer();
        return;
      }

      resetBackBottomHideTimer();
    }
  );

  onUnmounted(() => {
    clearBackBottomHideTimer();
  });

  /**
   * 滚动到底部
   */
  function scrollToBottom(options?: { behavior?: 'smooth' | 'auto' }): void {
    const behavior = options?.behavior || 'smooth';
    nextTick(() => scroller.scrollTo(0, behavior));
  }

  /**
   * 带滚动锚点的回调——在内容变化前后保持视口位置稳定
   *
   * 通过记录内容变化前的 scrollHeight 和 scrollTop，在内容更新后
   * 计算高度增量并补偿 scrollTop，避免视口跳动。
   */
  async function withScrollAnchor(callback: () => Promise<void> | void): Promise<void> {
    const target = containerRef.value;
    if (!target) {
      await callback();
      return;
    }

    const scrollContainer = scroll.container(target);
    if (!('scrollTop' in scrollContainer)) {
      await callback();
      return;
    }

    const previousScrollHeight = scrollContainer.scrollHeight;
    const previousScrollTop = scrollContainer.scrollTop;

    await callback();
    await nextTick();

    const heightDelta = scrollContainer.scrollHeight - previousScrollHeight;
    scrollContainer.scrollTop = previousScrollTop < 0 ? previousScrollTop - heightDelta : previousScrollTop + heightDelta;
  }

  return {
    isBackBottom,
    scrollToBottom,
    pauseBackBottomHideTimer,
    resumeBackBottomHideTimer,
    withScrollAnchor
  };
}
