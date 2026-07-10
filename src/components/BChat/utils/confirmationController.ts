/* eslint-disable no-use-before-define */
/**
 * @file confirmationController.ts
 * @description 聊天侧边栏会话级确认控制器，通过底部弹出卡片处理用户确认。
 */
import { ref, type Ref } from 'vue';
import { nanoid } from 'nanoid';
import {
  normalizeToolConfirmationRequest,
  type AIToolConfirmationAdapter,
  type AIToolConfirmationDecision,
  type AIToolConfirmationRequest
} from '@/ai/tools/confirmation';

/**
 * 挂起中的确认项。
 */
interface PendingConfirmation {
  /** 确认项 ID */
  id: string;
  /** 原始请求 */
  request: AIToolConfirmationRequest;
  /** Promise 完成回调 */
  resolve: (decision: AIToolConfirmationDecision) => void;
}

/**
 * 创建会话级确认控制器。
 * @returns 确认控制器
 */
export function createChatConfirmationController() {
  let pendingConfirmation: PendingConfirmation | null = null;
  const queuedConfirmations: PendingConfirmation[] = [];

  /** 当前等待确认的请求，供 UI 消费渲染底部弹出卡片 */
  const currentConfirmationRequest: Ref<AIToolConfirmationRequest | null> = ref(null);

  /** 当前等待确认的确认项 ID */
  const currentConfirmationId: Ref<string | null> = ref(null);

  /**
   * 展示当前确认项。
   * @param confirmation - 待展示确认项
   */
  function activateConfirmation(confirmation: PendingConfirmation): void {
    pendingConfirmation = confirmation;
    currentConfirmationRequest.value = confirmation.request;
    currentConfirmationId.value = confirmation.id;
  }

  /**
   * 展示下一项排队确认。
   */
  function activateNextConfirmation(): void {
    const nextConfirmation = queuedConfirmations.shift();
    if (!nextConfirmation) {
      pendingConfirmation = null;
      currentConfirmationRequest.value = null;
      currentConfirmationId.value = null;
      return;
    }

    activateConfirmation(nextConfirmation);
  }

  /**
   * 结束当前挂起确认项。
   * @param decision - Promise 返回值
   */
  function settlePendingConfirmation(decision: AIToolConfirmationDecision): void {
    if (!pendingConfirmation) {
      return;
    }

    const current = pendingConfirmation;
    activateNextConfirmation();
    current.resolve(decision);
  }

  /**
   * 请求用户确认。
   * @param request - 确认请求
   * @returns 用户是否确认
   */
  async function requestConfirmation(request: AIToolConfirmationRequest): Promise<AIToolConfirmationDecision> {
    const confirmationId = nanoid();
    const normalizedRequest = normalizeToolConfirmationRequest(request);

    return new Promise<AIToolConfirmationDecision>((resolve) => {
      const confirmation: PendingConfirmation = { id: confirmationId, request: normalizedRequest, resolve };
      if (!pendingConfirmation) {
        activateConfirmation(confirmation);
        return;
      }

      queuedConfirmations.push(confirmation);
    });
  }

  /**
   * 同意当前确认项。
   * @param confirmationId - 确认项 ID
   * @param grantScope - 可选授权范围
   */
  function approveConfirmation(confirmationId: string, grantScope?: 'session' | 'always'): void {
    if (!pendingConfirmation || pendingConfirmation.id !== confirmationId) {
      return;
    }

    settlePendingConfirmation(grantScope ? { approved: true, grantScope } : { approved: true });
  }

  /**
   * 取消当前确认项。
   * @param confirmationId - 确认项 ID
   */
  function cancelConfirmation(confirmationId: string): void {
    if (!pendingConfirmation || pendingConfirmation.id !== confirmationId) {
      return;
    }

    settlePendingConfirmation({ approved: false });
  }

  /**
   * 让当前挂起确认项过期。
   */
  function expirePendingConfirmation(): void {
    if (pendingConfirmation) {
      const current = pendingConfirmation;
      pendingConfirmation = null;
      currentConfirmationRequest.value = null;
      currentConfirmationId.value = null;
      current.resolve({ approved: false });
    }

    while (queuedConfirmations.length > 0) {
      const queuedConfirmation = queuedConfirmations.shift();
      queuedConfirmation?.resolve({ approved: false });
    }
  }

  /**
   * 释放当前控制器持有的挂起确认。
   */
  function dispose(): void {
    expirePendingConfirmation();
  }

  /**
   * 创建适配写工具的确认适配器。
   * @returns 工具确认适配器
   */
  function createAdapter(): AIToolConfirmationAdapter {
    return {
      confirm: requestConfirmation,
      onExecutionStart: () => {
        // 底部弹窗模式下无需在消息中标记执行状态
      },
      onExecutionComplete: () => {
        // 底部弹窗模式下无需在消息中标记执行状态
      }
    };
  }

  return {
    currentConfirmationRequest,
    currentConfirmationId,
    requestConfirmation,
    approveConfirmation,
    cancelConfirmation,
    expirePendingConfirmation,
    dispose,
    createAdapter
  };
}
