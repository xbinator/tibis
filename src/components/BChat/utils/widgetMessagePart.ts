/**
 * @file widgetMessagePart.ts
 * @description 聊天小组件消息片段创建工具。
 */
import type { ChatMessageWidgetPart, ChatMessageWidgetStatus } from 'types/chat';
import type { WidgetData, WidgetRenderContext } from '@/components/BWidget/types';

/**
 * 创建小组件消息片段参数。
 */
export interface CreateWidgetMessagePartInput {
  /** 小组件会话 ID */
  sessionId: string;
  /** 小组件展示或执行状态 */
  status: ChatMessageWidgetStatus;
  /** 小组件快照数据 */
  dataItem: WidgetData;
  /** 运行态渲染上下文 */
  renderContext: WidgetRenderContext;
}

/**
 * 创建聊天小组件消息片段。
 * @param input - 小组件快照与渲染上下文
 * @returns 聊天小组件消息片段
 */
export function createWidgetMessagePart(input: CreateWidgetMessagePartInput): ChatMessageWidgetPart {
  return {
    type: 'widget',
    sessionId: input.sessionId,
    status: input.status,
    dataItem: input.dataItem,
    renderContext: input.renderContext
  };
}
