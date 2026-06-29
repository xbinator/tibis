/**
 * @file useDragger.ts
 * @description Widget页面通用自定义拖拽能力。
 */
import { inject, onBeforeUnmount, provide } from 'vue';
import type { InjectionKey, Ref } from 'vue';

/** 拖拽中 body 全局类名。 */
const DRAGGER_DRAGGING_CLASS = 'is-dragger-dragging';
/** 拖拽预览节点类名。 */
const DRAGGER_PREVIEW_CLASS = 'dragger-preview';
/** 拖拽全局样式节点 ID。 */
const DRAGGER_STYLE_ID = 'dragger-global-style';

/**
 * 拖拽项基础数据。
 */
export interface DraggerItem {
  /** 拖拽项唯一名称 */
  name: string;
  /** 拖拽预览展示文本 */
  label: string;
}

/**
 * 拖拽浏览器坐标。
 */
export interface DraggerPoint {
  /** 浏览器横向坐标 */
  x: number;
  /** 浏览器纵向坐标 */
  y: number;
}

/**
 * 拖拽控制器。
 */
export interface DraggerController {
  /**
   * 开始拖拽项目。
   * @param item - 拖拽项基础数据
   * @param event - 可选指针事件，用于立即定位预览
   */
  startDrag: (item: DraggerItem, event?: PointerEvent) => void;
}

/**
 * 通用拖拽 hook 入参。
 */
export interface UseDraggerOptions {
  /** 拖拽释放命中节点 */
  dropTargetRef: Ref<HTMLElement | null>;
  /**
   * 拖拽释放到目标节点内时触发。
   * @param item - 拖拽项基础数据
   * @param point - 浏览器坐标
   */
  onDrop: (item: DraggerItem, point: DraggerPoint) => void;
}

/**
 * 当前拖拽会话。
 */
interface DraggerSession {
  /** 拖拽项基础数据 */
  item: DraggerItem;
  /** 拖拽预览节点 */
  previewElement: HTMLElement;
  /** 鼠标在预览节点内的握持偏移 */
  pointerOffset: DraggerPoint;
  /** 拖拽监听取消器 */
  abortController: AbortController;
}

/** 通用拖拽注入键。 */
const DRAGGER_KEY: InjectionKey<DraggerController> = Symbol('Dragger');

/**
 * 安装拖拽时的全局光标样式。
 */
function ensureDraggerGlobalStyle(): void {
  if (document.getElementById(DRAGGER_STYLE_ID)) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = DRAGGER_STYLE_ID;
  styleElement.textContent = `
body.${DRAGGER_DRAGGING_CLASS},
body.${DRAGGER_DRAGGING_CLASS} * {
  cursor: grabbing !important;
  user-select: none !important;
}
`;
  document.head.appendChild(styleElement);
}

/**
 * 创建主题化拖拽预览节点。
 * @param item - 拖拽项基础数据
 * @returns 拖拽预览节点
 */
function createDraggerPreview(item: DraggerItem): HTMLElement {
  const previewElement = document.createElement('div');
  previewElement.className = DRAGGER_PREVIEW_CLASS;
  previewElement.textContent = item.label;
  Object.assign(previewElement.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    zIndex: '2147483647',
    minWidth: '96px',
    height: '20px',
    padding: '0 14px',
    lineHeight: '20px',
    fontSize: '12px',
    fontWeight: '500',
    textAlign: 'center',
    color: 'var(--text-primary)',
    background: 'color-mix(in srgb, var(--bg-tertiary) 82%, transparent)',
    borderRadius: '2px',
    boxShadow: '0 0 16px rgb(15 23 42 / 14%)',
    pointerEvents: 'none',
    transform: 'translate3d(-120vw, -120vh, 0)'
  });
  document.body.appendChild(previewElement);

  return previewElement;
}

/**
 * 限制比例在 0 到 1 之间。
 * @param ratio - 原始比例
 * @returns 安全比例
 */
function clampRatio(ratio: number): number {
  return Math.min(1, Math.max(0, ratio));
}

/**
 * 获取预览中心握持偏移。
 * @param previewElement - 拖拽预览节点
 * @returns 居中偏移
 */
function getCenteredPointerOffset(previewElement: HTMLElement): DraggerPoint {
  return {
    x: previewElement.offsetWidth / 2,
    y: previewElement.offsetHeight / 2
  };
}

/**
 * 根据指针事件计算鼠标在预览节点内的握持偏移。
 * @param previewElement - 拖拽预览节点
 * @param event - 指针事件
 * @returns 握持偏移
 */
function resolveDraggerPointerOffset(previewElement: HTMLElement, event?: PointerEvent): DraggerPoint {
  if (!event || !(event.currentTarget instanceof HTMLElement)) {
    return getCenteredPointerOffset(previewElement);
  }

  const sourceRect = event.currentTarget.getBoundingClientRect();
  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return getCenteredPointerOffset(previewElement);
  }

  return {
    x: clampRatio((event.clientX - sourceRect.left) / sourceRect.width) * previewElement.offsetWidth,
    y: clampRatio((event.clientY - sourceRect.top) / sourceRect.height) * previewElement.offsetHeight
  };
}

/**
 * 判断浏览器坐标是否位于目标元素内。
 * @param element - 目标元素
 * @param point - 浏览器坐标
 * @returns 是否命中
 */
function isPointInsideElement(element: HTMLElement, point: DraggerPoint): boolean {
  const rect = element.getBoundingClientRect();

  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/**
 * 更新拖拽预览位置。
 * @param previewElement - 拖拽预览节点
 * @param point - 浏览器坐标
 * @param pointerOffset - 鼠标在预览节点内的握持偏移
 */
function updateDraggerPreviewPosition(previewElement: HTMLElement, point: DraggerPoint, pointerOffset: DraggerPoint): void {
  previewElement.style.transform = `translate3d(${point.x - pointerOffset.x}px, ${point.y - pointerOffset.y}px, 0)`;
}

/**
 * 提供通用拖拽控制器。
 * @param controller - 拖拽控制器
 */
export function provideDragger(controller: DraggerController): void {
  provide(DRAGGER_KEY, controller);
}

/**
 * 读取通用拖拽控制器。
 * @returns 拖拽控制器
 */
export function useDraggerController(): DraggerController {
  return (
    inject(DRAGGER_KEY) ?? {
      startDrag: (): void => undefined
    }
  );
}

/**
 * 创建通用自定义拖拽控制器。
 * @param options - hook 入参
 * @returns 拖拽控制器
 */
export function useDragger(options: UseDraggerOptions): DraggerController {
  let session: DraggerSession | null = null;

  /**
   * 清理拖拽会话。
   */
  function cleanupDragSession(): void {
    session?.abortController.abort();
    session?.previewElement.remove();
    session = null;
    document.body.classList.remove(DRAGGER_DRAGGING_CLASS);
  }

  /**
   * 处理拖拽移动。
   * @param event - 指针事件
   */
  function handlePointerMove(event: PointerEvent): void {
    if (!session) {
      return;
    }

    updateDraggerPreviewPosition(session.previewElement, { x: event.clientX, y: event.clientY }, session.pointerOffset);
  }

  /**
   * 处理拖拽释放。
   * @param event - 指针事件
   */
  function handlePointerUp(event: PointerEvent): void {
    if (!session) {
      return;
    }

    const activeSession = session;
    const point = { x: event.clientX, y: event.clientY };
    const dropTargetElement = options.dropTargetRef.value;
    cleanupDragSession();

    if (!dropTargetElement || !isPointInsideElement(dropTargetElement, point)) {
      return;
    }

    options.onDrop(activeSession.item, point);
  }

  /**
   * 开始拖拽项目。
   * @param item - 拖拽项基础数据
   * @param event - 指针事件
   */
  function startDrag(item: DraggerItem, event?: PointerEvent): void {
    if (event && event.button !== 0) {
      return;
    }

    event?.preventDefault();
    cleanupDragSession();
    ensureDraggerGlobalStyle();
    const abortController = new AbortController();
    const previewElement = createDraggerPreview(item);
    const pointerOffset = resolveDraggerPointerOffset(previewElement, event);
    session = {
      item,
      previewElement,
      pointerOffset,
      abortController
    };
    document.body.classList.add(DRAGGER_DRAGGING_CLASS);

    if (event) {
      updateDraggerPreviewPosition(previewElement, { x: event.clientX, y: event.clientY }, pointerOffset);
    }

    window.addEventListener('pointermove', handlePointerMove, { signal: abortController.signal });
    window.addEventListener('pointerup', handlePointerUp, { signal: abortController.signal });
    window.addEventListener('pointercancel', cleanupDragSession, { signal: abortController.signal });
  }

  onBeforeUnmount(cleanupDragSession);

  return {
    startDrag
  };
}
