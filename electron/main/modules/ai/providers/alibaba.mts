/**
 * @file alibaba.mts
 * @description Alibaba Cloud DashScope AI 服务商实现
 */
import type { AIProvider } from '../types.mjs';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { LanguageModel } from 'ai';
import type { AIServiceError, AICreateOptions, AIRequestOptions } from 'types/ai';
import { createAlibaba } from '@ai-sdk/alibaba';
import { AI_ERROR_CODE, createAIServiceError } from '../errors/codes.mjs';
import { mapCommonError } from '../errors/common.mjs';
import { extractErrorDetails } from '../errors/utils.mjs';

/**
 * Alibaba Cloud DashScope 服务商
 * @description 实现通义千问模型的创建、推理开关映射和错误处理
 */
export class AlibabaProvider implements AIProvider {
  /** 服务商类型标识 */
  readonly type = 'alibaba' as const;

  /**
   * 创建 Alibaba 语言模型实例
   * @param options - 创建选项（包含 API Key、Base URL 等）
   * @param modelId - 模型 ID
   * @returns 语言模型实例
   */
  create(options: AICreateOptions, modelId: string): LanguageModel {
    const { apiKey, baseUrl: baseURL } = options;

    const alibaba = createAlibaba({ apiKey, baseURL });
    return alibaba.chatModel(modelId) as LanguageModel;
  }

  /**
   * 创建 Alibaba 专属 providerOptions。
   * @param request - 当前 AI 请求
   * @returns Alibaba providerOptions；未显式设置推理开关时返回 undefined
   */
  createProviderOptions(request: AIRequestOptions): ProviderOptions | undefined {
    if (request.reasoning?.enabled === undefined) {
      return undefined;
    }

    return {
      alibaba: {
        enableThinking: request.reasoning.enabled
      }
    };
  }

  /**
   * 标准化 Alibaba 错误
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
      return createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, '模型不存在或当前阿里云配置无法访问该模型');
    }

    // 处理模型配置无效错误
    if (statusCode === 400 && normalizedMessage.includes('model')) {
      return createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, '模型配置无效，请检查模型 ID 是否正确');
    }

    // 处理请求参数错误
    if (statusCode === 400) {
      return createAIServiceError(AI_ERROR_CODE.INVALID_REQUEST, normalizedMessage || '阿里云请求参数不合法');
    }

    return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, normalizedMessage || fallbackMessage);
  }
}
