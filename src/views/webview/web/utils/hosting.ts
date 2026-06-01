/**
 * @file hosting.ts
 * @description 管理 `<webview>` 标签页宿主层与 DOM 节点。
 */

/**
 * 宿主层节点 ID。
 */
export const WEBVIEW_HOST_LAYER_ID = 'tibis-webview-host-layer';

/**
 * WebView 统一圆角半径。
 */
export const WEBVIEW_BORDER_RADIUS_PX = 8;

/**
 * WebView 宿主层显示范围。
 */
export interface WebviewHostBounds {
  /** 左上角 x 坐标 */
  x: number;
  /** 左上角 y 坐标 */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 解析指定标签页对应的宿主层 ID。
 * @param hostKey - 标签页隔离 key，不传时使用默认宿主层 ID
 * @returns 宿主层 DOM id
 */
function resolveWebviewHostLayerId(hostKey?: string): string {
  if (!hostKey) {
    return WEBVIEW_HOST_LAYER_ID;
  }

  return `${WEBVIEW_HOST_LAYER_ID}-${encodeURIComponent(hostKey)}`;
}

/**
 * 隐藏宿主层但不销毁内部 `<webview>`。
 * @param hostLayer - 标签页宿主层
 */
export function hideWebviewHostLayer(hostLayer: HTMLElement): void {
  hostLayer.style.display = 'none';
  hostLayer.style.pointerEvents = 'none';
}

/**
 * 隐藏同文档下其它 WebView 宿主层，避免多个标签页内容互相遮挡。
 * @param activeHostLayer - 当前需要显示的宿主层
 */
function hideInactiveWebviewHostLayers(activeHostLayer: HTMLElement): void {
  const hostLayers = activeHostLayer.ownerDocument.querySelectorAll<HTMLElement>(`[id^="${WEBVIEW_HOST_LAYER_ID}"]`);

  hostLayers.forEach((hostLayer) => {
    if (hostLayer === activeHostLayer) {
      return;
    }

    hideWebviewHostLayer(hostLayer);
  });
}

/**
 * 确保文档中存在指定标签页的 `<webview>` 宿主层。
 * @param doc - 目标文档对象
 * @param hostKey - 标签页隔离 key
 * @returns 宿主层元素
 */
export function ensureWebviewHostLayer(doc: Document, hostKey?: string): HTMLDivElement {
  const hostLayerId = resolveWebviewHostLayerId(hostKey);
  const existing = doc.getElementById(hostLayerId);
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const hostLayer = doc.createElement('div');
  hostLayer.id = hostLayerId;
  hostLayer.style.position = 'fixed';
  hostLayer.style.left = '0';
  hostLayer.style.top = '0';
  hostLayer.style.width = '0';
  hostLayer.style.height = '0';
  hostLayer.style.display = 'none';
  hostLayer.style.overflow = 'hidden';
  hostLayer.style.pointerEvents = 'none';
  hostLayer.style.borderRadius = `${WEBVIEW_BORDER_RADIUS_PX}px`;
  doc.body.appendChild(hostLayer);
  return hostLayer;
}

/**
 * 确保宿主层里存在当前标签页专属的 `<webview>` 节点。
 * @param hostLayer - 标签页宿主层
 * @returns `<webview>` 元素
 */
export function ensureHostedWebviewElement(hostLayer: HTMLElement): Electron.WebviewTag {
  const existing = hostLayer.querySelector('webview');
  if (existing instanceof HTMLElement) {
    return existing as Electron.WebviewTag;
  }

  const webviewElement = document.createElement('webview') as Electron.WebviewTag;
  webviewElement.className = 'webview-content__element';
  webviewElement.style.width = '100%';
  webviewElement.style.height = '100%';
  webviewElement.style.border = '0';
  webviewElement.style.borderRadius = `${WEBVIEW_BORDER_RADIUS_PX}px`;
  hostLayer.appendChild(webviewElement);
  return webviewElement;
}

/**
 * 显示宿主层并同步位置尺寸。
 * @param hostLayer - 标签页宿主层
 * @param bounds - 目标位置和尺寸
 */
export function showWebviewHostLayer(hostLayer: HTMLElement, bounds: WebviewHostBounds): void {
  hideInactiveWebviewHostLayers(hostLayer);
  hostLayer.style.display = 'block';
  hostLayer.style.pointerEvents = 'auto';
  hostLayer.style.left = `${Math.round(bounds.x)}px`;
  hostLayer.style.top = `${Math.round(bounds.y)}px`;
  hostLayer.style.width = `${Math.round(bounds.width)}px`;
  hostLayer.style.height = `${Math.round(bounds.height)}px`;
}
