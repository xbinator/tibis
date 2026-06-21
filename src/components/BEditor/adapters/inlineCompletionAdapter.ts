/**
 * @file inlineCompletionAdapter.ts
 * @description BEditor 内联补全 pane 适配器协议与共享类型。
 */
import type { EditorState } from '../types';

/**
 * 内联补全所在编辑器视图。
 */
export type InlineCompletionPane = 'rich' | 'source';

/**
 * 内联补全状态机状态。
 */
export type InlineCompletionStatus = 'idle' | 'triggering' | 'loading' | 'showing' | 'accepting' | 'cancelling' | 'error';

/**
 * 用户与编辑器的交互类型。
 */
export type InlineCompletionUserInteraction = 'input' | 'documentChange' | 'cursor' | 'blur' | 'compositionStart' | 'compositionEnd' | 'accept' | 'escape';

/**
 * 光标位置快照。
 */
export interface InlineCompletionCursorPosition {
  /** 编辑器内绝对位置 */
  absolutePosition: number;
}

/**
 * 一次补全请求的稳定令牌。
 */
export interface InlineCompletionRequestToken {
  /** 请求 ID */
  requestId: string;
  /** 请求发起时的文档版本 */
  docVersion: number;
  /** 请求发起时的光标位置 */
  cursorPosition: InlineCompletionCursorPosition;
}

/**
 * 内联补全用于构建 prompt 的文档上下文。
 */
export interface InlineCompletionDocumentContext {
  /** 与 cursorPosition 使用同一坐标系的文档文本 */
  documentText: string;
  /** documentText 中的光标偏移 */
  cursorPosition: number;
  /** 可选的标题路径；未提供时由 prompt 工具从 prefix 中解析 */
  headingPath?: string[];
}

/**
 * 内联补全触发上下文。
 */
export interface InlineCompletionTriggerContext {
  /** 当前编辑器元数据 */
  editorState: EditorState;
  /** 当前 pane 类型 */
  pane: InlineCompletionPane;
}

/**
 * Pane 级内联补全适配器。
 */
export interface InlineCompletionAdapter {
  /** 当前 pane 类型 */
  readonly pane: InlineCompletionPane;
  /** 当前是否可编辑 */
  isEditable(): boolean;
  /** 当前是否允许触发补全 */
  canTriggerInlineCompletion(): boolean;
  /** 读取当前光标位置 */
  getCursorPosition(): InlineCompletionCursorPosition | null;
  /** 读取当前文档版本 */
  getDocVersion(): number;
  /** 读取当前完整文档文本 */
  getDocumentText(): string;
  /** 读取用于构建 prompt 的文档上下文；未实现时使用 getDocumentText 与请求光标位置 */
  getCompletionContext?(requestToken: InlineCompletionRequestToken): InlineCompletionDocumentContext;
  /** 显示 ghost text */
  showGhost(text: string, requestToken: InlineCompletionRequestToken): void;
  /** 清理 ghost text */
  hideGhost(): void;
  /** 接受当前 ghost text */
  acceptGhostText(text: string): Promise<void>;
  /** 绑定用户交互事件 */
  onUserInteraction(callback: (type: InlineCompletionUserInteraction) => void): () => void;
  /** 销毁资源 */
  destroy(): void;
}
