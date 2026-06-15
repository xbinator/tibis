import type { Ref } from 'vue';
import { ref } from 'vue';
import { useThrottleFn } from '@vueuse/core';
import BScrollbar from '@/components/BScrollbar/index.vue';

/**
 * 大纲锚点记录。
 */
export interface AnchorRecord {
  id: string;
  level: number;
  text: string;
}

/**
 * useAnchors 返回值。
 */
interface UseEditorAnchorsResult {
  /** 当前激活锚点 ID */
  activeAnchorId: Ref<string>;
  /** 处理用户点击大纲锚点 */
  handleChangeAnchor: (record: AnchorRecord) => void;
  /** 处理编辑器滚动 */
  handleEditorScroll: () => void;
  /** 设置当前激活锚点 ID */
  setActiveAnchorId: (anchorId: string) => void;
}

/**
 * BScrollbar 暴露能力。
 */
interface BScrollbarExposed {
  /** 获取真实滚动元素 */
  getScrollElement: () => HTMLDivElement | null;
  /** 滚动到指定位置 */
  scrollTo: (options: ScrollToOptions) => void;
}

/**
 * useAnchors 配置项。
 */
interface UseAnchorsOptions {
  /** 统一滚动入口，允许宿主同步滚动快照 */
  onScrollTo?: (options: ScrollToOptions) => void;
}

const RICH_HEADING_SELECTOR = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => `.b-markdown-rich__content ${tag}`).join(', ');
const SOURCE_HEADING_SELECTOR = '.b-markdown-source__codemirror .cm-line[id]';
const HEADING_SELECTOR = `${RICH_HEADING_SELECTOR}, ${SOURCE_HEADING_SELECTOR}`;

/**
 * 管理 Markdown 大纲锚点定位与滚动激活态。
 * @param layoutRef - Markdown 布局容器
 * @param scrollbarRef - 滚动条实例
 * @param options - 锚点滚动配置
 * @returns 大纲锚点状态和操作
 */
export function useAnchors(
  layoutRef: Ref<HTMLElement | null>,
  scrollbarRef: Ref<InstanceType<typeof BScrollbar> | null>,
  options: UseAnchorsOptions = {}
): UseEditorAnchorsResult {
  const activeAnchorId = ref('');

  function getScrollbar(): BScrollbarExposed | null {
    return scrollbarRef.value as unknown as BScrollbarExposed | null;
  }

  function getHeadingElements(): HTMLElement[] {
    return Array.from(layoutRef.value?.querySelectorAll(HEADING_SELECTOR) ?? []).filter((heading): heading is HTMLElement => heading instanceof HTMLElement);
  }

  /**
   * 执行滚动并允许宿主同步滚动快照。
   * @param scrollbar - 当前滚动条实例
   * @param scrollOptions - 滚动参数
   */
  function scrollToWithSnapshot(scrollbar: BScrollbarExposed, scrollOptions: ScrollToOptions): void {
    if (options.onScrollTo) {
      options.onScrollTo(scrollOptions);
      return;
    }

    scrollbar.scrollTo(scrollOptions);
  }

  function scrollElementToTop(element: HTMLElement): void {
    const scrollbar = getScrollbar();
    const container = scrollbar?.getScrollElement();
    if (!scrollbar || !container) {
      element.scrollIntoView({ block: 'start' });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const nextTop = container.scrollTop + (elementRect.top - containerRect.top);

    scrollToWithSnapshot(scrollbar, { top: Math.max(0, nextTop), behavior: 'auto' });
  }

  function handleChangeAnchor(record: AnchorRecord): void {
    activeAnchorId.value = record.id;

    if (!record.id) {
      const scrollbar = getScrollbar();
      if (scrollbar) {
        scrollToWithSnapshot(scrollbar, { top: 0 });
      }
      return;
    }

    const element = layoutRef.value?.querySelector<HTMLElement>(`#${CSS.escape(record.id)}`);
    if (element) {
      scrollElementToTop(element);
    }
  }

  const updateActiveAnchor = useThrottleFn(() => {
    const container = getScrollbar()?.getScrollElement();
    if (!container) return;

    if (container.scrollTop < 50) {
      activeAnchorId.value = '';
      return;
    }

    const headings = getHeadingElements();
    if (!headings.length) {
      return;
    }

    let currentId = '';
    const threshold = container.getBoundingClientRect().top + 100;

    headings.forEach((heading) => {
      if (heading.getBoundingClientRect().top <= threshold) {
        currentId = heading.id;
      }
    });

    if (currentId !== activeAnchorId.value) {
      activeAnchorId.value = currentId;
    }
  }, 100);

  function handleEditorScroll(): void {
    updateActiveAnchor();
  }

  function setActiveAnchorId(anchorId: string): void {
    activeAnchorId.value = anchorId;
  }

  return {
    activeAnchorId,
    handleChangeAnchor,
    handleEditorScroll,
    setActiveAnchorId
  };
}
