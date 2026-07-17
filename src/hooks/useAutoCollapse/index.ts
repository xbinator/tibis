/**
 * @file index.ts
 * @description 当目标元素宽度低于阈值时自动折叠的 Hook。
 */
import type { Ref } from 'vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface UseAutoCollapseOptions {
  collapsed?: Ref<boolean>;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (value: boolean) => void;
  threshold: number;
}

interface UseAutoCollapseReturn {
  collapsed: Ref<boolean>;
  isAutoCollapsed: Ref<boolean>;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
}

export function useAutoCollapse(target: Ref<HTMLElement | null>, options: UseAutoCollapseOptions): UseAutoCollapseReturn {
  const { collapsed: controlledCollapsed, defaultCollapsed = false, onCollapsedChange, threshold } = options;
  const collapsed = controlledCollapsed ?? ref<boolean>(defaultCollapsed);
  const isAutoCollapsed = ref<boolean>(false);
  let hasMeasured = false;
  let resizeObserver: ResizeObserver | null = null;

  function setCollapsed(value: boolean): void {
    collapsed.value = value;
    onCollapsedChange?.(value);
  }

  function toggleCollapsed(): void {
    setCollapsed(!collapsed.value);
  }

  function updateAutoCollapsed(width: number): void {
    const nextAutoCollapsed = width < threshold;
    if (hasMeasured && isAutoCollapsed.value === nextAutoCollapsed) return;

    hasMeasured = true;
    isAutoCollapsed.value = nextAutoCollapsed;
    setCollapsed(nextAutoCollapsed);
  }

  onMounted(() => {
    const element = target.value;
    if (!element) return;

    updateAutoCollapsed(element.getBoundingClientRect().width);

    resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const [entry] = entries;
      if (!entry) return;
      updateAutoCollapsed(entry.contentRect.width);
    });

    resizeObserver.observe(element);
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return {
    collapsed,
    isAutoCollapsed,
    setCollapsed,
    toggleCollapsed
  };
}
