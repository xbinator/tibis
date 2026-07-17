/**
 * @file index.ts
 * @description 自动发现滚动容器并提供响应式滚动状态的 Hook
 */
import type { Ref } from 'vue';
import { ref, computed, onMounted, onUnmounted, unref } from 'vue';
import { scroll } from '@/utils/scroll';

/**
 * 目标元素类型：支持 Element、选择器字符串、Ref 或 null
 */
type MaybeComputedElementRef = Element | string | null | Ref<Element | undefined | null>;

/**
 * 滚动信息
 */
interface ScrollInfo {
  top: number;
  height: number;
  total: number;
}

/**
 * useScroller 配置项
 */
interface UseScrollerOptions {
  /** 距底部多少 px 算触底，默认 50 */
  bottomThreshold?: number;
  /** 滚动停止检测延迟 ms，默认 150，设为 0 关闭停止检测 */
  stopDelay?: number;
}

/**
 * useScroller 返回值
 */
interface UseScrollerReturn {
  /** 当前滚动位置，支持 getter/setter，赋值时会触发滚动 */
  scrollTop: number;
  /** 是否在顶部 */
  readonly isTop: boolean;
  /** 是否触底 */
  readonly isBottom: boolean;
  /** 当前滚动方向 */
  readonly scrollDirection: 'up' | 'down' | 'none';
  /** 是否正在滚动中 */
  readonly isScrolling: boolean;
  /** 滚动信息（top/可视高度/总高度） */
  readonly scrollInfo: ScrollInfo;
  /** 滚动到指定位置 */
  scrollTo: (value: number, behavior?: ScrollBehavior) => void;
  /** 滚动到指定元素 */
  scrollToElement: (el: HTMLElement, behavior?: ScrollBehavior) => void;
  /** 获取元素相对滚动容器顶部的偏移 */
  elementTop: (el: HTMLElement) => number;
  /** 获取滚动容器的边界矩形 */
  getBoundingClientRect: () => DOMRect;
}

/**
 * 自动发现滚动容器并提供响应式滚动状态的 Hook
 *
 * 传入一个 DOM 节点或 ref，在 onMounted 时自动查找所属滚动容器并绑定 scroll 事件，
 * 通过 getter/setter 暴露滚动状态。容器发现仅执行一次，target 的后续变化不会触发重新绑定。
 *
 * @param target - 用于定位滚动容器的元素，支持 Element / ref / 选择器字符串 / null
 * @param options - 可选配置 { bottomThreshold?: number, stopDelay?: number }
 * @returns 包含滚动状态和操作方法的对象
 */
export function useScroller(target?: MaybeComputedElementRef, options: UseScrollerOptions = {}): UseScrollerReturn {
  const { bottomThreshold = 50, stopDelay = 150 } = options;

  const _scrollTop = ref<number>(0);
  const _scrollDirection = ref<'up' | 'down' | 'none'>('none');
  const _isScrolling = ref<boolean>(false);
  const _scrollInfo = ref<ScrollInfo>({ top: 0, height: 0, total: 0 });

  const _isTop = computed<boolean>(() => _scrollTop.value === 0);
  const _isBottom = computed<boolean>(() => {
    const { top, height, total } = _scrollInfo.value;
    if (total === 0) return false;
    return top + height >= total - bottomThreshold;
  });

  let container: Window | HTMLElement = typeof window !== 'undefined' ? window : ({} as Window);
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let lastScrollTop = 0;

  /**
   * 滚动容器到指定位置，内部代理 scroll.to
   */
  const scrollTo = (value: number, behavior: ScrollBehavior = 'auto'): void => {
    scroll.to(container, value, behavior);
  };

  /**
   * 获取元素相对当前滚动容器顶部的偏移距离
   */
  const elementTop = (el: HTMLElement): number => {
    return scroll.elementTop(el, container);
  };

  /**
   * 滚动容器使指定元素可见
   */
  const scrollToElement = (el: HTMLElement, behavior: ScrollBehavior = 'auto'): void => {
    const top = elementTop(el);
    scrollTo(top, behavior);
  };

  /**
   * 获取滚动容器的边界矩形
   */
  const getBoundingClientRect = (): DOMRect => {
    if (container instanceof HTMLElement && container.getBoundingClientRect) {
      return container.getBoundingClientRect();
    }

    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' } as DOMRect;
  };

  /**
   * 重置滚动停止检测定时器
   *
   * 每次滚动事件触发时调用，先清除旧定时器，再根据 stopDelay 设置新定时器。
   * stopDelay > 0 时使用延迟检测，stopDelay === 0 时同步将 isScrolling 置为 false。
   * 定时器到期后会同时重置 isScrolling 和 scrollDirection。
   */
  const resetStopTimer = (): void => {
    if (stopTimer) {
      clearTimeout(stopTimer);
    }
    if (stopDelay > 0) {
      stopTimer = setTimeout(() => {
        _isScrolling.value = false;
        _scrollDirection.value = 'none';
      }, stopDelay);
    } else {
      _isScrolling.value = false;
    }
  };

  /**
   * scroll 事件处理函数
   *
   * 更新滚动位置、滚动信息，计算滚动方向，并维护滚动停止状态。
   */
  const handleScroll = (): void => {
    const currentTop = scroll.top(container);
    const currentInfo = scroll.info(container);

    if (currentTop > lastScrollTop) {
      _scrollDirection.value = 'down';
    } else if (currentTop < lastScrollTop) {
      _scrollDirection.value = 'up';
    }
    lastScrollTop = currentTop;

    _scrollTop.value = currentTop;
    _scrollInfo.value = currentInfo;
    _isScrolling.value = true;

    resetStopTimer();
  };

  onMounted(() => {
    const _target = unref(target);
    const node = typeof _target === 'string' ? document.querySelector(_target) : _target;

    container = node ? scroll.container(node as HTMLElement) : window;

    _scrollTop.value = scroll.top(container);
    _scrollInfo.value = scroll.info(container);
    lastScrollTop = _scrollTop.value;

    container.addEventListener('scroll', handleScroll, { passive: true });
  });

  onUnmounted(() => {
    container.removeEventListener('scroll', handleScroll);
    if (stopTimer) {
      clearTimeout(stopTimer);
    }
  });

  return {
    get scrollTop() {
      return _scrollTop.value;
    },
    set scrollTop(value: number) {
      scrollTo(value);
    },
    get isTop() {
      return _isTop.value;
    },
    get isBottom() {
      return _isBottom.value;
    },
    get scrollDirection() {
      return _scrollDirection.value;
    },
    get isScrolling() {
      return _isScrolling.value;
    },
    get scrollInfo() {
      return _scrollInfo.value;
    },
    scrollTo,
    scrollToElement,
    elementTop,
    getBoundingClientRect
  };
}
