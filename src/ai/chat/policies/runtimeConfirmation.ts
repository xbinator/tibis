/**
 * @file runtimeConfirmation.ts
 * @description ChatRuntime 工具确认授权的读取与记忆策略。
 */
import type { AIToolGrantScope } from 'types/ai';
import type { ChatRuntimeConfirmationDecision, ChatRuntimeConfirmationRequest } from 'types/chat-runtime';
import { normalizeToolConfirmationRequest } from '@/ai/tools/confirmation';

/** 工具授权快照。 */
export interface RuntimeToolPermissionGrants {
  /** 当前 renderer 生命周期授权。 */
  session: Readonly<Record<string, true>>;
  /** 持久化授权。 */
  always: Readonly<Record<string, true>>;
}

/**
 * 读取可自动批准的确认决策。
 * @param request - Runtime 确认请求
 * @param grants - 当前工具授权
 * @returns 自动批准决策，无授权时返回 null
 */
export function getRememberedRuntimeConfirmationDecision(
  request: ChatRuntimeConfirmationRequest,
  grants: RuntimeToolPermissionGrants
): ChatRuntimeConfirmationDecision | null {
  const normalized = normalizeToolConfirmationRequest(request);
  if (normalized.allowRemember !== true) return null;
  return grants.always[normalized.toolName] || grants.session[normalized.toolName] ? { approved: true } : null;
}

/**
 * 读取确认决策中允许记忆的授权范围。
 * @param request - Runtime 确认请求
 * @param decision - 用户决策
 * @returns 可写入的授权范围
 */
export function getRuntimeConfirmationGrantScope(
  request: ChatRuntimeConfirmationRequest,
  decision: ChatRuntimeConfirmationDecision
): AIToolGrantScope | undefined {
  if (!decision.approved || !decision.grantScope) return undefined;
  const normalized = normalizeToolConfirmationRequest(request);
  if (normalized.allowRemember !== true || normalized.rememberScopes?.includes(decision.grantScope) !== true) return undefined;
  return decision.grantScope;
}
