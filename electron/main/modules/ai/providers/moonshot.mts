/**
 * @file moonshot.mts
 * @description Moonshot/Kimi AI 服务商实现
 */
import type { AIProvider } from '../types.mjs';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { LanguageModel } from 'ai';
import type { AIServiceError, AICreateOptions, AIRequestOptions } from 'types/ai';
import { createOpenAICompatibleChatModel, normalizeOpenAICompatibleError } from '../helper/openai-compatible.mjs';

/** Moonshot/Kimi 默认 OpenAI 兼容接口地址。 */
const DEFAULT_MOONSHOT_BASE_URL = 'https://api.moonshot.cn/v1';

type ThinkingType = 'enabled' | 'disabled';

/**
 * Moonshot/Kimi 服务商。
 * @description 实现 Kimi 模型的创建、思考模式映射和错误处理
 */
export class MoonshotProvider implements AIProvider {
  /** 服务商类型标识 */
  readonly type = 'moonshot' as const;

  /**
   * 创建 Moonshot/Kimi 语言模型实例。
   * @param options - 创建选项（包含 API Key、Base URL 等）
   * @param modelId - 模型 ID
   * @returns 语言模型实例
   */
  create(options: AICreateOptions, modelId: string): LanguageModel {
    return createOpenAICompatibleChatModel({
      options,
      modelId,
      providerName: 'moonshot',
      defaultBaseUrl: DEFAULT_MOONSHOT_BASE_URL
    });
  }

  /**
   * 创建 Moonshot/Kimi 专属 providerOptions。
   * @param request - 当前 AI 请求
   * @returns Moonshot providerOptions；未显式启用推理时返回 undefined
   */
  createProviderOptions(request: AIRequestOptions): ProviderOptions | undefined {
    if (request.reasoning?.enabled === undefined) {
      return undefined;
    }

    const thinkingType: ThinkingType = request.reasoning.enabled ? 'enabled' : 'disabled';

    return {
      moonshot: {
        thinking: { type: thinkingType }
      }
    };
  }

  /**
   * 标准化 Moonshot/Kimi 错误。
   * @param error - 原始错误
   * @param fallbackMessage - 默认错误消息
   * @returns 标准化的 AIServiceError
   */
  normalizeError(error: unknown, fallbackMessage = '服务调用失败'): AIServiceError {
    return normalizeOpenAICompatibleError(error, 'Moonshot/Kimi', fallbackMessage);
  }
}
