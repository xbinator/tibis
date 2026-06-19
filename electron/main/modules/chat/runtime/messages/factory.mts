/**
 * @file factory.mts
 * @description ChatRuntime 消息创建工厂。
 */
import type { ActiveChatRuntime } from '../types.mjs';
import type { ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeSendInput } from 'types/chat-runtime';

/**
 * 创建 runtime user 消息。
 * @param input - 发送参数
 * @param runtime - runtime 状态
 * @param id - 消息 ID
 * @param createdAt - 创建时间
 * @returns user 消息
 */
export function createRuntimeUserMessage(input: ChatRuntimeSendInput, runtime: ActiveChatRuntime, id: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: runtime.sessionId,
    role: 'user',
    content: input.content,
    parts: input.content ? [{ type: 'text', text: input.content }] : [],
    files: input.files,
    createdAt,
    finished: true,
    loading: false,
    agentId: runtime.agentId,
    runtimeId: runtime.runtimeId,
    parentRuntimeId: runtime.parentRuntimeId
  };
}

/**
 * 创建 runtime assistant 占位消息。
 * @param runtime - runtime 状态
 * @param id - 消息 ID
 * @param createdAt - 创建时间
 * @returns assistant 占位消息
 */
export function createRuntimeAssistantPlaceholder(runtime: ActiveChatRuntime, id: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: runtime.sessionId,
    role: 'assistant',
    content: '',
    parts: [],
    createdAt,
    loading: true,
    finished: false,
    agentId: runtime.agentId,
    runtimeId: runtime.runtimeId,
    parentRuntimeId: runtime.parentRuntimeId
  };
}

/**
 * 创建 runtime 中断状态消息。
 * @param runtime - runtime 状态
 * @param id - 消息 ID
 * @param createdAt - 创建时间
 * @returns 中断消息
 */
export function createRuntimeInterruptMessage(runtime: ActiveChatRuntime, id: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: runtime.sessionId,
    role: 'interrupt',
    content: '已中断',
    parts: [],
    createdAt,
    loading: false,
    finished: true,
    agentId: runtime.agentId,
    runtimeId: runtime.runtimeId,
    parentRuntimeId: runtime.parentRuntimeId
  };
}
