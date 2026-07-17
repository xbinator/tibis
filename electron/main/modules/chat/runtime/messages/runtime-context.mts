/**
 * @file runtime-context.mts
 * @description 统一编排仅在模型请求阶段生效的 Runtime 消息上下文投影。
 */
import type { ActiveChatRuntime } from '../types.mjs';
import type { ChatMessageRecord } from 'types/chat';
import { injectSkillContext } from './skill-reference.mjs';

/** Runtime 消息上下文投影函数。 */
type RuntimeContextProjector = (messages: ChatMessageRecord[], runtime: ActiveChatRuntime) => ChatMessageRecord[];

/**
 * Runtime 上下文投影管线。
 * 新增临时上下文能力时只需在此注册，Runtime Service 无需感知具体来源。
 */
const RUNTIME_CONTEXT_PROJECTORS: readonly RuntimeContextProjector[] = [injectSkillContext];

/**
 * 依次应用当前 Runtime 的临时消息上下文。
 * @param messages - 未包含临时上下文的原始消息
 * @param runtime - 当前活动 Runtime
 * @returns 仅供模型投影使用的消息
 */
export function applyRuntimeContext(messages: ChatMessageRecord[], runtime: ActiveChatRuntime): ChatMessageRecord[] {
  return RUNTIME_CONTEXT_PROJECTORS.reduce(
    (projected: ChatMessageRecord[], projector: RuntimeContextProjector): ChatMessageRecord[] => projector(projected, runtime),
    messages
  );
}
