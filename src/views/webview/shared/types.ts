/**
 * @file types.ts
 * @description WebView 页面共享类型定义。
 */
import type { Ref } from 'vue';

/**
 * WebView 页面状态。
 */
export interface WebviewPageState {
  /** 当前地址 */
  url: string;
  /** 页面标题 */
  title: string;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否正在选择页面 DOM 元素 */
  isElementSelecting: boolean;
  /** 是否可以后退 */
  canGoBack: boolean;
  /** 是否可以前进 */
  canGoForward: boolean;
  /** 近似加载进度 */
  loadProgress: number;
}

/**
 * WebView 元素选择结果。
 */
export interface WebviewElementSelection {
  /** 元素标签名 */
  tagName: string;
  /** 元素 ID */
  id: string;
  /** 元素 className */
  className: string;
  /** 元素可读文本 */
  text: string;
  /** 可复用的 CSS 选择器 */
  selector: string;
  /** 元素视口矩形 */
  rect: {
    /** 横向位置 */
    x: number;
    /** 纵向位置 */
    y: number;
    /** 宽度 */
    width: number;
    /** 高度 */
    height: number;
  };
}

/**
 * 跨实现共享的最小控制接口。
 */
export interface WebviewController {
  /** 响应式页面状态 */
  state: Ref<WebviewPageState>;
  /** 初始化或创建 WebView */
  create(initialUrl: string): Promise<void> | void;
  /** 导航到目标地址 */
  navigate(url: string): Promise<void> | void;
  /** 后退 */
  goBack(): Promise<void> | void;
  /** 前进 */
  goForward(): Promise<void> | void;
  /** 刷新 */
  reload(): Promise<void> | void;
  /** 停止加载 */
  stop(): Promise<void> | void;
}

/**
 * WebView 标题同步参数。
 */
export interface WebviewTabTitleOptions {
  /** 当前页面完整路由 */
  routeFullPath: string;
  /** 当前页面标题 */
  title: Ref<string>;
}
