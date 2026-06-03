/**
 * @file screenshot.ts
 * @description WebView 截图辅助函数。
 */

/**
 * 页面截屏尺寸信息。
 */
export interface WebviewPageCaptureMetrics {
  /** 当前页面总高度（CSS 像素） */
  contentHeight: number;
  /** 当前视口宽度（CSS 像素） */
  viewportWidth: number;
  /** 当前视口高度（CSS 像素） */
  viewportHeight: number;
  /** 页面最大可滚动距离 */
  maxScrollTop: number;
  /** 当前滚动位置 */
  scrollTop: number;
}

/**
 * 单次截屏切片信息。
 */
export interface WebviewPageCaptureSlice {
  /** 在最终长图中的纵向起点 */
  offsetY: number;
  /** 当前切片需要保留的高度 */
  height: number;
  /** 采样前需要滚动到的页面位置 */
  scrollTop: number;
  /** 从当前采样图中裁剪的纵向起点 */
  sourceY: number;
  /** 当前切片是否保留 fixed 元素 */
  captureFixedElements: boolean;
}

/**
 * fixed 元素的布局角色。
 */
export type WebviewFixedElementRole = 'top' | 'bottom' | 'other';

/**
 * 页面内 fixed 元素的可视区域信息。
 */
export interface WebviewFixedElementSnapshot {
  /** 元素唯一标识 */
  id: string;
  /** fixed 元素所属角色 */
  role: WebviewFixedElementRole;
  /** 元素在视口中的顶部位置 */
  top: number;
  /** 元素在视口中的左侧位置 */
  left: number;
  /** 元素宽度 */
  width: number;
  /** 元素高度 */
  height: number;
}

/**
 * 单个 fixed 覆盖片段。
 */
export interface WebviewFixedElementOverlay {
  /** 截图源区域的横向起点 */
  sourceX: number;
  /** 截图源区域的纵向起点 */
  sourceY: number;
  /** 覆盖区域宽度 */
  width: number;
  /** 覆盖区域高度 */
  height: number;
  /** 在最终长图中的横向位置 */
  targetX: number;
  /** 在最终长图中的纵向位置 */
  targetY: number;
}

/**
 * 某个滚动位置下需要采样的 fixed 覆盖分组。
 */
export interface WebviewFixedElementOverlayCapture {
  /** 采样前需要滚动到的位置 */
  scrollTop: number;
  /** 当前采样需要显示的 fixed 角色 */
  roles: WebviewFixedElementRole[];
  /** 从当前截图中裁出的覆盖区域 */
  overlays: WebviewFixedElementOverlay[];
}

/**
 * 判断值是否为页面截屏尺寸信息。
 * @param value - 待校验的值
 * @returns 是否为合法的尺寸信息
 */
export function isWebviewPageCaptureMetrics(value: unknown): value is WebviewPageCaptureMetrics {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const metrics = value as Partial<WebviewPageCaptureMetrics>;
  return [metrics.contentHeight, metrics.viewportWidth, metrics.viewportHeight, metrics.maxScrollTop, metrics.scrollTop].every(
    (item) => typeof item === 'number' && Number.isFinite(item)
  );
}

/**
 * 构建用于读取页面截屏尺寸信息的脚本。
 * @returns 可执行脚本文本
 */
export function createPageCaptureMetricsScript(): string {
  return `
(() => {
  const doc = document.documentElement;
  const body = document.body;
  const contentHeight = Math.max(
    doc?.scrollHeight || 0,
    body?.scrollHeight || 0,
    doc?.offsetHeight || 0,
    body?.offsetHeight || 0,
    window.innerHeight || 0
  );
  const viewportWidth = Math.max(window.innerWidth || 0, doc?.clientWidth || 0);
  const viewportHeight = Math.max(window.innerHeight || 0, doc?.clientHeight || 0);
  const scrollTop = Math.max(window.scrollY || 0, doc?.scrollTop || 0, body?.scrollTop || 0);
  const maxScrollTop = Math.max(contentHeight - viewportHeight, 0);

  return {
    contentHeight,
    viewportWidth,
    viewportHeight,
    maxScrollTop,
    scrollTop
  };
})();
`;
}

/**
 * 构建滚动页面后等待两帧再返回的脚本。
 * @param scrollTop - 目标滚动位置
 * @returns 可执行脚本文本
 */
export function createPageScrollScript(scrollTop: number): string {
  const normalizedScrollTop = Math.max(0, Math.floor(scrollTop));

  return `
(() => new Promise((resolve) => {
  window.scrollTo(0, ${normalizedScrollTop});
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resolve(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0);
    });
  });
}))();
`;
}

/**
 * 按页面总高度和视口高度构建长截屏切片信息。
 * @param metrics - 页面尺寸信息
 * @returns 按顺序采样的切片列表
 */
export function buildPageCaptureSlices(metrics: WebviewPageCaptureMetrics): WebviewPageCaptureSlice[] {
  const normalizedViewportHeight = Math.max(1, Math.floor(metrics.viewportHeight));
  const normalizedContentHeight = Math.max(1, Math.floor(metrics.contentHeight));
  const normalizedMaxScrollTop = Math.max(0, Math.floor(metrics.maxScrollTop));
  const slices: WebviewPageCaptureSlice[] = [];

  for (let offsetY = 0; offsetY < normalizedContentHeight; offsetY += normalizedViewportHeight) {
    const height = Math.min(normalizedViewportHeight, normalizedContentHeight - offsetY);
    const scrollTop = Math.min(offsetY, normalizedMaxScrollTop);
    const sourceY = Math.max(offsetY - scrollTop, 0);

    slices.push({
      offsetY,
      height,
      scrollTop,
      sourceY,
      captureFixedElements: offsetY === 0
    });
  }

  return slices;
}

/**
 * 判断值是否为 fixed 元素快照数组。
 * @param value - 待判断的值
 * @returns 是否为合法快照数组
 */
export function isWebviewFixedElementSnapshotArray(value: unknown): value is WebviewFixedElementSnapshot[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const snapshot = item as Partial<WebviewFixedElementSnapshot>;
      return (
        typeof snapshot.id === 'string' &&
        ['top', 'bottom', 'other'].includes(snapshot.role || '') &&
        typeof snapshot.top === 'number' &&
        typeof snapshot.left === 'number' &&
        typeof snapshot.width === 'number' &&
        typeof snapshot.height === 'number'
      );
    })
  );
}

/**
 * 追加某个滚动位置下的 fixed 覆盖采样项。
 * @param captureMap - 采样分组映射
 * @param scrollTop - 采样滚动位置
 * @param element - 当前元素观测值
 */
function appendOverlayCapture(captureMap: Map<number, WebviewFixedElementOverlayCapture>, scrollTop: number, element: WebviewFixedElementSnapshot): void {
  const overlay: WebviewFixedElementOverlay = {
    sourceX: Math.max(0, element.left),
    sourceY: Math.max(0, element.top),
    width: Math.max(1, element.width),
    height: Math.max(1, element.height),
    targetX: Math.max(0, element.left),
    targetY: Math.max(0, scrollTop + element.top)
  };

  const currentCapture = captureMap.get(scrollTop);
  if (currentCapture) {
    if (!currentCapture.roles.includes(element.role)) {
      currentCapture.roles.push(element.role);
    }
    currentCapture.overlays.push(overlay);
    return;
  }

  captureMap.set(scrollTop, {
    scrollTop,
    roles: [element.role],
    overlays: [overlay]
  });
}

/**
 * 按锚点位置构建 fixed 元素覆盖采样计划。
 * @param metrics - 页面尺寸信息
 * @param observationsBySlice - 各切片可见的定位元素快照
 * @param scrollTops - 各切片对应的滚动位置
 * @returns 采样分组
 */
export function buildFixedElementOverlayCaptures(
  metrics: WebviewPageCaptureMetrics,
  observationsBySlice: WebviewFixedElementSnapshot[][],
  scrollTops: number[]
): WebviewFixedElementOverlayCapture[] {
  const captureMap = new Map<number, WebviewFixedElementOverlayCapture>();
  const lastSliceIndex = Math.max(0, observationsBySlice.length - 1);
  const firstSliceObservations = observationsBySlice[0] || [];
  const lastSliceObservations = observationsBySlice[lastSliceIndex] || [];

  firstSliceObservations.forEach((element) => {
    if (element.role !== 'top') {
      return;
    }

    appendOverlayCapture(captureMap, 0, element);
  });

  lastSliceObservations.forEach((element) => {
    if (element.role !== 'bottom') {
      return;
    }

    appendOverlayCapture(captureMap, scrollTops[lastSliceIndex] ?? metrics.maxScrollTop, element);
  });

  return Array.from(captureMap.values()).sort((left, right) => left.scrollTop - right.scrollTop);
}

/** 用于标记 full-page 截图中 fixed 元素的属性名。 */
const FULL_PAGE_CAPTURE_FIXED_ATTRIBUTE = 'data-tibis-full-page-fixed';
/** 用于标记 full-page 截图中 sticky 元素的属性名。 */
const FULL_PAGE_CAPTURE_STICKY_ATTRIBUTE = 'data-tibis-full-page-sticky';
/** 用于标记定位层唯一标识的属性名。 */
const FULL_PAGE_CAPTURE_OVERLAY_ID_ATTRIBUTE = 'data-tibis-full-page-overlay-id';
/** 用于控制 fixed 元素显隐的样式节点 ID。 */
const FULL_PAGE_CAPTURE_STYLE_ID = '__tibis_full_page_capture_fixed_style__';

/**
 * 构建 full-page 截图前的 fixed 元素标记脚本。
 * @returns 可执行脚本文本
 */
export function createFixedElementCaptureSetupScript(): string {
  return `
(() => {
  const marker = ${JSON.stringify(FULL_PAGE_CAPTURE_FIXED_ATTRIBUTE)};
  const stickyMarker = ${JSON.stringify(FULL_PAGE_CAPTURE_STICKY_ATTRIBUTE)};
  const overlayIdMarker = ${JSON.stringify(FULL_PAGE_CAPTURE_OVERLAY_ID_ATTRIBUTE)};
  const styleId = ${JSON.stringify(FULL_PAGE_CAPTURE_STYLE_ID)};
  const elements = Array.from(document.querySelectorAll('*'));
  let overlayIndex = 0;

  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position !== 'fixed' && computedStyle.position !== 'sticky') {
      return;
    }

    overlayIndex += 1;
    element.setAttribute(overlayIdMarker, String(overlayIndex));

    if (computedStyle.position === 'sticky') {
      element.setAttribute(stickyMarker, 'true');
      return;
    }

    element.setAttribute(marker, 'true');
  });

  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    document.documentElement.appendChild(style);
  }

  return null;
})();
`;
}

/**
 * 构建读取当前视口中已标记定位元素的脚本。
 * @returns 可执行脚本文本
 */
export function createVisiblePositionedElementSnapshotScript(): string {
  return `
(() => {
  const fixedMarker = ${JSON.stringify(FULL_PAGE_CAPTURE_FIXED_ATTRIBUTE)};
  const stickyMarker = ${JSON.stringify(FULL_PAGE_CAPTURE_STICKY_ATTRIBUTE)};
  const overlayIdMarker = ${JSON.stringify(FULL_PAGE_CAPTURE_OVERLAY_ID_ATTRIBUTE)};

  return Array.from(document.querySelectorAll('[' + overlayIdMarker + ']'))
    .filter((element) => element instanceof HTMLElement)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return null;
      }

      if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
        return null;
      }

      const computedStyle = window.getComputedStyle(element);
      const role = (() => {
        if (computedStyle.bottom !== 'auto' && rect.bottom >= window.innerHeight - 1) {
          return 'bottom';
        }

        if (computedStyle.top !== 'auto' && rect.top <= 1) {
          return 'top';
        }

        return 'other';
      })();

      if (!element.hasAttribute(fixedMarker) && !element.hasAttribute(stickyMarker)) {
        return null;
      }

      return {
        id: element.getAttribute(overlayIdMarker) || '',
        role,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    })
    .filter(Boolean);
})();
`;
}

/**
 * 构建切换 fixed 元素显隐的脚本。
 * @param visible - 是否显示 fixed 元素，或指定显示哪些 fixed 角色
 * @returns 可执行脚本文本
 */
export function createFixedElementVisibilityScript(visible: boolean | WebviewFixedElementRole[]): string {
  const stickyRule = `[${FULL_PAGE_CAPTURE_STICKY_ATTRIBUTE}="true"] { position: relative !important; top: auto !important; bottom: auto !important; }`;
  let cssText = '';

  if (Array.isArray(visible)) {
    if (!visible.length) {
      cssText = [`[${FULL_PAGE_CAPTURE_FIXED_ATTRIBUTE}="true"] { visibility: hidden !important; }`, stickyRule].join('\n');
    }
  } else if (!visible) {
    cssText = [`[${FULL_PAGE_CAPTURE_FIXED_ATTRIBUTE}="true"] { visibility: hidden !important; }`, stickyRule].join('\n');
  }

  return `
(() => new Promise((resolve) => {
  const styleId = ${JSON.stringify(FULL_PAGE_CAPTURE_STYLE_ID)};
  const style = document.getElementById(styleId);
  if (!(style instanceof HTMLStyleElement)) {
    resolve(null);
    return;
  }

  style.textContent = ${JSON.stringify(cssText)};
  requestAnimationFrame(() => {
    requestAnimationFrame(() => resolve(null));
  });
}))();
`;
}

/**
 * 构建清理 fixed 元素标记与样式的脚本。
 * @returns 可执行脚本文本
 */
export function createFixedElementCaptureCleanupScript(): string {
  return `
(() => {
  const marker = ${JSON.stringify(FULL_PAGE_CAPTURE_FIXED_ATTRIBUTE)};
  const stickyMarker = ${JSON.stringify(FULL_PAGE_CAPTURE_STICKY_ATTRIBUTE)};
  const overlayIdMarker = ${JSON.stringify(FULL_PAGE_CAPTURE_OVERLAY_ID_ATTRIBUTE)};
  const styleId = ${JSON.stringify(FULL_PAGE_CAPTURE_STYLE_ID)};

  document.querySelectorAll('[' + marker + '="true"]').forEach((element) => {
    if (element instanceof HTMLElement) {
      element.removeAttribute(marker);
      element.removeAttribute(overlayIdMarker);
    }
  });

  document.querySelectorAll('[' + stickyMarker + '="true"]').forEach((element) => {
    if (element instanceof HTMLElement) {
      element.removeAttribute(stickyMarker);
      element.removeAttribute(overlayIdMarker);
    }
  });

  document.getElementById(styleId)?.remove();
  return null;
})();
`;
}

/**
 * 从 PNG 二进制内容创建 Blob。
 * @param bytes - PNG ArrayBuffer
 * @returns 可用于预览或下载的 PNG Blob
 */
export function createPngBlob(bytes: ArrayBuffer): Blob {
  return new Blob([bytes], { type: 'image/png' });
}

/**
 * 规范化截图文件名片段。
 * @param value - 原始标题
 * @returns 过滤非法字符后的文件名片段
 */
function sanitizeFileNameSegment(value: string): string {
  const replacedIllegalCharacters = value.replace(/[<>:"/\\|?*]/g, ' ');
  const removedControlCharacters = Array.from(replacedIllegalCharacters)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32;
    })
    .join('');

  return removedControlCharacters.replace(/\s+/g, ' ').trim();
}

/**
 * 生成截图默认文件名。
 * @param title - 页面标题
 * @param mode - 截图模式
 * @param now - 当前时间
 * @returns 推荐保存文件名
 */
export function buildScreenshotDefaultPath(title: string, mode: 'viewport' | 'full-page', now: Date = new Date()): string {
  const normalizedTitle = sanitizeFileNameSegment(title) || 'webview';
  const timestamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0')
  ].join('-');

  return `${normalizedTitle}-${mode}-${timestamp}.png`;
}
