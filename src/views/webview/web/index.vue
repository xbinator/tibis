<template>
  <div class="webview-shell">
    <AddressBar
      :url="webview.state.value.url"
      :can-go-back="webview.state.value.canGoBack"
      :can-go-forward="webview.state.value.canGoForward"
      :is-loading="webview.state.value.isLoading"
      :is-element-selecting="webview.state.value.isElementSelecting"
      supports-element-selection
      @go-back="webview.goBack"
      @go-forward="webview.goForward"
      @reload="webview.reload"
      @stop="webview.stop"
      @submit-url="handleSubmitUrl"
      @open-in-browser="openInBrowser"
      @select-element="webview.startElementSelection"
    />

    <div ref="webviewContainerRef" class="webview-content"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description `<webview>` 标签页面入口。
 */
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useResizeObserver } from '@vueuse/core';
import { native } from '@/shared/platform';
import AddressBar from '@/views/webview/shared/components/AddressBar.vue';
import { useWebviewTabTitle } from '@/views/webview/shared/hooks/useWebviewTabTitle';
import { normalizeWebviewUrl } from '@/views/webview/shared/utils/url';
import { useTagWebView } from './hooks/useTagWebView';
import { ensureHostedWebviewElement, ensureWebviewHostLayer, hideWebviewHostLayer, showWebviewHostLayer } from './utils/hosting';

const route = useRoute();
const webviewContainerRef = ref<HTMLElement | null>(null);
const webviewElementRef = ref<Electron.WebviewTag | null>(null);
const routeFullPath = route.fullPath;
const initialUrl = normalizeWebviewUrl(decodeURIComponent((route.query.url as string) || ''));
const webview = useTagWebView(webviewElementRef);

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
  webview.attachInitialUrl(initialUrl);
  return element;
}

/**
 * 根据占位容器同步宿主层位置和尺寸。
 */
function syncHostLayerBounds(): void {
  const container = webviewContainerRef.value;
  if (!container) {
    return;
  }

  const rect = container.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  showWebviewHostLayer(ensureWebviewHostLayer(document, routeFullPath), {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  });
}

useWebviewTabTitle({
  routeFullPath,
  title: computed(() => webview.state.value.title)
});

onMounted(() => {
  ensureWebviewElement();
  syncHostLayerBounds();
});

onActivated(() => {
  syncHostLayerBounds();
});

onDeactivated(() => {
  hideWebviewHostLayer(ensureWebviewHostLayer(document, routeFullPath));
});

useResizeObserver(webviewContainerRef, syncHostLayerBounds);

onBeforeUnmount(() => {
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
  flex: 1;
  width: 100%;
}
</style>
