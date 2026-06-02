<template>
  <div class="webview-shell">
    <AddressBar
      :url="webview.state.value.url"
      :can-go-back="webview.state.value.canGoBack"
      :can-go-forward="webview.state.value.canGoForward"
      :is-loading="webview.state.value.isLoading"
      :is-element-selecting="webview.state.value.isElementSelecting"
      :is-device-toolbar-visible="deviceMode.isToolbarVisible.value"
      supports-element-selection
      supports-device-toolbar
      @go-back="webview.goBack"
      @go-forward="webview.goForward"
      @reload="webview.reload"
      @stop="webview.stop"
      @submit-url="handleSubmitUrl"
      @open-in-browser="openInBrowser"
      @select-element="handleStartElementSelection"
      @toggle-device-toolbar="deviceMode.toggleToolbarVisible"
    />

    <DeviceToolbar v-if="deviceMode.isToolbarVisible.value" :active-preset="deviceMode.activePreset.value" @select-preset="handleSelectDevicePreset" />

    <div ref="webviewContentRef" class="webview-content" :class="{ 'webview-content--framed': isDeviceFramed }" @scroll="syncHostLayerBounds">
      <div ref="webviewContainerRef" class="webview-viewport" :style="viewportStyle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description `<webview>` 标签页面入口。
 */
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch, type CSSProperties } from 'vue';
import { useRoute } from 'vue-router';
import { useEventListener, useResizeObserver } from '@vueuse/core';
import { native } from '@/shared/platform';
import AddressBar from '@/views/webview/shared/components/AddressBar.vue';
import { useWebviewTabTitle } from '@/views/webview/shared/hooks/useWebviewTabTitle';
import { normalizeWebviewUrl } from '@/views/webview/shared/utils/url';
import DeviceToolbar from './components/DeviceToolbar.vue';
import { useDeviceMode, type WebviewDevicePresetKey } from './hooks/useDeviceMode.ts';
import { useWebView } from './hooks/useWebView.ts';
import { ensureHostedWebviewElement, ensureWebviewHostLayer, hideWebviewHostLayer, showWebviewHostLayer } from './utils/hosting';
import { resolveVisibleWebviewBounds } from './utils/viewportBounds';

const route = useRoute();
const webviewContentRef = ref<HTMLElement | null>(null);
const webviewContainerRef = ref<HTMLElement | null>(null);
const webviewElementRef = ref<Electron.WebviewTag | null>(null);
const routeFullPath = route.fullPath;
const initialUrl = normalizeWebviewUrl(decodeURIComponent((route.query.url as string) || ''));
const webview = useWebView(webviewElementRef);
const deviceMode = useDeviceMode();
let syncHostLayerFrame: number | null = null;
const isDeviceFramed = computed(() => deviceMode.isToolbarVisible.value);
const activeUserAgent = computed(() => (deviceMode.isToolbarVisible.value ? deviceMode.activePreset.value.userAgent : ''));
const viewportStyle = computed<CSSProperties>(() => {
  if (!isDeviceFramed.value) {
    return {};
  }

  const preset = deviceMode.activePreset.value;

  return {
    width: `${preset.width}px`,
    height: `${preset.height}px`
  };
});

const offAttachRejected = window.electronAPI?.webview.onAttachRejected((payload) => {
  if (payload.src !== webview.state.value.url) {
    return;
  }

  webview.handleAttachRejected(payload);
});

/**
 * 在系统浏览器中打开当前 URL。
 */
async function openInBrowser(): Promise<void> {
  if (!webview.state.value.url) {
    return;
  }

  await native.openExternal(webview.state.value.url);
}

/**
 * 处理地址栏提交的 URL。
 * @param value - 用户输入的 URL
 */
function handleSubmitUrl(value: string): void {
  webview.navigate(normalizeWebviewUrl(value));
}

/**
 * 切换到指定设备尺寸预设。
 * @param presetKey - 设备尺寸预设标识
 */
function handleSelectDevicePreset(presetKey: WebviewDevicePresetKey): void {
  deviceMode.selectPreset(presetKey);
}

/**
 * 读取当前应用主题中的元素选择器高亮色。
 * @returns 页面元素选择器主题
 */
function resolveElementPickerTheme(): { color: string; background: string } {
  const rootStyle = getComputedStyle(document.documentElement);
  const color = rootStyle.getPropertyValue('--color-primary').trim() || '#2563eb';
  const background = rootStyle.getPropertyValue('--color-primary-bg').trim() || 'rgba(37,99,235,.12)';
  return { color, background };
}

/**
 * 开启页面 DOM 元素选择模式。
 */
function handleStartElementSelection(): void {
  webview.startElementSelection(resolveElementPickerTheme()).catch((error: unknown) => {
    console.error('Failed to start webview element selection:', error);
  });
}

/**
 * 根据占位容器同步宿主层位置和尺寸。
 */
function syncHostLayerBounds(): void {
  syncHostLayerFrame = null;
  const container = webviewContainerRef.value;
  const scrollFrame = webviewContentRef.value;
  const hostLayer = ensureWebviewHostLayer(document, routeFullPath);
  if (!container || !scrollFrame) {
    hideWebviewHostLayer(hostLayer);
    return;
  }

  const visibleBounds = resolveVisibleWebviewBounds(container.getBoundingClientRect(), scrollFrame.getBoundingClientRect());
  if (!visibleBounds) {
    hideWebviewHostLayer(hostLayer);
    return;
  }

  const hostLayerX = visibleBounds.x - visibleBounds.offsetX;
  const hostLayerY = visibleBounds.y - visibleBounds.offsetY;
  const clipRight = visibleBounds.contentWidth - visibleBounds.offsetX - visibleBounds.width;
  const clipBottom = visibleBounds.contentHeight - visibleBounds.offsetY - visibleBounds.height;

  showWebviewHostLayer(hostLayer, {
    x: hostLayerX,
    y: hostLayerY,
    width: visibleBounds.contentWidth,
    height: visibleBounds.contentHeight,
    clip: {
      top: visibleBounds.offsetY,
      right: clipRight,
      bottom: clipBottom,
      left: visibleBounds.offsetX
    }
  });

  const element = webviewElementRef.value;
  if (!element) {
    return;
  }

  element.style.width = `${Math.round(visibleBounds.contentWidth)}px`;
  element.style.height = `${Math.round(visibleBounds.contentHeight)}px`;
  element.style.transform = 'translate(0px, 0px)';
}

/**
 * 请求在下一帧同步宿主层范围，合并连续 resize 与滚动触发。
 */
function requestSyncHostLayerBounds(): void {
  if (syncHostLayerFrame !== null) {
    cancelAnimationFrame(syncHostLayerFrame);
  }

  syncHostLayerFrame = requestAnimationFrame(syncHostLayerBounds);
}

/**
 * 在设备视口被宿主层覆盖时转发滚轮到外层滚动容器。
 * @param event - 滚轮事件
 */
function handleHostedWheel(event: WheelEvent): void {
  const scroller = webviewContentRef.value;
  if (!isDeviceFramed.value || !scroller) {
    return;
  }

  const previousLeft = scroller.scrollLeft;
  const previousTop = scroller.scrollTop;
  scroller.scrollBy({
    left: event.deltaX,
    top: event.deltaY,
    behavior: 'auto'
  });

  if (scroller.scrollLeft !== previousLeft || scroller.scrollTop !== previousTop) {
    event.preventDefault();
    syncHostLayerBounds();
  }
}

/**
 * 接收通用 DOM 事件并转发有效滚轮事件。
 * @param event - DOM 事件
 */
function handleHostedWheelEvent(event: Event): void {
  if (!(event instanceof WheelEvent)) {
    return;
  }

  handleHostedWheel(event);
}

/**
 * 绑定 `<webview>` 事件。
 * @param element - `<webview>` 元素
 */
function bindWebviewEvents(element: Electron.WebviewTag): void {
  element.addEventListener('did-start-loading', webview.handleDidStartLoading as EventListener);
  element.addEventListener('dom-ready', webview.handleDomReady as EventListener);
  element.addEventListener('did-navigate', webview.handleDidNavigate as EventListener);
  element.addEventListener('did-navigate-in-page', webview.handleDidNavigate as EventListener);
  element.addEventListener('page-title-updated', webview.handleTitleUpdated as EventListener);
  element.addEventListener('did-stop-loading', webview.handleDidStopLoading as EventListener);
  element.addEventListener('wheel', handleHostedWheelEvent, false);
}

/**
 * 解绑 `<webview>` 事件。
 * @param element - `<webview>` 元素
 */
function unbindWebviewEvents(element: Electron.WebviewTag): void {
  element.removeEventListener('did-start-loading', webview.handleDidStartLoading as EventListener);
  element.removeEventListener('dom-ready', webview.handleDomReady as EventListener);
  element.removeEventListener('did-navigate', webview.handleDidNavigate as EventListener);
  element.removeEventListener('did-navigate-in-page', webview.handleDidNavigate as EventListener);
  element.removeEventListener('page-title-updated', webview.handleTitleUpdated as EventListener);
  element.removeEventListener('did-stop-loading', webview.handleDidStopLoading as EventListener);
  element.removeEventListener('wheel', handleHostedWheelEvent);
}

/**
 * 创建并缓存 `<webview>` 元素，只创建一次。
 * `<webview>` 与当前标签页宿主层始终挂在 `document.body` 下，不跟随页面 DOM 重挂载。
 * @returns `<webview>` 元素
 */
function ensureWebviewElement(): Electron.WebviewTag {
  const existing = webviewElementRef.value;
  if (existing) {
    return existing;
  }

  const hostLayer = ensureWebviewHostLayer(document, routeFullPath);
  const element = ensureHostedWebviewElement(hostLayer);
  bindWebviewEvents(element);
  webviewElementRef.value = element;
  webview.create(initialUrl);
  webview.setUserAgent(activeUserAgent.value);
  webview.attachInitialUrl(initialUrl);
  return element;
}

useWebviewTabTitle({
  routeFullPath,
  title: computed(() => webview.state.value.title)
});

onMounted(() => {
  ensureWebviewElement();
  requestSyncHostLayerBounds();
});

onActivated(() => {
  requestSyncHostLayerBounds();
});

onDeactivated(() => {
  hideWebviewHostLayer(ensureWebviewHostLayer(document, routeFullPath));
});

useResizeObserver(webviewContainerRef, requestSyncHostLayerBounds);
useResizeObserver(webviewContentRef, requestSyncHostLayerBounds);
useEventListener(window, 'resize', requestSyncHostLayerBounds);

watch([deviceMode.isToolbarVisible, deviceMode.activePreset], () => {
  nextTick(requestSyncHostLayerBounds).catch((error: unknown) => {
    console.error('Failed to sync webview device viewport bounds:', error);
  });
});

watch(deviceMode.touchSimulationEnabled, (enabled) => {
  webview.setTouchSimulationEnabled(enabled).catch((error: unknown) => {
    console.error('Failed to update webview touch simulation:', error);
  });
});

watch(activeUserAgent, (userAgent) => {
  webview.setUserAgent(userAgent);
});

onBeforeUnmount(() => {
  if (syncHostLayerFrame !== null) {
    cancelAnimationFrame(syncHostLayerFrame);
    syncHostLayerFrame = null;
  }

  const element = webviewElementRef.value;
  if (element) {
    unbindWebviewEvents(element);
    element.parentElement?.remove();
    webviewElementRef.value = null;
  }
  offAttachRejected?.();
});
</script>

<style scoped>
.webview-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;
}

.webview-content {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.webview-content--framed {
  flex-direction: row;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
}

.webview-viewport {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border: 0;
  border-radius: 8px;
}

.webview-content--framed .webview-viewport {
  flex: 0 0 auto;
  max-width: 100%;
  height: auto;
  box-shadow: 0 0 0 1px var(--border-color);
}
</style>
