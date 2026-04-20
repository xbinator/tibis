/**
 * @file policy.ts
 * @description AI 工具服务商支持策略
 */
import type { AIProvider, AIProviderType } from 'types/ai';

/**
 * AI 工具服务商支持信息
 */
export interface AIToolProviderSupport {
  /** 是否支持工具调用 */
  supported: boolean;
  /** 不支持时的原因 */
  reason?: string;
}

/**
 * 工具服务商策略输入
 */
interface ToolProviderPolicyInput {
  /** 服务商 ID */
  id: string;
  /** 服务商名称 */
  name: string;
  /** 服务商类型 */
  type: AIProviderType;
  /** 是否为自定义服务商 */
  isCustom?: boolean;
}

type ToolProvider = Pick<AIProvider, 'id' | 'name' | 'type' | 'isCustom'> | ToolProviderPolicyInput | null | undefined;

/**
 * 已验证支持工具调用的服务商 ID 集合
 * @description 第一批只放开已经验证过原生 tool calling 行为的 provider
 */
const VALIDATED_TOOL_PROVIDER_IDS = new Set<string>(['openai', 'anthropic', 'google', 'deepseek']);

/**
 * 默认聊天工具名称列表
 */
const DEFAULT_CHAT_TOOL_NAMES = ['read_current_document', 'get_current_selection', 'search_current_document', 'insert_at_cursor'] as const;

/**
 * 获取服务商的工具支持状态
 * @param provider - 服务商信息
 * @returns 工具支持信息
 */
export function getProviderToolSupport(provider: ToolProvider): AIToolProviderSupport {
  if (!provider) {
    return { supported: false, reason: '当前服务商不存在' };
  }

  // 自定义服务商暂不支持工具调用
  if (provider.isCustom) {
    return { supported: false, reason: '自定义服务商的工具调用兼容性尚未验证' };
  }

  // 已验证的服务商支持工具调用
  if (VALIDATED_TOOL_PROVIDER_IDS.has(provider.id)) {
    return { supported: true };
  }

  return {
    supported: false,
    reason: `${provider.name} 暂未纳入 AI Tools 首批验证范围`
  };
}

/**
 * 获取默认聊天工具名称列表
 * @returns 工具名称数组
 */
export function getDefaultChatToolNames(): string[] {
  return [...DEFAULT_CHAT_TOOL_NAMES];
}
