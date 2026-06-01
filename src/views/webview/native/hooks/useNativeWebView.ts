/**
 * @file useNativeWebView.ts
 * @description 封装 native WebContentsView 的 IPC 控制逻辑。
 */
import type { WebViewBounds } from 'types/webview';
import { onUnmounted, ref, type Ref } from 'vue';
import type { WebviewPageState } from '@/views/webview/shared/types';

/**
 * 默认 WebView 页面状态。
 */
const DEFAULT_STATE: WebviewPageState = {
  url: '',
  title: '',
  isLoading: false,
  isElementSelecting: false,
  canGoBack: false,
  canGoForward: false,
  loadProgress: 0
};

/**
 * 创建 native WebView 控制器。
 * @param tabId - 当前页面对应的主进程视图 ID
 * @returns native WebView 状态与控制方法
 */
export function useNativeWebView(tabId: Ref<string> | string) {
  const resolvedTabId = typeof tabId === 'string' ? tabId : tabId.value;
  const state = ref<WebviewPageState>({ ...DEFAULT_STATE });

  let unsubState: (() => void) | null = null;
  let unsubTitle: (() => void) | null = null;
  let unsubNav: (() => void) | null = null;

  /**
   * 创建 WebContentsView 实例。
   * @param url - 初始 URL
   */
  function create(url: string): void {
    state.value.url = url;
    window.electronAPI!.webview.create(resolvedTabId, url);
  }

  /**
   * 销毁 WebContentsView。
   * @returns IPC Promise
   */
  function destroy(): Promise<unknown> {
    return window.electronAPI!.webview.destroy(resolvedTabId);
  }

  /**
   * 导航到新地址。
   * @param url - 目标 URL
   * @returns IPC Promise
   */
  function navigate(url: string): Promise<unknown> {
    state.value.url = url;
    return window.electronAPI!.webview.navigate(resolvedTabId, url);
  }

  /**
   * 后退。
   * @returns IPC Promise
   */
  function goBack(): Promise<unknown> {
    return window.electronAPI!.webview.goBack(resolvedTabId);
  }

  /**
   * 前进。
   * @returns IPC Promise
   */
  function goForward(): Promise<unknown> {
    return window.electronAPI!.webview.goForward(resolvedTabId);
  }

  /**
   * 刷新当前页面。
   * @returns IPC Promise
   */
  function reload(): Promise<unknown> {
    return window.electronAPI!.webview.reload(resolvedTabId);
  }

  /**
   * 停止当前加载。
   * @returns IPC Promise
   */
  function stop(): Promise<unknown> {
    return window.electronAPI!.webview.stop(resolvedTabId);
  }

  /**
   * 更新主进程视图 bounds。
   * @param bounds - 目标位置和尺寸
   * @returns IPC Promise
   */
  function setBounds(bounds: WebViewBounds): Promise<unknown> {
    return window.electronAPI!.webview.setBounds(resolvedTabId, bounds);
  }

  /**
   * 显示主进程视图。
   * @returns IPC Promise
   */
  function show(): Promise<unknown> {
    return window.electronAPI!.webview.show(resolvedTabId);
  }

  /**
   * 隐藏主进程视图。
   * @returns IPC Promise
   */
  function hide(): Promise<unknown> {
    return window.electronAPI!.webview.hide(resolvedTabId);
  }

  unsubState = window.electronAPI!.webview.onStateChanged((id, nextState) => {
    if (id !== resolvedTabId) {
      return;
    }

    state.value = {
      ...state.value,
      isLoading: nextState.isLoading,
      loadProgress: nextState.loadProgress,
      url: nextState.url || state.value.url
    };
  });

  unsubTitle = window.electronAPI!.webview.onTitleUpdated((id, title) => {
    if (id !== resolvedTabId) {
      return;
    }

    state.value.title = title;
  });

  unsubNav = window.electronAPI!.webview.onNavigationStateChanged((id, canGoBack, canGoForward) => {
    if (id !== resolvedTabId) {
      return;
    }

    state.value.canGoBack = canGoBack;
    state.value.canGoForward = canGoForward;
  });

  onUnmounted(() => {
    unsubState?.();
    unsubTitle?.();
    unsubNav?.();
  });

  return {
    state,
    create,
    destroy,
    navigate,
    goBack,
    goForward,
    reload,
    stop,
    setBounds,
    show,
    hide
  };
}
