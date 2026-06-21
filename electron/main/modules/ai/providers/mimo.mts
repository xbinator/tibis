/**
 * @file mimo.mts
 * @description MiMo / 小米 AI 服务商实现
 */
import type { AIProvider } from '../types.mjs';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { LanguageModel } from 'ai';
import type { AIServiceError, AICreateOptions, AIRequestOptions } from 'types/ai';
import { createOpenAICompatibleChatModel, normalizeOpenAICompatibleError } from '../helper/openai-compatible.mjs';

/** MiMo / 小米默认 OpenAI 兼容接口地址。 */
const DEFAULT_MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';

type ThinkingType = 'enabled' | 'disabled';

/**
 * MiMo / 小米服务商。
 * @description 实现 MiMo 模型的创建和错误处理
 */
export class MiMoProvider implements AIProvider {
  /** 服务商类型标识 */
  readonly type = 'mimo' as const;

  /**
   * 创建 MiMo 语言模型实例。
   * @param options - 创建选项（包含 API Key、Base URL 等）
   * @param modelId - 模型 ID
   * @returns 语言模型实例
   */
  create(options: AICreateOptions, modelId: string): LanguageModel {
    return createOpenAICompatibleChatModel({
      options,
      modelId,
      providerName: 'mimo',
      defaultBaseUrl: DEFAULT_MIMO_BASE_URL
    });
  }

  /**
   * 创建 MiMo 专属 providerOptions。
   * @param request - 当前 AI 请求
   * @returns 暂无安全映射，始终返回 undefined
   */
  createProviderOptions(request: AIRequestOptions): ProviderOptions | undefined {
    if (request.reasoning?.enabled === undefined) {
      return undefined;
    }

    const thinkingType: ThinkingType = request.reasoning.enabled ? 'enabled' : 'disabled';

    return {
      mimo: {
        enableThinking: thinkingType
      }
    };
  }

  /**
   * 标准化 MiMo / 小米错误。
   * @param error - 原始错误
   * @param fallbackMessage - 默认错误消息
   * @returns 标准化的 AIServiceError
   */
  normalizeError(error: unknown, fallbackMessage = '服务调用失败'): AIServiceError {
    return normalizeOpenAICompatibleError(error, 'MiMo / 小米', fallbackMessage);
  }
}
