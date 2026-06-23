/**
 * @file useRuntimeCompactContext.ts
 * @description 基于主进程 ChatRuntime 的上下文压缩 hook。
 */
import type { Message } from '../utils/types';
import type { ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeHandlerResult, ChatRuntimeMessageEvent } from 'types/chat-runtime';
import type { Ref } from 'vue';
import { onScopeDispose, toRaw } from 'vue';
import { nanoid } from 'nanoid';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { createRuntimeRequestError } from '../utils/runtimeError';

/** 压缩触发来源。 */
type CompactTriggerSource = 'manual' | 'auto';

/** 主进程 runtime 压缩 hook 依赖项。 */
interface UseRuntimeCompactContextOptions {
  /** 当前消息列表。 */
  messages: Ref<Message[]>;
  /** 获取活跃会话 ID。 */
  getSessionId: () => string | undefined;
  /** 获取当前模型上下文窗口。 */
  getContextWindow?: () => number | undefined;
  /** 启动压缩任务。 */
  beginCompactTask: (onAbort?: () => void) => { ok: boolean; reason?: 'busy' };
  /** 结束压缩任务。 */
  finishCompactTask: () => void;
  /** 将对话滚动到底部。 */
  scrollToBottom: () => void;
  /** renderer client id。 */
  clientId?: string;
  /** 当前 agent id。 */
  agentId?: string;
}

/**
 * 判断 runtime 事件是否属于当前会话。
 * @param event - runtime 消息事件
 * @param sessionId - 当前 session id
 * @param clientId - 当前 renderer client id
 * @returns 是否属于当前会话
 */
function isCurrentSessionEvent(event: ChatRuntimeMessageEvent, sessionId: string | undefined, clientId: string): boolean {
  return Boolean(sessionId && event.sessionId === sessionId && event.clientId === clientId);
}

/**
 * 判断最新压缩边界之后是否还有新的模型消息。
 * @param sourceMessages - 当前完整消息列表
 * @returns 没有新增 user/assistant 消息时返回 true
 */
function isAlreadyCompactWithoutNewModelMessages(sourceMessages: Message[]): boolean {
  const boundaryIndex = [...sourceMessages]
    .reverse()
    .findIndex((item) => item.role === 'compression' && item.compression?.status === 'success' && Boolean(item.compression.coveredUntilMessageId));
  if (boundaryIndex === -1) return false;

  const actualBoundaryIndex = sourceMessages.length - 1 - boundaryIndex;
  return !sourceMessages.slice(actualBoundaryIndex + 1).some((item) => item.role === 'user' || item.role === 'assistant');
}

/**
 * 将 runtime 消息写入本地消息列表。
 * @param messages - 本地消息列表
 * @param nextMessage - runtime 消息
 */
function applyRuntimeMessage(messages: Message[], nextMessage: Message): void {
  const index = messages.findIndex((item) => item.id === nextMessage.id);
  if (index === -1) {
    messages.push(nextMessage);
    return;
  }

  messages.splice(index, 1, { ...messages[index], ...nextMessage });
}

/**
 * 将值转换为 Electron IPC 可克隆的纯数据。
 * @param value - 待转换值
 * @returns 去除 Vue Proxy 后的 JSON 兼容数据
 */
function toCloneableData<T>(value: T): T {
  if (value === undefined) return value;

  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

/**
 * 将 renderer 消息快照转换为 runtime 可持久化消息。
 * @param messages - renderer 消息列表
 * @param sessionId - 当前 session id
 * @returns runtime 消息记录列表
 */
function toRuntimeMessages(messages: Message[], sessionId: string): ChatMessageRecord[] {
  return messages.map((message) => ({
    ...toCloneableData(message),
    sessionId: (toRaw(message) as ChatMessageRecord).sessionId ?? sessionId
  })) as ChatMessageRecord[];
}

/**
 * 解包 runtime IPC 结果。
 * @param result - runtime handler 结果
 * @returns handler data
 */
function unwrapRuntimeResult<T>(result: ChatRuntimeHandlerResult<T>): T {
  if (!result.ok || result.data === undefined) {
    throw createRuntimeRequestError(result);
  }

  return result.data;
}

/**
 * 主进程 ChatRuntime 上下文压缩 hook。
 * @param options - hook 依赖项
 * @returns 压缩处理函数
 */
export function useRuntimeCompactContext(options: UseRuntimeCompactContextOptions) {
  const { messages, getSessionId, getContextWindow, beginCompactTask, finishCompactTask, scrollToBottom } = options;
  const clientId = options.clientId ?? 'bchat';
  const agentId = options.agentId ?? 'default';
  const electronAPI = getElectronAPI();

  /**
   * 处理 runtime 消息创建/更新事件。
   * @param event - runtime 消息事件
   */
  function handleRuntimeMessageEvent(event: ChatRuntimeMessageEvent): void {
    if (!isCurrentSessionEvent(event, getSessionId(), clientId)) return;

    applyRuntimeMessage(messages.value, event.message as Message);
  }

  const disposeMessageCreated = electronAPI.chatRuntimeOnMessageCreated(handleRuntimeMessageEvent);
  const disposeMessageUpdated = electronAPI.chatRuntimeOnMessageUpdated(handleRuntimeMessageEvent);

  onScopeDispose(() => {
    disposeMessageCreated();
    disposeMessageUpdated();
  });

  /**
   * 执行一次上下文压缩。
   * @param triggerSource - 压缩触发来源
   * @returns 是否成功压缩
   */
  async function runCompactContext(triggerSource: CompactTriggerSource): Promise<boolean> {
    const sessionId = getSessionId();
    if (!sessionId) {
      return false;
    }

    if (!messages.value.length) {
      return false;
    }

    if (isAlreadyCompactWithoutNewModelMessages(messages.value)) {
      return false;
    }

    const runtimeId = `runtime-compact-${nanoid()}`;
    const task = beginCompactTask(() => {
      electronAPI.chatRuntimeAbort({ runtimeId }).catch(() => undefined);
    });
    if (!task.ok) {
      return false;
    }

    try {
      const result = unwrapRuntimeResult(
        await electronAPI.chatRuntimeCompact({
          runtimeId,
          sessionId,
          clientId,
          agentId,
          reason: triggerSource,
          contextWindow: getContextWindow?.(),
          messages: toRuntimeMessages(messages.value, sessionId)
        })
      );
      const success = result.status === 'success';
      if (success && triggerSource === 'manual') {
        scrollToBottom();
      }
      return success;
    } catch {
      return false;
    } finally {
      finishCompactTask();
    }
  }

  /**
   * 处理 slash command 触发的手动上下文压缩。
   */
  async function handleCompactContext(): Promise<void> {
    await runCompactContext('manual');
  }

  /**
   * 处理发送前触发的自动上下文压缩。
   * @returns 是否成功完成自动压缩
   */
  async function handleAutoCompactContext(): Promise<boolean> {
    return runCompactContext('auto');
  }

  return {
    handleAutoCompactContext,
    handleCompactContext
  };
}
