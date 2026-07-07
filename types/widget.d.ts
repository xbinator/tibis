/**
 * @file widget.d.ts
 * @description 小组件跨层协议类型定义。
 */
import type { RequestInput, RequestResponse } from './request';
import type { WidgetData, WidgetSchemaObject } from '@/components/BWidget/types';

export type { WidgetData, WidgetSchemaObject };

/**
 * Widget onExecute 成功状态。
 */
export interface WidgetExecutionSuccess {
  /** 执行状态 */
  status: 'success';
  /** onExecute 返回值；缺省或不存在时为 undefined */
  output?: unknown;
}

/**
 * Widget onExecute 失败状态。
 */
export interface WidgetExecutionFailure {
  /** 执行状态 */
  status: 'failure';
  /** 失败详情 */
  error: {
    /** 机器可读错误码 */
    code: 'EXECUTION_FAILED';
    /** 给模型展示的错误说明 */
    message: string;
  };
}

/**
 * Widget onExecute 执行结果。
 */
export type WidgetExecutionResult = WidgetExecutionSuccess | WidgetExecutionFailure;

/**
 * Widget Skill 渲染上下文。
 */
export interface WidgetRenderContext {
  /** Widget启动入参 */
  readonly input: Record<string, unknown>;
  /** onExecute 成功返回值；未返回或失败时为 undefined */
  readonly output?: unknown;
  /** Widget会话数据 */
  data: Record<string, unknown>;
  /** onMounted 生命周期是否已经执行过 */
  isMounted?: boolean;
}

/**
 * 模型可读取的小组件契约。
 */
export interface WidgetContract {
  /** 小组件稳定 ID */
  id: string;
  /** 小组件名称 */
  name: string;
  /** 小组件用途说明 */
  description: string;
  /** 小组件入参 schema */
  inputSchema: WidgetSchemaObject;
  /** 小组件数据 schema */
  dataSchema: WidgetSchemaObject;
}

/**
 * open_widget 工具返回给聊天渲染层的小组件展示载荷。
 */
export interface WidgetDisplayPayload {
  /** 小组件会话 ID */
  sessionId: string;
  /** 小组件稳定 ID */
  widgetId: string;
  /** 小组件快照值 */
  value: WidgetData;
  /** 运行态渲染上下文 */
  renderContext: WidgetRenderContext;
  /** onExecute 执行结果 */
  execution: WidgetExecutionResult;
}

/**
 * 小组件脚本上行文本片段，不携带聊天消息 part ID。
 */
export interface WidgetSendMessageTextPart {
  /** 片段类型 */
  type: 'text';
  /** 文本内容 */
  text: string;
}

/**
 * 小组件运行态上行消息。
 */
export interface WidgetRuntimeSendMessage {
  /** 上行消息内容，支持纯文本或文本片段数组 */
  content: string | WidgetSendMessageTextPart[];
  /** 是否为错误消息 */
  isError: boolean;
}

/**
 * 小组件托管 HTTP 客户端。
 */
export interface WidgetHttpClient {
  /** 发送 GET 请求 */
  get(url: string, request?: Omit<RequestInput, 'method' | 'url' | 'body'>): Promise<RequestResponse>;
  /** 发送 POST 请求 */
  post(url: string, request?: Omit<RequestInput, 'method' | 'url'>): Promise<RequestResponse>;
  /** 发送 PUT 请求 */
  put(url: string, request?: Omit<RequestInput, 'method' | 'url'>): Promise<RequestResponse>;
  /** 发送 PATCH 请求 */
  patch(url: string, request?: Omit<RequestInput, 'method' | 'url'>): Promise<RequestResponse>;
  /** 发送 DELETE 请求 */
  delete(url: string, request?: Omit<RequestInput, 'method' | 'url'>): Promise<RequestResponse>;
}

/**
 * 小组件运行态成功提交结果。
 */
export interface WidgetSubmitSuccessResult {
  /** 提交状态 */
  status: 'success';
  /** 成功提交的数据，字段值统一使用字符串 */
  data: Record<string, string>;
  /** 成功结果不携带错误 */
  error?: never;
}

/**
 * 小组件运行态失败提交结果。
 */
export interface WidgetSubmitFailureResult {
  /** 提交状态 */
  status: 'failure';
  /** 失败详情 */
  error: {
    /** 机器可读错误码 */
    code: string;
    /** 给用户或模型展示的错误说明 */
    message: string;
  };
  /** 失败结果不携带数据 */
  data?: never;
}

/**
 * 小组件运行态提交结果。
 */
export type WidgetSubmitResult = WidgetSubmitSuccessResult | WidgetSubmitFailureResult;

/**
 * 小组件运行态提交载荷。
 */
export interface WidgetSubmitPayload {
  /** 小组件会话 ID */
  sessionId: string;
  /** 小组件稳定 ID */
  widgetId: string;
  /** 用户在 Widget 中提交的结果 */
  result: WidgetSubmitResult;
}
