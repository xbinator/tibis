/**
 * @file volcengine.mts
 * @description Volcengine Ark AI 服务商实现
 */
import type { AIProvider } from '../types.mjs';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { LanguageModel } from 'ai';
import type { AIServiceError, AICreateOptions, AIRequestOptions } from 'types/ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { AI_ERROR_CODE, createAIServiceError } from '../errors/codes.mjs';
import { mapCommonError } from '../errors/common.mjs';
import { extractErrorDetails } from '../errors/utils.mjs';

/** 火山方舟默认 OpenAI 兼容接口地址。 */
const DEFAULT_VOLCENGINE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

/** 通用 reasoning 开关可映射到的火山思考模式。 */
type VolcengineThinkingType = 'enabled' | 'disabled';

/**
 * Volcengine Ark 服务商
 * @description 实现火山方舟模型的创建、思考模式映射和错误处理
 */
export class VolcengineProvider implements AIProvider {
  /** 服务商类型标识 */
  readonly type = 'volcengine' as const;

  /**
   * 创建 Volcengine 语言模型实例。
   * @param options - 创建选项（包含 API Key、Base URL 等）
   * @param modelId - 模型 ID 或 Endpoint ID
   * @returns 语言模型实例
   */
  create(options: AICreateOptions, modelId: string): LanguageModel {
    const { apiKey, baseUrl } = options;
    const volcengine = createOpenAICompatible<string, string, string, string>({
      apiKey,
      baseURL: baseUrl ?? DEFAULT_VOLCENGINE_BASE_URL,
      name: 'volcengine'
    });

    return volcengine.chatModel(modelId) as LanguageModel;
  }

  /**
   * 创建 Volcengine 专属 providerOptions。
   * @param request - 当前 AI 请求
   * @returns Volcengine providerOptions；未显式设置推理开关时返回 undefined
   */
  createProviderOptions(request: AIRequestOptions): ProviderOptions | undefined {
    if (request.reasoning?.enabled === undefined) {
      return undefined;
    }

    const thinkingType: VolcengineThinkingType = request.reasoning.enabled ? 'enabled' : 'disabled';

    return {
      volcengine: {
        thinking: { type: thinkingType }
      }
    };
  }

  /**
   * 标准化 Volcengine 错误。
   * @param error - 原始错误
   * @param fallbackMessage - 默认错误消息
   * @returns 标准化的 AIServiceError
   */
  normalizeError(error: unknown, fallbackMessage = '服务调用失败'): AIServiceError {
    // 先尝试映射通用错误
    const commonError = mapCommonError(error, fallbackMessage);
    if (commonError) {
      return commonError;
    }

    const details = extractErrorDetails(error, fallbackMessage);

    const { statusCode, errorCode, normalizedMessage } = details;

    // 处理模型未找到错误
    if (errorCode === 'model_not_found' || /model not found|no such model|does not exist/i.test(normalizedMessage)) {
      return createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, '模型不存在或当前火山引擎配置无法访问该模型');
    }

    // 处理模型配置无效错误
    if (statusCode === 400 && (normalizedMessage.includes('model') || normalizedMessage.includes('endpoint'))) {
      return createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, '模型配置无效，请检查模型 ID 或 Endpoint ID 是否正确');
    }

    // 处理请求参数错误
    if (statusCode === 400) {
      return createAIServiceError(AI_ERROR_CODE.INVALID_REQUEST, normalizedMessage || '火山引擎请求参数不合法');
    }

    return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, normalizedMessage || fallbackMessage);
  }
}
