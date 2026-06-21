/**
 * @file minimax.mts
 * @description MiniMax AI 服务商实现
 */
import type { AIProvider } from '../types.mjs';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { LanguageModel } from 'ai';
import type { AIServiceError, AICreateOptions, AIRequestOptions } from 'types/ai';
import { createOpenAICompatibleChatModel, normalizeOpenAICompatibleError } from '../helper/openai-compatible.mjs';

/** MiniMax 默认 OpenAI 兼容接口地址。 */
const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';

/** MiniMax 通用 reasoning 开关可映射到的思考模式。 */
type ThinkingType = 'adaptive' | 'disabled';

/**
 * MiniMax 服务商。
 * @description 实现 MiniMax 模型的创建和错误处理
 */
export class MiniMaxProvider implements AIProvider {
  /** 服务商类型标识 */
  readonly type = 'minimax' as const;

  /**
   * 创建 MiniMax 语言模型实例。
   * @param options - 创建选项（包含 API Key、Base URL 等）
   * @param modelId - 模型 ID
   * @returns 语言模型实例
   */
  create(options: AICreateOptions, modelId: string): LanguageModel {
    return createOpenAICompatibleChatModel({
      options,
      modelId,
      providerName: 'minimax',
      defaultBaseUrl: DEFAULT_MINIMAX_BASE_URL
    });
  }

  /**
   * 创建 MiniMax 专属 providerOptions。
   * @param request - 当前 AI 请求
   * @returns 暂无安全映射，始终返回 undefined
   */
  createProviderOptions(request: AIRequestOptions): ProviderOptions | undefined {
    if (request.reasoning?.enabled === undefined) {
      return undefined;
    }

    const thinkingType: ThinkingType = request.reasoning.enabled ? 'adaptive' : 'disabled';

    return {
      volcengine: {
        thinking: { type: thinkingType }
      }
    };
  }

  /**
   * 标准化 MiniMax 错误。
   * @param error - 原始错误
   * @param fallbackMessage - 默认错误消息
   * @returns 标准化的 AIServiceError
   */
  normalizeError(error: unknown, fallbackMessage = '服务调用失败'): AIServiceError {
    return normalizeOpenAICompatibleError(error, 'MiniMax', fallbackMessage);
  }
}
