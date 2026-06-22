<template>
  <div class="webview-shell">
    <AddressBar
      :url="webview.state.value.url"
      :can-go-back="webview.state.value.canGoBack"
      :can-go-forward="webview.state.value.canGoForward"
      :is-loading="webview.state.value.isLoading"
      :is-element-selecting="webview.state.value.isElementSelecting"
      :is-device-toolbar-visible="deviceMode.isToolbarVisible.value"
      :is-inspector-open="isInspectorOpen"
      :has-selected-element="Boolean(webview.selectedElement)"
      supports-element-selection
      supports-device-toolbar
      supports-inspector
      @go-back="webview.goBack"
      @go-forward="webview.goForward"
      @reload="webview.reload"
      @stop="webview.stop"
      @submit-url="handleSubmitUrl"
      @open-in-browser="openInBrowser"
      @open-dev-tools="webview.openDevTools"
      @select-element="handleStartElementSelection"
      @toggle-device-toolbar="deviceMode.toggleToolbarVisible"
      @toggle-inspector="toggleInspector"
      @capture-viewport-screenshot="screenshot.captureViewportScreenshot"
      @capture-full-page-screenshot="screenshot.captureFullPageScreenshot"
      @capture-selected-element-screenshot="handleCaptureSelectedElementScreenshot"
      @clear-cache="cacheControl.clearCache"
    />

    <DeviceToolbar v-if="deviceMode.isToolbarVisible.value" :active-preset="deviceMode.activePreset.value" @select-preset="handleSelectDevicePreset" />

    <div class="webview-main">
      <div ref="webviewContentRef" class="webview-content" :class="{ 'webview-content--framed': isDeviceFramed }" @scroll="requestSyncHostLayerBounds">
        <div ref="webviewContainerRef" class="webview-viewport" :style="viewportStyle"></div>
      </div>

      <BPanelSplitter v-if="isInspectorOpen" v-model:size="domPanelWidth" :min-width="280" :max-width="480" :closable="false">
        <InspectorPanel :selection="webview.selectedElement" @close="handleCloseDomInspector" />
      </BPanelSplitter>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description `<webview>` 标签页面入口。
 */
import type { WebviewTag } from 'electron';
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch, type CSSProperties } from 'vue';
import { useRoute } from 'vue-router';
import { debounce } from 'lodash-es';
import { webviewToolContextRegistry } from '@/ai/tools/context/webview';
import { native } from '@/shared/platform';
import { useRecentStore } from '@/stores/workspace/recent';
import { useWebviewTabTitle } from '@/views/webview/shared/hooks/useWebviewTabTitle';
import { normalizeWebviewUrl } from '@/views/webview/shared/utils/url';
import AddressBar from './components/AddressBar.vue';
import DeviceToolbar from './components/DeviceToolbar.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import { useCacheControl } from './hooks/useCacheControl.ts';
import { useDeviceMode, type WebviewDevicePresetKey } from './hooks/useDeviceMode.ts';
import { useHostLayer } from './hooks/useHostLayer.ts';
import { useScreenshot } from './hooks/useScreenshot.ts';
import { useWebView } from './hooks/useWebView.ts';
import { ensureHostedWebviewElement, ensureWebviewHostLayer } from './utils/hosting';

const route = useRoute();
const webviewContentRef = ref<HTMLElement | null>(null);
const webviewContainerRef = ref<HTMLElement | null>(null);
const webviewElementRef = ref<WebviewTag | null>(null);

const routeFullPath = route.fullPath;
const initialUrl = normalizeWebviewUrl(decodeURIComponent((route.query.url as string) || ''));

const webview = useWebView(webviewElementRef);
const deviceMode = useDeviceMode();
const screenshot = useScreenshot({ webviewElementRef, webviewState: webview.state });
const cacheControl = useCacheControl();

webviewToolContextRegistry.register(routeFullPath, { readPageSnapshot: webview.readPageSnapshot });

/** DOM 检查看板宽度 */
const domPanelWidth = ref(360);

/** CSS 查看器是否打开，null 表示用户尚未决定（首次选中元素时自动打开） */
const isInspectorOpen = ref<boolean | null>(null);

const isDeviceFramed = computed(() => deviceMode.isToolbarVisible.value);

const activeUserAgent = computed(() => (deviceMode.isToolbarVisible.value ? deviceMode.activePreset.value.userAgent : ''));

const viewportStyle = computed<CSSProperties>(() => {
  if (!isDeviceFramed.value) {
    return {};
  }

  const { width, height } = deviceMode.activePreset.value;
  return { width: `${width}px`, height: `${height}px` };
});

// ---- 宿主层同步（RAF + resize + scroll 统一管理）----
const { requestSyncHostLayerBounds } = useHostLayer(routeFullPath, webviewContainerRef, webviewContentRef, webviewElementRef);

// ---- Wheel 转发（早返回简化）----

/**
 * 在设备视口被宿主层覆盖时转发滚轮到外层滚动容器。
 * @param event - 滚轮事件
 */
function handleHostedWheel(event: WheelEvent): void {
  const scroller = webviewContentRef.value;
  if (!isDeviceFramed.value || !scroller) {
    return;
  }

  const { scrollLeft, scrollTop } = scroller;
  scroller.scrollBy({ left: event.deltaX, top: event.deltaY, behavior: 'auto' });

  if (scroller.scrollLeft !== scrollLeft || scroller.scrollTop !== scrollTop) {
    event.preventDefault();
    requestSyncHostLayerBounds();
  }
}

/**
 * 接收通用 DOM 事件并转发有效滚轮事件。
 * @param event - DOM 事件
 */
function handleHostedWheelEvent(event: Event): void {
  if (!(event instanceof WheelEvent) || !isDeviceFramed.value) {
    return;
  }

  handleHostedWheel(event);
}

const recentStore = useRecentStore();
let hasWrittenRecentWebviewRecord = false;

/**
 * 导航事件回调，将当前 webview 页面写入最近记录。
 * debounce 300ms 避免重定向链产生多条记录。
 */
const writeRecentWebviewRecord = debounce(() => {
  if (hasWrittenRecentWebviewRecord) return;

  const { url, title } = webview.state.value;
  if (!url) return;
  hasWrittenRecentWebviewRecord = true;
  recentStore.addWebviewRecord(url, title || url).catch(console.error);
}, 300);

/**
 * 导航完成事件处理，触发记录写入。
 */
function handleDidNavigateRecord(): void {
  if (hasWrittenRecentWebviewRecord) return;

  writeRecentWebviewRecord();
}

/**
 * `<webview>` 事件绑定映射表，用于统一绑定与解绑。
 */
const webviewEventMap: Array<{ name: string; handler: EventListener | ((event: Event) => void); useCapture?: boolean }> = [
  { name: 'did-start-loading', handler: webview.handleDidStartLoading as EventListener },
  { name: 'dom-ready', handler: webview.handleDomReady as EventListener },
  { name: 'did-navigate', handler: webview.handleDidNavigate as EventListener },
  { name: 'did-navigate-in-page', handler: webview.handleDidNavigate as EventListener },
  { name: 'page-title-updated', handler: webview.handleTitleUpdated as EventListener },
  { name: 'did-stop-loading', handler: webview.handleDidStopLoading as EventListener },
  { name: 'console-message', handler: webview.handleConsoleMessage },
  { name: 'wheel', handler: handleHostedWheelEvent },
  { name: 'did-navigate', handler: handleDidNavigateRecord },
  { name: 'did-navigate-in-page', handler: handleDidNavigateRecord }
];

/**
 * 绑定 `<webview>` 事件。
 * @param element - `<webview>` 元素
 */
function bindWebviewEvents(element: WebviewTag): void {
  webviewEventMap.forEach(({ name, handler, useCapture }) => {
    element.addEventListener(name, handler, useCapture);
  });
}

/**
 * 解绑 `<webview>` 事件。
 * @param element - `<webview>` 元素
 */
function unbindWebviewEvents(element: WebviewTag): void {
  webviewEventMap.forEach(({ name, handler, useCapture }) => {
    element.removeEventListener(name, handler, useCapture);
  });
}

/**
 * 在系统浏览器中打开当前 URL。
 */
async function openInBrowser(): Promise<void> {
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
 * 切换页面 DOM 元素持续选择模式。
 */
function handleStartElementSelection(): void {
  const action = webview.state.value.isElementSelecting ? webview.stopElementSelection() : webview.startElementSelection(resolveElementPickerTheme());

  action.catch((err: unknown) => console.error('Element selection error:', err));
}

/**
 * 关闭 DOM 检查看板并停止元素选择模式。
 */
function handleCloseDomInspector(): void {
  isInspectorOpen.value = false;
}

/**
 * 切换 CSS 查看器面板。
 * null 视为关闭状态，切换后打开；非 null 取反。
 */
function toggleInspector(): void {
  isInspectorOpen.value = isInspectorOpen.value === null ? true : !isInspectorOpen.value;
}

/**
 * 按当前选中 DOM 元素截图。
 */
function handleCaptureSelectedElementScreenshot(): void {
  screenshot.captureSelectedElementScreenshot(webview.selectedElement).catch(console.error);
}

/**
 * 监听宿主拒绝附加 `<webview>` 的事件。
 */
const offAttachRejected = window.electronAPI?.webview.onAttachRejected((payload) => {
  if (payload.src === webview.state.value.url) {
    webview.handleAttachRejected(payload);
  }
});

/**
 * 创建并缓存 `<webview>` 元素，只创建一次。
 * `<webview>` 与当前标签页宿主层始终挂在 `document.body` 下，不跟随页面 DOM 重挂载。
 * @returns `<webview>` 元素
 */
function ensureWebviewElement(): WebviewTag {
  if (webviewElementRef.value) {
    return webviewElementRef.value;
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

ensureWebviewElement();

useWebviewTabTitle({
  routeFullPath,
  title: computed(() => webview.state.value.title)
});

// ---- Watches（合并 toolbar + preset 变化触发视口同步）----
watch([deviceMode.isToolbarVisible, deviceMode.activePreset], () => nextTick(requestSyncHostLayerBounds).catch(console.error));

/**
 * 监听选中元素变化，首次选中时自动打开 DOM 检查看板。
 * 用户手动关闭后 isInspectorOpen 为 false，不再自动打开。
 */
watch(webview.selectedElementRef, (value) => {
  if (value && isInspectorOpen.value === null) {
    isInspectorOpen.value = true;
  }
});

watch(deviceMode.touchSimulationEnabled, (enabled) => {
  webview.setTouchSimulationEnabled(enabled).catch(console.error);
});

watch(activeUserAgent, (userAgent) => {
  webview.setUserAgent(userAgent);
});

onMounted(() => {
  webviewToolContextRegistry.setCurrent(routeFullPath);
});

onActivated(() => {
  webviewToolContextRegistry.setCurrent(routeFullPath);
});

onDeactivated(() => {
  webviewToolContextRegistry.clearCurrent(routeFullPath);
});

onBeforeUnmount(() => {
  webviewToolContextRegistry.unregister(routeFullPath);
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

.webview-main {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
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
}
</style>
