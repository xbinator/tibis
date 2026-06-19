/**
 * @file bridge.mts
 * @description ChatRuntime renderer bridge 请求等待管理。
 */
import type { ActiveChatRuntime, ChatRuntimeEventEmitter } from '../types.mjs';
import type { ChatRuntimeBridgeResponseInput, ChatRuntimeBridgeResult } from 'types/chat-runtime';
import { nanoid } from 'nanoid';
import { ChatRuntimeError } from '../errors.mjs';

/** 活跃 runtime 读取函数。 */
export type RuntimeLookup = (runtimeId: string) => ActiveChatRuntime | undefined;

/** Runtime bridge 请求输入。 */
export interface RuntimeBridgeRequestInput {
  /** Runtime id。 */
  runtimeId: string;
  /** Bridge 请求 id，缺省时自动生成。 */
  requestId?: string;
  /** 关联工具调用 ID。 */
  toolCallId?: string;
  /** Bridge 请求类型。 */
  kind: string;
  /** Bridge 请求载荷。 */
  payload?: unknown;
}

/** Bridge 请求管理器依赖。 */
export interface RuntimeBridgeRequestsDependencies {
  /** 向 renderer 发送 runtime 事件。 */
  emit: ChatRuntimeEventEmitter;
  /** 读取活跃 runtime。 */
  getRuntime: RuntimeLookup;
  /** 请求超时时间。 */
  timeoutMs: number;
}

/** Runtime bridge 请求管理器。 */
export interface RuntimeBridgeRequests {
  /**
   * 请求 renderer 执行通用 bridge 操作并等待结果。
   * @param input - bridge 请求输入
   * @returns renderer bridge 结果
   */
  request(input: RuntimeBridgeRequestInput): Promise<ChatRuntimeBridgeResult>;
  /**
   * 提交 renderer bridge 响应。
   * @param input - bridge 响应输入
   */
  submit(input: ChatRuntimeBridgeResponseInput): void;
  /**
   * 拒绝指定 runtime 所有等待中的 bridge 请求。
   * @param runtimeId - runtime id
   * @param reason - 拒绝原因
   */
  rejectRuntime(runtimeId: string, reason: string): void;
}

/** 等待 renderer 回传的通用 bridge 请求。 */
interface PendingRuntimeBridgeRequest {
  /** 完成 bridge 请求。 */
  resolve: (result: ChatRuntimeBridgeResult) => void;
  /** 拒绝 bridge 请求。 */
  reject: (error: Error) => void;
  /** 请求超时定时器。 */
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * 创建 bridge 请求 key。
 * @param runtimeId - runtime id
 * @param requestId - bridge 请求 id
 * @returns pending key
 */
function createBridgeRequestKey(runtimeId: string, requestId: string): string {
  return `${runtimeId}:${requestId}`;
}

/**
 * 创建 runtime bridge 请求管理器。
 * @param dependencies - 管理器依赖
 * @returns bridge 请求管理器
 */
export function createRuntimeBridgeRequests(dependencies: RuntimeBridgeRequestsDependencies): RuntimeBridgeRequests {
  const pendingBridgeRequests = new Map<string, PendingRuntimeBridgeRequest>();

  return {
    /**
     * 请求 renderer 执行通用 bridge 操作并等待结果。
     * @param input - bridge 请求输入
     * @returns renderer bridge 结果
     */
    request(input: RuntimeBridgeRequestInput): Promise<ChatRuntimeBridgeResult> {
      const runtime = dependencies.getRuntime(input.runtimeId);
      if (!runtime) {
        throw new ChatRuntimeError('RUNTIME_NOT_ACTIVE', `Runtime ${input.runtimeId} is not active`);
      }

      const requestId = input.requestId ?? `bridge-${nanoid()}`;
      const key = createBridgeRequestKey(input.runtimeId, requestId);
      return new Promise<ChatRuntimeBridgeResult>((resolve, reject) => {
        const timeoutId = setTimeout((): void => {
          pendingBridgeRequests.delete(key);
          resolve({
            status: 'failure',
            error: { code: 'TOOL_TIMEOUT', message: 'Renderer bridge request timed out' }
          });
        }, dependencies.timeoutMs);
        pendingBridgeRequests.set(key, { resolve, reject, timeoutId });
        dependencies.emit('chat:runtime:bridge-requested', {
          runtimeId: runtime.runtimeId,
          sessionId: runtime.sessionId,
          clientId: runtime.clientId,
          agentId: runtime.agentId,
          parentRuntimeId: runtime.parentRuntimeId,
          requestId,
          toolCallId: input.toolCallId,
          kind: input.kind,
          payload: input.payload
        });
      });
    },

    /**
     * 提交 renderer bridge 响应。
     * @param input - bridge 响应输入
     */
    submit(input: ChatRuntimeBridgeResponseInput): void {
      const key = createBridgeRequestKey(input.runtimeId, input.requestId);
      const pendingRequest = pendingBridgeRequests.get(key);
      if (!pendingRequest) return;

      pendingBridgeRequests.delete(key);
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.resolve(input.result);
    },

    /**
     * 拒绝指定 runtime 所有等待中的 bridge 请求。
     * @param runtimeId - runtime id
     * @param reason - 拒绝原因
     */
    rejectRuntime(runtimeId: string, reason: string): void {
      for (const [key, request] of pendingBridgeRequests) {
        if (!key.startsWith(`${runtimeId}:`)) continue;

        clearTimeout(request.timeoutId);
        request.reject(new ChatRuntimeError('EDITOR_UNAVAILABLE', reason));
        pendingBridgeRequests.delete(key);
      }
    }
  };
}
