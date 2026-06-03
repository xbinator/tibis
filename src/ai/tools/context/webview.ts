/**
 * @file webview.ts
 * @description WebView 工具上下文注册表，管理当前激活网页的读取能力。
 */

/**
 * WebView 页面标题节点。
 */
export interface WebviewPageHeading {
  /** 标题层级，1 到 6。 */
  level: number;
  /** 标题文本。 */
  text: string;
}

/**
 * WebView 页面链接。
 */
export interface WebviewPageLink {
  /** 链接文本。 */
  text: string;
  /** 解析后的链接地址。 */
  href: string;
}

/**
 * WebView 页面字段截断标记。
 */
export interface WebviewPageTruncation {
  /** 正文是否被截断。 */
  text: boolean;
  /** 标题列表是否被截断。 */
  headings: boolean;
  /** 链接列表是否被截断。 */
  links: boolean;
  /** 选中文本是否被截断。 */
  selectedText: boolean;
}

/**
 * WebView 页面快照。
 */
export interface WebviewPageSnapshot {
  /** 页面地址。 */
  url: string;
  /** 页面标题。 */
  title: string;
  /** 可见正文。 */
  text: string;
  /** 当前页面选中文本。 */
  selectedText: string;
  /** 页面标题结构。 */
  headings: WebviewPageHeading[];
  /** 页面链接列表。 */
  links: WebviewPageLink[];
  /** 快照采集时间戳。 */
  capturedAt: number;
  /** 各字段截断状态。 */
  truncated: WebviewPageTruncation;
}

/**
 * WebView 工具上下文。
 */
export interface WebviewToolContext {
  /**
   * 读取当前网页快照。
   * @returns 当前网页快照
   */
  readPageSnapshot(): Promise<WebviewPageSnapshot>;
}

/**
 * WebView 工具上下文注册表。
 */
export interface WebviewToolContextRegistry {
  /**
   * 注册 WebView 上下文。
   * @param id - WebView 标签页标识
   * @param context - WebView 工具上下文
   */
  register(id: string, context: WebviewToolContext): void;
  /**
   * 注销 WebView 上下文。
   * @param id - WebView 标签页标识
   */
  unregister(id: string): void;
  /**
   * 标记当前激活 WebView。
   * @param id - WebView 标签页标识
   */
  setCurrent(id: string): void;
  /**
   * 清理当前激活 WebView。
   * @param id - WebView 标签页标识
   */
  clearCurrent(id: string): void;
  /**
   * 获取当前激活 WebView 上下文。
   * @returns 当前上下文或 undefined
   */
  getCurrentContext(): WebviewToolContext | undefined;
}

/**
 * 创建 WebView 工具上下文注册表。
 * @returns WebView 工具上下文注册表
 */
export function createWebviewToolContextRegistry(): WebviewToolContextRegistry {
  /** WebView 标签页 ID 到上下文的映射。 */
  const contexts = new Map<string, WebviewToolContext>();
  /** 当前激活 WebView 标签页 ID。 */
  let currentId: string | null = null;

  return {
    register(id: string, context: WebviewToolContext): void {
      contexts.set(id, context);
    },
    unregister(id: string): void {
      contexts.delete(id);
      if (currentId === id) {
        currentId = null;
      }
    },
    setCurrent(id: string): void {
      if (contexts.has(id)) {
        currentId = id;
      }
    },
    clearCurrent(id: string): void {
      if (currentId === id) {
        currentId = null;
      }
    },
    getCurrentContext(): WebviewToolContext | undefined {
      return currentId ? contexts.get(currentId) : undefined;
    }
  };
}

/** 全局 WebView 工具上下文注册表单例。 */
export const webviewToolContextRegistry = createWebviewToolContextRegistry();
