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
  /** 简化 DOM 内容是否被截断。 */
  content: boolean;
  /** 标题列表是否被截断。 */
  headings: boolean;
  /** 链接列表是否被截断。 */
  links: boolean;
  /** 选中文本是否被截断。 */
  selectedText: boolean;
}

/**
 * WebView 页面滚动状态。
 */
export interface WebviewPageScrollState {
  /** 横向滚动位置。 */
  x: number;
  /** 纵向滚动位置。 */
  y: number;
  /** 视口宽度。 */
  viewportWidth: number;
  /** 视口高度。 */
  viewportHeight: number;
  /** 页面可滚动宽度。 */
  scrollWidth: number;
  /** 页面可滚动高度。 */
  scrollHeight: number;
  /** 是否处于顶部。 */
  atTop: boolean;
  /** 是否处于底部。 */
  atBottom: boolean;
}

/**
 * WebView Agent 元素动作。
 */
export type WebviewAgentElementAction = 'click' | 'input' | 'select' | 'press' | 'scroll';

/**
 * WebView 可模拟的按键。
 */
export type WebviewPressKey = 'Enter' | 'Tab' | 'Escape' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * WebView Agent 可交互元素。
 */
export interface WebviewAgentElement {
  /** 本次快照内元素索引。 */
  index: number;
  /** 元素标签名。 */
  tagName: string;
  /** ARIA role。 */
  role?: string;
  /** 元素可读文本。 */
  text: string;
  /** 模型可读标签。 */
  label: string;
  /** 元素身份指纹，用于操作前识别过期快照。 */
  fingerprint?: string;
  /** 输入占位符。 */
  placeholder?: string;
  /** 链接地址。 */
  href?: string;
  /** 非敏感值预览。 */
  valuePreview?: string;
  /** 是否禁用。 */
  disabled: boolean;
  /** 是否选中。 */
  checked?: boolean;
  /** 是否被选择。 */
  selected?: boolean;
  /** 是否为本轮新出现元素。 */
  isNew: boolean;
  /** 支持的动作列表。 */
  actions: WebviewAgentElementAction[];
}

/**
 * WebView 页面快照。
 */
export interface WebviewPageSnapshot {
  /** 页面地址。 */
  url: string;
  /** 页面标题。 */
  title: string;
  /** 页面视口与滚动位置提示。 */
  header: string;
  /** LLM 可读的简化 DOM 结构。 */
  content: string;
  /** 页面底部与剩余滚动提示。 */
  footer: string;
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
  /** 页面 Agent 观察快照 ID。 */
  snapshotId?: string;
  /** 页面是否正在加载。 */
  loading?: boolean;
  /** 页面滚动信息。 */
  scroll?: WebviewPageScrollState;
  /** 当前可交互元素列表。 */
  elements?: WebviewAgentElement[];
}

/**
 * WebView 操作动作。
 */
export type WebviewOperateAction =
  | { type: 'click'; index: number }
  | { type: 'input'; index: number; text: string; clear?: boolean }
  | { type: 'select'; index: number; optionText: string }
  | { type: 'press'; index: number; key: WebviewPressKey }
  | { type: 'scroll'; index?: number; direction: 'up' | 'down' | 'left' | 'right'; pixels?: number }
  | { type: 'navigate'; url: string }
  | { type: 'wait'; seconds?: number };

/**
 * WebView 操作输入。
 */
export interface WebviewOperateInput {
  /** read_current_webpage 返回的观察快照 ID，非 navigate 动作必填。 */
  snapshotId?: string;
  /** 要执行的操作。 */
  action: WebviewOperateAction;
}

/**
 * WebView 滚动位置。
 */
export interface WebviewOperateScrollPosition {
  /** 水平滚动偏移。 */
  x: number;
  /** 垂直滚动偏移。 */
  y: number;
}

/**
 * WebView 滚动操作结果。
 */
export interface WebviewOperateScrollResult {
  /** 实际滚动目标类型。 */
  targetType: 'window' | 'element';
  /** 滚动前位置。 */
  before: WebviewOperateScrollPosition;
  /** 滚动后位置。 */
  after: WebviewOperateScrollPosition;
  /** 位置是否发生变化。 */
  changed: boolean;
}

/**
 * WebView 操作结果。
 */
export interface WebviewOperateResult {
  /** 操作是否完成。 */
  ok: boolean;
  /** 实际执行的动作类型。 */
  action: WebviewOperateAction['type'];
  /** 被操作目标摘要。 */
  target: { index: number; label: string; tagName: string } | null;
  /** 给模型看的结果说明。 */
  message: string;
  /** 滚动动作的实际滚动结果。 */
  scroll?: WebviewOperateScrollResult;
  /** 操作是否触发导航。 */
  navigationStarted: boolean;
  /** 页面是否可能发生变化。 */
  pageChanged: boolean;
  /** 是否建议重新读取网页。 */
  shouldReadAgain: boolean;
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
  /**
   * 操作当前网页。
   * @param input - 网页操作输入
   * @returns 网页操作结果
   */
  operatePage(input: WebviewOperateInput): Promise<WebviewOperateResult>;
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
